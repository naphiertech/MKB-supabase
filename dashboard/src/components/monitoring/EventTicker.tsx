import { useMemo } from 'react';
import { LogIn, LogOut, Clock, Activity } from 'lucide-react';
import type { Rider, Zone, ViolationEvent } from '../../services/types';
interface EventTickerProps {
  riders: Rider[];
  zones: Zone[];
  violations: ViolationEvent[];
}
function buildEvents(
riders: Rider[],
zones: Zone[],
violations: ViolationEvent[])
{
  const events: {
    icon: 'in' | 'out' | 'idle' | 'ping';
    text: string;
    tone: 'green' | 'red' | 'amber' | 'brand';
  }[] = [];
  violations.slice(0, 6).forEach((v) => {
    events.push({
      icon: 'out',
      tone: 'red',
      text: `${v.riderName} exited ${v.zoneName} geofence`
    });
  });
  riders.
  filter((r) => r.status === 'idle').
  slice(0, 4).
  forEach((r) => {
    const z = zones.find((z) => z.id === r.zoneId)?.name ?? '—';
    events.push({
      icon: 'idle',
      tone: 'amber',
      text: `${r.name} idle in ${z}`
    });
  });
  riders.
  filter((r) => r.status === 'active').
  slice(0, 6).
  forEach((r) => {
    const z = zones.find((z) => z.id === r.zoneId)?.name ?? '—';
    events.push({
      icon: 'in',
      tone: 'green',
      text: `${r.name} entered ${z}`
    });
  });
  riders.slice(0, 6).forEach((r) => {
    events.push({
      icon: 'ping',
      tone: 'brand',
      text: `${r.name} ping ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
    });
  });
  return events;
}
const ICONS = {
  in: LogIn,
  out: LogOut,
  idle: Clock,
  ping: Activity
};
const TONES = {
  green: 'text-emerald-600',
  red: 'text-red-600',
  amber: 'text-amber-600',
  brand: 'text-[#db6c00]'
};
export function EventTicker({ riders, zones, violations }: EventTickerProps) {
  const events = useMemo(
    () => buildEvents(riders, zones, violations),
    [riders, zones, violations]
  );
  return (
    <div className="relative overflow-hidden bg-[#FAFAF7] border-t border-[#EFEAE2] py-2.5">
      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-[#FAFAF7] to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-[#FAFAF7] to-transparent pointer-events-none" />

      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#FFF1E0] border border-[#db6c00]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#db6c00] animate-pulse" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#b85a00] font-mono font-semibold">
          Live
        </span>
      </div>

      <div className="overflow-hidden pl-24">
        <div className="ar-ticker-track">
          {[...events, ...events].map((e, i) => {
            const Icon = ICONS[e.icon];
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 mx-5 text-xs font-mono text-[#1A1410]">
                
                <Icon className={`w-3.5 h-3.5 ${TONES[e.tone]}`} />
                {e.text}
                <span className="text-[#6B6258]/40 ml-3">•</span>
              </span>);

          })}
        </div>
      </div>
    </div>);

}
