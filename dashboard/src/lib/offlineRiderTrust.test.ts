import { describe, expect, it } from 'vitest';
import {
  OFFLINE_RIDER_TRUST_TTL_MS,
  validateOfflineRiderTrust,
  type OfflineRiderTrustRecord
} from './offlineRiderTrust';

const now = 1_754_300_000_000;
const identity = {
  authUserId: 'auth-user-1',
  riderId: 'rider-1'
};
const validTrust: OfflineRiderTrustRecord = {
  ...identity,
  fingerprintHash: 'trusted-fingerprint',
  validatedAt: now - 60_000,
  expiresAt: now + OFFLINE_RIDER_TRUST_TTL_MS - 60_000
};

describe('offline rider trust', () => {
  it('fails closed when trust is missing, expired, or belongs to another identity', () => {
    expect(validateOfflineRiderTrust(identity, null, 'trusted-fingerprint', now)).toMatchObject({
      allowed: false,
      reason: 'missing'
    });
    expect(validateOfflineRiderTrust(identity, { ...validTrust, expiresAt: now - 1 }, 'trusted-fingerprint', now)).toMatchObject({
      allowed: false,
      reason: 'expired'
    });
    expect(validateOfflineRiderTrust(identity, { ...validTrust, riderId: 'rider-2' }, 'trusted-fingerprint', now)).toMatchObject({
      allowed: false,
      reason: 'identity_mismatch'
    });
    expect(validateOfflineRiderTrust(identity, validTrust, 'different-fingerprint', now)).toMatchObject({
      allowed: false,
      reason: 'device_mismatch'
    });
  });

  it('allows only an unexpired trust record for the same rider and device', () => {
    expect(validateOfflineRiderTrust(identity, validTrust, 'trusted-fingerprint', now)).toEqual({
      allowed: true
    });
  });
});
