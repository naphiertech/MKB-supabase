import { useMemo, useState } from 'react';
import { Search, Pencil, ChevronRight, Plus } from 'lucide-react';
import type { Zone } from '../../services/types';
import { formatLatLng } from '../../lib/geofenceUtils';

interface ZoneListPanelProps {
  zones: Zone[];
  riderCounts: Record<string, number>;
  activeZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  onEdit: (zoneId: string) => void;
  onAdd?: () => void;
}

export function ZoneListPanel({
  zones,
  riderCounts,
  activeZoneId,
  onSelectZone,
  onEdit,
  onAdd
}: ZoneListPanelProps) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter((z) => z.name.toLowerCase().includes(q));
  }, [zones, query]);
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl shadow-sm flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[#EFEAE2]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              All Zones
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              {filtered.length} of {zones.length} shown
            </div>
          </div>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-xs font-semibold shadow-sm transition hover:scale-105 active:scale-95">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Zone</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] focus-within:border-[#db6c00]/40 focus-within:ring-2 focus-within:ring-[#db6c00]/15 transition">
          <Search className="w-4 h-4 text-[#6B6258]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search zones…"
            className="bg-transparent text-sm text-[#1A1410] placeholder:text-[#6B6258]/70 outline-none flex-1" />
          
        </div>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[480px] lg:max-h-[540px] p-2">
        {filtered.length === 0 &&
        <div className="text-center py-12 text-sm text-[#6B6258]">
            No zones match “{query}”.
          </div>
        }
        <ul className="space-y-1.5">
          {filtered.map((zone) => {
            const active = zone.id === activeZoneId;
            const status = zone.status ?? 'active';
            const riders = riderCounts[zone.id] ?? 0;
            return (
              <li key={zone.id}>
                <div
                  className={`relative rounded-lg border transition cursor-pointer overflow-hidden ${active ? 'border-[#db6c00]/40 bg-[#FFF1E0]' : 'border-[#EFEAE2] bg-white hover:bg-[#FAFAF7]'}`}
                  onClick={() => onSelectZone(active ? null : zone.id)}>
                  
                  {active &&
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#db6c00]" />
                  }
                  <div className="flex items-start gap-3 p-3">
                    <span
                      className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow"
                      style={{
                        background: zone.color
                      }} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#1A1410] truncate">
                          {zone.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          
                          <span
                            className={`w-1 h-1 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          
                          {status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-[#6B6258] mt-0.5">
                        {zone.radius}m radius
                      </div>
                      <div className="text-[10px] text-[#6B6258] font-mono mt-0.5 truncate">
                        {formatLatLng(zone.center)}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#FFF1E0] border border-[#db6c00]/25 text-[10px] font-semibold text-[#b85a00]">
                        {riders} {riders === 1 ? 'rider' : 'riders'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(zone.id);
                        }}
                        className="p-1.5 rounded-md text-[#6B6258] hover:text-[#db6c00] hover:bg-white transition"
                        aria-label={`Edit ${zone.name}`}
                        title="Edit zone">
                        
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {active &&
                      <ChevronRight className="w-3.5 h-3.5 text-[#db6c00]" />
                      }
                    </div>
                  </div>
                </div>
              </li>);
          })}
        </ul>
      </div>
    </div>);
}
