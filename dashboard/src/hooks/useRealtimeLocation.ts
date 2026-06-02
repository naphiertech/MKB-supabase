import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logViolation, updateRiderStatus } from '../services/monitoringService';
import { haversine } from '../lib/geofenceUtils';
import { type Rider, type ViolationEvent, type Zone } from '../services/types';

type Listener = (v: ViolationEvent) => void;
const listeners: Set<Listener> = new Set();

export function onViolation(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRealtimeLocation(): {
  riders: Rider[];
  violations: ViolationEvent[];
} {
  const [riderState, setRiderState] = useState<Rider[]>([]);
  const [violationState, setViolationState] = useState<ViolationEvent[]>([]);
  const [zoneState, setZoneState] = useState<Zone[]>([]);
  const zonesRef = useRef<Zone[]>([]);

  // Keep ref synchronized with latest zone state
  useEffect(() => {
    zonesRef.current = zoneState;
  }, [zoneState]);

  useEffect(() => {
    let active = true;

    // Load initial zones, active riders, and violations from Supabase
    async function loadInitialData() {
      try {
        // 1. Fetch zones
        const { data: zData } = await supabase
          .from('zones')
          .select('*');
        
        const mappedZones = (zData || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          center: [row.lat, row.lng] as [number, number],
          radius: row.radius,
          color: row.color,
          status: row.status
        }));

        if (active) setZoneState(mappedZones);

        // 2. Fetch all riders
        const { data: rData } = await supabase
          .from('riders')
          .select(`
            *,
            zones (
              id,
              name
            )
          `);

        const mappedRiders = (rData || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          avatar: row.face_image_url || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
          zoneId: row.zone_id,
          status: row.status,
          lat: row.lat || 0,
          lng: row.lng || 0,
          speed: row.speed || 0,
          shift: row.shift,
          lastPing: row.last_ping ? new Date(row.last_ping).getTime() : Date.now(),
          phone: row.contact || '',
          riderCode: row.mkb_id
        }));

        if (active) setRiderState(mappedRiders);

        // 3. Fetch latest 50 violations
        const { data: vData } = await supabase
          .from('violations')
          .select(`
            *,
            riders (
              name
            )
          `)
          .order('created_at', { ascending: false })
          .limit(50);

        const mappedViolations = (vData || []).map((row: any) => {
          const riderName = row.riders?.name || 'Unknown Rider';
          return {
            id: row.id,
            riderId: row.rider_id,
            riderName: riderName,
            zoneName: row.zone_name || 'No Zone',
            ts: new Date(row.created_at).getTime(),
            type: row.type as 'boundary_exit' | 'boundary_enter' | 'idle_excess',
            read: row.read
          };
        });

        if (active) setViolationState(mappedViolations);
      } catch (err) {
        console.error('Error loading initial realtime location data:', err);
      }
    }

    loadInitialData();

    // Event Handler: Process incoming live rider GPS coordinate logs
    const handleLocationInsert = async (newLocation: any) => {
      setRiderState((prevRiders) => {
        const riderIdx = prevRiders.findIndex((r) => r.id === newLocation.rider_id);
        if (riderIdx === -1) return prevRiders;

        const r = prevRiders[riderIdx];
        let newStatus: Rider['status'] = newLocation.status;

        // Fetch corresponding zone details from our thread-safe zonesRef
        const zone = zonesRef.current.find((z) => z.id === r.zoneId);
        
        if (zone) {
          const distance = haversine(
            newLocation.lat,
            newLocation.lng,
            zone.center[0],
            zone.center[1]
          );
          const outside = distance > zone.radius;

          if (outside && r.status !== 'violation') {
            newStatus = 'violation';
            
            // 1. Log violation row into Supabase violations table
            logViolation({
              riderId: r.id,
              zoneId: zone.id,
              zoneName: zone.name,
              lat: newLocation.lat,
              lng: newLocation.lng,
              type: 'boundary_exit'
            }).catch(err => console.error('Failed to log geofence violation:', err));

            // 2. Persist the violation status on public.riders table
            updateRiderStatus(r.id, 'violation', newLocation.lat, newLocation.lng)
              .catch(err => console.error('Failed to update rider status to violation:', err));

            // 3. Construct live alert event
            const evt: ViolationEvent = {
              id: `v-live-${Date.now()}-${r.id}`,
              riderId: r.id,
              riderName: r.name,
              zoneName: zone.name,
              ts: Date.now(),
              type: 'boundary_exit',
              read: false
            };

            // 4. Notify all operational observers (audio alert / header indicators)
            listeners.forEach((l) => l(evt));

            // 5. Prepend immediately to the active violations list
            setViolationState((prevVs) => {
              // Throttles coordinate noise updates within 5s
              if (prevVs.some(v => v.riderId === r.id && v.type === 'boundary_exit' && Date.now() - v.ts < 5000)) {
                return prevVs;
              }
              return [evt, ...prevVs].slice(0, 50);
            });

          } else if (!outside && r.status === 'violation') {
            newStatus = 'active';

            // Reset back to active status in database
            updateRiderStatus(r.id, 'active', newLocation.lat, newLocation.lng)
              .catch(err => console.error('Failed to resolve geofence boundary:', err));
          }
        }

        const updatedRiders = [...prevRiders];
        updatedRiders[riderIdx] = {
          ...r,
          lat: newLocation.lat,
          lng: newLocation.lng,
          status: newStatus,
          speed: newLocation.speed || 0,
          lastPing: new Date(newLocation.recorded_at).getTime()
        };
        return updatedRiders;
      });
    };

    // Event Handler: Prepend live violations inserted on backend
    const handleViolationInsert = (newViolation: any) => {
      setRiderState((currentRiders) => {
        const rider = currentRiders.find((r) => r.id === newViolation.rider_id);
        const riderName = rider?.name || 'Rider Alert';

        const evt: ViolationEvent = {
          id: newViolation.id,
          riderId: newViolation.rider_id,
          riderName: riderName,
          zoneName: newViolation.zone_name || 'No Zone',
          ts: new Date(newViolation.created_at).getTime(),
          type: newViolation.type,
          read: newViolation.read
        };

        setViolationState((prevVs) => {
          if (prevVs.some((v) => v.id === evt.id)) return prevVs;
          return [evt, ...prevVs].slice(0, 50);
        });

        return currentRiders;
      });
    };

    // Initialize unified Supabase Realtime postgres changes channel
    const channelId = `live-locations-${Math.random().toString(36).slice(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rider_locations' },
        (payload) => {
          handleLocationInsert(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'violations' },
        (payload) => {
          handleViolationInsert(payload.new);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { riders: riderState, violations: violationState };
}
