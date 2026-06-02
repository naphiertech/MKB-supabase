import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureScriptsLoaded,
  loadFaceModels,
  detectSingleFaceRect,
  getFaceDescriptor,
  getDescriptorFromUrl,
  verifyFaceIdentity,
  preprocessWithOpenCV
} from '../lib/faceAi';

export type ScanPhase =
  | 'idle'
  | 'initializing'
  | 'scanning'
  | 'matched'
  | 'failed';

interface UseFaceRecognitionOptions {
  /** Total duration of a scan, in ms. */
  durationMs?: number;
  /** Probability the simulated scan succeeds (0–1). Default 1 (always matches). */
  successRate?: number;
  /** Enrolled reference face image URL (Base64 or standard HTTP URL) */
  referenceAvatar?: string | null;
}

interface ScanResult {
  matched: boolean;
  confidence: number;
  capturedAt: number;
  snapshotUrl?: string; // Captured enrollment photo snapshot
}

export function useFaceRecognition({
  durationMs = 3000,
  successRate = 1.0,
  referenceAvatar = null
}: UseFaceRecognitionOptions = {}) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState(0); // 0–1
  const [result, setResult] = useState<ScanResult | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const scanLoopRef = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
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
   * Real Facial Detection and Embedding Matching Loop
   */
  const startRealScanning = useCallback(async () => {
    setPhase('scanning');
    
    const isVerificationMode = !!referenceAvatar;
    const isCartoonPlaceholder = !!referenceAvatar && (
      referenceAvatar.includes('api.dicebear.com') ||
      referenceAvatar.includes('dicebear') ||
      referenceAvatar.includes('/svg?') ||
      referenceAvatar.endsWith('.svg')
    );

    let referenceDesc: Float32Array | null = null;
    if (isVerificationMode && !isCartoonPlaceholder) {
      referenceDesc = await getDescriptorFromUrl(referenceAvatar);
    }

    const startTime = Date.now();
    let isScanningActive = true;

    const tick = async () => {
      if (!isScanningActive) return;

      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(1.0, elapsed / durationMs);
      setProgress(currentProgress);

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= 2) {
        // Sync canvas resolution matching video stream aspect
        if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // 1. Detect face rect for rendering visual cyber corners
        const box = await detectSingleFaceRect(video);

        // Draw bounding box details on overlay canvas
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (box) {
              // Target bounds
              const r = box;

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

        // 2. Perform deep learning face comparison (wait until 35% scanning completes to simulate loading rhythm)
        if (box && currentProgress >= 0.35) {
          const descriptor = await getFaceDescriptor(video);
          
          if (descriptor) {
            if (isVerificationMode) {
              // Attendance Clock-in verification mode
              if (isCartoonPlaceholder || !referenceDesc) {
                // Reject immediately if they don't have a valid real face registered
                isScanningActive = false;
                setPhase('failed');
                setProgress(1.0);
                
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

              // Enforce strict biometric distance threshold (0.52) for real face-match verification
              const verify = verifyFaceIdentity(descriptor, referenceDesc, 0.52);
              
              if (verify.matched) {
                isScanningActive = false;
                setPhase('matched');
                setProgress(1.0);
                
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
            } else {
              // Admin enrollment registration mode
              isScanningActive = false;
              setPhase('matched');
              setProgress(1.0);

              // Draw video snapshot onto virtual canvas
              const snapCanvas = document.createElement('canvas');
              snapCanvas.width = video.videoWidth;
              snapCanvas.height = video.videoHeight;
              const snapCtx = snapCanvas.getContext('2d');
              
              if (snapCtx) {
                snapCtx.drawImage(video, 0, 0);
                // Preprocess snapshot frame using OpenCV (grayscale + hist equalize)
                await preprocessWithOpenCV(snapCanvas);
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
                snapshotUrl: base64Data
              });
              return;
            }
          }
        }
      }

      if (currentProgress < 1.0) {
        scanLoopRef.current = window.requestAnimationFrame(tick);
      } else {
        // Scanning duration elapsed with no successful matches
        isScanningActive = false;
        setPhase('failed');
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
  }, [durationMs, referenceAvatar]);

  const start = useCallback(async () => {
    clearTimers();
    setResult(null);
    setProgress(0);
    setPhase('initializing');

    const isVerificationMode = !!referenceAvatar;

    // Polling globally loaded scripts (OpenCV + TensorFlow)
    const active = await ensureScriptsLoaded();
    
    if (active) {
      try {
        await loadFaceModels();
        // Models parsed successfully, trigger genuine scan loops
        await startRealScanning();
        return;
      } catch (err) {
        console.warn('Face AI weights loading exception:', err);
        if (isVerificationMode) {
          setPhase('failed');
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
    canvasRef
  };
}
