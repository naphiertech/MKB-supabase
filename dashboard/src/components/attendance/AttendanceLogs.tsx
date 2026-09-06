import { useMemo, useState } from 'react';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { getAttendanceContextLabel, getPresentationContextCode, getPresentationStatus, type AttendancePresentationLog } from '../../services/attendance/attendanceContextService';
import { getLocalDateString } from '../../services/attendance/attendanceService';
import { StatusPill } from './StatusPill';
interface AttendanceLogsProps {
  logs: AttendancePresentationLog[];
  onViewAll?: () => void;
}
type Range = 'today' | 'week';
export function AttendanceLogs({ logs, onViewAll }: AttendanceLogsProps) {
  const [range, setRange] = useState<Range>('today');
  const filtered = useMemo(() => {
    const today = getLocalDateString();
    if (range === 'today')
    return logs.filter((l) => l.date === today).slice(0, 8);
    return logs.slice(0, 8);
  }, [logs, range]);
  return (
    <div className="bg-white border border-border rounded-xl flex flex-col shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Recent Attendance
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {filtered.length} entries
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex p-0.5 rounded-md bg-panel-bg border border-border">
            {(['today', 'week'] as Range[]).map((r) =>
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-semibold transition ${range === r ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              
                {r === 'today' ? 'Today' : 'This Week'}
              </button>
            )}
          </div>
          <button
            onClick={onViewAll}
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-xs text-primary hover:text-accent-foreground font-semibold">
            
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="table-scroll-region ar-scroll" role="region" aria-label="Recent attendance logs" tabIndex={0}>
        <table className="data-table w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-panel-bg">
              <th className="font-semibold py-2.5 px-4">Rider</th>
              <th className="font-semibold py-2.5 px-4">Time-In</th>
              <th className="font-semibold py-2.5 px-4">Time-Out</th>
              <th className="font-semibold py-2.5 px-4">Zone</th>
              <th className="font-semibold py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l, idx) =>
            <tr
              key={l.id || `${l.riderId}-${l.date}`}
              className={`border-b border-border/70 last:border-0 hover:bg-accent/40 ${idx % 2 === 1 ? 'bg-panel-bg/40' : ''}`}>
              
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <img
                    src={l.riderAvatar}
                    alt=""
                    className="w-7 h-7 rounded-full bg-white border border-border" />
                  
                    <div className="min-w-0">
                      <div className="text-foreground text-sm font-semibold truncate">
                        {l.riderName}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {l.date}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-4 font-mono text-foreground tabular-nums">
                  {l.timeIn ?? '—'}
                </td>
                <td className="py-2.5 px-4 font-mono text-muted-foreground tabular-nums">
                  {l.timeOut ?? '—'}
                </td>
                <td className="py-2.5 px-4 text-foreground">{l.zoneName}</td>
                <td className="py-2.5 px-4">
                  <div className="flex flex-col items-start gap-1">
                    <StatusPill status={getPresentationStatus(l)} />
                    {getPresentationContextCode(l) && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {getAttendanceContextLabel(getPresentationContextCode(l))}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            )}
            {filtered.length === 0 &&
            <tr>
                <td
                colSpan={5}
                className="text-center py-8 text-sm text-muted-foreground">
                
                  No logs in range.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>);

}
