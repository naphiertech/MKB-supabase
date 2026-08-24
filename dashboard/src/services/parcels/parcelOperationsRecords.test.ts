import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getRiderWorkforceDirectory: vi.fn(),
  logActivity: vi.fn(),
  getLocalDateString: vi.fn(),
  getCutoffRangeForDate: vi.fn(),
  syncPayrollRecordsFromParcelLogs: vi.fn(),
  validateParcelCount: vi.fn(),
  validateParcelWorkDate: vi.fn(),
  getParcelRateContextForDate: vi.fn(),
  resolveStandardRateForTimeIn: vi.fn(),
  calculateParcelOperationalMetrics: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('../workforce/workforceDirectoryService', () => ({ getRiderWorkforceDirectory: mocks.getRiderWorkforceDirectory }));
vi.mock('../../lib/apiService', () => ({ logActivity: mocks.logActivity }));
vi.mock('../attendance/attendanceService', () => ({ getLocalDateString: mocks.getLocalDateString }));
vi.mock('../parcelService', () => ({
  getCutoffRangeForDate: mocks.getCutoffRangeForDate,
  syncPayrollRecordsFromParcelLogs: mocks.syncPayrollRecordsFromParcelLogs,
}));
vi.mock('./parcelOperationsPolicy', () => ({
  validateParcelCount: mocks.validateParcelCount,
  validateParcelWorkDate: mocks.validateParcelWorkDate,
  getParcelRateContextForDate: mocks.getParcelRateContextForDate,
  resolveStandardRateForTimeIn: mocks.resolveStandardRateForTimeIn,
  calculateParcelOperationalMetrics: mocks.calculateParcelOperationalMetrics,
}));
import {
  getDailyParcelEntries,
  getParcelHistory,
  saveDailyParcelEntries,
} from './parcelOperationsRecords';

const rateContext = {
  id: 'rate-config-current',
  earlyStandardRate: 12,
  regularStandardRate: 11,
  lateStandardRate: 10,
  heavyParcelRate: 17,
  heavyThresholdKg: 4,
  effectiveFrom: '2026-01-01',
  effectiveUntil: null,
};

const baseEntry = {
  riderId: 'rider-1',
  date: '2026-08-05',
  parcels: 20,
  heavyParcels: 2,
  assignedParcels: 25,
  failedDeliveries: 1,
  returnedParcels: 2,
  notes: 'Manifest',
};

function savedRow(entry = baseEntry) {
  return {
    id: `log-${entry.riderId}-${entry.date}`,
    rider_id: entry.riderId,
    date: entry.date,
    parcels: entry.parcels,
    heavy_parcels: entry.heavyParcels ?? 0,
    assigned_parcels: entry.assignedParcels ?? 0,
    failed_parcels: entry.failedDeliveries ?? 0,
    returned_parcels: entry.returnedParcels ?? 0,
    notes: entry.notes ?? null,
    rate: 12,
    heavy_rate: 17,
    standard_earnings: entry.parcels * 12,
    heavy_earnings: (entry.heavyParcels ?? 0) * 17,
    daily_gross: entry.parcels * 12 + (entry.heavyParcels ?? 0) * 17,
    rate_configuration_id: 'rate-config-current',
  };
}

