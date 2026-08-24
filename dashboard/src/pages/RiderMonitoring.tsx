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

  const zoneCenterLat = zone?.center[0] ?? 6.9214;
  const zoneCenterLng = zone?.center[1] ?? 122.0790;
  const zoneRadius = zone?.radius ?? 1000;
  const zoneName = zone?.name ?? 'Unassigned';

  const anchor = useMemo(
    () => ({
      lat: zoneCenterLat + 0.0006,
      lng: zoneCenterLng + 0.0004
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
    return haversine(
      zoneCenterLat,
      zoneCenterLng,
      position.lat,
      position.lng
    );
  }, [zoneCenterLat, zoneCenterLng, position]);

  const inZone = useMemo(() => {
    if (zone?.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length > 0) {
      return isPointInPolygon([position.lat, position.lng], zone.polygon_coordinates);
    }
    return distance <= zoneRadius;
  }, [distance, zoneRadius, zone, position]);

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="monitoring" role="rider" />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-5xl mx-auto space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
        <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-panel-bg animate-pulse sm:h-[500px]">
          <MapPin className="w-6 h-6 text-primary animate-bounce" />
          <span className="text-muted-foreground text-sm font-medium">Acquiring live GPS signal...</span>
        </div>
      ) : locationError && !hasVerifiedPosition ? (
        <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-center sm:h-[500px] sm:px-6">
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
        <>
          <RiderMap
            position={position}
            zone={zone}
            inZone={inZone}
            height="500px" />
          
          <GeofenceStatus
            inZone={inZone}
            zoneName={zoneName}
            distance={distance}
            radius={zoneRadius} />
        </>
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
