import { previousPeriodRange, type AttendanceAnalyticsLog, type ReportsFilters } from '../../lib/reportsAnalytics';
import { getAttendanceLogs } from '../attendance/attendanceService';
import { listAttendanceContext, type AttendanceContextLog } from '../attendance/attendanceContextService';
import { getViolationsForReport } from '../monitoring/monitoringService';
import { enrichAttendanceWithHistoricalZones } from '../attendance/historicalAttendanceContext';
import type { AttendanceLog, ViolationEvent } from '../types';

export interface ReportsDataSet {
  currentLogs: AttendanceAnalyticsLog[];
  previousLogs: AttendanceAnalyticsLog[];
  currentViolations: ViolationEvent[];
  previousViolations: ViolationEvent[];
}

export async function loadReportsData(filters: ReportsFilters, includeAttendanceContext = false): Promise<ReportsDataSet> {
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

  const [currentContext, previousContext] = includeAttendanceContext
    ? await Promise.all([
        listAttendanceContext({ fromDate: filters.from, toDate: filters.to }),
        listAttendanceContext({ fromDate: previous.from, toDate: previous.to }),
      ])
    : [[], []] as [AttendanceContextLog[], AttendanceContextLog[]];

  const mergeContext = (logs: AttendanceLog[], contextRows: AttendanceContextLog[]) => {
    const contextByKey = new Map(contextRows.map(row => [`${row.riderId}:${row.date}`, row]));
    return logs.map(log => {
      const context = contextByKey.get(`${log.riderId}:${log.date}`);
      return context ? { ...log, effectiveStatus: context.status, contextCode: context.contextCode } : log;
    });
  };
  const contextualLogs: AttendanceAnalyticsLog[] = [
    ...mergeContext(rawCurrentLogs, currentContext),
    ...mergeContext(rawPreviousLogs, previousContext),
  ];
  const enriched = await enrichAttendanceWithHistoricalZones(contextualLogs) as AttendanceAnalyticsLog[];
  const currentLogs = enriched.slice(0, rawCurrentLogs.length).filter(log => !zoneId || log.zoneId === zoneId);
  const previousLogs = enriched.slice(rawCurrentLogs.length).filter(log => !zoneId || log.zoneId === zoneId);

  return { currentLogs, previousLogs, currentViolations, previousViolations };
}
