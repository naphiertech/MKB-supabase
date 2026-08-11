import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getClaims: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  realtimeSetAuth: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      getClaims: mocks.getClaims,
      mfa: {
        enroll: mocks.enroll,
        challengeAndVerify: mocks.challengeAndVerify,
        listFactors: mocks.listFactors,
        unenroll: mocks.unenroll,
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      },
    },
    realtime: { setAuth: mocks.realtimeSetAuth },
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

import {
  completePasswordRecovery,
  enrollTotpFactor,
  getMfaState,
  logoutCurrentSessionLocally,
  logoutOtherSessions,
  requestPasswordRecovery,
  shouldTerminateSession,
  subscribeToOtherSessionLogout,
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
    const handlers = new Map<string, (payload: unknown) => void>();
    const channel = {
      on: vi.fn((_type: string, options: { event: string }, handler: (payload: unknown) => void) => {
        handlers.set(options.event, handler);
        return channel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
        return channel;
      }),
      send: vi.fn().mockResolvedValue('ok'),
    };
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: 'user-a', session_id: 'session-a' } }, error: null });
    mocks.realtimeSetAuth.mockResolvedValue(undefined);
    mocks.channel.mockReturnValue(channel);
    mocks.signOut.mockResolvedValue({ error: null });
    await logoutOtherSessions();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'logout_others',
      payload: { userId: 'user-a', excludedSessionId: 'session-a' },
    });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(channel.send.mock.invocationCallOrder[0]);
  });

  it('terminates only another session belonging to the targeted user', () => {
    const signal = { userId: 'user-a', excludedSessionId: 'session-a' };
    expect(shouldTerminateSession(signal, { userId: 'user-a', sessionId: 'session-b' })).toBe(true);
    expect(shouldTerminateSession(signal, { userId: 'user-a', sessionId: 'session-a' })).toBe(false);
    expect(shouldTerminateSession(signal, { userId: 'user-b', sessionId: 'session-b' })).toBe(false);
  });

  it('terminates every targeted session for an authoritative employment archive signal', () => {
    const signal = { userId: 'user-a', terminateAll: true as const, reason: 'employee_archived' as const };
    expect(shouldTerminateSession(signal, { userId: 'user-a', sessionId: 'session-a' })).toBe(true);
    expect(shouldTerminateSession(signal, { userId: 'user-a', sessionId: 'session-b' })).toBe(true);
    expect(shouldTerminateSession(signal, { userId: 'user-b', sessionId: 'session-a' })).toBe(false);
  });

  it('delivers the immediate logout callback without requiring a refresh', async () => {
    const broadcastHandlers = new Map<string, (payload: { payload?: unknown }) => void>();
    const channel = {
      on: vi.fn((_type: string, options: { event: string }, handler: (payload: { payload?: unknown }) => void) => {
        broadcastHandlers.set(options.event, handler);
        return channel;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        callback('SUBSCRIBED');
        return channel;
      }),
    };
    mocks.realtimeSetAuth.mockResolvedValue(undefined);
    mocks.channel.mockReturnValue(channel);
    mocks.removeChannel.mockResolvedValue('ok');
    const terminate = vi.fn();

    const unsubscribe = await subscribeToOtherSessionLogout({ userId: 'user-a', sessionId: 'session-b' }, terminate);
    broadcastHandlers.get('logout_others')?.({ payload: { userId: 'user-a', excludedSessionId: 'session-a' } });
    expect(terminate).toHaveBeenCalledOnce();

    broadcastHandlers.get('terminate_sessions')?.({
      payload: { userId: 'user-a', terminateAll: true, reason: 'employee_archived' },
    });
    expect(terminate).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('clears a remotely terminated browser locally without revoking the initiating session', async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await logoutCurrentSessionLocally();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
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
