import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollStatus } from '../types/payroll';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  bulkApprove: vi.fn(),
  bulkPay: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

vi.mock('../lib/apiService', () => ({
  logActivity: vi.fn(),
}));

vi.mock('./notificationService', () => ({
  dispatchNotificationSafe: vi.fn(),
}));

vi.mock('./payrollBulkActions', () => ({
  bulkApprovePayrollRecords: mocks.bulkApprove,
  bulkMarkPayrollRecordsPaid: mocks.bulkPay,
}));

import {
  calculateDeliverySuccessRate,
  getParcelLogs,
  getPayrollDeliveryData,
  MissingPayrollSnapshotError,
  summarizeOperationalParcels,
  syncPayrollRecordsFromParcelLogs,
  updatePayrollRecordStatus,
  type ParcelLog,
} from './parcelService';

const sampleLogs: ParcelLog[] = [
  {
    id: 'log-1',
    riderId: 'rider-1',
    date: '2026-08-01',
    parcels: 80,
    heavyParcels: 5,
    assignedParcels: 100,
    failedParcels: 12,
    returnedParcels: 8,
    rate: 12,
    heavyRate: 17,
    standardEarnings: 960,
    heavyEarnings: 85,
    dailyGross: 1045,
    rateConfigurationId: 'rate-1',
    calculationVersion: 2,
    source: 'live',
  },
  {
    id: 'log-2',
    riderId: 'rider-1',
    date: '2026-08-02',
    parcels: 45,
    heavyParcels: 2,
    assignedParcels: 50,
    failedParcels: 3,
    returnedParcels: 2,
    rate: 11,
    heavyRate: 17,
    standardEarnings: 495,
    heavyEarnings: 34,
    dailyGross: 529,
    rateConfigurationId: 'rate-1',
    calculationVersion: 2,
    source: 'live',
  },
];

beforeEach(() => {
  mocks.from.mockReset();
  mocks.bulkApprove.mockReset();
  mocks.bulkPay.mockReset();
});

describe('individual finalized payroll transitions', () => {
  function mockPayrollRecord(status: 'pending' | 'approved') {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.single.mockResolvedValue({
      data: {
        id: 'payroll-1',
        rider_id: 'rider-1',
        cutoff_start: '2026-08-01',
        cutoff_end: '2026-08-15',
        total_parcels: 0,
        standard_parcels: 0,
        heavy_parcels: 0,
        standard_earnings: 0,
        heavy_earnings: 0,
        gross_pay: 0,
        rate_configuration_id: null,
        calculation_version: 2,
        snapshot_finalized_at: '2026-08-09T08:00:00Z',
        status,
        updated_at: '2026-08-09T08:00:00Z',
        riders: { name: 'Test Rider' },
      },
      error: null,
    });
    mocks.from.mockReturnValue(query);
  }

  it('routes individual approval through the authoritative transition RPC', async () => {
    mockPayrollRecord('pending');
    mocks.bulkApprove.mockResolvedValue({ processed_count: 1 });

    await updatePayrollRecordStatus('payroll-1', PayrollStatus.APPROVED, { userId: 'admin-1' });

    expect(mocks.bulkApprove).toHaveBeenCalledWith(expect.objectContaining({
      records: [{ id: 'payroll-1', status: 'pending', updated_at: '2026-08-09T08:00:00Z' }],
      cutoffStart: '2026-08-01',
      cutoffEnd: '2026-08-15',
    }));
    expect(mocks.bulkPay).not.toHaveBeenCalled();
  });

  it('routes individual payment through the authoritative transition RPC', async () => {
    mockPayrollRecord('approved');
    mocks.bulkPay.mockResolvedValue({ processed_count: 1 });

    await updatePayrollRecordStatus('payroll-1', PayrollStatus.PAID, { userId: 'hr-1' });

    expect(mocks.bulkPay).toHaveBeenCalledWith(expect.objectContaining({
      records: [{ id: 'payroll-1', status: 'approved', updated_at: '2026-08-09T08:00:00Z' }],
    }));
    expect(mocks.bulkApprove).not.toHaveBeenCalled();
  });
});

