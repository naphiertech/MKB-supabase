import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({ supabase: { functions: { invoke: mocks.invoke }, from: mocks.from } }));
vi.mock('./authSecurity', () => ({ requestPasswordRecovery: mocks.requestPasswordRecovery }));
vi.mock('../lib/apiService', () => ({ logActivity: mocks.logActivity }));

import {
  archiveEmployee,
  hasOpenAttendance,
  requestStaffPasswordReset,
  restoreEmployment,
  setUserSuspension,
} from './adminUserService';

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

  it('sends stable archive and restore requests to the privileged function', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await archiveEmployee('user-1', {
      reason: 'Resigned',
      effectiveDate: '2026-08-11',
      remarks: 'Final clearance completed.',
      requestId: '10000000-0000-4000-8000-000000000001',
    });
    await restoreEmployment('user-1', {
      reason: 'Archive entered in error.',
      requestId: '10000000-0000-4000-8000-000000000002',
    });

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'admin-user-actions', {
      body: {
        action: 'archive',
        userId: 'user-1',
        reason: 'Resigned',
        effectiveDate: '2026-08-11',
        remarks: 'Final clearance completed.',
        requestId: '10000000-0000-4000-8000-000000000001',
      },
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'admin-user-actions', {
      body: {
        action: 'restore',
        userId: 'user-1',
        reason: 'Archive entered in error.',
        requestId: '10000000-0000-4000-8000-000000000002',
      },
    });
  });

  it('detects an open attendance blocker without changing the record', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), is: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.not.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [{ id: 'attendance-1' }], error: null });
    mocks.from.mockReturnValue(query);

    await expect(hasOpenAttendance('rider-1')).resolves.toBe(true);
    expect(mocks.from).toHaveBeenCalledWith('attendance_logs');
  });
});
