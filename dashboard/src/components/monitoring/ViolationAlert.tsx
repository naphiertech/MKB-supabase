import { AlertTriangle, ChevronRight, Clock, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import type { ViolationEvent } from '../../services/types';
import { useNow, relativeTime } from '../../hooks/useNow';
interface ViolationAlertProps {
  alert: ViolationEvent;
  onView?: (riderId: string) => void;
  isNew?: boolean;
  isFlagged?: boolean;
}
const TYPE_LABEL: Record<ViolationEvent['type'], string> = {
  boundary_exit: 'Boundary exit',
  boundary_enter: 'Re-entry',
  idle_excess: 'Idle > 5 min'
};
export function ViolationAlert({ alert, onView, isNew, isFlagged }: ViolationAlertProps) {
  const now = useNow();

  // Compute duration description
  const durationText = useMemo(() => {
    const end = alert.resolved && alert.resolvedAt ? alert.resolvedAt : now;
    const diffMs = end - alert.ts;
    const diffMins = Math.round(diffMs / 60000);
    if (alert.resolved) {
      return `Outside for ${diffMins} min${diffMins !== 1 ? 's' : ''} (Resolved)`;
    } else {
      return `Outside for ${diffMins} min${diffMins !== 1 ? 's' : ''} (Active)`;
    }
  }, [alert.ts, alert.resolved, alert.resolvedAt, now]);

  return (
    <motion.div
      initial={isNew ? { opacity: 0, scale: 0.9, x: 30 } : false}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: 0,
        backgroundColor: alert.resolved 
          ? "#f0fdf4" 
          : !alert.read 
            ? ["#FAFAF7", "#fef2f2", "#FAFAF7"] 
            : "#FAFAF7"
      }}
      transition={{ 
        duration: isNew ? 0.5 : undefined,
        type: isNew ? "spring" : "tween",
        bounce: 0.4,
        backgroundColor: {
          duration: 2,
          repeat: (!alert.read && !alert.resolved) ? Infinity : 0,
          ease: "easeInOut"
        }
      }}
      className={`relative flex items-start gap-3 p-3 rounded-lg border border-[#EFEAE2] ${
        alert.resolved 
          ? 'border-l-2 border-l-emerald-500 opacity-75' 
          : isFlagged 
            ? 'border-l-2 border-l-[#db6c00]' 
            : !alert.read 
              ? 'border-l-2 border-l-red-500' 
              : 'opacity-80'
      }`}
    >
      
      <div
        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${alert.type === 'idle_excess' ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-500/25' : 'bg-red-50 text-red-600 ring-1 ring-red-500/25'}`}>
        
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1A1410] truncate">
            {alert.riderName}
          </span>
          {isFlagged && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FFF1E0] text-[#b85a00] border border-[#db6c00]/30 shrink-0">
              <Check className="w-2.5 h-2.5" /> Flagged
            </span>
          )}
          {!alert.read &&
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          }
        </div>
        <div className="text-[11px] text-[#6B6258] mt-0.5 flex flex-wrap items-center">
          <span className="text-[#1A1410] font-medium">
            {TYPE_LABEL[alert.type]}
          </span>
          <span className="text-[#6B6258]/60 mx-1.5">·</span>
          <span>{alert.zoneName}</span>
          {alert.type === 'boundary_exit' && (
            <>
              <span className="text-[#6B6258]/60 mx-1.5">·</span>
              <span className={alert.resolved ? "text-emerald-600 font-semibold" : "text-red-500 font-bold"}>
                {durationText}
              </span>
            </>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-[#6B6258] font-mono">
          <Clock className="w-3 h-3" />
          {relativeTime(alert.ts, now)}
        </div>
      </div>
      <button
        onClick={() => onView?.(alert.riderId)}
        className="inline-flex items-center gap-1 self-center px-2.5 h-7 rounded-md bg-[#db6c00] text-white border border-[#db6c00] text-xs font-semibold hover:bg-[#b85a00]">
        
        View <ChevronRight className="w-3 h-3" />
      </button>
    </motion.div>);

}
