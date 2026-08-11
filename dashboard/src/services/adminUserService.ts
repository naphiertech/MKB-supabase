import { logActivity } from '../lib/apiService';
import { supabase } from '../lib/supabaseClient';
import { requestPasswordRecovery } from './authSecurity';
import type { ArchiveReason } from './employmentLifecycle';

export interface PasswordResetTarget {
  id: string;
  email: string;
  name: string;
}

export async function requestStaffPasswordReset(target: PasswordResetTarget, redirectTo: string): Promise<void> {
  await requestPasswordRecovery(target.email, redirectTo);
  await logActivity({
    eventType: 'password_reset_requested',
    description: `Password recovery email requested for "${target.name}".`,
    metadata: { target_user_id: target.id, target_email: target.email },
  });
}

export async function setUserSuspension(userId: string, suspended: boolean): Promise<void> {
  const action = suspended ? 'suspend' : 'reactivate';
  const { data, error } = await supabase.functions.invoke('admin-user-actions', {
    body: { action, userId },
  });
  if (error) throw new Error(error.message || `Unable to ${action} this account.`);
  if (!data?.ok) throw new Error(data?.error || `Unable to ${action} this account.`);
}

export interface ArchiveEmployeeInput {
  reason: ArchiveReason;
  effectiveDate: string;
  remarks?: string | null;
  requestId: string;
}

export interface RestoreEmploymentInput {
  reason: string;
  requestId: string;
}

async function invokeLifecycleAction(body: Record<string, unknown>, actionLabel: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', { body });
  if (error) throw new Error(error.message || `Unable to ${actionLabel}.`);
  if (!data?.ok) throw new Error(data?.error || `Unable to ${actionLabel}.`);
}

export async function archiveEmployee(userId: string, input: ArchiveEmployeeInput): Promise<void> {
  await invokeLifecycleAction({
    action: 'archive',
    userId,
    reason: input.reason,
    effectiveDate: input.effectiveDate,
    remarks: input.remarks || null,
    requestId: input.requestId,
  }, 'archive this employee');
}

export async function restoreEmployment(userId: string, input: RestoreEmploymentInput): Promise<void> {
  await invokeLifecycleAction({
    action: 'restore',
    userId,
    reason: input.reason,
    requestId: input.requestId,
  }, 'restore this employee');
}

export async function hasOpenAttendance(riderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('rider_id', riderId)
    .not('time_in', 'is', null)
    .is('time_out', null)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}
