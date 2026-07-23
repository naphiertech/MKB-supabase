import { supabase } from '../lib/supabaseClient';
import {
  type Rider,
  type RiderStatus,
  type ViolationEvent,
  type Zone,
  type ZoneStatus
} from './types';
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from '../lib/avatarCache';
import { getStorageAdapter } from '../lib/storage';


interface DbRiderRow {
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
  mkb_id: string;
}

interface DbViolationRow {
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

interface DbZoneRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  color: string;
  status: string;
}

const mapRider = (row: DbRiderRow, cachedAvatar?: string | null): Rider => {
  return {
    id: row.id,
    name: row.name,
    avatar: cachedAvatar || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
    zoneId: row.zone_id,
    status: row.status as RiderStatus,
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    speed: row.speed ?? 0,
    shift: row.shift as Rider['shift'],
    lastPing: row.last_ping ? new Date(row.last_ping).getTime() : 0,
    phone: row.contact || '',
    riderCode: row.mkb_id
  };
};

const mapViolation = (row: DbViolationRow): ViolationEvent => {
  const rider = row.riders;
  return {
    id: row.id,
    riderId: row.rider_id,
    riderName: rider?.name || 'Unknown Rider',
    zoneName: row.zone_name || 'No Zone',
    ts: new Date(row.created_at).getTime(),
    type: row.type as 'boundary_exit' | 'boundary_enter' | 'idle_excess',
    read: row.read,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    resolved: row.resolved,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined
  };
};

export async function getOnlineRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
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
    `)
    .neq('status', 'offline');

  if (error) {
    console.error('Error fetching online riders:', error);
    return [];
  }

  const riders = await Promise.all((data || []).map(async (row: DbRiderRow) => {
    let cached = getCachedAvatar(row.id);
    if (!cached) {
      const dbAvatar = await fetchRiderAvatar(row.id);
      if (dbAvatar) {
        setCachedAvatar(row.id, dbAvatar);
        cached = dbAvatar;
      }
    }
    return mapRider(row, cached);
  }));

  return riders;
}

export async function getAllRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
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

  if (error) {
    console.error('Error fetching all riders:', error);
    return [];
  }

  const riders = await Promise.all((data || []).map(async (row: DbRiderRow) => {
    let cached = getCachedAvatar(row.id);
    if (!cached) {
      const dbAvatar = await fetchRiderAvatar(row.id);
      if (dbAvatar) {
        setCachedAvatar(row.id, dbAvatar);
        cached = dbAvatar;
      }
    }
    return mapRider(row, cached);
  }));

  return riders;
}

export async function getZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching zones:', error);
    return [];
  }

  return (data || []).map((row: DbZoneRow) => ({
    id: row.id,
    name: row.name,
    center: [row.lat, row.lng],
    radius: row.radius,
    color: row.color,
    status: row.status as ZoneStatus
  }));
}

export async function getViolations(): Promise<ViolationEvent[]> {
  const { data, error } = await supabase
    .from('violations')
    .select(`
      *,
      riders (
        name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching violations:', error);
    return [];
  }

  return (data || []).map(mapViolation);
}

export async function getTodayViolations(): Promise<ViolationEvent[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('violations')
    .select(`
      *,
      riders (
        name
      )
    `)
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching today violations:', error);
    return [];
  }

  return (data || []).map(mapViolation);
}

export async function markViolationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('violations')
    .update({ read: true })
    .eq('id', id);

  if (error) {
    console.error('Error marking violation read:', error);
    throw error;
  }

  // Synchronously update the corresponding notification in the notifications table to keep Topbar in sync
  const { error: notifError } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('violation_id', id)
    .eq('read', false);

  if (notifError) {
    console.warn(`Warning: Failed to mark notification for violation ${id} as read:`, notifError);
  }
}

export async function markAllViolationsRead(): Promise<void> {
  const { error } = await supabase
    .from('violations')
    .update({ read: true })
    .eq('read', false);

  if (error) {
    console.error('Error marking all violations read:', error);
    throw error;
  }

  // Synchronously update the corresponding notifications in the notifications table to keep Topbar in sync
  const { error: notifError } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('type', 'violation')
    .eq('read', false);

  if (notifError) {
    console.warn('Warning: Failed to mark all violation notifications read:', notifError);
  }
}

export async function getLastKnownLocation(
  riderId: string
): Promise<{ lat: number; lng: number; lastPing?: number } | null> {
  // ponytail: query most recent valid GPS log from rider_locations table
  const { data, error } = await supabase
    .from('rider_locations')
    .select('lat, lng, recorded_at')
    .eq('rider_id', riderId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || (data.lat === 0 && data.lng === 0)) return null;

  return {
    lat: data.lat,
    lng: data.lng,
    lastPing: data.recorded_at ? new Date(data.recorded_at).getTime() : undefined
  };
}

export async function updateRiderStatus(
  riderId: string,
  status: 'active' | 'idle' | 'violation' | 'offline',
  lat: number,
  lng: number
): Promise<void> {
  const updateData: {
    status: 'active' | 'idle' | 'violation' | 'offline';
    last_ping: string;
    lat?: number;
    lng?: number;
  } = {
    status,
    last_ping: new Date().toISOString()
  };

  // ponytail: preserve last known valid coordinates when lat & lng are 0
  if (lat !== 0 || lng !== 0) {
    updateData.lat = lat;
    updateData.lng = lng;
  }

  const { error } = await supabase
    .from('riders')
    .update(updateData)
    .eq('id', riderId);

  if (error) {
    console.error('Error updating rider status:', error);
    throw error;
  }
}

export async function logRiderLocation(
  riderId: string,
  lat: number,
  lng: number,
  status: 'active' | 'idle' | 'violation' | 'offline'
): Promise<void> {
  if (!navigator.onLine) {
    console.log('[OfflineSync] Offline detected. Queuing LOCATION_PING...');
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'LOCATION_PING',
        payload: {
          rider_id: riderId,
          lat,
          lng,
          status,
          recorded_at: new Date().toISOString()
        },
        priority: 3
      });
    } catch (err) {
      console.warn('[OfflineSync] Failed to enqueue LOCATION_PING event:', err);
    }
    return;
  }

  const { error } = await supabase
    .from('rider_locations')
    .insert({
      rider_id: riderId,
      lat,
      lng,
      status
    });

  if (error) {
    console.error('Error logging rider location on Supabase, falling back to local queue:', error);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'LOCATION_PING',
        payload: {
          rider_id: riderId,
          lat,
          lng,
          status,
          recorded_at: new Date().toISOString()
        },
        priority: 3
      });
    } catch (err) {
      console.warn('[OfflineSync] Failed to enqueue LOCATION_PING fallback event:', err);
    }
  }
}

export async function logViolation(violation: {
  riderId: string;
  zoneId?: string;
  zoneName?: string;
  lat?: number;
  lng?: number;
  type: 'boundary_exit' | 'idle_timeout' | 'manual_flag';
}): Promise<void> {
  const { error } = await supabase
    .from('violations')
    .insert({
      rider_id: violation.riderId,
      zone_id: violation.zoneId || null,
      zone_name: violation.zoneName || null,
      lat: violation.lat || null,
      lng: violation.lng || null,
      type: violation.type
    });

  if (error) {
    console.error('Error logging violation:', error);
    throw error;
  }
}
