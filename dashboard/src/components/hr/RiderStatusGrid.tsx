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
}
type Filter = 'all' | 'online' | 'idle' | 'violation' | 'offline';
const FILTERS: {
  key: Filter;
  label: string;
}[] = [
{
  key: 'all',
  label: 'All'
},
{
  key: 'online',
  label: 'Online'
},
{
  key: 'idle',
  label: 'Idle'
},
{
  key: 'violation',
  label: 'Violation'
},
{
  key: 'offline',
  label: 'Offline'
}];

export function RiderStatusGrid({
  riders,
  zones,
  todayLogs,
  onSelectRider
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
      if (filter !== 'all' && filter !== 'online' && r.status !== filter)
      return false;
      if (
      q &&
      !r.name.toLowerCase().includes(q) &&
      !r.riderCode.toLowerCase().includes(q))

      return false;
      return true;
    });
  }, [riders, filter, query]);
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-3 justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/25 flex items-center justify-center">
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
          <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-panel-bg border border-border w-56 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rider or code…"
              className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none flex-1" />
            
          </div>
          <div className="inline-flex p-0.5 rounded-md bg-panel-bg border border-border">
            {FILTERS.map((f) =>
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 text-xs rounded font-semibold transition ${filter === f.key ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              
                {f.label}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {filtered.length === 0 ?
        <div className="text-center py-12 text-sm text-muted-foreground">
            No riders match your filters.
          </div> :

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filtered.map((r) => {
            const zone = zones.find((z) => z.id === r.zoneId);
            const hours = hoursByRider.get(r.id) ?? null;
            return (
              <RiderStatusCard
                key={r.id}
                rider={r}
                zone={zone}
                hoursToday={hours}
                onClick={onSelectRider} />);


          })}
          </div>
        }
      </div>
    </div>);

}
