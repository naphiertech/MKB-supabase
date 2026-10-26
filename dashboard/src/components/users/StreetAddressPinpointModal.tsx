import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, Search, Loader2, Check, Navigation } from 'lucide-react';
import { STREET_BASEMAP, useMapResizeObserver } from '../maps/mapProviders';

interface StreetAddressPinpointModalProps {
  open: boolean;
  onClose: () => void;
  currentStreetAddress: string;
  barangay?: string;
  city?: string;
  onConfirmAddress: (address: string) => void;
}

const DEFAULT_ZAMBOANGA_CENTER: [number, number] = [6.9214, 122.0790];

function buildAddressPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'street-address-pin',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#b85a00;color:#ffffff;box-shadow:0 4px 12px rgba(184,90,0,0.5);border:3px solid #ffffff;cursor:grab;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

function MapEventsHandler({
  onLocationSelect,
}: {
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapController({
  center,
}: {
  center: [number, number] | null;
}) {
  const map = useMap();
  useMapResizeObserver();

  useEffect(() => {
    if (center) {
      map.flyTo(center, Math.max(map.getZoom(), 16), { duration: 0.6 });
    }
  }, [center, map]);

  return null;
}

export function StreetAddressPinpointModal({
  open,
  onClose,
  currentStreetAddress,
  barangay,
  city = 'Zamboanga City',
  onConfirmAddress,
}: StreetAddressPinpointModalProps) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [streetInput, setStreetInput] = useState(currentStreetAddress || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingGeocode, setLoadingGeocode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_ZAMBOANGA_CENTER);
  const pinIconRef = useRef<L.DivIcon>(buildAddressPinIcon());

  // Initialize or center when modal opens
  useEffect(() => {
    if (open) {
      setStreetInput(currentStreetAddress || '');
      const initialQuery = [currentStreetAddress, barangay, city].filter(Boolean).join(', ');
      if (initialQuery.trim()) {
        void searchLocation(initialQuery, false);
      }
    }
  }, [open, currentStreetAddress, barangay, city]);

  const searchLocation = async (queryText: string, shouldSetStreetInput = true) => {
    if (!queryText.trim()) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryText + ', Philippines')}&format=json&limit=1&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MKB-Street-Picker' } });
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        setPosition([lat, lon]);
        setMapCenter([lat, lon]);

        if (shouldSetStreetInput) {
          const addr = item.address || {};
          const road = addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood || item.display_name.split(',')[0];
          if (road) setStreetInput(road.trim());
        }
      }
    } catch (err) {
      console.warn('Geocoding search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleMapClick = async (lat: number, lng: number) => {
    setPosition([lat, lng]);
    setLoadingGeocode(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MKB-Street-Picker' } });
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const houseNumber = addr.house_number ? `${addr.house_number} ` : '';
        const road = addr.road || addr.pedestrian || addr.residential || addr.path || addr.subdivision;
        const fallback = data.display_name ? data.display_name.split(',')[0] : '';
        const finalStreet = road ? `${houseNumber}${road}` : fallback;
        if (finalStreet) {
          setStreetInput(finalStreet.trim());
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err);
    } finally {
      setLoadingGeocode(false);
    }
  };

  const handleConfirm = () => {
    if (streetInput.trim()) {
      onConfirmAddress(streetInput.trim());
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-panel-bg">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Pinpoint Street Address</h3>
              <p className="text-[11px] text-muted-foreground">Click anywhere on the map to pinpoint rider street location</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pinpoint map"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-border/60 hover:text-foreground transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-border bg-white flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void searchLocation(searchQuery);
                }
              }}
              placeholder={`Search street name or landmark in ${city}...`}
              className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-border bg-panel-bg/30 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void searchLocation(searchQuery)}
            disabled={searching || !searchQuery.trim()}
            className="h-9 px-3.5 rounded-xl bg-panel-bg border border-border text-xs font-semibold text-foreground hover:bg-border/40 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Navigation className="w-3.5 h-3.5 text-primary" />}
            <span>Locate</span>
          </button>
        </div>

        {/* Map View */}
        <div className="relative w-full h-[380px] sm:h-[440px] bg-slate-100">
          <MapContainer
            center={mapCenter}
            zoom={15}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution={STREET_BASEMAP.attribution}
              url={STREET_BASEMAP.url}
              maxNativeZoom={19}
              maxZoom={20}
            />
            <ZoomControl position="bottomright" />
            <MapController center={position || mapCenter} />
            <MapEventsHandler onLocationSelect={handleMapClick} />
            {position && (
              <Marker position={position} icon={pinIconRef.current} />
            )}
          </MapContainer>

          {/* Floating Instructions Banner */}
          <div className="absolute top-3 left-3 right-3 z-1000 pointer-events-none">
            <div className="mx-auto max-w-sm rounded-lg bg-black/75 px-3 py-1.5 text-center text-[11px] font-medium text-white shadow-md backdrop-blur-xs">
              Click on the rider&apos;s street or house location to place marker
            </div>
          </div>

          {loadingGeocode && (
            <div className="absolute bottom-3 left-3 z-1000 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg border border-border backdrop-blur-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>Detecting street address...</span>
            </div>
          )}
        </div>

        {/* Footer & Address Confirmation */}
        <div className="p-4 border-t border-border bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Detected Street Address
            </label>
            <input
              type="text"
              value={streetInput}
              onChange={(e) => setStreetInput(e.target.value)}
              placeholder="e.g. NFA Street, Block 3 Lot 5..."
              className="w-full h-9 px-3 text-xs font-semibold rounded-lg border border-border bg-panel-bg/30 focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-foreground"
            />
          </div>
          <div className="flex items-center gap-2 justify-end pt-1 sm:pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-panel-bg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!streetInput.trim()}
              className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm Street Address</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
