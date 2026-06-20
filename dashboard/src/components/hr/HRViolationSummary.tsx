import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Flag, Check } from 'lucide-react';
import type { ViolationEvent, Rider } from '../../services/types';
import { useNow, relativeTime } from '../../hooks/useNow';
import { pushToast } from '../../hooks/useToast';
import { supabase } from '../../lib/supabaseClient';
interface HRViolationSummaryProps {
  violations: ViolationEvent[];
  riders: Rider[];
}
const TYPE_LABEL: Record<ViolationEvent['type'], string> = {
  boundary_exit: 'Boundary exit',
  boundary_enter: 'Re-entry',
  idle_excess: 'Idle > 5 min'
};
export function HRViolationSummary({
  violations,
  riders
}: HRViolationSummaryProps) {
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'flagged' | 'unflagged'>('all');
  const now = useNow();
  const ridersById = useMemo(() => {
    const m = new Map<string, Rider>();
    riders.forEach((r) => m.set(r.id, r));
    return m;
  }, [riders]);
  const recent = useMemo(() => violations.slice(0, 10), [violations]);

  useEffect(() => {
    async function loadFlagged() {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('violation_id')
          .eq('type', 'violation')
          .not('violation_id', 'is', null);

        if (!error && data) {
          const ids = new Set<string>(data.map((n: { violation_id: string }) => n.violation_id));
          setFlagged(ids);
        }
      } catch (e) {
        console.error('Error loading flagged violations:', e);
      }
    }
    loadFlagged();
  }, [violations]);

  async function handleFlag(v: ViolationEvent) {
    if (flagged.has(v.id)) return;

    // Optimistically set UI state
    setFlagged((prev) => {
      const next = new Set(prev);
      next.add(v.id);
      return next;
    });

    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          type: 'violation',
          title: 'Flagged Violation',
          message: `${v.riderName} breached geofence boundary (${TYPE_LABEL[v.type]} at ${v.zoneName})`,
          rider_id: v.riderId,
          violation_id: v.id,
          read: false,
          target_roles: ['admin', 'hr']
        });

      if (error) throw error;

      pushToast({
        title: `Flagged for Admin · ${v.riderName}`,
        description: `${TYPE_LABEL[v.type]} · ${v.zoneName}`,
        tone: 'default'
      });
    } catch (err: unknown) {
      console.error('Failed to log flagged state in database:', err);
      // Revert UI state on failure
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
    <div className="bg-white border border-[#EFEAE2] rounded-xl flex flex-col h-full shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-[#EFEAE2]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 ring-1 ring-red-500/25 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Violation Summary
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              Read-only · {recent.length} today
            </div>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[#6B6258] font-mono font-semibold">
          HR View
        </span>
      </div>

      <div className="flex gap-1.5 px-4 py-2 bg-[#FAFAF7]/50 border-b border-[#EFEAE2] shrink-0">
        {(['all', 'flagged', 'unflagged'] as const).map((mode) => {
          const active = filter === mode;
          const count = mode === 'all' 
            ? recent.length 
            : mode === 'flagged' 
              ? recent.filter(v => flagged.has(v.id)).length 
              : recent.filter(v => !flagged.has(v.id)).length;
          const label = mode === 'all' ? 'All' : mode === 'flagged' ? 'Flagged for Admin' : 'Unflagged';
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                active 
                  ? 'bg-[#db6c00] text-white' 
                  : 'bg-white text-[#6B6258] border border-[#EFEAE2] hover:bg-[#FAFAF7]'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      <div className="p-2 space-y-1.5 overflow-y-auto ar-scroll flex-1">
        {recent.length === 0 &&
        <div className="text-center text-sm text-[#6B6258] py-10">
            No violations today. All clear.
          </div>
        }
        {recent.filter(v => {
          if (filter === 'all') return true;
          if (filter === 'flagged') return flagged.has(v.id);
          return !flagged.has(v.id);
        }).map((v) => {
          const rider = ridersById.get(v.riderId);
          const isFlagged = flagged.has(v.id);
          return (
            <div
              key={v.id}
              className={`flex items-start gap-3 p-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] ${isFlagged ? 'border-l-2 border-l-[#db6c00]' : ''}`}>
              
              <img
                src={rider?.avatar ?? ''}
                alt=""
                className="w-9 h-9 rounded-full bg-white border border-[#EFEAE2] shrink-0" />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#1A1410] truncate">
                    {v.riderName}
                  </span>
                  {isFlagged &&
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-[#FFF1E0] text-[#b85a00] border border-[#db6c00]/30">
                      <Check className="w-2.5 h-2.5" /> Flagged
                    </span>
                  }
                </div>
                <div className="text-[11px] text-[#6B6258] mt-0.5">
                  <span className="text-[#1A1410] font-medium">
                    {TYPE_LABEL[v.type]}
                  </span>
                  <span className="text-[#6B6258]/60 mx-1.5">·</span>
                  <span>{v.zoneName}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#6B6258] font-mono">
                  <span>{relativeTime(v.ts, now)}</span>
                  {rider &&
                  <span className="text-[#6B6258]/70">
                      {rider.lat.toFixed(4)}, {rider.lng.toFixed(4)}
                    </span>
                  }
                </div>
              </div>
              <button
                onClick={() => handleFlag(v)}
                disabled={isFlagged}
                className={`inline-flex items-center gap-1 self-center px-2.5 h-7 rounded-md text-xs font-semibold border transition shrink-0 ${isFlagged ? 'bg-[#FFF1E0]/50 text-[#b85a00]/70 border-[#db6c00]/20 cursor-not-allowed' : 'bg-[#db6c00] hover:bg-[#b85a00] text-white border-[#db6c00]'}`}>
                
                <Flag className="w-3 h-3" />
                {isFlagged ? 'Flagged' : 'Flag for Admin'}
              </button>
            </div>);

        })}
      </div>
    </div>);

}
