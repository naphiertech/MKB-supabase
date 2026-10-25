import { describe, expect, it } from 'vitest';
import {
  calculatePayrollAdjustmentTotals,
  calculatePayrollRecordTotals,
  calculatePayslipNetPay,
  LEGACY_FM_PICKUP_RATE,
  payslipAdjustmentsFromRecord,
  resolvePayrollWorksheet,
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
    adjustments: { otherEarnings: 100, fmPickupAmount: 5, deductions: 50, lateOnhold: 10, lateRemittance: 5 },
    expected: {
      grossPay: 1_000,
      adjustments: { otherEarnings: 100, fmPickupAmount: 5, deductions: 50, lateOnhold: 10, lateRemittance: 5, absentWithoutNotice: 0 },
      otherEarnings: 100,
      fmPickupEarnings: 5,
      totalEarnings: 1_105,
      totalDeductions: 65,
      netPay: 1_040,
    },
  },
  {
    name: 'all zero adjustments',
    grossPay: 131,
    adjustments: { otherEarnings: 0, fmPickupAmount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0 },
    expected: {
      grossPay: 131,
      adjustments: { otherEarnings: 0, fmPickupAmount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0, absentWithoutNotice: 0 },
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
    adjustments: { otherEarnings: null, fmPickupAmount: null, deductions: null, lateOnhold: null, lateRemittance: null },
    expected: {
      grossPay: 0,
      adjustments: { otherEarnings: 0, fmPickupAmount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0, absentWithoutNotice: 0 },
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
      adjustments: { otherEarnings: 0, fmPickupAmount: 0, deductions: 0, lateOnhold: 0, lateRemittance: 0, absentWithoutNotice: 0 },
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
    adjustments: { otherEarnings: '25', fmPickupAmount: '2', deductions: '10', lateOnhold: '5', lateRemittance: '7' },
    expected: {
      grossPay: 131,
      adjustments: { otherEarnings: 25, fmPickupAmount: 2, deductions: 10, lateOnhold: 5, lateRemittance: 7, absentWithoutNotice: 0 },
      otherEarnings: 25,
      fmPickupEarnings: 2,
      totalEarnings: 158,
      totalDeductions: 22,
      netPay: 136,
    },
  },
  {
    name: 'manual FM Pick Up amount',
    grossPay: 100,
    adjustments: { fmPickupAmount: 4 },
    expected: {
      grossPay: 100,
      adjustments: { otherEarnings: 0, fmPickupAmount: 4, deductions: 0, lateOnhold: 0, lateRemittance: 0, absentWithoutNotice: 0 },
      otherEarnings: 0,
      fmPickupEarnings: 4,
      totalEarnings: 104,
      totalDeductions: 0,
      netPay: 104,
    },
  },
  {
    name: 'negative adjustment values',
    grossPay: 100,
    adjustments: { otherEarnings: -10, fmPickupAmount: -2, deductions: -5, lateOnhold: -3, lateRemittance: -2 },
    expected: {
      grossPay: 100,
      adjustments: { otherEarnings: -10, fmPickupAmount: -2, deductions: -5, lateOnhold: -3, lateRemittance: -2, absentWithoutNotice: 0 },
      otherEarnings: -10,
      fmPickupEarnings: -2,
      totalEarnings: 88,
      totalDeductions: -10,
      netPay: 98,
    },
  },
  {
    name: 'decimal values',
    grossPay: 100.5,
    adjustments: { otherEarnings: 10.25, fmPickupAmount: 1.5, deductions: 2.25, lateOnhold: 1.5, lateRemittance: 0.5 },
    expected: {
      grossPay: 100.5,
      adjustments: { otherEarnings: 10.25, fmPickupAmount: 1.5, deductions: 2.25, lateOnhold: 1.5, lateRemittance: 0.5, absentWithoutNotice: 0 },
      otherEarnings: 10.25,
      fmPickupEarnings: 1.5,
      totalEarnings: 112.25,
      totalDeductions: 4.25,
      netPay: 108,
    },
  },
  {
    name: 'existing payroll document example',
    grossPay: 154,
    adjustments: { otherEarnings: 20, fmPickupAmount: 2, deductions: 10, lateOnhold: 5, lateRemittance: 7 },
    expected: {
      grossPay: 154,
      adjustments: { otherEarnings: 20, fmPickupAmount: 2, deductions: 10, lateOnhold: 5, lateRemittance: 7, absentWithoutNotice: 0 },
      otherEarnings: 20,
      fmPickupEarnings: 2,
      totalEarnings: 176,
      totalDeductions: 22,
      netPay: 154,
    },
  },
  {
    name: 'with absent without notice deduction',
    grossPay: 1_000,
    adjustments: { otherEarnings: 0, fmPickupAmount: 0, deductions: 50, lateOnhold: 10, lateRemittance: 5, absentWithoutNotice: 500 },
    expected: {
      grossPay: 1_000,
      adjustments: { otherEarnings: 0, fmPickupAmount: 0, deductions: 50, lateOnhold: 10, lateRemittance: 5, absentWithoutNotice: 500 },
      otherEarnings: 0,
      fmPickupEarnings: 0,
      totalEarnings: 1_000,
      totalDeductions: 565,
      netPay: 435,
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
      absent_without_notice: '500',
    })).toEqual({
      otherEarnings: 25,
      fmPickupAmount: 6,
      deductions: 0,
      lateOnhold: 0,
      lateRemittance: 7.5,
      absentWithoutNotice: 500,
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
      absent_without_notice: 500,
    }).netPay).toBe(-360);
  });

  it('retains the existing calculatePayslipNetPay compatibility API', () => {
    expect(calculatePayslipNetPay(131, {
      otherEarnings: 25,
      fmPickupAmount: 6,
      deductions: 10,
      lateOnhold: 5,
      lateRemittance: 7,
    })).toBe(140);
  });

  it('supports 5-item historical snapshots and 6-item current snapshots', () => {
    const historicalSnapshot = {
      version: 2,
      items: [
        { code: 'other_earnings', label: 'Other Earnings', category: 'earning', input_mode: 'manual_amount', active: true, amount: 10 },
        { code: 'fm_pickup', label: 'FM Pick Up', category: 'earning', input_mode: 'manual_amount', active: true, amount: 20 },
        { code: 'general_deductions', label: 'General Deductions', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 30 },
        { code: 'late_onhold', label: 'Late Onhold / FM', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 40 },
        { code: 'late_remittance', label: 'Late Remittance', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 50 },
      ],
    };
    const historicalAdjustments = payslipAdjustmentsFromRecord({
      status: 'approved',
      adjustment_snapshot: historicalSnapshot,
    });
    expect(historicalAdjustments.absentWithoutNotice).toBe(0);
    expect(historicalAdjustments.deductions).toBe(30);

    const sixItemSnapshot = {
      version: 2,
      items: [
        ...historicalSnapshot.items,
        { code: 'absent_without_notice', label: 'Absent w/o prior notice', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 500 },
      ],
    };
    const sixItemAdjustments = payslipAdjustmentsFromRecord({
      status: 'approved',
      adjustment_snapshot: sixItemSnapshot,
    });
    expect(sixItemAdjustments.absentWithoutNotice).toBe(500);
    expect(sixItemAdjustments.deductions).toBe(30);
  });

  it('exports the explicitly legacy FM pickup rate', () => {
    expect(LEGACY_FM_PICKUP_RATE).toBe(3);
  });

  describe('resolvePayrollWorksheet', () => {
    it('resolves snapshot records preserving frozen totals and categorized deduction lines', () => {
      const record = {
        id: 'rec-snap',
        status: 'paid',
        gross_pay: 3000,
        total_earnings_snapshot: 3000,
        total_deductions_snapshot: 350,
        net_pay_snapshot: 2650,
        adjustment_snapshot: {
          version: 2,
          items: [
            { code: 'other_earnings' as const, label: 'Other Earnings', category: 'earning' as const, input_mode: 'manual_amount' as const, active: true, amount: 0 },
            { code: 'fm_pickup' as const, label: 'FM Pick Up', category: 'earning' as const, input_mode: 'manual_amount' as const, active: true, amount: 0 },
            { code: 'general_deductions' as const, label: 'Uniform Installment', category: 'deduction' as const, input_mode: 'manual_amount' as const, active: true, amount: 200 },
            { code: 'late_onhold' as const, label: 'Late Delivery Onhold', category: 'deduction' as const, input_mode: 'manual_amount' as const, active: true, amount: 50 },
            { code: 'late_remittance' as const, label: 'Late Remittance', category: 'deduction' as const, input_mode: 'manual_amount' as const, active: true, amount: 0 },
            { code: 'absent_without_notice' as const, label: 'Unnotified Absence', category: 'deduction' as const, input_mode: 'manual_amount' as const, active: true, amount: 100 },
          ],
        },
      };

      const result = resolvePayrollWorksheet(record);
      expect(result.netPay).toBe(2650);
      expect(result.totalDeductions).toBe(350);
      expect(result.isSnapshot).toBe(true);
      expect(result.deductionsList).toHaveLength(3);
      expect(result.deductionsList[0]).toEqual({
        code: 'general_deductions',
        label: 'Uniform Installment',
        amount: 200,
        category: 'other',
      });
      expect(result.deductionsList[1].category).toBe('attendance');
      expect(result.deductionsList[2].category).toBe('attendance');
    });

    it('resolves legacy un-snapshotted records including absent_without_notice in net pay and deduction list', () => {
      const legacyRecord = {
        id: 'rec-legacy',
        status: 'approved',
        gross_pay: 4000,
        deductions: 300,
        late_onhold: 100,
        late_remittance: 50,
        absent_without_notice: 500,
      };

      const result = resolvePayrollWorksheet(legacyRecord);
      expect(result.isSnapshot).toBe(false);
      expect(result.totalDeductions).toBe(950);
      expect(result.netPay).toBe(3050);
      expect(result.deductionsList).toEqual([
        { code: 'general_deductions', label: 'General Deductions', amount: 300, category: 'other' },
        { code: 'late_onhold', label: 'Late Onhold Penalty', amount: 100, category: 'attendance' },
        { code: 'late_remittance', label: 'Late Remittance Penalty', amount: 50, category: 'penalty' },
        { code: 'absent_without_notice', label: 'Absent Without Notice', amount: 500, category: 'attendance' },
      ]);
    });
  });
});
