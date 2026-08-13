import { supabase } from '../lib/supabaseClient';

export type RiderAssignmentType = 'permanent_transfer' | 'temporary_deployment' | 'home_assignment' | 'unassigned';
export type RiderAssignmentStatus = 'active' | 'completed' | 'ended_early' | 'expired' | 'unassigned';

export interface RiderAssignmentRow {
  riderId: string;
  riderName: string;
  riderCode: string;
  riderAvatar?: string | null;
  homeHubId: string | null;
  homeHubName: string | null;
  operationalHubId: string | null;
  operationalHubName: string | null;
  homeZoneId: string | null;
  homeZoneName: string | null;
  operationalZoneId: string | null;
  operationalZoneName: string | null;
  assignmentId: string | null;
  assignmentType: RiderAssignmentType;
  startDate: string | null;
  endDate: string | null;
  status: RiderAssignmentStatus;
}

export interface RiderAssignmentHistoryItem {
  id: string;
  riderId: string;
  assignmentType: Exclude<RiderAssignmentType, 'home_assignment' | 'unassigned'>;
  fromHubName: string | null;
  fromZoneName: string | null;
  targetHubName: string;
  targetZoneName: string;
  startDate: string;
  endDate: string | null;
  status: Exclude<RiderAssignmentStatus, 'unassigned'>;
  reason: string;
  createdByName: string | null;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
}

export interface RiderAssignmentWorkspace {
  riders: RiderAssignmentRow[];
  history: RiderAssignmentHistoryItem[];
}

interface WorkspacePayload {
  riders?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapWorkspace(payload: WorkspacePayload): RiderAssignmentWorkspace {
  return {
    riders: (payload.riders ?? []).map((row) => ({
      riderId: String(row.rider_id), riderName: String(row.rider_name), riderCode: String(row.rider_code),
      riderAvatar: text(row.rider_avatar), homeHubId: text(row.home_hub_id), homeHubName: text(row.home_hub_name),
      operationalHubId: text(row.operational_hub_id), operationalHubName: text(row.operational_hub_name),
      homeZoneId: text(row.home_zone_id), homeZoneName: text(row.home_zone_name),
      operationalZoneId: text(row.operational_zone_id), operationalZoneName: text(row.operational_zone_name),
      assignmentId: text(row.assignment_id), assignmentType: String(row.assignment_type) as RiderAssignmentType,
      startDate: text(row.start_date), endDate: text(row.end_date), status: String(row.status) as RiderAssignmentStatus,
    })),
    history: (payload.history ?? []).map((row) => ({
      id: String(row.id), riderId: String(row.rider_id), assignmentType: String(row.assignment_type) as RiderAssignmentHistoryItem['assignmentType'],
      fromHubName: text(row.from_hub_name), fromZoneName: text(row.from_zone_name),
      targetHubName: String(row.target_hub_name), targetZoneName: String(row.target_zone_name),
      startDate: String(row.start_date), endDate: text(row.end_date), status: String(row.status) as RiderAssignmentHistoryItem['status'],
      reason: String(row.reason), createdByName: text(row.created_by_name), createdAt: String(row.created_at),
      endedAt: text(row.ended_at), endReason: text(row.end_reason),
    })),
  };
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || 'The Rider assignment request failed.');
  return data as T;
}

export async function getRiderAssignmentWorkspace(options: { hubId?: string | null; riderId?: string | null } = {}): Promise<RiderAssignmentWorkspace> {
  const data = await callRpc<WorkspacePayload>('get_rider_assignment_workspace', {
    p_hub_id: options.hubId ?? null,
    p_rider_id: options.riderId ?? null,
  });
  return mapWorkspace(data ?? {});
}

export async function transferRiderPermanently(input: {
  riderId: string; targetHubId: string; targetZoneId: string; effectiveDate: string; reason: string;
}): Promise<void> {
  await callRpc('transfer_rider_permanently', {
    p_rider_id: input.riderId, p_target_hub_id: input.targetHubId, p_target_zone_id: input.targetZoneId,
    p_effective_date: input.effectiveDate, p_reason: input.reason.trim(),
  });
}

export async function deployRiderTemporarily(input: {
  riderId: string; targetHubId: string; targetZoneId: string; startDate: string; endDate: string; reason: string;
}): Promise<void> {
  await callRpc('deploy_rider_temporarily', {
    p_rider_id: input.riderId, p_target_hub_id: input.targetHubId, p_target_zone_id: input.targetZoneId,
    p_start_date: input.startDate, p_end_date: input.endDate, p_reason: input.reason.trim(),
  });
}

export async function extendRiderDeployment(assignmentId: string, newEndDate: string, reason: string): Promise<void> {
  await callRpc('extend_rider_deployment', {
    p_assignment_id: assignmentId, p_new_end_date: newEndDate, p_reason: reason.trim(),
  });
}

export async function endRiderDeploymentEarly(assignmentId: string, reason: string): Promise<void> {
  await callRpc('end_rider_deployment_early', { p_assignment_id: assignmentId, p_reason: reason.trim() });
}
