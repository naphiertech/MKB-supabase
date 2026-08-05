import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  from: vi.fn()
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: mocks.from }
}));

vi.mock('../lib/storage', () => ({
  createSyncOperationId: () => '10000000-0000-4000-8000-000000000099',
  getStorageAdapter: () => ({ enqueue: mocks.enqueue })
}));

vi.mock('./notificationService', () => ({
  dispatchNotificationSafe: vi.fn()
}));

import { buildTimeOutQueueOperation, getRiderAttendanceInDateRange, recordTimeIn } from './attendanceService';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Time Out offline payload', () => {
  it('remains independently replayable when GPS is unavailable', () => {
    const operation = buildTimeOutQueueOperation(
      '20000000-0000-4000-8000-000000000001',
      { riderId: 'rider-1', date: '2026-08-04' },
      '2026-08-04T09:00:00.000Z',
      '10000000-0000-4000-8000-000000000001'
    );

    expect(operation).toMatchObject({
      action: 'TIME_OUT',
      riderId: 'rider-1',
      idempotencyKey: '10000000-0000-4000-8000-000000000001',
      eventTimestamp: '2026-08-04T09:00:00.000Z',
      payload: {
        attendance_log_id: '20000000-0000-4000-8000-000000000001',
        rider_id: 'rider-1',
        date: '2026-08-04',
        time_out: '2026-08-04T09:00:00.000Z'
      }
    });
    expect(operation.payload).not.toHaveProperty('lat');
    expect(operation.payload).not.toHaveProperty('lng');
  });
});

describe('Time In fallback identity', () => {
  it('returns the same existing attendance ID that is retained by the queued operation', async () => {
    const existingAttendanceId = '20000000-0000-4000-8000-000000000099';
    const lookupQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn()
    };
    lookupQuery.select.mockReturnValue(lookupQuery);
    lookupQuery.eq.mockReturnValue(lookupQuery);
    lookupQuery.maybeSingle.mockResolvedValue({ data: { id: existingAttendanceId }, error: null });

    const failedUpsertQuery = {
      upsert: vi.fn(),
      select: vi.fn(),
      single: vi.fn()
    };
    failedUpsertQuery.upsert.mockReturnValue(failedUpsertQuery);
    failedUpsertQuery.select.mockReturnValue(failedUpsertQuery);
    failedUpsertQuery.single.mockResolvedValue({ data: null, error: { message: 'network unavailable' } });

    mocks.from
      .mockReturnValueOnce(lookupQuery)
      .mockReturnValueOnce(failedUpsertQuery);
    mocks.enqueue.mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await recordTimeIn('rider-1', undefined, 24);

    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        id: existingAttendanceId,
        attendance_log_id: existingAttendanceId
      })
    }));
    expect(result?.id).toBe(existingAttendanceId);
  });
});

describe('Payroll attendance lookup', () => {
  it('loads a rider date range without attempting attendance finalization', async () => {
    const viewQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
      lte: vi.fn(),
      order: vi.fn()
    };
    viewQuery.select.mockReturnValue(viewQuery);
    viewQuery.eq.mockReturnValue(viewQuery);
    viewQuery.gte.mockReturnValue(viewQuery);
    viewQuery.lte.mockReturnValue(viewQuery);
    viewQuery.order.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValueOnce(viewQuery);

    await expect(
      getRiderAttendanceInDateRange('rider-1', '2026-08-01', '2026-08-15')
    ).resolves.toEqual([]);

    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('v_attendance_summary');
    expect(viewQuery.eq).toHaveBeenCalledWith('rider_id', 'rider-1');
  });
});
