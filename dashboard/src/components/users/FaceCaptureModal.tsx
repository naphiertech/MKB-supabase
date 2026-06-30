import { useEffect } from 'react';
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

  useEffect(() => {
    start();
  }, [start]);

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
      <div className="absolute inset-0 bg-[#1A1410]/60 backdrop-blur-sm" onClick={onCancel} />
      
      <div className="relative bg-white rounded-2xl border border-[#EFEAE2] shadow-2xl w-full max-w-sm p-5 z-[1310]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">Face Enrollment</div>
            <div className="text-[11px] text-[#6B6258]">Capture a clear photo of the rider's face</div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] cursor-pointer"
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
