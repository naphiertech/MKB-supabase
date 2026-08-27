import { useEffect, useState, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { RoutePoint, RouteStats } from '../../services/monitoring/routeService';
import { haversine } from '../../services/types';
import { Play, Pause, RotateCcw, X, Activity } from 'lucide-react';
import { STREET_BASEMAP } from './mapProviders';

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

// Custom moving rider marker — orange pulsing dot
const movingRiderIcon = L.divIcon({
  className: '',
  html: `
    <div style="
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
    ">
      <!-- Pulsing ripple ring -->
      <div class="animate-ping" style="
        position: absolute;
        width: 28px;
        height: 28px;
        background: #db6c00;
        border-radius: 50%;
        opacity: 0.4;
      "></div>
      <!-- Inner glow circle -->
      <div style="
        position: absolute;
        width: 18px;
        height: 18px;
        background: #db6c00;
        border-radius: 50%;
        opacity: 0.25;
      "></div>
      <!-- Solid core with white border -->
      <div style="
        position: relative;
        width: 12px;
        height: 12px;
        background: #db6c00;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
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

// Helper to invalidate leaflet map size when container dimensions change
const InvalidateMapSize = ({ mapHeight }: { mapHeight: string }) => {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);

    map.invalidateSize();
    
    // Invalidate repeatedly during and after transitions as an extra fallback
    const intervals = [50, 100, 150, 200, 300, 400, 600, 1000];
    const timers = intervals.map(ms => setTimeout(() => {
      map.invalidateSize();
    }, ms));
    
    return () => {
      resizeObserver.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [mapHeight, map]);
  return null;
};

// Custom controller to pan the map viewport to follow the moving rider
const PlaybackMapController = ({
  activePoint,
  isReplayMode,
  isPlaying,
}: {
  activePoint: RoutePoint | undefined;
  isReplayMode: boolean;
  isPlaying: boolean;
}) => {
  const map = useMap();
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!isReplayMode || !activePoint || !isPlaying) return;

    const now = performance.now();
    if (now - lastUpdateRef.current > 150) { // Limit viewport updates to avoid Leaflet lag
      lastUpdateRef.current = now;
      map.panTo([activePoint.lat, activePoint.lng], {
        animate: true,
        duration: 0.15,
      });
    }
  }, [activePoint, isReplayMode, isPlaying, map]);

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

  // Playback & Replay States
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // float from 0 to 1
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);

  // Reset playback if the points array changes (e.g., different rider or new day data)
  useEffect(() => {
    setIsReplayMode(false);
    setIsPlaying(false);
    setProgress(0);
  }, [points]);

  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const latLngs = points.map(p => [p.lat, p.lng] as [number, number]);

  // Pre-calculate cumulative distances in meters using haversine lookup
  const cumulativeDistances = useMemo(() => {
    const distances: number[] = [0];
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
      sum += haversine(
        points[i - 1].lat,
        points[i - 1].lng,
        points[i].lat,
        points[i].lng
      );
      distances.push(sum);
    }
    return distances;
  }, [points]);

  const totalDurationMs = 15000 / playbackSpeed;

  // Find the segment and interpolation fraction based on cumulative distance (for perfectly smooth, non-skipping distance-based playback)
  const { baseIndex, fraction, elapsedDistanceM } = useMemo(() => {
    if (points.length === 0) {
      return { baseIndex: 0, fraction: 0, elapsedDistanceM: 0 };
    }
    if (points.length < 2) {
      return { baseIndex: 0, fraction: 0, elapsedDistanceM: 0 };
    }

    const totalDist = cumulativeDistances[cumulativeDistances.length - 1] || 0;
    const currentDist = progress * totalDist;

    let index = 0;
    for (let i = 0; i < cumulativeDistances.length - 1; i++) {
      if (currentDist >= cumulativeDistances[i]) {
        index = i;
      } else {
        break;
      }
    }

    const d1 = cumulativeDistances[index];
    const d2 = cumulativeDistances[index + 1] || 0;
    const denom = d2 - d1;
    const frac = denom > 0 ? (currentDist - d1) / denom : 0;

    return {
      baseIndex: index,
      fraction: frac,
      elapsedDistanceM: currentDist,
    };
  }, [progress, points.length, cumulativeDistances]);

  // Interpolate active coordinate and details at 60 FPS (extremely smooth LERP)
  const interpolatedPoint = useMemo(() => {
    if (points.length === 0) return undefined;
    if (points.length === 1) return points[0];

    const p1 = points[baseIndex];
    const p2 = points[Math.min(baseIndex + 1, points.length - 1)];
    if (!p2) return p1;

    const lat = p1.lat + (p2.lat - p1.lat) * fraction;
    const lng = p1.lng + (p2.lng - p1.lng) * fraction;
    const speed = p1.speed + (p2.speed - p1.speed) * fraction;

    const t1 = new Date(p1.timestamp).getTime();
    const t2 = new Date(p2.timestamp).getTime();
    const timestamp = new Date(t1 + (t2 - t1) * fraction).toISOString();

    return { lat, lng, speed, timestamp } as RoutePoint;
  }, [points, baseIndex, fraction]);

  // Smooth drawing active route line (appends interpolated coordinate at the tip)
  const activeLatLngs = useMemo(() => {
    if (points.length === 0) return [];
    if (!isReplayMode) return latLngs;

    const slice = latLngs.slice(0, baseIndex + 1);
    if (interpolatedPoint) {
      slice.push([interpolatedPoint.lat, interpolatedPoint.lng] as [number, number]);
    }
    return slice;
  }, [points, latLngs, baseIndex, interpolatedPoint, isReplayMode]);



  // Calculate milliseconds elapsed since the start of the trail replay
  const elapsedMs = useMemo(() => {
    if (points.length < 2 || !interpolatedPoint) return 0;
    const start = new Date(points[0].timestamp).getTime();
    const current = new Date(interpolatedPoint.timestamp).getTime();
    return Math.max(0, current - start);
  }, [points, interpolatedPoint]);

  // Helper to format ms into an authentic timer string (HH:MM:SS or MM:SS)
  const formatDuration = (ms: number) => {
    if (ms < 0) return '00:00';
    const totalSecs = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 60 FPS RequestAnimationFrame Replay loop
  useEffect(() => {
    if (!isReplayMode || !isPlaying) return;

    let lastTime = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;

      setProgress(prev => {
        const step = deltaMs / totalDurationMs;
        const next = prev + step;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isReplayMode, isPlaying, totalDurationMs]);

  const handlePlayPause = () => {
    if (progress >= 1) {
      setProgress(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(p => !p);
    }
  };

  const tileUrl = satellite
    ? 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
    : STREET_BASEMAP.url;

  return (
    <div className="flex flex-col h-full gap-0 rounded-xl overflow-hidden
                    border border-border">

      {/* Stats Bar — above the map */}
      {stats && (
        <div className="bg-foreground px-4 py-3 
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
          <InvalidateMapSize mapHeight={mapHeight} />
          <TileLayer
            url={tileUrl}
            maxNativeZoom={satellite ? undefined : 19}
            attribution={satellite
              ? '&copy; Google'
              : STREET_BASEMAP.attribution}
          />

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

          {/* Smooth Panning Playback Controller */}
          <PlaybackMapController
            activePoint={interpolatedPoint}
            isReplayMode={isReplayMode}
            isPlaying={isPlaying}
          />

          {/* Replay: Faded background upcoming route */}
          {isReplayMode && latLngs.length > 1 && (
            <Polyline
              positions={latLngs}
              pathOptions={{
                color: '#db6c00',
                weight: 3,
                opacity: 0.18,
                dashArray: '5, 8',
              }}
            />
          )}

          {/* Replay: Glowing active path */}
          {isReplayMode && activeLatLngs.length > 1 && (
            <>
              <Polyline
                positions={activeLatLngs}
                pathOptions={{
                  color: '#db6c00',
                  weight: 7,
                  opacity: 0.35,
                }}
              />
              <Polyline
                positions={activeLatLngs}
                pathOptions={{
                  color: '#db6c00',
                  weight: 3.5,
                  opacity: 1.0,
                }}
              />
            </>
          )}

          {/* Normal Mode Route polyline */}
          {!isReplayMode && latLngs.length > 1 && (
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

          {/* Finish marker — normal end position */}
          {endPoint && points.length > 1 && (
            <Marker
              position={[endPoint.lat, endPoint.lng]}
              icon={currentIcon}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="text-xs">{isReplayMode ? 'Finish' : 'Now'}</span>
              </Tooltip>
            </Marker>
          )}

          {/* Moving rider marker */}
          {isReplayMode && interpolatedPoint && (
            <Marker
              position={[interpolatedPoint.lat, interpolatedPoint.lng]}
              icon={movingRiderIcon}
              zIndexOffset={1000}
            >
              <Tooltip permanent direction="top" offset={[0, -12]}>
                <span className="text-xs font-semibold text-primary">Rider</span>
              </Tooltip>
            </Marker>
          )}
        </MapContainer>
        </div>

        {/* Replay Toggle Button (shows when not in replay mode) */}
        {!isReplayMode && (
          <button
            onClick={() => {
              setIsReplayMode(true);
              setIsPlaying(true);
              setProgress(0);
            }}
            className="absolute bottom-3 left-3 z-[1000]
                       bg-primary hover:bg-primary-hover text-white
                       border border-primary rounded-lg px-3 py-1.5 text-xs 
                       font-semibold shadow-md hover:scale-105 active:scale-95
                       transition-all flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Replay Route
          </button>
        )}

        {/* Replay Controls Glassmorphic Dock */}
        {isReplayMode && (
          <div className="absolute bottom-3 left-3 right-3 z-[1000]
                          backdrop-blur-md bg-foreground/90 border border-white/10 
                          rounded-xl shadow-2xl p-3 md:p-4 text-white
                          flex flex-col md:flex-row items-center justify-between gap-3
                          transition-all duration-300">
            
            {/* Playback Button Group */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
              <div className="flex items-center gap-2">
                {/* Play / Pause */}
                <button
                  onClick={handlePlayPause}
                  className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover 
                             flex items-center justify-center shadow-md transition-all 
                             hover:scale-105 active:scale-95 text-white"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                </button>

                {/* Restart */}
                <button
                  onClick={() => {
                    setProgress(0);
                    setIsPlaying(true);
                  }}
                  className="w-8 h-8 rounded-full bg-[#332A22] hover:bg-[#473B30] border border-white/10
                             flex items-center justify-center transition-all text-gray-300 hover:text-white"
                  title="Restart"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Speed Multiplier selectors */}
              <div className="flex items-center bg-[#29221B] rounded-lg p-1 border border-white/5">
                {([1, 2, 4] as const).map(speed => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                      playbackSpeed === speed
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Live Stats display grid */}
            <div className="flex-1 grid grid-cols-3 gap-2 w-full md:w-auto text-center md:text-left border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-4">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Distance</p>
                <p className="text-sm md:text-base font-bold font-mono text-orange-400">
                  {(elapsedDistanceM / 1000).toFixed(2)} <span className="text-[10px] font-normal text-white">km</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Time</p>
                <p className="text-sm md:text-base font-bold font-mono text-white">
                  {formatDuration(elapsedMs)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Speed</p>
                <p className="text-sm md:text-base font-bold font-mono text-orange-400">
                  {interpolatedPoint?.speed ? Math.round(interpolatedPoint.speed) : 0} <span className="text-[10px] font-normal text-white">km/h</span>
                </p>
              </div>
            </div>

            {/* Exit/Close Replay Mode button */}
            <button
              onClick={() => {
                setIsReplayMode(false);
                setIsPlaying(false);
              }}
              className="absolute top-2 right-2 md:relative md:top-0 md:right-0 p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Exit Replay"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Satellite toggle button — bottom right of map (slides up when Replay Dock is active) */}
        <button
          onClick={() => setSatellite(s => !s)}
          className={`absolute right-3 z-[1000]
                     bg-white border border-border 
                     rounded-lg px-3 py-1.5 text-xs 
                     font-medium text-foreground shadow-sm
                     hover:bg-accent transition-all duration-300
                     flex items-center gap-1.5 ${
                       isReplayMode ? 'bottom-20 md:bottom-[76px]' : 'bottom-3'
                     }`}
        >
          {satellite ? '🗺 Default' : '🛰 Satellite'}
        </button>
      </div>

      {/* Footer bar — below the map */}
      <div className="bg-panel-bg border-t border-border
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
                             bg-primary inline-block" />
            Current
          </div>
        </div>
      </div>

    </div>
  );
};
