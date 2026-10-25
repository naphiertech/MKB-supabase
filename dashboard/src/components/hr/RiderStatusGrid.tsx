import { useMemo, useState } from 'react';
import { Users as UsersIcon, Search } from 'lucide-react';
import type { Rider, Zone } from '../../services/types';
import type { AttendancePresentationLog } from '../../services/attendance/attendanceContextService';
import { RiderStatusCard } from './RiderStatusCard';

interface RiderStatusGridProps {
  riders: Rider[];
  zones: Zone[];
  todayLogs: AttendancePresentationLog[];
  onSelectRider?: (riderId: string) => void;
  gridClassName?: string;
}

type Filter = 'all' | 'online' | 'idle' | 'violation' | 'offline';

const FILTERS: {
  key: Filter;
  label: string;
}[] = [
  { key: 'all', label: 'All' },
  { key: 'online', label: 'Online' },
  { key: 'idle', label: 'Idle' },
  { key: 'violation', label: 'Violation' },
  { key: 'offline', label: 'Offline' },
];

export function RiderStatusGrid({
  riders,
  zones,
  todayLogs,
  onSelectRider,
  gridClassName = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-2 gap-2.5',
}: RiderStatusGridProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const hoursByRider = useMemo(() => {
    const m = new Map<string, number>();
    todayLogs.forEach((l) => m.set(l.riderId, l.hours));
    return m;
  }, [todayLogs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return riders.filter((r) => {
      if (filter === 'online' && r.status !== 'active') return false;
      if (filter !== 'all' && filter !== 'online' && r.status !== filter) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.riderCode.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [riders, filter, query]);

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 justify-between p-3.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center shrink-0">
            <UsersIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Rider Status
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {filtered.length} of {riders.length} riders
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-panel-bg border border-border w-44 sm:w-48 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rider..."
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none flex-1 min-w-0"
            />
          </div>
          <div className="inline-flex p-0.5 rounded-md bg-panel-bg border border-border">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`px-2 py-1 text-[11px] rounded font-semibold transition cursor-pointer ${
                  filter === f.key
                    ? 'bg-white text-primary shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3.5 max-h-[460px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-xs text-muted-foreground">
            No riders match your filters.
          </div>
        ) : (
          <div className={gridClassName}>
            {filtered.map((r) => {
              const zone = zones.find((z) => z.id === r.zoneId);
              const hours = hoursByRider.get(r.id) ?? null;
              return (
                <RiderStatusCard
                  key={r.id}
                  rider={r}
                  zone={zone}
                  hoursToday={hours}
                  onClick={onSelectRider}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
