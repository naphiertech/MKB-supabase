import { LogIn, LogOut, CheckCircle2, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
export type AttendanceAction = 'time-in' | 'time-out' | 'completed' | 'closed';
interface AttendanceButtonProps {
  action: AttendanceAction;
  onClick: () => void;
  disabled?: boolean;
}
const COPY: Record<
  AttendanceAction,
  {
    label: string;
    sub: string;
    icon: typeof LogIn;
    ring: string;
    fill: string;
    text: string;
    glow: string;
  }> =
{
  'time-in': {
    label: 'TAP TO TIME-IN',
    sub: 'Facial recognition required',
    icon: LogIn,
    ring: 'border-[#db6c00]/60',
    fill: 'bg-[#db6c00] hover:bg-[#b85a00] active:bg-[#a04e00]',
    text: 'text-white',
    glow: 'shadow-[0_10px_30px_-10px_rgba(219,108,0,0.45)] hover:shadow-[0_18px_42px_-10px_rgba(219,108,0,0.65)]'
  },
  'time-out': {
    label: 'TAP TO TIME-OUT',
    sub: 'End your shift securely',
    icon: LogOut,
    ring: 'border-[#db6c00]/60',
    fill: 'bg-white hover:bg-[#FFF1E0] active:bg-[#FFE5C2]',
    text: 'text-[#db6c00]',
    glow: 'shadow-[0_10px_30px_-12px_rgba(219,108,0,0.25)] hover:shadow-[0_18px_42px_-12px_rgba(219,108,0,0.35)]'
  },
  completed: {
    label: 'SHIFT COMPLETED',
    sub: 'You may close the app',
    icon: CheckCircle2,
    ring: 'border-[#EFEAE2]',
    fill: 'bg-[#FAFAF7]',
    text: 'text-[#6B6258]',
    glow: ''
  },
  closed: {
    label: 'ATTENDANCE CLOSED',
    sub: "Today's attendance has been finalized",
    icon: Lock,
    ring: 'border-slate-300',
    fill: 'bg-slate-100',
    text: 'text-slate-600',
    glow: ''
  }
};
export function AttendanceButton({
  action,
  onClick,
  disabled
}: AttendanceButtonProps) {
  const c = COPY[action];
  const Icon = c.icon;
  const inactive = action === 'completed' || action === 'closed' || disabled;
  const isPrimary = action === 'time-in';
  return (
    <motion.button
      type="button"
      whileHover={!inactive ? { scale: 1.02 } : {}}
      whileTap={!inactive ? { scale: 0.98 } : {}}
      onClick={inactive ? undefined : onClick}
      disabled={inactive}
      aria-label={c.label}
      className={`group relative w-full max-w-md mx-auto flex flex-col items-center justify-center gap-3 px-8 py-10 rounded-2xl border-2 transition-all duration-200 ${c.ring} ${c.fill} ${c.glow} ${inactive ? 'cursor-default' : 'cursor-pointer'}`}>
      
      {/* Pulse ring (only when ready) */}
      {action !== 'completed' &&
      <motion.span
        animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className={`absolute inset-0 rounded-2xl border-2 ${c.ring}`}
        aria-hidden="true" />

      }

      <span
        className={`flex items-center justify-center w-16 h-16 rounded-full border-2 ${isPrimary ? 'bg-white/15 border-white/30 text-white' : 'bg-[#FFF1E0] border-[#db6c00]/30 text-[#db6c00]'} ${inactive ? 'bg-white border-[#EFEAE2] text-[#6B6258]' : ''}`}>
        
        <Icon className="w-7 h-7" strokeWidth={2} />
      </span>

      <div className="text-center">
        <div
          className={`text-lg sm:text-xl font-semibold tracking-[0.18em] ${c.text}`}>
          
          {c.label}
        </div>
        <div
          className={`text-[11px] uppercase tracking-[0.16em] mt-1 font-mono ${isPrimary ? 'text-white/80' : 'text-[#6B6258]'}`}>
          
          {c.sub}
        </div>
      </div>
    </motion.button>);

}
