import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollStatus } from '../types/payroll';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  bulkApprove: vi.fn(),
  bulkPay: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

vi.mock('../lib/apiService', () => ({
  logActivity: vi.fn(),
}));

vi.mock('./notifications/notificationService', () => ({
  dispatchNotificationSafe: vi.fn(),
}));

vi.mock('./payroll/payrollBulkActions', () => ({
  bulkApprovePayrollRecords: mocks.bulkApprove,
  bulkMarkPayrollRecordsPaid: mocks.bulkPay,
}));

import {
  calculateDeliverySuccessRate,
  getArchivedPayrollCutoffsSummary,
  getCutoffPreparationCoverage,
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
  mocks.rpc.mockReset();
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
    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockReturnValue(recordsQuery);
    recordsQuery.in.mockResolvedValue({
      data: [],
      error: null,
    });

    mocks.from.mockReturnValueOnce(recordsQuery);

    await expect(syncPayrollRecordsFromParcelLogs('2026-07-01', '2026-07-15')).resolves.toBeUndefined();

    expect(mocks.rpc).not.toHaveBeenCalledWith('refresh_draft_payroll_record', expect.anything());
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('does not refresh paid or otherwise finalized payroll records', async () => {
    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockReturnValue(recordsQuery);
    recordsQuery.in.mockResolvedValue({
      data: [],
      error: null,
    });

    mocks.from.mockReturnValueOnce(recordsQuery);

    await syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15');

    expect(mocks.rpc).not.toHaveBeenCalledWith('refresh_draft_payroll_record', expect.anything());
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('synchronizes draft records via server RPC and creates missing drafts when explicitly requested', async () => {
    mocks.rpc.mockImplementation(async (method: string) => {
      if (method === 'get_payroll_eligible_rider_ids') {
        return { data: [{ rider_id: 'rider-1' }, { rider_id: 'rider-2' }], error: null };
      }
      if (method === 'refresh_draft_payroll_record') {
        return { data: { success: true }, error: null };
      }
      return { data: null, error: null };
    });

    const ridersQuery = {
      select: vi.fn(),
      in: vi.fn(),
    };
    ridersQuery.select.mockReturnValue(ridersQuery);
    ridersQuery.in.mockResolvedValue({
      data: [{ id: 'rider-1', name: 'Rider One' }, { id: 'rider-2', name: 'Rider Two' }],
      error: null,
    });

    const existingCutoffQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    existingCutoffQuery.select.mockReturnValue(existingCutoffQuery);
    existingCutoffQuery.eq.mockResolvedValue({
      data: [{ rider_id: 'rider-1' }],
      error: null,
    });

    const upsertQuery = {
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'payroll-2' }], error: null }),
      }),
    };

    const workingRecordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    workingRecordsQuery.select.mockReturnValue(workingRecordsQuery);
    workingRecordsQuery.eq.mockReturnValue(workingRecordsQuery);
    workingRecordsQuery.in.mockResolvedValue({
      data: [{ id: 'payroll-1', status: 'draft' }, { id: 'payroll-2', status: 'draft' }],
      error: null,
    });

    mocks.from
      .mockReturnValueOnce(ridersQuery)          // 1. fetch eligible riders
      .mockReturnValueOnce(existingCutoffQuery)   // 2. fetch existing payroll records
      .mockReturnValueOnce(upsertQuery)           // 3. upsert missing placeholder drafts with select
      .mockReturnValueOnce(workingRecordsQuery);  // 4. select working records for sync

    await syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15', { allowCreateMissing: true });

    expect(upsertQuery.upsert).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('refresh_draft_payroll_record', {
      p_payroll_record_id: 'payroll-1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('refresh_draft_payroll_record', {
      p_payroll_record_id: 'payroll-2',
    });
  });

  it('does not recreate missing or deleted draft records when allowCreateMissing is false', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockReturnValue(recordsQuery);
    recordsQuery.in.mockResolvedValue({
      data: [{ id: 'payroll-1', status: 'draft' }],
      error: null,
    });

    mocks.from.mockReturnValueOnce(recordsQuery);

    await syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15');

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith('refresh_draft_payroll_record', {
      p_payroll_record_id: 'payroll-1',
    });
  });

  it('fails closed when existing payroll records cannot be loaded', async () => {
    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockReturnValue(recordsQuery);
    recordsQuery.in.mockResolvedValue({
      data: null,
      error: { message: 'temporary read failure' },
    });

    mocks.from.mockReturnValueOnce(recordsQuery);

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(syncPayrollRecordsFromParcelLogs('2026-08-01', '2026-08-15')).rejects.toEqual({ message: 'temporary read failure' });

    expect(mocks.rpc).not.toHaveBeenCalledWith('refresh_draft_payroll_record', expect.anything());
    expect(mocks.from).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe('payroll deletion & read purity tests', () => {
  it('deletePayrollRecord uses the guarded RPC so financial sources are voided and audited', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const { deletePayrollRecord } = await import('./parcelService');
    await deletePayrollRecord('payroll-to-delete');

    expect(mocks.rpc).toHaveBeenCalledWith('delete_draft_payroll_record', {
      p_payroll_record_id: 'payroll-to-delete',
      p_reason: 'Deleted from Payroll Checklist',
    });
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
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('payroll_records');
  });

  it('initializeCutoffPayrollForFleet creates missing fleet drafts and recalculates them via server RPC', async () => {
    mocks.rpc.mockImplementation(async (method: string) => {
      if (method === 'get_payroll_eligible_rider_ids') {
        return { data: [{ rider_id: 'rider-fleet-1' }], error: null };
      }
      if (method === 'refresh_draft_payroll_record') {
        return { data: { success: true }, error: null };
      }
      return { data: null, error: null };
    });

    const ridersQuery = {
      select: vi.fn(),
      in: vi.fn(),
    };
    ridersQuery.select.mockReturnValue(ridersQuery);
    ridersQuery.in.mockResolvedValue({
      data: [{ id: 'rider-fleet-1', name: 'Fleet Rider' }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [],
      error: null,
    });

    const upsertQuery = {
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'new-draft-id' }], error: null }),
      }),
    };

    mocks.from
      .mockReturnValueOnce(ridersQuery)      // 1. fetch eligible riders
      .mockReturnValueOnce(recordsQuery)     // 2. fetch existing payroll records
      .mockReturnValueOnce(upsertQuery);     // 3. upsert initial placeholder draft with select

    const { initializeCutoffPayrollForFleet } = await import('./parcelService');
    const initResult = await initializeCutoffPayrollForFleet('2026-08-01', '2026-08-15');

    expect(initResult).toEqual({ initializedCount: 1, totalRiders: 1 });
    expect(upsertQuery.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        rider_id: 'rider-fleet-1',
        cutoff_start: '2026-08-01',
        cutoff_end: '2026-08-15',
        status: 'draft',
      })
    ], { onConflict: 'rider_id,cutoff_start' });

    expect(mocks.rpc).toHaveBeenCalledWith('refresh_draft_payroll_record', {
      p_payroll_record_id: 'new-draft-id',
    });
  });

  it('initializeCutoffPayrollForFleet fails cleanly if server refresh encounters an error', async () => {
    mocks.rpc.mockImplementation(async (method: string) => {
      if (method === 'get_payroll_eligible_rider_ids') {
        return { data: [{ rider_id: 'rider-fleet-1' }], error: null };
      }
      if (method === 'refresh_draft_payroll_record') {
        return { data: null, error: { message: 'Server calculation failed' } };
      }
      return { data: null, error: null };
    });

    const ridersQuery = {
      select: vi.fn(),
      in: vi.fn(),
    };
    ridersQuery.select.mockReturnValue(ridersQuery);
    ridersQuery.in.mockResolvedValue({
      data: [{ id: 'rider-fleet-1', name: 'Fleet Rider' }],
      error: null,
    });

    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockResolvedValue({
      data: [],
      error: null,
    });

    const upsertQuery = {
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'new-draft-id' }], error: null }),
      }),
    };

    mocks.from
      .mockReturnValueOnce(ridersQuery)
      .mockReturnValueOnce(recordsQuery)
      .mockReturnValueOnce(upsertQuery);

    const { initializeCutoffPayrollForFleet } = await import('./parcelService');
    await expect(initializeCutoffPayrollForFleet('2026-08-01', '2026-08-15')).rejects.toEqual({
      message: 'Server calculation failed',
    });
  });
});

