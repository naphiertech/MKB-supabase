import { useEffect, useState } from 'react';
import { ScanFace, CheckCircle2, XCircle, Loader2, Camera } from 'lucide-react';
import type { ScanPhase } from '../../hooks/useFaceRecognition';
interface FaceScannerProps {
  phase: ScanPhase;
  progress: number;
  riderName: string;
  riderAvatar: string;
  confidence?: number;
}
/**
 * Simulated facial-recognition viewfinder. No real camera access — purely a
 * visual placeholder for the OpenCV + FaceNet pipeline.
 */
export function FaceScanner({
  phase,
  progress,
  riderName,
  riderAvatar,
  confidence
}: FaceScannerProps) {
  const [scanLineY, setScanLineY] = useState(0);
  useEffect(() => {
    if (phase !== 'scanning') return;
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const elapsed = (t - start) / 1400;
      setScanLineY(elapsed % 1 * 100);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  const matched = phase === 'matched';
  const failed = phase === 'failed';
  const ringColor = matched ?
  'border-emerald-500' :
  failed ?
  'border-red-500' :
  phase === 'scanning' ?
  'border-[#db6c00]' :
  'border-[#EFEAE2]';
  return (
    <div className="space-y-4">
      {/* Viewfinder */}
      <div
        className={`relative aspect-square w-full max-w-[280px] mx-auto rounded-2xl overflow-hidden border-2 ${ringColor} bg-[#0a0c12] transition-colors shadow-[0_20px_45px_-20px_rgba(219,108,0,0.35)]`}>
        
        {/* Simulated camera feed */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a0f06] via-[#0f0a06] to-[#0a0c12]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
            'radial-gradient(circle at 50% 40%, rgba(219,108,0,0.45), transparent 55%)'
          }} />
        
        {/* Centered rider silhouette → avatar */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`relative w-32 h-32 rounded-full overflow-hidden border-2 ${matched ? 'border-emerald-400/80' : failed ? 'border-red-400/80' : 'border-[#db6c00]/70'} bg-[#1a1d27]`}>
            
            <img
              src={riderAvatar}
              alt={`${riderName} face capture`}
              className={`w-full h-full object-cover ${phase === 'scanning' ? 'opacity-90' : 'opacity-95'}`} />
            
            {/* Face overlay grid */}
            {(phase === 'scanning' || phase === 'initializing') &&
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-3 border border-[#db6c00]/50 rounded-full" />
                <div className="absolute top-1/2 left-3 right-3 h-px bg-[#db6c00]/40" />
                <div className="absolute top-3 bottom-3 left-1/2 w-px bg-[#db6c00]/40" />
              </div>
            }
          </div>
        </div>

        {/* Corner brackets */}
        {[
        'top-3 left-3 border-l-2 border-t-2',
        'top-3 right-3 border-r-2 border-t-2',
        'bottom-3 left-3 border-l-2 border-b-2',
        'bottom-3 right-3 border-r-2 border-b-2'].
        map((c, i) =>
        <span
          key={i}
          className={`absolute w-6 h-6 rounded ${c} ${matched ? 'border-emerald-400' : failed ? 'border-red-400' : 'border-[#db6c00]'}`} />

        )}

        {/* Scan line */}
        {phase === 'scanning' &&
        <div
          className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#db6c00] to-transparent shadow-[0_0_12px_rgba(219,108,0,0.7)]"
          style={{
            top: `${scanLineY}%`
          }} />

        }

        {/* Success / fail overlay */}
        {(matched || failed) &&
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div
            className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl ${matched ? 'bg-emerald-500/20 border border-emerald-400/40' : 'bg-red-500/20 border border-red-400/40'}`}>
            
              {matched ?
            <CheckCircle2 className="w-8 h-8 text-emerald-300" /> :

            <XCircle className="w-8 h-8 text-red-300" />
            }
              <span
              className={`text-xs font-semibold uppercase tracking-wider ${matched ? 'text-emerald-200' : 'text-red-200'}`}>
              
                {matched ? 'Face Matched' : 'No Match'}
              </span>
            </div>
          </div>
        }

        {/* Status pill (top-left/right) */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[10px] font-mono">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/50 text-white backdrop-blur-sm">
            <Camera className="w-3 h-3" />
            CAM-01
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/50 text-[#db6c00] backdrop-blur-sm">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#db6c00] opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#db6c00]" />
            </span>
            LIVE
          </span>
        </div>
      </div>

      {/* Caption row */}
      <div className="text-center min-h-[44px]">
        {phase === 'idle' &&
        <div className="flex items-center justify-center gap-2 text-[#6B6258] text-sm">
            <ScanFace className="w-4 h-4" />
            Position your face within the frame.
          </div>
        }
        {phase === 'initializing' &&
        <div className="flex items-center justify-center gap-2 text-[#db6c00] text-sm font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            Initializing camera…
          </div>
        }
        {phase === 'scanning' &&
        <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-[#db6c00] text-sm font-semibold">
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning facial features…
            </div>
            <div className="h-1.5 max-w-[240px] mx-auto rounded-full bg-[#FAFAF7] border border-[#EFEAE2] overflow-hidden">
              <div
              className="h-full bg-gradient-to-r from-[#db6c00] to-[#f59e0b] transition-[width] duration-100"
              style={{
                width: `${Math.round(progress * 100)}%`
              }} />
            
            </div>
          </div>
        }
        {phase === 'matched' &&
        <div className="text-sm">
            <div className="text-emerald-600 font-semibold">
              Identity verified — {riderName.split(' ')[0]}
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono mt-0.5">
              Confidence {(confidence ?? 0.96).toFixed(2)} · FaceNet match
            </div>
          </div>
        }
        {phase === 'failed' &&
        <div className="text-sm">
            <div className="text-red-600 font-semibold">
              Face did not match enrolled template
            </div>
            <div className="text-[11px] text-[#6B6258] mt-0.5">
              Try again with better lighting or contact your supervisor.
            </div>
          </div>
        }
      </div>
    </div>);

}