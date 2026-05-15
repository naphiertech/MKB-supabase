import React, { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Eye, EyeOff, Crosshair, Tag, TagsIcon } from 'lucide-react';
import type { Rider, Zone } from '../../services/mockData';
import { buildRiderIcon, renderRiderPopup } from './RiderMarker';
import { GeofenceCircle } from './GeofenceCircle';
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
  riders



}: {focusRiderId?: string | null;riders: Rider[];}) {
  const map = useMap();
  useEffect(() => {
    if (!focusRiderId) return;
    const r = riders.find((x) => x.id === focusRiderId);
    if (r)
    map.flyTo([r.lat, r.lng], 16, {
      duration: 0.9
    });
  }, [focusRiderId, riders, map]);
  return null;
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
      className="relative rounded-xl overflow-hidden border border-[#EFEAE2] bg-[#0a0c12] shadow-sm"
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
                <div
                  dangerouslySetInnerHTML={{
                    __html: renderRiderPopup(r, zone?.name ?? '—')
                  }} />
                
              </Popup>
            </Marker>);

        })}
        <MapController focusRiderId={focusRiderId} riders={riders} />
      </MapContainer>

      {/* Legend (top-left) */}
      <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-[#EFEAE2] rounded-lg p-2.5 text-xs shadow-lg">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
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
          className="w-9 h-9 rounded-md bg-white border border-[#EFEAE2] text-[#1A1410] hover:text-[#db6c00] hover:border-[#db6c00]/30 shadow-md flex items-center justify-center transition"
          aria-label="Recenter"
          title="Recenter">
          
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowGeofences((v) => !v)}
          className={`w-9 h-9 rounded-md border shadow-md flex items-center justify-center transition ${showGeofences ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#db6c00]' : 'bg-white border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410]'}`}
          aria-label="Toggle geofences"
          title="Toggle geofences">
          
          {showGeofences ?
          <Eye className="w-4 h-4" /> :

          <EyeOff className="w-4 h-4" />
          }
        </button>
        <button
          onClick={() => setShowLabels((v) => !v)}
          className={`w-9 h-9 rounded-md border shadow-md flex items-center justify-center transition ${showLabels ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#db6c00]' : 'bg-white border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410]'}`}
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
          className="h-9 px-2.5 rounded-md bg-white border border-[#EFEAE2] text-[#1A1410] hover:text-[#db6c00] hover:border-[#db6c00]/30 shadow-md flex items-center gap-1.5 transition text-xs font-medium"
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
      <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-[#EFEAE2] rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#db6c00] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#db6c00]" />
        </span>
        <span className="text-xs text-[#1A1410] font-mono">
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
      
      <span className="text-[#1A1410] flex-1 font-medium">{label}</span>
      <span className="font-mono text-[#6B6258] tabular-nums">{count}</span>
    </div>);

}