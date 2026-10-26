import { useEffect, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  Marker,
  Circle,
  CircleMarker,
  Polygon,
  Polyline,
  Tooltip
} from 'react-leaflet';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import type { Zone } from '../../services/types';
import type { Hub } from '../../services/hubs/hubService';
import type { PolygonDrawMode } from './ZoneFormPanel';
import { GeofenceCircle } from '../maps/GeofenceCircle';
import { STREET_BASEMAP } from '../maps/mapProviders';
import { isClosingPolygonLoop, simplifyPolygonPath } from '../../lib/geofenceUtils';

const ZAMBOANGA_CENTER: [number, number] = [6.925, 122.078];

function MapController({
  activeZone,
  selectedHub,
  isEditing,
}: {
  activeZone: Zone | null;
  selectedHub: Hub | null;
  isEditing: boolean;
}) {
  const map = useMap();
  const lastFlownHubIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeZone) return;

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
    if (!isEditing || !selectedHub) {
      lastFlownHubIdRef.current = null;
      return;
    }
    if (
      selectedHub.latitude !== null &&
      selectedHub.longitude !== null &&
      lastFlownHubIdRef.current !== selectedHub.id
    ) {
      lastFlownHubIdRef.current = selectedHub.id;
      map.flyTo([selectedHub.latitude, selectedHub.longitude], 15, {
        duration: 0.75,
      });
    }
  }, [isEditing, map, selectedHub]);

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
  }, [map]);

  return null;
}

const MapInteractionHandler = ({
  isEditing,
  zoneType,
  polygonDrawMode,
  onMapClick,
  onFreehandStrokeComplete,
  onStrokePreviewChange,
}: {
  isEditing: boolean;
  zoneType: 'circle' | 'polygon';
  polygonDrawMode: PolygonDrawMode;
  onMapClick?: (lat: number, lng: number) => void;
  onFreehandStrokeComplete?: (coords: [number, number][]) => void;
  onStrokePreviewChange?: (coords: [number, number][]) => void;
}) => {
  const map = useMap();
  const isDrawingRef = useRef(false);
  const strokePointsRef = useRef<[number, number][]>([]);

  const isFreehandActive = isEditing && zoneType === 'polygon' && polygonDrawMode === 'freehand';

  useEffect(() => {
    const container = map.getContainer();
    if (isFreehandActive) {
      map.dragging.disable();
      container.style.cursor = 'crosshair';
    } else if (isEditing) {
      map.dragging.enable();
      container.style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      container.style.cursor = '';
    }

    return () => {
      map.dragging.enable();
      container.style.cursor = '';
    };
  }, [isEditing, isFreehandActive, map]);

  useMapEvents({
    click(e) {
      if (!isEditing || isFreehandActive || !onMapClick) return;
      onMapClick(
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6))
      );
    },
    mousedown(e) {
      if (!isFreehandActive) return;
      isDrawingRef.current = true;
      const pt: [number, number] = [
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6)),
      ];
      strokePointsRef.current = [pt];
      onStrokePreviewChange?.([pt]);
    },
    mousemove(e) {
      if (!isFreehandActive || !isDrawingRef.current) return;
      const pt: [number, number] = [
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6)),
      ];
      const prev = strokePointsRef.current[strokePointsRef.current.length - 1];
      if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) >= 0.00004) {
        strokePointsRef.current.push(pt);
        onStrokePreviewChange?.([...strokePointsRef.current]);
      }
    },
    mouseup() {
      if (!isFreehandActive || !isDrawingRef.current) return;
      isDrawingRef.current = false;
      const rawStroke = strokePointsRef.current;
      strokePointsRef.current = [];
      onStrokePreviewChange?.([]);
      if (rawStroke.length >= 3) {
        const simplified = simplifyPolygonPath(rawStroke);
        if (simplified.length >= 3) {
          onFreehandStrokeComplete?.(simplified);
        }
      }
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
  polygonDrawMode?: PolygonDrawMode;
  isPolygonClosed?: boolean;
  onClosePolygonLoop?: () => void;
  onFreehandComplete?: (coords: [number, number][]) => void;
  pin?: { lat: number; lng: number } | null;
  polygonCoords?: [number, number][];
  onMapClick?: (lat: number, lng: number) => void;
  radius?: number;
  color?: string;
  selectedHub?: Hub | null;
}