function configureSave(options: {
  events?: string[];
  existingLogs?: Array<Record<string, unknown>> | null;
  existingReadError?: { message: string } | null;
  savedRows?: ReturnType<typeof savedRow>[];
  upsertError?: { code: string; message: string; details?: string } | null;
  auditError?: { message: string } | null;
} = {}) {
  const events = options.events ?? [];
  let parcelLogCalls = 0;
  const upsert = vi.fn(() => {
    events.push('upsert');
    return {
      select: vi.fn().mockResolvedValue({
        data: options.savedRows ?? [savedRow()],
        error: options.upsertError ?? null,
        status: options.upsertError ? 400 : 200,
        statusText: options.upsertError ? 'Bad Request' : 'OK',
      }),
    };
  });
  const auditInsert = vi.fn(async () => {
    events.push('audit');
    return { error: options.auditError ?? null };
  });

  mocks.from.mockImplementation((table: string) => {
    if (table === 'parcel_logs') {
      parcelLogCalls += 1;
      if (parcelLogCalls === 1) {
        events.push('existing-read');
        let inCalls = 0;
        const chain = {
          select: vi.fn(),
          in: vi.fn(),
        };
        chain.select.mockReturnValue(chain);
        chain.in.mockImplementation(() => {
          inCalls += 1;
          return inCalls === 1
            ? chain
            : Promise.resolve({ data: options.existingLogs ?? [], error: options.existingReadError ?? null });
        });
        return chain;
      }
      return { upsert };
    }
    if (table === 'parcel_log_audit') return { insert: auditInsert };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { events, upsert, auditInsert };
}

describe('parcel operations Records characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLocalDateString.mockReturnValue('2026-08-20');
    mocks.getParcelRateContextForDate.mockResolvedValue(rateContext);
    mocks.resolveStandardRateForTimeIn.mockReturnValue(12);
    mocks.calculateParcelOperationalMetrics.mockImplementation((input: {
      standardDelivered: number;
      heavyDelivered: number;
      failed: number;
      returned: number;
      standardRate: number;
      heavyRate: number;
    }) => {
      const totalDelivered = input.standardDelivered + input.heavyDelivered;
      const totalHandled = totalDelivered + input.failed + input.returned;
      const standardEarnings = input.standardDelivered * input.standardRate;
      const heavyEarnings = input.heavyDelivered * input.heavyRate;
      return {
        totalDelivered,
        totalHandled,
        deliverySuccessRate: totalHandled ? Math.round((totalDelivered / totalHandled) * 1000) / 10 : 0,
        standardEarnings,
        heavyEarnings,
        dailyGross: standardEarnings + heavyEarnings,
      };
    });
    mocks.getCutoffRangeForDate.mockImplementation((date: string) => date <= '2026-08-15'
      ? { cutoffFrom: '2026-08-01', cutoffTo: '2026-08-15' }
      : { cutoffFrom: '2026-08-16', cutoffTo: '2026-08-31' });
    mocks.syncPayrollRecordsFromParcelLogs.mockResolvedValue(undefined);
    mocks.logActivity.mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('returns zero for an empty save without validation or I/O', async () => {
    await expect(saveDailyParcelEntries([], 'operator')).resolves.toBe(0);
    expect(mocks.validateParcelWorkDate).not.toHaveBeenCalled();
    expect(mocks.getParcelRateContextForDate).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('preserves validation, rate, read, upsert, audit, sync, and activity ordering', async () => {
    const events: string[] = [];
    const configured = configureSave({ events });
    mocks.validateParcelWorkDate.mockImplementation(() => { events.push('validate-date'); });
    mocks.validateParcelCount.mockImplementation((_value: number, label: string) => { events.push(`validate-${label}`); });
    mocks.getParcelRateContextForDate.mockImplementation(async () => {
      events.push('rate');
      return rateContext;
    });
    mocks.syncPayrollRecordsFromParcelLogs.mockImplementation(async () => { events.push('sync'); });
    mocks.logActivity.mockImplementation(async () => { events.push('activity'); });
    await expect(saveDailyParcelEntries([baseEntry], 'not-a-uuid')).resolves.toBe(1);
    expect(events).toEqual([
      'validate-date',
      'validate-Standard Delivered',
      'validate-Heavy Delivered',
      'validate-Failed',
      'validate-Returned',
      'validate-Assigned Parcels',
      'rate',
      'existing-read',
      'upsert',
      'audit',
      'sync',
      'activity',
    ]);
    expect(configured.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ created_by: null, assigned_parcels: 25 }),
    ], { onConflict: 'rider_id,date' });
  });

  it('keeps an upsert failure fatal and prevents later side effects', async () => {
    const events: string[] = [];
    const configured = configureSave({
      events,
      upsertError: { code: 'P0001', message: 'upsert failed', details: 'details' },
    });
    mocks.getParcelRateContextForDate.mockImplementation(async () => {
      events.push('rate');
      return rateContext;
    });
    await expect(saveDailyParcelEntries([baseEntry], 'operator'))
      .rejects.toThrow('Supabase DB Error [P0001]: upsert failed (details)');
    expect(events).toEqual(['rate', 'existing-read', 'upsert']);
    expect(configured.auditInsert).not.toHaveBeenCalled();
    expect(mocks.syncPayrollRecordsFromParcelLogs).not.toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it('keeps audit, payroll-sync, and activity failures warning-only', async () => {
    const events: string[] = [];
    configureSave({ events, auditError: { message: 'audit failed' } });
    mocks.syncPayrollRecordsFromParcelLogs.mockImplementation(async () => {
      events.push('sync');
      throw new Error('sync failed');
    });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
      throw new Error('activity failed');
    });
    await expect(saveDailyParcelEntries([baseEntry], 'operator')).resolves.toBe(1);
    expect(events).toEqual(['existing-read', 'upsert', 'audit', 'sync', 'activity']);
  });

  it('continues after the existing-log comparison read returns an error', async () => {
    const configured = configureSave({ existingReadError: { message: 'read failed' } });
    await expect(saveDailyParcelEntries([baseEntry], 'operator')).resolves.toBe(1);
    expect(configured.upsert).toHaveBeenCalledOnce();
  });

  it('deduplicates cutoff ranges and synchronizes them sequentially', async () => {
    const entries = [
      baseEntry,
      { ...baseEntry, riderId: 'rider-2', date: '2026-08-06' },
      { ...baseEntry, riderId: 'rider-3', date: '2026-08-20' },
    ];
    configureSave({ savedRows: entries.map(savedRow) });
    let activeSyncs = 0;
    let maximumConcurrentSyncs = 0;
    mocks.syncPayrollRecordsFromParcelLogs.mockImplementation(async () => {
      activeSyncs += 1;
      maximumConcurrentSyncs = Math.max(maximumConcurrentSyncs, activeSyncs);
      await Promise.resolve();
      activeSyncs -= 1;
    });
    await saveDailyParcelEntries(entries, 'operator');
    expect(mocks.syncPayrollRecordsFromParcelLogs.mock.calls).toEqual([
      ['2026-08-01', '2026-08-15'],
      ['2026-08-16', '2026-08-31'],
    ]);
    expect(maximumConcurrentSyncs).toBe(1);
  });

  it('preserves stored rates and daily present/late versus absent/on-leave partitioning', async () => {
    mocks.getRiderWorkforceDirectory.mockResolvedValue([{ id: 'rider-1' }, { id: 'rider-2' }]);
    mocks.resolveStandardRateForTimeIn.mockReturnValue(99);
    const riders = [
      { id: 'rider-1', name: 'Present Rider', mkb_id: 'MKB-1', avatar_url: null, face_image_url: null, zone_id: 'zone-1', status: 'active', zones: { name: 'North' } },
      { id: 'rider-2', name: 'Leave Rider', mkb_id: 'MKB-2', avatar_url: null, face_image_url: null, zone_id: 'zone-2', status: 'active', zones: { name: 'South' } },
    ];
    const attendance = [
      { rider_id: 'rider-1', time_in: '08:00', raw_time_in: null, time_out: null, raw_time_out: null, hours: 1, log_status: 'present', hr_status: 'Incomplete', rider_avatar: null },
      { rider_id: 'rider-2', time_in: null, raw_time_in: null, time_out: null, raw_time_out: null, hours: 0, log_status: 'on_leave', hr_status: 'Absent', rider_avatar: null },
    ];
    const parcelLogs = [{
      ...savedRow(),
      rate: 7,
      heavy_rate: 9,
      standard_earnings: 140,
      heavy_earnings: 18,
      daily_gross: 158,
      created_by: null,
      updated_at: '2026-08-05T10:00:00.000Z',
      rate_configuration_id: 'stored-rate-config',
    }];
    mocks.from.mockImplementation((table: string) => {
      if (table === 'riders') return { select: vi.fn().mockResolvedValue({ data: riders, error: null }) };
      if (table === 'v_attendance_summary') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: attendance, error: null }) }) };
      }
      if (table === 'parcel_logs') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: parcelLogs, error: null }) }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    const result = await getDailyParcelEntries({ date: '2026-08-05', includeEncoded: true });
    expect(result.rows).toHaveLength(1);
    expect(result.absentRows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      riderId: 'rider-1', attendanceStatus: 'present', standardRate: 7, heavyRate: 9,
      dailyGross: 158, rateConfigurationId: 'stored-rate-config', zoneName: 'North',
    });
    expect(result.absentRows[0]).toMatchObject({ riderId: 'rider-2', attendanceStatus: 'on_leave' });
  });

  it('preserves history mapping and pagination', async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{
        id: 'log-1', rider_id: 'rider-1', date: '2026-08-05', parcels: 20, heavy_parcels: 2,
        assigned_parcels: 25, failed_parcels: 1, returned_parcels: 2, notes: 'Manifest',
        created_by: 'Operations', created_at: '2026-08-05T10:00:00.000Z', updated_at: '2026-08-05T11:00:00.000Z',
        rate: 7, heavy_rate: 9, standard_earnings: 140, heavy_earnings: 18, daily_gross: 158,
        rate_configuration_id: 'stored-rate-config', parcel_rate_configurations: { effective_from: '2026-01-01' },
        riders: { id: 'rider-1', name: 'History Rider', mkb_id: 'MKB-1', avatar_url: null, face_image_url: null, zone_id: 'zone-1', zones: { name: 'North' } },
      }],
      error: null,
      count: 42,
    });
    const historyQuery = {
      select: vi.fn(), order: vi.fn(), range,
    };
    historyQuery.select.mockReturnValue(historyQuery);
    historyQuery.order.mockReturnValue(historyQuery);
    let attendanceInCalls = 0;
    const attendanceChain = { select: vi.fn(), in: vi.fn() };
    attendanceChain.select.mockReturnValue(attendanceChain);
    attendanceChain.in.mockImplementation(() => {
      attendanceInCalls += 1;
      return attendanceInCalls === 1
        ? attendanceChain
        : Promise.resolve({ data: [{ rider_id: 'rider-1', date: '2026-08-05', log_status: 'present', hr_status: 'Complete', time_in: '08:00', raw_time_in: null }] });
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'parcel_logs') return historyQuery;
      if (table === 'v_attendance_summary') return attendanceChain;
      throw new Error(`Unexpected table: ${table}`);
    });
    const result = await getParcelHistory({ page: 2, pageSize: 10 });
    expect(range).toHaveBeenCalledWith(10, 19);
    expect(result.totalCount).toBe(42);
    expect(result.data[0]).toMatchObject({
      id: 'log-1', riderName: 'History Rider', zoneName: 'North', attendanceStatus: 'present',
      timeIn: '8:00 AM', standardRate: 7, heavyRate: 9, dailyGross: 158,
      rateConfigurationId: 'stored-rate-config', rateConfigurationEffectiveFrom: '2026-01-01',
      payrollCutoff: 'Aug 1–15, 2026', createdByName: 'Operations',
    });
  });
});
