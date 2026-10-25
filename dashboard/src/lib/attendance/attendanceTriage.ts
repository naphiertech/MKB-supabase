import {
  getPresentationCompletionState,
  getPresentationStatus,
  type AttendancePresentationLog,
} from '../../services/attendance/attendanceContextService';

export type TriageKey = 'all' | 'exceptions' | 'late' | 'missing_time_out' | 'manual';

export const TRIAGE_LABEL: Record<TriageKey, string> = {
  all: 'All',
  exceptions: 'Exceptions',
  late: 'Late',
  missing_time_out: 'Missing Time Out',
  manual: 'Manual',
};

export const TRIAGE_KEYS = Object.keys(TRIAGE_LABEL) as TriageKey[];

/** One-click HR triage buckets. "Exceptions" is every row HR may have to act on. */
export function matchesTriage(log: AttendancePresentationLog, key: TriageKey): boolean {
  const isLate = getPresentationStatus(log) === 'late';
  const isMissingTimeOut = getPresentationCompletionState(log) === 'missing_time_out';
  const isManual = log.source === 'manual';
  switch (key) {
    case 'all':
      return true;
    case 'late':
      return isLate;
    case 'missing_time_out':
      return isMissingTimeOut;
    case 'manual':
      return isManual;
    case 'exceptions':
      return isLate || isMissingTimeOut || isManual || getPresentationStatus(log) === 'absent';
  }
}

export function countTriage(logs: readonly AttendancePresentationLog[]): Record<TriageKey, number> {
  const counts = Object.fromEntries(TRIAGE_KEYS.map((key) => [key, 0])) as Record<TriageKey, number>;
  for (const log of logs) {
    for (const key of TRIAGE_KEYS) {
      if (matchesTriage(log, key)) counts[key] += 1;
    }
  }
  return counts;
}
