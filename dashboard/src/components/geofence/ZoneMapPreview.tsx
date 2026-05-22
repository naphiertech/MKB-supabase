import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import type { Zone } from '../../services/mockData';
import { GeofenceCircle } from '../maps/GeofenceCircle';
const ZAMBOANGA_CENTER: [number, number] = [6.925, 122.078];
function MapController({ activeZone }: {activeZone: Zone | null;}) {
  const map = useMap();
  useEffect(() => {
    if (!activeZone) return;
    const zoom =
    activeZone.radius > 1500 ? 14 : activeZone.radius > 900 ? 15 : 16;
    map.flyTo(activeZone.center, zoom, {
      duration: 0.9
    });
  }, [activeZone, map]);

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
interface ZoneMapPreviewProps {
  zones: Zone[];
  activeZoneId: string | null;
  onSelectZone: (id: string | null) => void;
}
export function ZoneMapPreview({
  zones,
  activeZoneId,
  onSelectZone
}: ZoneMapPreviewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;
  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#EFEAE2]">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#1A1410]">
            Zone Map · Zamboanga City
          </div>
          <div className="text-[11px] text-[#6B6258] font-mono truncate">
            {activeZone ?
            `Selected: ${activeZone.name} · ${activeZone.radius}m radius` :
            `${zones.length} geofenced zones`}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] text-[10px] uppercase tracking-wider text-[#6B6258] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[#db6c00]" />
          Geofence Editor
        </div>
      </div>
      <div className="relative h-[460px] lg:h-[520px] bg-[#0a0c12]">
        <MapContainer
          center={ZAMBOANGA_CENTER}
          zoom={13}
          scrollWheelZoom
          style={{
            height: '100%',
            width: '100%'
          }}
          ref={mapRef}>
          
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
            subdomains="abcd"
            maxZoom={20} />
          
          {zones.map((z) => {
            const isActive = activeZoneId === z.id;
            const isDimmed = activeZoneId !== null && !isActive;
            return (
              <GeofenceCircle
                key={z.id}
                zone={z}
                highlighted={isActive}
                dimmed={isDimmed}
                showLabel
                onClick={(id) => onSelectZone(isActive ? null : id)} />);


          })}
          <MapController activeZone={activeZone} />
        </MapContainer>

        {/* Recenter control */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
          <button
            onClick={() => {
              onSelectZone(null);
              mapRef.current?.flyTo(ZAMBOANGA_CENTER, 13, {
                duration: 0.8
              });
            }}
            className="w-9 h-9 rounded-md bg-white border border-[#EFEAE2] text-[#1A1410] hover:text-[#db6c00] hover:border-[#db6c00]/30 shadow-md flex items-center justify-center transition"
            aria-label="Recenter map"
            title="Recenter map">
            
            <Crosshair className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-[#EFEAE2] rounded-lg px-3 py-2 text-xs shadow-lg">
          <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold mb-1">
            Map Legend
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#1A1410]">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-dashed border-[#db6c00]" />
            <span>Click any circle to inspect</span>
          </div>
        </div>

        {/* Footer chip */}
        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-[#EFEAE2] rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#db6c00] opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#db6c00]" />
          </span>
          <span className="text-xs text-[#1A1410] font-mono">
            {zones.length} zones · dark map preview
          </span>
        </div>
      </div>
    </div>);

}