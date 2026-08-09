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

export async function logoutOtherSessions(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
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
