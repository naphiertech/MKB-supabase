import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Download } from 'lucide-react';
import type { AttendanceLog, Zone } from '../../services/mockData';
import {
  deriveHrStatus,
  exportLogsCsv,
  type HrLogStatus } from
'../../services/attendanceService';
import { pushToast } from '../../hooks/useToast';
interface HRAttendanceOverviewProps {
  logs: AttendanceLog[];
  zones: Zone[];
}
type Range = 'today' | 'week' | 'all';
type StatusFilter = 'all' | HrLogStatus;
const STATUS_STYLES: Record<HrLogStatus, string> = {
  Complete: 'bg-emerald-50 text-emerald-700 border-emerald-500/25',
  Incomplete: 'bg-amber-50 text-amber-700 border-amber-500/25',
  Absent: 'bg-red-50 text-red-700 border-red-500/25',
  Late: 'bg-[#FFF1E0] text-[#b85a00] border-[#db6c00]/25'
};
const STATUS_DOT: Record<HrLogStatus, string> = {
  Complete: 'bg-emerald-500',
  Incomplete: 'bg-amber-500',
  Absent: 'bg-red-500',
  Late: 'bg-[#db6c00]'
};
function HrStatusPill({ status }: {status: HrLogStatus;}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[status]}`}>
      
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>);

}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
export function HRAttendanceOverview({
  logs,
  zones
}: HRAttendanceOverviewProps) {
  const [range, setRange] = useState<Range>('today');
  const [zoneId, setZoneId] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const filtered = useMemo(() => {
    const today = daysAgo(0);
    const weekAgo = daysAgo(6);
    return logs.
    filter((l) => {
      if (range === 'today' && l.date !== today) return false;
      if (range === 'week' && (l.date < weekAgo || l.date > today))
      return false;
      if (zoneId !== 'all' && l.zoneId !== zoneId) return false;
      const s = deriveHrStatus(l);
      if (status !== 'all' && s !== status) return false;
      return true;
    }).
    sort((a, b) =>
    b.date === a.date ?
    (b.timeIn ?? '').localeCompare(a.timeIn ?? '') :
    b.date.localeCompare(a.date)
    );
  }, [logs, range, zoneId, status]);
  function handleExport() {
    exportLogsCsv(filtered, `attenrider-attendance-${daysAgo(0)}.csv`);
    pushToast({
      title: 'Export started',
      description: `${filtered.length} records · CSV`,
      tone: 'success'
    });
  }
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[#EFEAE2]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/25 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-[#db6c00]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Attendance Overview
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              {filtered.length} entries
            </div>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-[#db6c00] hover:bg-[#b85a00] active:bg-[#a04e00] text-white text-xs font-semibold focus:ring-2 focus:ring-[#db6c00]/25 transition">
          
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#EFEAE2] bg-[#FAFAF7]">
        <div className="inline-flex p-0.5 rounded-md bg-white border border-[#EFEAE2]">
          {(['today', 'week', 'all'] as Range[]).map((r) =>
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-2.5 py-1 text-xs rounded font-semibold transition ${range === r ? 'bg-[#FFF1E0] text-[#b85a00]' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
            
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'All'}
            </button>
          )}
        </div>

        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="hr-select"
          aria-label="Filter by zone">
          
          <option value="all">All Zones</option>
          {zones.map((z) =>
          <option key={z.id} value={z.id}>
              {z.name}
            </option>
          )}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="hr-select"
          aria-label="Filter by status">
          
          <option value="all">All Statuses</option>
          <option value="Complete">Complete</option>
          <option value="Incomplete">Incomplete</option>
          <option value="Late">Late</option>
          <option value="Absent">Absent</option>
        </select>

        <div className="flex-1" />
        <div className="text-[11px] text-[#6B6258] font-mono">
          {range === 'today' ?
          daysAgo(0) :
          range === 'week' ?
          `${daysAgo(6)} → ${daysAgo(0)}` :
          'All dates'}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[#6B6258] border-b border-[#EFEAE2]">
              <th className="font-semibold py-2.5 px-4">Rider</th>
              <th className="font-semibold py-2.5 px-4">Zone</th>
              <th className="font-semibold py-2.5 px-4">Time-In</th>
              <th className="font-semibold py-2.5 px-4">Time-Out</th>
              <th className="font-semibold py-2.5 px-4">Hours</th>
              <th className="font-semibold py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 30).map((l, idx) => {
              const s = deriveHrStatus(l);
              return (
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
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FAFAF7] text-[#1A1410] border border-[#EFEAE2]">
                      {l.zoneName}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[#1A1410] tabular-nums">
                    {l.timeIn ?? '—'}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[#6B6258] tabular-nums">
                    {l.timeOut ?? '—'}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[#1A1410] tabular-nums font-semibold">
                    {l.hours && l.hours > 0 ? `${l.hours.toFixed(1)}` : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    <HrStatusPill status={s} />
                  </td>
                </tr>);

            })}
            {filtered.length === 0 &&
            <tr>
                <td
                colSpan={6}
                className="text-center py-10 text-sm text-[#6B6258]">
                
                  No attendance records match your filters.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <style>{`
        .hr-select {
          height: 32px;
          padding: 0 28px 0 10px;
          background-color: #FFFFFF;
          border: 1px solid #EFEAE2;
          border-radius: 6px;
          color: #1A1410;
          font-size: 12px;
          outline: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .hr-select:focus { border-color: #db6c00; box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.15); }
      `}</style>
    </div>);

}