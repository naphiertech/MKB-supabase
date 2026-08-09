import { logActivity } from '../lib/apiService';
import { supabase } from '../lib/supabaseClient';
import { requestPasswordRecovery } from './authSecurity';

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
