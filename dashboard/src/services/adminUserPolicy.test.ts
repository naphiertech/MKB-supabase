import { describe, expect, it } from 'vitest';
import { accountActionState, authorizeAdminUserAction } from '../../supabase/functions/_shared/userActionPolicy';

describe('server account-action authorization', () => {
  it('allows Admin to manage another user and HR to manage riders', () => {
    expect(authorizeAdminUserAction('admin', 'admin-1', 'user-1', 'payroll')).toEqual({ allowed: true });
    expect(authorizeAdminUserAction('hr', 'hr-1', 'rider-user', 'rider')).toEqual({ allowed: true });
  });

  it('rejects anonymous, HR non-rider targets, and self-suspension', () => {
    expect(authorizeAdminUserAction(null, null, 'user-1', 'rider').allowed).toBe(false);
    expect(authorizeAdminUserAction('hr', 'hr-1', 'payroll-1', 'payroll').allowed).toBe(false);
    expect(authorizeAdminUserAction('admin', 'admin-1', 'admin-1', 'admin').allowed).toBe(false);
  });

  it('maps suspension and reactivation to Auth ban and public status without deletion actions', () => {
    expect(accountActionState('suspend')).toEqual({ banDuration: '876000h', status: 'suspended' });
    expect(accountActionState('reactivate')).toEqual({ banDuration: 'none', status: 'active' });
  });
});
