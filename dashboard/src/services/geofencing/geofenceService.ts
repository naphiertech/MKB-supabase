import { supabase } from '../../lib/supabaseClient';
import { getRiderWorkforceDirectory } from '../workforce/workforceDirectoryService';
import { logActivity } from '../../lib/apiService';
import {
  type Zone,
  type ZoneStatus,
  type Rider,
  type RiderStatus
} from '../types';
import { randomZoneColor } from '../../lib/geofenceUtils';

export interface ZoneInput {
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  status: ZoneStatus;
  riderIds: string[];
  zone_type: 'circle' | 'polygon';
  polygon_coordinates?: [number, number][] | null;
  color?: string;
}

export interface CreateZoneInput extends ZoneInput {
  hubId: string;
}

interface DbZoneRow {
  id: string;
  hub_id: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  color: string;
  status: string;
  zone_type: 'circle' | 'polygon';
  polygon_coordinates?: [number, number][] | null;
}

interface DbRiderRow {
  id: string;
  name: string;
  avatar_url: string | null;
  face_image_url: string | null;
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

const mapZone = (row: DbZoneRow): Zone => {
  const hasPolygonGeometry = row.zone_type === 'polygon'
    && Array.isArray(row.polygon_coordinates)
    && row.polygon_coordinates.length >= 3
    && row.polygon_coordinates.every((coordinate) => (
      Array.isArray(coordinate)
      && coordinate.length >= 2
      && coordinate.every(Number.isFinite)
    ));
  const hasCircleGeometry = row.zone_type === 'circle'
    && Number.isFinite(row.lat)
    && Number.isFinite(row.lng)
    && Number.isFinite(row.radius)
    && Number(row.radius) > 0;
  let center: [number, number] = [0, 0];
  if (row.lat !== null && row.lng !== null) {
    center = [row.lat, row.lng];
  } else if (row.polygon_coordinates && row.polygon_coordinates.length > 0) {
    const latSum = row.polygon_coordinates.reduce((sum, c) => sum + c[0], 0);
    const lngSum = row.polygon_coordinates.reduce((sum, c) => sum + c[1], 0);
    center = [latSum / row.polygon_coordinates.length, lngSum / row.polygon_coordinates.length];
  }

  return {
    id: row.id,
    hubId: row.hub_id,
    name: row.name,
    center,
    radius: row.radius || 0,
    color: row.color,
    status: row.status as ZoneStatus,
    zone_type: row.zone_type,
    polygon_coordinates: row.polygon_coordinates || undefined,
    hasValidGeometry: hasPolygonGeometry || hasCircleGeometry,
  };
};

export async function getZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching zones from Supabase:', error);
    return [];
  }

  return (data || []).map(mapZone);
}

export async function getZonesForHubs(hubIds: string[]): Promise<Zone[]> {
  if (hubIds.length === 0) return [];
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .in('hub_id', hubIds)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching authorized hub zones from Supabase:', error);
    return [];
  }
  return (data || []).map(mapZone);
}

export async function listZones(): Promise<Zone[]> {
  return getZones();
}

export async function getZoneById(id: string): Promise<Zone | undefined> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return undefined;
  return mapZone(data);
}

export async function ridersInZone(zoneId: string): Promise<Rider[]> {
  const activeIds = new Set((await getRiderWorkforceDirectory({ scope: 'active' })).map((rider) => rider.id));
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('zone_id', zoneId);

  if (error) {
    console.error('Error fetching riders in zone:', error);
    return [];
  }

  return (data || []).filter((row: DbRiderRow) => activeIds.has(row.id)).map((row: DbRiderRow) => ({
    id: row.id,
    name: row.name,
    avatar: row.face_image_url || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
    zoneId: row.zone_id,
    status: row.status as RiderStatus,
    lat: row.lat || 0,
    lng: row.lng || 0,
    speed: row.speed || 0,
    shift: row.shift as Rider['shift'],
    lastPing: row.last_ping ? new Date(row.last_ping).getTime() : 0,
    phone: row.contact || '',
    riderCode: row.mkb_id
  }));
}

export async function riderCountByZone(): Promise<Record<string, number>> {
  const activeIds = new Set((await getRiderWorkforceDirectory({ scope: 'active' })).map((rider) => rider.id));
  const { data, error } = await supabase
    .from('riders')
    .select('id, zone_id');

  const counts: Record<string, number> = {};
  const allZones = await getZones();

  for (const z of allZones) {
    counts[z.id] = 0;
  }

  if (!error && data) {
    for (const r of data) {
      if (!activeIds.has(r.id)) continue;
      if (r.zone_id && counts[r.zone_id] !== undefined) {
        counts[r.zone_id] += 1;
      }
    }
  }

  return counts;
}

export async function violationsTodayByZone(): Promise<Record<string, number>> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('violations')
    .select('id, zone_id, created_at')
    .gte('created_at', startOfDay.toISOString());

  const counts: Record<string, number> = {};
  const allZones = await getZones();

  for (const z of allZones) {
    counts[z.id] = 0;
  }

  if (!error && data) {
    for (const v of data) {
      if (v.zone_id && counts[v.zone_id] !== undefined) {
        counts[v.zone_id] += 1;
      }
    }
  }

  return counts;
}

export async function totalViolationsToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('violations')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', startOfDay.toISOString());

  if (error) {
    console.error('Error counting today violations:', error);
    return 0;
  }

  return count || 0;
}

