import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  from: vi.fn(),
  getRiderWorkforceDirectory: vi.fn()
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from }
}));

vi.mock('../../lib/storage', () => ({
  createSyncOperationId: () => '10000000-0000-4000-8000-000000000099',
  getStorageAdapter: () => ({ enqueue: mocks.enqueue })
}));

vi.mock('../notifications/notificationService', () => ({
  dispatchNotificationSafe: vi.fn()
}));
vi.mock('../workforce/workforceDirectoryService', () => ({
  getRiderWorkforceDirectory: mocks.getRiderWorkforceDirectory
}));

import {
  buildTimeOutQueueOperation,
  deriveHrStatus,
  getAttendanceLogs,
  getRiderAttendanceInDateRange,
  recordTimeIn,
  recordTimeOut,
} from './attendanceService';
import type { AttendanceLog } from '../types';

afterEach(() => {
  vi.useRealTimers();
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

  it('scopes an online Time Out update to the current attendance business date', async () => {
    const updateQuery = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    };
    updateQuery.update.mockReturnValue(updateQuery);
    updateQuery.eq.mockReturnValue(updateQuery);
    updateQuery.select.mockReturnValue(updateQuery);
    updateQuery.maybeSingle.mockResolvedValue({ data: { id: 'attendance-1' }, error: null });
    mocks.from.mockReturnValueOnce(updateQuery);
    vi.stubGlobal('navigator', { onLine: true });

    await expect(recordTimeOut('attendance-1', {
      riderId: 'rider-1',
      date: '2026-08-05',
    })).resolves.toBe(true);

    expect(updateQuery.eq).toHaveBeenCalledWith('date', '2026-08-05');
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

describe('Attendance reads', () => {
  it('never creates absence rows as a side effect of reading attendance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T10:00:00.000Z'));
    const viewQuery = {
      select: vi.fn(),
      order: vi.fn(),
    };
    viewQuery.select.mockReturnValue(viewQuery);
    viewQuery.order.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValueOnce(viewQuery);

    await expect(getAttendanceLogs()).resolves.toEqual([]);

    expect(mocks.getRiderWorkforceDirectory).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledWith('v_attendance_summary');
  });
});

describe('Attendance completion status', () => {
  it('keeps Late punctuality separate from a past Missing Time Out', () => {
    const log = {
      timeIn: '08:30',
      timeOut: null,
      status: 'late',
      completionStatus: 'missing_time_out',
    } as AttendanceLog;

    expect(deriveHrStatus(log)).toBe('Missing Time Out');
  });
});
