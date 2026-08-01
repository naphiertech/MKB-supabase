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
    <div className="bg-white border border-border rounded-xl shadow-sm flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold text-foreground">
              All Zones
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {filtered.length} of {zones.length} shown
            </div>
          </div>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-sm transition hover:scale-105 active:scale-95">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Zone</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-panel-bg border border-border focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15 transition">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search zones…"
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none flex-1" />
          
        </div>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[480px] lg:max-h-[540px] p-2">
        {filtered.length === 0 &&
        <div className="text-center py-12 text-sm text-muted-foreground">
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
                  className={`relative rounded-lg border transition cursor-pointer overflow-hidden ${active ? 'border-primary/40 bg-accent' : 'border-border bg-white hover:bg-panel-bg'}`}
                  onClick={() => onSelectZone(active ? null : zone.id)}>
                  
                  {active &&
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />
                  }
                  <div className="flex items-start gap-3 p-3">
                    <span
                      className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow"
                      style={{
                        background: zone.color
                      }} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {zone.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                          
                          <span
                            className={`w-1 h-1 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          
                          {status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-medium flex items-center gap-1.5">
                        {zone.zone_type === 'polygon' ? (
                          <span className="inline-flex items-center text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">
                            Polygon geofence
                          </span>
                        ) : (
                          `${zone.radius}m radius`
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                        {zone.zone_type === 'polygon' ? 'Centroid: ' : ''}{formatLatLng(zone.center)}
                      </div>
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent border border-primary/25 text-[10px] font-semibold text-accent-foreground">
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
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-white transition"
                        aria-label={`Edit ${zone.name}`}
                        title="Edit zone">
                        
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {active &&
                      <ChevronRight className="w-3.5 h-3.5 text-primary" />
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
