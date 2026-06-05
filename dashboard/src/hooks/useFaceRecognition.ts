import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureScriptsLoaded,
  loadFaceModels,
  getDescriptorFromUrl,
  verifyFaceIdentity,
  detectFaceWithDetails,
  loadMediaPipeLandmarker,
  calculateMediaPipeEAR
} from '../lib/faceAi';

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
  const maxEarRef = useRef<number>(0);

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
    maxEarRef.current = 0;
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
        console.log('[Face AI] Reference descriptor loaded directly from DB.');
      } else if (!isCartoonPlaceholder && referenceAvatar) {
        referenceDesc = await getDescriptorFromUrl(referenceAvatar);
        if (referenceDesc) {
          refLoaded = true;
          console.log('[Face AI] Reference descriptor compiled from URL.');
          // Fire callback to save it to database
          onDescriptorCalculated?.(Array.from(referenceDesc));
        }
      }
      
      setDebugInfo(prev => ({
        ...prev,
        referenceLoaded: refLoaded
      }));
    }

    const landmarker = await loadMediaPipeLandmarker();
    console.log('[Face AI] MediaPipe Face Landmarker loaded:', landmarker ? 'Success' : 'Failed');

    const scanDuration = isVerificationMode ? 30000 : durationMs; // Allow more time for double challenge (30s)
    const startTime = Date.now();

    const tick = async () => {
      if (!isScanningActiveRef.current) return;

      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(1.0, elapsed / scanDuration);
      setProgress(currentProgress);

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= 2) {
        // Sync canvas resolution matching video stream aspect
        if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        let mpEAR = 0.0;
        let mpRoll = 0.0;
        let livenessPassed = false;

        // 1. Run MediaPipe Landmarker for Liveness (Blink + Head Tilt)
        if (landmarker) {
          try {
            const detections = landmarker.detectForVideo(video, Date.now());
            if (detections && detections.faceLandmarks && detections.faceLandmarks.length > 0) {
              const landmarks = detections.faceLandmarks[0];
              mpEAR = calculateMediaPipeEAR(landmarks);

              if (isVerificationMode) {
                // Challenge Sequence:
                // Stage A: Align face (open eyes, look straight)
                if (!eyesOpenDetectedRef.current && mpEAR > 0.20) {
                  eyesOpenDetectedRef.current = true;
                  console.log('[Liveness] Align stage complete (Eyes open).');
                }
                // Stage B: Blink (eyes closed)
                if (eyesOpenDetectedRef.current && !eyesClosedDetectedRef.current && mpEAR < 0.19) {
                  eyesClosedDetectedRef.current = true;
                  console.log('[Liveness] Blink stage complete (Eyes closed).');
                }
                // Stage C: Reopen eyes
                if (eyesClosedDetectedRef.current && !blinkCompletedRef.current && mpEAR > 0.20) {
                  blinkCompletedRef.current = true;
                  console.log('[Liveness] Blink complete.');
                }

                livenessPassed = blinkCompletedRef.current;
              } else {
                // Enrollment mode: Just align face
                livenessPassed = mpEAR > 0.20;
              }
            }
          } catch (err) {
            console.warn('[Face AI] MediaPipe detection exception:', err);
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

        // 2. Run face-api.js for Face Bounding Box & Matching
        const faceData = await detectFaceWithDetails(video);

        // Draw bounding box details on overlay canvas
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (faceData) {
              const r = faceData.box;

              // Draw dashed background outline box
              ctx.setLineDash([4, 4]);
              ctx.strokeStyle = 'rgba(219, 108, 0, 0.4)';
              ctx.strokeRect(r.x, r.y, r.width, r.height);
              ctx.setLineDash([]);

              // Draw solid cyber corners
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

        // 3. Process matching if faceData is available
        if (faceData) {
          if (isVerificationMode) {
            let currentDistance: number | null = null;

            const isValidDesc = referenceDesc && referenceDesc.length === 128 && !referenceDesc.some(val => isNaN(val));
            const isFaceDataValid = faceData && faceData.descriptor && faceData.descriptor.length === 128 && !faceData.descriptor.some(val => isNaN(val));

            if (isCartoonPlaceholder || !isValidDesc || !isFaceDataValid) {
              console.warn('[Face AI] Aborting verification due to invalid descriptors. Cartoon:', isCartoonPlaceholder, 'ValidRef:', !!isValidDesc, 'ValidFace:', !!isFaceDataValid);
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

            // Enforce biometric distance threshold (0.54) for real face-match verification
            const verify = verifyFaceIdentity(faceData.descriptor, referenceDesc!, 0.54);
            currentDistance = verify.distance;

            // Lock face match status if verification succeeds during any frame (typically when facing straight)
            if (verify.matched) {
              faceMatchedRef.current = true;
            }

            // Verification succeeds ONLY if both face-matching and liveness challenge succeed
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
            // Admin enrollment registration mode
            // Snaps immediately when face is detected and properly aligned
            if (livenessPassed) {
              isScanningActiveRef.current = false;
              setPhase('matched');
              setProgress(1.0);

              // Draw video snapshot onto virtual canvas
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
          // No face detected by face-api.js
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
        // Scanning duration elapsed with no successful matches
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
  }, [durationMs, referenceAvatar, referenceDescriptor, onDescriptorCalculated]);

  const start = useCallback(async () => {
    clearTimers();
    setResult(null);
    setProgress(0);
    setPhase('initializing');
    setLivenessPrompt('Initializing camera...');
    isScanningActiveRef.current = true;

    const isVerificationMode = !!referenceAvatar;

    // Polling globally loaded scripts (OpenCV + TensorFlow)
    const active = await ensureScriptsLoaded();
    
    if (active) {
      try {
        // Load both Face-API models and MediaPipe landmarker in parallel
        await Promise.all([
          loadFaceModels(),
          loadMediaPipeLandmarker()
        ]);
        // Models parsed successfully, trigger genuine scan loops
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
      // Strictly prevent simulated fallback in biometric verification mode
      setPhase('failed');
      setLivenessPrompt('Verification failed.');
      setResult({
        matched: false,
        confidence: 0.0,
        capturedAt: Date.now()
      });
      return;
    }

    // Trigger fallback scanning rhythm only in enrollment mode
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