export async function createZone(input: CreateZoneInput): Promise<Zone> {
  if (!input.hubId) throw new Error('Assigned hub is required.');
  const { data, error } = await supabase
    .from('zones')
    .insert({
      name: input.name.trim() || 'Untitled Zone',
      hub_id: input.hubId,
      lat: input.lat,
      lng: input.lng,
      radius: input.radius,
      color: input.color || randomZoneColor(),
      status: input.status,
      zone_type: input.zone_type,
      polygon_coordinates: input.polygon_coordinates
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating zone:', error);
    throw error;
  }
  if (!data) throw new Error('The database did not return the created zone.');

  const newZone = mapZone(data);

  logActivity({
    eventType: 'zone_created',
    description: `Created new zone: "${newZone.name}" (${newZone.zone_type}) with radius ${newZone.radius}m.`,
    metadata: { zone_id: newZone.id, name: newZone.name, radius: newZone.radius, zone_type: newZone.zone_type }
  }).catch(err => console.warn('Failed to log zone creation:', err));

  if (input.riderIds && input.riderIds.length > 0) {
    await assignRidersToZone(newZone.id, input.riderIds);
  }

  return newZone;
}

export async function updateZone(id: string, patch: Partial<ZoneInput>): Promise<Zone | null> {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.lat !== undefined) updates.lat = patch.lat;
  if (patch.lng !== undefined) updates.lng = patch.lng;
  if (patch.radius !== undefined) updates.radius = patch.radius;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.zone_type !== undefined) updates.zone_type = patch.zone_type;
  if (patch.polygon_coordinates !== undefined) updates.polygon_coordinates = patch.polygon_coordinates;
  if (patch.color !== undefined) updates.color = patch.color;

  const { data, error } = await supabase
    .from('zones')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.error('Error updating zone:', error);
    return null;
  }

  const updated = mapZone(data);

  logActivity({
    eventType: 'zone_updated',
    description: `Updated zone "${updated.name}" settings.`,
    metadata: { zone_id: id, patch }
  }).catch(err => console.warn('Failed to log zone update:', err));

  // Handle rider list re-allocations
  if (patch.riderIds !== undefined) {
    const activeIds = new Set((await getRiderWorkforceDirectory({ scope: 'active' })).map((rider) => rider.id));
    // Unassign riders currently in this zone who are not in the new patch.riderIds
    const { data: currentRiders, error: fetchRidersErr } = await supabase
      .from('riders')
      .select('id')
      .eq('zone_id', id);

    if (!fetchRidersErr && currentRiders) {
      const ridersToUnassign = currentRiders
        .filter((r: { id: string }) => activeIds.has(r.id))
        .map((r: { id: string }) => r.id)
        .filter((rId: string) => !patch.riderIds!.includes(rId));

      if (ridersToUnassign.length > 0) {
        await supabase
          .from('riders')
          .update({ zone_id: null })
          .in('id', ridersToUnassign);
      }
    }

    // Assign the newly selected riders
    if (patch.riderIds.length > 0) {
      await assignRidersToZone(id, patch.riderIds);
    }
  }

  return updated;
}

export async function deleteZone(id: string): Promise<{
  zone: Zone | null;
  unassignedRiderIds: string[];
}> {
  const zoneToDelete = await getZoneById(id);
  if (!zoneToDelete) {
    return { zone: null, unassignedRiderIds: [] };
  }

  const { data: assignedRiders } = await supabase
    .from('riders')
    .select('id')
    .eq('zone_id', id);

  const unassignedRiderIds = assignedRiders ? assignedRiders.map((r: { id: string }) => r.id) : [];

  const { error } = await supabase
    .from('zones')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting zone from database:', error);
    return { zone: null, unassignedRiderIds: [] };
  }

  logActivity({
    eventType: 'zone_deleted',
    description: `Deleted zone "${zoneToDelete.name}". Unassigned ${unassignedRiderIds.length} riders.`,
    metadata: { zone_id: id, name: zoneToDelete.name, unassigned_riders_count: unassignedRiderIds.length }
  }).catch(err => console.warn('Failed to log zone deletion:', err));

  return { zone: zoneToDelete, unassignedRiderIds };
}

export async function assignRidersToZone(zoneId: string | null, riderIds: string[]): Promise<void> {
  if (riderIds.length === 0) return;
  const activeIds = new Set((await getRiderWorkforceDirectory({ scope: 'active' })).map((rider) => rider.id));
  const eligibleRiderIds = riderIds.filter((riderId) => activeIds.has(riderId));
  if (eligibleRiderIds.length === 0) return;

  const targetZone = zoneId
    ? await supabase.from('zones').select('hub_id').eq('id', zoneId).single()
    : null;
  if (targetZone?.error) throw targetZone.error;
  const { error } = await supabase
    .from('riders')
    .update({
      zone_id: zoneId,
      ...(targetZone ? { hub_id: targetZone.data.hub_id } : {}),
    })
    .in('id', eligibleRiderIds);

  if (error) {
    console.error('Error assigning riders to zone:', error);
    throw error;
  }
}

export async function setZoneStatus(id: string, status: ZoneStatus): Promise<void> {
  const { error } = await supabase
    .from('zones')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating zone status:', error);
    throw error;
  }
}
