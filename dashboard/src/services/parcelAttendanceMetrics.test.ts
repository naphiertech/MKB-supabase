import { describe, expect, it } from 'vitest';
import {
  computePayrollAttendanceSummary,
  type RawAttendanceSummaryRow,
} from './parcelService';

describe('computePayrollAttendanceSummary', () => {
  const cutoffFrom = '2026-08-01';
  const cutoffTo = '2026-08-15';

  it('counts only finalized absent attendance records as absent days (Test 2)', () => {
    const rows: RawAttendanceSummaryRow[] = [
      {
        date: '2026-08-01',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'absent',
        hr_status: 'Absent',
      },
      {
        date: '2026-08-02',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'absent',
        hr_status: 'Absent',
      },
    ];

    const result = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(result.absentDays).toBe(2);
    expect(result.presentDays).toBe(0);
    expect(result.lateDays).toBe(0);
    expect(result.attendanceLogs).toEqual([
      { date: '2026-08-01', time_in: null, time_out: null, status: 'absent' },
      { date: '2026-08-02', time_in: null, time_out: null, status: 'absent' },
    ]);
  });

  it('does NOT count present days or late days as absent days (Test 3)', () => {
    const rows: RawAttendanceSummaryRow[] = [
      // Regular on-time present
      {
        date: '2026-08-03',
        time_in: '07:55',
        time_out: '17:00',
        raw_time_in: '2026-08-03T07:55:00.000Z',
        raw_time_out: '2026-08-03T17:00:00.000Z',
        log_status: 'present',
        hr_status: 'Complete',
      },
      // Late arrival
      {
        date: '2026-08-04',
        time_in: '08:45',
        time_out: '17:15',
        raw_time_in: '2026-08-04T08:45:00.000Z',
        raw_time_out: '2026-08-04T17:15:00.000Z',
        log_status: 'late',
        hr_status: 'Late',
      },
    ];

    const result = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(result.presentDays).toBe(2);
    expect(result.lateDays).toBe(1);
    expect(result.absentDays).toBe(0);
  });

  it('does NOT count approved leave / on_leave as absent days (Test 4)', () => {
    const rows: RawAttendanceSummaryRow[] = [
      {
        date: '2026-08-05',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'on_leave',
        hr_status: 'On Leave',
      },
      {
        date: '2026-08-06',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'on_leave',
        hr_status: 'Absent', // Note: even if view returns hr_status Absent because time_in is null
      },
    ];

    const result = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(result.presentDays).toBe(0);
    expect(result.lateDays).toBe(0);
    expect(result.absentDays).toBe(0);
    expect(result.attendanceLogs[0].status).toBe('on_leave');
    expect(result.attendanceLogs[1].status).toBe('on_leave');
  });

  it('does NOT count published Day Off or unfinalized days as absent (Test 5)', () => {
    const rows: RawAttendanceSummaryRow[] = [
      {
        date: '2026-08-07',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'day_off',
        hr_status: null,
      },
      {
        date: '2026-08-08',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: null,
        hr_status: null,
      },
    ];

    const result = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(result.absentDays).toBe(0);
    expect(result.presentDays).toBe(0);
  });

  it('does NOT count dates outside the cutoff period (Test 6)', () => {
    const rows: RawAttendanceSummaryRow[] = [
      // Prior to cutoff start
      {
        date: '2026-07-31',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'absent',
        hr_status: 'Absent',
      },
      // Within cutoff
      {
        date: '2026-08-01',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'absent',
        hr_status: 'Absent',
      },
      // After cutoff end
      {
        date: '2026-08-16',
        time_in: null,
        time_out: null,
        raw_time_in: null,
        raw_time_out: null,
        log_status: 'absent',
        hr_status: 'Absent',
      },
    ];

    const result = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(result.absentDays).toBe(1); // Only 2026-08-01 is counted
  });

  it('does not infer absence from 0 deliveries or status when attendance record indicates present', () => {
    const rows: RawAttendanceSummaryRow[] = [
      {
        date: '2026-08-01',
        time_in: '08:00',
        time_out: '17:00',
        raw_time_in: '2026-08-01T08:00:00.000Z',
        raw_time_out: '2026-08-01T17:00:00.000Z',
        log_status: 'present',
        hr_status: 'Complete',
      },
    ];

    const result = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(result.absentDays).toBe(0);
    expect(result.presentDays).toBe(1);
  });
});
