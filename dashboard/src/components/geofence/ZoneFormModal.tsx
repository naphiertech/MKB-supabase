import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, ChevronDown, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { Zone, Rider } from '../../services/mockData';
import type { ZoneInput } from '../../services/geofenceService';
import { clamp } from '../../lib/geofenceUtils';
interface ZoneFormModalProps {
  open: boolean;
  onClose: () => void;
  zone: Zone | null; // null = create mode
  riders: Rider[];
  initialRiderIds: string[];
  onSave: (input: ZoneInput) => void;
  onDelete?: () => void;
}
const DEFAULT_LAT = 6.925;
const DEFAULT_LNG = 122.078;
export function ZoneFormModal({
  open,
  onClose,
  zone,
  riders,
  initialRiderIds,
  onSave,
  onDelete
}: ZoneFormModalProps) {
  const editing = !!zone;
  const [name, setName] = useState('');
  const [lat, setLat] = useState<number>(DEFAULT_LAT);
  const [lng, setLng] = useState<number>(DEFAULT_LNG);
  const [radius, setRadius] = useState<number>(1000);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [riderIds, setRiderIds] = useState<string[]>([]);
  const [riderSearch, setRiderSearch] = useState('');
  const [riderOpen, setRiderOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  // Sync state when zone changes / modal opens
  useEffect(() => {
    if (!open) return;
    setNameError(null);
    setRiderSearch('');
    setRiderOpen(false);
    if (zone) {
      setName(zone.name);
      setLat(zone.center[0]);
      setLng(zone.center[1]);
      setRadius(zone.radius);
      setStatus(zone.status ?? 'active');
      setRiderIds(initialRiderIds);
    } else {
      setName('');
      setLat(DEFAULT_LAT);
      setLng(DEFAULT_LNG);
      setRadius(1000);
      setStatus('active');
      setRiderIds([]);
    }
  }, [open, zone, initialRiderIds]);
  const filteredRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    if (!q) return riders;
    return riders.filter(
      (r) =>
      r.name.toLowerCase().includes(q) ||
      r.riderCode.toLowerCase().includes(q)
    );
  }, [riders, riderSearch]);
  const selectedRiders = useMemo(
    () =>
    riderIds.
    map((id) => riders.find((r) => r.id === id)).
    filter((r): r is Rider => !!r),
    [riderIds, riders]
  );
  function toggleRider(id: string) {
    setRiderIds((prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function handleSave() {
    if (!name.trim()) {
      setNameError('Zone name is required');
      return;
    }
    onSave({
      name: name.trim(),
      lat,
      lng,
      radius,
      status,
      riderIds
    });
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit Zone · ${zone?.name}` : 'Add Zone'}
      subtitle={
      editing ?
      'Adjust boundaries, status, and assigned riders.' :
      'Define a new operational boundary in Zamboanga City.'
      }
      size="lg">
      
      <div className="space-y-5">
        {/* Zone name */}
        <Field label="Zone Name" error={nameError ?? undefined}>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g. Talon-Talon"
            className={`w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border text-sm text-[#1A1410] placeholder:text-[#6B6258]/70 outline-none transition ${nameError ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-200' : 'border-[#EFEAE2] focus:border-[#db6c00]/40 focus:ring-2 focus:ring-[#db6c00]/15'}`} />
          
        </Field>

        {/* Coordinates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Center Latitude">
            <input
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00]/40 focus:ring-2 focus:ring-[#db6c00]/15 transition" />
            
          </Field>
          <Field label="Center Longitude">
            <input
              type="number"
              step="0.0001"
              value={lng}
              onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
              className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00]/40 focus:ring-2 focus:ring-[#db6c00]/15 transition" />
            
          </Field>
        </div>

        {/* Radius slider + input */}
        <Field
          label="Radius"
          hint={`${radius} m · ${(radius / 1000).toFixed(2)} km`}>
          
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={100}
              max={5000}
              step={50}
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              className="flex-1 ar-range"
              style={{
                accentColor: '#db6c00'
              }} />
            
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={radius}
                onChange={(e) =>
                setRadius(
                  clamp(parseInt(e.target.value, 10) || 100, 100, 5000)
                )
                }
                className="w-24 h-9 px-2 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00]/40 focus:ring-2 focus:ring-[#db6c00]/15 transition text-right tabular-nums" />
              
              <span className="text-xs text-[#6B6258] font-mono">m</span>
            </div>
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-[#6B6258] font-mono">
            <span>100 m</span>
            <span>5000 m</span>
          </div>
        </Field>

        {/* Status toggle */}
        <Field label="Status">
          <div className="inline-flex rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] p-0.5">
            {(['active', 'inactive'] as const).map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-4 h-8 rounded-md text-xs font-semibold capitalize transition ${active ? 'bg-white text-[#db6c00] shadow-sm border border-[#db6c00]/30' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
                  
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${active && s === 'active' ? 'bg-emerald-500' : active ? 'bg-gray-400' : 'bg-[#EFEAE2]'}`} />
                    
                    {s}
                  </span>
                </button>);

            })}
          </div>
        </Field>

        {/* Rider multi-select */}
        <Field label="Assign Riders" hint={`${riderIds.length} selected`}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRiderOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] outline-none hover:border-[#db6c00]/30 focus:border-[#db6c00]/40 focus:ring-2 focus:ring-[#db6c00]/15 transition">
              
              <span className="text-[#6B6258]">
                {riderIds.length === 0 ?
                'Select riders…' :
                `${riderIds.length} rider${riderIds.length === 1 ? '' : 's'} selected`}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-[#6B6258] transition-transform ${riderOpen ? 'rotate-180' : ''}`} />
              
            </button>
            {riderOpen &&
            <div className="absolute z-20 mt-1.5 left-0 right-0 bg-white border border-[#EFEAE2] rounded-lg shadow-xl overflow-hidden">
                <div className="p-2 border-b border-[#EFEAE2]">
                  <div className="flex items-center gap-2 px-2 h-8 rounded-md bg-[#FAFAF7] border border-[#EFEAE2]">
                    <Search className="w-3.5 h-3.5 text-[#6B6258]" />
                    <input
                    type="text"
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                    placeholder="Search riders…"
                    autoFocus
                    className="bg-transparent text-xs text-[#1A1410] placeholder:text-[#6B6258]/70 outline-none flex-1" />
                  
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredRiders.length === 0 &&
                <div className="text-center py-6 text-xs text-[#6B6258]">
                      No riders match.
                    </div>
                }
                  {filteredRiders.map((r) => {
                  const checked = riderIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRider(r.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-[#FAFAF7] transition ${checked ? 'bg-[#FFF1E0]/60' : ''}`}>
                      
                        <span
                        className={`w-4 h-4 rounded border flex items-center justify-center transition ${checked ? 'bg-[#db6c00] border-[#db6c00] text-white' : 'border-[#EFEAE2] bg-white'}`}>
                        
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <img
                        src={r.avatar}
                        alt=""
                        className="w-6 h-6 rounded-full bg-[#FAFAF7] border border-[#EFEAE2]" />
                      
                        <div className="flex-1 min-w-0">
                          <div className="text-[#1A1410] truncate">
                            {r.name}
                          </div>
                          <div className="text-[10px] text-[#6B6258] font-mono">
                            {r.riderCode}
                          </div>
                        </div>
                      </button>);

                })}
                </div>
                <div className="border-t border-[#EFEAE2] px-3 py-2 flex items-center justify-between text-[11px]">
                  <span className="text-[#6B6258]">
                    {filteredRiders.length} shown · {riderIds.length} selected
                  </span>
                  <button
                  type="button"
                  onClick={() => setRiderOpen(false)}
                  className="text-[#db6c00] hover:text-[#b85a00] font-semibold">
                  
                    Done
                  </button>
                </div>
              </div>
            }
          </div>

          {/* Selected pills */}
          {selectedRiders.length > 0 &&
          <div className="mt-2.5 flex flex-wrap gap-1.5">
              {selectedRiders.map((r) =>
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-[#FFF1E0] border border-[#db6c00]/30 text-[11px] text-[#b85a00] font-semibold">
              
                  <span className="font-mono">{r.riderCode}</span>
                  <span className="text-[#6B6258] font-normal">·</span>
                  <span className="truncate max-w-[140px]">{r.name}</span>
                  <button
                type="button"
                onClick={() => toggleRider(r.id)}
                className="ml-0.5 w-4 h-4 rounded-full bg-white/70 hover:bg-white text-[#b85a00] flex items-center justify-center"
                aria-label={`Remove ${r.name}`}>
                
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
            )}
            </div>
          }
        </Field>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-[#EFEAE2]">
        <div>
          {editing && onDelete &&
          <button
            type="button"
            onClick={onDelete}
            className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline">
            
              Delete zone
            </button>
          }
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition">
            
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white bg-[#db6c00] hover:bg-[#b85a00] shadow-sm transition">
            
            Save Zone
          </button>
        </div>
      </div>
    </Modal>);

}
function Field({
  label,
  hint,
  error,
  children





}: {label: string;hint?: string;error?: string;children: React.ReactNode;}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
          {label}
        </label>
        {hint && !error &&
        <span className="text-[10px] text-[#6B6258] font-mono">{hint}</span>
        }
        {error &&
        <span className="text-[10px] text-red-600 font-semibold">
            {error}
          </span>
        }
      </div>
      {children}
    </div>);

}