import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Search, Users as UsersIcon, X } from 'lucide-react';
import type { Rider, RiderStatus, Zone } from '../../services/types';
import { useNow, relativeTime } from '../../hooks/useNow';
import { usePagedRows } from '../../hooks/usePagedRows';
import { TablePagination } from '../common/TablePagination';

interface OnlineRidersProps {
  riders: Rider[];
  zones: Zone[];
  /** Zone picked in the fleet overview, or null for every zone. */
  zoneId?: string | null;
  /** Status picked in the fleet overview, or null for riders who are online. */
  status?: RiderStatus | null;
  onClearZone?: () => void;
  onClearStatus?: () => void;
  onSelectRider?: (riderId: string) => void;
}

const ROWS_PER_PAGE = 6;
const STATUS_RANK: Record<RiderStatus, number> = { violation: 0, idle: 1, active: 2, offline: 3 };
const STATUS_TITLE: Record<RiderStatus, string> = {
  active: 'Active Riders',
  idle: 'Idle Riders',
  violation: 'Violation Riders',
  offline: 'Offline Riders',
};
const RING: Record<RiderStatus, string> = {
  active: 'ring-emerald-500/80',
  idle: 'ring-amber-500/80',
  violation: 'ring-red-500/80',
  offline: 'ring-muted-foreground/60',
};

export function OnlineRiders({
  riders,
  zones,
  zoneId = null,
  status = null,
  onClearZone,
  onClearStatus,
  onSelectRider
}: OnlineRidersProps) {
  const [search, setSearch] = useState('');
  const now = useNow();
  const zoneName = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return riders
      .filter((r) => (status === null ? r.status !== 'offline' : r.status === status))
      .filter((r) => zoneId === null || r.zoneId === zoneId)
      .filter((r) => !query || r.name.toLowerCase().includes(query) || r.riderCode.toLowerCase().includes(query))
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name));
  }, [riders, status, zoneId, search]);

  const paging = usePagedRows(filtered, `${status ?? 'online'}|${zoneId ?? 'all'}|${search}`, ROWS_PER_PAGE);

  return (
    <div className="bg-white border border-border rounded-xl flex flex-col shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 ring-1 ring-emerald-500/25 flex items-center justify-center">
            <UsersIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {status === null ? 'Online Riders' : STATUS_TITLE[status]}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
              {filtered.length} of {riders.length}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-border bg-panel-bg">
        <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-white border border-border flex-1 min-w-[140px] focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rider or code..."
            aria-label="Search riders"
            className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none flex-1 min-w-0"
          />
        </div>
        {zoneId !== null && (
          <button
            type="button"
            onClick={onClearZone}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-accent border border-primary/30 text-xs font-semibold text-accent-foreground cursor-pointer"
          >
            {zoneName.get(zoneId) ?? 'Zone'}
            <X className="w-3 h-3" />
          </button>
        )}
        {status !== null && (
          <button
            type="button"
            onClick={onClearStatus}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-accent border border-primary/30 text-xs font-semibold text-accent-foreground cursor-pointer"
          >
            {STATUS_TITLE[status].replace(' Riders', '')}
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-2 space-y-1.5">
        {filtered.length === 0 &&
        <div className="text-center text-sm text-muted-foreground py-10">
            No riders match filter.
          </div>
        }
        {paging.items.map((r) => {
          const isViolation = r.status === 'violation';
          return (
            <button
              key={r.id}
              onClick={() => onSelectRider?.(r.id)}
              className={`group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg bg-panel-bg hover:bg-accent/60 border border-transparent hover:border-border transition ${isViolation ? 'border-l-2 border-l-red-500' : ''}`}>

              <div className="relative">
                <img
                  src={r.avatar}
                  alt=""
                  className={`w-9 h-9 rounded-full bg-white ring-2 ${RING[r.status]} ring-offset-2 ring-offset-white`} />

              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {r.name}
                  </span>
                  {isViolation &&
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-red-50 text-red-600 border border-red-500/30">
                      <AlertTriangle className="w-2.5 h-2.5" /> Out of bounds
                    </span>
                  }
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="px-1.5 py-0.5 rounded bg-white border border-border text-foreground">
                    {(r.zoneId && zoneName.get(r.zoneId)) || '—'}
                  </span>
                  <span className="font-mono">
                    {relativeTime(r.lastPing, now)}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition" />
            </button>);

        })}
      </div>

      <TablePagination
        from={paging.from}
        to={paging.to}
        total={paging.total}
        page={paging.page}
        pageCount={paging.pageCount}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        noun="riders"
      />
    </div>);

}
