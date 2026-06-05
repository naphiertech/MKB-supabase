import { useEffect, useState, useRef } from 'react';
import { ScanFace, CheckCircle2, XCircle, Camera } from 'lucide-react';
import type { ScanPhase, BiometricDebugInfo } from '../../hooks/useFaceRecognition';

interface FaceScannerProps {
  phase: ScanPhase;
  progress: number;
  riderName: string;
  riderAvatar: string;
  confidence?: number;
  videoRef?: React.RefObject<HTMLVideoElement>;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  livenessPrompt?: string;
  debugInfo?: BiometricDebugInfo;
}

/**
 * Real-time camera time-in time-out scanner utilizing device media streams.
 * Simulates low-level verification features over live frame captures.
 */
export function FaceScanner({
  phase,
  riderName,
  riderAvatar,
  confidence,
  videoRef,
  canvasRef,
  livenessPrompt,
  debugInfo
}: FaceScannerProps) {
  const [scanLineY, setScanLineY] = useState(0);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = videoRef || internalVideoRef;
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);

  // Animate digital laser scan line
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

  // Handle active webcam media acquisition
  useEffect(() => {
    if (phase === 'idle') {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        setWebcamStream(null);
      }
      return;
    }

    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 400, facingMode: 'user' } })
      .then(stream => {
        if (active) {
          setWebcamStream(stream);
          if (activeVideoRef.current) {
            activeVideoRef.current.srcObject = stream;
            activeVideoRef.current.play().catch(err => console.warn('Webcam stream play suspended:', err));
          }
        } else {
          stream.getTracks().forEach(track => track.stop());
        }
      })
      .catch(err => {
        console.warn('Webcam access not granted or unavailable:', err);
      });

    return () => {
      active = false;
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [phase, activeVideoRef]);

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
        
        {/* Real Live Camera Feed */}
        {webcamStream ? (
          <div className="absolute inset-0 w-full h-full">
            <video
              ref={activeVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
            />
          </div>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a0f06] via-[#0f0a06] to-[#0a0c12]" />
            <div
              className="absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 50% 40%, rgba(219,108,0,0.45), transparent 55%)'
              }}
            />
          </>
        )}
        
        {/* Centered target reticle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`relative w-40 h-40 rounded-full border-2 border-dashed ${matched ? 'border-emerald-400/80 animate-pulse bg-emerald-500/10' : failed ? 'border-red-400/80 bg-red-500/10' : 'border-[#db6c00]/70'} bg-transparent`}
          >
            {/* Small floating rider profile avatar as reference */}
            {matched && (
              <img
                src={riderAvatar}
                alt={`${riderName} matching template`}
                className="absolute -bottom-2 right-2 w-10 h-10 rounded-full border-2 border-emerald-400 object-cover shadow-md"
              />
            )}
            
            {/* Face overlay grid */}
            {(phase === 'scanning' || phase === 'initializing') && (
              <div className="absolute inset-0">
                <div className="absolute inset-3 border border-[#db6c00]/50 rounded-full" />
                <div className="absolute top-1/2 left-3 right-3 h-px bg-[#db6c00]/40" />
                <div className="absolute top-3 bottom-3 left-1/2 w-px bg-[#db6c00]/40" />
              </div>
            )}
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

      {/* Biometric Debug Overlay (outside the camera feed viewfinder) */}
      {phase === 'scanning' && debugInfo && (
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-2 max-w-[280px] mx-auto shadow-md">
          <div className="text-[#db6c00] font-bold uppercase tracking-wider mb-2.5 flex justify-between">
            <span>Biometric Scan Status</span>
            <span className="animate-pulse text-[10px]">● RUNNING</span>
          </div>
          <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
            <span>REF EMBEDDING:</span>
            <span className={debugInfo.referenceLoaded ? "text-emerald-400 font-bold" : debugInfo.referenceLoaded === false ? "text-red-400 font-bold" : "text-amber-400 font-bold"}>
              {debugInfo.referenceLoaded ? "LOADED" : debugInfo.referenceLoaded === false ? "FAILED" : "LOADING..."}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-800/60 py-1.5">
            <span>EYE ASPECT RATIO (EAR):</span>
            <span className="text-white font-semibold">{debugInfo.currentEAR.toFixed(3)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-800/60 py-1.5">
            <span>FACE DISTANCE:</span>
            <span className={debugInfo.lastDistance !== null && debugInfo.lastDistance < 0.58 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
              {debugInfo.lastDistance !== null ? debugInfo.lastDistance.toFixed(3) : "--"}
            </span>
          </div>

          {/* Graphical Stepper */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] font-sans font-bold select-none">
            <div className={`py-1.5 rounded-lg border transition-all ${
              debugInfo.eyesOpen 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-slate-800/40 border-slate-700/50 text-slate-500'
            }`}>
              1. ALIGN FACE 😐
            </div>
            <div className={`py-1.5 rounded-lg border transition-all ${
              debugInfo.blinkCompleted 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : debugInfo.eyesOpen 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse' 
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-500'
            }`}>
              2. BLINK EYES 😴
            </div>
          </div>
        </div>
      )}

      {/* Caption row */}
      <div className="text-center min-h-[44px]">
        {phase === 'idle' &&
          <div className="flex items-center justify-center gap-2 text-[#6B6258] text-sm">
            <ScanFace className="w-4 h-4" />
            Position your face within the frame.
          </div>
        }
        {phase === 'initializing' &&
          <div className="text-[#db6c00] text-sm font-semibold text-center">
            {livenessPrompt || 'Initializing camera…'}
          </div>
        }
        {phase === 'scanning' &&
          <div className="text-[#db6c00] text-sm font-semibold text-center">
            {livenessPrompt || 'Scanning facial features…'}
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
