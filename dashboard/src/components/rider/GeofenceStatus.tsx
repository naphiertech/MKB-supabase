import { ShieldCheck, ShieldAlert } from 'lucide-react';
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
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FFF1E0] border border-[#db6c00]/30 shadow-sm">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white text-[#db6c00] ring-1 ring-[#db6c00]/25">
          <ShieldCheck className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-[#b85a00] font-semibold">
            You are within your assigned zone
          </div>
          <div className="text-[11px] text-[#b85a00]/80 font-mono mt-0.5">
            {zoneName} · {Math.round(distance)}m from center · {radius}m radius
          </div>
        </div>
      </div>);

  }
  return (
    <div className="relative flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-500/40 shadow-sm">
      <span className="absolute inset-0 rounded-xl border-2 border-red-400/40 animate-ping" />
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