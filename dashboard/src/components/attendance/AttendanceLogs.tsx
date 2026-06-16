import { useMemo, useState } from 'react';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import type { AttendanceLog } from '../../services/types';
import { getLocalDateString } from '../../services/attendanceService';
import { StatusPill } from './StatusPill';
interface AttendanceLogsProps {
  logs: AttendanceLog[];
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
    <div className="bg-white border border-[#EFEAE2] rounded-xl flex flex-col shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-[#EFEAE2] gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/25 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-[#db6c00]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Recent Attendance
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              {filtered.length} entries
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex p-0.5 rounded-md bg-[#FAFAF7] border border-[#EFEAE2]">
            {(['today', 'week'] as Range[]).map((r) =>
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-semibold transition ${range === r ? 'bg-white text-[#db6c00] shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
              
                {r === 'today' ? 'Today' : 'This Week'}
              </button>
            )}
          </div>
          <button
            onClick={onViewAll}
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-xs text-[#db6c00] hover:text-[#b85a00] font-semibold">
            
            View all <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto ar-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[#6B6258] border-b border-[#EFEAE2] bg-[#FAFAF7]">
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
              key={l.id}
              className={`border-b border-[#EFEAE2]/70 last:border-0 hover:bg-[#FFF1E0]/40 ${idx % 2 === 1 ? 'bg-[#FAFAF7]/40' : ''}`}>
              
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <img
                    src={l.riderAvatar}
                    alt=""
                    className="w-7 h-7 rounded-full bg-white border border-[#EFEAE2]" />
                  
                    <div className="min-w-0">
                      <div className="text-[#1A1410] text-sm font-semibold truncate">
                        {l.riderName}
                      </div>
                      <div className="text-[10px] text-[#6B6258] font-mono">
                        {l.date}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-4 font-mono text-[#1A1410] tabular-nums">
                  {l.timeIn ?? '—'}
                </td>
                <td className="py-2.5 px-4 font-mono text-[#6B6258] tabular-nums">
                  {l.timeOut ?? '—'}
                </td>
                <td className="py-2.5 px-4 text-[#1A1410]">{l.zoneName}</td>
                <td className="py-2.5 px-4">
                  <StatusPill status={l.status} />
                </td>
              </tr>
            )}
            {filtered.length === 0 &&
            <tr>
                <td
                colSpan={5}
                className="text-center py-8 text-sm text-[#6B6258]">
                
                  No logs in range.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>);

}
