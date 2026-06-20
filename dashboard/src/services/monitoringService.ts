import { supabase } from '../lib/supabaseClient';
import {
  type Rider,
  type RiderStatus,
  type ViolationEvent,
  type Zone,
  type ZoneStatus
} from './types';

interface DbRiderRow {
  id: string;
  name: string;
  face_image_url: string | null;
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

const mapRider = (row: DbRiderRow): Rider => {
  return {
    id: row.id,
    name: row.name,
    avatar: row.face_image_url || row.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
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
    lng: row.lng ?? undefined
  };
};

export async function getOnlineRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
    .from('riders')
    .select(`
      *,
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

  return (data || []).map(mapRider);
}

export async function getAllRiders(): Promise<Rider[]> {
  const { data, error } = await supabase
    .from('riders')
    .select(`
      *,
      zones (
        id,
        name
      )
    `);

  if (error) {
    console.error('Error fetching all riders:', error);
    return [];
  }

  return (data || []).map(mapRider);
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
}

export async function updateRiderStatus(
  riderId: string,
  status: 'active' | 'idle' | 'violation' | 'offline',
  lat: number,
  lng: number
): Promise<void> {
  const { error } = await supabase
    .from('riders')
    .update({
      status,
      lat,
      lng,
      last_ping: new Date().toISOString()
    })
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
  const { error } = await supabase
    .from('rider_locations')
    .insert({
      rider_id: riderId,
      lat,
      lng,
      status
    });

  if (error) {
    console.error('Error logging rider location:', error);
    throw error;
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
