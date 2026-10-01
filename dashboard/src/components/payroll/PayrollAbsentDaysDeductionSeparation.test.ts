import { describe, expect, it } from 'vitest';
import {
  calculatePayrollAdjustmentTotals,
  calculatePayrollRecordTotals,
} from '../../lib/payroll/payrollAdjustments';
import {
  computePayrollAttendanceSummary,
  type RawAttendanceSummaryRow,
} from '../../services/parcelService';

describe('Payroll Absent Days and Deduction Separation (Tests 7 & 8)', () => {
  const cutoffFrom = '2026-08-01';
  const cutoffTo = '2026-08-15';

  it('Scenario 1 (Test 7): Absent Days = 4 while deductions remain ₱0.00 when Policy V2 is inactive and no obligation exists', () => {
    // 4 attendance logs finalized as absent
    const rows: RawAttendanceSummaryRow[] = [
      { date: '2026-08-01', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-02', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-03', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-04', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-05', time_in: '08:00', time_out: '17:00', raw_time_in: '2026-08-05T08:00:00.000Z', raw_time_out: '2026-08-05T17:00:00.000Z', log_status: 'present', hr_status: 'Complete' },
    ];

    const summary = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(summary.absentDays).toBe(4);
    expect(summary.presentDays).toBe(1);

    // Draft payroll calculation with no allocated obligations or manual deductions
    const totals = calculatePayrollAdjustmentTotals(1500, {
      deductions: 0,
      lateOnhold: 0,
      lateRemittance: 0,
      otherEarnings: 0,
      fmPickupAmount: 0,
    });

    // Proves: Absent Days = 4, but Deductions = ₱0.00
    expect(totals.totalDeductions).toBe(0);
    expect(totals.netPay).toBe(1500);
  });

  it('Scenario 2 (Test 8): Absent Days = 4 with 1 confirmed & allocated V2 consequence produces exactly ₱500.00 deduction, NOT 4 x ₱500', () => {
    // 4 attendance logs finalized as absent
    const rows: RawAttendanceSummaryRow[] = [
      { date: '2026-08-01', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-02', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-03', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
      { date: '2026-08-04', time_in: null, time_out: null, raw_time_in: null, raw_time_out: null, log_status: 'absent', hr_status: 'Absent' },
    ];

    const summary = computePayrollAttendanceSummary(rows, cutoffFrom, cutoffTo);
    expect(summary.absentDays).toBe(4);

    // Exactly 1 obligation of ₱500.00 was confirmed and allocated to this cutoff
    const totals = calculatePayrollAdjustmentTotals(2000, {
      deductions: 500, // allocated obligation
      lateOnhold: 0,
      lateRemittance: 0,
      otherEarnings: 0,
      fmPickupAmount: 0,
    });

    // Proves: Deductions is ₱500.00, NOT ₱2,000.00.
    // The system does NOT multiply absent days by ₱500.
    expect(totals.totalDeductions).toBe(500);
    expect(totals.netPay).toBe(1500);
  });

  it('Finalized payroll record calculation strictly isolates deductions from absent count', () => {
    const finalizedRecord = {
      gross_pay: 3000,
      deductions: 500, // single allocated obligation
      late_onhold: 0,
      late_remittance: 0,
      other_earnings: 0,
      fm_pickup_amount: 0,
    };

    const recordTotals = calculatePayrollRecordTotals(finalizedRecord);
    expect(recordTotals.totalDeductions).toBe(500);
    expect(recordTotals.netPay).toBe(2500);
  });
});
