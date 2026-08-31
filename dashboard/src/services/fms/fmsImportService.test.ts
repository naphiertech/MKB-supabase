import { describe, it, expect, vi } from 'vitest';
import {
  stageFmsImportBatch,
  confirmFmsDailyRiderObservation,
  cancelFmsImportBatch,
  listFmsImportBatches,
  getFmsImportBatchById,
  resolveBatchResumeStep,
  groupBatchesByDate,
  FmsImportBatch,
} from './fmsImportService';

vi.mock('../../lib/supabaseClient', () => {
  return {
    supabase: {
      rpc: vi.fn(async (funcName: string, args: any) => {
        if (funcName === 'cancel_fms_import_batch') {
          if (args.p_batch_id === 'confirmed_batch_id') {
            return {
              data: null,
              error: {
                code: '22000',
                message: 'BATCH_CANNOT_BE_CANCELLED: Batch contains confirmed observations.',
              },
            };
          }
          return {
            data: {
              success: true,
              batch_id: args.p_batch_id,
              status: 'cancelled',
            },
            error: null,
          };
        }
        if (funcName === 'stage_fms_import_batch') {
          if (args.p_file_sha256 === 'existing_sha256') {
            if (args.p_business_date !== '2026-08-30' || args.p_hub_id !== 'h1') {
              return {
                data: null,
                error: {
                  code: '23505',
                  message: 'FILE_ALREADY_STAGED: This delivery file was already staged for Aug 30, 2026 at Talon-Talon Hub (Batch ID: existing_batch_id). It cannot be reused for ' + args.p_business_date + '.',
                },
              };
            }
            return {
              data: {
                success: true,
                is_existing: true,
                batch_id: 'existing_batch_id',
                business_date: '2026-08-30',
                hub_id: 'h1',
                filename: args.p_filename,
                source_row_count: args.p_source_row_count,
                status: 'staged',
              },
              error: null,
            };
          }
          return {
            data: {
              success: true,
              is_existing: false,
              batch_id: 'new_batch_id',
              business_date: args.p_business_date,
              hub_id: args.p_hub_id,
              filename: args.p_filename,
              source_row_count: args.p_source_row_count,
              status: 'staged',
            },
            error: null,
          };
        }

        if (funcName === 'confirm_fms_daily_rider_observation') {
          if (args.p_observation_id === 'locked_obs_id') {
            return {
              data: null,
              error: {
                code: '55P03',
                message: 'PAYROLL_PERIOD_LOCKED: Shift date belongs to a pending payroll period.',
              },
            };
          }
          if (args.p_is_existing_record && args.p_expected_log_updated_at === 'stale_updated_at') {
            return {
              data: null,
              error: {
                code: '40001',
                message: 'PARCEL_LOG_CONFLICT: Parcel record was modified since review.',
              },
            };
          }
          return {
            data: {
              success: true,
              observation_id: args.p_observation_id,
              parcel_log_id: 'new_parcel_log_id',
              rider_id: 'rider_1',
              business_date: '2026-09-01',
              standard_delivered: 80,
              heavy_delivered: args.p_heavy_delivered,
              failed: args.p_failed || 4,
              returned: args.p_returned || 0,
            },
            error: null,
          };
        }

        return { data: null, error: null };
      }),

      from: vi.fn((table: string) => {
        if (table === 'fms_import_batches') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'b1',
                    source_system: 'spx_fms',
                    business_date: '2026-09-01',
                    filename: 'Fleet_20260901.xlsx',
                    file_sha256: 'sha1',
                    hub_id: 'h1',
                    imported_by: 'u1',
                    imported_at: '2026-09-01T10:00:00Z',
                    source_row_count: 10,
                    status: 'staged',
                    parser_version: 'fms_delivery_v3.0',
                    created_at: '2026-09-01T10:00:00Z',
                  },
                ],
                error: null,
              }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'b1',
                    source_system: 'spx_fms',
                    business_date: '2026-09-01',
                    filename: 'Fleet_20260901.xlsx',
                    file_sha256: 'sha1',
                    hub_id: 'h1',
                    imported_by: 'u1',
                    imported_at: '2026-09-01T10:00:00Z',
                    source_row_count: 10,
                    status: 'staged',
                    parser_version: 'fms_delivery_v3.0',
                    created_at: '2026-09-01T10:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    },
  };
});

