import { describe, expect, it } from 'vitest';
import {
  advanceFreshMatchState,
  isCurrentScanSession,
  type FreshMatchState,
} from './biometricScanLifecycle';

describe('biometric scan lifecycle guards', () => {
  it('counts only newly computed matching descriptors from the active session', () => {
    const initial: FreshMatchState = { sessionId: 7, lastSampleId: 0, matchCount: 0 };
    const first = advanceFreshMatchState(initial, { sessionId: 7, sampleId: 1, matched: true });
    const cachedReplay = advanceFreshMatchState(first, { sessionId: 7, sampleId: 1, matched: true });
    const staleSession = advanceFreshMatchState(cachedReplay, { sessionId: 6, sampleId: 2, matched: true });
    const nonMatch = advanceFreshMatchState(staleSession, { sessionId: 7, sampleId: 2, matched: false });
    const second = advanceFreshMatchState(nonMatch, { sessionId: 7, sampleId: 3, matched: true });
    const third = advanceFreshMatchState(second, { sessionId: 7, sampleId: 4, matched: true });

    expect(first.matchCount).toBe(1);
    expect(cachedReplay).toBe(first);
    expect(staleSession).toBe(first);
    expect(nonMatch.matchCount).toBe(1);
    expect(second.matchCount).toBe(2);
    expect(third.matchCount).toBe(3);
  });

  it('rejects stale async work after a new scan session starts', () => {
    expect(isCurrentScanSession(9, 9, true)).toBe(true);
    expect(isCurrentScanSession(9, 8, true)).toBe(false);
    expect(isCurrentScanSession(9, 9, false)).toBe(false);
  });
});
