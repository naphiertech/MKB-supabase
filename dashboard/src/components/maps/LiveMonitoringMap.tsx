import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Eye, EyeOff, Crosshair, Tag, TagsIcon } from 'lucide-react';
import type { Rider, Zone } from '../../services/types';
import { buildRiderIcon } from './RiderMarker';
import { GeofenceCircle } from './GeofenceCircle';
import { reverseGeocode } from '../../lib/apiService';
interface LiveMonitoringMapProps {
  riders: Rider[];
  zones: Zone[];
  height?: string;
  focusRiderId?: string | null;
  onMarkerClick?: (riderId: string) => void;
  compact?: boolean;
}
const ZAMBOANGA_CENTER: [number, number] = [6.925, 122.078];
const TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
    '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
    subdomains: 'abcd'
  },
  satellite: {
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
    subdomains: 'abc'
  }
} as const;
const SATELLITE_LABELS_LAYER = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd'
};
function MapController({
  focusRiderId,
  riders,
  height
}: {
  focusRiderId?: string | null;
  riders: Rider[];
  height: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focusRiderId) return;
    const r = riders.find((x) => x.id === focusRiderId);
    // ponytail: preserve current map viewport if rider has no recorded location history (0,0)
    if (r && (r.lat !== 0 || r.lng !== 0)) {
      map.flyTo([r.lat, r.lng], 16, {
        duration: 0.9
      });
    }
  }, [focusRiderId, riders, map]);

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);

    map.invalidateSize();
    const intervals = [50, 100, 150, 200, 300, 400, 600, 1000];
    const timers = intervals.map(ms => setTimeout(() => map.invalidateSize(), ms));
    
    return () => {
      resizeObserver.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [height, map]);

  return null;
}

