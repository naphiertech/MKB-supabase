export type StaffRole = 'admin' | 'hr' | 'payroll' | 'rider' | 'dispatcher' | null;
export type AccountAction = 'suspend' | 'reactivate';
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
  if (action === 'reactivate' && targetEmploymentStatus === 'archived') {
    return { allowed: false, reason: 'Restore employment before reactivating this account.' };
  }
  if (callerRole === 'hr' && targetRole !== 'rider') {
    return { allowed: false, reason: 'HR can manage rider accounts only.' };
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
