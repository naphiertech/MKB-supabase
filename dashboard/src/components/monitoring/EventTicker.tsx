import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Flag, LogOut, Pause, Play } from 'lucide-react';
import type { ViolationEvent } from '../../services/types';
import { buildViolationTickerEvents } from '../../lib/violationPresentation';
import { relativeTime, useNow } from '../../hooks/useNow';

interface EventTickerProps {
  violations: ViolationEvent[];
}

const ICONS = {
  out: LogOut,
  idle: Clock,
  flag: Flag,
  resolved: CheckCircle2
};

const TONES = {
  red: 'text-red-600',
  amber: 'text-amber-600',
  brand: 'text-primary',
  green: 'text-emerald-600'
};

export function EventTicker({ violations }: EventTickerProps) {
  const [paused, setPaused] = useState(false);
  const now = useNow();
  const events = useMemo(() => buildViolationTickerEvents(violations), [violations]);

  return (
    <div className="relative overflow-hidden bg-panel-bg border-t border-border py-2.5">
      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-panel-bg to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-panel-bg to-transparent pointer-events-none" />

      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent border border-primary/30">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        <span className="text-[10px] uppercase tracking-[0.18em] text-accent-foreground font-mono font-semibold">
          Incidents
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 min-h-8 min-w-8 inline-flex items-center justify-center rounded-md border border-border bg-white text-muted-foreground hover:text-foreground"
        aria-label={paused ? 'Resume incident ticker' : 'Pause incident ticker'}
        aria-pressed={paused}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>

      <div className="overflow-hidden pl-24 pr-12">
        {events.length === 0 ? (
          <div className="text-xs text-muted-foreground">No violation incidents recorded</div>
        ) : (
          <div className="ar-ticker-track" style={{ animationPlayState: paused ? 'paused' : 'running' }}>
            {[...events, ...events].map((event, index) => {
              const Icon = ICONS[event.icon];
              return (
                <span
                  key={`${event.incidentId}-${index}`}
                  className="inline-flex items-center gap-1.5 mx-5 text-xs font-mono text-foreground"
                >
                  <Icon className={`w-3.5 h-3.5 ${TONES[event.tone]}`} />
                  {event.text}
                  <span className="text-muted-foreground">{relativeTime(event.timestamp, now)}</span>
                  <span className="text-muted-foreground/40 ml-3">•</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
