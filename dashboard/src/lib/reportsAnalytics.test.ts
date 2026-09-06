import { describe, expect, it } from 'vitest';
import type { AttendanceLog, ViolationEvent } from '../services/types';

type ReportsAnalyticsModule = {
  deriveReportsAnalytics?: (input: {
    currentLogs: AttendanceLog[];
    previousLogs: AttendanceLog[];
    currentViolations: ViolationEvent[];
    previousViolations: ViolationEvent[];
    filters: { from: string; to: string; hubId: string | null; zoneId: string };
  }) => {
    metrics: {
      attendanceRate: number | null;
      totalViolations: number;
      averageCompletedShiftHours: number | null;
      ridersReporting: number;
    };
    comparisons: { attendanceRateDeltaPoints: number | null; violationDelta: number | null };
    attendanceBreakdown: { present: number; late: number; absent: number; onLeave: number; dayOff: number; total: number };
    riderPerformance: Array<{ riderName: string; totalHours: number; attendanceRate: number; violationCount: number }>;
    violationByZone: Array<{ zoneName: string; violations: number }>;
    insights: {
      attendance: string;
      topZone: string;
      geofenceHotspot: string;
      riderAttention: string;
      attentionRiderCount: number;
    };
  };
  previousPeriodRange?: (from: string, to: string) => { from: string; to: string };
};

async function loadAnalytics(): Promise<ReportsAnalyticsModule> {
  try {
    return await import('./reportsAnalytics') as ReportsAnalyticsModule;
  } catch {
    return {};
  }
}

function attendance(overrides: Partial<AttendanceLog> & { id: string; riderId: string; date: string }): AttendanceLog {
  return {
    riderName: overrides.riderId,
    riderAvatar: '',
    timeIn: '08:00',
    timeOut: '17:00',
    rawTimeIn: `${overrides.date}T08:00:00+08:00`,
    rawTimeOut: `${overrides.date}T17:00:00+08:00`,
    hours: 9,
    zoneId: 'zone-a',
    zoneName: 'North',
    status: 'present',
    presence: 'present',
    punctuality: 'on_time',
    source: 'face-scan',
    events: [],
    ...overrides,
  } as AttendanceLog;
}

function violation(overrides: Partial<ViolationEvent> & { id: string; riderId: string; ts: number }): ViolationEvent {
  return {
    riderName: overrides.riderId,
    zoneId: 'zone-a',
    zoneName: 'North',
    type: 'boundary_exit',
    read: false,
    resolved: false,
    ...overrides,
  };
}

const filters = { from: '2026-08-01', to: '2026-08-15', hubId: null, zoneId: 'all' };

