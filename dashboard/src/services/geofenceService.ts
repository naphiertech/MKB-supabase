import { supabase } from '../lib/supabaseClient';
import {
  type Zone,
  type ZoneStatus,
  type Rider,
  type RiderStatus
} from './types';
import { randomZoneColor } from '../lib/geofenceUtils';

export interface ZoneInput {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  status: ZoneStatus;
  riderIds: string[];
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

interface DbRiderRow {
  id: string;
  name: string;
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

const mapZone = (row: DbZoneRow): Zone => ({
  id: row.id,
  name: row.name,
  center: [row.lat, row.lng],
  radius: row.radius,
  color: row.color,
  status: row.status as ZoneStatus
});

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
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('zone_id', zoneId);

  if (error) {
    console.error('Error fetching riders in zone:', error);
    return [];
  }

  return (data || []).map((row: DbRiderRow) => ({
    id: row.id,
    name: row.name,
    avatar: row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
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

export async function createZone(input: ZoneInput): Promise<Zone> {
  const { data, error } = await supabase
    .from('zones')
    .insert({
      name: input.name.trim() || 'Untitled Zone',
      lat: input.lat,
      lng: input.lng,
      radius: input.radius,
      color: randomZoneColor(),
      status: input.status
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating zone:', error);
    throw error;
  }

  const newZone = mapZone(data);

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

  // Handle rider list re-allocations
  if (patch.riderIds !== undefined) {
    // Unassign riders currently in this zone who are not in the new patch.riderIds
    const { data: currentRiders, error: fetchRidersErr } = await supabase
      .from('riders')
      .select('id')
      .eq('zone_id', id);

    if (!fetchRidersErr && currentRiders) {
      const ridersToUnassign = currentRiders
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

  return { zone: zoneToDelete, unassignedRiderIds };
}

export async function assignRidersToZone(zoneId: string | null, riderIds: string[]): Promise<void> {
  if (riderIds.length === 0) return;

  const { error } = await supabase
    .from('riders')
    .update({ zone_id: zoneId })
    .in('id', riderIds);

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
