import { getStorageAdapter } from './storage';

export const OFFLINE_RIDER_TRUST_KEY = 'attenrider_offline_rider_trust_v1';
export const LEGACY_TRUSTED_HASH_KEY = 'attenrider_trusted_device_hash';
export const OFFLINE_RIDER_TRUST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OfflineRiderIdentity {
  authUserId: string;
  riderId: string;
}

export interface OfflineRiderTrustRecord extends OfflineRiderIdentity {
  fingerprintHash: string;
  validatedAt: number;
  expiresAt: number;
}

export type OfflineRiderTrustFailure =
  | 'missing'
  | 'expired'
  | 'identity_mismatch'
  | 'device_mismatch';

export type OfflineRiderTrustResult =
  | { allowed: true }
  | { allowed: false; reason: OfflineRiderTrustFailure };

export function createOfflineRiderTrustRecord(
  identity: OfflineRiderIdentity,
  fingerprintHash: string,
  now = Date.now()
): OfflineRiderTrustRecord {
  return {
    ...identity,
    fingerprintHash,
    validatedAt: now,
    expiresAt: now + OFFLINE_RIDER_TRUST_TTL_MS
  };
}

export function validateOfflineRiderTrust(
  identity: OfflineRiderIdentity,
  trust: OfflineRiderTrustRecord | null,
  currentFingerprintHash: string,
  now = Date.now()
): OfflineRiderTrustResult {
  if (!trust) return { allowed: false, reason: 'missing' };
  if (trust.expiresAt <= now) return { allowed: false, reason: 'expired' };
  if (trust.authUserId !== identity.authUserId || trust.riderId !== identity.riderId) {
    return { allowed: false, reason: 'identity_mismatch' };
  }
  if (trust.fingerprintHash !== currentFingerprintHash) {
    return { allowed: false, reason: 'device_mismatch' };
  }
  return { allowed: true };
}

function isOfflineRiderTrustRecord(value: unknown): value is OfflineRiderTrustRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<OfflineRiderTrustRecord>;
  return typeof record.authUserId === 'string' &&
    typeof record.riderId === 'string' &&
    typeof record.fingerprintHash === 'string' &&
    typeof record.validatedAt === 'number' &&
    typeof record.expiresAt === 'number';
}

export async function saveOfflineRiderTrust(record: OfflineRiderTrustRecord): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OFFLINE_RIDER_TRUST_KEY, JSON.stringify(record));
  window.localStorage.removeItem(LEGACY_TRUSTED_HASH_KEY);
  try {
    const storage = getStorageAdapter();
    await storage.setItem(OFFLINE_RIDER_TRUST_KEY, record);
    await storage.removeItem(LEGACY_TRUSTED_HASH_KEY);
  } catch (error) {
    console.warn('[Auth] Failed to mirror rider offline trust to IndexedDB:', error);
  }
}

export async function getOfflineRiderTrust(): Promise<OfflineRiderTrustRecord | null> {
  if (typeof window === 'undefined') return null;

  const localValue = window.localStorage.getItem(OFFLINE_RIDER_TRUST_KEY);
  if (localValue) {
    try {
      const parsed = JSON.parse(localValue) as unknown;
      if (isOfflineRiderTrustRecord(parsed)) return parsed;
    } catch {
      // Fall through to the IndexedDB mirror.
    }
  }

  let stored: OfflineRiderTrustRecord | null = null;
  try {
    stored = await getStorageAdapter().getItem<OfflineRiderTrustRecord>(OFFLINE_RIDER_TRUST_KEY);
  } catch (error) {
    console.warn('[Auth] Failed to read rider offline trust from IndexedDB:', error);
  }
  if (!isOfflineRiderTrustRecord(stored)) return null;
  window.localStorage.setItem(OFFLINE_RIDER_TRUST_KEY, JSON.stringify(stored));
  return stored;
}

export async function clearOfflineRiderTrust(): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(OFFLINE_RIDER_TRUST_KEY);
  window.localStorage.removeItem(LEGACY_TRUSTED_HASH_KEY);
  const storage = getStorageAdapter();
  await Promise.allSettled([
    storage.removeItem(OFFLINE_RIDER_TRUST_KEY),
    storage.removeItem(LEGACY_TRUSTED_HASH_KEY)
  ]);
}
