import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Flag, Check, ArrowRight } from 'lucide-react';
import type { ViolationEvent, Rider } from '../../services/types';
import { useNow, relativeTime } from '../../hooks/useNow';
import { pushToast } from '../../hooks/useToast';
import { getFlaggedViolationIds, createNotificationAlert } from '../../services/notificationService';
import {
  isViolationOnBusinessDate,
  VIOLATION_TYPE_LABEL
} from '../../lib/violationPresentation';

interface HRViolationSummaryProps {
  violations: ViolationEvent[];
  riders: Rider[];
  onViewAll?: () => void;
}

export function HRViolationSummary({ violations, riders, onViewAll }: HRViolationSummaryProps) {
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'flagged' | 'unflagged'>('all');
  const now = useNow();

  const ridersById = useMemo(() => {
    const m = new Map<string, Rider>();
    riders.forEach((r) => m.set(r.id, r));
    return m;
  }, [riders]);

  const recent = useMemo(
    () => violations.filter((violation) => isViolationOnBusinessDate(violation.ts, now)).slice(0, 5),
    [violations, now]
  );

  useEffect(() => {
    async function loadFlagged() {
      try {
        const ids = await getFlaggedViolationIds();
        setFlagged(ids);
      } catch (e) {
        console.error('Error loading flagged violations:', e);
      }
    }
    loadFlagged();
  }, [violations]);

  async function handleFlag(v: ViolationEvent) {
    if (flagged.has(v.id)) return;

    setFlagged((prev) => {
      const next = new Set(prev);
      next.add(v.id);
      return next;
    });

    try {
      const flaggedSuccessfully = await createNotificationAlert({
        type: 'violation',
        title: 'Flagged Violation',
        message: `${v.riderName} requires follow-up (${VIOLATION_TYPE_LABEL[v.type]} at ${v.zoneName})`,
        riderId: v.riderId,
        violationId: v.id,
        targetRoles: ['admin', 'hr'],
        metadata: {
          source: 'hr_violation_flag',
          manual_flag: true,
          violation_type: v.type
        }
      });

      if (!flaggedSuccessfully) {
        throw new Error('The follow-up flag could not be saved.');
      }

      pushToast({
        title: `Flagged for Admin · ${v.riderName}`,
        description: `${VIOLATION_TYPE_LABEL[v.type]} · ${v.zoneName}`,
        tone: 'default'
      });
    } catch (err: unknown) {
      console.error('Failed to log flagged state in database:', err);
      setFlagged((prev) => {
        const next = new Set(prev);
        next.delete(v.id);
        return next;
      });
      pushToast({
        title: 'Flag failed',
        description: err instanceof Error ? err.message : 'Could not flag violation. Please try again.',
        tone: 'error'
      });
    }
  }

  return (
    <div className="bg-white border border-border rounded-xl flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 ring-1 ring-red-500/25 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Recent Violation Summary</div>
            <div className="text-[11px] text-muted-foreground font-mono">
              Today in Manila · {recent.length} recent incident{recent.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-primary hover:text-accent-foreground font-bold transition cursor-pointer flex items-center gap-1 hover:underline"
          >
            <span>View All Violations</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Mode Filter Bar */}
      <div className="flex gap-1.5 px-4 py-2 bg-panel-bg/50 border-b border-border shrink-0">
        {(['all', 'flagged', 'unflagged'] as const).map((mode) => {
          const active = filter === mode;
          const count =
            mode === 'all'
              ? recent.length
              : mode === 'flagged'
              ? recent.filter((v) => flagged.has(v.id)).length
              : recent.filter((v) => !flagged.has(v.id)).length;
          const label = mode === 'all' ? 'All' : mode === 'flagged' ? 'Flagged' : 'Unflagged';
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                active ? 'bg-primary text-white' : 'bg-white text-muted-foreground border border-border hover:bg-panel-bg'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Incident List */}
      <div className="p-3 space-y-2 overflow-y-auto ar-scroll flex-1">
        {recent.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8 font-mono">No violation incidents recorded today.</div>
        )}
        {recent
          .filter((v) => {
            if (filter === 'all') return true;
            if (filter === 'flagged') return flagged.has(v.id);
            return !flagged.has(v.id);
          })
          .map((v) => {
            const rider = ridersById.get(v.riderId);
            const isFlagged = flagged.has(v.id);

            const end = v.resolved && v.resolvedAt ? v.resolvedAt : now;
            const diffMs = end - v.ts;
            const diffMins = Math.round(diffMs / 60000);
            const durationText = v.resolved
              ? `Outside for ${diffMins} min${diffMins !== 1 ? 's' : ''} (Resolved)`
              : `Outside for ${diffMins} min${diffMins !== 1 ? 's' : ''} (Active)`;

            // Severity Badge Logic
            const severityBadge = v.resolved ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-300">
                Resolved
              </span>
            ) : v.type === 'boundary_exit' ? (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-300 animate-pulse">
                High Severity
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-300">
                Medium Severity
              </span>
            );

            return (
              <div
                key={v.id}
                className={`flex items-start gap-3 p-2.5 rounded-lg border border-border transition shadow-2xs ${
                  v.resolved
                    ? 'border-l-2 border-l-emerald-500 bg-emerald-50/10 opacity-80'
                    : isFlagged
                    ? 'border-l-2 border-l-primary bg-panel-bg'
                    : 'border-l-2 border-l-red-500 bg-red-50/5'
                }`}
              >
                <img src={rider?.avatar ?? ''} alt="" className="w-8 h-8 rounded-full bg-white border border-border shrink-0" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground truncate">{v.riderName}</span>
                    {severityBadge}
                    {isFlagged && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-accent text-accent-foreground border border-primary/30">
                        <Check className="w-2.5 h-2.5" /> Flagged
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center">
                    <span className="text-foreground font-semibold">{VIOLATION_TYPE_LABEL[v.type]}</span>
                    <span className="text-muted-foreground/60 mx-1">·</span>
                    <span>{v.zoneName}</span>
                    {v.type === 'boundary_exit' && (
                      <>
                        <span className="text-muted-foreground/60 mx-1">·</span>
                        <span className={v.resolved ? 'text-emerald-600 font-semibold' : 'text-red-500 font-bold'}>
                          {durationText}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] text-muted-foreground font-mono">
                    <span>{relativeTime(v.ts, now)}</span>
                    {v.lat !== undefined && v.lng !== undefined && (
                      <span className="text-muted-foreground/70">
                        {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleFlag(v)}
                  disabled={isFlagged || v.resolved}
                  className={`inline-flex items-center gap-1 self-center px-2.5 h-7 rounded-md text-[11px] font-bold border transition shrink-0 cursor-pointer ${
                    isFlagged || v.resolved
                      ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-primary hover:bg-primary-hover text-white border-primary'
                  }`}
                >
                  <Flag className="w-3 h-3" />
                  {isFlagged ? 'Flagged' : v.resolved ? 'Resolved' : 'Flag'}
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}
