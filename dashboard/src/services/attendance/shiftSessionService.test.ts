import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { executeShiftTransition } from './shiftSessionService';
import { recordTimeIn, recordTimeOut } from './attendanceService';
import { logRiderLocation, updateRiderStatus } from '../monitoring/monitoringService';
import { notifyAttendanceEvent } from '../../lib/nativeNotifications';
import { startForegroundDutyTracking, stopForegroundDutyTracking } from '../../lib/foregroundTracking';
import { updateCachedAttendanceState } from '../riders/riderCacheService';

vi.mock('./attendanceService', () => ({
  recordTimeIn: vi.fn(),
  recordTimeOut: vi.fn(),
}));

vi.mock('../monitoring/monitoringService', () => ({
  logRiderLocation: vi.fn(),
  updateRiderStatus: vi.fn(),
}));

vi.mock('../../lib/nativeNotifications', () => ({
  notifyAttendanceEvent: vi.fn(),
}));

vi.mock('../../lib/foregroundTracking', () => ({
  startForegroundDutyTracking: vi.fn(),
  stopForegroundDutyTracking: vi.fn(),
}));

vi.mock('../riders/riderCacheService', () => ({
  updateCachedAttendanceState: vi.fn(),
}));

vi.mock('../../lib/biometricTelemetry', () => ({
  biometricTelemetry: {
    start: vi.fn(() => vi.fn()),
  },
  BIOMETRIC_TIMING_NAMES: {
    attendancePersistence: vi.fn(() => 'persistence'),
    riderStatusPersistence: vi.fn(() => 'status'),
    dashboardRefresh: vi.fn(() => 'refresh'),
  },
}));

describe('shiftSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('orchestrates atomic time-in sequence successfully', async () => {
    vi.mocked(recordTimeIn).mockResolvedValueOnce({
      id: 'log-101',
      riderId: 'rider-1',
      riderName: 'Test Rider',
      riderAvatar: '',
      date: '2026-09-01',
      timeIn: '08:00',
      timeOut: null,
      rawTimeIn: '2026-09-01T08:00:00.000Z',
      rawTimeOut: null,
      hours: 0,
      zoneId: 'zone-1',
      zoneName: 'Central Hub',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: [],
    });

    const reloadMock = vi.fn().mockResolvedValue(undefined);

    const result = await executeShiftTransition({
      riderId: 'rider-1',
      userId: 'user-1',
      action: 'time-in',
      hubName: 'Central Hub',
      position: { lat: 14.5, lng: 121.0, accuracy: 5, ts: Date.now() },
      inZone: true,
      capturedAt: '2026-09-01T08:00:00.000Z',
      reload: reloadMock,
    });

    expect(result.action).toBe('time-in');
    expect(result.newLogId).toBe('log-101');
    expect(recordTimeIn).toHaveBeenCalledWith('rider-1', expect.objectContaining({ lat: 14.5, lng: 121.0 }));
    expect(updateRiderStatus).toHaveBeenCalledWith('rider-1', 'active', 14.5, 121.0);
    expect(logRiderLocation).toHaveBeenCalledWith('rider-1', 14.5, 121.0, 'active');
    expect(reloadMock).toHaveBeenCalled();
    expect(notifyAttendanceEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'time-in' }));
    expect(startForegroundDutyTracking).toHaveBeenCalledWith({
      riderId: 'rider-1',
      hubName: 'Central Hub',
    });
  });

  it('orchestrates atomic time-out sequence successfully', async () => {
    vi.mocked(recordTimeOut).mockResolvedValueOnce(true);
    const reloadMock = vi.fn().mockResolvedValue(undefined);

    const result = await executeShiftTransition({
      riderId: 'rider-1',
      userId: 'user-1',
      action: 'time-out',
      activeLogId: 'log-101',
      currentTimeIn: '08:00',
      position: { lat: 14.5, lng: 121.0, accuracy: 5, ts: Date.now() },
      inZone: true,
      capturedAt: '2026-09-01T17:00:00.000Z',
      reload: reloadMock,
    });

    expect(result.action).toBe('time-out');
    expect(recordTimeOut).toHaveBeenCalledWith('log-101', expect.objectContaining({ riderId: 'rider-1' }));
    expect(updateRiderStatus).toHaveBeenCalledWith('rider-1', 'offline', 14.5, 121.0);
    expect(reloadMock).toHaveBeenCalled();
    expect(notifyAttendanceEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'time-out' }));
    expect(stopForegroundDutyTracking).toHaveBeenCalled();
  });

  it('throws an error if time-out has no activeLogId', async () => {
    await expect(
      executeShiftTransition({
        riderId: 'rider-1',
        userId: 'user-1',
        action: 'time-out',
        activeLogId: null,
        position: { lat: 14.5, lng: 121.0, ts: Date.now() },
        inZone: true,
        reload: vi.fn(),
      }),
    ).rejects.toThrow('Active shift record not found');
  });

  it('updates offline cached attendance when navigator is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    vi.mocked(recordTimeOut).mockResolvedValueOnce(true);

    await executeShiftTransition({
      riderId: 'rider-1',
      userId: 'user-1',
      action: 'time-out',
      activeLogId: 'log-101',
      currentTimeIn: '08:00',
      position: { lat: 14.5, lng: 121.0, ts: Date.now() },
      inZone: true,
      reload: vi.fn(),
    });

    expect(updateCachedAttendanceState).toHaveBeenCalledWith(
      'user-1',
      'rider-1',
      expect.objectContaining({ id: 'log-101', status: 'present' }),
    );
  });
});
