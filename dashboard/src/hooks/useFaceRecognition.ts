import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureScriptsLoaded,
  loadFaceModels,
  getDescriptorFromUrl,
  verifyFaceIdentity,
  detectFaceWithDetailsDownscaled,
  loadMediaPipeLandmarker,
  calculateMediaPipeEAR,
  getFaceAiGlobals,
  type FaceRecognitionData
} from '../lib/faceAi';
import { getCachedDescriptor, setCachedDescriptor } from '../lib/descriptorCache';

export type ScanPhase =
  | 'idle'
  | 'initializing'
  | 'scanning'
  | 'matched'
  | 'failed';

export interface BiometricDebugInfo {
  referenceLoaded: boolean | null;
  eyesOpen: boolean;
  eyesClosed: boolean;
  blinkCompleted: boolean;
  headTilted: boolean;
  currentEAR: number;
  headTiltAngle: number;
  lastDistance: number | null;
}

interface UseFaceRecognitionOptions {
  /** Optional Rider ID for persistent descriptor caching */
  riderId?: string;
  /** Total duration of a scan, in ms. */
  durationMs?: number;
  /** Probability the simulated scan succeeds (0–1). Default 1 (always matches). */
  successRate?: number;
  /** Enrolled reference face image URL (Base64 or standard HTTP URL) */
  referenceAvatar?: string | null;
  /** Enrolled reference face descriptor array (128-dimensional) */
  referenceDescriptor?: number[] | null;
  /** Callback fired when a fallback reference image finishes compiling its descriptor */
  onDescriptorCalculated?: (descriptor: number[]) => void;
}

interface ScanResult {
  matched: boolean;
  confidence: number;
  capturedAt: number;
  snapshotUrl?: string; // Captured enrollment photo snapshot
  descriptor?: number[]; // Serializable 128-dimensional face descriptor
}