describe('fmsImportService', () => {
  it('stages a new FMS import batch successfully', async () => {
    const res = await stageFmsImportBatch({
      businessDate: '2026-09-01',
      filename: 'Fleet_20260901.xlsx',
      fileSha256: 'new_sha256',
      hubId: 'h1',
      sourceRowCount: 1,
      observations: [
        {
          external_driver_id: '410740',
          external_driver_name: 'Shamera Habibun Asali',
          assigned: 100,
          assigned_target: 100,
          handed_over: 100,
          delivered: 86,
          delivering: 10,
          failed_delivery: 4,
          stuck_at_delivering: 0,
          on_hold: 0,
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.isExisting).toBe(false);
    expect(res.batchId).toBe('new_batch_id');
  });

  it('detects existing batch when SHA-256, date, and hub are identical', async () => {
    const res = await stageFmsImportBatch({
      businessDate: '2026-08-30',
      filename: 'Fleet_20260830.xlsx',
      fileSha256: 'existing_sha256',
      hubId: 'h1',
      sourceRowCount: 1,
      observations: [],
    });

    expect(res.success).toBe(true);
    expect(res.isExisting).toBe(true);
    expect(res.batchId).toBe('existing_batch_id');
    expect(res.businessDate).toBe('2026-08-30');
    expect(res.hubId).toBe('h1');
  });

  it('throws FILE_ALREADY_STAGED when identical SHA-256 is uploaded with a different date', async () => {
    await expect(
      stageFmsImportBatch({
        businessDate: '2026-08-31',
        filename: 'Fleet_20260831.xlsx',
        fileSha256: 'existing_sha256',
        hubId: 'h1',
        sourceRowCount: 1,
        observations: [],
      })
    ).rejects.toThrow(/FILE_ALREADY_STAGED/);
  });

  it('throws FILE_ALREADY_STAGED when identical SHA-256 is uploaded with a different hub', async () => {
    await expect(
      stageFmsImportBatch({
        businessDate: '2026-08-30',
        filename: 'Fleet_20260830.xlsx',
        fileSha256: 'existing_sha256',
        hubId: 'h2',
        sourceRowCount: 1,
        observations: [],
      })
    ).rejects.toThrow(/FILE_ALREADY_STAGED/);
  });

  it('confirms observation and derives standard delivered', async () => {
    const res = await confirmFmsDailyRiderObservation({
      observationId: 'obs_1',
      heavyDelivered: 6,
      failed: 4,
      returned: 0,
      isExistingRecord: false,
    });

    expect(res.success).toBe(true);
    expect(res.heavyDelivered).toBe(6);
    expect(res.standardDelivered).toBe(80);
    expect(res.parcelLogId).toBe('new_parcel_log_id');
  });

  it('throws error when confirmation encounters a locked payroll period', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'locked_obs_id',
        heavyDelivered: 0,
        isExistingRecord: false,
      })
    ).rejects.toThrow(/PAYROLL_PERIOD_LOCKED/);
  });

  it('throws error when confirmation encounters an OCC version mismatch', async () => {
    await expect(
      confirmFmsDailyRiderObservation({
        observationId: 'obs_1',
        heavyDelivered: 6,
        expectedLogUpdatedAt: 'stale_updated_at',
        isExistingRecord: true,
      })
    ).rejects.toThrow(/PARCEL_LOG_CONFLICT/);
  });

  it('lists import batches', async () => {
    const batches = await listFmsImportBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0].filename).toBe('Fleet_20260901.xlsx');
  });

  it('fetches a single batch by ID', async () => {
    const batch = await getFmsImportBatchById('b1');
    expect(batch).not.toBeNull();
    expect(batch?.id).toBe('b1');
    expect(batch?.filename).toBe('Fleet_20260901.xlsx');
  });

  describe('cancelFmsImportBatch', () => {
    it('cancels a staged batch successfully', async () => {
      const result = await cancelFmsImportBatch('staged_batch_id');
      expect(result.success).toBe(true);
      expect(result.status).toBe('cancelled');
    });

    it('throws when trying to cancel a batch with confirmed records', async () => {
      await expect(cancelFmsImportBatch('confirmed_batch_id')).rejects.toThrow(
        /BATCH_CANNOT_BE_CANCELLED/
      );
    });
  });

  describe('resolveBatchResumeStep', () => {
    it('resumes at Step 6 (Read-Only) for confirmed or cancelled batches', () => {
      expect(resolveBatchResumeStep({ status: 'confirmed' }, [])).toBe(6);
      expect(resolveBatchResumeStep({ status: 'cancelled' }, [])).toBe(6);
    });

    it('resumes at Step 3 (Map Riders) when unmapped riders exist in a staged batch', () => {
      const obs = [
        { rider_id: 'rider-1', confirmation_status: 'staged' },
        { rider_id: null, confirmation_status: 'staged' },
      ];
      expect(resolveBatchResumeStep({ status: 'staged' }, obs)).toBe(3);
    });

    it('resumes at Step 4 (Classify) when all riders are mapped in a staged batch', () => {
      const obs = [
        { rider_id: 'rider-1', confirmation_status: 'staged' },
        { rider_id: 'rider-2', confirmation_status: 'staged' },
      ];
      expect(resolveBatchResumeStep({ status: 'staged' }, obs)).toBe(4);
    });
  });

  describe('groupBatchesByDate', () => {
    it('groups multiple same-day snapshots by Hub and Business Date, sorting descending by imported_at', () => {
      const sampleBatches: FmsImportBatch[] = [
        {
          id: 'b1',
          source_system: 'spx_fms',
          business_date: '2026-08-30',
          filename: 'Morning_11am.xlsx',
          file_sha256: 'sha1',
          hub_id: 'hub-1',
          imported_by: 'user-1',
          imported_at: '2026-08-30T03:00:00Z',
          source_row_count: 15,
          status: 'confirmed',
          parser_version: 'Delivery V3.0',
          created_at: '2026-08-30T03:00:00Z',
        },
        {
          id: 'b2',
          source_system: 'spx_fms',
          business_date: '2026-08-30',
          filename: 'Evening_5pm.xlsx',
          file_sha256: 'sha2',
          hub_id: 'hub-1',
          imported_by: 'user-1',
          imported_at: '2026-08-30T09:00:00Z',
          source_row_count: 18,
          status: 'staged',
          parser_version: 'Delivery V3.0',
          created_at: '2026-08-30T09:00:00Z',
        },
        {
          id: 'b3',
          source_system: 'spx_fms',
          business_date: '2026-08-29',
          filename: 'Yesterday.xlsx',
          file_sha256: 'sha3',
          hub_id: 'hub-1',
          imported_by: 'user-1',
          imported_at: '2026-08-29T09:00:00Z',
          source_row_count: 12,
          status: 'confirmed',
          parser_version: 'Delivery V3.0',
          created_at: '2026-08-29T09:00:00Z',
        },
      ];

      const groups = groupBatchesByDate(sampleBatches);
      expect(groups).toHaveLength(2);

      const aug30Group = groups.find((g) => g.businessDate === '2026-08-30');
      expect(aug30Group).toBeDefined();
      expect(aug30Group!.totalSnapshots).toBe(2);
      expect(aug30Group!.latestBatch.id).toBe('b2');
      expect(aug30Group!.latestBatch.filename).toBe('Evening_5pm.xlsx');
      expect(aug30Group!.allBatches).toHaveLength(2);
      expect(aug30Group!.allBatches[0].id).toBe('b2');
      expect(aug30Group!.allBatches[1].id).toBe('b1');
    });
  });
});
