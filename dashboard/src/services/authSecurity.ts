import { supabase } from '../lib/supabaseClient';

function throwIfError(error: { message?: string } | null): void {
  if (error) throw new Error(error.message || 'Authentication request failed.');
}

export async function requestPasswordRecovery(email: string, redirectTo: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Enter the email address for your account.');
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
  throwIfError(error);
}

export async function completePasswordRecovery(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const { error } = await supabase.auth.updateUser({ password });
  throwIfError(error);
}

export interface AuthSessionIdentity {
  userId: string;
  sessionId: string;
}

export interface OtherSessionLogoutSignal {
  userId: string;
  excludedSessionId: string;
}

export interface TerminateAllSessionsSignal {
  userId: string;
  terminateAll: true;
  reason: 'employee_archived' | 'account_suspended';
}

export type SessionControlSignal = OtherSessionLogoutSignal | TerminateAllSessionsSignal;

const SESSION_CONTROL_EVENT = 'logout_others';

function sessionControlTopic(userId: string): string {
  return `user:${userId}:session-control`;
}

export function shouldTerminateSession(signal: SessionControlSignal, current: AuthSessionIdentity): boolean {
  if (signal.userId !== current.userId) return false;
  return 'terminateAll' in signal ? signal.terminateAll : signal.excludedSessionId !== current.sessionId;
}

export async function getCurrentAuthSessionIdentity(): Promise<AuthSessionIdentity> {
  const { data, error } = await supabase.auth.getClaims();
  throwIfError(error);
  const userId = data?.claims?.sub;
  const sessionId = data?.claims?.session_id;
  if (typeof userId !== 'string' || typeof sessionId !== 'string') {
    throw new Error('The current Auth session identity is unavailable. Sign in again and retry.');
  }
  return { userId, sessionId };
}

function waitForSubscription(channel: ReturnType<typeof supabase.channel>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The session-control channel timed out.')), 8000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        reject(error ?? new Error('The session-control channel could not connect.'));
      }
    });
  });
}

function createSessionControlChannel(identity: AuthSessionIdentity) {
  return supabase.channel(sessionControlTopic(identity.userId), {
    config: { private: true, broadcast: { ack: true, self: true } },
  });
}

async function publishOtherSessionLogout(identity: AuthSessionIdentity): Promise<void> {
  await supabase.realtime.setAuth();
  const channel = createSessionControlChannel(identity);
  try {
    await waitForSubscription(channel);
    const result = await channel.send({
      type: 'broadcast',
      event: SESSION_CONTROL_EVENT,
      payload: { userId: identity.userId, excludedSessionId: identity.sessionId },
    });
    if (result !== 'ok') throw new Error('The immediate session-control signal was not acknowledged.');
  } finally {
    await supabase.removeChannel(channel);
  }
}

export async function subscribeToOtherSessionLogout(
  identity: AuthSessionIdentity,
  onTerminate: () => void
): Promise<() => void> {
  await supabase.realtime.setAuth();
  const channel = createSessionControlChannel(identity).on(
    'broadcast',
    { event: SESSION_CONTROL_EVENT },
    (message) => {
      const signal = message.payload as SessionControlSignal | undefined;
      if (signal && shouldTerminateSession(signal, identity)) onTerminate();
    }
  ).on(
    'broadcast',
    { event: 'terminate_sessions' },
    (message) => {
      const signal = message.payload as SessionControlSignal | undefined;
      if (signal && shouldTerminateSession(signal, identity)) onTerminate();
    }
  );
  await waitForSubscription(channel);
  return () => { void supabase.removeChannel(channel); };
}

export async function logoutOtherSessions(): Promise<void> {
  const identity = await getCurrentAuthSessionIdentity();
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  throwIfError(error);
  try {
    await publishOtherSessionLogout(identity);
  } catch {
    throw new Error('Other Auth sessions were revoked, but the immediate sign-out signal could not be delivered. They will close when their access token refreshes.');
  }
}

export async function logoutCurrentSessionLocally(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  throwIfError(error);
}

export interface MfaState {
  enabled: boolean;
  requiresChallenge: boolean;
  factorId: string | null;
  currentLevel: string | null;
  nextLevel: string | null;
}

export async function getMfaState(): Promise<MfaState> {
  const [factorsResult, assuranceResult] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  throwIfError(factorsResult.error);
  throwIfError(assuranceResult.error);
  const verifiedFactor = factorsResult.data?.totp.find((factor) => factor.status === 'verified') ?? null;
  const currentLevel = assuranceResult.data?.currentLevel ?? null;
  const nextLevel = assuranceResult.data?.nextLevel ?? null;
  return {
    enabled: Boolean(verifiedFactor),
    requiresChallenge: Boolean(verifiedFactor && currentLevel !== 'aal2' && nextLevel === 'aal2'),
    factorId: verifiedFactor?.id ?? null,
    currentLevel,
    nextLevel,
  };
}

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export async function enrollTotpFactor(): Promise<TotpEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'MKB Authenticator',
  });
  throwIfError(error);
  if (!data?.totp) throw new Error('Authenticator enrollment could not be started.');
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyTotpChallenge(factorId: string, code: string): Promise<void> {
  const normalizedCode = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalizedCode)) throw new Error('Enter the 6-digit code from your authenticator app.');
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: normalizedCode });
  throwIfError(error);
}

export async function unenrollTotpFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  throwIfError(error);
}
