export interface BiometricTimingEntry {
  name: string;
  durationMs: number;
  startedAt: number;
}

interface BiometricTelemetryOptions {
  enabled: boolean;
  now?: () => number;
}

export type AttendanceTelemetryAction = 'time_in' | 'time_out';

export const BIOMETRIC_TIMING_NAMES = {
  preload: 'biometric_preload',
  dashboardInteractive: 'dashboard_interactive',
  preloadScheduled: 'biometric_preload_scheduled',
  preloadStarted: 'biometric_preload_started',
  preloadComplete: 'biometric_preload_complete',
  warmupTotal: 'biometric_warmup',
  preloadLongTask: (sequence: number) => `biometric_preload_long_task_${sequence}`,
  cameraRequest: 'camera_request',
  cameraFirstUsableFrame: 'camera_first_usable_frame',
  liveness: 'liveness_completion',
  descriptorInference: (sampleNumber: number) => `descriptor_sample_${sampleNumber}_inference`,
  descriptorMatch: (sampleNumber: number) => `descriptor_sample_${sampleNumber}_match`,
  matchComplete: 'match_completion',
  scannerTotal: 'scanner_total',
  attendancePersistence: (action: AttendanceTelemetryAction) => `${action}_attendance_persistence`,
  riderStatusPersistence: (action: AttendanceTelemetryAction) => `${action}_rider_status_persistence`,
  dashboardRefresh: (action: AttendanceTelemetryAction) => `${action}_dashboard_refresh`,
  userPerceivedTotal: (action: AttendanceTelemetryAction) => `${action}_total_user_perceived`,
} as const;

export function createBiometricTelemetry({
  enabled,
  now = () => performance.now(),
}: BiometricTelemetryOptions) {
  const entries: BiometricTimingEntry[] = [];

  return {
    record(name: string, durationMs: number, startedAt = now()) {
      if (enabled) entries.push({ name, durationMs, startedAt });
    },
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

export function logReferenceAvatarAvailability(available: boolean): void {
  if (telemetryEnabled) {
    console.debug('[Face AI] Reference avatar available:', available);
  }
}

export const biometricTelemetry = createBiometricTelemetry({ enabled: telemetryEnabled });

export function observeBiometricPreloadLongTasks(): () => void {
  if (!telemetryEnabled || typeof PerformanceObserver === 'undefined') return () => undefined;

  let sequence = 0;
  try {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        sequence += 1;
        biometricTelemetry.record(
          BIOMETRIC_TIMING_NAMES.preloadLongTask(sequence),
          entry.duration,
          entry.startTime,
        );
      });
    });
    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  } catch {
    return () => undefined;
  }
}

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
