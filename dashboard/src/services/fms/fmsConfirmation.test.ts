import { describe, it, expect, vi } from 'vitest';
import { confirmFmsDailyRiderObservation } from './fmsImportService';

vi.mock('../../lib/supabaseClient', () => {
  return {
    supabase: {
      rpc: vi.fn(async (funcName: string, args: any) => {
        if (funcName === 'confirm_fms_daily_rider_observation') {
          // Validate classification invariant
          if (args.p_heavy_delivered < 0 || args.p_heavy_delivered > 86) {
            return {
              data: null,
              error: {
                code: '22003',
                message: 'INVALID_CLASSIFICATION: Heavy delivered must be between 0 and total delivered.',
              },
            };
          }

          if (args.p_observation_id === 'locked_cutoff_obs') {
            return {
              data: null,
              error: {
                code: '55P03',
                message: 'PAYROLL_PERIOD_LOCKED: Shift date belongs to a pending payroll period.',
              },
            };
          }

          if (args.p_is_existing_record && args.p_expected_log_updated_at === 'stale_version_ts') {
            return {
              data: null,
              error: {
                code: '40001',
                message: 'PARCEL_LOG_CONFLICT: The parcel record was modified since review.',
              },
            };
          }

          if (args.p_observation_id === 'missing_attendance_obs') {
            return {
              data: null,
              error: {
                code: '22000',
                message: 'PARCEL_ATTENDANCE_REQUIRED: Rider rider_abc has no attendance Time In for 2026-09-01. Official attendance is required before recording parcel earnings.',
              },
            };
          }

          if (!args.p_is_existing_record && args.p_observation_id === 'concurrent_created_obs') {
            return {
              data: null,
              error: {
                code: '40001',
                message: 'PARCEL_LOG_CONFLICT: A parcel record was created by another user since review.',
              },
            };
          }

          const delivered = 86;
          const standard = delivered - args.p_heavy_delivered;
          const returned = args.p_returned !== null ? args.p_returned : 3; // preserves 3 if null

          return {
            data: {
              success: true,
              observation_id: args.p_observation_id,
              parcel_log_id: 'plog_123',
              rider_id: 'rider_abc',
              business_date: '2026-09-01',
              standard_delivered: standard,
              heavy_delivered: args.p_heavy_delivered,
              failed: args.p_failed || 4,
              returned,
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    },
  };
});

describe('FMS Confirmation Invariants & OCC Protection', () => {
  it('correctly calculates derived Standard delivered as Delivered - Heavy', async () => {
    const res = await confirmFmsDailyRiderObservation({
      observationId: 'valid_obs',
      heavyDelivered: 6,
      failed: 4,
      returned: 0,
      isExistingRecord: false,
    });

    expect(res.success).toBe(true);
    expect(res.heavyDelivered).toBe(6);
    expect(res.standardDelivered).toBe(80); // 86 - 6
  });

  it('rejects confirmation when heavy exceeds total delivered', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'invalid_heavy_obs',
        heavyDelivered: 100, // Total is 86
        isExistingRecord: false,
      })
    ).rejects.toThrow(/INVALID_CLASSIFICATION/);
  });

  it('preserves existing returned parcels count when null is supplied', async () => {
    const res = await confirmFmsDailyRiderObservation({
      observationId: 'valid_obs',
      heavyDelivered: 10,
      returned: null, // Should preserve existing
      isExistingRecord: true,
      expectedLogUpdatedAt: '2026-09-01T10:00:00Z',
    });

    expect(res.success).toBe(true);
    expect(res.returned).toBe(3); // Preserved
    expect(res.standardDelivered).toBe(76); // 86 - 10
  });

  it('rejects direct confirmation when shift date is inside a locked payroll cutoff', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'locked_cutoff_obs',
        heavyDelivered: 0,
        isExistingRecord: false,
      })
    ).rejects.toThrow(/PAYROLL_PERIOD_LOCKED/);
  });

  it('rejects confirmation when existing parcel log updated_at does not match expected version (OCC conflict)', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'valid_obs',
        heavyDelivered: 6,
        expectedLogUpdatedAt: 'stale_version_ts',
        isExistingRecord: true,
      })
    ).rejects.toThrow(/PARCEL_LOG_CONFLICT/);
  });

  it('rejects confirmation when client assumed no existing row but another user created one (concurrent insert race)', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'concurrent_created_obs',
        heavyDelivered: 6,
        isExistingRecord: false,
      })
    ).rejects.toThrow(/PARCEL_LOG_CONFLICT/);
  });

  it('rejects confirmation when mapped rider has no official attendance (PARCEL_ATTENDANCE_REQUIRED)', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'missing_attendance_obs',
        heavyDelivered: 0,
        isExistingRecord: false,
      })
    ).rejects.toThrow(/PARCEL_ATTENDANCE_REQUIRED/);
  });
});
