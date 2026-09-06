import type { AttendanceLog, ViolationEvent } from '../services/types';
import type { AttendanceContextCode, AttendanceContextStatus } from '../services/attendance/attendanceContextService';

export type AttendanceAnalyticsLog = AttendanceLog & {
  effectiveStatus?: AttendanceContextStatus;
  contextCode?: AttendanceContextCode | null;
};

export interface ReportsFilters {
  from: string;
  to: string;
  hubId: string | null;
  zoneId: string;
}

export interface ReportsAnalyticsInput {
  currentLogs: AttendanceAnalyticsLog[];
  previousLogs: AttendanceAnalyticsLog[];
  currentViolations: ViolationEvent[];
  previousViolations: ViolationEvent[];
  filters: ReportsFilters;
}

export interface ReportsAnalytics {
  metrics: {
    attendanceRate: number | null;
    totalViolations: number;
    averageCompletedShiftHours: number | null;
    ridersReporting: number;
  };
  comparisons: {
    attendanceRateDeltaPoints: number | null;
    violationDelta: number | null;
  };
  attendanceBreakdown: {
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    dayOff: number;
    total: number;
  };
  attendanceTrend: Array<{ date: string; present: number; late: number; absent: number; onLeave: number; dayOff: number }>;
  riderPerformance: Array<{
    riderId: string;
    riderName: string;
    zoneName: string;
    daysPresent: number;
    totalHours: number;
    lateCount: number;
    attendanceRate: number;
    violationCount: number;
  }>;
  zoneCoverage: Array<{
    zoneId: string;
    zoneName: string;
    ridersReporting: number;
    attendanceRate: number;
    averageHours: number;
    violations: number;
  }>;
  violationByZone: Array<{ zoneName: string; violations: number }>;
  insights: {
    attendance: string;
    topZone: string;
    geofenceHotspot: string;
    riderAttention: string;
    attentionRiderCount: number;
  };
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function violationDate(violation: ViolationEvent): string {
  return new Date(violation.ts + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function recordMatchesScope(
  record: { zoneId?: string | null; hubId?: string | null },
  filters: ReportsFilters,
): boolean {
  if (filters.zoneId !== 'all' && record.zoneId !== filters.zoneId) return false;
  if (filters.hubId && record.hubId != null && record.hubId !== filters.hubId) return false;
  return true;
}

function filterLogs(logs: AttendanceAnalyticsLog[], filters: ReportsFilters): AttendanceAnalyticsLog[] {
  return logs.filter(log => (
    log.date >= filters.from
    && log.date <= filters.to
    && recordMatchesScope(log, filters)
  ));
}

function filterViolations(violations: ViolationEvent[], filters: ReportsFilters): ViolationEvent[] {
  return violations.filter(violation => {
    const date = violationDate(violation);
    return date >= filters.from
      && date <= filters.to
      && recordMatchesScope(violation, filters);
  });
}

function presenceCategory(log: AttendanceAnalyticsLog): 'present' | 'late' | 'absent' | 'onLeave' | 'dayOff' {
  // 1. Day Off primary precedence is LOCKED.
  // Published Day Off + Approved Leave must remain: Primary category: Day Off.
  // Do NOT let contextCode === 'approved_leave' convert effectiveStatus === 'day_off' into On Leave.
  if (log.effectiveStatus === 'day_off' || (log.status as string) === 'day_off' || log.contextCode === 'published_day_off') {
    return 'dayOff';
  }
  if (log.effectiveStatus === 'present' || log.effectiveStatus === 'late') return log.effectiveStatus;
  if (log.effectiveStatus === 'on_leave' || log.presence === 'on_leave' || log.status === 'on_leave' || log.contextCode === 'approved_leave') {
    return 'onLeave';
  }
  if (log.effectiveStatus === 'absent' || log.presence === 'absent' || log.status === 'absent') return 'absent';
  if (log.punctuality === 'late' || log.status === 'late') return 'late';
  return 'present';
}

function attendanceRate(logs: AttendanceAnalyticsLog[]): number | null {
  if (logs.length === 0) return null;
  const attended = logs.filter(log => {
    const category = presenceCategory(log);
    return category === 'present' || category === 'late';
  }).length;
  return roundOne(attended / logs.length * 100);
}

function filterForPreviousPeriod(filters: ReportsFilters): ReportsFilters {
  return { ...filters, ...previousPeriodRange(filters.from, filters.to) };
}

export function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);
  const inclusiveDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(fromDate);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - inclusiveDays + 1);
  return { from: formatDateOnly(previousFrom), to: formatDateOnly(previousTo) };
}

