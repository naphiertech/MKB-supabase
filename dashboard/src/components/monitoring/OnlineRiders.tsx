import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Users as UsersIcon } from
'lucide-react';
import type { Rider, RiderStatus, Zone } from '../../services/mockData';
import { useNow, relativeTime } from '../../hooks/useNow';
interface OnlineRidersProps {
  riders: Rider[];
  zones: Zone[];
  onSelectRider?: (riderId: string) => void;
}
const FILTERS: {
  key: 'all' | RiderStatus;
  label: string;
}[] = [
{
  key: 'all',
  label: 'All'
},
{
  key: 'active',
  label: 'Active'
},
{
  key: 'idle',
  label: 'Idle'
},
{
  key: 'violation',
  label: 'Violation'
}];

export function OnlineRiders({
  riders,
  zones,
  onSelectRider
}: OnlineRidersProps) {
  const [filter, setFilter] = useState<'all' | RiderStatus>('all');
  const [open, setOpen] = useState(false);
  const now = useNow();
  const filtered = useMemo(() => {
    const online = riders.filter((r) => r.status !== 'offline');
    return filter === 'all' ? online : online.filter((r) => r.status === filter);
  }, [riders, filter]);
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl flex flex-col h-full min-h-[400px] shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-[#EFEAE2]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 ring-1 ring-emerald-500/25 flex items-center justify-center">
            <UsersIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              Online Riders
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              {filtered.length} of {riders.length}
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] text-xs text-[#1A1410] hover:border-[#db6c00]/30">
            
            {FILTERS.find((f) => f.key === filter)?.label}
            <ChevronDown className="w-3.5 h-3.5 text-[#6B6258]" />
          </button>
          {open &&
          <div className="absolute right-0 mt-1 w-32 bg-white border border-[#EFEAE2] rounded-md shadow-xl z-10 overflow-hidden">
              {FILTERS.map((f) =>
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#FFF1E0] ${filter === f.key ? 'text-[#db6c00] font-semibold' : 'text-[#1A1410]'}`}>
              
                  {f.label}
                </button>
            )}
            </div>
          }
        </div>
      </div>

      <div className="ar-scroll overflow-y-auto flex-1 p-2 space-y-1.5">
        {filtered.length === 0 &&
        <div className="text-center text-sm text-[#6B6258] py-10">
            No riders match filter.
          </div>
        }
        {filtered.map((r) => {
          const zone = zones.find((z) => z.id === r.zoneId);
          const isViolation = r.status === 'violation';
          const ringColor =
          r.status === 'active' ?
          'ring-emerald-500/80' :
          r.status === 'idle' ?
          'ring-amber-500/80' :
          'ring-red-500/80';
          return (
            <button
              key={r.id}
              onClick={() => onSelectRider?.(r.id)}
              className={`group w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#FAFAF7] hover:bg-[#FFF1E0]/60 border border-transparent hover:border-[#EFEAE2] transition ${isViolation ? 'border-l-2 border-l-red-500' : ''}`}>
              
              <div className="relative">
                <img
                  src={r.avatar}
                  alt=""
                  className={`w-9 h-9 rounded-full bg-white ring-2 ${ringColor} ring-offset-2 ring-offset-white`} />
                
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1A1410] truncate">
                    {r.name}
                  </span>
                  {isViolation &&
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold bg-red-50 text-red-600 border border-red-500/30">
                      <AlertTriangle className="w-2.5 h-2.5" /> Out of bounds
                    </span>
                  }
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#6B6258]">
                  <span className="px-1.5 py-0.5 rounded bg-white border border-[#EFEAE2] text-[#1A1410]">
                    {zone?.name ?? '—'}
                  </span>
                  <span className="font-mono">
                    {relativeTime(r.lastPing, now)}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#6B6258] group-hover:text-[#db6c00] transition" />
            </button>);

        })}
      </div>
    </div>);

}