import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, MapPin } from 'lucide-react';
import { STREET_BASEMAP } from '../maps/mapProviders';
import { formatLatLng } from '../../lib/geofenceUtils';

const ZAMBOANGA_HUB_CENTER: [number, number] = [6.925, 122.078];

function buildHubMapPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'hub-map-picker-pin',
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9999px;background:#0284c7;color:#ffffff;box-shadow:0 3px 10px rgba(2,132,199,0.45);border:2.5px solid #ffffff;cursor:grab;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
          <path d="M10 6h4"/>
          <path d="M10 10h4"/>
          <path d="M10 14h4"/>
          <path d="M10 18h4"/>
        </svg>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17],
  });
}

function MapController({
  position,
}: {
  position: [number, number] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, 15, { duration: 0.6 });
    }
  }, [position, map]);

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(container);
    }

    map.invalidateSize();
    const intervals = [50, 100, 200, 350, 500, 800];
    const timers = intervals.map((ms) => setTimeout(() => map.invalidateSize(), ms));

    return () => {
      resizeObserver?.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [map]);

  return null;
}

function MapClickHandler({
  onMapClick,
  disabled,
}: {
  onMapClick: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (disabled) return;
      onMapClick(
        parseFloat(e.latlng.lat.toFixed(7)),
        parseFloat(e.latlng.lng.toFixed(7)),
      );
    },
  });
  return null;
}

export interface HubLocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  onLocationChange: (coords: { latitude: number; longitude: number }) => void;
  disabled?: boolean;
  heightClassName?: string;
  circleColor?: string;
}

export function HubLocationPickerMap({
  latitude,
  longitude,
  radius,
  onLocationChange,
  disabled = false,
  heightClassName = 'h-64 sm:h-72',
  circleColor = '#0284c7',
}: HubLocationPickerMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const pinPlaced = latitude != null && longitude != null;
  const currentPin: [number, number] | null = pinPlaced ? [latitude, longitude] : null;

  const pinIcon = buildHubMapPinIcon();

  function handleRecenter() {
    const target = currentPin ?? ZAMBOANGA_HUB_CENTER;
    mapRef.current?.flyTo(target, pinPlaced ? 16 : 13, { duration: 0.6 });
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-white shadow-sm flex flex-col">
      {/* Map Header Status */}
      <div className="flex items-center justify-between border-b border-border bg-panel-bg/70 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className={`h-4 w-4 shrink-0 ${pinPlaced ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="truncate text-xs font-medium text-foreground">
            {pinPlaced
              ? `Pin: ${formatLatLng([latitude, longitude], 6)}`
              : 'Click map to place Hub physical pin'}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            pinPlaced
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${pinPlaced ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
          {pinPlaced ? 'Location Set' : 'Unconfigured'}
        </span>
      </div>

      {/* Map Container */}
      <div className={`relative w-full ${heightClassName} bg-[#0a0c12]`}>
        <MapContainer
          center={currentPin ?? ZAMBOANGA_HUB_CENTER}
          zoom={pinPlaced ? 15 : 13}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url={STREET_BASEMAP.url}
            attribution={STREET_BASEMAP.attribution}
            maxNativeZoom={19}
            maxZoom={20}
          />

          {!disabled && (
            <MapClickHandler
              onMapClick={(lat, lng) => onLocationChange({ latitude: lat, longitude: lng })}
              disabled={disabled}
            />
          )}

          {currentPin && (
            <>
              <Marker
                position={currentPin}
                icon={pinIcon}
                draggable={!disabled}
                eventHandlers={{
                  dragend(e) {
                    const marker = e.target;
                    const latLng = marker.getLatLng();
                    onLocationChange({
                      latitude: parseFloat(latLng.lat.toFixed(7)),
                      longitude: parseFloat(latLng.lng.toFixed(7)),
                    });
                  },
                }}
              />
              {radius != null && radius > 0 && (
                <Circle
                  center={currentPin}
                  radius={radius}
                  pathOptions={{
                    color: circleColor,
                    fillColor: circleColor,
                    fillOpacity: 0.16,
                    dashArray: '6 4',
                    weight: 2,
                  }}
                />
              )}
            </>
          )}

          <MapController position={currentPin} />
        </MapContainer>

        {/* Recenter Button */}
        <div className="absolute right-3 top-3 z-[400]">
          <button
            type="button"
            onClick={handleRecenter}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-foreground shadow-md transition hover:border-primary/40 hover:text-primary"
            aria-label="Recenter map"
            title="Recenter map"
          >
            <Crosshair className="h-4 w-4" />
          </button>
        </div>

        {/* Legend Hint Overlay */}
        <div className="absolute bottom-2.5 left-2.5 z-[400] rounded-lg border border-border/80 bg-white/95 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm">
          {pinPlaced ? 'Drag pin or click map to reposition' : 'Click anywhere on map to position pin'}
        </div>
      </div>
    </div>
  );
}
