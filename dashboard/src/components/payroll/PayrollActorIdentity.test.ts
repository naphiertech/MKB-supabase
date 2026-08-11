import { describe, expect, it } from 'vitest';
import { resolvePayrollActorIdentity } from './resolvePayrollActorIdentity';

describe('resolvePayrollActorIdentity', () => {
  it('keeps the historical snapshot primary after the current profile changes', () => {
    expect(resolvePayrollActorIdentity({
      snapshotName: 'Renata Cruz',
      snapshotEmail: 'naphiera@gmail.com',
      currentName: 'Renata Cruz',
      currentEmail: 'naphier.tech@gmail.com',
      legacyFallbackLabel: 'Admin',
    })).toEqual({
      name: 'Renata Cruz',
      email: 'naphiera@gmail.com',
      isSnapshot: true,
      isLegacy: false,
    });
  });

  it('labels a current-profile fallback as legacy instead of fabricating a snapshot', () => {
    expect(resolvePayrollActorIdentity({
      currentName: 'Current Admin',
      currentEmail: 'current@example.test',
      legacyFallbackLabel: 'Admin',
    })).toEqual({
      name: 'Current Admin',
      email: 'current@example.test',
      isSnapshot: false,
      isLegacy: true,
    });
  });

  it('uses an explicit legacy label when no identity lookup is available', () => {
    expect(resolvePayrollActorIdentity({
      legacyFallbackLabel: 'Historical identity unavailable',
    })).toEqual({
      name: 'Historical identity unavailable',
      email: null,
      isSnapshot: false,
      isLegacy: true,
    });
  });
});
