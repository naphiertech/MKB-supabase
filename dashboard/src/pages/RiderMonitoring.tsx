import { useMemo, useEffect, useState } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import {
  haversine,
  type Rider,
  type Zone } from
'../services/types';
import { supabase } from '../lib/supabaseClient';
import { getZones } from '../services/geofenceService';
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
import { DashboardSkeleton } from '../components/common/DashboardSkeleton';

interface RiderMonitoringProps {
  userId: string;
  onBack: () => void;
}

export function RiderMonitoring({ userId, onBack }: RiderMonitoringProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const [actualRiderId, setActualRiderId] = useState<string>(riderId);
  const [rider, setRider] = useState<Rider | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);

  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Retrieve the linked rider_id using the logged-in Auth UUID
        const { data: dbUser } = await supabase
          .from('users')
          .select('rider_id')
          .eq('id', userId)
          .maybeSingle();

        const resolvedRiderId = dbUser?.rider_id || riderId;
        setActualRiderId(resolvedRiderId);

        const { data: dbRider, error } = await supabase
          .from('riders')
          .select('*')
          .eq('id', resolvedRiderId)
          .maybeSingle();

        if (!error && dbRider) {
          const mappedRider: Rider = {
            id: dbRider.id,
            name: dbRider.name,
            avatar: dbRider.face_image_url || dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
            zoneId: dbRider.zone_id,
            status: dbRider.status,
            lat: dbRider.lat || 0,
            lng: dbRider.lng || 0,
            speed: dbRider.speed || 0,
            shift: (dbRider.shift || 'Morning').toLowerCase() as any,
            lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : 0,
            phone: dbRider.contact || '',
            riderCode: dbRider.mkb_id
          };
          setRider(mappedRider);

          if (dbRider.zone_id) {
            const { data: dbZone } = await supabase
              .from('zones')
              .select('*')
              .eq('id', dbRider.zone_id)
              .maybeSingle();

            if (dbZone) {
              setZone({
                id: dbZone.id,
                name: dbZone.name,
                center: [dbZone.lat, dbZone.lng],
                radius: dbZone.radius,
                color: dbZone.color,
                status: dbZone.status
              });
            }
          } else {
            const zList = await getZones();
            if (zList.length > 0) {
              setZone(zList[0]);
            }
          }
        }
      } catch (err) {
        console.error('Error loading rider monitoring data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userId, riderId]);

  useEffect(() => {
    const loadRoute = async () => {
      if (!actualRiderId) return;
      setLoadingRoute(true);
      const points = await getRouteForRider(actualRiderId);
      setRoutePoints(points);
      setRouteStats(computeRouteStats(points));
      setLoadingRoute(false);
    };
    loadRoute();
  }, [actualRiderId]);

  const zoneCenterLat = zone?.center[0] ?? 6.9214;
  const zoneCenterLng = zone?.center[1] ?? 122.0790;
  const zoneRadius = zone?.radius ?? 1000;
  const zoneName = zone?.name ?? 'Talon-Talon';

  const anchor = useMemo(
    () => ({
      lat: zoneCenterLat + 0.0006,
      lng: zoneCenterLng + 0.0004
    }),
    [zoneCenterLat, zoneCenterLng]
  );

  const { position } = useGeolocation({
    initial: anchor,
    jitter: 0.00018
  });

  const distance = haversine(
    zoneCenterLat,
    zoneCenterLng,
    position.lat,
    position.lng
  );

  const inZone = distance <= zoneRadius;

  if (loading || !rider || !zone) {
    return <DashboardSkeleton page="monitoring" role="rider" />;
  }

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
        zoneName={zoneName}
        distance={distance}
        radius={zoneRadius} />

      {/* Today's Route Trail */}
      <div className="bg-white rounded-xl border border-[#EFEAE2] overflow-hidden">
        {/* Section header */}
        <div className="px-5 py-4 border-b border-[#EFEAE2] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#1A1410]">
              Today's Route
            </h3>
            <p className="text-xs text-[#888] mt-0.5">
              Your shift trail · {new Date().toLocaleDateString()}
            </p>
          </div>
          {routeStats && (
            <span className="text-xs font-mono text-[#db6c00] bg-[#FFF1E0] px-2 py-1 rounded-lg">
              {routeStats.totalDistanceKm} km today
            </span>
          )}
        </div>

        {/* Map or loading/empty state */}
        <div className="p-4">
          {loadingRoute ? (
            <div className="h-[340px] bg-[#F5F0E8] rounded-xl animate-pulse" />
          ) : routePoints.length < 2 ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-center gap-2">
              <p className="text-sm font-medium text-[#1A1410]">
                No route recorded yet
              </p>
              <p className="text-xs text-[#888]">
                Your route will appear here once your shift starts and GPS tracking begins
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
