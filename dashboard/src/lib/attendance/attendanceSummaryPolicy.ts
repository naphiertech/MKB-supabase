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

export interface PresentAttendanceCandidate {
  status?: string | null;
  presence?: string | null;
  punctuality?: string | null;
  timeIn?: string | null;
  timeOut?: string | null;
  rawTimeIn?: string | null;
  rawTimeOut?: string | null;
  time_in?: string | null;
  time_out?: string | null;
  raw_time_in?: string | null;
  raw_time_out?: string | null;
  effectiveStatus?: string | null;
  logStatus?: string | null;
  completionStatus?: string | null;
  completionState?: string | null;
}

/**
 * Authoritative check for whether an attendance record counts as Present.
 * Presence answers: "Did the rider actually report/work?"
 * Punctuality answers: "Did the rider arrive on time?"
 *
 * Therefore:
 * - A Late rider IS still Present.
 * - Actual clock evidence (timeIn / rawTimeIn) always counts as Present.
 * - Absent, On Leave (without clocks), Day Off (without clocks) count as NOT Present.
 */
export function isPresentAttendance(log: PresentAttendanceCandidate | null | undefined): boolean {
  if (!log) return false;

  const hasClock = Boolean(
    log.timeIn ||
    log.rawTimeIn ||
    ('time_in' in log && (log as { time_in?: string | null }).time_in) ||
    ('raw_time_in' in log && (log as { raw_time_in?: string | null }).raw_time_in)
  );

  if (hasClock) {
    return true;
  }

  const effectiveStatus = log.effectiveStatus || log.status;
  if (effectiveStatus === 'present' || effectiveStatus === 'late') {
    return true;
  }

  if (log.presence === 'present') {
    return true;
  }

  if (log.punctuality === 'late' || log.punctuality === 'on_time') {
    if (effectiveStatus === 'absent' || effectiveStatus === 'on_leave' || effectiveStatus === 'day_off') {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Evaluates whether an attendance record matches the Attendance page Status filter.
 * - "all": matches any record
 * - "present": matches all who actually reported (both on-time and late)
 * - "late": matches records that are late
 * - "absent": matches absent records (excluding any with actual clocks/presence)
 * - "on_leave": matches on_leave records (excluding any with actual clocks/presence)
 * - "day_off": matches day_off records (excluding any with actual clocks/presence)
 */
export function matchesAttendanceStatusFilter(
  log: PresentAttendanceCandidate | null | undefined,
  statusFilter: string,
): boolean {
  if (!log) return false;
  if (statusFilter === 'all') return true;
  if (statusFilter === 'present') {
    return isPresentAttendance(log);
  }
  if (statusFilter === 'late') {
    return (log.status === 'late' || log.punctuality === 'late') && isPresentAttendance(log);
  }
  if (statusFilter === 'absent') {
    return !isPresentAttendance(log) && (log.status === 'absent' || log.presence === 'absent');
  }
  if (statusFilter === 'on_leave') {
    return !isPresentAttendance(log) && (log.status === 'on_leave' || log.presence === 'on_leave');
  }
  if (statusFilter === 'day_off') {
    return !isPresentAttendance(log) && (log.status === 'day_off' || log.presence === 'day_off');
  }
  return log.status === statusFilter;
}

export type AttendancePresenceDisplay = 'present' | 'absent' | 'on_leave' | 'day_off' | 'not_finalized';

/**
 * Derives the canonical Presence display value for an attendance record.
 * Presence answers: "Did the rider report/work?"
 * Punctuality answers: "Was the rider on time?"
 *
 * Therefore:
 * - Actual attendance / valid Time In / Late punctuality -> "present"
 * - No clocks + approved leave -> "on_leave"
 * - Published Day Off + no clocks -> "day_off"
 * - Not finalized / pending -> "not_finalized"
 * - No clocks + absence (with or without notice) -> "absent"
 */
export function getAttendancePresenceDisplay(
  log: PresentAttendanceCandidate | null | undefined,
): AttendancePresenceDisplay {
  if (!log) return 'absent';

  if (isPresentAttendance(log)) {
    return 'present';
  }

  const effectiveStatus = log.effectiveStatus || log.status;
  const presence = log.presence;

  if (effectiveStatus === 'day_off' || presence === 'day_off') {
    return 'day_off';
  }

  if (effectiveStatus === 'on_leave' || presence === 'on_leave') {
    return 'on_leave';
  }

  if (effectiveStatus === 'not_finalized' || presence === 'not_finalized') {
    return 'not_finalized';
  }

  return 'absent';
}
