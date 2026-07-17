import { useEffect, useState } from 'react';
import { Siren } from 'lucide-react';
import { getFlaggedViolationIds } from '../../services/notificationService';
import type { ViolationEvent } from '../../services/types';
import { ViolationAlert } from './ViolationAlert';
interface ViolationFeedProps {
  alerts: ViolationEvent[];
  onView?: (riderId: string) => void;
  onMarkAllRead?: () => void;
}
export function ViolationFeed({
  alerts,
  onView,
  onMarkAllRead
}: ViolationFeedProps) {
  const unread = alerts.filter((a) => !a.read).length;
  const [latestId, setLatestId] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (alerts.length > 0) setLatestId(alerts[0].id);
  }, [alerts.length, alerts]);
  useEffect(() => {
    async function loadFlagged() {
      try {
        const ids = await getFlaggedViolationIds();
        setFlagged(ids);
      } catch (e) {
        console.error(e);
      }
    }
    loadFlagged();
  }, [alerts]);
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl flex flex-col h-[480px] min-h-[360px] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[#EFEAE2] sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 ring-1 ring-red-500/25 flex items-center justify-center">
            <Siren className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410] flex items-center gap-2">
              Violation Alerts
              {unread > 0 &&
              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-500/25 text-[10px] font-mono font-semibold animate-pulse">
                  {unread} new
                </span>
              }
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              {alerts.length} total · realtime
            </div>
          </div>
        </div>
        <button
          onClick={onMarkAllRead}
          disabled={unread === 0}
          className="text-xs text-[#db6c00] hover:text-[#b85a00] font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:text-[#6B6258]">
          
          Mark all read
        </button>
      </div>

      <div className="ar-scroll overflow-y-auto flex-1 p-3 space-y-2">
        {alerts.length === 0 &&
        <div className="text-center py-10 text-sm text-[#6B6258]">
            No violations — all riders within bounds.
          </div>
        }
        {alerts.map((a) =>
        <ViolationAlert
          key={a.id}
          alert={a}
          onView={onView}
          isNew={a.id === latestId && !a.read} isFlagged={flagged.has(a.id)} />

        )}
      </div>
    </div>);

}