describe('getArchivedPayrollCutoffsSummary status aggregation', () => {
  function mockPayrollRecordsQuery(rows: any[]) {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      eq: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.order.mockResolvedValue({ data: rows, error: null });
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
  }

  it('aggregates Paid only as paid', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'paid', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'paid', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('paid');
  });

  it('aggregates Approved only as approved', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'approved', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'approved', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('approved');
  });

  it('aggregates Submitted only as submitted', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'submitted', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'pending', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('submitted');
  });

  it('aggregates Draft only as draft', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'draft', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'draft', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('draft');
  });

  it('aggregates Rejected only as rejected', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'rejected', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'rejected', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('rejected');
  });

  it('aggregates Paid + Approved as mixed', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'paid', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'approved', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('mixed');
  });

  it('aggregates Paid + Draft as mixed', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'paid', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'draft', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('mixed');
  });

  it('aggregates Submitted + Rejected as mixed', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'submitted', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'rejected', rider_id: 'r2' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('mixed');
  });

  it('aggregates Paid + Approved + Rejected as mixed', async () => {
    mockPayrollRecordsQuery([
      { id: '1', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1000, status: 'paid', rider_id: 'r1' },
      { id: '2', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 1200, status: 'approved', rider_id: 'r2' },
      { id: '3', cutoff_start: '2026-08-01', cutoff_end: '2026-08-15', gross_pay: 800, status: 'rejected', rider_id: 'r3' },
    ]);

    const result = await getArchivedPayrollCutoffsSummary();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('mixed');
  });
});

