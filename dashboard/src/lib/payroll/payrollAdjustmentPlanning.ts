export interface ProjectedPayrollPlanInput {
  grossPay: number;
  otherEarnings: number;
  fmPickupAmount: number;
  allocations: number[];
}

export interface DeductionAllocationValidationInput {
  amount: number;
  available: number;
  projectedNetPay: number;
}

export interface EditableAllocationPreviewInput {
  authoritativeAvailable: number;
  persistedAllocation: number;
  enteredAmount: number;
}

export function calculateEditableAllocationPreview(input: EditableAllocationPreviewInput) {
  const editableAvailable = Math.max(input.authoritativeAvailable, 0)
    + Math.max(input.persistedAllocation, 0);
  return {
    editableAvailable,
    remainingAfter: Math.max(editableAvailable - Math.max(input.enteredAmount, 0), 0),
  };
}

export function evaluateEditableAllocationInput(input: EditableAllocationPreviewInput) {
  const preview = calculateEditableAllocationPreview(input);
  const valid = Number.isFinite(input.enteredAmount)
    && input.enteredAmount >= 0
    && input.enteredAmount <= preview.editableAvailable;
  return {
    ...preview,
    valid,
    projectedAmount: valid ? input.enteredAmount : Math.max(input.persistedAllocation, 0),
    error: valid ? null : `Maximum available is ₱${preview.editableAvailable.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

export function calculateProjectedPayrollPlan(input: ProjectedPayrollPlanInput) {
  const payBeforeDeductions = input.grossPay + input.otherEarnings + input.fmPickupAmount;
  const plannedDeductions = input.allocations.reduce((sum, amount) => sum + amount, 0);
  return {
    payBeforeDeductions,
    plannedDeductions,
    projectedNetPay: payBeforeDeductions - plannedDeductions,
  };
}

export function validateDeductionAllocation(input: DeductionAllocationValidationInput): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return 'Enter an amount greater than zero.';
  if (input.amount > input.available) return 'Amount cannot exceed the available balance.';
  if (input.projectedNetPay < 0) return 'Applied deductions cannot make projected net pay negative.';
  return null;
}
