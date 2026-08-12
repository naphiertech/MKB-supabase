import { describe, expect, it } from 'vitest';
import {
  authorizeAdminUserAction,
  authorizeEmploymentLifecycleAction,
  authorizeRiderAccessAction,
} from '../../supabase/functions/_shared/userActionPolicy';

describe('privileged employment lifecycle authorization', () => {
  it('allows HR to archive and restore riders only', () => {
    expect(authorizeEmploymentLifecycleAction('archive', 'hr', 'hr-1', 'rider-1', 'rider')).toEqual({ allowed: true });
    expect(authorizeEmploymentLifecycleAction('restore', 'hr', 'hr-1', 'rider-1', 'rider')).toEqual({ allowed: true });
    expect(authorizeEmploymentLifecycleAction('archive', 'hr', 'hr-1', 'admin-1', 'admin')).toEqual({
      allowed: false,
      reason: 'HR can manage rider employment only.',
    });
  });

  it('rejects payroll, rider, and self archive attempts', () => {
    expect(authorizeEmploymentLifecycleAction('archive', 'payroll', 'payroll-1', 'rider-1', 'rider').allowed).toBe(false);
    expect(authorizeEmploymentLifecycleAction('archive', 'rider', 'rider-user-1', 'rider-user-2', 'rider').allowed).toBe(false);
    expect(authorizeEmploymentLifecycleAction('archive', 'admin', 'admin-1', 'admin-1', 'admin')).toEqual({
      allowed: false,
      reason: 'You cannot archive or restore your own employment record.',
    });
  });

  it('prevents account reactivation while employment remains archived', () => {
    expect(authorizeRiderAccessAction('restore_access', 'admin', 'admin-1', 'rider-1', 'rider', 'archived')).toEqual({
      allowed: false,
      reason: 'Restore employment before restoring full account access.',
    });
  });

  it('limits restricted access transitions to active Rider employment', () => {
    expect(authorizeRiderAccessAction('restrict', 'hr', 'hr-1', 'rider-1', 'rider', 'active')).toEqual({ allowed: true });
    expect(authorizeRiderAccessAction('restore_access', 'admin', 'admin-1', 'rider-1', 'rider', 'active')).toEqual({ allowed: true });
    expect(authorizeRiderAccessAction('restrict', 'admin', 'admin-1', 'staff-1', 'payroll', 'active').allowed).toBe(false);
    expect(authorizeAdminUserAction('suspend', 'admin', 'admin-1', 'rider-1', 'rider', 'active')).toEqual({
      allowed: false,
      reason: 'Use Restrict Account or Restore Full Access for Rider accounts.',
    });
    expect(authorizeRiderAccessAction('restore_access', 'hr', 'hr-1', 'rider-1', 'rider', 'archived')).toEqual({
      allowed: false,
      reason: 'Restore employment before restoring full account access.',
    });
  });
});
