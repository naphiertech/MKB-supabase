import { useMemo, useEffect, useState } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import {
  riders as ALL_RIDERS,
  zones as ALL_ZONES,
  haversine } from
'../services/mockData';
import { useGeolocation } from '../hooks/useGeolocation';
import { RiderMap } from '../components/maps/RiderMap';
import { GeofenceStatus } from '../components/rider/GeofenceStatus';
import { RouteTrailMap } from '../components/maps/RouteTrailMap';
import { 
  getRouteForRider, 
  computeRouteStats,
  RoutePoint,
  RouteStats
} from '../services/routeService';

interface RiderMonitoringProps {
  userId: string;
  onBack: () => void;
}
export function RiderMonitoring({ userId, onBack }: RiderMonitoringProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const rider = ALL_RIDERS.find((r) => r.id === riderId) ?? ALL_RIDERS[0];
  const zone = ALL_ZONES.find((z) => z.id === rider.zoneId) ?? ALL_ZONES[0];

  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);

  useEffect(() => {
    const loadRoute = async () => {
      if (!riderId) return;
      setLoadingRoute(true);
      const points = await getRouteForRider(riderId);
      setRoutePoints(points);
      setRouteStats(computeRouteStats(points));
      setLoadingRoute(false);
    };
    loadRoute();
  }, [riderId]);
  const anchor = useMemo(
    () => ({
      lat: zone.center[0] + 0.0006,
      lng: zone.center[1] + 0.0004
    }),
    [zone]
  );
  const { position } = useGeolocation({
    initial: anchor,
    jitter: 0.00018
  });
  const distance = haversine(
    zone.center[0],
    zone.center[1],
    position.lat,
    position.lng
  );
  const inZone = distance <= zone.radius;
  return (
    <div className="p-4 md:p-6 lg:p-7 max-w-5xl mx-auto space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-[#6B6258] hover:text-[#1A1410] transition-colors">
        
        <ArrowLeft className="w-4 h-4" />
        Back to dashboard
      </button>

      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-[#db6c00]" />
        <h1 className="text-[#1A1410] font-semibold text-lg">My Location</h1>
      </div>

      <RiderMap
        position={position}
        zone={zone}
        inZone={inZone}
        height="500px" />
      
      <GeofenceStatus
        inZone={inZone}
        zoneName={zone.name}
        distance={distance}
        radius={zone.radius} />

      {/* Today's Route Trail */}
      <div className="bg-white rounded-xl border 
                      border-[#EFEAE2] overflow-hidden">

        {/* Section header */}
        <div className="px-5 py-4 border-b border-[#EFEAE2] 
                        flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#1A1410]">
              Today's Route
            </h3>
            <p className="text-xs text-[#888] mt-0.5">
              Your shift trail · {new Date().toLocaleDateString()}
            </p>
          </div>
          {routeStats && (
            <span className="text-xs font-mono text-[#db6c00] 
                             bg-[#FFF1E0] px-2 py-1 rounded-lg">
              {routeStats.totalDistanceKm} km today
            </span>
          )}
        </div>

        {/* Map or loading/empty state */}
        <div className="p-4">
          {loadingRoute ? (
            <div className="h-[340px] bg-[#F5F0E8] rounded-xl 
                            animate-pulse" />
          ) : routePoints.length < 2 ? (
            <div className="h-[200px] flex flex-col items-center 
                            justify-center text-center gap-2">
              <p className="text-sm font-medium text-[#1A1410]">
                No route recorded yet
              </p>
              <p className="text-xs text-[#888]">
                Your route will appear here once 
                your shift starts and GPS tracking begins
              </p>
            </div>
          ) : (
            <RouteTrailMap
              points={routePoints}
              stats={routeStats}
              riderName={rider.name}
              zoneName={zone.name}
            />
          )}
        </div>

      </div>
      
    </div>);

}