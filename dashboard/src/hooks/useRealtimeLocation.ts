import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { type Rider, type ViolationEvent, type Zone, type ZoneStatus } from '../services/types';
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from '../lib/avatarCache';
import { getLastKnownLocation } from '../services/monitoringService';
import { getRiderWorkforceDirectory } from '../services/workforceDirectoryService';
import { useHub } from '../context/HubContext';


interface ZoneRow {
  id: string;
  hub_id: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  color: string;
  status: ZoneStatus | null;
  zone_type: 'circle' | 'polygon' | null;
  polygon_coordinates: [number, number][] | null;
}

interface RiderRow {
  id: string;
  hub_id: string;
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
  hub_id: string;
}

interface LocationRow {
  rider_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  status: string | null;
  recorded_at: string;
  hub_id: string;
}

interface RiderUpdateRow {
  id: string;
  hub_id: string;
  zone_id: string | null;
  status: Rider['status'];
  lat: number | null;
  lng: number | null;
  speed: number | null;
  last_ping: string | null;
}

interface UserEmploymentUpdateRow {
  rider_id: string | null;
  employment_status: 'active' | 'archived';
}

const MAX_LIVE_LOCATION_AGE_MS = 2 * 60 * 1000;

type Listener = (v: ViolationEvent) => void;
const listeners: Set<Listener> = new Set();

