import { useMemo } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import {
  riders as ALL_RIDERS,
  zones as ALL_ZONES,
  haversine } from
'../services/mockData';
import { useGeolocation } from '../hooks/useGeolocation';
import { RiderMap } from '../components/maps/RiderMap';
import { GeofenceStatus } from '../components/rider/GeofenceStatus';
interface RiderMonitoringProps {
  userId: string;
  onBack: () => void;
}
export function RiderMonitoring({ userId, onBack }: RiderMonitoringProps) {
  const riderId = userId.replace(/^u-rider-/, '');
  const rider = ALL_RIDERS.find((r) => r.id === riderId) ?? ALL_RIDERS[0];
  const zone = ALL_ZONES.find((z) => z.id === rider.zoneId) ?? ALL_ZONES[0];
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
      
    </div>);

}