describe('getCutoffPreparationCoverage tests', () => {
  const setupCoverageMocks = ({
    eligibleRiderIds,
    riders,
    existingPayrollRecords,
  }: {
    eligibleRiderIds: string[];
    riders: Array<{ id: string; hub_id: string }>;
    existingPayrollRecords: Array<{ rider_id: string }>;
  }) => {
    mocks.rpc.mockResolvedValue({
      data: eligibleRiderIds.map((id) => ({ rider_id: id })),
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === 'riders') {
        let currentRiders = riders;
        const query: any = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockImplementation((field: string, ids: string[]) => {
            const idSet = new Set(ids);
            currentRiders = currentRiders.filter((r) => idSet.has((r as any)[field]));
            return query;
          }),
          eq: vi.fn().mockImplementation((field: string, val: string) => {
            currentRiders = currentRiders.filter((r) => (r as any)[field] === val);
            return query;
          }),
          then: (resolve: any, reject: any) =>
            Promise.resolve({ data: currentRiders, error: null }).then(resolve, reject),
        };
        return query;
      }

      if (table === 'payroll_records') {
        let currentRecords = existingPayrollRecords;
        const query: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockImplementation((_field: string, scopedIds: string[]) => {
            const scopedSet = new Set(scopedIds);
            currentRecords = currentRecords.filter((rec) =>
              scopedSet.has(rec.rider_id)
            );
            return query;
          }),
          then: (resolve: any, reject: any) =>
            Promise.resolve({ data: currentRecords, error: null }).then(resolve, reject),
        };
        return query;
      }

      return {
        select: vi.fn().mockReturnThis(),
      };
    });
  };

  it('returns no_riders state when 0 eligible riders exist', async () => {
    setupCoverageMocks({
      eligibleRiderIds: [],
      riders: [],
      existingPayrollRecords: [],
    });

    const res = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15');
    expect(res).toEqual({
      totalEligible: 0,
      preparedCount: 0,
      missingCount: 0,
      state: 'no_riders',
    });
  });

  it('returns unprepared state when none of the eligible riders are prepared (0 / N)', async () => {
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3'],
      riders: [
        { id: 'r1', hub_id: 'hub-1' },
        { id: 'r2', hub_id: 'hub-1' },
        { id: 'r3', hub_id: 'hub-1' },
      ],
      existingPayrollRecords: [],
    });

    const res = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15');
    expect(res).toEqual({
      totalEligible: 3,
      preparedCount: 0,
      missingCount: 3,
      state: 'unprepared',
    });
  });

  it('returns partial state when only some eligible riders are prepared (X / N)', async () => {
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      riders: [
        { id: 'r1', hub_id: 'hub-1' },
        { id: 'r2', hub_id: 'hub-1' },
        { id: 'r3', hub_id: 'hub-1' },
        { id: 'r4', hub_id: 'hub-1' },
        { id: 'r5', hub_id: 'hub-1' },
      ],
      existingPayrollRecords: [{ rider_id: 'r1' }, { rider_id: 'r3' }],
    });

    const res = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15');
    expect(res).toEqual({
      totalEligible: 5,
      preparedCount: 2,
      missingCount: 3,
      state: 'partial',
    });
  });

  it('returns ready state when all eligible riders are prepared (N / N)', async () => {
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3'],
      riders: [
        { id: 'r1', hub_id: 'hub-1' },
        { id: 'r2', hub_id: 'hub-1' },
        { id: 'r3', hub_id: 'hub-1' },
      ],
      existingPayrollRecords: [
        { rider_id: 'r1' },
        { rider_id: 'r2' },
        { rider_id: 'r3' },
      ],
    });

    const res = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15');
    expect(res).toEqual({
      totalEligible: 3,
      preparedCount: 3,
      missingCount: 0,
      state: 'ready',
    });
  });

  it('respects single Hub scope filtering by hub_id', async () => {
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3', 'r4'],
      riders: [
        { id: 'r1', hub_id: 'hub-A' },
        { id: 'r2', hub_id: 'hub-A' },
        { id: 'r3', hub_id: 'hub-B' },
        { id: 'r4', hub_id: 'hub-B' },
      ],
      existingPayrollRecords: [{ rider_id: 'r1' }, { rider_id: 'r2' }],
    });

    // Checking for Hub A (both r1 and r2 are prepared -> ready)
    const resHubA = await getCutoffPreparationCoverage(
      '2026-08-01',
      '2026-08-15',
      'hub-A'
    );
    expect(resHubA).toEqual({
      totalEligible: 2,
      preparedCount: 2,
      missingCount: 0,
      state: 'ready',
    });

    // Checking for Hub B (neither r3 nor r4 is prepared -> unprepared)
    const resHubB = await getCutoffPreparationCoverage(
      '2026-08-01',
      '2026-08-15',
      'hub-B'
    );
    expect(resHubB).toEqual({
      totalEligible: 2,
      preparedCount: 0,
      missingCount: 2,
      state: 'unprepared',
    });
  });

  it('evaluates all eligible riders when hubId is null (All Hubs)', async () => {
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3', 'r4'],
      riders: [
        { id: 'r1', hub_id: 'hub-A' },
        { id: 'r2', hub_id: 'hub-A' },
        { id: 'r3', hub_id: 'hub-B' },
        { id: 'r4', hub_id: 'hub-B' },
      ],
      existingPayrollRecords: [{ rider_id: 'r1' }, { rider_id: 'r2' }],
    });

    const resAll = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15', null);
    expect(resAll).toEqual({
      totalEligible: 4,
      preparedCount: 2,
      missingCount: 2,
      state: 'partial',
    });
  });

  it('counts mixed payroll statuses (draft, submitted, approved, paid, rejected) as prepared', async () => {
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      riders: [
        { id: 'r1', hub_id: 'hub-1' },
        { id: 'r2', hub_id: 'hub-1' },
        { id: 'r3', hub_id: 'hub-1' },
        { id: 'r4', hub_id: 'hub-1' },
        { id: 'r5', hub_id: 'hub-1' },
      ],
      existingPayrollRecords: [
        { rider_id: 'r1' }, // e.g. draft
        { rider_id: 'r2' }, // e.g. submitted
        { rider_id: 'r3' }, // e.g. approved
        { rider_id: 'r4' }, // e.g. paid
        { rider_id: 'r5' }, // e.g. rejected
      ],
    });

    const res = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15');
    expect(res.state).toBe('ready');
    expect(res.preparedCount).toBe(5);
    expect(res.totalEligible).toBe(5);
  });

  it('returns partial state after Reset Drafts removes unedited draft records', async () => {
    // Before reset: 5 riders, 5 prepared (ready)
    // After reset: 2 unedited drafts deleted, leaving 3 records -> partial (3/5)
    setupCoverageMocks({
      eligibleRiderIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      riders: [
        { id: 'r1', hub_id: 'hub-1' },
        { id: 'r2', hub_id: 'hub-1' },
        { id: 'r3', hub_id: 'hub-1' },
        { id: 'r4', hub_id: 'hub-1' },
        { id: 'r5', hub_id: 'hub-1' },
      ],
      existingPayrollRecords: [
        { rider_id: 'r1' },
        { rider_id: 'r2' },
        { rider_id: 'r3' },
      ],
    });

    const res = await getCutoffPreparationCoverage('2026-08-01', '2026-08-15');
    expect(res).toEqual({
      totalEligible: 5,
      preparedCount: 3,
      missingCount: 2,
      state: 'partial',
    });
  });
});
