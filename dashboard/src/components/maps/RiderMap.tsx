import {
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import { GeofenceCircle } from './GeofenceCircle';
import { STREET_BASEMAP } from './mapProviders';
import { haversine, type Zone } from '../../services/types';

export interface RiderMapHubProps {
  hub_id?: string | null;
  hubId?: string | null;
  hub_name?: string | null;
  hubName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  attendance_radius_m?: number | null;
  attendanceRadiusM?: number | null;
  distance?: number | null;
  distanceM?: number | null;
  is_configured?: boolean;
  isConfigured?: boolean;
}

interface RiderMapProps {
  position: {
    lat: number;
    lng: number;
  };
  zone: Zone;
  /** Inside-zone status (renders calm pin) vs outside (pulsing red ring). */
  inZone: boolean | null;
  hub?: RiderMapHubProps | null;
  height?: string;
  className?: string;
}

const TILE_LAYERS = {
  dark: {
    ...STREET_BASEMAP,
    subdomains: 'abcd',
  },
  satellite: {
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
    subdomains: 'abc',
  },
} as const;

const SATELLITE_LABELS_LAYER = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  subdomains: 'abcd',
};

// Inject the ping-pulse keyframes once at module load.
const KEYFRAMES_STYLE_ID = 'rider-map-pingpulse-keyframes';
if (
  typeof document !== 'undefined' &&
  !document.getElementById(KEYFRAMES_STYLE_ID)
) {
  const styleEl = document.createElement('style');
  styleEl.id = KEYFRAMES_STYLE_ID;
  styleEl.textContent =
    '@keyframes riderPingPulse {' +
    '0% { transform: scale(0.7); opacity: 0.9; }' +
    '80% { transform: scale(1.8); opacity: 0; }' +
    '100% { transform: scale(1.8); opacity: 0; }' +
    '}';
  document.head.appendChild(styleEl);
}

function buildPin(inZone: boolean | null) {
  const color = inZone === null ? '#DB6C00' : inZone ? '#16A34A' : '#DC2626';
  const ring = inZone === null ? 'rgba(219,108,0,0.32)' : inZone ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.45)';
  const animation = inZone !== false ?
    '' :
    'animation: riderPingPulse 1.6s cubic-bezier(0,0,.2,1) infinite;';
  const html =
    '<div style="position:relative;width:36px;height:36px;">' +
    '<span style="position:absolute;inset:-6px;border-radius:9999px;background:' +
    ring +
    ';' +
    animation +
    '"></span>' +
    '<span style="position:absolute;inset:4px;border-radius:9999px;background:' +
    color +
    ';box-shadow:0 0 0 3px #0a0c12, 0 0 12px ' +
    color +
    ';border:2px solid #fff;"></span>' +
    '<span style="position:absolute;inset:11px;border-radius:9999px;background:#fff;opacity:.85;"></span>' +
    '</div>';
  return L.divIcon({
    className: 'rider-self-pin',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html,
  });
}

function buildHubPin(hubName?: string | null) {
  const safeTitle = (hubName || 'Assigned Hub').replace(/"/g, '&quot;');
  const html =
    '<div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;" title="' +
    safeTitle +
    '">' +
    '<span style="position:absolute;inset:-4px;border-radius:12px;background:rgba(184,90,0,0.25);"></span>' +
    '<span style="position:relative;width:34px;height:34px;border-radius:10px;background:#b85a00;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;color:#ffffff;">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>' +
    '<path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>' +
    '<path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>' +
    '<path d="M10 6h4"/>' +
    '<path d="M10 10h4"/>' +
    '<path d="M10 14h4"/>' +
    '<path d="M10 18h4"/>' +
    '</svg>' +
    '</span>' +
    '</div>';

  return L.divIcon({
    className: 'rider-hub-pin',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
    html,
  });
}

function InitialMapBounds({
  position,
  hub,
}: {
  position: { lat: number; lng: number };
  hub?: { latitude: number; longitude: number } | null;
}) {
  const map = useMap();
  const fittedHubRef = useRef(false);
  const fittedPositionRef = useRef(false);

  useEffect(() => {
    if (
      hub &&
      Number.isFinite(hub.latitude) &&
      Number.isFinite(hub.longitude) &&
      Number.isFinite(position.lat) &&
      Number.isFinite(position.lng)
    ) {
      if (fittedHubRef.current) return;
      fittedHubRef.current = true;
      fittedPositionRef.current = true;
      const bounds = L.latLngBounds([
        [position.lat, position.lng],
        [hub.latitude, hub.longitude],
      ]);
      map.fitBounds(bounds, {
        padding: [48, 48],
        maxZoom: 16,
        duration: 0.6,
      });
    } else if (Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
      if (fittedPositionRef.current || fittedHubRef.current) return;
      fittedPositionRef.current = true;
      map.flyTo([position.lat, position.lng], map.getZoom() || 16, {
        duration: 0.6,
      });
    }
  }, [map, position.lat, position.lng, hub]);

  return null;
}

function ResizeObserverController() {
  const map = useMap();
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
  }, [map]);
  return null;
}