export function ZoneMapPreview({
  zones,
  activeZoneId,
  onSelectZone,
  isEditing = false,
  zoneType = 'circle',
  polygonDrawMode = 'freehand',
  isPolygonClosed = false,
  onClosePolygonLoop,
  onFreehandComplete,
  pin = null,
  polygonCoords = [],
  onMapClick,
  radius = 1000,
  color = '#db6c00',
  selectedHub = null,
}: ZoneMapPreviewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [strokePreview, setStrokePreview] = useState<[number, number][]>([]);
  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;

  const displayCoords = strokePreview.length > 0 ? strokePreview : polygonCoords;
  const showClosedPolygon =
    strokePreview.length === 0 &&
    displayCoords.length >= 3 &&
    (isPolygonClosed || polygonDrawMode === 'freehand');

  const handleCornerClick = (lat: number, lng: number) => {
    if (!onMapClick) return;
    if (
      zoneType === 'polygon' &&
      polygonDrawMode === 'corners' &&
      !isPolygonClosed &&
      isClosingPolygonLoop(polygonCoords, [lat, lng], 90)
    ) {
      onClosePolygonLoop?.();
      return;
    }
    onMapClick(lat, lng);
  };

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
                : polygonDrawMode === 'freehand'
                  ? showClosedPolygon
                    ? `✅ Freehand zone closed (${polygonCoords.length} vertices) · Drag again to redraw`
                    : '✏️ Hold & drag on the map to draw a loop around the Hub'
                  : showClosedPolygon
                    ? `✅ Polygon closed (${polygonCoords.length} corners)`
                    : `Tracing corners: ${polygonCoords.length} (click start point to close loop)`
              : activeZone
                ? `Selected: ${activeZone.name} · ${activeZone.zone_type || 'circle'} zone`
                : `${zones.length} geofenced zones`}
          </div>
        </div>
        <div className="hidden items-center gap-1.5 rounded-md border border-border bg-panel-bg px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex">
          <span className={`w-1.5 h-1.5 rounded-full ${isEditing ? 'bg-red-500 animate-pulse' : 'bg-primary'}`} />
          {isEditing ? (zoneType === 'polygon' && polygonDrawMode === 'freehand' ? 'Freehand Draw' : 'Interactive Draw') : 'Geofence View'}
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
            url={STREET_BASEMAP.url}
            attribution={STREET_BASEMAP.attribution}
            maxNativeZoom={19}
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

          {/* Render Selected Hub Reference Boundary During Editing so Admin Never Cuts Out the Hub */}
          {isEditing &&
            selectedHub &&
            selectedHub.latitude !== null &&
            selectedHub.longitude !== null && (
              <>
                <Circle
                  center={[selectedHub.latitude, selectedHub.longitude]}
                  radius={selectedHub.attendanceRadiusM || 150}
                  pathOptions={{
                    color: '#059669',
                    fillColor: '#10b981',
                    fillOpacity: 0.12,
                    dashArray: '4 4',
                    weight: 2,
                  }}
                />
                <CircleMarker
                  center={[selectedHub.latitude, selectedHub.longitude]}
                  radius={7}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: '#059669',
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Tooltip permanent direction="top" offset={[0, -8]}>
                    <span className="font-mono text-[10px] font-semibold">
                      🏢 Hub: {selectedHub.name}
                    </span>
                  </Tooltip>
                </CircleMarker>
              </>
            )}

          {/* Interactive Map Click & Freehand Drag Handler */}
          <MapInteractionHandler
            isEditing={isEditing}
            zoneType={zoneType}
            polygonDrawMode={polygonDrawMode}
            onMapClick={handleCornerClick}
            onFreehandStrokeComplete={onFreehandComplete}
            onStrokePreviewChange={setStrokePreview}
          />

          {/* Render Current Editing Pin & Circle OR Polygon / Freehand Shape */}
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

              {zoneType === 'polygon' && displayCoords.length > 0 && (
                <>
                  {showClosedPolygon ? (
                    <Polygon
                      positions={displayCoords}
                      pathOptions={{
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.2,
                        dashArray: '6 4',
                        weight: 2.5,
                      }}
                    />
                  ) : (
                    <Polyline
                      positions={displayCoords}
                      pathOptions={{
                        color: color,
                        weight: 3,
                        dashArray: strokePreview.length > 0 ? undefined : '6 4',
                      }}
                    />
                  )}

                  {/* Clean vertex handles instead of bulky marker pins that cover the map */}
                  {strokePreview.length === 0 &&
                    displayCoords.map((coord, idx) => {
                      const isStartNode = idx === 0;
                      const canSnapClose =
                        isStartNode &&
                        polygonDrawMode === 'corners' &&
                        !isPolygonClosed &&
                        displayCoords.length >= 3;

                      return (
                        <CircleMarker
                          key={`${coord[0]}-${coord[1]}-${idx}`}
                          center={coord}
                          radius={canSnapClose ? 9 : isStartNode ? 7 : 5}
                          pathOptions={{
                            color: '#ffffff',
                            fillColor: canSnapClose ? '#10b981' : isStartNode ? '#059669' : color,
                            fillOpacity: 1,
                            weight: 2,
                          }}
                          eventHandlers={
                            canSnapClose
                              ? {
                                  click: (e) => {
                                    L.DomEvent.stopPropagation(e);
                                    onClosePolygonLoop?.();
                                  },
                                }
                              : undefined
                          }
                        >
                          {canSnapClose && (
                            <Tooltip permanent direction="top" offset={[0, -10]}>
                              <span className="font-mono text-[10px] font-semibold text-emerald-700">
                                Click start point to close zone
                              </span>
                            </Tooltip>
                          )}
                        </CircleMarker>
                      );
                    })}
                </>
              )}
            </>
          )}

          <MapController
            activeZone={activeZone}
            selectedHub={selectedHub}
            isEditing={isEditing}
          />
        </MapContainer>

        {/* Recenter control */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
          <button
            onClick={() => {
              if (!isEditing) {
                onSelectZone(null);
              }
              const recenterPos = pin
                ? [pin.lat, pin.lng]
                : polygonCoords.length > 0
                  ? polygonCoords[0]
                  : selectedHub && selectedHub.latitude !== null && selectedHub.longitude !== null
                    ? [selectedHub.latitude, selectedHub.longitude]
                    : ZAMBOANGA_CENTER;
              mapRef.current?.flyTo(recenterPos as [number, number], 14, {
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
                  : polygonDrawMode === 'freehand'
                    ? 'Hold & drag to draw zone loop'
                    : 'Click corners, then click start point to close'
                : 'Click any zone to inspect'}
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
            {zones.length} zones · street map preview
          </span>
        </div>
      </div>
    </div>
  );
}
