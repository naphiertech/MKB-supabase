export interface FreshMatchState {
  sessionId: number;
  lastSampleId: number;
  matchCount: number;
}

interface DescriptorSample {
  sessionId: number;
  sampleId: number;
  matched: boolean;
}

export function advanceFreshMatchState(
  state: FreshMatchState,
  sample: DescriptorSample,
): FreshMatchState {
  if (sample.sessionId !== state.sessionId || sample.sampleId <= state.lastSampleId) {
    return state;
  }

  return {
    ...state,
    lastSampleId: sample.sampleId,
    matchCount: state.matchCount + (sample.matched ? 1 : 0),
  };
}

export function isCurrentScanSession(
  activeSessionId: number,
  candidateSessionId: number,
  isActive: boolean,
): boolean {
  return isActive && activeSessionId === candidateSessionId;
}