describe('payroll operational parcel reads', () => {
  it('reads and maps the operational fields directly from parcel_logs', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [{
        id: 'log-1',
        rider_id: 'rider-1',
        date: '2026-08-01',
        parcels: 80,
        heavy_parcels: 5,
        assigned_parcels: 100,
        failed_parcels: 12,
        returned_parcels: 8,
        rate: 12,
        heavy_rate: 17,
        standard_earnings: 960,
        heavy_earnings: 85,
        daily_gross: 1045,
        rate_configuration_id: 'rate-1',
      }],
      error: null,
    });
    mocks.from.mockReturnValue(query);

    const result = await getParcelLogs('rider-1', '2026-08-01', '2026-08-15');

    expect(mocks.from).toHaveBeenCalledWith('parcel_logs');
    expect(query.select).toHaveBeenCalledWith(
      'id, rider_id, date, parcels, heavy_parcels, assigned_parcels, failed_parcels, returned_parcels, rate, heavy_rate, standard_earnings, heavy_earnings, daily_gross, rate_configuration_id'
    );
    expect(result).toEqual([sampleLogs[0]]);
  });

  it('summarizes delivered, failed, returned, assigned, and success rate', () => {
    expect(summarizeOperationalParcels(sampleLogs)).toEqual({
      delivered: 132,
      standardDelivered: 125,
      heavyDelivered: 7,
      failed: 15,
      returned: 10,
      totalHandled: 157,
      assigned: 150,
      successRate: 84.1,
      standardEarnings: 1455,
      heavyEarnings: 119,
      grossDeliveryPay: 1574,
      rateConfigurationIds: ['rate-1'],
    });
    expect(calculateDeliverySuccessRate(10, null)).toBeNull();
    expect(calculateDeliverySuccessRate(10, 0)).toBeNull();
  });
});

describe('immutable payroll delivery reads', () => {
  it('reads finalized payroll from delivery snapshots with heavy earnings preserved', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [{
        id: 'line-1', payroll_record_id: 'payroll-1', rider_id: 'rider-1', date: '2026-08-01',
        standard_delivered: 20, heavy_delivered: 5, failed: 2, returned: 1,
        applied_standard_rate: 12, applied_heavy_rate: 17,
        standard_earnings: 240, heavy_earnings: 85, gross_delivery_pay: 325,
        rate_configuration_id: 'rate-1', calculation_version: 2,
      }],
      error: null,
    });
    mocks.from.mockReturnValue(query);

    const result = await getPayrollDeliveryData({
      id: 'payroll-1', rider_id: 'rider-1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15',
      status: 'paid', total_parcels: 25, calculation_version: 2,
    });

    expect(mocks.from).toHaveBeenCalledWith('payroll_delivery_lines');
    expect(result.source).toBe('snapshot');
    expect(result.summary).toMatchObject({ standardDelivered: 20, heavyDelivered: 5, failed: 2, returned: 1, grossDeliveryPay: 325 });
  });

  it('keeps a paid legacy payroll as an aggregate snapshot without live reconstruction', async () => {
    const result = await getPayrollDeliveryData({
      id: 'legacy-1', rider_id: 'rider-1', cutoff_start: '2026-07-01', cutoff_end: '2026-07-15',
      status: 'paid', total_parcels: 178, gross_pay: 1884, calculation_version: 1,
    });

    expect(mocks.from).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'legacy', lines: [], summary: { standardDelivered: 178, heavyDelivered: 0, grossDeliveryPay: 1884 } });
  });

  it('fails clearly when a modern finalized line has no rate configuration snapshot', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockResolvedValue({
      data: [{
        id: 'line-1', rider_id: 'rider-1', date: '2026-08-01', standard_delivered: 1,
        heavy_delivered: 0, failed: 0, returned: 0, applied_standard_rate: 12,
        applied_heavy_rate: 17, standard_earnings: 12, heavy_earnings: 0,
        gross_delivery_pay: 12, rate_configuration_id: null, calculation_version: 2,
      }], error: null,
    });
    mocks.from.mockReturnValue(query);

    await expect(getPayrollDeliveryData({
      id: 'payroll-1', rider_id: 'rider-1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15',
      status: 'approved', total_parcels: 1, calculation_version: 2,
    })).rejects.toBeInstanceOf(MissingPayrollSnapshotError);
  });
});

