import React, { useMemo, useState } from 'react';
import { Users as UsersIcon, Search } from 'lucide-react';
import type { Rider, Zone, AttendanceLog } from '../../services/mockData';
import { RiderStatusCard } from './RiderStatusCard';
interface RiderStatusGridProps {
  riders: Rider[];
  zones: Zone[];
  todayLogs: AttendanceLog[];
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
    <div className="bg-white border border-[#EFEAE2] rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-3 justify-between p-4 border-b border-[#EFEAE2]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/25 flex items-center justify-center">
            <UsersIcon className="w-4 h-4 text-[#db6c00]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Rider Status
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              {filtered.length} of {riders.length} riders
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-2.5 h-8 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] w-56 focus-within:border-[#db6c00]/40 focus-within:ring-2 focus-within:ring-[#db6c00]/15 transition">
            <Search className="w-3.5 h-3.5 text-[#6B6258]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rider or code…"
              className="bg-transparent text-xs text-[#1A1410] placeholder:text-[#6B6258]/70 outline-none flex-1" />
            
          </div>
          <div className="inline-flex p-0.5 rounded-md bg-[#FAFAF7] border border-[#EFEAE2]">
            {FILTERS.map((f) =>
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 text-xs rounded font-semibold transition ${filter === f.key ? 'bg-white text-[#db6c00] shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
              
                {f.label}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {filtered.length === 0 ?
        <div className="text-center py-12 text-sm text-[#6B6258]">
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