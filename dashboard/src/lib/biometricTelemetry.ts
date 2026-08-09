export interface BiometricTimingEntry {
  name: string;
  durationMs: number;
  startedAt: number;
}

interface BiometricTelemetryOptions {
  enabled: boolean;
  now?: () => number;
}

export function createBiometricTelemetry({
  enabled,
  now = () => performance.now(),
}: BiometricTelemetryOptions) {
  const entries: BiometricTimingEntry[] = [];

  return {
    start(name: string) {
      const startedAt = now();
      let finishedDuration: number | null = null;
      return () => {
        if (finishedDuration !== null) return finishedDuration;
        const durationMs = now() - startedAt;
        finishedDuration = durationMs;
        if (enabled) entries.push({ name, durationMs, startedAt });
        return durationMs;
      };
    },
    snapshot() {
      return entries.map((entry) => ({ ...entry }));
    },
    clear() {
      entries.length = 0;
    },
  };
}

const telemetryEnabled = import.meta.env.DEV
  || import.meta.env.VITE_BIOMETRIC_TELEMETRY === 'true';

export const biometricTelemetry = createBiometricTelemetry({ enabled: telemetryEnabled });

if (telemetryEnabled && typeof window !== 'undefined') {
  const debugWindow = window as Window & {
    __MKB_BIOMETRIC_TIMINGS__?: {
      snapshot: typeof biometricTelemetry.snapshot;
      clear: typeof biometricTelemetry.clear;
    };
  };
  debugWindow.__MKB_BIOMETRIC_TIMINGS__ = {
    snapshot: biometricTelemetry.snapshot,
    clear: biometricTelemetry.clear,
  };
}
