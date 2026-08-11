import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

describe('biometric performance telemetry', () => {
  it('records timing-only entries without accepting biometric payloads', async () => {
    const faceAi = await import('./faceAi') as typeof import('./faceAi') & Record<string, unknown>;
    expect(faceAi.createBiometricTelemetry).toBeTypeOf('function');

    const createTelemetry = faceAi.createBiometricTelemetry as (options: {
      enabled: boolean;
      now: () => number;
    }) => {
      start: (name: string) => () => number;
      record: (name: string, durationMs: number, startedAt: number) => void;
      snapshot: () => unknown[];
    };
    const times = [10, 34];
    const telemetry = createTelemetry({ enabled: true, now: () => times.shift() ?? 34 });
    const finish = telemetry.start('descriptor_inference');

    expect(finish()).toBe(24);
    expect(telemetry.snapshot()).toEqual([
      { name: 'descriptor_inference', durationMs: 24, startedAt: 10 },
    ]);
    expect(Object.keys(telemetry.snapshot()[0] as object).sort()).toEqual([
      'durationMs',
      'name',
      'startedAt',
    ]);

    telemetry.record('biometric_preload_long_task_1', 68, 40);
    expect(telemetry.snapshot()[1]).toEqual({
      name: 'biometric_preload_long_task_1',
      durationMs: 68,
      startedAt: 40,
    });
  });

  it('provides timing-only names for scanner samples and both attendance flows', async () => {
    const telemetryModule = await import('./biometricTelemetry') as typeof import('./biometricTelemetry') & {
      BIOMETRIC_TIMING_NAMES?: {
        preload: string;
        dashboardInteractive: string;
        preloadScheduled: string;
        preloadStarted: string;
        preloadComplete: string;
        warmupTotal: string;
        preloadLongTask: (taskNumber: number) => string;
        cameraRequest: string;
        cameraFirstUsableFrame: string;
        liveness: string;
        descriptorInference: (sampleNumber: number) => string;
        descriptorMatch: (sampleNumber: number) => string;
        matchComplete: string;
        scannerTotal: string;
        attendancePersistence: (action: 'time_in' | 'time_out') => string;
        riderStatusPersistence: (action: 'time_in' | 'time_out') => string;
        dashboardRefresh: (action: 'time_in' | 'time_out') => string;
        userPerceivedTotal: (action: 'time_in' | 'time_out') => string;
      };
    };
    const names = telemetryModule.BIOMETRIC_TIMING_NAMES;

    expect(names).toBeDefined();
    expect([
      names?.preload,
      names?.dashboardInteractive,
      names?.preloadScheduled,
      names?.preloadStarted,
      names?.preloadComplete,
      names?.warmupTotal,
      names?.preloadLongTask(1),
      names?.cameraRequest,
      names?.cameraFirstUsableFrame,
      names?.liveness,
      names?.descriptorInference(1),
      names?.descriptorInference(2),
      names?.descriptorInference(3),
      names?.descriptorMatch(1),
      names?.descriptorMatch(2),
      names?.descriptorMatch(3),
      names?.matchComplete,
      names?.scannerTotal,
      names?.attendancePersistence('time_in'),
      names?.riderStatusPersistence('time_in'),
      names?.dashboardRefresh('time_in'),
      names?.userPerceivedTotal('time_in'),
      names?.attendancePersistence('time_out'),
      names?.riderStatusPersistence('time_out'),
      names?.dashboardRefresh('time_out'),
      names?.userPerceivedTotal('time_out'),
    ]).toEqual([
      'biometric_preload',
      'dashboard_interactive',
      'biometric_preload_scheduled',
      'biometric_preload_started',
      'biometric_preload_complete',
      'biometric_warmup',
      'biometric_preload_long_task_1',
      'camera_request',
      'camera_first_usable_frame',
      'liveness_completion',
      'descriptor_sample_1_inference',
      'descriptor_sample_2_inference',
      'descriptor_sample_3_inference',
      'descriptor_sample_1_match',
      'descriptor_sample_2_match',
      'descriptor_sample_3_match',
      'match_completion',
      'scanner_total',
      'time_in_attendance_persistence',
      'time_in_rider_status_persistence',
      'time_in_dashboard_refresh',
      'time_in_total_user_perceived',
      'time_out_attendance_persistence',
      'time_out_rider_status_persistence',
      'time_out_dashboard_refresh',
      'time_out_total_user_perceived',
    ]);
  });

  it('logs only whether a reference avatar exists, never its Base64 contents', async () => {
    const telemetryModule = await import('./biometricTelemetry') as typeof import('./biometricTelemetry') & {
      logReferenceAvatarAvailability?: (available: boolean) => void;
    };
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const base64Avatar = 'data:image/jpeg;base64,private-photo-payload';

    expect(telemetryModule.logReferenceAvatarAvailability).toBeTypeOf('function');
    telemetryModule.logReferenceAvatarAvailability?.(Boolean(base64Avatar));

    expect(debug).toHaveBeenCalledWith('[Face AI] Reference avatar available:', true);
    expect(JSON.stringify(debug.mock.calls)).not.toContain(base64Avatar);
    expect(JSON.stringify(debug.mock.calls)).not.toContain('data:image');
  });
});
