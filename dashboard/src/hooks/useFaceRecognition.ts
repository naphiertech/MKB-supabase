// Mock facial-recognition scan controller for the rider time-in/out flow.
// TODO: Wire to OpenCV.js + TensorFlow FaceNet for real verification against the rider's enrolled template.
import { useCallback, useEffect, useRef, useState } from 'react';

export type ScanPhase =
'idle' |
'initializing' |
'scanning' |
'matched' |
'failed';

interface UseFaceRecognitionOptions {
  /** Total duration of a successful scan, in ms. */
  durationMs?: number;
  /** Probability the scan succeeds (0–1). Default 1 (always matches). */
  successRate?: number;
}

interface ScanResult {
  matched: boolean;
  confidence: number;
  capturedAt: number;
}

export function useFaceRecognition({
  durationMs = 2600,
  successRate = 1
}: UseFaceRecognitionOptions = {}) {
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [progress, setProgress] = useState(0); // 0–1
  const [result, setResult] = useState<ScanResult | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const reset = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setProgress(0);
    setResult(null);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setResult(null);
    setProgress(0);
    setPhase('initializing');

    timers.current.push(window.setTimeout(() => setPhase('scanning'), 450));

    // animate progress
    const steps = 30;
    const tick = durationMs / steps;
    for (let i = 1; i <= steps; i++) {
      timers.current.push(
        window.setTimeout(() => setProgress(i / steps), 450 + i * tick)
      );
    }

    // finish
    timers.current.push(
      window.setTimeout(
        () => {
          const ok = Math.random() <= successRate;
          if (ok) {
            setPhase('matched');
            setResult({
              matched: true,
              confidence: 0.94 + Math.random() * 0.05,
              capturedAt: Date.now()
            });
          } else {
            setPhase('failed');
            setResult({
              matched: false,
              confidence: 0.4 + Math.random() * 0.2,
              capturedAt: Date.now()
            });
          }
        },
        450 + durationMs + 200
      )
    );
  }, [durationMs, successRate]);

  useEffect(() => () => clearTimers(), []);

  return { phase, progress, result, start, reset };
}