describe('payroll synchronization immutability', () => {
  it('ignores incomplete legacy parcel metadata when the payroll record is finalized', async () => {
    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: [{
        rider_id: 'rider-1', date: '2026-07-11', parcels: 10, heavy_parcels: 0,
        rate: 12, heavy_rate: null,
        standard_earnings: 120, heavy_earnings: 0, daily_gross: 120, rate_configuration_id: null,
      }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [{ id: 'payroll-1', rider_id: 'rider-1', status: 'paid' }],
      error: null,
    });

    mocks.from
      .mockReturnValueOnce(logsQuery)
      .mockReturnValueOnce(recordsQuery);

    await expect(syncPayrollRecordsFromParcelLogs('2026-07-01', '2026-07-15')).resolves.toBeUndefined();

    expect(recordsQuery.upsert).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('does not upsert paid or otherwise finalized payroll records', async () => {
    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: [{
        rider_id: 'rider-1', date: '2026-08-01', parcels: 10, heavy_parcels: 2,
        rate: 12, heavy_rate: 17,
        standard_earnings: 120, heavy_earnings: 34, daily_gross: 154, rate_configuration_id: 'rate-1',
      }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [{ id: 'payroll-1', rider_id: 'rider-1', status: 'paid' }],
      error: null,
    });

    mocks.from
      .mockReturnValueOnce(logsQuery)
      .mockReturnValueOnce(recordsQuery);

    await syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15');

    expect(recordsQuery.upsert).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('continues synchronizing draft records and creating missing drafts when explicitly requested', async () => {
    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: [
        {
          rider_id: 'rider-1', date: '2026-08-01', parcels: 10, heavy_parcels: 2,
          rate: 12, heavy_rate: 17,
          standard_earnings: 120, heavy_earnings: 34, daily_gross: 154, rate_configuration_id: 'rate-1',
        },
        {
          rider_id: 'rider-2', date: '2026-08-01', parcels: 5, heavy_parcels: 0,
          rate: 11, heavy_rate: 17,
          standard_earnings: 55, heavy_earnings: 0, daily_gross: 55, rate_configuration_id: 'rate-1',
        },
      ],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [{ id: 'payroll-1', rider_id: 'rider-1', status: 'draft' }],
      error: null,
    });
    recordsQuery.upsert.mockResolvedValue({ error: null });

    mocks.from
      .mockReturnValueOnce(logsQuery)
      .mockReturnValueOnce(recordsQuery)
      .mockReturnValueOnce(recordsQuery);

    await syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15', { allowCreateMissing: true });

    expect(recordsQuery.upsert).toHaveBeenCalledOnce();
    expect(recordsQuery.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'payroll-1',
          rider_id: 'rider-1',
          status: 'draft',
          total_parcels: 12,
          standard_parcels: 10,
          heavy_parcels: 2,
          standard_earnings: 120,
          heavy_earnings: 34,
          gross_pay: 154,
        }),
        expect.objectContaining({
          rider_id: 'rider-2',
          status: 'draft',
          total_parcels: 5,
          standard_parcels: 5,
          heavy_parcels: 0,
          standard_earnings: 55,
          heavy_earnings: 0,
          gross_pay: 55,
        }),
      ]),
      { onConflict: 'rider_id,cutoff_start' }
    );
  });

  it('does not recreate missing or deleted draft records when allowCreateMissing is false', async () => {
    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: [
        {
          rider_id: 'rider-1', date: '2026-08-01', parcels: 10, heavy_parcels: 2,
          rate: 12, heavy_rate: 17,
          standard_earnings: 120, heavy_earnings: 34, daily_gross: 154, rate_configuration_id: 'rate-1',
        },
        {
          rider_id: 'rider-deleted', date: '2026-08-01', parcels: 5, heavy_parcels: 0,
          rate: 11, heavy_rate: 17,
          standard_earnings: 55, heavy_earnings: 0, daily_gross: 55, rate_configuration_id: 'rate-1',
        },
      ],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [{ id: 'payroll-1', rider_id: 'rider-1', status: 'draft' }],
      error: null,
    });
    recordsQuery.upsert.mockResolvedValue({ error: null });

    mocks.from
      .mockReturnValueOnce(logsQuery)
      .mockReturnValueOnce(recordsQuery)
      .mockReturnValueOnce(recordsQuery);

    await syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15');

    expect(recordsQuery.upsert).toHaveBeenCalledOnce();
    // Verify only existing rider-1 draft was updated, rider-deleted was NOT recreated
    expect(recordsQuery.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'payroll-1',
          rider_id: 'rider-1',
          status: 'draft',
          total_parcels: 12,
        }),
      ],
      { onConflict: 'rider_id,cutoff_start' }
    );
  });

  it('fails closed when existing payroll records cannot be loaded', async () => {
    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: [{
        rider_id: 'rider-1', date: '2026-08-01', parcels: 10, heavy_parcels: 0,
        rate: 12, heavy_rate: 17,
        standard_earnings: 120, heavy_earnings: 0, daily_gross: 120, rate_configuration_id: 'rate-1',
      }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: null,
      error: { message: 'temporary read failure' },
    });

    mocks.from
      .mockReturnValueOnce(logsQuery)
      .mockReturnValueOnce(recordsQuery);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15')).rejects.toEqual({ message: 'temporary read failure' });

    expect(recordsQuery.upsert).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});