function RiderPopupContent({ rider, zoneName }: { rider: Rider; zoneName: string }) {
  const [address, setAddress] = useState('Loading address...');

  useEffect(() => {
    let active = true;
    if (rider.lat === 0 && rider.lng === 0) {
      setAddress('No location history available');
      return;
    }
    reverseGeocode(rider.lat, rider.lng).then((addr) => {
      if (active) setAddress(addr);
    });
    return () => {
      active = false;
    };
  }, [rider.lat, rider.lng]);

  const statusColor =
    rider.status === 'active'
      ? '#16A34A'
      : rider.status === 'idle'
      ? '#D97706'
      : rider.status === 'violation'
      ? '#DC2626'
      : '#6B6258';

  const hasCoords = rider.lat !== 0 || rider.lng !== 0;

  return (
    <div style={{ minWidth: '220px', color: '#1A1410' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <img
          src={rider.avatar}
          alt=""
          style={{ width: '36px', height: '36px', borderRadius: '9999px', background: '#FAFAF7', border: '1px solid #EFEAE2' }}
        />
        <div>
          <div style={{ color: '#1A1410', fontWeight: 600, fontSize: '13px' }}>{rider.name}</div>
          <div style={{ color: '#6B6258', fontFamily: "'Geist Mono',monospace", fontSize: '11px' }}>{rider.riderCode}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zone</span>
        <span style={{ color: '#1A1410', fontSize: '12px' }}>{zoneName}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
        <span style={{ color: statusColor, fontSize: '12px', textTransform: 'capitalize', fontWeight: 600 }}>
          {rider.status === 'offline' && hasCoords ? 'Offline (Last Known)' : rider.status}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</span>
        <span style={{ color: '#1A1410', fontSize: '11px', maxWidth: '140px', textAlign: 'right', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {address}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {rider.status === 'offline' ? 'Last Coords' : 'Coords'}
        </span>
        <span style={{ color: '#1A1410', fontFamily: "'Geist Mono',monospace", fontSize: '11px' }}>
          {hasCoords ? `${rider.lat.toFixed(4)}, ${rider.lng.toFixed(4)}` : 'No history'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</span>
        <span style={{ color: '#1A1410', fontFamily: "'Geist Mono',monospace", fontSize: '11px' }}>
          {Math.round(rider.speed)} km/h
        </span>
      </div>
    </div>
  );
}

export function LiveMonitoringMap({
  riders,
  zones,
  height = '100%',
  focusRiderId,
  onMarkerClick,
  compact
}: LiveMonitoringMapProps) {
  const [showGeofences, setShowGeofences] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [activeLayer, setActiveLayer] = useState<'dark' | 'satellite'>('dark');
  const [tick, setTick] = useState(0);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const counts = useMemo(
    () => ({
      active: riders.filter((r) => r.status === 'active').length,
      idle: riders.filter((r) => r.status === 'idle').length,
      violation: riders.filter((r) => r.status === 'violation').length
    }),
    [riders]
  );
  const tile = TILE_LAYERS[activeLayer];
  const isSatellite = activeLayer === 'satellite';
  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border bg-[#0a0c12] shadow-sm"
      style={{
        height
      }}>
      
      <MapContainer
        center={ZAMBOANGA_CENTER}
        zoom={14}
        scrollWheelZoom
        zoomControl={!compact}
        style={{
          height: '100%',
          width: '100%'
        }}
        ref={mapRef}>
        
        <TileLayer
          key={activeLayer}
          url={tile.url}
          attribution={tile.attribution}
          subdomains={tile.subdomains}
          maxZoom={20} />
        
        {isSatellite &&
        <TileLayer
          key="satellite-labels"
          url={SATELLITE_LABELS_LAYER.url}
          attribution={SATELLITE_LABELS_LAYER.attribution}
          subdomains={SATELLITE_LABELS_LAYER.subdomains}
          opacity={0.9}
          zIndex={450}
          maxZoom={20} />

        }
        {showGeofences &&
        zones.map((z) =>
        <GeofenceCircle key={z.id} zone={z} satelliteMode={isSatellite} />
        )}
        {riders.map((r) => {
          if (r.lat === 0 && r.lng === 0) return null;
          const zone = zones.find((z) => z.id === r.zoneId);
          return (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={buildRiderIcon(r, {
                showLabel: showLabels
              })}
              eventHandlers={{
                click: () => onMarkerClick?.(r.id)
              }}>
              
              <Popup>
                <RiderPopupContent rider={r} zoneName={zone?.name ?? '—'} />
              </Popup>
            </Marker>);

        })}
        <MapController focusRiderId={focusRiderId} riders={riders} height={height} />
      </MapContainer>

      {/* Legend (top-left) */}
      <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-border rounded-lg p-2.5 text-xs shadow-lg">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">
          Status
        </div>
        <div className="space-y-1">
          <LegendRow color="#10B981" label="Active" count={counts.active} />
          <LegendRow color="#F59E0B" label="Idle" count={counts.idle} />
          <LegendRow
            color="#EF4444"
            label="Violation"
            count={counts.violation}
            pulse />
          
        </div>
      </div>

      {/* Controls (top-right) */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5 items-end">
        <button
          onClick={() =>
          mapRef.current?.flyTo(ZAMBOANGA_CENTER, 14, {
            duration: 0.8
          })
          }
          className="w-9 h-9 rounded-md bg-white border border-border text-foreground hover:text-primary hover:border-primary/30 shadow-md flex items-center justify-center transition"
          aria-label="Recenter"
          title="Recenter">
          
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowGeofences((v) => !v)}
          className={`w-9 h-9 rounded-md border shadow-md flex items-center justify-center transition ${showGeofences ? 'bg-accent border-primary/40 text-primary' : 'bg-white border-border text-muted-foreground hover:text-foreground'}`}
          aria-label="Toggle geofences"
          title="Toggle geofences">
          
          {showGeofences ?
          <Eye className="w-4 h-4" /> :

          <EyeOff className="w-4 h-4" />
          }
        </button>
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`w-9 h-9 rounded-md border shadow-md flex items-center justify-center transition ${showLabels ? 'bg-accent border-primary/40 text-primary' : 'bg-white border-border text-muted-foreground hover:text-foreground'}`}
          aria-label="Toggle labels"
          title="Toggle rider labels">
          
          {showLabels ?
          <Tag className="w-4 h-4" /> :

          <TagsIcon className="w-4 h-4" />
          }
        </button>
        <button
          onClick={() =>
          setActiveLayer((l) => l === 'dark' ? 'satellite' : 'dark')
          }
          className="h-9 px-2.5 rounded-md bg-white border border-border text-foreground hover:text-primary hover:border-primary/30 shadow-md flex items-center gap-1.5 transition text-xs font-medium"
          aria-label={
          isSatellite ? 'Switch to default map' : 'Switch to satellite map'
          }
          title={
          isSatellite ? 'Switch to default map' : 'Switch to satellite map'
          }>
          
          <span aria-hidden="true">{isSatellite ? '🗺' : '🛰'}</span>
          <span>{isSatellite ? 'Default' : 'Satellite'}</span>
        </button>
      </div>

      {/* Mini stat (bottom-left) */}
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <span className="text-xs text-foreground font-mono">
          Tracking {riders.length} riders · updated {tick % 3 + 1}s ago
        </span>
      </div>
    </div>);

}
function LegendRow({
  color,
  label,
  count,
  pulse





}: {color: string;label: string;count: number;pulse?: boolean;}) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <span
        className={`w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{
          background: color
        }} />
      
      <span className="text-foreground flex-1 font-medium">{label}</span>
      <span className="font-mono text-muted-foreground tabular-nums">{count}</span>
    </div>);

}
