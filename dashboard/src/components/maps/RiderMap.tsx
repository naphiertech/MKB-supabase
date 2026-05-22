import {
  useEffect,
  useMemo,
  useState,
  useRef } from
'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import { GeofenceCircle } from './GeofenceCircle';
import type { Zone } from '../../services/mockData';
interface RiderMapProps {
  position: {
    lat: number;
    lng: number;
  };
  zone: Zone;
  /** Inside-zone status (renders calm pin) vs outside (pulsing red ring). */
  inZone: boolean;
  height?: string;
}
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
// Inject the ping-pulse keyframes once at module load.
const KEYFRAMES_STYLE_ID = 'rider-map-pingpulse-keyframes';
if (
typeof document !== 'undefined' &&
!document.getElementById(KEYFRAMES_STYLE_ID))
{
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
function buildPin(inZone: boolean) {
  const color = inZone ? '#16A34A' : '#DC2626';
  const ring = inZone ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.45)';
  const animation = inZone ?
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
    html
  });
}
function Recenter({
  position
}: {position: {lat: number;lng: number;};}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([position.lat, position.lng], map.getZoom(), {
      duration: 0.6
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  height = '320px'
}: RiderMapProps) {
  const icon = useMemo(() => buildPin(inZone), [inZone]);
  const mapRef = useRef<L.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<'dark' | 'satellite'>('dark');
  const tile = TILE_LAYERS[activeLayer];
  const isSatellite = activeLayer === 'satellite';
  return (
    <div
      className={
      'relative rounded-xl overflow-hidden border ' + (
      inZone ? 'border-[#EFEAE2]' : 'border-[#DC2626]/50') +
      ' bg-[#0a0c12] ' + (
      inZone ? 'shadow-sm' : 'shadow-[0_0_0_3px_rgba(220,38,38,0.15)]')
      }
      style={{
        height
      }}>
      
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={16}
        scrollWheelZoom
        zoomControl={false}
        style={{
          height: '100%',
          width: '100%'
        }}
        ref={mapRef}>
        
        <ResizeObserverController />
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
        <GeofenceCircle zone={zone} satelliteMode={isSatellite} />
        <Marker position={[position.lat, position.lng]} icon={icon} />
        <Recenter position={position} />
      </MapContainer>

      {/* Controls (top-right) */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5 items-end">
        <button
          type="button"
          onClick={() =>
          mapRef.current?.flyTo([position.lat, position.lng], 16, {
            duration: 0.6
          })
          }
          className="w-9 h-9 rounded-md bg-white border border-[#EFEAE2] text-[#1A1410] hover:bg-[#FFF1E0] hover:border-[#db6c00]/40 hover:text-[#db6c00] flex items-center justify-center shadow-sm transition-colors"
          aria-label="Recenter on me"
          title="Recenter">
          
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() =>
          setActiveLayer((l) => l === 'dark' ? 'satellite' : 'dark')
          }
          className="h-9 px-2.5 rounded-md bg-white border border-[#EFEAE2] text-[#1A1410] hover:bg-[#FFF1E0] hover:border-[#db6c00]/40 hover:text-[#db6c00] flex items-center gap-1.5 shadow-sm transition-colors text-xs font-medium"
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

      {/* Zone tag */}
      <div className="absolute top-3 left-3 z-[400] flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md border border-[#EFEAE2] text-xs shadow-sm">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            background: zone.color
          }} />
        
        <span className="text-[#1A1410] font-medium">{zone.name}</span>
        <span className="text-[#A39988] font-mono">·</span>
        <span className="text-[#6B6258] font-mono">{zone.radius}m</span>
      </div>

      {/* Coords pill */}
      <div className="absolute bottom-3 left-3 z-[400] px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md border border-[#EFEAE2] text-[11px] text-[#6B6258] font-mono tabular-nums shadow-sm">
        {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
      </div>
    </div>);

}