import { useEffect, useState } from 'react';
import { X, ChevronDown, Search } from 'lucide-react';
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import type { Zone, Rider } from '../../services/mockData';
import type { ZoneInput } from '../../services/geofenceService';


const MapClickHandler = ({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) => {
  useMapEvents({
    click(e) {
      onLocationSelect(
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6))
      );
    },
  });
  return null;
};

interface ZoneFormModalProps {
  open: boolean;
  onClose: () => void;
  zone: Zone | null;
  riders: Rider[];
  initialRiderIds: string[];
  onSave: (input: ZoneInput) => void;
  onDelete?: () => void;
}

export function ZoneFormModal({
  open,
  onClose,
  zone: existingZone,
  riders,
  initialRiderIds,
  onSave,
  onDelete,
}: ZoneFormModalProps) {
  const [zoneName, setZoneName] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(1000);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [selectedRiders, setSelectedRiders] = useState<string[]>([]);
  const [riderDropdownOpen, setRiderDropdownOpen] = useState(false);
  const [riderSearch, setRiderSearch] = useState('');
  const [errors, setErrors] = useState<{
    zoneName?: string;
    pin?: string;
  }>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setRiderSearch('');
    setRiderDropdownOpen(false);
    
    if (existingZone) {
      setZoneName(existingZone.name);
      setPin({ lat: existingZone.center[0], lng: existingZone.center[1] });
      setRadius(existingZone.radius);
      setStatus(existingZone.status ?? 'active');
      setSelectedRiders(initialRiderIds);
    } else {
      setZoneName('');
      setPin(null);
      setRadius(1000);
      setStatus('active');
      setSelectedRiders([]);
    }
  }, [open, existingZone, initialRiderIds]);

  const handleSave = () => {
    const newErrors: { zoneName?: string; pin?: string } = {};

    if (!zoneName.trim()) {
      newErrors.zoneName = 'Zone name is required';
    }
    if (!pin) {
      newErrors.pin = 'Please click on the map to set the zone center';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const zoneData = {
      name: zoneName.trim(),
      lat: pin!.lat,
      lng: pin!.lng,
      radius,
      status,
      riderIds: selectedRiders,
    };

    onSave(zoneData);
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[#1A1410]/40 backdrop-blur-sm cursor-default"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="relative flex flex-col w-[90vw] max-w-[860px] max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-start justify-between px-6 py-5 border-b border-[#EFEAE2]">
              <div>
                <h2 className="text-[#1A1410] font-semibold text-base tracking-tight">
                  {existingZone ? `Edit Zone · ${existingZone.name}` : 'Add Zone'}
                </h2>
                <p className="text-xs text-[#6B6258] mt-0.5">
                  {existingZone
                    ? 'Adjust boundaries, status, and assigned riders.'
                    : 'Define a new operational boundary in Zamboanga City.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-[#6B6258] hover:text-[#1A1410] p-1.5 -mr-1.5 -mt-1.5 rounded-md hover:bg-[#FAFAF7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left Column */}
                <div className="flex flex-col gap-5">
                  {/* Zone Name */}
                  <div>
                    <label className="text-xs font-semibold text-[#888] tracking-widest uppercase block mb-1.5">
                      Zone Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Talon-Talon"
                      value={zoneName}
                      onChange={e => setZoneName(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-sm outline-none focus:border-[#db6c00] transition-colors"
                    />
                    {errors.zoneName && (
                      <p className="text-xs text-red-500 mt-1">{errors.zoneName}</p>
                    )}
                  </div>

                  {/* Radius */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[#888] tracking-widest uppercase">
                        Radius
                      </label>
                      <span className="text-xs text-[#888] font-mono">
                        {radius} m · {(radius / 1000).toFixed(2)} km
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={5000}
                      step={50}
                      value={radius}
                      onChange={e => setRadius(Number(e.target.value))}
                      className="w-full accent-[#db6c00]"
                    />
                    <div className="flex justify-between text-[10px] text-[#AAA] font-mono mt-1">
                      <span>100 m</span>
                      <span>5000 m</span>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-xs font-semibold text-[#888] tracking-widest uppercase block mb-1.5">
                      Status
                    </label>
                    <div className="flex gap-2">
                      {(['active', 'inactive'] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(s)}
                          className={`px-4 py-2 rounded-lg text-sm border transition-colors capitalize ${
                            status === s
                              ? 'border-[#db6c00] bg-[#FFF1E0] text-[#db6c00]'
                              : 'border-[#EFEAE2] text-[#888] hover:bg-[#F5F0E8]'
                          }`}
                        >
                          {s === 'active' && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 mb-0.5" />
                          )}
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Assign Riders */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[#888] tracking-widest uppercase">
                        Assign Riders
                      </label>
                      <span className="text-xs text-[#888]">
                        {selectedRiders.length} selected
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRiderDropdownOpen(o => !o)}
                      className="w-full px-3 py-2.5 rounded-lg border border-[#EFEAE2] bg-[#FAFAF7] text-sm text-left flex items-center justify-between hover:border-[#db6c00] transition-colors"
                    >
                      <span className="text-[#888]">
                        {selectedRiders.length === 0
                          ? 'Select riders...'
                          : `${selectedRiders.length} rider${selectedRiders.length === 1 ? '' : 's'} selected`}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-[#888] transition-transform duration-200 ${riderDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {riderDropdownOpen && (
                      <div className="mt-2 border border-[#EFEAE2] rounded-lg bg-white overflow-hidden">
                        <div className="px-3 py-2 border-b border-[#EFEAE2] flex items-center gap-2">
                          <Search size={14} className="text-[#AAA]" />
                          <input
                            type="text"
                            placeholder="Search riders..."
                            value={riderSearch}
                            onChange={e => setRiderSearch(e.target.value)}
                            className="flex-1 text-sm outline-none bg-transparent text-[#1A1410] placeholder:text-[#AAA]"
                          />
                        </div>
                        <div className="max-h-[200px] overflow-y-auto">
                          {riders
                            .filter(r =>
                              r.name.toLowerCase().includes(riderSearch.toLowerCase()) ||
                              r.riderCode.toLowerCase().includes(riderSearch.toLowerCase())
                            )
                            .map(rider => (
                              <label
                                key={rider.id}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#FFF1E0] cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRiders.includes(rider.id)}
                                  onChange={() => {
                                    setSelectedRiders(prev =>
                                      prev.includes(rider.id)
                                        ? prev.filter(id => id !== rider.id)
                                        : [...prev, rider.id]
                                    );
                                  }}
                                  className="accent-[#db6c00] flex-shrink-0"
                                />
                                <img
                                  src={rider.avatar}
                                  alt={rider.name}
                                  className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-[#EFEAE2]"
                                />
                                <div className="min-w-0">
                                  <p className="text-sm text-[#1A1410] truncate font-medium">
                                    {rider.name}
                                  </p>
                                  <p className="text-[10px] font-mono text-[#888]">
                                    {rider.riderCode}
                                  </p>
                                </div>
                              </label>
                            ))}
                          {riders.filter(r => r.name.toLowerCase().includes(riderSearch.toLowerCase()) || r.riderCode.toLowerCase().includes(riderSearch.toLowerCase())).length === 0 && (
                            <div className="text-center py-4 text-xs text-[#888]">
                              No riders match your search.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-xs font-semibold text-[#888] tracking-widest uppercase block">
                      Zone Center
                    </label>
                    <p className="text-xs text-[#AAA] mt-0.5">
                      Click anywhere on the map to place the zone center
                    </p>
                  </div>

                  <div
                    className="rounded-lg overflow-hidden border border-[#EFEAE2] relative z-0"
                    style={{ height: '260px' }}
                  >
                    <MapContainer
                      center={pin ? [pin.lat, pin.lng] : [6.9214, 122.0790]}
                      zoom={13}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        attribution="&copy; CARTO"
                      />
                      <MapClickHandler
                        onLocationSelect={(lat, lng) => setPin({ lat, lng })}
                      />
                      {pin && (
                        <>
                          <Marker position={[pin.lat, pin.lng]} />
                          <Circle
                            center={[pin.lat, pin.lng]}
                            radius={radius}
                            pathOptions={{
                              color: '#db6c00',
                              fillColor: '#db6c00',
                              fillOpacity: 0.15,
                              dashArray: '6 4',
                              weight: 2,
                            }}
                          />
                        </>
                      )}
                    </MapContainer>
                  </div>

                  <p className="text-xs font-mono text-[#888]">
                    {pin
                      ? `📍 ${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}`
                      : 'No location selected — click the map'}
                  </p>

                  {errors.pin && (
                    <p className="text-xs text-red-500 mt-0.5">
                      {errors.pin}
                    </p>
                  )}
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-[#EFEAE2] bg-white">
              <div>
                {existingZone && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                  >
                    Delete zone
                  </button>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-[#888] hover:text-[#1A1410] hover:bg-[#F5F0E8] rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#db6c00] hover:bg-[#c45f00] rounded-lg shadow-sm transition-colors"
                >
                  Save Zone
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}