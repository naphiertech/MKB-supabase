import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getRiderWorkforceDirectory: vi.fn()
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc }
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
  getMyHubAttendanceGeofence,
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

  it('requires an active internet connection for online Time Out', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(recordTimeOut('attendance-1', {
      riderId: 'rider-1',
      date: '2026-08-05',
      lat: 6.9214,
      lng: 122.079,
    })).rejects.toThrow('An active internet connection is required');
  });

  it('requires verified coordinates for online Time Out', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await expect(recordTimeOut('attendance-1', {
      riderId: 'rider-1',
      date: '2026-08-05',
    })).rejects.toThrow('Current location is required');
  });

  it('submits Time Out via authoritative RPC with GPS coordinates and position timestamp', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    mocks.rpc.mockResolvedValueOnce({
      data: {
        attendance_log_id: 'attendance-1',
        rider_id: 'rider-1',
        date: '2026-08-05',
        time_out: '2026-08-05T09:00:00.000Z',
      },
      error: null,
    });

    const result = await recordTimeOut('attendance-1', {
      riderId: 'rider-1',
      date: '2026-08-05',
      lat: 6.9214,
      lng: 122.079,
      accuracy: 8,
      positionTimestamp: '2026-08-05T09:00:00.000Z',
    });

    expect(result).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('record_my_time_out', {
      p_latitude: 6.9214,
      p_longitude: 122.079,
      p_accuracy: 8,
      p_position_timestamp: '2026-08-05T09:00:00.000Z',
    });
  });
});

describe('Time In execution', () => {
  it('requires an active internet connection', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(recordTimeIn('rider-1', {
      lat: 6.9214,
      lng: 122.079,
    }, 24)).rejects.toThrow('An active internet connection is required');
  });

  it('requires verified GPS coordinates', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await expect(recordTimeIn('rider-1', undefined, 24))
      .rejects.toThrow('Current location is required');
  });

  it('submits Time In via authoritative RPC with GPS coordinates', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    mocks.rpc.mockResolvedValueOnce({
      data: {
        attendance_log_id: 'attendance-1',
        rider_id: 'rider-1',
        date: '2026-08-05',
        time_in: '2026-08-05T01:00:00.000Z',
      },
      error: null,
    });

    const result = await recordTimeIn('rider-1', {
      lat: 6.9214,
      lng: 122.079,
      accuracy: 10,
      positionTimestamp: '2026-08-05T01:00:00.000Z',
    }, 24);

    expect(result).toMatchObject({
      id: 'attendance-1',
      riderId: 'rider-1',
      source: 'face-scan',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('record_my_time_in', {
      p_latitude: 6.9214,
      p_longitude: 122.079,
      p_accuracy: 10,
      p_position_timestamp: '2026-08-05T01:00:00.000Z',
    });
  });
});

describe('Hub Attendance Geofence query', () => {
  it('retrieves assigned hub geofence configuration via RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        rider_id: 'rider-1',
        hub_id: 'hub-1',
        hub_name: 'Main Hub',
        latitude: 6.9214,
        longitude: 122.079,
        attendance_radius_m: 150,
        is_configured: true,
        reason: null,
        message: null,
      },
      error: null,
    });

    const fence = await getMyHubAttendanceGeofence();
    expect(fence).toMatchObject({
      hub_id: 'hub-1',
      is_configured: true,
      attendance_radius_m: 150,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_hub_attendance_geofence');
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
