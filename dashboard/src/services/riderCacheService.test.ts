import { beforeEach, describe, expect, it } from 'vitest';
import { getStorageAdapter } from '../lib/storage';
import {
  getCachedRiderDashboard,
  clearRiderSensitiveCache,
  setCachedRiderDashboard,
  updateCachedAttendanceState,
  type CachedDashboardPayload
} from './riderCacheService';

const cachedDashboard: CachedDashboardPayload = {
  resolvedRiderId: 'rider-1',
  dbUser: { rider_id: 'rider-1' },
  dbRider: null,
  todayAttendance: null,
  latestViolation: null,
  monthAttendance: [],
  monthViolationCount: 0,
  timestamp: Date.now()
};

describe('rider cache identity', () => {
  beforeEach(async () => {
    await getStorageAdapter().clearCache();
  });

  it('keys the cache by auth user while requiring the canonical rider owner for writes', async () => {
    await setCachedRiderDashboard('auth-user-1', cachedDashboard);

    await updateCachedAttendanceState('auth-user-1', 'rider-2', {
      id: 'attendance-2',
      rider_id: 'rider-2',
      date: '2026-08-04',
      time_in: '2026-08-04T08:00:00.000Z',
      time_out: null,
      hours: 0,
      status: 'present'
    });
    expect((await getCachedRiderDashboard('auth-user-1'))?.todayAttendance).toBeNull();

    await updateCachedAttendanceState('auth-user-1', 'rider-1', {
      id: 'attendance-1',
      rider_id: 'rider-1',
      date: '2026-08-04',
      time_in: '2026-08-04T08:00:00.000Z',
      time_out: null,
      hours: 0,
      status: 'present'
    });
    expect((await getCachedRiderDashboard('auth-user-1'))?.todayAttendance).toMatchObject({
      id: 'attendance-1',
      rider_id: 'rider-1'
    });
  });

  it('clears rider-sensitive cache keys without deleting diagnosable outbox operations', async () => {
    const storage = getStorageAdapter();
    await storage.setItem('rider_dashboard_cache_auth-user-1', { secret: true });
    await storage.setItem('rider_monitoring_cache_auth-user-1', { secret: true });
    await storage.setItem('rider_profile_cache_auth-user-1', { secret: true });
    await storage.setItem('unrelated', { keep: true });
    await storage.enqueue({
      action: 'LOCATION_PING',
      riderId: 'rider-1',
      idempotencyKey: 'op-1',
      eventTimestamp: '2026-08-11T00:00:00Z',
      payload: {},
      priority: 3,
    });

    await clearRiderSensitiveCache('auth-user-1', 'rider-1');

    expect(await storage.getItem('rider_dashboard_cache_auth-user-1')).toBeNull();
    expect(await storage.getItem('rider_monitoring_cache_auth-user-1')).toBeNull();
    expect(await storage.getItem('rider_profile_cache_auth-user-1')).toBeNull();
    expect(await storage.getItem('unrelated')).toEqual({ keep: true });
    expect(await storage.getQueue()).toHaveLength(1);
  });
});
