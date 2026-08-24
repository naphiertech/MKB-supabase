import { useState } from 'react';
import { ChevronDown, Search, X, Undo, Trash2 } from 'lucide-react';
import type { Rider } from '../../services/types';
import type { Hub } from '../../services/hubs/hubService';

interface ZoneFormPanelProps {
  zoneName: string;
  setZoneName: (name: string) => void;
  radius: number;
  setRadius: (r: number) => void;
  status: 'active' | 'inactive';
  setStatus: (s: 'active' | 'inactive') => void;
  selectedRiders: string[];
  setSelectedRiders: (ids: string[] | ((prev: string[]) => string[])) => void;
  riders: Rider[];
  hubs: Hub[];
  selectedHubId: string;
  setSelectedHubId: (hubId: string) => void;
  pin: { lat: number; lng: number } | null;
  errors: {
    hub?: string;
    zoneName?: string;
    pin?: string;
    polygon?: string;
  };
  onSave: () => void;
  onCancel: () => void;
  isEditMode: boolean;
  zoneType: 'circle' | 'polygon';
  setZoneType: (t: 'circle' | 'polygon') => void;
  polygonCoords: [number, number][];
  setPolygonCoords: (coords: [number, number][] | ((prev: [number, number][]) => [number, number][])) => void;
  color: string;
  setColor: (c: string) => void;
  usedColors: string[];
}

const AVAILABLE_COLORS = [
  { value: '#db6c00', label: 'Orange', bg: 'bg-primary', ring: 'ring-primary' },
  { value: '#2563EB', label: 'Blue', bg: 'bg-[#2563EB]', ring: 'ring-[#2563EB]' },
  { value: '#059669', label: 'Green', bg: 'bg-[#059669]', ring: 'ring-[#059669]' },
  { value: '#DC2626', label: 'Red', bg: 'bg-[#DC2626]', ring: 'ring-[#DC2626]' },
  { value: '#7C3AED', label: 'Purple', bg: 'bg-[#7C3AED]', ring: 'ring-[#7C3AED]' },
  { value: '#D97706', label: 'Yellow', bg: 'bg-[#D97706]', ring: 'ring-[#D97706]' },
  { value: '#0D9488', label: 'Teal', bg: 'bg-[#0D9488]', ring: 'ring-[#0D9488]' },
  { value: '#EC4899', label: 'Pink', bg: 'bg-[#EC4899]', ring: 'ring-[#EC4899]' }
];

