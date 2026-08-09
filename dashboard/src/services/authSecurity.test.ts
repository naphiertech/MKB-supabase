import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      mfa: {
        enroll: mocks.enroll,
        challengeAndVerify: mocks.challengeAndVerify,
        listFactors: mocks.listFactors,
        unenroll: mocks.unenroll,
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      },
    },
  },
}));

import {
  completePasswordRecovery,
  enrollTotpFactor,
  getMfaState,
  logoutOtherSessions,
  requestPasswordRecovery,
  unenrollTotpFactor,
  verifyTotpChallenge,
} from './authSecurity';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('password recovery and session security', () => {
  it('uses the native recovery flow with the explicit app callback', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    await requestPasswordRecovery(' Rider@MKB.PH ', 'https://dashboard.example.com/?recovery=1');
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('rider@mkb.ph', {
      redirectTo: 'https://dashboard.example.com/?recovery=1',
    });
  });

  it('updates the authenticated recovery user without exposing a password', async () => {
    mocks.updateUser.mockResolvedValue({ error: null });
    await completePasswordRecovery('new-password-123');
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' });
  });

  it('logs out other sessions while preserving the current session', async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await logoutOtherSessions();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });
});

describe('native Supabase TOTP MFA', () => {
  it('enrolls, verifies, lists, and removes a TOTP factor', async () => {
    mocks.enroll.mockResolvedValue({ data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml,qr', secret: 'SECRET', uri: 'otpauth://totp/test' } }, error: null });
    mocks.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: 'factor-1', status: 'verified', friendly_name: 'MKB Authenticator' }] }, error: null });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    mocks.unenroll.mockResolvedValue({ data: {}, error: null });

    const enrollment = await enrollTotpFactor();
    await verifyTotpChallenge('factor-1', '123456');
    const state = await getMfaState();
    await unenrollTotpFactor('factor-1');

    expect(enrollment.factorId).toBe('factor-1');
    expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    expect(state).toMatchObject({ enabled: true, requiresChallenge: false, factorId: 'factor-1' });
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
  });
});
