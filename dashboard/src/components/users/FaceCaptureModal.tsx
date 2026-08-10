import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { FaceScanner } from '../attendance/FaceScanner';
import { useFaceRecognition } from '../../hooks/useFaceRecognition';

interface FaceCaptureModalProps {
  riderName: string;
  seedAvatar: string;
  onCapture: (dataUrl: string, descriptor: number[]) => void;
  onCancel: () => void;
}

export function FaceCaptureModal({
  riderName,
  seedAvatar,
  onCapture,
  onCancel
}: FaceCaptureModalProps) {
  const { phase, progress, result, start, videoRef, canvasRef, debugInfo } = useFaceRecognition({
    durationMs: 2500
  });
  const initialStartRef = useRef(start);

  useEffect(() => {
    void initialStartRef.current();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (phase === 'matched') {
      const targetPhoto = result?.snapshotUrl || seedAvatar;
      const descriptor = result?.descriptor || [];
      const t = setTimeout(() => onCapture(targetPhoto, descriptor), 800);
      return () => clearTimeout(t);
    }
  }, [phase, result, seedAvatar, onCapture]);

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-sm" onClick={onCancel} />
      
      <div role="dialog" aria-modal="true" aria-labelledby="face-enrollment-title" className="viewport-dialog relative z-[1310] w-full max-w-sm rounded-xl border border-border bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div id="face-enrollment-title" className="text-sm font-semibold text-foreground">Face Enrollment</div>
            <div className="text-[11px] text-muted-foreground">Capture a clear photo of the rider's face</div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-panel-bg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <FaceScanner
          phase={phase}
          progress={progress}
          videoRef={videoRef}
          canvasRef={canvasRef}
          debugInfo={debugInfo}
          riderAvatar={seedAvatar}
          riderName={riderName}
        />
      </div>
    </div>
  );
}
