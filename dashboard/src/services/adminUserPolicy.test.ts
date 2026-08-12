import { describe, expect, it } from 'vitest';
import { accountActionState, authorizeAdminUserAction, authorizeRiderAccessAction } from '../../supabase/functions/_shared/userActionPolicy';

describe('server account-action authorization', () => {
  it('allows Admin to manage another staff user and HR to restrict riders', () => {
    expect(authorizeAdminUserAction('suspend', 'admin', 'admin-1', 'user-1', 'payroll')).toEqual({ allowed: true });
    expect(authorizeRiderAccessAction('restrict', 'hr', 'hr-1', 'rider-user', 'rider')).toEqual({ allowed: true });
  });

  it('rejects anonymous, HR non-rider targets, and self-suspension', () => {
    expect(authorizeAdminUserAction('suspend', null, null, 'user-1', 'rider').allowed).toBe(false);
    expect(authorizeAdminUserAction('suspend', 'hr', 'hr-1', 'payroll-1', 'payroll').allowed).toBe(false);
    expect(authorizeAdminUserAction('suspend', 'admin', 'admin-1', 'admin-1', 'admin').allowed).toBe(false);
  });

  it('maps suspension and reactivation to Auth ban and public status without deletion actions', () => {
    expect(accountActionState('suspend')).toEqual({ banDuration: '876000h', status: 'suspended' });
    expect(accountActionState('reactivate')).toEqual({ banDuration: 'none', status: 'active' });
  });
});
