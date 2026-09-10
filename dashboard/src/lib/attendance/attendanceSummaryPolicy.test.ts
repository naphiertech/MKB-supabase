import { describe, expect, it } from 'vitest';
import {
  isPresentAttendance,
  matchesAttendanceStatusFilter,
  resolveAttendancePunctuality,
  resolveAttendanceSummaryFacts,
  type AttendanceSummaryFacts,
  type AttendanceSummaryInput,
} from './attendanceSummaryPolicy';

const cases = [
  {
    name: 'keeps all facts empty for a missing attendance summary',
    input: {},
    expected: {
      formattedTimeIn: null,
      rawTimeIn: null,
      effectiveTimeIn: null,
      hasFormattedTimeIn: false,
      hasRawTimeIn: false,
      hasAnyTimeIn: false,
      normalizedLogStatus: null,
      normalizedHrStatus: null,
      isLogPresent: false,
      isHrPresent: false,
      isLate: false,
      isLogLeave: false,
      isHrLeave: false,
    },
  },
  {
    name: 'records formatted Time In without inventing a raw timestamp',
    input: { timeIn: '08:00' },
    expected: {
      formattedTimeIn: '08:00', rawTimeIn: null, effectiveTimeIn: '08:00',
      hasFormattedTimeIn: true, hasRawTimeIn: false, hasAnyTimeIn: true,
      normalizedLogStatus: null, normalizedHrStatus: null,
      isLogPresent: false, isHrPresent: false, isLate: false, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'records raw-only Time In as a separate fact',
    input: { rawTimeIn: '2026-08-16T07:55:00.000Z' },
    expected: {
      formattedTimeIn: null, rawTimeIn: '2026-08-16T07:55:00.000Z', effectiveTimeIn: '2026-08-16T07:55:00.000Z',
      hasFormattedTimeIn: false, hasRawTimeIn: true, hasAnyTimeIn: true,
      normalizedLogStatus: null, normalizedHrStatus: null,
      isLogPresent: false, isHrPresent: false, isLate: false, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'prefers raw Time In only for the effective timestamp fact',
    input: { timeIn: '15:55', rawTimeIn: '2026-08-16T07:55:00.000Z' },
    expected: {
      formattedTimeIn: '15:55', rawTimeIn: '2026-08-16T07:55:00.000Z', effectiveTimeIn: '2026-08-16T07:55:00.000Z',
      hasFormattedTimeIn: true, hasRawTimeIn: true, hasAnyTimeIn: true,
      normalizedLogStatus: null, normalizedHrStatus: null,
      isLogPresent: false, isHrPresent: false, isLate: false, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'recognizes the exact log present alias',
    input: { logStatus: 'present' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: 'present', normalizedHrStatus: null,
      isLogPresent: true, isHrPresent: false, isLate: false, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'retains the legacy HR Present alias as an independent fact',
    input: { hrStatus: 'Present' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: null, normalizedHrStatus: 'present',
      isLogPresent: false, isHrPresent: true, isLate: false, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'recognizes lateness from log status',
    input: { logStatus: 'late' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: 'late', normalizedHrStatus: null,
      isLogPresent: false, isHrPresent: false, isLate: true, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'recognizes the 8:15 rule result from HR Late',
    input: { logStatus: 'present', hrStatus: 'Late' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: 'present', normalizedHrStatus: 'late',
      isLogPresent: true, isHrPresent: false, isLate: true, isLogLeave: false, isHrLeave: false,
    },
  },
  {
    name: 'recognizes the exact log leave alias',
    input: { logStatus: 'on_leave' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: 'on_leave', normalizedHrStatus: null,
      isLogPresent: false, isHrPresent: false, isLate: false, isLogLeave: true, isHrLeave: false,
    },
  },
  {
    name: 'retains the legacy HR On Leave alias as an independent fact',
    input: { hrStatus: 'On Leave' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: null, normalizedHrStatus: 'on_leave',
      isLogPresent: false, isHrPresent: false, isLate: false, isLogLeave: false, isHrLeave: true,
    },
  },
  {
    name: 'does not resolve contradictory leave, late, and present precedence',
    input: {
      timeIn: '08:30',
      rawTimeIn: '2026-08-16T00:30:00.000Z',
      logStatus: 'on_leave',
      hrStatus: 'Late',
    },
    expected: {
      formattedTimeIn: '08:30', rawTimeIn: '2026-08-16T00:30:00.000Z', effectiveTimeIn: '2026-08-16T00:30:00.000Z',
      hasFormattedTimeIn: true, hasRawTimeIn: true, hasAnyTimeIn: true,
      normalizedLogStatus: 'on_leave', normalizedHrStatus: 'late',
      isLogPresent: false, isHrPresent: false, isLate: true, isLogLeave: true, isHrLeave: false,
    },
  },
  {
    name: 'does not broaden unsupported status casing',
    input: { logStatus: 'Present', hrStatus: 'late' },
    expected: {
      formattedTimeIn: null, rawTimeIn: null, effectiveTimeIn: null,
      hasFormattedTimeIn: false, hasRawTimeIn: false, hasAnyTimeIn: false,
      normalizedLogStatus: null, normalizedHrStatus: null,
      isLogPresent: false, isHrPresent: false, isLate: false, isLogLeave: false, isHrLeave: false,
    },
  },
] satisfies Array<{ name: string; input: AttendanceSummaryInput; expected: AttendanceSummaryFacts }>;

describe('resolveAttendanceSummaryFacts', () => {
  it.each(cases)('$name', ({ input, expected }) => {
    expect(resolveAttendanceSummaryFacts(input)).toEqual(expected);
  });
});

describe('resolveAttendancePunctuality', () => {
  it.each([
    { isLate: true, isPresent: false, expected: 'late' },
    { isLate: true, isPresent: true, expected: 'late' },
    { isLate: false, isPresent: true, expected: 'on_time' },
    { isLate: false, isPresent: false, expected: 'none' },
  ])('returns $expected for late=$isLate present=$isPresent', ({ isLate, isPresent, expected }) => {
    expect(resolveAttendancePunctuality(isLate, isPresent)).toBe(expected);
  });
});

describe('isPresentAttendance presence semantics', () => {
  it('counts an on-time present record as present', () => {
    expect(isPresentAttendance({ status: 'present', punctuality: 'on_time' })).toBe(true);
  });

  it('counts a late record as present (presence=Present, punctuality=Late)', () => {
    expect(isPresentAttendance({ status: 'late', punctuality: 'late' })).toBe(true);
  });

  it('counts a record with valid clock evidence as present regardless of status label', () => {
    expect(isPresentAttendance({ timeIn: '13:44', timeOut: '13:46', status: 'late', punctuality: 'late' })).toBe(true);
    expect(isPresentAttendance({ rawTimeIn: '2026-09-10T13:44:00Z', status: 'late' })).toBe(true);
    expect(isPresentAttendance({ timeIn: '08:05', status: 'present' })).toBe(true);
  });

  it('counts actual clock as present even when planned leave or notice was recorded', () => {
    // Worked During Approved Leave
    expect(isPresentAttendance({ timeIn: '08:15', status: 'late', effectiveStatus: 'late' })).toBe(true);
    // Worked Despite Accepted Notice
    expect(isPresentAttendance({ timeIn: '08:00', status: 'present', effectiveStatus: 'present' })).toBe(true);
  });

  it('does NOT count non-reporting records without clocks as present', () => {
    expect(isPresentAttendance({ status: 'absent', punctuality: 'none', timeIn: null })).toBe(false);
    expect(isPresentAttendance({ status: 'on_leave', punctuality: 'none', timeIn: null })).toBe(false);
    expect(isPresentAttendance({ status: 'day_off', punctuality: 'none', timeIn: null })).toBe(false);
    expect(isPresentAttendance(null)).toBe(false);
    expect(isPresentAttendance(undefined)).toBe(false);
    expect(isPresentAttendance({})).toBe(false);
  });
});

describe('matchesAttendanceStatusFilter semantics', () => {
  const onTimeLog = { status: 'present', punctuality: 'on_time', timeIn: '08:00' };
  const lateLog = { status: 'late', punctuality: 'late', timeIn: '08:45' };
  const absentLog = { status: 'absent', punctuality: 'none', timeIn: null };
  const leaveLog = { status: 'on_leave', punctuality: 'none', timeIn: null };
  const dayOffLog = { status: 'day_off', punctuality: 'none', timeIn: null };

  it('matches all records when filter is "all"', () => {
    expect(matchesAttendanceStatusFilter(onTimeLog, 'all')).toBe(true);
    expect(matchesAttendanceStatusFilter(lateLog, 'all')).toBe(true);
    expect(matchesAttendanceStatusFilter(absentLog, 'all')).toBe(true);
    expect(matchesAttendanceStatusFilter(leaveLog, 'all')).toBe(true);
  });

  it('matches both on-time and late records when filter is "present"', () => {
    expect(matchesAttendanceStatusFilter(onTimeLog, 'present')).toBe(true);
    expect(matchesAttendanceStatusFilter(lateLog, 'present')).toBe(true);
    expect(matchesAttendanceStatusFilter(absentLog, 'present')).toBe(false);
    expect(matchesAttendanceStatusFilter(leaveLog, 'present')).toBe(false);
    expect(matchesAttendanceStatusFilter(dayOffLog, 'present')).toBe(false);
  });

  it('excludes late records from "absent" filter', () => {
    expect(matchesAttendanceStatusFilter(lateLog, 'absent')).toBe(false);
    expect(matchesAttendanceStatusFilter(onTimeLog, 'absent')).toBe(false);
    expect(matchesAttendanceStatusFilter(absentLog, 'absent')).toBe(true);
  });

  it('excludes late records from "on_leave" filter', () => {
    expect(matchesAttendanceStatusFilter(lateLog, 'on_leave')).toBe(false);
    expect(matchesAttendanceStatusFilter(leaveLog, 'on_leave')).toBe(true);
  });
});
