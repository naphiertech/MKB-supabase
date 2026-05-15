import { useEffect, useRef, useState } from 'react';
import {
  riders as initialRiders,
  zones,
  violations as initialViolations,
  haversine,
  type Rider,
  type ViolationEvent } from
'../services/mockData';

type Listener = (v: ViolationEvent) => void;
const listeners: Set<Listener> = new Set();

export function onViolation(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Simulates Supabase realtime location updates.
 *
 * TODO: In production, replace the setInterval below with:
 *
 *   const channel = supabase
 *     .channel('rider-locations')
 *     .on('postgres_changes',
 *       { event: 'UPDATE', schema: 'public', table: 'rider_locations' },
 *       (payload) => setRiders((prev) => mergeUpdate(prev, payload.new))
 *     )
 *     .subscribe();
 *   return () => supabase.removeChannel(channel);
 */
export function useRealtimeLocation(): {
  riders: Rider[];
  violations: ViolationEvent[];
} {
  const [riderState, setRiderState] = useState<Rider[]>(initialRiders);
  const [violationState, setViolationState] =
  useState<ViolationEvent[]>(initialViolations);
  const tickRef = useRef(0);

  useEffect(() => {
    // Simulated realtime tick — replace with Supabase channel subscription
    const interval = setInterval(() => {
      tickRef.current += 1;
      setRiderState((prev) => {
        return prev.map((r) => {
          if (r.status === 'offline') return r;

          // Idle riders barely move
          const drift = r.status === 'idle' ? 0.00008 : 0.0006;
          const newLat = r.lat + (Math.random() - 0.5) * drift;
          const newLng = r.lng + (Math.random() - 0.5) * drift;

          // Check geofence
          const zone = zones.find((z) => z.id === r.zoneId);
          let newStatus = r.status;
          if (zone) {
            const distance = haversine(
              newLat,
              newLng,
              zone.center[0],
              zone.center[1]
            );
            const outside = distance > zone.radius;
            if (outside && r.status !== 'violation') {
              newStatus = 'violation';
              const evt: ViolationEvent = {
                id: `v-live-${Date.now()}-${r.id}`,
                riderId: r.id,
                riderName: r.name,
                zoneName: zone.name,
                ts: Date.now(),
                type: 'boundary_exit',
                read: false
              };
              // TODO: in production this would arrive via supabase channel
              setViolationState((vs) => [evt, ...vs].slice(0, 50));
              listeners.forEach((l) => l(evt));
            } else if (!outside && r.status === 'violation') {
              newStatus = 'active';
            }
          }

          return {
            ...r,
            lat: newLat,
            lng: newLng,
            status: newStatus,
            speed:
            r.status === 'idle' ?
            0 :
            Math.max(0, r.speed + (Math.random() - 0.5) * 6),
            lastPing: Date.now()
          };
        });
      });
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return { riders: riderState, violations: violationState };
}