describe('payroll deletion & read purity tests', () => {
  it('deletePayrollRecord deletes the record without modifying parcel logs or source data', async () => {
    const deleteQuery = {
      delete: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
    };
    deleteQuery.delete.mockReturnValue(deleteQuery);
    deleteQuery.eq.mockReturnValue(deleteQuery);
    deleteQuery.select.mockResolvedValue({
      data: [{ id: 'payroll-to-delete' }],
      error: null,
    });

    mocks.from.mockReturnValue(deleteQuery);

    const { deletePayrollRecord } = await import('./parcelService');
    await deletePayrollRecord('payroll-to-delete');

    expect(mocks.from).toHaveBeenCalledWith('payroll_records');
    expect(deleteQuery.delete).toHaveBeenCalled();
    expect(deleteQuery.eq).toHaveBeenCalledWith('id', 'payroll-to-delete');
    // Ensure no calls to delete parcel_logs or riders were made
    expect(mocks.from).not.toHaveBeenCalledWith('parcel_logs');
    expect(mocks.from).not.toHaveBeenCalledWith('riders');
  });

  it('getPayrollRecords and getPaginatedPayrollRecords perform pure SELECT queries without triggering payroll sync', async () => {
    const selectQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      or: vi.fn(),
      eq: vi.fn(),
    };
    selectQuery.select.mockReturnValue(selectQuery);
    selectQuery.gte.mockReturnValue(selectQuery);
    selectQuery.lte.mockReturnValue(selectQuery);
    selectQuery.order.mockReturnValue(selectQuery);
    selectQuery.range.mockResolvedValue({
      data: [{ id: 'payroll-1', rider_id: 'rider-1', status: 'draft', riders: { name: 'Test Rider', mkb_id: 'MKB-1' } }],
      count: 1,
      error: null,
    });

    mocks.from.mockReturnValue(selectQuery);

    const { getPaginatedPayrollRecords } = await import('./parcelService');
    const result = await getPaginatedPayrollRecords({
      cutoffFrom: '2026-08-01',
      cutoffTo: '2026-08-15',
      page: 1,
      pageSize: 25,
    });

    expect(result.records).toHaveLength(1);
    expect(result.totalCount).toBe(1);
    // Verify only SELECT query on payroll_records occurred (no sync SELECT/UPSERT on parcel_logs)
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('payroll_records');
  });

  it('initializeCutoffPayrollForFleet creates missing fleet drafts and immediately hydrates them from parcel_logs', async () => {
    const ridersQuery = {
      select: vi.fn(),
    };
    ridersQuery.select.mockResolvedValue({
      data: [{ id: 'rider-fleet-1', name: 'Fleet Rider' }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [],
      error: null,
    });
    recordsQuery.upsert.mockResolvedValue({ error: null });

    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: [{
        rider_id: 'rider-fleet-1', date: '2026-08-01', parcels: 61, heavy_parcels: 8,
        rate: 10, heavy_rate: 17,
        standard_earnings: 610, heavy_earnings: 136, daily_gross: 746, rate_configuration_id: 'rate-1',
      }],
      error: null,
    });

    const existingAfterInsertQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    existingAfterInsertQuery.select.mockReturnValue(existingAfterInsertQuery);
    existingAfterInsertQuery.eq.mockResolvedValue({
      data: [{ id: 'new-draft-id', rider_id: 'rider-fleet-1', status: 'draft' }],
      error: null,
    });

    mocks.from
      .mockReturnValueOnce(ridersQuery)               // 1. fetch riders
      .mockReturnValueOnce(recordsQuery)              // 2. fetch existing payroll records
      .mockReturnValueOnce(recordsQuery)              // 3. upsert initial placeholder draft
      .mockReturnValueOnce(logsQuery)                 // 4. sync: fetch parcel logs
      .mockReturnValueOnce(existingAfterInsertQuery)  // 5. sync: fetch existing records
      .mockReturnValueOnce(recordsQuery);             // 6. sync: upsert hydrated draft

    const { initializeCutoffPayrollForFleet } = await import('./parcelService');
    const result = await initializeCutoffPayrollForFleet('2026-08-01', '2026-08-15');

    expect(result).toEqual({ initializedCount: 1, totalRiders: 1 });
    // Verify initial upsert was called with skeleton
    expect(recordsQuery.upsert).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({
        rider_id: 'rider-fleet-1',
        cutoff_start: '2026-08-01',
        cutoff_end: '2026-08-15',
        status: 'draft',
      })
    ], { onConflict: 'rider_id,cutoff_start' });

    // Verify hydrated upsert was called with real parcel totals
    expect(recordsQuery.upsert).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({
        id: 'new-draft-id',
        rider_id: 'rider-fleet-1',
        total_parcels: 69,
        standard_parcels: 61,
        heavy_parcels: 8,
        gross_pay: 746,
        status: 'draft',
      })
    ], { onConflict: 'rider_id,cutoff_start' });
  });

  it('initializeCutoffPayrollForFleet fails cleanly if hydration encounters an error', async () => {
    const ridersQuery = {
      select: vi.fn(),
    };
    ridersQuery.select.mockResolvedValue({
      data: [{ id: 'rider-fleet-1', name: 'Fleet Rider' }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [],
      error: null,
    });
    recordsQuery.upsert.mockResolvedValue({ error: null });

    const logsQuery = {
      select: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
    };
    logsQuery.select.mockReturnValue(logsQuery);
    logsQuery.gte.mockReturnValue(logsQuery);
    logsQuery.lte.mockResolvedValue({
      data: null,
      error: { message: 'Failed to read parcel logs' },
    });

    mocks.from
      .mockReturnValueOnce(ridersQuery)
      .mockReturnValueOnce(recordsQuery)
      .mockReturnValueOnce(recordsQuery)
      .mockReturnValueOnce(logsQuery);

    const { initializeCutoffPayrollForFleet } = await import('./parcelService');
    await expect(initializeCutoffPayrollForFleet('2026-08-01', '2026-08-15')).rejects.toEqual({
      message: 'Failed to read parcel logs',
    });
  });
});
