import { beforeEach, describe, expect, it } from 'vitest';
import { getStorageAdapter } from '../../lib/storage';
import {
  getCachedRiderDashboard,
  clearRiderSensitiveCache,
  setCachedRiderDashboard,
  patchCachedAttendanceState,
  updateCachedAttendanceState,
  type CachedDashboardPayload
} from './riderCacheService';
import type { AttendanceContextLog } from '../attendance/attendanceContextService';

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
    await storage.setItem('rider_absence_request_cache_v1:auth-user-1:rider-1:2026-09-01:2026-09-30', { secret: true });
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
    expect(await storage.getItem('rider_absence_request_cache_v1:auth-user-1:rider-1:2026-09-01:2026-09-30')).toBeNull();
    expect(await storage.getItem('unrelated')).toEqual({ keep: true });
    expect(await storage.getQueue()).toHaveLength(1);
  });

  it('updates a context row by Rider/date when replay adopts a different canonical attendance ID', async () => {
    const contextRow: AttendanceContextLog = {
      id: 'system-absent', attendanceLogId: 'system-absent', riderId: 'rider-1', riderName: 'Rider One', riderAvatar: '', riderCode: 'MKB-1',
      date: '2026-08-04', timeIn: null, timeOut: null, rawTimeIn: null, rawTimeOut: null, hours: 0,
      zoneId: '', zoneName: 'Zone', rawStatus: 'absent', status: 'absent', presence: 'absent', punctuality: 'none', lat: null, lng: null,
      completionState: 'absent', source: 'system', isFinalized: true, expectedToWork: true,
      expectedWorkBasis: 'employed_rider_fallback', plannedLeaveState: null, plannedLeaveEffective: false,
      plannedLeaveRequestId: null, plannedLeaveRequestRevision: null, absenceNoticeState: null,
      absenceNoticeEffective: false, absenceNoticeRequestId: null, absenceNoticeRequestRevision: null,
      excusalState: 'not_excused', contextCode: 'no_notice', contextRequestId: null,
      contextRequestKind: null, contextRequestRevision: null, hubId: 'hub-1', scheduleId: null,
      scheduleDayKind: null, events: [],
    };
    await setCachedRiderDashboard('auth-user-1', {
      ...cachedDashboard,
      todayAttendance: { id: 'system-absent', rider_id: 'rider-1', date: '2026-08-04', time_in: null, time_out: null, hours: 0, status: 'absent' },
      monthAttendanceContext: [contextRow],
    });

    await patchCachedAttendanceState('auth-user-1', 'rider-1', {
      id: 'canonical-attendance', rider_id: 'rider-1', date: '2026-08-04',
      time_in: '2026-08-04T08:03:00.000Z', time_out: null, status: 'present', source: 'face-scan',
    });

    const updated = await getCachedRiderDashboard('auth-user-1');
    expect(updated?.todayAttendance).toMatchObject({ id: 'canonical-attendance', time_in: '2026-08-04T08:03:00.000Z' });
    expect(updated?.monthAttendanceContext?.[0]).toMatchObject({ id: 'canonical-attendance', status: 'present', rawStatus: 'present' });
  });

  it('prevents previous-owner delayed async result from polluting a new owner cache upon rider switch', async () => {
    // Initial state: Rider A is cached
    await setCachedRiderDashboard('auth-user-1', {
      ...cachedDashboard,
      resolvedRiderId: 'rider-A',
      todayAttendance: { id: 'att-A', rider_id: 'rider-A', date: '2026-08-05', time_in: '08:00', time_out: null, hours: 0, status: 'present' },
    });

    // Switch occurs: cache is populated for Rider B
    await setCachedRiderDashboard('auth-user-1', {
      ...cachedDashboard,
      resolvedRiderId: 'rider-B',
      todayAttendance: { id: 'att-B', rider_id: 'rider-B', date: '2026-08-05', time_in: '09:00', time_out: null, hours: 0, status: 'present' },
    });

    // A delayed write for Rider A arrives late
    await updateCachedAttendanceState('auth-user-1', 'rider-A', {
      id: 'att-A-delayed',
      rider_id: 'rider-A',
      date: '2026-08-05',
      time_in: '08:15',
      time_out: null,
      hours: 0,
      status: 'present',
    });

    // Rider B cache must remain uncorrupted by Rider A's delayed write
    const current = await getCachedRiderDashboard('auth-user-1');
    expect(current?.resolvedRiderId).toBe('rider-B');
    expect(current?.todayAttendance).toMatchObject({ id: 'att-B', rider_id: 'rider-B' });
  });

  it('overrides stale On Leave context when valid Time In is recorded', async () => {
    const staleLeaveContext: AttendanceContextLog = {
      id: 'sys-leave', attendanceLogId: 'sys-leave', riderId: 'rider-1', riderName: 'Rider One', riderAvatar: '', riderCode: 'MKB-1',
      date: '2026-08-05', timeIn: null, timeOut: null, rawTimeIn: null, rawTimeOut: null, hours: 0,
      zoneId: 'z1', zoneName: 'Zone 1', rawStatus: 'on_leave', status: 'on_leave', presence: 'on_leave', punctuality: 'none',
      completionState: 'not_expected', source: 'system', isFinalized: false, expectedToWork: false,
      expectedWorkBasis: 'planned_leave', plannedLeaveState: 'approved', plannedLeaveEffective: true,
      plannedLeaveRequestId: 'req-1', plannedLeaveRequestRevision: 1, absenceNoticeState: null,
      absenceNoticeEffective: false, absenceNoticeRequestId: null, absenceNoticeRequestRevision: null,
      excusalState: 'excused', contextCode: 'approved_leave', contextRequestId: 'req-1',
      contextRequestKind: 'planned_leave', contextRequestRevision: 1, hubId: 'hub-1', scheduleId: null,
      scheduleDayKind: null, events: [], lat: null, lng: null,
    };

    await setCachedRiderDashboard('auth-user-1', {
      ...cachedDashboard,
      resolvedRiderId: 'rider-1',
      monthAttendanceContext: [staleLeaveContext],
    });

    // Rider clocks in despite approved leave
    await patchCachedAttendanceState('auth-user-1', 'rider-1', {
      id: 'actual-clock-in',
      rider_id: 'rider-1',
      date: '2026-08-05',
      time_in: '2026-08-05T08:00:00.000Z',
      time_out: null,
      status: 'present',
      source: 'face-scan',
    });

    const updated = await getCachedRiderDashboard('auth-user-1');
    const ctx = updated?.monthAttendanceContext?.[0];
    expect(ctx?.status).toBe('present');
    expect(ctx?.rawStatus).toBe('present');
    expect(ctx?.timeIn).toBe('2026-08-05T08:00:00.000Z');
    expect(ctx?.contextCode).toBe('worked_during_approved_leave');
  });

  it('overrides stale Accepted Notice context when valid clocks are recorded', async () => {
    const staleNoticeContext: AttendanceContextLog = {
      id: 'sys-notice', attendanceLogId: 'sys-notice', riderId: 'rider-1', riderName: 'Rider One', riderAvatar: '', riderCode: 'MKB-1',
      date: '2026-08-06', timeIn: null, timeOut: null, rawTimeIn: null, rawTimeOut: null, hours: 0,
      zoneId: 'z1', zoneName: 'Zone 1', rawStatus: 'absent', status: 'absent', presence: 'absent', punctuality: 'none',
      completionState: 'absent', source: 'system', isFinalized: false, expectedToWork: true,
      expectedWorkBasis: 'published_shift', plannedLeaveState: null, plannedLeaveEffective: false,
      plannedLeaveRequestId: null, plannedLeaveRequestRevision: null, absenceNoticeState: 'approved',
      absenceNoticeEffective: true, absenceNoticeRequestId: 'req-2', absenceNoticeRequestRevision: 1,
      excusalState: 'excused', contextCode: 'accepted_notice', contextRequestId: 'req-2',
      contextRequestKind: 'absence_notice', contextRequestRevision: 1, hubId: 'hub-1', scheduleId: null,
      scheduleDayKind: null, events: [], lat: null, lng: null,
    };

    await setCachedRiderDashboard('auth-user-1', {
      ...cachedDashboard,
      resolvedRiderId: 'rider-1',
      monthAttendanceContext: [staleNoticeContext],
    });

    // Valid clock in arrives
    await patchCachedAttendanceState('auth-user-1', 'rider-1', {
      id: 'notice-worked-clock',
      rider_id: 'rider-1',
      date: '2026-08-06',
      time_in: '2026-08-06T08:05:00.000Z',
      time_out: null,
      status: 'present',
      source: 'face-scan',
    });

    const updated = await getCachedRiderDashboard('auth-user-1');
    const ctx = updated?.monthAttendanceContext?.[0];
    expect(ctx?.status).toBe('present');
    expect(ctx?.timeIn).toBe('2026-08-06T08:05:00.000Z');
    expect(ctx?.contextCode).toBe('worked_despite_accepted_notice');
  });

  it('preserves cached context and supports restart/rehydration cycle', async () => {
    const sampleContext: AttendanceContextLog = {
      id: 'att-100', attendanceLogId: 'att-100', riderId: 'rider-1', riderName: 'Rider One', riderAvatar: '', riderCode: 'MKB-1',
      date: '2026-08-07', timeIn: '2026-08-07T08:00:00.000Z', timeOut: '2026-08-07T17:00:00.000Z',
      rawTimeIn: '2026-08-07T08:00:00.000Z', rawTimeOut: '2026-08-07T17:00:00.000Z', hours: 8,
      zoneId: 'z1', zoneName: 'Zone 1', rawStatus: 'present', status: 'present', presence: 'present', punctuality: 'on_time',
      completionState: 'complete', source: 'face-scan', isFinalized: true, expectedToWork: true,
      expectedWorkBasis: 'published_shift', plannedLeaveState: null, plannedLeaveEffective: false,
      plannedLeaveRequestId: null, plannedLeaveRequestRevision: null, absenceNoticeState: null,
      absenceNoticeEffective: false, absenceNoticeRequestId: null, absenceNoticeRequestRevision: null,
      excusalState: 'not_applicable', contextCode: null, contextRequestId: null,
      contextRequestKind: null, contextRequestRevision: null, hubId: 'hub-1', scheduleId: null,
      scheduleDayKind: null, events: [], lat: null, lng: null,
    };

    await setCachedRiderDashboard('auth-user-1', {
      ...cachedDashboard,
      resolvedRiderId: 'rider-1',
      todayAttendance: { id: 'att-100', rider_id: 'rider-1', date: '2026-08-07', time_in: '2026-08-07T08:00:00.000Z', time_out: '2026-08-07T17:00:00.000Z', hours: 8, status: 'present' },
      monthAttendanceContext: [sampleContext],
    });

    // Rehydrate by reading fresh from storage adapter
    const rehydrated = await getCachedRiderDashboard('auth-user-1');
    expect(rehydrated).not.toBeNull();
    expect(rehydrated?.resolvedRiderId).toBe('rider-1');
    expect(rehydrated?.todayAttendance?.id).toBe('att-100');
    expect(rehydrated?.monthAttendanceContext).toHaveLength(1);
    expect(rehydrated?.monthAttendanceContext?.[0].date).toBe('2026-08-07');
    expect(rehydrated?.monthAttendanceContext?.[0].status).toBe('present');
  });
});
