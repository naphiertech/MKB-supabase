export type StaffRole = 'admin' | 'hr' | 'payroll' | 'rider' | 'dispatcher' | null;
export type AccountAction = 'suspend' | 'reactivate';
export type RiderAccessAction = 'restrict' | 'restore_access';
export type EmploymentLifecycleAction = 'archive' | 'restore';
export type EmploymentStatus = 'active' | 'archived';

export function accountActionState(action: AccountAction): {
  banDuration: '876000h' | 'none';
  status: 'suspended' | 'active';
} {
  return action === 'suspend'
    ? { banDuration: '876000h', status: 'suspended' }
    : { banDuration: 'none', status: 'active' };
}

export function authorizeAdminUserAction(
  action: AccountAction,
  callerRole: StaffRole,
  callerId: string | null,
  targetUserId: string,
  targetRole: StaffRole,
  targetEmploymentStatus: EmploymentStatus = 'active',
): { allowed: true } | { allowed: false; reason: string } {
  if (!callerId || (callerRole !== 'admin' && callerRole !== 'hr')) {
    return { allowed: false, reason: 'Admin or HR access is required.' };
  }
  if (callerId === targetUserId) {
    return { allowed: false, reason: 'You cannot suspend or reactivate your own account.' };
  }
  if (targetRole === 'rider') {
    return { allowed: false, reason: 'Use Restrict Account or Restore Full Access for Rider accounts.' };
  }
  if (callerRole === 'hr') {
    return { allowed: false, reason: 'HR can manage Rider account access only.' };
  }
  if (action === 'reactivate' && targetEmploymentStatus === 'archived') {
    return { allowed: false, reason: 'Restore employment before reactivating this account.' };
  }
  return { allowed: true };
}

export function authorizeRiderAccessAction(
  action: RiderAccessAction,
  callerRole: StaffRole,
  callerId: string | null,
  targetUserId: string,
  targetRole: StaffRole,
  targetEmploymentStatus: EmploymentStatus = 'active',
): { allowed: true } | { allowed: false; reason: string } {
  if (!callerId || (callerRole !== 'admin' && callerRole !== 'hr')) {
    return { allowed: false, reason: 'Admin or HR access is required.' };
  }
  if (callerId === targetUserId) {
    return { allowed: false, reason: 'You cannot change your own Rider access.' };
  }
  if (targetRole !== 'rider') {
    return { allowed: false, reason: 'Restricted access applies to Rider accounts only.' };
  }
  if (targetEmploymentStatus === 'archived') {
    return {
      allowed: false,
      reason: action === 'restore_access'
        ? 'Restore employment before restoring full account access.'
        : 'Archived employment is already blocked from account access.',
    };
  }
  return { allowed: true };
}

export function authorizeEmploymentLifecycleAction(
  _action: EmploymentLifecycleAction,
  callerRole: StaffRole,
  callerId: string | null,
  targetUserId: string,
  targetRole: StaffRole,
): { allowed: true } | { allowed: false; reason: string } {
  if (!callerId || (callerRole !== 'admin' && callerRole !== 'hr')) {
    return { allowed: false, reason: 'Admin or HR access is required.' };
  }
  if (callerId === targetUserId) {
    return { allowed: false, reason: 'You cannot archive or restore your own employment record.' };
  }
  if (callerRole === 'hr' && targetRole !== 'rider') {
    return { allowed: false, reason: 'HR can manage rider employment only.' };
  }
  return { allowed: true };
}
