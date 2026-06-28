import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { logViolation, updateRiderStatus } from '../services/monitoringService';
import { haversine } from '../lib/geofenceUtils';
import { type Rider, type ViolationEvent, type Zone, type ZoneStatus } from '../services/types';
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from '../lib/avatarCache';


interface ZoneRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  color: string;
  status: string | null;
}

interface RiderRow {
  id: string;
  name: string;
  face_image_url?: string | null;
  avatar_url: string | null;
  zone_id: string | null;
  status: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  shift: string;
  last_ping: string | null;
  contact: string | null;
  mkb_id: string | null;
}

interface ViolationRow {
  id: string;
  rider_id: string;
  zone_name: string | null;
  created_at: string;
  type: string;
  read: boolean;
  lat: number | null;
  lng: number | null;
  riders: { name: string } | null;
}

interface LocationRow {
  rider_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  status: string | null;
  recorded_at: string;
}

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
        
        const mappedZones = (zData || []).map((row: ZoneRow) => ({
          id: row.id,
          name: row.name,
          center: [row.lat, row.lng] as [number, number],
          radius: row.radius,
          color: row.color,
          status: (row.status as ZoneStatus) ?? undefined
        }));

        if (active) setZoneState(mappedZones);

        // 2. Fetch all riders
        const { data: rData } = await supabase
          .from('riders')
          .select(`
            id,
            name,
            avatar_url,
            zone_id,
            status,
            lat,
            lng,
            speed,
            shift,
            last_ping,
            contact,
            mkb_id,
            zones (
              id,
              name
            )
          `);

        const mappedRiders = await Promise.all((rData || []).map(async (row: RiderRow) => {
          let cached = getCachedAvatar(row.id);
          if (!cached) {
            const dbAvatar = await fetchRiderAvatar(row.id);
            if (dbAvatar) {
              setCachedAvatar(row.id, dbAvatar);
              cached = dbAvatar;
            }
          }
          return {
            id: row.id,
            name: row.name,
            avatar: cached || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
            zoneId: row.zone_id,
            status: row.status as Rider['status'],
            lat: row.lat ?? 0,
            lng: row.lng ?? 0,
            speed: row.speed ?? 0,
            shift: row.shift as Rider['shift'],
            lastPing: row.last_ping ? new Date(row.last_ping).getTime() : 0,
            phone: row.contact ?? '',
            riderCode: row.mkb_id ?? ''
          };
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

        const mappedViolations = (vData || []).map((row: ViolationRow) => {
          const riderName = row.riders?.name || 'Unknown Rider';
          return {
            id: row.id,
            riderId: row.rider_id,
            riderName: riderName,
            zoneName: row.zone_name || 'No Zone',
            ts: new Date(row.created_at).getTime(),
            type: row.type as ViolationEvent['type'],
            read: row.read,
            lat: row.lat ?? undefined,
            lng: row.lng ?? undefined
          };
        });

        if (active) setViolationState(mappedViolations);
      } catch (err) {
        console.error('Error loading initial realtime location data:', err);
      }
    }

    loadInitialData();

    // Event Handler: Process incoming live rider GPS coordinate logs
    const handleLocationInsert = async (newLocation: LocationRow) => {
      setRiderState((prevRiders) => {
        const riderIdx = prevRiders.findIndex((r) => r.id === newLocation.rider_id);
        if (riderIdx === -1) return prevRiders;

        const r = prevRiders[riderIdx];
        let newStatus: Rider['status'] = newLocation.status as Rider['status'];

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
              read: false,
              lat: newLocation.lat,
              lng: newLocation.lng
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
    const handleViolationInsert = (newViolation: ViolationRow) => {
      setRiderState((currentRiders) => {
        const rider = currentRiders.find((r) => r.id === newViolation.rider_id);
        const riderName = rider?.name || 'Rider Alert';

        const evt: ViolationEvent = {
          id: newViolation.id,
          riderId: newViolation.rider_id,
          riderName: riderName,
          zoneName: newViolation.zone_name || 'No Zone',
          ts: new Date(newViolation.created_at).getTime(),
          type: newViolation.type as ViolationEvent['type'],
          read: newViolation.read,
          lat: newViolation.lat ?? undefined,
          lng: newViolation.lng ?? undefined
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
          handleLocationInsert(payload.new as unknown as LocationRow);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'violations' },
        (payload) => {
          handleViolationInsert(payload.new as unknown as ViolationRow);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const ridersWithUnreadViolations = useMemo(() => {
    return riderState.map((r) => {
      const unreadV = violationState.find((v) => v.riderId === r.id && !v.read);
      if (unreadV) {
        return {
          ...r,
          status: 'violation' as const,
          lat: r.lat === 0 || r.status === 'offline' ? (unreadV.lat ?? r.lat) : r.lat,
          lng: r.lng === 0 || r.status === 'offline' ? (unreadV.lng ?? r.lng) : r.lng,
        };
      }
      return r;
    });
  }, [riderState, violationState]);

  return { riders: ridersWithUnreadViolations, violations: violationState };
}
