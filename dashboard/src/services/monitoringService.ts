import { supabase } from '../lib/supabaseClient';
import { getRiderWorkforceDirectory, type WorkforceScope } from './workforceDirectoryService';
import {
  type Rider,
  type RiderStatus,
  type ViolationEvent,
  type Zone,
  type ZoneStatus
} from './types';
import { getCachedAvatar, setCachedAvatar, fetchRiderAvatar } from '../lib/avatarCache';
import { createSyncOperationId, getStorageAdapter } from '../lib/storage';
import { dispatchNotificationSafe } from './notificationService';

// In-memory spam prevention cooldown map: riderId_status -> lastNotifiedTimestamp
const violationCooldownMap = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown per rider per violation type


interface DbRiderRow {
  id: string;
  hub_id: string | null;
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
  zone_id: string | null;
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
    hubId: row.hub_id,
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
    zoneId: row.zone_id ?? undefined,
    zoneName: row.zone_name || 'No Zone',
    ts: new Date(row.created_at).getTime(),
    type: row.type as ViolationEvent['type'],
    read: row.read,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    resolved: row.resolved,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined
  };
};

export async function getOnlineRiders(): Promise<Rider[]> {
  const activeIds = new Set((await getRiderWorkforceDirectory({ scope: 'active' })).map((rider) => rider.id));
  const { data, error } = await supabase
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
    `)
    .neq('status', 'offline');

  if (error) {
    console.error('Error fetching online riders:', error);
    return [];
  }

  const riders = await Promise.all((data || []).filter((row: DbRiderRow) => activeIds.has(row.id)).map(async (row: DbRiderRow) => {
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

export async function getAllRiders(options: { scope: WorkforceScope; date?: string }): Promise<Rider[]> {
  const includedIds = new Set((await getRiderWorkforceDirectory(options)).map((rider) => rider.id));
  const { data, error } = await supabase
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

  if (error) {
    console.error('Error fetching all riders:', error);
    return [];
  }

  const riders = await Promise.all((data || []).filter((row: DbRiderRow) => includedIds.has(row.id)).map(async (row: DbRiderRow) => {
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

export async function getViolationsForReport(options: {
  from: string;
  to: string;
  zoneIds: string[];
}): Promise<ViolationEvent[]> {
  const pageSize = 500;
  const violations: ViolationEvent[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('violations')
      .select(`
        *,
        riders (
          name
        )
      `)
      .gte('created_at', `${options.from}T00:00:00+08:00`)
      .lte('created_at', `${options.to}T23:59:59.999+08:00`);

    if (options.zoneIds.length > 0) {
      query = query.in('zone_id', options.zoneIds);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Error fetching violations for report:', error);
      throw error;
    }

    const page = (data ?? []) as unknown as DbViolationRow[];
    violations.push(...page.map(mapViolation));
    hasMore = page.length === pageSize;
    offset += pageSize;
  }

  return violations;
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
  lat?: number,
  lng?: number
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
  if (lat != null && lng != null && (lat !== 0 || lng !== 0)) {
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

  // Non-blocking notification dispatch for geofence / idle violations with cooldown
  if (status === 'violation') {
    const cooldownKey = `${riderId}_violation`;
    const lastNotified = violationCooldownMap.get(cooldownKey) || 0;
    const now = Date.now();

    if (now - lastNotified > COOLDOWN_MS) {
      violationCooldownMap.set(cooldownKey, now);
      void dispatchNotificationSafe({
        category: 'geofence',
        priority: 'high',
        type: 'violation',
        title: 'Geofence Boundary Exit',
        message: `Rider geofence violation detected`,
        riderId,
        actionLink: '/monitoring',
        targetRoles: ['admin', 'hr']
      });
    }
  }
}

export async function logRiderLocation(
  riderId: string,
  lat: number,
  lng: number,
  status: 'active' | 'idle' | 'violation' | 'offline'
): Promise<void> {
  const locationId = createSyncOperationId();
  const eventTimestamp = new Date().toISOString();
  const queuedOperation = {
    action: 'LOCATION_PING' as const,
    riderId,
    idempotencyKey: locationId,
    eventTimestamp,
    payload: {
      rider_id: riderId,
      lat,
      lng,
      status,
      recorded_at: eventTimestamp
    },
    priority: 3
  };

  if (!navigator.onLine) {
    console.log('[OfflineSync] Offline detected. Queuing LOCATION_PING...');
    try {
      const storage = getStorageAdapter();
      await storage.enqueue(queuedOperation);
    } catch (err) {
      console.error('[OfflineSync] Failed to enqueue LOCATION_PING event:', err);
      throw new Error('Unable to save location for later synchronization.');
    }
    return;
  }

  const { error } = await supabase
    .from('rider_locations')
    .insert({
      id: locationId,
      rider_id: riderId,
      lat,
      lng,
      status,
      recorded_at: eventTimestamp
    });

  if (error) {
    if (error.code === '23505') return;
    console.error('Error logging rider location on Supabase, falling back to local queue:', error);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue(queuedOperation);
    } catch (err) {
      console.error('[OfflineSync] Failed to enqueue LOCATION_PING fallback event:', err);
      throw new Error('Unable to save location for later synchronization.');
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