export function useFaceRecognition({
  riderId,
  durationMs = 3000,
  successRate = 1.0,
  referenceAvatar = null,
  referenceDescriptor = null,
  onDescriptorCalculated
}: UseFaceRecognitionOptions = {}) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState(0); // 0–1
  const [result, setResult] = useState<ScanResult | null>(null);
  const [livenessPrompt, setLivenessPrompt] = useState<string>('Look straight into the camera.');
  const [debugInfo, setDebugInfo] = useState<BiometricDebugInfo>({
    referenceLoaded: null,
    eyesOpen: false,
    eyesClosed: false,
    blinkCompleted: false,
    headTilted: false,
    currentEAR: 0,
    headTiltAngle: 0,
    lastDistance: null
  });

  const eyesOpenDetectedRef = useRef(false);
  const eyesClosedDetectedRef = useRef(false);
  const blinkCompletedRef = useRef(false);
  const headTiltedDetectedRef = useRef(false);
  const faceMatchedRef = useRef(false);
  const matchCountRef = useRef(0);
  const maxEarRef = useRef<number>(0);

  // Liveness Frame Stability Counters (requires ~800ms stable alignment before blink prompt)
  const alignmentFramesRef = useRef<number>(0);
  const closedFramesRef = useRef<number>(0);
  const reopenFramesRef = useRef<number>(0);

  // Performance Optimization Refs
  const lastInferenceTimeRef = useRef<number>(0);
  const lastDescriptorMatchTimeRef = useRef<number>(0);
  const cachedFaceDataRef = useRef<FaceRecognitionData | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scanLoopRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const isScanningActiveRef = useRef(false);

  const clearTimers = useCallback(() => {
    isScanningActiveRef.current = false;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (scanLoopRef.current) {
      window.cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setProgress(0);
    setResult(null);
    setLivenessPrompt('Center your face & look straight 😐');
    eyesOpenDetectedRef.current = false;
    eyesClosedDetectedRef.current = false;
    blinkCompletedRef.current = false;
    headTiltedDetectedRef.current = false;
    faceMatchedRef.current = false;
    matchCountRef.current = 0;
    maxEarRef.current = 0;
    alignmentFramesRef.current = 0;
    closedFramesRef.current = 0;
    reopenFramesRef.current = 0;
    lastInferenceTimeRef.current = 0;
    lastDescriptorMatchTimeRef.current = 0;
    cachedFaceDataRef.current = null;
    setDebugInfo({
      referenceLoaded: null,
      eyesOpen: false,
      eyesClosed: false,
      blinkCompleted: false,
      headTilted: false,
      currentEAR: 0,
      headTiltAngle: 0,
      lastDistance: null
    });

    // Clear overlay canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [clearTimers]);

  /**
   * Safe Fallback Scan Loop (Simulated animations when scripts/cameras are unavailable)
   */
  const startSimulatedScanning = useCallback(() => {
    setPhase('scanning');

    const steps = 30;
    const tick = durationMs / steps;

    for (let i = 1; i <= steps; i++) {
      timers.current.push(
        window.setTimeout(() => setProgress(i / steps), 100 + i * tick)
      );
    }

    timers.current.push(
      window.setTimeout(
        () => {
          const ok = Math.random() <= successRate;
          setPhase(ok ? 'matched' : 'failed');
          setResult({
            matched: ok,
            confidence: ok ? 0.94 + Math.random() * 0.05 : 0.35 + Math.random() * 0.15,
            capturedAt: Date.now()
          });
        },
        150 + durationMs
      )
    );
  }, [durationMs, successRate]);

  /**
   * Real Facial Detection, Liveness Verification and Embedding Matching Loop
   */
  const startRealScanning = useCallback(async () => {
    setPhase('scanning');
    isScanningActiveRef.current = true;

    const isVerificationMode = !!referenceAvatar;
    const isCartoonPlaceholder = !!referenceAvatar && (
      referenceAvatar.includes('api.dicebear.com') ||
      referenceAvatar.includes('dicebear') ||
      referenceAvatar.includes('/svg?') ||
      referenceAvatar.endsWith('.svg')
    );

    console.log('[Face AI] Starting real scan. Reference avatar:', referenceAvatar ? referenceAvatar.slice(0, 100) + '...' : 'none');

    let referenceDesc: Float32Array | null = null;
    let refLoaded = false;

    if (isVerificationMode) {
      if (referenceDescriptor && referenceDescriptor.length === 128) {
        referenceDesc = new Float32Array(referenceDescriptor);
        refLoaded = true;
        console.log('[Face AI] Reference descriptor loaded directly from DB/props.');
        if (riderId || referenceAvatar) {
          setCachedDescriptor(riderId || referenceAvatar || '', referenceDescriptor, referenceAvatar);
        }
      } else {
        // Priority 5: Persistent LocalStorage / IndexedDB Descriptor Cache
        const targetId = riderId || referenceAvatar || '';
        const cachedArr = getCachedDescriptor(targetId, referenceAvatar);
        if (cachedArr && cachedArr.length === 128) {
          referenceDesc = new Float32Array(cachedArr);
          refLoaded = true;
          console.log('[Face AI] Reference descriptor loaded from local persistent cache for rider:', targetId);
        } else if (!isCartoonPlaceholder && referenceAvatar && navigator.onLine) {
          referenceDesc = await getDescriptorFromUrl(referenceAvatar);
          if (referenceDesc) {
            refLoaded = true;
            console.log('[Face AI] Reference descriptor compiled from URL.');
            setCachedDescriptor(targetId, Array.from(referenceDesc), referenceAvatar);
            onDescriptorCalculated?.(Array.from(referenceDesc));
          }
        }
      }

      setDebugInfo(prev => ({
        ...prev,
        referenceLoaded: refLoaded
      }));
    }

    const landmarker = await loadMediaPipeLandmarker();
    console.log('[Face AI] MediaPipe Face Landmarker loaded:', landmarker ? 'Success' : 'Failed');

    const scanDuration = isVerificationMode ? 30000 : durationMs;
    const startTime = Date.now();

    // Priority 1: Throttle AI inferences to ~9 FPS (110ms interval) to keep UI smooth at 60 FPS
    const INFERENCE_INTERVAL_MS = 110;

    const tick = async () => {
      if (!isScanningActiveRef.current) return;

      const now = performance.now();
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(1.0, elapsed / scanDuration);
      setProgress(currentProgress);

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= 2) {
        // Sync overlay canvas resolution
        if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const shouldRunInference = (now - lastInferenceTimeRef.current) >= INFERENCE_INTERVAL_MS;

        let mpEAR = debugInfo.currentEAR || 0.0;
        const mpRoll = 0.0;
        let livenessPassed = blinkCompletedRef.current;

        if (shouldRunInference) {
          lastInferenceTimeRef.current = now;

          // 1. MediaPipe Landmarker Liveness Check (Blink)
          if (landmarker) {
            try {
              const detections = landmarker.detectForVideo(video, Date.now());
              if (detections && detections.faceLandmarks && detections.faceLandmarks.length > 0) {
                const landmarks = detections.faceLandmarks[0];
                mpEAR = calculateMediaPipeEAR(landmarks);

                if (isVerificationMode) {
                  // Challenge Sequence with Frame-Stability Verification:
                  // Stage A: Require ~800ms (8 consecutive frames) of stable alignment with open eyes
                  if (!eyesOpenDetectedRef.current) {
                    if (mpEAR > 0.20) {
                      alignmentFramesRef.current += 1;
                      if (alignmentFramesRef.current >= 8) {
                        eyesOpenDetectedRef.current = true;
                      }
                    } else {
                      alignmentFramesRef.current = 0;
                    }
                  }
                  // Stage B: Require at least 2 consecutive frames of closed eyes (mpEAR < 0.19)
                  else if (!eyesClosedDetectedRef.current) {
                    if (mpEAR < 0.19) {
                      closedFramesRef.current += 1;
                      if (closedFramesRef.current >= 2) {
                        eyesClosedDetectedRef.current = true;
                      }
                    } else {
                      closedFramesRef.current = 0;
                    }
                  }
                  // Stage C: Require at least 2 consecutive frames of reopened eyes (mpEAR > 0.20)
                  else if (!blinkCompletedRef.current) {
                    if (mpEAR > 0.20) {
                      reopenFramesRef.current += 1;
                      if (reopenFramesRef.current >= 2) {
                        blinkCompletedRef.current = true;
                      }
                    } else {
                      reopenFramesRef.current = 0;
                    }
                  }

                  livenessPassed = blinkCompletedRef.current;
                } else {
                  livenessPassed = mpEAR > 0.20;
                }
              }
            } catch (err) {
              console.warn('[Face AI] MediaPipe detection exception:', err);
            }
          }

          // Priority 3: Execute heavy face-api descriptor extraction ONLY after liveness blink is complete (or enrollment mode)
          // and no more than once per 1000ms
          const canRunDescriptorMatching = !isVerificationMode || (livenessPassed && (now - lastDescriptorMatchTimeRef.current >= 1000));

          if (canRunDescriptorMatching) {
            lastDescriptorMatchTimeRef.current = now;
            // Priority 4: Call downscaled 320x320 offscreen canvas detector for ultra-fast inference
            cachedFaceDataRef.current = await detectFaceWithDetailsDownscaled(video);
          }
        }

        // Update status prompts
        if (isVerificationMode) {
          if (!eyesOpenDetectedRef.current) {
            setLivenessPrompt('Center your face & look straight 😐');
          } else if (!eyesClosedDetectedRef.current) {
            setLivenessPrompt('Close your eyes for a brief moment 😴');
          } else if (!blinkCompletedRef.current) {
            setLivenessPrompt('Blink detected! Open your eyes 😊');
          } else {
            setLivenessPrompt('Liveness verified! Verifying identity... 🔍');
          }
        } else {
          setLivenessPrompt(livenessPassed ? 'Face aligned! Capturing...' : 'Look straight and center your face.');
        }

        const faceData = cachedFaceDataRef.current;

        // Draw bounding box overlay graphics
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (faceData) {
              const r = faceData.box;

              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = 'rgba(219, 108, 0, 0.4)';
              ctx.strokeRect(r.x, r.y, r.width, r.height);
              ctx.setLineDash([]);

              ctx.strokeStyle = '#db6c00';
              ctx.lineWidth = 4;
              const len = Math.min(24, r.width * 0.15);

              // Top-left
              ctx.beginPath();
              ctx.moveTo(r.x, r.y + len);
              ctx.lineTo(r.x, r.y);
              ctx.lineTo(r.x + len, r.y);
              ctx.stroke();

              // Top-right
              ctx.beginPath();
              ctx.moveTo(r.x + r.width - len, r.y);
              ctx.lineTo(r.x + r.width, r.y);
              ctx.lineTo(r.x + r.width, r.y + len);
              ctx.stroke();

              // Bottom-left
              ctx.beginPath();
              ctx.moveTo(r.x, r.y + r.height - len);
              ctx.lineTo(r.x, r.y + r.height);
              ctx.lineTo(r.x + len, r.y + r.height);
              ctx.stroke();

              // Bottom-right
              ctx.beginPath();
              ctx.moveTo(r.x + r.width - len, r.y + r.height);
              ctx.lineTo(r.x + r.width, r.y + r.height);
              ctx.lineTo(r.x + r.width, r.y + r.height - len);
              ctx.stroke();
            }
          }
        }

        // Process matching if faceData is available
        if (faceData) {
          if (isVerificationMode) {
            let currentDistance: number | null = null;

            const isValidDesc = referenceDesc && referenceDesc.length === 128 && !referenceDesc.some(val => isNaN(val));
            const isFaceDataValid = faceData && faceData.descriptor && faceData.descriptor.length === 128 && !faceData.descriptor.some(val => isNaN(val));

            if (isCartoonPlaceholder || !isValidDesc || !isFaceDataValid) {
              console.warn('[Face AI] Aborting verification due to invalid descriptors.');
              isScanningActiveRef.current = false;
              setPhase('failed');
              setProgress(1.0);
              setLivenessPrompt('Verification failed.');

              if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
              }

              setResult({
                matched: false,
                confidence: 0.0,
                capturedAt: Date.now()
              });
              return;
            }

            const verify = verifyFaceIdentity(faceData.descriptor, referenceDesc!, 0.45);
            currentDistance = verify.distance;

            if (verify.matched) {
              matchCountRef.current += 1;
            }

            if (matchCountRef.current >= 3) {
              faceMatchedRef.current = true;
            }

            if (faceMatchedRef.current && livenessPassed) {
              isScanningActiveRef.current = false;
              setPhase('matched');
              setProgress(1.0);
              setLivenessPrompt('Verify complete!');

              if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
              }

              setResult({
                matched: true,
                confidence: verify.confidence,
                capturedAt: Date.now()
              });
              return;
            }

            setDebugInfo(prev => ({
              referenceLoaded: refLoaded,
              eyesOpen: eyesOpenDetectedRef.current,
              eyesClosed: eyesClosedDetectedRef.current,
              blinkCompleted: blinkCompletedRef.current,
              headTilted: headTiltedDetectedRef.current,
              currentEAR: mpEAR,
              headTiltAngle: mpRoll,
              lastDistance: currentDistance !== null ? currentDistance : prev.lastDistance
            }));
          } else {
            if (livenessPassed) {
              isScanningActiveRef.current = false;
              setPhase('matched');
              setProgress(1.0);

              const snapCanvas = document.createElement('canvas');
              snapCanvas.width = video.videoWidth;
              snapCanvas.height = video.videoHeight;
              const snapCtx = snapCanvas.getContext('2d');

              if (snapCtx) {
                snapCtx.drawImage(video, 0, 0);
              }

              const base64Data = snapCanvas.toDataURL('image/jpeg');

              if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
              }

              setResult({
                matched: true,
                confidence: 0.98,
                capturedAt: Date.now(),
                snapshotUrl: base64Data,
                descriptor: Array.from(faceData.descriptor)
              });
              return;
            }
          }
        } else {
          setDebugInfo(prev => ({
            ...prev,
            currentEAR: mpEAR,
            headTiltAngle: mpRoll,
            lastDistance: null
          }));
        }
      }

      if (isScanningActiveRef.current && currentProgress < 1.0) {
        scanLoopRef.current = window.requestAnimationFrame(tick);
      } else if (currentProgress >= 1.0) {
        isScanningActiveRef.current = false;
        setPhase('failed');
        setLivenessPrompt('Verification failed.');
        setResult({
          matched: false,
          confidence: 0.38,
          capturedAt: Date.now()
        });

        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    scanLoopRef.current = window.requestAnimationFrame(tick);
  }, [riderId, durationMs, referenceAvatar, referenceDescriptor, onDescriptorCalculated, debugInfo.currentEAR]);

  const start = useCallback(async () => {
    const sequenceStart = performance.now();
    console.log('[Face AI] start() triggered. Starting initialization sequence...');
    clearTimers();
    setResult(null);
    setProgress(0);
    setPhase('initializing');
    isScanningActiveRef.current = true;

    // Fully reset all liveness state refs for clean scan start
    eyesOpenDetectedRef.current = false;
    eyesClosedDetectedRef.current = false;
    blinkCompletedRef.current = false;
    headTiltedDetectedRef.current = false;
    faceMatchedRef.current = false;
    matchCountRef.current = 0;
    maxEarRef.current = 0;
    alignmentFramesRef.current = 0;
    closedFramesRef.current = 0;
    reopenFramesRef.current = 0;
    lastInferenceTimeRef.current = 0;
    lastDescriptorMatchTimeRef.current = 0;
    cachedFaceDataRef.current = null;

    const isVerificationMode = !!referenceAvatar;

    const { faceapi } = getFaceAiGlobals();
    if (!faceapi) {
      setLivenessPrompt('Downloading Face Recognition engines... 📥');
    } else {
      setLivenessPrompt('Preparing Face Recognition... ⚙️');
    }

    const active = await ensureScriptsLoaded();

    if (active) {
      try {
        setLivenessPrompt('Preparing Face Recognition... ⚙️');

        await Promise.all([
          loadFaceModels(),
          loadMediaPipeLandmarker()
        ]);

        setLivenessPrompt('Initializing camera...');
        console.log(`[Face AI] Initialization sequence ready in ${(performance.now() - sequenceStart).toFixed(2)}ms.`);

        await startRealScanning();
        return;
      } catch (err) {
        console.warn('Face AI weights loading exception:', err);
        if (isVerificationMode) {
          setPhase('failed');
          setLivenessPrompt('Verification failed.');
          setResult({
            matched: false,
            confidence: 0.0,
            capturedAt: Date.now()
          });
          return;
        }
      }
    }

    if (isVerificationMode) {
      setPhase('failed');
      setLivenessPrompt('Verification failed.');
      setResult({
        matched: false,
        confidence: 0.0,
        capturedAt: Date.now()
      });
      return;
    }

    timers.current.push(
      window.setTimeout(() => startSimulatedScanning(), 450)
    );
  }, [clearTimers, startRealScanning, startSimulatedScanning, referenceAvatar]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    phase,
    progress,
    result,
    start,
    reset,
    videoRef,
    canvasRef,
    livenessPrompt,
    debugInfo
  };
}
