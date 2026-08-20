import { describe, expect, it } from 'vitest';
import {
  calculatePayrollAdjustmentTotals,
  calculatePayrollRecordTotals,
  calculatePayslipNetPay,
  FM_PICKUP_RATE,
  payslipAdjustmentsFromRecord,
  type PayrollAdjustmentsInput,
  type PayrollAdjustmentTotals,
  type PayrollNumericValue,
} from './payrollAdjustments';

const cases: Array<{
  name: string;
  grossPay: PayrollNumericValue;
  adjustments: PayrollAdjustmentsInput;
  expected: PayrollAdjustmentTotals;
}> = [
  {
    name: 'normal values',
    grossPay: 1_000,
    adjustments: { otherEarnings: 100, fmPickupCount: 5, deductions: 50, lateOnhold: 10, lateRemittance: 5 },
    expected: {
      grossPay: 1_000,
      adjustments: { otherEarnings: 100, fmPickupCount: 5, deductions: 50, lateOnhold: 10, lateRemittance: 5 },
      otherEarnings: 100,
      fmPickupEarnings: 15,
      totalEarnings: 1_115,
      totalDeductions: 65,
      netPay: 1_050,
    },
  },
  {
    name: 'all zero adjustments',
    grossPay: 131,
    adjustments: { otherEarnings: 0, fmPickupCount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
    expected: {
      grossPay: 131,
      adjustments: { otherEarnings: 0, fmPickupCount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
      otherEarnings: 0,
      fmPickupEarnings: 0,
      totalEarnings: 131,
      totalDeductions: 0,
      netPay: 131,
    },
  },
  {
    name: 'null values',
    grossPay: null,
    adjustments: { otherEarnings: null, fmPickupCount: null, deductions: null, lateOnhold: null, lateRemittance: null },
    expected: {
      grossPay: 0,
      adjustments: { otherEarnings: 0, fmPickupCount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
      otherEarnings: 0,
      fmPickupEarnings: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      netPay: 0,
    },
  },
  {
    name: 'undefined values',
    grossPay: undefined,
    adjustments: {},
    expected: {
      grossPay: 0,
      adjustments: { otherEarnings: 0, fmPickupCount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
      otherEarnings: 0,
      fmPickupEarnings: 0,
      totalEarnings: 0,
      totalDeductions: 0,
      netPay: 0,
    },
  },
  {
    name: 'numeric strings',
    grossPay: '131',
    adjustments: { otherEarnings: '25', fmPickupCount: '2', deductions: '10', lateOnhold: '5', lateRemittance: '7' },
    expected: {
      grossPay: 131,
      adjustments: { otherEarnings: 25, fmPickupCount: 2, deductions: 10, lateOnhold: 5, lateRemittance: 7 },
      otherEarnings: 25,
      fmPickupEarnings: 6,
      totalEarnings: 162,
      totalDeductions: 22,
      netPay: 140,
    },
  },
  {
    name: 'FM pickup count at exactly PHP 3 each',
    grossPay: 100,
    adjustments: { fmPickupCount: 4 },
    expected: {
      grossPay: 100,
      adjustments: { otherEarnings: 0, fmPickupCount: 4, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
      otherEarnings: 0,
      fmPickupEarnings: 12,
      totalEarnings: 112,
      totalDeductions: 0,
      netPay: 112,
    },
  },
  {
    name: 'negative adjustment values',
    grossPay: 100,
    adjustments: { otherEarnings: -10, fmPickupCount: -2, deductions: -5, lateOnhold: -3, lateRemittance: -2 },
    expected: {
      grossPay: 100,
      adjustments: { otherEarnings: -10, fmPickupCount: -2, deductions: -5, lateOnhold: -3, lateRemittance: -2 },
      otherEarnings: -10,
      fmPickupEarnings: -6,
      totalEarnings: 84,
      totalDeductions: -10,
      netPay: 94,
    },
  },
  {
    name: 'decimal values',
    grossPay: 100.5,
    adjustments: { otherEarnings: 10.25, fmPickupCount: 1.5, deductions: 2.25, lateOnhold: 1.5, lateRemittance: 0.5 },
    expected: {
      grossPay: 100.5,
      adjustments: { otherEarnings: 10.25, fmPickupCount: 1.5, deductions: 2.25, lateOnhold: 1.5, lateRemittance: 0.5 },
      otherEarnings: 10.25,
      fmPickupEarnings: 4.5,
      totalEarnings: 115.25,
      totalDeductions: 4.25,
      netPay: 111,
    },
  },
  {
    name: 'existing payroll document example',
    grossPay: 154,
    adjustments: { otherEarnings: 20, fmPickupCount: 2, deductions: 10, lateOnhold: 5, lateRemittance: 7 },
    expected: {
      grossPay: 154,
      adjustments: { otherEarnings: 20, fmPickupCount: 2, deductions: 10, lateOnhold: 5, lateRemittance: 7 },
      otherEarnings: 20,
      fmPickupEarnings: 6,
      totalEarnings: 180,
      totalDeductions: 22,
      netPay: 158,
    },
  },
];

describe('calculatePayrollAdjustmentTotals', () => {
  it.each(cases)('$name', ({ grossPay, adjustments, expected }) => {
    expect(calculatePayrollAdjustmentTotals(grossPay, adjustments)).toEqual(expected);
  });
});

describe('payroll adjustment compatibility helpers', () => {
  it('maps persisted snake_case adjustment fields with existing Number coercion', () => {
    expect(payslipAdjustmentsFromRecord({
      other_earnings: '25',
      fm_pickup_count: 2,
      deductions: null,
      late_onhold: undefined,
      late_remittance: '7.5',
    })).toEqual({
      otherEarnings: 25,
      fmPickupCount: 2,
      deductions: 0,
      lateOnhold: 0,
      lateRemittance: 7.5,
    });
  });

  it('calculates totals directly from a persisted payroll record', () => {
    expect(calculatePayrollRecordTotals({
      gross_pay: '131',
      other_earnings: '25',
      fm_pickup_count: 2,
      deductions: '10',
      late_onhold: 5,
      late_remittance: 7,
    }).netPay).toBe(140);
  });

  it('retains the existing calculatePayslipNetPay compatibility API', () => {
    expect(calculatePayslipNetPay(131, {
      otherEarnings: 25,
      fmPickupCount: 2,
      deductions: 10,
      lateOnhold: 5,
      lateRemittance: 7,
    })).toBe(140);
  });

  it('exports the fixed FM pickup rate', () => {
    expect(FM_PICKUP_RATE).toBe(3);
  });
});
