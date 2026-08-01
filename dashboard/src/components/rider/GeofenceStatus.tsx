import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
interface GeofenceStatusProps {
  inZone: boolean;
  zoneName: string;
  /** Distance from zone center, meters. */
  distance: number;
  /** Zone radius, meters. */
  radius: number;
}
export function GeofenceStatus({
  inZone,
  zoneName,
  distance,
  radius
}: GeofenceStatusProps) {
  const overshoot = Math.max(0, distance - radius);
  if (inZone) {
    return (
      <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl bg-accent border border-primary/30 shadow-sm overflow-hidden">
        <motion.span 
          animate={{ scale: [1, 1.02, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 rounded-xl border border-primary/40" 
        />
        <span className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-white text-primary ring-1 ring-primary/25">
          <ShieldCheck className="w-5 h-5" />
        </span>
        <div className="relative flex-1 min-w-0">
          <div className="text-sm text-accent-foreground font-semibold">
            You are within your assigned zone
          </div>
          <div className="text-[11px] text-accent-foreground/80 font-mono mt-0.5">
            {zoneName} · {Math.round(distance)}m from center · {radius}m radius
          </div>
        </div>
      </div>);

  }
  return (
    <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-500/40 shadow-sm overflow-hidden">
      <motion.span 
        animate={{ scale: [1, 1.05, 1], opacity: [0.8, 0, 0.8] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="absolute inset-0 rounded-xl border-2 border-red-400/40" 
      />
      <span className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-white text-red-600 ring-1 ring-red-500/25">
        <ShieldAlert className="w-5 h-5" />
      </span>
      <div className="relative flex-1 min-w-0">
        <div className="text-sm text-red-700 font-semibold uppercase tracking-wider">
          Warning · You are outside your zone
        </div>
        <div className="text-[11px] text-red-700/80 font-mono mt-0.5">
          {zoneName} · {Math.round(overshoot)}m past boundary — return to your
          zone
        </div>
      </div>
    </div>);

}