describe('Reports period and dataset integrity', () => {
  it('gives derived worked status priority over raw absence without changing the denominator', async () => {
    const { deriveReportsAnalytics } = await import('./reportsAnalytics');
    const raw = attendance({ id: 'a1', riderId: 'r1', date: '2026-08-01', status: 'absent', presence: 'absent' });
    const result = deriveReportsAnalytics({
      currentLogs: [{ ...raw, effectiveStatus: 'present', contextCode: 'worked_during_approved_leave' },
        { ...raw, id: 'a2', effectiveStatus: 'on_leave', contextCode: 'approved_leave' }],
      previousLogs: [], currentViolations: [], previousViolations: [], filters,
    });
    expect(result.attendanceBreakdown).toMatchObject({ present: 1, absent: 0, onLeave: 1, dayOff: 0, total: 2 });
    expect(result.metrics.attendanceRate).toBe(50);
  });
  it('uses an equally sized inclusive previous period', async () => {
    const module = await loadAnalytics();
    expect(typeof module.previousPeriodRange).toBe('function');
    expect(module.previousPeriodRange?.('2026-08-01', '2026-08-15')).toEqual({
      from: '2026-07-17',
      to: '2026-07-31',
    });
  });

  it('shows a truthful no-data state instead of fabricated percentages or riders', async () => {
    const module = await loadAnalytics();
    expect(typeof module.deriveReportsAnalytics).toBe('function');
    const result = module.deriveReportsAnalytics!({
      currentLogs: [], previousLogs: [], currentViolations: [], previousViolations: [], filters,
    });
    expect(result.metrics).toEqual({
      attendanceRate: null,
      totalViolations: 0,
      averageCompletedShiftHours: null,
      ridersReporting: 0,
    });
    expect(result.comparisons).toEqual({ attendanceRateDeltaPoints: null, violationDelta: null });
    expect(result.insights.riderAttention).toBe('No Riders require late-attendance attention for this period.');
  });

  it('never turns one matching Rider into a three-Rider insight', async () => {
    const module = await loadAnalytics();
    expect(typeof module.deriveReportsAnalytics).toBe('function');
    const result = module.deriveReportsAnalytics!({
      currentLogs: [
        attendance({ id: 'a1', riderId: 'r1', riderName: 'Juan', date: '2026-08-01', status: 'late', punctuality: 'late' }),
        attendance({ id: 'a2', riderId: 'r1', riderName: 'Juan', date: '2026-08-02', status: 'late', punctuality: 'late' }),
      ],
      previousLogs: [], currentViolations: [], previousViolations: [], filters,
    });
    expect(result.metrics.ridersReporting).toBe(1);
    expect(result.insights.attentionRiderCount).toBe(1);
    expect(result.insights.riderAttention).toContain('1 Rider');
    expect(result.insights.riderAttention).not.toContain('3 riders');
  });

  it('requires adjacent late attendance records rather than two unrelated late days', async () => {
    const module = await loadAnalytics();
    const result = module.deriveReportsAnalytics!({
      currentLogs: [
        attendance({ id: 'a1', riderId: 'r1', date: '2026-08-01', status: 'late', punctuality: 'late' }),
        attendance({ id: 'a2', riderId: 'r1', date: '2026-08-02' }),
        attendance({ id: 'a3', riderId: 'r1', date: '2026-08-03', status: 'late', punctuality: 'late' }),
      ],
      previousLogs: [], currentViolations: [], previousViolations: [], filters,
    });
    expect(result.insights.attentionRiderCount).toBe(0);
  });

  it('derives multiple-Rider attention, attendance breakdown, and performance from matching records', async () => {
    const module = await loadAnalytics();
    expect(typeof module.deriveReportsAnalytics).toBe('function');
    const currentLogs = [
      attendance({ id: 'a1', riderId: 'r1', riderName: 'Juan', date: '2026-08-01', status: 'late', punctuality: 'late' }),
      attendance({ id: 'a2', riderId: 'r1', riderName: 'Juan', date: '2026-08-02', status: 'late', punctuality: 'late' }),
      attendance({ id: 'a3', riderId: 'r2', riderName: 'Ana', date: '2026-08-01', status: 'absent', presence: 'absent', punctuality: 'none', timeIn: null, timeOut: null, hours: 0 }),
      attendance({ id: 'a4', riderId: 'r3', riderName: 'Mia', date: '2026-08-01', status: 'on_leave', presence: 'on_leave', punctuality: 'none', timeIn: null, timeOut: null, hours: 0 }),
    ];
    const currentViolations = [
      violation({ id: 'v1', riderId: 'r1', riderName: 'Juan', ts: Date.parse('2026-08-01T10:00:00+08:00') }),
    ];
    const result = module.deriveReportsAnalytics!({
      currentLogs, previousLogs: [], currentViolations, previousViolations: [], filters,
    });
    expect(result.attendanceBreakdown).toEqual({ present: 0, late: 2, absent: 1, onLeave: 1, dayOff: 0, total: 4 });
    expect(result.riderPerformance[0]).toMatchObject({ riderName: 'Juan', totalHours: 18, attendanceRate: 100, violationCount: 1 });
    expect(result.metrics.totalViolations).toBe(1);
  });

  it('filters the current period, specific Hub, and Zone while All Hubs aggregates authorized rows', async () => {
    const module = await loadAnalytics();
    expect(typeof module.deriveReportsAnalytics).toBe('function');
    const currentLogs = [
      attendance({ id: 'a1', riderId: 'r1', date: '2026-08-01', zoneId: 'zone-a', zoneName: 'North', hubId: 'hub-a' } as Partial<AttendanceLog> & { id: string; riderId: string; date: string }),
      attendance({ id: 'a2', riderId: 'r2', date: '2026-08-02', zoneId: 'zone-b', zoneName: 'South', hubId: 'hub-b' } as Partial<AttendanceLog> & { id: string; riderId: string; date: string }),
      attendance({ id: 'outside', riderId: 'r3', date: '2026-07-31', zoneId: 'zone-a', zoneName: 'North', hubId: 'hub-a' } as Partial<AttendanceLog> & { id: string; riderId: string; date: string }),
    ];
    const all = module.deriveReportsAnalytics!({ currentLogs, previousLogs: [], currentViolations: [], previousViolations: [], filters });
    const scoped = module.deriveReportsAnalytics!({
      currentLogs, previousLogs: [], currentViolations: [], previousViolations: [],
      filters: { ...filters, hubId: 'hub-a', zoneId: 'zone-a' },
    });
    expect(all.metrics.ridersReporting).toBe(2);
    expect(scoped.metrics.ridersReporting).toBe(1);
    expect(scoped.riderPerformance.map(row => row.riderName)).toEqual(['r1']);
  });

  it('uses authoritative violations for Zone hotspots and equivalent-period comparisons', async () => {
    const module = await loadAnalytics();
    expect(typeof module.deriveReportsAnalytics).toBe('function');
    const currentLogs = [attendance({ id: 'a1', riderId: 'r1', date: '2026-08-01' })];
    const previousLogs = [attendance({ id: 'p1', riderId: 'r1', date: '2026-07-17', status: 'absent', presence: 'absent', timeIn: null, timeOut: null, hours: 0 })];
    const currentViolations = [
      violation({ id: 'v1', riderId: 'r1', zoneName: 'North', ts: Date.parse('2026-08-01T10:00:00+08:00') }),
      violation({ id: 'v2', riderId: 'r1', zoneName: 'North', ts: Date.parse('2026-08-02T10:00:00+08:00') }),
    ];
    const previousViolations = [
      violation({ id: 'pv1', riderId: 'r1', zoneName: 'South', ts: Date.parse('2026-07-17T10:00:00+08:00') }),
    ];
    const result = module.deriveReportsAnalytics!({ currentLogs, previousLogs, currentViolations, previousViolations, filters });
    expect(result.comparisons).toEqual({ attendanceRateDeltaPoints: 100, violationDelta: 1 });
    expect(result.violationByZone[0]).toEqual({ zoneName: 'North', violations: 2 });
    expect(result.insights.geofenceHotspot).toContain('North');
    expect(result.insights.geofenceHotspot).toContain('100%');
  });

  it('LOCKS Day Off primary precedence: Published Day Off + Approved Leave must remain Day Off and not convert to On Leave', async () => {
    const { deriveReportsAnalytics } = await import('./reportsAnalytics');
    const raw = attendance({ id: 'a-dayoff', riderId: 'r-off', date: '2026-08-01', status: 'present', presence: 'present' });

    // Published Day Off + Approved Leave context
    const publishedDayOffWithLeave = {
      ...raw,
      effectiveStatus: 'day_off' as const,
      contextCode: 'approved_leave' as const,
    };

    const result = deriveReportsAnalytics({
      currentLogs: [publishedDayOffWithLeave],
      previousLogs: [],
      currentViolations: [],
      previousViolations: [],
      filters,
    });

    // Primary effective/reporting category must remain Day Off
    expect(result.attendanceBreakdown.dayOff).toBe(1);
    expect(result.attendanceBreakdown.onLeave).toBe(0);
    expect(result.attendanceBreakdown.present).toBe(0);
    expect(result.attendanceBreakdown.total).toBe(1);
    expect(result.attendanceTrend[0].dayOff).toBe(1);
    expect(result.attendanceTrend[0].onLeave).toBe(0);
  });

  it('does NOT change attendance-rate denominators merely by adding Day Off reporting', async () => {
    const { deriveReportsAnalytics } = await import('./reportsAnalytics');
    const logPresent = attendance({ id: 'p1', riderId: 'r1', date: '2026-08-01', status: 'present' });
    const logLate = attendance({ id: 'l1', riderId: 'r2', date: '2026-08-01', status: 'late', punctuality: 'late' });
    const logDayOff = {
      ...attendance({ id: 'd1', riderId: 'r3', date: '2026-08-01', status: 'absent' }),
      effectiveStatus: 'day_off' as const,
      contextCode: 'published_day_off' as const,
    };

    const result = deriveReportsAnalytics({
      currentLogs: [logPresent, logLate, logDayOff],
      previousLogs: [],
      currentViolations: [],
      previousViolations: [],
      filters,
    });

    // Total denominator = 3, Attended = 2 (present + late), Day Off does not count as attended
    expect(result.attendanceBreakdown.total).toBe(3);
    expect(result.attendanceBreakdown.present).toBe(1);
    expect(result.attendanceBreakdown.late).toBe(1);
    expect(result.attendanceBreakdown.dayOff).toBe(1);
    expect(result.metrics.attendanceRate).toBe(66.7);
  });
});
