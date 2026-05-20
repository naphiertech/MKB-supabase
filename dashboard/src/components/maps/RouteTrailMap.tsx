import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { RoutePoint, RouteStats } from '../../services/routeService';

// Custom start marker — green
const startIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 28px; height: 28px;
    background: #10b981;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(16,185,129,0.3);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Custom current position marker — orange
const currentIcon = L.divIcon({
  className: '',
  html: `<div style="
    width: 16px; height: 16px;
    background: #db6c00;
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 4px rgba(219,108,0,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Auto-fit map bounds to the route
const FitBounds = ({ points }: { points: RoutePoint[] }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(
        points.map(p => [p.lat, p.lng])
      );
      map.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [points, map]);
  return null;
};

interface RouteTrailMapProps {
  points: RoutePoint[];
  stats: RouteStats | null;
  riderName: string;
  zoneName: string;
  showSatellite?: boolean;
  mapHeight?: string;
}

export const RouteTrailMap = ({
  points,
  stats,
  riderName,
  zoneName,
  showSatellite = false,
  mapHeight = '340px',
}: RouteTrailMapProps) => {
  const [satellite, setSatellite] = useState(showSatellite);

  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const latLngs = points.map(p => [p.lat, p.lng] as [number, number]);

  const tileUrl = satellite
    ? 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  return (
    <div className="flex flex-col h-full gap-0 rounded-xl overflow-hidden
                    border border-[#EFEAE2]">

      {/* Stats Bar — above the map */}
      {stats && (
        <div className="bg-[#1A1410] px-4 py-3 
                        grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-semibold text-white">
              {stats.totalDistanceKm}
            </p>
            <p className="text-xs text-[#888] uppercase tracking-wider">
              km
            </p>
          </div>
          <div className="text-center border-x border-[#333]">
            <p className="text-2xl font-semibold text-white">
              {Math.floor(stats.durationMinutes / 60)}h{' '}
              {stats.durationMinutes % 60}m
            </p>
            <p className="text-xs text-[#888] uppercase tracking-wider">
              duration
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-semibold text-white">
              {stats.averageSpeedKph}
            </p>
            <p className="text-xs text-[#888] uppercase tracking-wider">
              avg km/h
            </p>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="relative flex-1 min-h-0" style={{ minHeight: mapHeight === '100%' ? undefined : mapHeight }}>
        <div className="absolute inset-0">
        <MapContainer
          center={
            endPoint
              ? [endPoint.lat, endPoint.lng]
              : [6.9214, 122.0790]
          }
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url={tileUrl} attribution="© Map data" />

          {/* Labels overlay for satellite mode */}
          {satellite && (
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
              attribution="© CARTO"
              opacity={0.9}
            />
          )}

          {/* Auto fit bounds */}
          {points.length > 1 && <FitBounds points={points} />}

          {/* Route polyline */}
          {latLngs.length > 1 && (
            <>
              {/* Outer glow line */}
              <Polyline
                positions={latLngs}
                pathOptions={{
                  color: '#db6c00',
                  weight: 6,
                  opacity: 0.25,
                }}
              />
              {/* Main route line */}
              <Polyline
                positions={latLngs}
                pathOptions={{
                  color: '#db6c00',
                  weight: 3,
                  opacity: 0.9,
                }}
              />
            </>
          )}

          {/* Start marker — green dot */}
          {startPoint && (
            <Marker
              position={[startPoint.lat, startPoint.lng]}
              icon={startIcon}
            >
              <Tooltip permanent direction="top" offset={[0, -8]}>
                <span className="text-xs">Start</span>
              </Tooltip>
            </Marker>
          )}

          {/* Current position marker — orange dot */}
          {endPoint && points.length > 1 && (
            <Marker
              position={[endPoint.lat, endPoint.lng]}
              icon={currentIcon}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="text-xs">Now</span>
              </Tooltip>
            </Marker>
          )}
        </MapContainer>
        </div>

        {/* Satellite toggle button — bottom right of map */}
        <button
          onClick={() => setSatellite(s => !s)}
          className="absolute bottom-3 right-3 z-[1000]
                     bg-white border border-[#EFEAE2] 
                     rounded-lg px-3 py-1.5 text-xs 
                     font-medium text-[#1A1410] shadow-sm
                     hover:bg-[#F5F0E8] transition-colors
                     flex items-center gap-1.5"
        >
          {satellite ? '🗺 Default' : '🛰 Satellite'}
        </button>
      </div>

      {/* Footer bar — below the map */}
      <div className="bg-[#FAFAF7] border-t border-[#EFEAE2]
                      px-4 py-2.5 flex items-center 
                      justify-between">
        <div className="flex items-center gap-4 text-xs text-[#888]">
          {/* Start time */}
          {stats && (
            <span>
              Started{' '}
              {new Date(stats.startTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {/* GPS points count */}
          <span>{stats?.pointCount ?? 0} GPS points</span>
          {/* Rider */}
          <span>Rider: {riderName}</span>
          {/* Zone */}
          <span>Zone: {zoneName}</span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-[#888]">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full 
                             bg-emerald-400 inline-block" />
            Start
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full 
                             bg-[#db6c00] inline-block" />
            Current
          </div>
        </div>
      </div>

    </div>
  );
};
