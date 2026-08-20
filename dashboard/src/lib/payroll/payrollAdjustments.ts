export const FM_PICKUP_RATE = 3;

export type PayrollNumericValue = number | string | null | undefined;

export interface PayslipAdjustments {
  otherEarnings?: number;
  fmPickupCount?: number;
  deductions?: number;
  lateOnhold?: number;
  lateRemittance?: number;
}

export interface PayrollAdjustmentsInput {
  otherEarnings?: PayrollNumericValue;
  fmPickupCount?: PayrollNumericValue;
  deductions?: PayrollNumericValue;
  lateOnhold?: PayrollNumericValue;
  lateRemittance?: PayrollNumericValue;
}

export interface PayrollAdjustmentRecord {
  gross_pay?: PayrollNumericValue;
  other_earnings?: PayrollNumericValue;
  fm_pickup_count?: PayrollNumericValue;
  deductions?: PayrollNumericValue;
  late_onhold?: PayrollNumericValue;
  late_remittance?: PayrollNumericValue;
}

export type NormalizedPayslipAdjustments = Required<PayslipAdjustments>;

export interface PayrollAdjustmentTotals {
  grossPay: number;
  adjustments: NormalizedPayslipAdjustments;
  otherEarnings: number;
  fmPickupEarnings: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
}

export function normalizePayrollAdjustments(
  adjustments: PayrollAdjustmentsInput = {},
): NormalizedPayslipAdjustments {
  return {
    otherEarnings: Number(adjustments.otherEarnings ?? 0),
    fmPickupCount: Number(adjustments.fmPickupCount ?? 0),
    deductions: Number(adjustments.deductions ?? 0),
    lateOnhold: Number(adjustments.lateOnhold ?? 0),
    lateRemittance: Number(adjustments.lateRemittance ?? 0),
  };
}

export function payslipAdjustmentsFromRecord(
  record: PayrollAdjustmentRecord,
): NormalizedPayslipAdjustments {
  return normalizePayrollAdjustments({
    otherEarnings: record.other_earnings,
    fmPickupCount: record.fm_pickup_count,
    deductions: record.deductions,
    lateOnhold: record.late_onhold,
    lateRemittance: record.late_remittance,
  });
}

export function calculatePayrollAdjustmentTotals(
  grossPay: PayrollNumericValue,
  adjustments: PayrollAdjustmentsInput = {},
): PayrollAdjustmentTotals {
  const normalizedGrossPay = Number(grossPay ?? 0);
  const normalizedAdjustments = normalizePayrollAdjustments(adjustments);
  const fmPickupEarnings = normalizedAdjustments.fmPickupCount * FM_PICKUP_RATE;
  const totalEarnings = normalizedGrossPay + normalizedAdjustments.otherEarnings + fmPickupEarnings;
  const totalDeductions = normalizedAdjustments.deductions
    + normalizedAdjustments.lateOnhold
    + normalizedAdjustments.lateRemittance;

  return {
    grossPay: normalizedGrossPay,
    adjustments: normalizedAdjustments,
    otherEarnings: normalizedAdjustments.otherEarnings,
    fmPickupEarnings,
    totalEarnings,
    totalDeductions,
    netPay: totalEarnings - totalDeductions,
  };
}

export function calculatePayrollRecordTotals(
  record: PayrollAdjustmentRecord,
): PayrollAdjustmentTotals {
  return calculatePayrollAdjustmentTotals(
    record.gross_pay,
    payslipAdjustmentsFromRecord(record),
  );
}

export function calculatePayslipNetPay(
  grossPay: number,
  adjustments: PayslipAdjustments,
): number {
  const values = normalizePayrollAdjustments(adjustments);
  return Number(grossPay) + values.otherEarnings + values.fmPickupCount * FM_PICKUP_RATE
    - values.deductions - values.lateOnhold - values.lateRemittance;
}