export function RiderMap({
  position,
  zone,
  inZone,
  hub,
  height,
  className = '',
}: RiderMapProps) {
  const icon = useMemo(() => buildPin(inZone), [inZone]);
  const mapRef = useRef<L.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<'dark' | 'satellite'>('dark');
  const tile = TILE_LAYERS[activeLayer];
  const isSatellite = activeLayer === 'satellite';

  const normalizedHub = useMemo(() => {
    if (!hub) return null;
    const hubId = hub.hub_id ?? hub.hubId ?? null;
    const hubName = hub.hub_name ?? hub.hubName ?? null;
    const latitude = hub.latitude ?? null;
    const longitude = hub.longitude ?? null;
    const attendanceRadiusM = hub.attendance_radius_m ?? hub.attendanceRadiusM ?? null;
    const distance = hub.distance ?? hub.distanceM ?? null;
    const isConfigured = (hub.is_configured ?? hub.isConfigured) !== false;

    if (
      !hubId ||
      !isConfigured ||
      latitude == null ||
      longitude == null ||
      attendanceRadiusM == null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(attendanceRadiusM) ||
      attendanceRadiusM <= 0
    ) {
      return null;
    }

    return {
      hub_id: hubId,
      hub_name: hubName,
      latitude,
      longitude,
      attendance_radius_m: attendanceRadiusM,
      distance,
    };
  }, [hub]);

  const hubIcon = useMemo(
    () => (normalizedHub ? buildHubPin(normalizedHub.hub_name) : null),
    [normalizedHub],
  );

  const hubDistance = useMemo(() => {
    if (!normalizedHub) return null;
    if (normalizedHub.distance != null && Number.isFinite(normalizedHub.distance)) {
      return normalizedHub.distance;
    }
    return haversine(
      normalizedHub.latitude,
      normalizedHub.longitude,
      position.lat,
      position.lng,
    );
  }, [normalizedHub, position.lat, position.lng]);

  return (
    <div
      className={
        'relative isolate w-full min-w-0 max-w-full rounded-xl overflow-hidden border ' +
        (inZone === false ? 'border-[#DC2626]/50' : 'border-border') +
        ' bg-[#0a0c12] ' +
        (inZone === false ? 'shadow-[0_0_0_3px_rgba(220,38,38,0.15)]' : 'shadow-sm') +
        (height || className ? '' : ' h-[320px]') +
        ` ${className}`
      }
      style={height ? { height } : undefined}
    >
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={16}
        scrollWheelZoom
        zoomControl={false}
        style={{
          height: '100%',
          width: '100%',
        }}
        ref={mapRef}
      >
        <ResizeObserverController />
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

        <GeofenceCircle zone={zone} satelliteMode={isSatellite} />
        <Marker position={[position.lat, position.lng]} icon={icon} />

        {normalizedHub && hubIcon && (
          <>
            <Circle
              center={[normalizedHub.latitude, normalizedHub.longitude]}
              radius={normalizedHub.attendance_radius_m}
              pathOptions={{
                color: '#b85a00',
                fillColor: '#b85a00',
                fillOpacity: isSatellite ? 0.22 : 0.12,
                weight: 2,
                dashArray: '5 5',
              }}
            />
            <Marker
              position={[normalizedHub.latitude, normalizedHub.longitude]}
              icon={hubIcon}
            >
              <Popup className="rider-hub-popup" closeButton={false}>
                <div className="p-1 text-xs text-foreground font-sans">
                  <div className="font-semibold text-sm text-[#b85a00]">
                    {normalizedHub.hub_name || 'Assigned Hub'}
                  </div>
                  <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    <div>
                      Attendance radius:{' '}
                      <span className="font-mono font-medium text-foreground">
                        {Math.round(normalizedHub.attendance_radius_m)} m
                      </span>
                    </div>
                    {Number.isFinite(hubDistance) && (
                      <div>
                        Distance from you:{' '}
                        <span className="font-mono font-medium text-foreground">
                          {Math.round(hubDistance!)} m
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        <InitialMapBounds
          position={position}
          hub={normalizedHub}
        />
      </MapContainer>

      {/* Controls (top-right) */}
      <div className="absolute right-2 top-2 z-[400] flex max-w-[calc(100%-1rem)] flex-col items-end gap-1.5 sm:right-3 sm:top-3">
        <button
          type="button"
          onClick={() =>
            mapRef.current?.flyTo([position.lat, position.lng], 16, {
              duration: 0.6,
            })
          }
          className="map-control-button rounded-md bg-white border border-border text-foreground hover:bg-accent hover:border-primary/40 hover:text-primary flex items-center justify-center shadow-sm transition-colors"
          aria-label="Recenter on me"
          title="Recenter"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            setActiveLayer((l) => (l === 'dark' ? 'satellite' : 'dark'))
          }
          className="map-control-button rounded-md bg-white border border-border px-2.5 text-foreground hover:bg-accent hover:border-primary/40 hover:text-primary flex items-center gap-1.5 shadow-sm transition-colors text-xs font-medium"
          aria-label={
            isSatellite ? 'Switch to default map' : 'Switch to satellite map'
          }
          title={
            isSatellite ? 'Switch to default map' : 'Switch to satellite map'
          }
        >
          <span aria-hidden="true">{isSatellite ? '🗺' : '🛰'}</span>
          <span className="hidden sm:inline">{isSatellite ? 'Default' : 'Satellite'}</span>
        </button>
      </div>

      {/* Zone tag */}
      <div className="map-overlay-card absolute left-2 top-2 z-[400] flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-md border border-border bg-white/95 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur-md sm:left-3 sm:top-3 sm:max-w-[calc(100%-7rem)]">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: zone.color,
          }}
        />
        <span className="min-w-0 truncate text-foreground font-medium">{zone.name}</span>
        <span className="text-subtle-text font-mono">·</span>
        <span className="text-muted-foreground font-mono">
          {zone.zone_type === 'polygon'
            ? 'Polygon'
            : Number.isFinite(zone.radius) && zone.radius > 0
              ? `${zone.radius}m`
              : 'Geometry unavailable'}
        </span>
      </div>

      {/* Bottom overlays bar: Coords pill on left, Legend on right */}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-[400] flex flex-wrap items-center justify-between gap-1.5 sm:bottom-3 sm:left-3 sm:right-3">
        {/* Coords pill */}
        <div className="pointer-events-auto rounded-md border border-border bg-white/95 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground shadow-sm backdrop-blur-md">
          {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </div>

        {/* Map Legend */}
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md border border-border bg-white/95 px-2.5 py-1.5 text-[10px] text-foreground shadow-sm backdrop-blur-md sm:gap-2.5 sm:text-xs"
          aria-label="Map Legend"
        >
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#16A34A] shrink-0" aria-hidden="true" />
            <span className="font-medium text-muted-foreground">My Location</span>
          </div>
          {normalizedHub && (
            <>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-[#b85a00] shrink-0" aria-hidden="true" />
                <span className="font-medium text-muted-foreground">Hub</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[#b85a00] shrink-0" aria-hidden="true" />
                <span className="font-medium text-muted-foreground">Attendance Area</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-1">
            <span
              className="h-2 w-2.5 rounded-xs border shrink-0 opacity-80"
              style={{
                borderColor: zone.color || '#b85a00',
                backgroundColor: `${zone.color || '#b85a00'}44`,
              }}
              aria-hidden="true"
            />
            <span className="font-medium text-muted-foreground">Delivery Zone</span>
          </div>
        </div>
      </div>
    </div>
  );
}
