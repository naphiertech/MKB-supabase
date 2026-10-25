import { useMemo } from 'react';
import { Search, Users as UsersIcon, X } from 'lucide-react';
import type { Rider, RiderStatus, Zone } from '../../services/types';
import type { AttendancePresentationLog } from '../../services/attendance/attendanceContextService';
import { relativeTime, useNow } from '../../hooks/useNow';
import { usePagedRows } from '../../hooks/usePagedRows';
import { StatusBadge } from '../common/DashboardPrimitives';
import { TablePagination } from '../common/TablePagination';

interface HRLiveFleetTableProps {
  riders: Rider[];
  zones: Zone[];
  todayLogs: AttendancePresentationLog[];
  zoneId: string;
  onZoneClear: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  status: RiderStatus | null;
  onStatusChange: (status: RiderStatus | null) => void;
  onSelectRider?: (riderId: string) => void;
}

const STATUS_FILTERS: { key: RiderStatus | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'active', label: 'Online' },
  { key: 'idle', label: 'Idle' },
  { key: 'violation', label: 'Violation' },
  { key: 'offline', label: 'Offline' },
];

const STATUS_RANK: Record<RiderStatus, number> = { violation: 0, idle: 1, active: 2, offline: 3 };
const STATUS_LABEL: Record<RiderStatus, string> = {
  active: 'Online',
  idle: 'Idle',
  violation: 'Violation',
  offline: 'Offline',
};
const STATUS_TONE: Record<RiderStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  idle: 'warning',
  violation: 'danger',
  offline: 'neutral',
};

export function HRLiveFleetTable({
  riders,
  zones,
  todayLogs,
  zoneId,
  onZoneClear,
  search,
  onSearchChange,
  status,
  onStatusChange,
  onSelectRider,
}: HRLiveFleetTableProps) {
  const now = useNow(30_000);

  const hoursByRider = useMemo(() => {
    const m = new Map<string, number>();
    todayLogs.forEach((l) => m.set(l.riderId, l.hours));
    return m;
  }, [todayLogs]);

  const zoneName = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);

  const scoped = useMemo(() => {
    const query = search.trim().toLowerCase();
    return riders.filter((r) => {
      if (zoneId !== 'all' && r.zoneId !== zoneId) return false;
      if (query && !r.name.toLowerCase().includes(query) && !r.riderCode.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [riders, zoneId, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<RiderStatus, number> = { active: 0, idle: 0, violation: 0, offline: 0 };
    scoped.forEach((r) => {
      counts[r.status] += 1;
    });
    return counts;
  }, [scoped]);

  const filtered = useMemo(
    () =>
      scoped
        .filter((r) => status === null || r.status === status)
        .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name)),
    [scoped, status],
  );

  const paging = usePagedRows(filtered, `${zoneId}|${search}|${status ?? 'all'}`);

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center">
            <UsersIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Live Fleet</div>
            <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
              {filtered.length} of {riders.length} riders
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-panel-bg">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-white border border-border w-56 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search rider or code..."
            aria-label="Search riders"
            className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none flex-1 min-w-0"
          />
        </div>
        {zoneId !== 'all' && (
          <button
            type="button"
            onClick={onZoneClear}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-accent border border-primary/30 text-xs font-semibold text-accent-foreground cursor-pointer"
          >
            Zone: {zoneName.get(zoneId) ?? zoneId}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-border" role="group" aria-label="Fleet status">
        {STATUS_FILTERS.map((f) => {
          const active = status === f.key;
          const count = f.key === null ? scoped.length : statusCounts[f.key];
          return (
            <button
              key={f.label}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusChange(f.key)}
              className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full border text-xs font-semibold transition cursor-pointer ${
                active
                  ? 'bg-primary border-primary text-white'
                  : 'bg-white border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
              }`}
            >
              {f.label}
              <span className={`font-mono tabular-nums ${active ? 'text-white/90' : 'text-muted-foreground'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="table-scroll-region" role="region" aria-label="Live fleet roster" tabIndex={0}>
        <table className="data-table-wide w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border">
              <th className="font-semibold py-2.5 px-4">Rider</th>
              <th className="font-semibold py-2.5 px-4">Zone</th>
              <th className="font-semibold py-2.5 px-4">Status</th>
              <th className="font-semibold py-2.5 px-4">Last ping</th>
              <th className="font-semibold py-2.5 px-4">Speed</th>
              <th className="font-semibold py-2.5 px-4">Hours today</th>
            </tr>
          </thead>
          <tbody>
            {paging.items.map((r, idx) => {
              const hours = hoursByRider.get(r.id);
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelectRider?.(r.id)}
                  className={`border-b border-border/70 last:border-0 hover:bg-accent/40 transition cursor-pointer ${
                    idx % 2 === 1 ? 'bg-panel-bg/40' : ''
                  }`}
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <img src={r.avatar} alt="" className="w-7 h-7 rounded-full bg-white border border-border shrink-0" />
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-semibold truncate">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.riderCode}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-panel-bg text-foreground border border-border">
                      {(r.zoneId && zoneName.get(r.zoneId)) || 'Unassigned'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <StatusBadge tone={STATUS_TONE[r.status]} dot>
                      {STATUS_LABEL[r.status]}
                    </StatusBadge>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-muted-foreground tabular-nums">{relativeTime(r.lastPing, now)}</td>
                  <td className="py-2.5 px-4 font-mono text-foreground tabular-nums">
                    {r.status === 'offline' ? '—' : `${Math.round(r.speed)} km/h`}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-foreground tabular-nums font-semibold">
                    {hours && hours > 0 ? hours.toFixed(1) : '—'}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                  No riders match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        from={paging.from}
        to={paging.to}
        total={paging.total}
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        onPageSizeChange={paging.setPageSize}
        noun="riders"
      />
    </div>
  );
}
