import { previousPeriodRange, type ReportsFilters } from '../lib/reportsAnalytics';
import { getAttendanceLogs } from './attendanceService';
import { getViolationsForReport } from './monitoringService';
import { enrichAttendanceWithHistoricalZones } from './historicalAttendanceContext';
import type { AttendanceLog, ViolationEvent } from './types';

export interface ReportsDataSet {
  currentLogs: AttendanceLog[];
  previousLogs: AttendanceLog[];
  currentViolations: ViolationEvent[];
  previousViolations: ViolationEvent[];
}

export async function loadReportsData(filters: ReportsFilters): Promise<ReportsDataSet> {
  const previous = previousPeriodRange(filters.from, filters.to);
  const zoneId = filters.zoneId === 'all' ? undefined : filters.zoneId;
  const zoneIds = zoneId ? [zoneId] : [];
  const attendanceOptions = { finalizeDaily: false, throwOnError: true, includeEvents: false } as const;

  const [rawCurrentLogs, rawPreviousLogs, currentViolations, previousViolations] = await Promise.all([
    getAttendanceLogs({ dateFrom: filters.from, dateTo: filters.to }, attendanceOptions),
    getAttendanceLogs({ dateFrom: previous.from, dateTo: previous.to }, attendanceOptions),
    getViolationsForReport({ from: filters.from, to: filters.to, zoneIds }),
    getViolationsForReport({ from: previous.from, to: previous.to, zoneIds }),
  ]);

  const enriched = await enrichAttendanceWithHistoricalZones([...rawCurrentLogs, ...rawPreviousLogs]);
  const currentLogs = enriched.slice(0, rawCurrentLogs.length).filter(log => !zoneId || log.zoneId === zoneId);
  const previousLogs = enriched.slice(rawCurrentLogs.length).filter(log => !zoneId || log.zoneId === zoneId);

  return { currentLogs, previousLogs, currentViolations, previousViolations };
}
