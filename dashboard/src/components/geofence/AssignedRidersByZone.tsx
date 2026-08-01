import { ChevronDown } from 'lucide-react';
import type { Zone, Rider, AttendanceLog } from '../../services/types';
import { getLocalDateString } from '../../services/attendanceService';
interface AssignedRidersByZoneProps {
  zones: Zone[];
  riders: Rider[];
  attendanceLogs: AttendanceLog[];
  violationCountByRider: Record<string, number>;
  openGroupIds: Set<string>;
  onToggleGroup: (zoneId: string) => void;
  onSelectZone: (zoneId: string) => void;
}
const STATUS_META: Record<
  Rider['status'],
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
  }> =
{
  active: {
    label: 'Active',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500'
  },
  idle: {
    label: 'Idle',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500'
  },
  violation: {
    label: 'Violation',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500'
  },
  offline: {
    label: 'Offline',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400'
  }
};
function RiderStatusPill({ status }: {status: Rider['status'];}) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.bg} ${m.text}`}>
      
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>);

}
export function AssignedRidersByZone({
  zones,
  riders,
  attendanceLogs,
  violationCountByRider,
  openGroupIds,
  onToggleGroup,
  onSelectZone
}: AssignedRidersByZoneProps) {
  const today = getLocalDateString();
  const timeInByRider: Record<string, string | null> = {};
  attendanceLogs.
  filter((l) => l.date === today).
  forEach((l) => {
    timeInByRider[l.riderId] = l.timeIn;
  });
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Assigned Riders by Zone
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">
            Tap a header to expand · click any rider to highlight their zone
          </div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {zones.map((zone) => {
          const zoneRiders = riders.filter((r) => r.zoneId === zone.id);
          const isOpen = openGroupIds.has(zone.id);
          return (
            <div key={zone.id}>
              <button
                type="button"
                onClick={() => onToggleGroup(zone.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-panel-bg transition text-left border-l-4 border-primary">
                
                <span
                  className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow"
                  style={{
                    background: zone.color
                  }} />
                
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">
                    {zone.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {zoneRiders.length}{' '}
                    {zoneRiders.length === 1 ? 'rider' : 'riders'} assigned
                  </div>
                </div>
                {(zone.status ?? 'active') === 'inactive' &&
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
                    Inactive
                  </span>
                }
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                
              </button>
              {isOpen &&
              <div className="overflow-x-auto">
                  {zoneRiders.length === 0 ?
                <div className="px-6 py-6 text-sm text-muted-foreground">
                      No riders assigned to this zone yet.
                    </div> :

                <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground bg-panel-bg">
                          <th className="px-4 py-2 font-semibold">
                            Rider Name
                          </th>
                          <th className="px-4 py-2 font-semibold">Status</th>
                          <th className="px-4 py-2 font-semibold">
                            Time-In Today
                          </th>
                          <th className="px-4 py-2 font-semibold text-right">
                            Violations
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {zoneRiders.map((r) => {
                      const v = violationCountByRider[r.id] ?? 0;
                      const timeIn = timeInByRider[r.id];
                      return (
                        <tr
                          key={r.id}
                          onClick={() => onSelectZone(zone.id)}
                          className="border-t border-border hover:bg-accent/40 cursor-pointer transition">
                          
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <img
                                src={r.avatar}
                                alt=""
                                className="w-7 h-7 rounded-full bg-panel-bg border border-border" />
                              
                                  <div className="min-w-0">
                                    <div className="text-foreground font-medium truncate">
                                      {r.name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-mono">
                                      {r.riderCode}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <RiderStatusPill status={r.status} />
                              </td>
                              <td className="px-4 py-2.5 text-foreground font-mono tabular-nums">
                                {timeIn ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {v > 0 ?
                            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold border border-red-200">
                                    {v}
                                  </span> :

                            <span className="text-muted-foreground">—</span>
                            }
                              </td>
                            </tr>);

                    })}
                      </tbody>
                    </table>
                }
                </div>
              }
            </div>);

        })}
      </div>
    </div>);

}