export function ZoneFormPanel({
  zoneName,
  setZoneName,
  radius,
  setRadius,
  status,
  setStatus,
  selectedRiders,
  setSelectedRiders,
  riders,
  hubs,
  selectedHubId,
  setSelectedHubId,
  pin,
  errors,
  onSave,
  onCancel,
  isEditMode,
  zoneType,
  setZoneType,
  polygonCoords,
  setPolygonCoords,
  color,
  setColor,
  usedColors,
}: ZoneFormPanelProps) {
  const [riderDropdownOpen, setRiderDropdownOpen] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');

  const handleUndoPoint = () => {
    setPolygonCoords((prev) => prev.slice(0, -1));
  };

  const handleClearPoints = () => {
    setPolygonCoords([]);
  };

  return (
    <div className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm sm:h-[585px] lg:h-[645px]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex justify-between items-start flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground tracking-tight">
            {isEditMode ? 'Edit Zone' : 'Add Zone'}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {isEditMode ? 'Adjust bounds and assignments' : 'Define new Zamboanga City zone'}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-panel-bg transition-colors"
          title="Cancel editing"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        {/* Toggle Zone Type */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase block mb-1.5 font-mono">
            Geofence Type
          </label>
          <div className="flex gap-2">
            {(['circle', 'polygon'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setZoneType(type)}
                className={`flex-1 py-1.5 rounded-lg text-xs border font-semibold transition-all capitalize ${
                  zoneType === type
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border text-muted-foreground hover:bg-panel-bg'
                }`}
              >
                {type} geofence
              </button>
            ))}
          </div>
        </div>

        {/* Helper Alert for Map Interactions */}
        {zoneType === 'circle' ? (
          <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
            pin 
              ? 'bg-emerald-50/50 border-emerald-500/20 text-emerald-900' 
              : errors.pin 
                ? 'bg-red-50 border-red-500/20 text-red-900 animate-pulse'
                : 'bg-accent border-primary/20 text-accent-foreground'
          }`}>
            {pin ? (
              <p className="font-semibold flex items-center gap-1.5 font-mono text-[11px]">
                <span>📍 Pin Placed:</span>
                <span>{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</span>
              </p>
            ) : (
              <p className="font-medium">
                👉 Click anywhere on the left map to set the center coordinates of this circle zone.
              </p>
            )}
          </div>
        ) : (
          <div className={`p-3 rounded-lg border text-xs leading-relaxed ${
            polygonCoords.length >= 3 
              ? 'bg-emerald-50/50 border-emerald-500/20 text-emerald-900' 
              : errors.polygon 
                ? 'bg-red-50 border-red-500/20 text-red-900 animate-pulse'
                : 'bg-accent border-primary/20 text-accent-foreground'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold font-mono text-[11px]">
                {polygonCoords.length >= 3 
                  ? `Polygon shape: ${polygonCoords.length} points` 
                  : `Points added: ${polygonCoords.length} / 3 minimum`}
              </span>
              {polygonCoords.length > 0 && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleUndoPoint}
                    className={`p-1 rounded transition ${
                      polygonCoords.length >= 3 
                        ? 'hover:bg-emerald-500/10 text-emerald-700' 
                        : 'hover:bg-primary/10 text-primary'
                    }`}
                    title="Undo last point"
                  >
                    <Undo size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearPoints}
                    className="p-1 rounded hover:bg-red-500/10 text-red-700 transition"
                    title="Clear all points"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
            
            <p className="mt-1 text-[10.5px] opacity-80">
              {polygonCoords.length >= 3 
                ? '👉 Click the map to add more corners (4, 5, or more) to shape your custom geofence.' 
                : '👉 Click on the left map to add corners of your custom shape geofence.'}
            </p>
          </div>
        )}

        {!isEditMode && (
          <div>
            <label htmlFor="zone-assigned-hub" className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase block mb-1.5 font-mono">
              Assigned Hub <span className="text-red-600">*</span>
            </label>
            <select
              id="zone-assigned-hub"
              value={selectedHubId}
              onChange={(event) => setSelectedHubId(event.target.value)}
              className={`w-full px-3 py-2 rounded-lg border bg-panel-bg text-xs outline-none transition-all ${
                errors.hub
                  ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/10'
                  : 'border-border focus:border-primary focus:ring-1 focus:ring-primary/10'
              }`}
              required
            >
              <option value="">Select a hub</option>
              {hubs.map((hub) => (
                <option key={hub.id} value={hub.id}>{hub.name}</option>
              ))}
            </select>
            {errors.hub && (
              <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.hub}</p>
            )}
            {hubs.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">No active authorized hubs are available.</p>
            )}
          </div>
        )}

        {/* Zone Name */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase block mb-1.5 font-mono">
            Zone Name
          </label>
          <input
            type="text"
            placeholder="e.g. Talon-Talon"
            value={zoneName}
            onChange={(e) => setZoneName(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border bg-panel-bg text-xs outline-none transition-all ${
              errors.zoneName 
                ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/10' 
                : 'border-border focus:border-primary focus:ring-1 focus:ring-primary/10'
            }`}
          />
          {errors.zoneName && (
            <p className="text-[11px] text-red-600 mt-1 font-medium">{errors.zoneName}</p>
          )}
        </div>

        {/* Zone Color Selector */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase block mb-1.5 font-mono">
            Geofence Color
          </label>
          <div className="flex flex-wrap gap-2.5">
            {AVAILABLE_COLORS.map((c) => {
              const isUsed = usedColors.includes(c.value);
              const isSelected = color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  disabled={isUsed}
                  onClick={() => setColor(c.value)}
                  title={isUsed ? `${c.label} (Used by another zone)` : c.label}
                  className={`w-8 h-8 rounded-full ${c.bg} relative flex items-center justify-center transition-all ${
                    isUsed 
                      ? 'opacity-20 cursor-not-allowed border border-dashed border-gray-400' 
                      : 'hover:scale-110 cursor-pointer shadow-sm active:scale-95'
                  } ${
                    isSelected ? `ring-2 ring-offset-2 ${c.ring}` : ''
                  }`}
                >
                  {isSelected && (
                    <span className="w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                  {isUsed && (
                    <span className="text-[8px] font-bold text-white">🔒</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[9.5px] text-[#888] mt-1 font-mono">
            * Unique color required. Locked colors are used by other zones.
          </p>
        </div>

        {/* Radius slider (Circle geofences only) */}
        {zoneType === 'circle' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase font-mono">
                Radius
              </label>
              <span className="text-[11px] text-primary font-mono font-semibold">
                {radius} m ({(radius / 1000).toFixed(2)} km)
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={5000}
              step={50}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[9px] text-[#AAA] font-mono mt-0.5">
              <span>100m</span>
              <span>5000m</span>
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase block mb-1.5 font-mono">
            Status
          </label>
          <div className="flex gap-2">
            {(['active', 'inactive'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`flex-1 py-1.5 rounded-lg text-xs border font-semibold transition-all capitalize ${
                  status === s
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border text-muted-foreground hover:bg-panel-bg'
                }`}
              >
                {s === 'active' && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 mb-0.5" />
                )}
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Assign Riders */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground tracking-widest uppercase font-mono">
              Assign Riders
            </label>
            <span className="text-[10px] text-muted-foreground font-mono">
              {selectedRiders.length} selected
            </span>
          </div>

          <button
            type="button"
            onClick={() => setRiderDropdownOpen((o) => !o)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-panel-bg text-xs text-left flex items-center justify-between hover:border-primary transition-colors"
          >
            <span className="text-muted-foreground truncate">
              {selectedRiders.length === 0
                ? 'Select riders...'
                : `${selectedRiders.length} rider${selectedRiders.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronDown
              size={14}
              className={`text-muted-foreground transition-transform duration-200 ${riderDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {riderDropdownOpen && (
            <div className="absolute top-[102%] left-0 right-0 z-50 border border-border rounded-lg bg-white overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-panel-bg">
                <Search size={12} className="text-[#AAA]" />
                <input
                  type="text"
                  placeholder="Search riders..."
                  value={riderSearch}
                  onChange={(e) => setRiderSearch(e.target.value)}
                  className="flex-1 text-xs outline-none bg-transparent text-foreground placeholder:text-[#AAA]"
                />
              </div>
              <div className="max-h-[160px] overflow-y-auto custom-scrollbar">
                {riders
                  .filter((r) =>
                    r.name.toLowerCase().includes(riderSearch.toLowerCase()) ||
                    r.riderCode.toLowerCase().includes(riderSearch.toLowerCase())
                  )
                  .map((rider) => (
                    <label
                      key={rider.id}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRiders.includes(rider.id)}
                        onChange={() => {
                          setSelectedRiders((prev) =>
                            prev.includes(rider.id)
                              ? prev.filter((id) => id !== rider.id)
                              : [...prev, rider.id]
                          );
                        }}
                        className="accent-primary flex-shrink-0"
                      />
                      <img
                        src={rider.avatar}
                        alt={rider.name}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-border"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground truncate font-semibold">
                          {rider.name}
                        </p>
                        <p className="text-[9px] font-mono text-[#888]">
                          {rider.riderCode}
                        </p>
                      </div>
                    </label>
                  ))}
                {riders.filter((r) => r.name.toLowerCase().includes(riderSearch.toLowerCase()) || r.riderCode.toLowerCase().includes(riderSearch.toLowerCase())).length === 0 && (
                  <div className="text-center py-4 text-xs text-[#888]">
                    {!isEditMode && !selectedHubId ? 'Select a hub first.' : 'No riders match search.'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0 bg-panel-bg">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-border rounded-lg transition-colors border border-border"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          className="flex-1 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition-colors"
        >
          Save Zone
        </button>
      </div>
    </div>
  );
}
