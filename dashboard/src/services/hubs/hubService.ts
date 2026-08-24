import { supabase } from '../../lib/supabaseClient';

export type HubAccessScope = 'global' | 'assigned';

export interface Hub {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HubManagementHub extends Hub {
  zoneCount: number;
  riderCount: number;
  staffCount: number;
}

export interface HubManagementZone {
  id: string;
  name: string;
  status: string;
  hubId: string | null;
  riderCount: number;
}

export interface HubManagementSnapshot {
  hubs: HubManagementHub[];
  zones: HubManagementZone[];
}

interface HubRow {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function mapHub(row: HubRow): Hub {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAccessibleHubs(options: { activeOnly?: boolean } = {}): Promise<Hub[]> {
  let query = supabase.from('hubs').select('id, name, description, active, created_at, updated_at').order('name');
  if (options.activeOnly !== false) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as HubRow[]).map(mapHub);
}

export async function createHub(input: { name: string; description?: string | null }): Promise<Hub> {
  const { data, error } = await supabase
    .from('hubs')
    .insert({ name: input.name.trim(), description: input.description?.trim() || null })
    .select('id, name, description, active, created_at, updated_at')
    .single();
  if (error) throw error;
  return mapHub(data as HubRow);
}

export async function updateHub(
  hubId: string,
  input: { name?: string; description?: string | null; active?: boolean },
): Promise<Hub> {
  const values: Record<string, string | boolean | null> = {};
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.description !== undefined) values.description = input.description?.trim() || null;
  if (input.active !== undefined) values.active = input.active;
  const { data, error } = await supabase
    .from('hubs')
    .update(values)
    .eq('id', hubId)
    .select('id, name, description, active, created_at, updated_at')
    .single();
  if (error) throw error;
  return mapHub(data as HubRow);
}

export async function getHubManagementSnapshot(): Promise<HubManagementSnapshot> {
  const { data, error } = await supabase.rpc('get_hub_management_snapshot');
  if (error) throw error;
  const raw = (data ?? {}) as {
    hubs?: Array<HubRow & { zone_count: number; rider_count: number; staff_count: number }>;
    zones?: Array<{ id: string; name: string; status: string; hub_id: string | null; rider_count: number }>;
  };
  return {
    hubs: (raw.hubs ?? []).map((hub) => ({
      ...mapHub(hub),
      zoneCount: Number(hub.zone_count ?? 0),
      riderCount: Number(hub.rider_count ?? 0),
      staffCount: Number(hub.staff_count ?? 0),
    })),
    zones: (raw.zones ?? []).map((zone) => ({
      id: zone.id,
      name: zone.name,
      status: zone.status,
      hubId: zone.hub_id,
      riderCount: Number(zone.rider_count ?? 0),
    })),
  };
}

export async function assignZoneToHub(zoneId: string, hubId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_zone_hub', { p_zone_id: zoneId, p_hub_id: hubId });
  if (error) throw error;
}

export async function setUserHubAccess(
  userId: string,
  scope: HubAccessScope,
  hubIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_hub_access', {
    p_user_id: userId,
    p_scope: scope,
    p_hub_ids: scope === 'assigned' ? hubIds : [],
  });
  if (error) throw error;
}
