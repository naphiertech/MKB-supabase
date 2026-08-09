import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('./authSecurity', () => ({ requestPasswordRecovery: mocks.requestPasswordRecovery }));
vi.mock('../lib/apiService', () => ({ logActivity: mocks.logActivity }));

import { requestStaffPasswordReset, setUserSuspension } from './adminUserService';

beforeEach(() => vi.clearAllMocks());

describe('staff account actions', () => {
  it('sends a recovery email and records an audit without generating a password', async () => {
    mocks.requestPasswordRecovery.mockResolvedValue(undefined);
    mocks.logActivity.mockResolvedValue(undefined);
    await requestStaffPasswordReset({ id: 'user-1', email: 'rider@mkb.ph', name: 'Rider One' }, 'https://app.example.com/?recovery=1');
    expect(mocks.requestPasswordRecovery).toHaveBeenCalledWith('rider@mkb.ph', 'https://app.example.com/?recovery=1');
    expect(mocks.logActivity).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'password_reset_requested' }));
  });

  it('uses the protected server function for suspension and reactivation', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await setUserSuspension('user-1', true);
    await setUserSuspension('user-1', false);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'admin-user-actions', { body: { action: 'suspend', userId: 'user-1' } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'admin-user-actions', { body: { action: 'reactivate', userId: 'user-1' } });
  });
});
