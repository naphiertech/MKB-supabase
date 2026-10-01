import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Eye, EyeOff, Crosshair, Tag, TagsIcon } from 'lucide-react';
import type { Rider, Zone } from '../../services/types';
import { buildRiderIcon } from './RiderMarker';
import { GeofenceCircle } from './GeofenceCircle';
import { STREET_BASEMAP } from './mapProviders';
import { reverseGeocode } from '../../lib/apiService';

interface LiveMonitoringMapProps {
  riders: Rider[];
  zones: Zone[];
  height?: string;
  focusRiderId?: string | null;
  onMarkerClick?: (riderId: string) => void;
  compact?: boolean;
  onlineUserIds?: string[];
}

const ZAMBOANGA_CENTER: [number, number] = [6.925, 122.078];
const TILE_LAYERS = {
  dark: {
    ...STREET_BASEMAP,
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
    const timers = intervals.map((ms) => setTimeout(() => map.invalidateSize(), ms));

    return () => {
      resizeObserver.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [height, map]);

  return null;
}

function RiderPopupContent({
  rider,
  zoneName,
  onlineUserIds = []
}: {
  rider: Rider;
  zoneName: string;
  onlineUserIds?: string[];
}) {
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

  const isOnline = Boolean(
    (rider.userId && onlineUserIds.includes(rider.userId)) || onlineUserIds.includes(rider.id)
  );
  const hasCoords = rider.lat !== 0 || rider.lng !== 0;
  const isFresh = hasCoords && Boolean(rider.lastPing && Date.now() - rider.lastPing <= 120_000);
  const opStatus = rider.operationalStatus || rider.status;
  const operationalLabel =
    opStatus === 'active'
      ? 'In Zone'
      : opStatus === 'violation'
      ? 'Violation'
      : opStatus === 'idle'
      ? 'Idle'
      : opStatus;
  const statusColor =
    opStatus === 'active'
      ? '#16A34A'
      : opStatus === 'idle'
      ? '#D97706'
      : opStatus === 'violation'
      ? '#DC2626'
      : '#6B6258';

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
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Presence</span>
        <span style={{ color: isOnline ? '#16A34A' : '#6B6258', fontSize: '12px', fontWeight: 600 }}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tracking</span>
        <span style={{ color: isFresh ? '#16A34A' : hasCoords ? '#D97706' : '#6B6258', fontSize: '12px', fontWeight: 600 }}>
          {isFresh ? 'Live' : hasCoords ? 'Stale' : 'Not Tracking'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Geofence</span>
        <span style={{ color: statusColor, fontSize: '12px', textTransform: 'capitalize', fontWeight: 600 }}>
          {operationalLabel}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {isFresh ? 'Current Location' : 'Last Known Location'}
        </span>
        <span style={{ color: '#1A1410', fontSize: '11px', maxWidth: '140px', textAlign: 'right', whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {address}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {isFresh ? 'Coords' : 'Last Coords'}
        </span>
        <span style={{ color: '#1A1410', fontFamily: "'Geist Mono',monospace", fontSize: '11px' }}>
          {hasCoords ? `${rider.lat.toFixed(4)}, ${rider.lng.toFixed(4)}` : 'No history'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderTop: '1px solid #EFEAE2' }}>
        <span style={{ color: '#6B6258', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Speed</span>
        <span style={{ color: '#1A1410', fontFamily: "'Geist Mono',monospace", fontSize: '11px' }}>
          {isFresh ? `${Math.round(rider.speed)} km/h` : '—'}
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
  compact,
  onlineUserIds = []
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

  const { counts, liveCount } = useMemo(() => {
    const now = Date.now();
    let active = 0;
    let idle = 0;
    let violation = 0;
    let staleOrOffline = 0;
    let live = 0;
    riders.forEach((r) => {
      const hasCoords = r.lat !== 0 || r.lng !== 0;
      const isFresh = hasCoords && Boolean(r.lastPing && now - r.lastPing <= 120_000);
      if (isFresh) live++;

      if (!isFresh) {
        staleOrOffline++;
      } else if (r.status === 'violation') {
        violation++;
      } else if (r.status === 'idle') {
        idle++;
      } else {
        active++;
      }
    });
    return {
      counts: { active, idle, violation, staleOrOffline },
      liveCount: live
    };
  }, [riders, tick]);

  const tile = TILE_LAYERS[activeLayer];
  const isSatellite = activeLayer === 'satellite';

  return (
    <div
      className="relative rounded-xl overflow-hidden border border-border bg-[#0a0c12] shadow-sm"
      style={{ height }}
    >
      <MapContainer
        center={ZAMBOANGA_CENTER}
        zoom={14}
        scrollWheelZoom
        zoomControl={!compact}
        style={{
          height: '100%',
          width: '100%'
        }}
        ref={mapRef}
      >
        <TileLayer
          key={activeLayer}
          url={tile.url}
          attribution={tile.attribution}
          subdomains={tile.subdomains}
          maxNativeZoom={isSatellite ? 20 : 19}
          maxZoom={20}
        />

        {isSatellite && (
          <TileLayer
            key="satellite-labels"
            url={SATELLITE_LABELS_LAYER.url}
            attribution={SATELLITE_LABELS_LAYER.attribution}
            subdomains={SATELLITE_LABELS_LAYER.subdomains}
            opacity={0.9}
            zIndex={450}
            maxZoom={20}
          />
        )}

        {showGeofences &&
          zones.map((z) => (
            <GeofenceCircle key={z.id} zone={z} satelliteMode={isSatellite} />
          ))}

        {riders.map((r) => {
          if (r.lat === 0 && r.lng === 0) return null;
          const zone = zones.find((z) => z.id === r.zoneId);
          const isFresh = Boolean(r.lastPing && Date.now() - r.lastPing <= 120_000);
          return (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={buildRiderIcon(r, {
                showLabel: showLabels,
                isFresh
              })}
              eventHandlers={{
                click: () => onMarkerClick?.(r.id)
              }}
            >
              <Popup>
                <RiderPopupContent rider={r} zoneName={zone?.name ?? '—'} onlineUserIds={onlineUserIds} />
              </Popup>
            </Marker>
          );
        })}
        <MapController focusRiderId={focusRiderId} riders={riders} height={height} />
      </MapContainer>

      {/* Legend (top-left) */}
      <div className="map-overlay-card absolute left-3 top-3 z-[400] max-w-[calc(100%-7rem)] rounded-lg border border-border bg-white/95 p-2 text-[11px] shadow-lg backdrop-blur-md sm:p-2.5 sm:text-xs">
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
            pulse={counts.violation > 0}
          />
          <LegendRow color="#6B7280" label="Stale / Offline" count={counts.staleOrOffline} />
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
          className="map-control-button rounded-md bg-white border border-border text-foreground hover:text-primary hover:border-primary/30 shadow-md flex items-center justify-center transition cursor-pointer"
          aria-label="Recenter"
          title="Recenter"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowGeofences((v) => !v)}
          className={`map-control-button rounded-md border shadow-md flex items-center justify-center transition cursor-pointer ${
            showGeofences ? 'bg-accent border-primary/40 text-primary' : 'bg-white border-border text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle geofences"
          title="Toggle geofences"
        >
          {showGeofences ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`map-control-button rounded-md border shadow-md flex items-center justify-center transition cursor-pointer ${
            showLabels ? 'bg-accent border-primary/40 text-primary' : 'bg-white border-border text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle labels"
          title="Toggle rider labels"
        >
          {showLabels ? <Tag className="w-4 h-4" /> : <TagsIcon className="w-4 h-4" />}
        </button>
        <button
          onClick={() => setActiveLayer((l) => (l === 'dark' ? 'satellite' : 'dark'))}
          className="map-control-button rounded-md bg-white border border-border px-2.5 text-foreground hover:text-primary hover:border-primary/30 shadow-md flex items-center gap-1.5 transition text-xs font-medium cursor-pointer"
          aria-label={isSatellite ? 'Switch to default map' : 'Switch to satellite map'}
          title={isSatellite ? 'Switch to default map' : 'Switch to satellite map'}
        >
          <span aria-hidden="true">{isSatellite ? '🗺' : '🛰'}</span>
          <span className="hidden sm:inline">{isSatellite ? 'Default' : 'Satellite'}</span>
        </button>
      </div>

      {/* Mini stat (bottom-left) */}
      <div className="map-tracking-pill absolute bottom-3 left-3 z-[400] flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-border bg-white/95 px-3 py-2 shadow-lg backdrop-blur-md">
        <span className="relative flex w-2 h-2">
          {liveCount > 0 ? (
            <>
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </>
          ) : (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
          )}
        </span>
        <span className="min-w-0 truncate text-xs text-foreground font-mono">
          Tracking {liveCount} {liveCount === 1 ? 'rider' : 'riders'} · Map refreshed {tick % 3 + 1}s ago
        </span>
      </div>
    </div>
  );
}

function LegendRow({
  color,
  label,
  count,
  pulse
}: {
  color: string;
  label: string;
  count: number;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <span
        className={`w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{
          background: color
        }}
      />
      <span className="text-foreground flex-1 font-medium">{label}</span>
      <span className="font-mono text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}
