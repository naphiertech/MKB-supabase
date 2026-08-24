import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents, Marker, Circle, Polygon } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import type { Zone } from '../../services/types';
import { GeofenceCircle } from '../maps/GeofenceCircle';

const ZAMBOANGA_CENTER: [number, number] = [6.925, 122.078];

function MapController({ activeZone }: { activeZone: Zone | null }) {
  const map = useMap();
  useEffect(() => {
    if (!activeZone) return;
    
    // For polygons, center around the first coordinate or Zamboanga City center
    let centerLoc = activeZone.center;
    if (activeZone.zone_type === 'polygon' && activeZone.polygon_coordinates && activeZone.polygon_coordinates.length > 0) {
      centerLoc = activeZone.polygon_coordinates[0];
    }
    
    const zoom = activeZone.radius > 1500 ? 14 : activeZone.radius > 900 ? 15 : 16;
    map.flyTo(centerLoc, zoom, {
      duration: 0.9,
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

const MapClickHandler = ({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) => {
  useMapEvents({
    click(e) {
      onMapClick(
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6))
      );
    },
  });
  return null;
};

interface ZoneMapPreviewProps {
  zones: Zone[];
  activeZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  isEditing?: boolean;
  zoneType?: 'circle' | 'polygon';
  pin?: { lat: number; lng: number } | null;
  polygonCoords?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  radius?: number;
  color?: string;
}

export function ZoneMapPreview({
  zones,
  activeZoneId,
  onSelectZone,
  isEditing = false,
  zoneType = 'circle',
  pin = null,
  polygonCoords = [],
  onMapClick,
  radius = 1000,
  color = '#db6c00',
}: ZoneMapPreviewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            {isEditing ? 'Zone Editor · Build Geofence' : 'Zone Map · Zamboanga City'}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {isEditing
              ? zoneType === 'circle'
                ? pin
                  ? `📍 Pin: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} · ${radius}m radius`
                  : 'Click anywhere on the map to set the zone center'
                : `Polygon corners selected: ${polygonCoords.length} (3+ required)`
              : activeZone
                ? `Selected: ${activeZone.name} · ${activeZone.zone_type || 'circle'} zone`
                : `${zones.length} geofenced zones`}
          </div>
        </div>
        <div className="hidden items-center gap-1.5 rounded-md border border-border bg-panel-bg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex">
          <span className={`w-1.5 h-1.5 rounded-full ${isEditing ? 'bg-red-500 animate-pulse' : 'bg-primary'}`} />
          {isEditing ? 'Interactive Draw' : 'Geofence View'}
        </div>
      </div>
      <div className="relative h-[340px] sm:h-[420px] lg:h-[520px] bg-[#0a0c12]">
        <MapContainer
          center={pin ? [pin.lat, pin.lng] : ZAMBOANGA_CENTER}
          zoom={13}
          scrollWheelZoom
          style={{
            height: '100%',
            width: '100%',
          }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
            subdomains="abcd"
            maxZoom={20}
          />

          {/* Render Existing Zones */}
          {zones.map((z) => {
            const isActive = activeZoneId === z.id;
            const isDimmed = isEditing || (activeZoneId !== null && !isActive);
            return (
              <GeofenceCircle
                key={z.id}
                zone={z}
                highlighted={isActive}
                dimmed={isDimmed}
                showLabel={!isEditing}
                onClick={(id) => !isEditing && onSelectZone(isActive ? null : id)}
              />
            );
          })}

          {/* Interactive Editing Clicks */}
          {isEditing && onMapClick && (
            <MapClickHandler onMapClick={onMapClick} />
          )}

          {/* Render Current Editing Pin & Circle OR Polygon Shape */}
          {isEditing && (
            <>
              {zoneType === 'circle' && pin && (
                <>
                  <Marker position={[pin.lat, pin.lng]} />
                  <Circle
                    center={[pin.lat, pin.lng]}
                    radius={radius}
                    pathOptions={{
                      color: color,
                      fillColor: color,
                      fillOpacity: 0.15,
                      dashArray: '6 4',
                      weight: 2,
                    }}
                  />
                </>
              )}

              {zoneType === 'polygon' && polygonCoords && polygonCoords.length > 0 && (
                <>
                  <Polygon
                    positions={polygonCoords}
                    pathOptions={{
                      color: color,
                      fillColor: color,
                      fillOpacity: 0.15,
                      dashArray: '6 4',
                      weight: 2,
                    }}
                  />
                  {polygonCoords.map((coord, idx) => (
                    <Marker key={idx} position={coord} />
                  ))}
                </>
              )}
            </>
          )}

          <MapController activeZone={activeZone} />
        </MapContainer>

        {/* Recenter control */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
          <button
            onClick={() => {
              if (!isEditing) {
                onSelectZone(null);
              }
              const recenterPos = pin ? [pin.lat, pin.lng] : (polygonCoords.length > 0 ? polygonCoords[0] : ZAMBOANGA_CENTER);
              mapRef.current?.flyTo(recenterPos as [number, number], 13, {
                duration: 0.8,
              });
            }}
            className="map-control-button rounded-md bg-white border border-border text-foreground hover:text-primary hover:border-primary/30 shadow-md flex items-center justify-center transition"
            aria-label="Recenter map"
            title="Recenter map"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1">
            Map Legend
          </div>
          <div className="flex items-center gap-2 text-[11px] text-foreground">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-dashed border-primary" />
            <span>
              {isEditing 
                ? zoneType === 'circle' 
                  ? 'Click map to set center'
                  : 'Click map to add corner points' 
                : 'Click any circle to inspect'}
            </span>
          </div>
        </div>

        {/* Footer chip */}
        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-md border border-border rounded-lg px-3 py-2 flex items-center gap-2 shadow-lg">
          <span className="relative flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-xs text-foreground font-mono">
            {zones.length} zones · dark map preview
          </span>
        </div>
      </div>
    </div>
  );
}
