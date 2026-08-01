import { useMemo, useState } from 'react';
import { ClipboardCheck, Download, ScanFace, UserCheck, X } from 'lucide-react';
import type { AttendanceLog, Zone } from '../../services/types';
import {
  deriveHrStatus,
  exportLogsCsv,
  type HrLogStatus
} from '../../services/attendanceService';
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
  Late: 'bg-accent text-accent-foreground border-primary/25'
};

const STATUS_DOT: Record<HrLogStatus, string> = {
  Complete: 'bg-emerald-500',
  Incomplete: 'bg-amber-500',
  Absent: 'bg-red-500',
  Late: 'bg-primary'
};

function HrStatusPill({ status }: { status: HrLogStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_STYLES[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}

function VerificationBadge({ source, lat }: { source: 'face-scan' | 'manual' | 'system'; lat?: number }) {
  if (source === 'system') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
        <span>Auto-Cutoff</span>
      </span>
    );
  }
  if (source === 'face-scan' && lat) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
        <ScanFace className="w-3 h-3 text-emerald-600" />
        <span>Face + GPS</span>
      </span>
    );
  }
  if (source === 'face-scan') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-300">
        <ScanFace className="w-3 h-3 text-green-600" />
        <span>Face Scan</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300">
      <UserCheck className="w-3 h-3 text-amber-600" />
      <span>Manual</span>
    </span>
  );
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function HRAttendanceOverview({ logs, zones }: HRAttendanceOverviewProps) {
  const [range, setRange] = useState<Range>('today');
  const [zoneId, setZoneId] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selectedLog, setSelectedLog] = useState<AttendanceLog | null>(null);

  const filtered = useMemo(() => {
    const today = daysAgo(0);
    const weekAgo = daysAgo(6);
    return logs
      .filter((l) => {
        if (range === 'today' && l.date !== today) return false;
        if (range === 'week' && (l.date < weekAgo || l.date > today)) return false;
        if (zoneId !== 'all' && l.zoneId !== zoneId) return false;
        const s = deriveHrStatus(l);
        if (status !== 'all' && s !== status) return false;
        return true;
      })
      .sort((a, b) => (b.date === a.date ? (b.timeIn ?? '').localeCompare(a.timeIn ?? '') : b.date.localeCompare(a.date)));
  }, [logs, range, zoneId, status]);

  function handleExport() {
    exportLogsCsv(filtered, `mkbridertrack-attendance-${daysAgo(0)}.csv`);
    pushToast({
      title: 'Export started',
      description: `${filtered.length} records · CSV`,
      tone: 'success'
    });
  }

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Attendance Overview</div>
            <div className="text-[11px] text-muted-foreground font-mono">{filtered.length} entries</div>
          </div>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary hover:bg-primary-hover active:bg-primary-hover text-white text-xs font-semibold focus:ring-2 focus:ring-primary/25 transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-panel-bg">
        <div className="inline-flex p-0.5 rounded-md bg-white border border-border">
          {(['today', 'week', 'all'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-semibold transition cursor-pointer ${
                range === r ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'All'}
            </button>
          ))}
        </div>

        <select
          value={zoneId}
          onChange={(e) => setZoneId(e.target.value)}
          className="hr-select"
          aria-label="Filter by zone"
        >
          <option value="all">All Zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="hr-select"
          aria-label="Filter by status"
        >
          <option value="all">All Statuses</option>
          <option value="Complete">Complete</option>
          <option value="Incomplete">Incomplete</option>
          <option value="Late">Late</option>
          <option value="Absent">Absent</option>
        </select>

        <div className="flex-1" />
        <div className="text-[11px] text-muted-foreground font-mono">
          {range === 'today' ? daysAgo(0) : range === 'week' ? `${daysAgo(6)} → ${daysAgo(0)}` : 'All dates'}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
              <th className="font-semibold py-2.5 px-4">Rider</th>
              <th className="font-semibold py-2.5 px-4">Zone</th>
              <th className="font-semibold py-2.5 px-4">Verification</th>
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
                  onClick={() => setSelectedLog(l)}
                  className={`border-b border-border/70 last:border-0 hover:bg-accent/40 transition cursor-pointer ${
                    idx % 2 === 1 ? 'bg-panel-bg/40' : ''
                  }`}
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={l.riderAvatar}
                        alt=""
                        className="w-7 h-7 rounded-full bg-white border border-border shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-semibold truncate">{l.riderName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{l.date}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-panel-bg text-foreground border border-border">
                      {l.zoneName}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <VerificationBadge source={l.source} lat={l.lat} />
                  </td>
                  <td className="py-2.5 px-4 font-mono text-foreground tabular-nums">{l.timeIn ?? '—'}</td>
                  <td className="py-2.5 px-4 font-mono text-muted-foreground tabular-nums">{l.timeOut ?? '—'}</td>
                  <td className="py-2.5 px-4 font-mono text-foreground tabular-nums font-semibold">
                    {l.hours && l.hours > 0 ? `${l.hours.toFixed(1)}` : '—'}
                  </td>
                  <td className="py-2.5 px-4">
                    <HrStatusPill status={s} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                  No attendance records match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Clickable Attendance Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <img
                  src={selectedLog.riderAvatar}
                  alt=""
                  className="w-10 h-10 rounded-full border border-border"
                />
                <div>
                  <h3 className="text-sm font-bold text-foreground">{selectedLog.riderName}</h3>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {selectedLog.date} · {selectedLog.zoneName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-panel-bg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-panel-bg p-3 rounded-xl border border-border text-xs">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Time In</span>
                <p className="font-mono text-foreground font-bold">{selectedLog.timeIn || '—'}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Time Out</span>
                <p className="font-mono text-foreground font-bold">{selectedLog.timeOut || '—'}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Shift Hours</span>
                <p className="font-mono text-foreground font-bold">{selectedLog.hours ? `${selectedLog.hours.toFixed(1)} hrs` : '—'}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Status</span>
                <div>
                  <HrStatusPill status={deriveHrStatus(selectedLog)} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono font-bold text-muted-foreground">Biometrics & GPS Metadata</span>
              <div className="p-3 bg-white border border-border rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Auth Method:</span>
                  <VerificationBadge source={selectedLog.source} lat={selectedLog.lat} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Engine:</span>
                  <span className="font-mono text-foreground">face-api.js + MediaPipe</span>
                </div>
                {selectedLog.lat && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last Coordinates:</span>
                    <span className="font-mono text-foreground">
                      {selectedLog.lat.toFixed(4)}, {selectedLog.lng?.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover transition cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .hr-select {
          height: 32px;
          padding: 0 28px 0 10px;
          background-color: #FFFFFF;
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--foreground);
          font-size: 12px;
          outline: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .hr-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-ring); }
      `}</style>
    </div>
  );
}
