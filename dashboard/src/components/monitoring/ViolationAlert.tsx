import { AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ViolationEvent } from '../../services/mockData';
import { useNow, relativeTime } from '../../hooks/useNow';
interface ViolationAlertProps {
  alert: ViolationEvent;
  onView?: (riderId: string) => void;
  isNew?: boolean;
}
const TYPE_LABEL: Record<ViolationEvent['type'], string> = {
  boundary_exit: 'Boundary exit',
  boundary_enter: 'Re-entry',
  idle_excess: 'Idle > 5 min'
};
export function ViolationAlert({ alert, onView, isNew }: ViolationAlertProps) {
  const now = useNow();
  return (
    <motion.div
      initial={isNew ? { opacity: 0, scale: 0.9, x: 30 } : false}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: 0,
        backgroundColor: !alert.read ? ["#FAFAF7", "#fef2f2", "#FAFAF7"] : "#FAFAF7"
      }}
      transition={{ 
        duration: isNew ? 0.5 : undefined,
        type: isNew ? "spring" : "tween",
        bounce: 0.4,
        backgroundColor: {
          duration: 2,
          repeat: !alert.read ? Infinity : 0,
          ease: "easeInOut"
        }
      }}
      className={`relative flex items-start gap-3 p-3 rounded-lg border border-[#EFEAE2] ${!alert.read ? 'border-l-2 border-l-red-500' : 'opacity-80'}`}
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
          {!alert.read &&
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          }
        </div>
        <div className="text-[11px] text-[#6B6258] mt-0.5">
          <span className="text-[#1A1410] font-medium">
            {TYPE_LABEL[alert.type]}
          </span>
          <span className="text-[#6B6258]/60 mx-1.5">·</span>
          <span>{alert.zoneName}</span>
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