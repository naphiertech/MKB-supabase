import { useEffect, useRef, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { updateRiderStatus } from '../services/monitoringService';
import { haversine } from '../lib/geofenceUtils';
import { type Rider, type ViolationEvent, type Zone, type ZoneStatus } from '../services/types';
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from '../lib/avatarCache';

function isPointInPolygon(point: [number, number], vs: [number, number][]) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}


interface ZoneRow {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  color: string;
  status: string | null;
  zone_type: string | null;
  polygon_coordinates: any | null;
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
  resolved: boolean;
  resolved_at: string | null;
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
          center: [row.lat || 0, row.lng || 0] as [number, number],
          radius: row.radius || 0,
          color: row.color,
          status: (row.status as ZoneStatus) ?? undefined,
          zone_type: (row.zone_type as any) ?? 'circle',
          polygon_coordinates: row.polygon_coordinates as [number, number][] | undefined
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
            lng: row.lng ?? undefined,
            resolved: row.resolved,
            resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined
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
          let outside = false;
          if (zone.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length > 0) {
            outside = !isPointInPolygon(
              [newLocation.lat, newLocation.lng],
              zone.polygon_coordinates
            );
          } else {
            const distance = haversine(
              newLocation.lat,
              newLocation.lng,
              zone.center[0],
              zone.center[1]
            );
            outside = distance > zone.radius;
          }

          if (outside && r.status !== 'violation') {
            newStatus = 'violation';
            
            // Persist the violation status on public.riders table.
            // The DB trigger handles inserting a row to violations table automatically.
            updateRiderStatus(r.id, 'violation', newLocation.lat, newLocation.lng)
              .catch(err => console.error('Failed to update rider status to violation:', err));

          } else if (!outside && r.status === 'violation') {
            newStatus = 'active';

            // Reset back to active status in database.
            // The DB trigger handles setting resolved = true automatically.
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
          lng: newViolation.lng ?? undefined,
          resolved: newViolation.resolved,
          resolvedAt: newViolation.resolved_at ? new Date(newViolation.resolved_at).getTime() : undefined
        };

        // Notify observers in real-time
        listeners.forEach((l) => l(evt));

        setViolationState((prevVs) => {
          if (prevVs.some((v) => v.id === evt.id)) return prevVs;
          return [evt, ...prevVs].slice(0, 50);
        });

        return currentRiders;
      });
    };

    // Event Handler: Update live violations resolved on backend
    const handleViolationUpdate = (updatedViolation: ViolationRow) => {
      setViolationState((prevVs) => {
        return prevVs.map((v) => {
          if (v.id === updatedViolation.id) {
            return {
              ...v,
              resolved: updatedViolation.resolved,
              resolvedAt: updatedViolation.resolved_at ? new Date(updatedViolation.resolved_at).getTime() : undefined
            };
          }
          return v;
        });
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
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'violations' },
        (payload) => {
          handleViolationUpdate(payload.new as unknown as ViolationRow);
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
