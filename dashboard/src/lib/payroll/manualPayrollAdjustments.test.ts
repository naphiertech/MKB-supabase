import { describe, expect, it } from 'vitest';
import {
  calculatePayrollAdjustmentTotals,
  calculatePayrollRecordTotals,
  legacyFmPickupAmount,
  payslipAdjustmentsFromRecord,
} from './payrollAdjustments';

describe('manual payroll adjustments', () => {
  it('treats FM Pick Up as a manual peso amount without a runtime multiplier', () => {
    expect(calculatePayrollAdjustmentTotals(100, {
      otherEarnings: 10,
      fmPickupAmount: 7,
      deductions: 4,
      lateOnhold: 3,
      lateRemittance: 2,
    })).toMatchObject({
      fmPickupEarnings: 7,
      totalEarnings: 117,
      totalDeductions: 9,
      netPay: 108,
    });
  });

  it('keeps the old PHP 3 conversion in an explicitly legacy-only helper', () => {
    expect(legacyFmPickupAmount(4)).toBe(12);
  });

  it('uses immutable submitted snapshots instead of recalculating current definitions', () => {
    const record = {
      status: 'approved',
      gross_pay: 100,
      other_earnings: 999,
      fm_pickup_amount: 999,
      deductions: 999,
      late_onhold: 999,
      late_remittance: 999,
      adjustment_snapshot: {
        version: 2,
        items: [
          { code: 'other_earnings', label: 'Historical Other Earnings', category: 'earning', input_mode: 'manual_amount', active: true, amount: 10 },
          { code: 'fm_pickup', label: 'Historical FM Pick Up', category: 'earning', input_mode: 'manual_amount', active: true, amount: 7 },
          { code: 'general_deductions', label: 'Historical General Deductions', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 4 },
          { code: 'late_onhold', label: 'Historical Late Onhold / FM', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 3 },
          { code: 'late_remittance', label: 'Historical Late Remittance', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 2 },
        ],
      },
      total_earnings_snapshot: 117,
      total_deductions_snapshot: 9,
      net_pay_snapshot: 108,
      adjustment_snapshot_version: 2,
    };

    expect(payslipAdjustmentsFromRecord(record)).toMatchObject({
      otherEarnings: 10,
      fmPickupAmount: 7,
      deductions: 4,
      lateOnhold: 3,
      lateRemittance: 2,
    });
    expect(calculatePayrollRecordTotals(record)).toMatchObject({
      totalEarnings: 117,
      totalDeductions: 9,
      netPay: 108,
    });
  });
});
