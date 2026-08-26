import { useMemo, useEffect, useState } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import {
  haversine,
  type Rider,
  type Zone } from
'../services/types';
import { useGeolocation } from '../hooks/useGeolocation';
import { RiderMap } from '../components/maps/RiderMap';
import { isPointInPolygon } from '../lib/geofenceUtils';
import { GeofenceStatus } from '../components/rider/GeofenceStatus';
import { RouteTrailMap } from '../components/maps/RouteTrailMap';
import { 
  RoutePoint,
  RouteStats
} from '../services/monitoring/routeService';
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';
import { fetchRiderMonitoringWithSWR, type CachedMonitoringPayload } from '../services/riders/riderCacheService';

interface RiderMonitoringProps {
  userId: string;
  riderId: string;
  restricted: boolean;
  onBack: () => void;
}

export function RiderMonitoring({ userId, riderId, restricted, onBack }: RiderMonitoringProps) {
  const [rider, setRider] = useState<Rider | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);

  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const day = String(new Date().getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        const applyPayload = (payload: CachedMonitoringPayload) => {
          const { dbRider, zone: dbZone, routePoints: rPoints, routeStats: rStats } = payload;

          if (dbRider) {
            const mappedRider: Rider = {
              id: dbRider.id,
              name: dbRider.name,
              avatar: dbRider.face_image_url || dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
              zoneId: dbRider.zone_id,
              status: dbRider.status,
              lat: dbRider.lat || 0,
              lng: dbRider.lng || 0,
              speed: dbRider.speed || 0,
              shift: (dbRider.shift || 'Morning').toLowerCase() as 'morning' | 'afternoon' | 'evening',
              lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : 0,
              phone: dbRider.contact || '',
              riderCode: dbRider.mkb_id
            };
            setRider(mappedRider);
          }

          if (dbZone) {
            setZone(dbZone);
          }

          if (rPoints) {
            setRoutePoints(rPoints);
            setRouteStats(rStats);
            setLoadingRoute(false);
          }

          setLoading(false);
        };

        await fetchRiderMonitoringWithSWR(
          userId,
          riderId,
          todayStr,
          {
            onCacheLoaded: applyPayload,
            onFreshDataLoaded: applyPayload
          }
        );
      } catch (err) {
        console.error('Error loading rider monitoring data:', err);
        setLoading(false);
        setLoadingRoute(false);
      }
    }

    loadData();
  }, [userId, riderId]);

  const zoneCenterLat = zone?.center[0] ?? null;
  const zoneCenterLng = zone?.center[1] ?? null;
  const zoneRadius = zone && zone.zone_type !== 'polygon' && Number.isFinite(zone.radius) && zone.radius > 0
    ? zone.radius
    : null;
  const zoneName = zone?.name ?? 'Unassigned';
  const hasPolygonGeometry = zone?.zone_type === 'polygon'
    && Boolean(zone.polygon_coordinates?.length && zone.polygon_coordinates.length >= 3)
    && zone.polygon_coordinates!.every((coordinate) => coordinate.every(Number.isFinite));
  const hasCircleGeometry = zone?.zone_type !== 'polygon'
    && zoneCenterLat !== null
    && zoneCenterLng !== null
    && Number.isFinite(zoneCenterLat)
    && Number.isFinite(zoneCenterLng)
    && !(zoneCenterLat === 0 && zoneCenterLng === 0)
    && zoneRadius !== null;
  const geometryResolved = zone?.hasValidGeometry !== false && (hasPolygonGeometry || hasCircleGeometry);

  const anchor = useMemo(
    () => ({
      lat: zoneCenterLat !== null && Number.isFinite(zoneCenterLat) ? zoneCenterLat : 0,
      lng: zoneCenterLng !== null && Number.isFinite(zoneCenterLng) ? zoneCenterLng : 0,
    }),
    [zoneCenterLat, zoneCenterLng]
  );

  const {
    position,
    error: locationError,
    isLoading: locationLoading,
    hasVerifiedPosition,
    retry: retryLocation
  } = useGeolocation({
    initial: anchor,
    enabled: !restricted
  });

  const distance = useMemo(() => {
    if (!geometryResolved || zoneCenterLat === null || zoneCenterLng === null) return null;
    return haversine(
      zoneCenterLat,
      zoneCenterLng,
      position.lat,
      position.lng
    );
  }, [geometryResolved, zoneCenterLat, zoneCenterLng, position]);

  const inZone = useMemo(() => {
    if (!geometryResolved) return null;
    if (zone?.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length > 0) {
      return isPointInPolygon([position.lat, position.lng], zone.polygon_coordinates);
    }
    return distance !== null && zoneRadius !== null ? distance <= zoneRadius : null;
  }, [distance, geometryResolved, zoneRadius, zone, position]);

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="monitoring" role="rider" />;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-3 overflow-x-clip px-4 py-3 sm:space-y-4 sm:p-6 lg:p-7">
      <button
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        <h1 className="text-foreground font-semibold text-lg">My Location</h1>
      </div>

      {restricted && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Operational GPS is disabled while this account is restricted.
        </div>
      )}

      {locationLoading && !hasVerifiedPosition ? (
        <div className="flex h-[clamp(400px,105vw,460px)] w-full min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-panel-bg animate-pulse sm:h-[500px]">
          <MapPin className="w-6 h-6 text-primary animate-bounce" />
          <span className="text-muted-foreground text-sm font-medium">Acquiring live GPS signal...</span>
        </div>
      ) : locationError && !hasVerifiedPosition ? (
        <div className="flex h-[clamp(400px,105vw,460px)] w-full min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-center sm:h-[500px] sm:px-6">
          <MapPin className="w-6 h-6 text-red-600" />
          <span className="text-sm font-semibold text-red-700">Live location unavailable</span>
          <span className="max-w-md text-xs text-red-600">
            No generated coordinates are shown or recorded. Enable precise location access, then retry.
          </span>
          <button
            type="button"
            onClick={retryLocation}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Retry GPS
          </button>
        </div>
      ) : (
        <div className="min-w-0 space-y-3">
          <RiderMap
            position={position}
            zone={zone}
            inZone={inZone}
            className="h-[clamp(400px,105vw,460px)] sm:h-[500px]" />
          
          <GeofenceStatus
            inZone={inZone}
            zoneName={zoneName}
            distance={distance}
            radius={zoneRadius}
            zoneType={zone.zone_type ?? 'circle'}
            geometryResolved={geometryResolved} />
        </div>
      )}

      {/* Today's Route Trail */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {/* Section header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Today's Route
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your duty trail · {new Date().toLocaleDateString()}
            </p>
          </div>
          {routeStats && (
            <span className="text-xs font-mono text-primary bg-accent px-2 py-1 rounded-lg">
              {routeStats.totalDistanceKm} km today
            </span>
          )}
        </div>

        {/* Map or loading/empty state */}
        <div className="p-4">
          {loadingRoute ? (
            <div className="h-[340px] bg-panel-bg rounded-xl animate-pulse" />
          ) : routePoints.length < 2 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-center gap-2">
              <p className="text-sm font-medium text-foreground">
                No route recorded yet
              </p>
              <p className="text-xs text-muted-foreground">
                Your route will appear here once you clock in and GPS tracking begins
              </p>
            </div>
          ) : (
            <RouteTrailMap
              points={routePoints}
              stats={routeStats}
              riderName={rider.name}
              zoneName={zoneName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