export function onViolation(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useRealtimeLocation(): {
  riders: Rider[];
  violations: ViolationEvent[];
  markLocalViolationRead: (id: string) => void;
  markAllLocalViolationsRead: () => void;
} {
  const { selectedHubId, workspaceKey, isReady: hubReady } = useHub();
  const [riderState, setRiderState] = useState<Rider[]>([]);
  const [violationState, setViolationState] = useState<ViolationEvent[]>([]);
  const [zoneState, setZoneState] = useState<Zone[]>([]);
  const zonesRef = useRef<Zone[]>([]);

  // Keep ref synchronized with latest zone state
  useEffect(() => {
    zonesRef.current = zoneState;
  }, [zoneState]);

  useEffect(() => {
    if (!hubReady) return;
    let active = true;

    // Load initial zones, active riders, and violations from Supabase
    async function loadInitialData() {
      try {
        // 1. Fetch zones
        const { data: zData } = await supabase
          .from('zones')
          .select('*');
        
        const mappedZones = (zData || []).map((row: ZoneRow) => {
          let center: [number, number] = [0, 0];
          if (row.lat !== null && row.lng !== null) {
            center = [row.lat, row.lng];
          } else if (row.polygon_coordinates && row.polygon_coordinates.length > 0) {
            const polyCoords = row.polygon_coordinates;
            const latSum = polyCoords.reduce((sum, c) => sum + c[0], 0);
            const lngSum = polyCoords.reduce((sum, c) => sum + c[1], 0);
            center = [latSum / polyCoords.length, lngSum / polyCoords.length];
          }
          
          return {
            id: row.id,
            hubId: row.hub_id,
            name: row.name,
            center,
            radius: row.radius || 0,
            color: row.color,
            status: row.status ?? undefined,
            zone_type: row.zone_type ?? 'circle',
            polygon_coordinates: row.polygon_coordinates || undefined
          };
        });

        if (active) setZoneState(mappedZones);

        // 2. Fetch current workforce riders. Historical riders remain in their
        // source tables but do not appear in live operational monitoring.
        const activeRiderIds = new Set(
          (await getRiderWorkforceDirectory({ scope: 'active' })).map((rider) => rider.id),
        );
        const { data: rData } = await supabase
          .from('riders')
          .select(`
            id,
            hub_id,
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
            zones!riders_zone_id_fkey (
              id,
              name
            )
          `);

        const mappedRiders = await Promise.all((rData || []).filter((row: RiderRow) => activeRiderIds.has(row.id)).map(async (row: RiderRow) => {
          let cached = getCachedAvatar(row.id);
          if (!cached) {
            const dbAvatar = await fetchRiderAvatar(row.id);
            if (dbAvatar) {
              setCachedAvatar(row.id, dbAvatar);
              cached = dbAvatar;
            }
          }

          let lat = row.lat ?? 0;
          let lng = row.lng ?? 0;
          let lastPing = row.last_ping ? new Date(row.last_ping).getTime() : 0;

          // ponytail: fallback to last known valid coordinates from rider_locations if table entry is 0,0
          if (lat === 0 && lng === 0) {
            const lastLoc = await getLastKnownLocation(row.id);
            if (lastLoc) {
              lat = lastLoc.lat;
              lng = lastLoc.lng;
              if (!lastPing && lastLoc.lastPing) {
                lastPing = lastLoc.lastPing;
              }
            }
          }

          return {
            id: row.id,
            hubId: row.hub_id,
            name: row.name,
            avatar: cached || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
            zoneId: row.zone_id,
            status: row.status as Rider['status'],
            lat,
            lng,
            speed: row.speed ?? 0,
            shift: row.shift as Rider['shift'],
            lastPing,
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

    const handleLocationInsert = async (newLocation: LocationRow) => {
      setRiderState((prevRiders) => {
        const riderIdx = prevRiders.findIndex((r) => r.id === newLocation.rider_id);
        if (riderIdx === -1) return prevRiders;

        const r = prevRiders[riderIdx];
        const recordedAt = new Date(newLocation.recorded_at).getTime();
        if (recordedAt <= r.lastPing || recordedAt < Date.now() - MAX_LIVE_LOCATION_AGE_MS) {
          return prevRiders;
        }
        const newStatus: Rider['status'] = newLocation.status as Rider['status'];

        const updatedRiders = [...prevRiders];
        updatedRiders[riderIdx] = {
          ...r,
          lat: newLocation.lat,
          lng: newLocation.lng,
          status: newStatus,
          speed: newLocation.speed ?? 0,
          lastPing: recordedAt
        };
        return updatedRiders;
      });
    };

    const handleRiderUpdate = (updatedRider: RiderUpdateRow) => {
      setRiderState((prevRiders) =>
        prevRiders.map((rider) =>
          rider.id === updatedRider.id
            ? {
                ...rider,
                zoneId: updatedRider.zone_id,
                status: updatedRider.status,
                lat: updatedRider.lat ?? rider.lat,
                lng: updatedRider.lng ?? rider.lng,
                speed: updatedRider.speed ?? 0,
                lastPing: updatedRider.last_ping
                  ? new Date(updatedRider.last_ping).getTime()
                  : rider.lastPing
              }
            : rider
        )
      );
    };

    const handleEmploymentUpdate = (updatedUser: UserEmploymentUpdateRow) => {
      if (!updatedUser.rider_id) return;
      if (updatedUser.employment_status === 'archived') {
        setRiderState((current) => current.filter((rider) => rider.id !== updatedUser.rider_id));
        return;
      }
      void loadInitialData();
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

    // Event Handler: Update live violations resolved or read status on backend
    const handleViolationUpdate = (updatedViolation: ViolationRow) => {
      setViolationState((prevVs) => {
        return prevVs.map((v) => {
          if (v.id === updatedViolation.id) {
            return {
              ...v,
              read: updatedViolation.read,
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
          const row = payload.new as unknown as LocationRow;
          if (!selectedHubId || row.hub_id === selectedHubId) handleLocationInsert(row);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'violations' },
        (payload) => {
          const row = payload.new as unknown as ViolationRow;
          if (!selectedHubId || row.hub_id === selectedHubId) handleViolationInsert(row);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'violations' },
        (payload) => {
          const row = payload.new as unknown as ViolationRow;
          if (!selectedHubId || row.hub_id === selectedHubId) handleViolationUpdate(row);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'riders' },
        (payload) => {
          const row = payload.new as unknown as RiderUpdateRow;
          if (!selectedHubId || row.hub_id === selectedHubId) handleRiderUpdate(row);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload) => {
          handleEmploymentUpdate(payload.new as unknown as UserEmploymentUpdateRow);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [hubReady, selectedHubId, workspaceKey]);

  const markLocalViolationRead = useCallback((id: string) => {
    setViolationState((prevVs) =>
      prevVs.map((v) => (v.id === id ? { ...v, read: true } : v))
    );
  }, []);

  const markAllLocalViolationsRead = useCallback(() => {
    setViolationState((prevVs) => prevVs.map((v) => ({ ...v, read: true })));
  }, []);

  return {
    riders: riderState,
    violations: violationState,
    markLocalViolationRead,
    markAllLocalViolationsRead
  };
}
