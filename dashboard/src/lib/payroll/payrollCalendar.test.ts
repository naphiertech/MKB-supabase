import { describe, it, expect } from 'vitest';
import {
  WEEKLY_PAYROLL_START_DATE,
  getPayrollWeek,
  getPayableDate,
  isPayrollPayable,
  isValidWeeklyPeriod,
  formatPayrollPeriod,
  previousPayrollWeek,
  nextPayrollWeek,
  getRecentPayrollWeeks,
  parseDateString,
  addDays,
  diffDays,
  getISODayOfWeek
} from './payrollCalendar';

describe('payrollCalendar', () => {
  describe('Calendar-Week Resolution', () => {
    it('resolves Aug 31, 2026 -> Aug 31–Sep 6', () => {
      const week = getPayrollWeek('2026-08-31');
      expect(week.cutoff_start).toBe('2026-08-31');
      expect(week.cutoff_end).toBe('2026-09-06');
      expect(week.payable_date).toBe('2026-09-14');
      expect(week.label).toBe('Aug 31 – Sep 6, 2026');
      expect(week.is_weekly).toBe(true);
    });

    it('resolves Sep 1, 2026 -> Aug 31–Sep 6', () => {
      const week = getPayrollWeek('2026-09-01');
      expect(week.cutoff_start).toBe('2026-08-31');
      expect(week.cutoff_end).toBe('2026-09-06');
      expect(week.payable_date).toBe('2026-09-14');
    });

    it('resolves Sep 6, 2026 (Sunday) -> Aug 31–Sep 6', () => {
      const week = getPayrollWeek('2026-09-06');
      expect(week.cutoff_start).toBe('2026-08-31');
      expect(week.cutoff_end).toBe('2026-09-06');
    });

    it('resolves Sep 7, 2026 (Monday) -> Sep 7–13', () => {
      const week = getPayrollWeek('2026-09-07');
      expect(week.cutoff_start).toBe('2026-09-07');
      expect(week.cutoff_end).toBe('2026-09-13');
      expect(week.payable_date).toBe('2026-09-21');
      expect(week.label).toBe('Sep 7–13, 2026');
    });

    it('resolves Sep 30, 2026 (Wednesday) -> Sep 28–Oct 4', () => {
      const week = getPayrollWeek('2026-09-30');
      expect(week.cutoff_start).toBe('2026-09-28');
      expect(week.cutoff_end).toBe('2026-10-04');
      expect(week.payable_date).toBe('2026-10-12');
      expect(week.label).toBe('Sep 28 – Oct 4, 2026');
    });

    it('resolves Oct 31, 2026 (Saturday) -> Oct 26–Nov 1', () => {
      const week = getPayrollWeek('2026-10-31');
      expect(week.cutoff_start).toBe('2026-10-26');
      expect(week.cutoff_end).toBe('2026-11-01');
      expect(week.payable_date).toBe('2026-11-09');
      expect(week.label).toBe('Oct 26 – Nov 1, 2026');
    });

    it('resolves Nov 1, 2026 (Sunday) -> Oct 26–Nov 1', () => {
      const week = getPayrollWeek('2026-11-01');
      expect(week.cutoff_start).toBe('2026-10-26');
      expect(week.cutoff_end).toBe('2026-11-01');
    });

    it('resolves Nov 2, 2026 (Monday) -> Nov 2–8', () => {
      const week = getPayrollWeek('2026-11-02');
      expect(week.cutoff_start).toBe('2026-11-02');
      expect(week.cutoff_end).toBe('2026-11-08');
      expect(week.payable_date).toBe('2026-11-16');
      expect(week.label).toBe('Nov 2–8, 2026');
    });
  });

  describe('Period Integrity & Boundaries', () => {
    it('ensures every generated weekly period is exactly 7 calendar days', () => {
      const sampleDates = [
        '2026-08-31', '2026-09-03', '2026-09-07', '2026-09-28',
        '2026-10-26', '2026-12-30', '2027-01-01'
      ];
      for (const d of sampleDates) {
        const week = getPayrollWeek(d);
        const { year: sY, month: sM, day: sD } = parseDateString(week.cutoff_start);
        const { year: eY, month: eM, day: eD } = parseDateString(week.cutoff_end);

        expect(getISODayOfWeek(sY, sM, sD)).toBe(1); // Monday
        expect(getISODayOfWeek(eY, eM, eD)).toBe(7); // Sunday
        expect(diffDays(week.cutoff_end, week.cutoff_start)).toBe(6); // 7 days inclusive
        expect(isValidWeeklyPeriod(week.cutoff_start, week.cutoff_end)).toBe(true);
      }
    });

    it('ensures contiguous weeks have no gaps and no overlaps', () => {
      let current = getPayrollWeek('2026-08-31');
      for (let i = 0; i < 20; i++) {
        const next = nextPayrollWeek(current);
        expect(diffDays(next.cutoff_start, current.cutoff_end)).toBe(1); // Next Monday is day after Sunday
        current = next;
      }
    });

    it('rejects malformed weekly periods in isValidWeeklyPeriod', () => {
      expect(isValidWeeklyPeriod('2026-09-01', '2026-09-07')).toBe(false); // Starts Tuesday
      expect(isValidWeeklyPeriod('2026-08-31', '2026-09-05')).toBe(false); // 6 days
      expect(isValidWeeklyPeriod('2026-08-31', '2026-09-14')).toBe(false); // 15 days
    });
  });

  describe('Cross-Month & Cross-Year Periods', () => {
    it('formats cross-month weeks properly', () => {
      expect(formatPayrollPeriod('2026-08-31', '2026-09-06')).toBe('Aug 31 – Sep 6, 2026');
      expect(formatPayrollPeriod('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4, 2026');
      expect(formatPayrollPeriod('2026-10-26', '2026-11-01')).toBe('Oct 26 – Nov 1, 2026');
      expect(formatPayrollPeriod('2026-11-30', '2026-12-06')).toBe('Nov 30 – Dec 6, 2026');
    });

    it('formats cross-year weeks properly without resetting on Jan 1', () => {
      const yearEndWeek = getPayrollWeek('2026-12-31');
      expect(yearEndWeek.cutoff_start).toBe('2026-12-28');
      expect(yearEndWeek.cutoff_end).toBe('2027-01-03');
      expect(yearEndWeek.payable_date).toBe('2027-01-11');
      expect(yearEndWeek.label).toBe('Dec 28, 2026 – Jan 3, 2027');
    });
  });

  describe('One-Week Payout Lag & Eligibility', () => {
    it('calculates payable_date as period_end + 8 calendar days for weekly cutoffs', () => {
      expect(getPayableDate('2026-08-31', '2026-09-06')).toBe('2026-09-14');
      expect(getPayableDate('2026-09-07', '2026-09-13')).toBe('2026-09-21');
      expect(getPayableDate('2026-09-14', '2026-09-20')).toBe('2026-09-28');
    });

    it('evaluates isPayrollPayable correctly for Aug 31–Sep 6', () => {
      const start = '2026-08-31';
      const end = '2026-09-06';

      // During waiting week: not payable
      expect(isPayrollPayable(start, end, '2026-09-07')).toBe(false);
      expect(isPayrollPayable(start, end, '2026-09-10')).toBe(false);
      expect(isPayrollPayable(start, end, '2026-09-13')).toBe(false);

      // On and after payable date (Sep 14): payable
      expect(isPayrollPayable(start, end, '2026-09-14')).toBe(true);
      expect(isPayrollPayable(start, end, '2026-09-15')).toBe(true);
    });

    it('evaluates isPayrollPayable correctly for Sep 7–13', () => {
      const start = '2026-09-07';
      const end = '2026-09-13';

      expect(isPayrollPayable(start, end, '2026-09-14')).toBe(false);
      expect(isPayrollPayable(start, end, '2026-09-20')).toBe(false);
      expect(isPayrollPayable(start, end, '2026-09-21')).toBe(true);
    });
  });

  describe('Legacy Payroll Compatibility', () => {
    it('returns null for getPayableDate on pre-boundary records', () => {
      expect(getPayableDate('2026-08-16', '2026-08-31')).toBeNull();
      expect(getPayableDate('2026-08-01', '2026-08-15')).toBeNull();
    });

    it('considers legacy records always payable without weekly waiting delay', () => {
      expect(isPayrollPayable('2026-08-16', '2026-08-31', '2026-08-20')).toBe(true);
    });
  });

  describe('Recent Payroll Weeks Selector', () => {
    it('never generates weekly periods before WEEKLY_PAYROLL_START_DATE', () => {
      const weeks = getRecentPayrollWeeks(10, '2026-09-15');
      expect(weeks.length).toBe(3);
      expect(weeks.map(w => w.cutoff_start)).toEqual([
        '2026-09-14',
        '2026-09-07',
        '2026-08-31'
      ]);
      expect(weeks.every(w => w.cutoff_start >= WEEKLY_PAYROLL_START_DATE)).toBe(true);
    });
  });

  describe('Week Navigation & Date Math Helpers', () => {
    it('navigates previous and next payroll weeks correctly', () => {
      const current = getPayrollWeek('2026-09-07');
      const prev = previousPayrollWeek(current);
      const next = nextPayrollWeek(current);

      expect(prev.cutoff_start).toBe('2026-08-31');
      expect(prev.cutoff_end).toBe('2026-09-06');
      expect(next.cutoff_start).toBe('2026-09-14');
      expect(next.cutoff_end).toBe('2026-09-20');
    });

    it('performs pure Gregorian date calculations without timezone shift', () => {
      const parsed = parseDateString('2026-09-01');
      expect(parsed).toEqual({ year: 2026, month: 9, day: 1 });
      expect(addDays('2026-08-31', 6)).toBe('2026-09-06');
      expect(diffDays('2026-09-06', '2026-08-31')).toBe(6);
      expect(getISODayOfWeek('2026-08-31')).toBe(1); // Monday
      expect(getISODayOfWeek('2026-09-06')).toBe(7); // Sunday
    });
  });
});
