import type { PunctualityStatus } from '../../services/types';

export interface AttendanceSummaryInput {
  timeIn?: string | null;
  rawTimeIn?: string | null;
  logStatus?: string | null;
  hrStatus?: string | null;
}

export type NormalizedAttendanceLogStatus = 'present' | 'late' | 'absent' | 'on_leave' | null;
export type NormalizedAttendanceHrStatus = 'present' | 'late' | 'absent' | 'on_leave' | 'complete' | 'incomplete' | null;

export interface AttendanceSummaryFacts {
  formattedTimeIn: string | null;
  rawTimeIn: string | null;
  effectiveTimeIn: string | null;
  hasFormattedTimeIn: boolean;
  hasRawTimeIn: boolean;
  hasAnyTimeIn: boolean;
  normalizedLogStatus: NormalizedAttendanceLogStatus;
  normalizedHrStatus: NormalizedAttendanceHrStatus;
  isLogPresent: boolean;
  isHrPresent: boolean;
  isLate: boolean;
  isLogLeave: boolean;
  isHrLeave: boolean;
}

function normalizeLogStatus(status: string | null | undefined): NormalizedAttendanceLogStatus {
  if (status === 'present' || status === 'late' || status === 'absent' || status === 'on_leave') {
    return status;
  }
  return null;
}

function normalizeHrStatus(status: string | null | undefined): NormalizedAttendanceHrStatus {
  switch (status) {
    case 'Present': return 'present';
    case 'Late': return 'late';
    case 'Absent': return 'absent';
    case 'On Leave': return 'on_leave';
    case 'Complete': return 'complete';
    case 'Incomplete': return 'incomplete';
    default: return null;
  }
}

export function resolveAttendanceSummaryFacts(input: AttendanceSummaryInput): AttendanceSummaryFacts {
  const formattedTimeIn = input.timeIn || null;
  const rawTimeIn = input.rawTimeIn || null;
  const normalizedLogStatus = normalizeLogStatus(input.logStatus);
  const normalizedHrStatus = normalizeHrStatus(input.hrStatus);

  return {
    formattedTimeIn,
    rawTimeIn,
    effectiveTimeIn: rawTimeIn || formattedTimeIn,
    hasFormattedTimeIn: Boolean(formattedTimeIn),
    hasRawTimeIn: Boolean(rawTimeIn),
    hasAnyTimeIn: Boolean(rawTimeIn || formattedTimeIn),
    normalizedLogStatus,
    normalizedHrStatus,
    isLogPresent: normalizedLogStatus === 'present',
    isHrPresent: normalizedHrStatus === 'present',
    isLate: normalizedLogStatus === 'late' || normalizedHrStatus === 'late',
    isLogLeave: normalizedLogStatus === 'on_leave',
    isHrLeave: normalizedHrStatus === 'on_leave',
  };
}

export function resolveAttendancePunctuality(
  isLate: boolean,
  isPresent: boolean,
): PunctualityStatus {
  return isLate ? 'late' : isPresent ? 'on_time' : 'none';
}
