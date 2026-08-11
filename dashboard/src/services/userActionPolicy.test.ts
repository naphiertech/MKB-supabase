import { describe, expect, it } from 'vitest';
import {
  authorizeAdminUserAction,
  authorizeEmploymentLifecycleAction,
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
    expect(authorizeAdminUserAction('reactivate', 'admin', 'admin-1', 'rider-1', 'rider', 'archived')).toEqual({
      allowed: false,
      reason: 'Restore employment before reactivating this account.',
    });
  });
});
