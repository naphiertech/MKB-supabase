import { describe, expect, it } from 'vitest';
import {
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
