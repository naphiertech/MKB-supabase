import { LogIn, LogOut, Clock } from 'lucide-react';
interface AttendanceStatusProps {
  timeIn: string | null;
  timeOut: string | null;
  /** Optional hours-on-shift display (e.g. "3h 12m") */
  duration?: string | null;
}
function Slot({
  label,
  value,
  icon: Icon,
  tone





}: {label: string;value: string;icon: typeof LogIn;tone: 'emerald' | 'brand' | 'gray';}) {
  const toneText =
  tone === 'emerald' ?
  'text-emerald-600' :
  tone === 'brand' ?
  'text-primary' :
  'text-muted-foreground';
  const toneIcon =
  tone === 'emerald' ?
  'text-emerald-600' :
  tone === 'brand' ?
  'text-primary' :
  'text-muted-foreground';
  const slotBg =
  tone === 'emerald' ?
  'bg-emerald-50 border-emerald-500/25' :
  tone === 'brand' ?
  'bg-accent border-primary/25' :
  'bg-panel-bg border-border';
  return (
    <div
      className={`flex-1 flex flex-col items-center py-3 px-4 rounded-xl border ${slotBg}`}>
      
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-mono font-semibold">
        <Icon className={`w-3 h-3 ${toneIcon}`} />
        {label}
      </span>
      <span
        className={`mt-1 text-xl sm:text-2xl font-mono tabular-nums tracking-tight font-semibold ${toneText}`}>
        
        {value}
      </span>
    </div>);

}
export function AttendanceStatus({
  timeIn,
  timeOut,
  duration
}: AttendanceStatusProps) {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex gap-3">
        <Slot
          label="Time-In"
          value={timeIn ?? '— : —'}
          icon={LogIn}
          tone={timeIn ? 'emerald' : 'gray'} />
        
        <Slot
          label="Time-Out"
          value={timeOut ?? '— : —'}
          icon={LogOut}
          tone={timeOut ? 'brand' : 'gray'} />
        
      </div>
      {duration &&
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground font-mono">
          <Clock className="w-3 h-3" />
          On shift · {duration}
        </div>
      }
    </div>);

}
