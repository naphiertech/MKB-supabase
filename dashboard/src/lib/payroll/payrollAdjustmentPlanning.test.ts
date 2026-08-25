import { describe, expect, it } from 'vitest';
import {
  calculateEditableAllocationPreview,
  calculateProjectedPayrollPlan,
  evaluateEditableAllocationInput,
  validateDeductionAllocation,
} from './payrollAdjustmentPlanning';

describe('traceable payroll adjustment planning', () => {
  it('subtracts new unsaved input from authoritative available balance', () => {
    expect(calculateEditableAllocationPreview({
      authoritativeAvailable: 150,
      persistedAllocation: 0,
      enteredAmount: 50,
    })).toEqual({ editableAvailable: 150, remainingAfter: 100 });
  });

  it('adds back only the persisted allocation when editing an existing Draft allocation', () => {
    expect(calculateEditableAllocationPreview({
      authoritativeAvailable: 100,
      persistedAllocation: 50,
      enteredAmount: 80,
    })).toEqual({ editableAvailable: 150, remainingAfter: 70 });
  });

  it.each([
    { enteredAmount: 200, valid: false, remainingAfter: 0, projectedAmount: 0 },
    { enteredAmount: 150, valid: true, remainingAfter: 0, projectedAmount: 150 },
    { enteredAmount: 50, valid: true, remainingAfter: 100, projectedAmount: 50 },
  ])('validates a new allocation of $enteredAmount against 150 available', ({ enteredAmount, valid, remainingAfter, projectedAmount }) => {
    expect(evaluateEditableAllocationInput({
      authoritativeAvailable: 150,
      persistedAllocation: 0,
      enteredAmount,
    })).toMatchObject({ valid, remainingAfter, projectedAmount });
  });

  it.each([
    { enteredAmount: 151, valid: false, projectedAmount: 50 },
    { enteredAmount: 150, valid: true, projectedAmount: 150 },
  ])('validates an edited allocation of $enteredAmount against 100 available plus 50 persisted', ({ enteredAmount, valid, projectedAmount }) => {
    expect(evaluateEditableAllocationInput({
      authoritativeAvailable: 100,
      persistedAllocation: 50,
      enteredAmount,
    })).toMatchObject({ editableAvailable: 150, valid, projectedAmount });
  });

  it('projects combined manual allocations without inventing a minimum take-home', () => {
    expect(calculateProjectedPayrollPlan({
      grossPay: 980,
      otherEarnings: 0,
      fmPickupAmount: 0,
      allocations: [200, 100],
    })).toEqual({
      payBeforeDeductions: 980,
      plannedDeductions: 300,
      projectedNetPay: 680,
    });
  });

  it('rejects non-positive and over-balance allocations', () => {
    expect(validateDeductionAllocation({ amount: 0, available: 1300, projectedNetPay: 980 }))
      .toBe('Enter an amount greater than zero.');
    expect(validateDeductionAllocation({ amount: 1400, available: 1300, projectedNetPay: 100 }))
      .toBe('Amount cannot exceed the available balance.');
  });

  it('rejects a combined plan that would make net pay negative', () => {
    expect(validateDeductionAllocation({ amount: 400, available: 900, projectedNetPay: -20 }))
      .toBe('Applied deductions cannot make projected net pay negative.');
  });
});
