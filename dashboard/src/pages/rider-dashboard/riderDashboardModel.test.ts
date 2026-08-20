import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWeeklyBreakdown,
  deriveAttendanceAction,
  deriveDashboardStats,
  diffPretty,
  format12h,
  getLocalDateString,
  mapCachedDashboardPayloadToState,
  mapDbRiderToDashboardRider,
  nowHHMM,
  parseTime,
  toHHMM,
} from './riderDashboardModel';

const dbRider = {
  id: 'rider-1',
  name: 'Juan Rider',
  face_image_url: 'face.jpg',
  avatar_url: 'avatar.jpg',
  zone_id: 'zone-1',
  status: 'active' as const,
  lat: 6.91,
  lng: 122.08,
  speed: 12,
  shift: 'Afternoon',
  last_ping: '2026-08-05T08:00:00.000Z',
  contact: '09170000000',
  mkb_id: 'MKB-001',
  face_descriptor: Array.from({ length: 128 }, (_, index) => index / 128),
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Rider Dashboard pure model characterization', () => {
  it('preserves local time and date formatting helpers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T10:30:00'));

    expect(nowHHMM(new Date('2026-08-05T08:05:00'))).toBe('08:05');
    expect(toHHMM('2026-08-05T08:15:00')).toBe('08:15');
    expect(toHHMM(null)).toBeNull();
    expect(toHHMM('invalid')).toBeNull();
    expect(format12h('13:05')).toBe('01:05 PM');
    expect(diffPretty('08:15')).toBe('2h 15m');
    expect(getLocalDateString(new Date('2026-08-05T10:30:00'))).toBe('2026-08-05');
    expect(parseTime('08:15')).toMatchObject({
      getHours: expect.any(Function),
      getMinutes: expect.any(Function),
    });
    expect(parseTime('08:15').getHours()).toBe(8);
    expect(parseTime('08:15').getMinutes()).toBe(15);
  });

  it('maps a database rider to the existing UI Rider shape', () => {
    expect(mapDbRiderToDashboardRider(dbRider)).toEqual({
      id: 'rider-1',
      name: 'Juan Rider',
      avatar: 'face.jpg',
      zoneId: 'zone-1',
      status: 'active',
      lat: 6.91,
      lng: 122.08,
      speed: 12,
      shift: 'afternoon',
      lastPing: new Date('2026-08-05T08:00:00.000Z').getTime(),
      phone: '09170000000',
      riderCode: 'MKB-001',
      faceDescriptor: dbRider.face_descriptor,
    });
  });

  it('preserves database-rider fallbacks for missing values', () => {
    const sparse = {
      ...dbRider,
      face_image_url: null,
      avatar_url: null,
      zone_id: null,
      lat: null,
      lng: null,
      speed: null,
      shift: null,
      last_ping: null,
      contact: null,
      face_descriptor: null,
    };

    expect(mapDbRiderToDashboardRider(sparse)).toMatchObject({
      avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Juan%20Rider',
      zoneId: null,
      lat: 0,
      lng: 0,
      speed: 0,
      shift: 'morning',
      lastPing: 0,
      phone: '',
      faceDescriptor: null,
    });
  });

  it('maps cached payload attendance, violation, logs, and statistics unchanged', () => {
    const monthAttendance = [
      { id: 'a-1', rider_id: 'rider-1', date: '2026-08-01', time_in: '2026-08-01T08:00:00', time_out: null, hours: 9, status: 'present' },
      { id: 'a-2', rider_id: 'rider-1', date: '2026-08-03', time_in: '2026-08-03T08:20:00', time_out: null, hours: 7.25, status: 'late' },
      { id: 'a-3', rider_id: 'rider-1', date: '2026-08-04', time_in: '2026-08-04T08:00:00', time_out: null, hours: null, status: 'present' },
      { id: 'a-4', rider_id: 'rider-1', date: '2026-08-05', time_in: null, time_out: null, hours: 5, status: 'absent' },
    ];
    const payload = {
      resolvedRiderId: 'rider-1',
      dbUser: { rider_id: 'rider-1' },
      dbRider,
      todayAttendance: monthAttendance[3],
      latestViolation: {
        id: 'v-1', rider_id: 'rider-1', resolved: false, lat: 6.92, lng: 122.09,
        zone_name: 'North', created_at: '2026-08-05T09:00:00.000Z',
      },
      monthAttendance,
      monthViolationCount: 2,
      timestamp: 1,
    };

    expect(mapCachedDashboardPayloadToState(payload, '2026-08-03')).toMatchObject({
      resolvedRiderId: 'rider-1',
      rider: { id: 'rider-1', name: 'Juan Rider' },
      attendance: { id: 'a-4', timeIn: null, timeOut: null },
      activeViolation: { lat: 6.92, lng: 122.09, zoneName: 'North' },
      monthAttendanceLogs: monthAttendance,
      stats: { daysPresent: 3, hoursThisWeek: 12.3, violationsThisMonth: 2 },
    });
  });

  it('maps attendance timestamps through the existing local HH:MM conversion', () => {
    const payload = {
      resolvedRiderId: 'rider-1', dbUser: null, dbRider,
      todayAttendance: {
        id: 'a-1', rider_id: 'rider-1', date: '2026-08-05',
        time_in: '2026-08-05T08:05:00', time_out: '2026-08-05T17:30:00', hours: 9, status: 'present',
      },
      latestViolation: null, monthAttendance: [], monthViolationCount: 0, timestamp: 1,
    };

    expect(mapCachedDashboardPayloadToState(payload, '2026-08-03').attendance)
      .toEqual({ id: 'a-1', timeIn: '08:05', timeOut: '17:30' });
  });

  it('drops resolved, zero-coordinate, and missing violations exactly as before', () => {
    const basePayload = {
      resolvedRiderId: 'rider-1', dbUser: null, dbRider: null, todayAttendance: null,
      monthAttendance: [], monthViolationCount: 0, timestamp: 1,
    };

    expect(mapCachedDashboardPayloadToState({
      ...basePayload,
      latestViolation: { id: 'v-1', rider_id: 'rider-1', resolved: true, lat: 6, lng: 122, zone_name: 'North', created_at: '' },
    }, '2026-08-03').activeViolation).toBeNull();
    expect(mapCachedDashboardPayloadToState({
      ...basePayload,
      latestViolation: { id: 'v-2', rider_id: 'rider-1', resolved: false, lat: 0, lng: 122, zone_name: 'North', created_at: '' },
    }, '2026-08-03').activeViolation).toBeNull();
    expect(mapCachedDashboardPayloadToState({ ...basePayload, latestViolation: null }, '2026-08-03'))
      .toMatchObject({ rider: undefined, attendance: { id: null, timeIn: null, timeOut: null }, activeViolation: null });
  });

  it('counts Late as attended and sums all current-week log hours as before', () => {
    const logs = [
      { date: '2026-08-03', status: 'late', hours: 7.25 },
      { date: '2026-08-04', status: 'present', hours: 8 },
      { date: '2026-08-05', status: 'absent', hours: 4 },
      { date: '2026-08-01', status: 'present', hours: 9 },
    ];

    expect(deriveDashboardStats(logs, '2026-08-03', 3)).toEqual({
      daysPresent: 3,
      hoursThisWeek: 19.3,
      violationsThisMonth: 3,
    });
  });

  it('builds the existing Monday-through-Sunday weekly breakdown', () => {
    const logs = [
      { date: '2026-08-03', status: 'late', hours: 7.25 },
      { date: '2026-08-09', status: 'present', hours: 8 },
    ];

    expect(buildWeeklyBreakdown(logs, new Date('2026-08-05T12:00:00'))).toEqual([
      { name: 'Monday', dateLabel: 'Aug 3', hours: 7.25, status: 'late' },
      { name: 'Tuesday', dateLabel: 'Aug 4', hours: 0, status: 'no_log' },
      { name: 'Wednesday', dateLabel: 'Aug 5', hours: 0, status: 'no_log' },
      { name: 'Thursday', dateLabel: 'Aug 6', hours: 0, status: 'no_log' },
      { name: 'Friday', dateLabel: 'Aug 7', hours: 0, status: 'no_log' },
      { name: 'Saturday', dateLabel: 'Aug 8', hours: 0, status: 'no_log' },
      { name: 'Sunday', dateLabel: 'Aug 9', hours: 8, status: 'present' },
    ]);
  });

  it.each([
    [true, null, null, 'closed'],
    [false, '08:00', '17:00', 'completed'],
    [false, '08:00', null, 'time-out'],
    [false, null, null, 'time-in'],
  ])('derives the existing attendance action', (isClosed, timeIn, timeOut, expected) => {
    expect(deriveAttendanceAction(isClosed, timeIn, timeOut)).toBe(expected);
  });
});
