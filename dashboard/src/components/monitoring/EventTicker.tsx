import { useMemo, useState } from 'react';
import { LogIn, LogOut, Clock, Activity, Pause, Play } from 'lucide-react';
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
  brand: 'text-primary'
};
export function EventTicker({ riders, zones, violations }: EventTickerProps) {
  const [paused, setPaused] = useState(false);
  const events = useMemo(
    () => buildEvents(riders, zones, violations),
    [riders, zones, violations]
  );
  return (
    <div className="relative overflow-hidden bg-panel-bg border-t border-border py-2.5">
      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-panel-bg to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-panel-bg to-transparent pointer-events-none" />

      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent border border-primary/30">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-accent-foreground font-mono font-semibold">
          Live
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 min-h-8 min-w-8 inline-flex items-center justify-center rounded-md border border-border bg-white text-muted-foreground hover:text-foreground"
        aria-label={paused ? 'Resume live event ticker' : 'Pause live event ticker'}
        aria-pressed={paused}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>

      <div className="overflow-hidden pl-24 pr-12">
        {events.length === 0 ? (
          <div className="text-xs text-muted-foreground">No live events yet</div>
        ) : <div className="ar-ticker-track" style={{ animationPlayState: paused ? 'paused' : 'running' }}>
          {[...events, ...events].map((e, i) => {
            const Icon = ICONS[e.icon];
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 mx-5 text-xs font-mono text-foreground">
                
                <Icon className={`w-3.5 h-3.5 ${TONES[e.tone]}`} />
                {e.text}
                <span className="text-muted-foreground/40 ml-3">•</span>
              </span>);

          })}
        </div>}
      </div>
    </div>);

}