function deriveBreakdown(logs: AttendanceAnalyticsLog[]): ReportsAnalytics['attendanceBreakdown'] {
  const breakdown = { present: 0, late: 0, absent: 0, onLeave: 0, dayOff: 0, total: logs.length };
  logs.forEach(log => { breakdown[presenceCategory(log)] += 1; });
  return breakdown;
}

function deriveTrend(logs: AttendanceAnalyticsLog[]): ReportsAnalytics['attendanceTrend'] {
  const byDate = new Map<string, ReportsAnalytics['attendanceTrend'][number]>();
  logs.forEach(log => {
    const row = byDate.get(log.date) ?? { date: log.date, present: 0, late: 0, absent: 0, onLeave: 0, dayOff: 0 };
    row[presenceCategory(log)] += 1;
    byDate.set(log.date, row);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function deriveRiderPerformance(
  logs: AttendanceAnalyticsLog[],
  violations: ViolationEvent[],
): ReportsAnalytics['riderPerformance'] {
  const byRider = new Map<string, AttendanceAnalyticsLog[]>();
  logs.forEach(log => byRider.set(log.riderId, [...(byRider.get(log.riderId) ?? []), log]));

  return [...byRider.entries()].map(([riderId, riderLogs]) => {
    const attended = riderLogs.filter(log => ['present', 'late'].includes(presenceCategory(log))).length;
    return {
      riderId,
      riderName: riderLogs[0].riderName,
      zoneName: riderLogs[0].zoneName,
      daysPresent: attended,
      totalHours: roundOne(riderLogs.reduce((sum, log) => sum + log.hours, 0)),
      lateCount: riderLogs.filter(log => presenceCategory(log) === 'late').length,
      attendanceRate: roundOne(attended / riderLogs.length * 100),
      violationCount: violations.filter(violation => violation.riderId === riderId).length,
    };
  }).sort((a, b) => b.totalHours - a.totalHours || a.riderName.localeCompare(b.riderName));
}

function deriveZoneCoverage(
  logs: AttendanceAnalyticsLog[],
  violations: ViolationEvent[],
): ReportsAnalytics['zoneCoverage'] {
  const byZone = new Map<string, AttendanceAnalyticsLog[]>();
  logs.forEach(log => byZone.set(log.zoneId, [...(byZone.get(log.zoneId) ?? []), log]));
  violations.forEach(violation => {
    const key = violation.zoneId ?? `name:${violation.zoneName}`;
    if (!byZone.has(key)) byZone.set(key, []);
  });

  return [...byZone.entries()].map(([zoneId, zoneLogs]) => {
    const matchingViolations = violations.filter(violation => (
      violation.zoneId === zoneId
      || (zoneId.startsWith('name:') && violation.zoneName === zoneId.slice(5))
    ));
    const zoneName = zoneLogs[0]?.zoneName ?? matchingViolations[0]?.zoneName ?? 'No Zone';
    const completed = zoneLogs.filter(log => log.timeIn && log.timeOut);
    return {
      zoneId,
      zoneName,
      ridersReporting: new Set(zoneLogs.map(log => log.riderId)).size,
      attendanceRate: attendanceRate(zoneLogs) ?? 0,
      averageHours: completed.length
        ? roundOne(completed.reduce((sum, log) => sum + log.hours, 0) / completed.length)
        : 0,
      violations: matchingViolations.length,
    };
  }).sort((a, b) => b.attendanceRate - a.attendanceRate || a.zoneName.localeCompare(b.zoneName));
}

function deriveViolationByZone(violations: ViolationEvent[]): ReportsAnalytics['violationByZone'] {
  const counts = new Map<string, number>();
  violations.forEach(violation => counts.set(violation.zoneName || 'No Zone', (counts.get(violation.zoneName || 'No Zone') ?? 0) + 1));
  return [...counts.entries()]
    .map(([zoneName, violationCount]) => ({ zoneName, violations: violationCount }))
    .sort((a, b) => b.violations - a.violations || a.zoneName.localeCompare(b.zoneName));
}

function countAttentionRiders(logs: AttendanceAnalyticsLog[]): number {
  const logsByRider = new Map<string, AttendanceAnalyticsLog[]>();
  logs.forEach(log => logsByRider.set(log.riderId, [...(logsByRider.get(log.riderId) ?? []), log]));
  return [...logsByRider.values()].filter(riderLogs => {
    const ordered = [...riderLogs].sort((a, b) => a.date.localeCompare(b.date));
    return ordered.some((log, index) => (
      index > 0
      && presenceCategory(log) === 'late'
      && presenceCategory(ordered[index - 1]) === 'late'
    ));
  }).length;
}

export function deriveReportsAnalytics(input: ReportsAnalyticsInput): ReportsAnalytics {
  const currentLogs = filterLogs(input.currentLogs, input.filters);
  const currentViolations = filterViolations(input.currentViolations, input.filters);
  const previousFilters = filterForPreviousPeriod(input.filters);
  const previousLogs = filterLogs(input.previousLogs, previousFilters);
  const previousViolations = filterViolations(input.previousViolations, previousFilters);
  const completedShifts = currentLogs.filter(log => log.timeIn && log.timeOut);
  const currentRate = attendanceRate(currentLogs);
  const previousRate = attendanceRate(previousLogs);
  const zoneCoverage = deriveZoneCoverage(currentLogs, currentViolations);
  const violationByZone = deriveViolationByZone(currentViolations);
  const attentionRiderCount = countAttentionRiders(currentLogs);
  const topZone = zoneCoverage.find(zone => zone.ridersReporting > 0);
  const hotspot = violationByZone[0];
  const hotspotShare = hotspot && currentViolations.length
    ? roundOne(hotspot.violations / currentViolations.length * 100)
    : null;

  return {
    metrics: {
      attendanceRate: currentRate,
      totalViolations: currentViolations.length,
      averageCompletedShiftHours: completedShifts.length
        ? roundOne(completedShifts.reduce((sum, log) => sum + log.hours, 0) / completedShifts.length)
        : null,
      ridersReporting: new Set(currentLogs.map(log => log.riderId)).size,
    },
    comparisons: {
      attendanceRateDeltaPoints: currentRate != null && previousRate != null
        ? roundOne(currentRate - previousRate)
        : null,
      violationDelta: previousLogs.length > 0 || previousViolations.length > 0
        ? currentViolations.length - previousViolations.length
        : null,
    },
    attendanceBreakdown: deriveBreakdown(currentLogs),
    attendanceTrend: deriveTrend(currentLogs),
    riderPerformance: deriveRiderPerformance(currentLogs, currentViolations),
    zoneCoverage,
    violationByZone,
    insights: {
      attendance: currentRate == null
        ? 'No attendance records match the selected period and scope.'
        : `Attendance was ${currentRate}% across ${currentLogs.length} matching record${currentLogs.length === 1 ? '' : 's'}.`,
      topZone: topZone
        ? `${topZone.zoneName} had the highest attendance rate at ${topZone.attendanceRate}%.`
        : 'No Zone attendance data is available for this period.',
      geofenceHotspot: hotspot && hotspotShare != null
        ? `${hotspot.zoneName} accounted for ${hotspotShare}% of recorded violations.`
        : 'No geofence violations were recorded for this period.',
      riderAttention: attentionRiderCount === 0
        ? 'No Riders require late-attendance attention for this period.'
        : `${attentionRiderCount} Rider${attentionRiderCount === 1 ? '' : 's'} require${attentionRiderCount === 1 ? 's' : ''} attention after consecutive late attendance records.`,
      attentionRiderCount,
    },
  };
}
