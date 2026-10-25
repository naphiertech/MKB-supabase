export const LEGACY_FM_PICKUP_RATE = 3;
export const CURRENT_ADJUSTMENT_SNAPSHOT_VERSION = 2;

export type PayrollNumericValue = number | string | null | undefined;
export type PayrollAdjustmentCode =
  | 'other_earnings'
  | 'fm_pickup'
  | 'general_deductions'
  | 'late_onhold'
  | 'late_remittance'
  | 'absent_without_notice';
export type PayrollAdjustmentCategory = 'earning' | 'deduction';

export interface PayrollAdjustmentDefinitionLike {
  code: PayrollAdjustmentCode;
  label: string;
  category: PayrollAdjustmentCategory;
  input_mode: 'manual_amount';
  active: boolean;
  amount?: number;
  legacy_quantity?: number;
}

export interface PayrollAdjustmentSnapshot {
  version: number;
  items: PayrollAdjustmentDefinitionLike[];
}

export interface PayslipAdjustments {
  otherEarnings?: number;
  fmPickupAmount?: number;
  deductions?: number;
  lateOnhold?: number;
  lateRemittance?: number;
  absentWithoutNotice?: number;
  definitions?: PayrollAdjustmentDefinitionLike[];
  snapshotVersion?: number;
  legacyFmPickupCount?: number;
  totalsSnapshot?: {
    totalEarnings: number;
    totalDeductions: number;
    netPay: number;
  };
}

export interface PayrollAdjustmentsInput {
  otherEarnings?: PayrollNumericValue;
  fmPickupAmount?: PayrollNumericValue;
  deductions?: PayrollNumericValue;
  lateOnhold?: PayrollNumericValue;
  lateRemittance?: PayrollNumericValue;
  absentWithoutNotice?: PayrollNumericValue;
}

export interface PayrollAdjustmentRecord {
  status?: string | null;
  gross_pay?: PayrollNumericValue;
  other_earnings?: PayrollNumericValue;
  fm_pickup_count?: PayrollNumericValue;
  fm_pickup_amount?: PayrollNumericValue;
  deductions?: PayrollNumericValue;
  late_onhold?: PayrollNumericValue;
  late_remittance?: PayrollNumericValue;
  absent_without_notice?: PayrollNumericValue;
  adjustment_snapshot?: unknown;
  adjustment_snapshot_version?: PayrollNumericValue;
  total_earnings_snapshot?: PayrollNumericValue;
  total_deductions_snapshot?: PayrollNumericValue;
  net_pay_snapshot?: PayrollNumericValue;
}

export type NormalizedPayslipAdjustments = Required<Pick<
  PayslipAdjustments,
  'otherEarnings' | 'fmPickupAmount' | 'deductions' | 'lateOnhold' | 'lateRemittance' | 'absentWithoutNotice'
>>;

export interface PayrollAdjustmentTotals {
  grossPay: number;
  adjustments: NormalizedPayslipAdjustments;
  otherEarnings: number;
  fmPickupEarnings: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
}

const SUBMITTED_PAYROLL_STATUSES = new Set(['pending', 'approved', 'paid']);

export function legacyFmPickupAmount(count: PayrollNumericValue): number {
  return Number(count ?? 0) * LEGACY_FM_PICKUP_RATE;
}

export function normalizePayrollAdjustments(
  adjustments: PayrollAdjustmentsInput = {},
): NormalizedPayslipAdjustments {
  return {
    otherEarnings: Number(adjustments.otherEarnings ?? 0),
    fmPickupAmount: Number(adjustments.fmPickupAmount ?? 0),
    deductions: Number(adjustments.deductions ?? 0),
    lateOnhold: Number(adjustments.lateOnhold ?? 0),
    lateRemittance: Number(adjustments.lateRemittance ?? 0),
    absentWithoutNotice: Number(adjustments.absentWithoutNotice ?? 0),
  };
}

function parseAdjustmentSnapshot(value: unknown): PayrollAdjustmentSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as { version?: unknown; items?: unknown };
  if (!Number.isFinite(Number(candidate.version)) || !Array.isArray(candidate.items)) return null;

  const items = candidate.items.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.code !== 'string'
      || typeof row.label !== 'string'
      || (row.category !== 'earning' && row.category !== 'deduction')
      || row.input_mode !== 'manual_amount'
      || typeof row.active !== 'boolean'
    ) return [];
    return [{
      code: row.code as PayrollAdjustmentCode,
      label: row.label,
      category: row.category as PayrollAdjustmentCategory,
      input_mode: 'manual_amount' as const,
      active: row.active,
      amount: Number(row.amount ?? 0),
      ...(row.legacy_quantity == null ? {} : { legacy_quantity: Number(row.legacy_quantity) }),
    }];
  });

  return items.length > 0 ? { version: Number(candidate.version), items } : null;
}

function amountForCode(items: PayrollAdjustmentDefinitionLike[], code: PayrollAdjustmentCode): number {
  return Number(items.find((item) => item.code === code)?.amount ?? 0);
}

export function payslipAdjustmentsFromRecord(
  record: PayrollAdjustmentRecord,
  currentDefinitions?: PayrollAdjustmentDefinitionLike[],
): PayslipAdjustments {
  const snapshot = SUBMITTED_PAYROLL_STATUSES.has(String(record.status ?? '').toLowerCase())
    ? parseAdjustmentSnapshot(record.adjustment_snapshot)
    : null;

  if (snapshot) {
    const legacyFm = snapshot.items.find((item) => item.code === 'fm_pickup')?.legacy_quantity;
    return {
      otherEarnings: amountForCode(snapshot.items, 'other_earnings'),
      fmPickupAmount: amountForCode(snapshot.items, 'fm_pickup'),
      deductions: amountForCode(snapshot.items, 'general_deductions'),
      lateOnhold: amountForCode(snapshot.items, 'late_onhold'),
      lateRemittance: amountForCode(snapshot.items, 'late_remittance'),
      absentWithoutNotice: amountForCode(snapshot.items, 'absent_without_notice'),
      definitions: snapshot.items,
      snapshotVersion: snapshot.version,
      ...(legacyFm == null ? {} : { legacyFmPickupCount: legacyFm }),
      ...(record.total_earnings_snapshot == null
        || record.total_deductions_snapshot == null
        || record.net_pay_snapshot == null
        ? {}
        : {
          totalsSnapshot: {
            totalEarnings: Number(record.total_earnings_snapshot),
            totalDeductions: Number(record.total_deductions_snapshot),
            netPay: Number(record.net_pay_snapshot),
          },
        }),
    };
  }

  return {
    ...normalizePayrollAdjustments({
      otherEarnings: record.other_earnings,
      fmPickupAmount: record.fm_pickup_amount ?? legacyFmPickupAmount(record.fm_pickup_count),
      deductions: record.deductions,
      lateOnhold: record.late_onhold,
      lateRemittance: record.late_remittance,
      absentWithoutNotice: record.absent_without_notice,
    }),
    ...(currentDefinitions ? { definitions: currentDefinitions } : {}),
  };
}

export function calculatePayrollAdjustmentTotals(
  grossPay: PayrollNumericValue,
  adjustments: PayrollAdjustmentsInput = {},
): PayrollAdjustmentTotals {
  const normalizedGrossPay = Number(grossPay ?? 0);
  const normalizedAdjustments = normalizePayrollAdjustments(adjustments);
  const fmPickupEarnings = normalizedAdjustments.fmPickupAmount;
  const totalEarnings = normalizedGrossPay + normalizedAdjustments.otherEarnings + fmPickupEarnings;
  const totalDeductions = normalizedAdjustments.deductions
    + normalizedAdjustments.lateOnhold
    + normalizedAdjustments.lateRemittance
    + normalizedAdjustments.absentWithoutNotice;

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
  const adjustments = payslipAdjustmentsFromRecord(record);
  const calculated = calculatePayrollAdjustmentTotals(record.gross_pay, adjustments);
  const isSubmitted = SUBMITTED_PAYROLL_STATUSES.has(String(record.status ?? '').toLowerCase());
  if (
    isSubmitted
    && record.adjustment_snapshot != null
    && record.total_earnings_snapshot != null
    && record.total_deductions_snapshot != null
    && record.net_pay_snapshot != null
  ) {
    return {
      ...calculated,
      totalEarnings: Number(record.total_earnings_snapshot),
      totalDeductions: Number(record.total_deductions_snapshot),
      netPay: Number(record.net_pay_snapshot),
    };
  }
  return calculated;
}

export function calculatePayslipNetPay(
  grossPay: number,
  adjustments: PayslipAdjustments,
): number {
  return calculatePayrollAdjustmentTotals(grossPay, adjustments).netPay;
}

export type DeductionCategory = 'attendance' | 'obligation' | 'penalty' | 'other';

export interface ItemizedDeductionLine {
  code: string;
  label: string;
  amount: number;
  category: DeductionCategory;
}

export interface PayrollWorksheetView {
  grossPay: number;
  otherEarnings: number;
  fmPickupEarnings: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  isSnapshot: boolean;
  snapshotVersion?: number;
  deductionsList: ItemizedDeductionLine[];
  adjustments: NormalizedPayslipAdjustments;
  totalsSnapshot?: {
    totalEarnings: number;
    totalDeductions: number;
    netPay: number;
  };
}

export function categorizeDeductionCode(code: string): DeductionCategory {
  const normalized = code.toLowerCase();
  if (normalized.includes('late') || normalized.includes('absent')) return 'attendance';
  if (normalized.includes('uniform') || normalized.includes('advance')) return 'obligation';
  if (normalized.includes('shortage') || normalized.includes('penalty')) return 'penalty';
  return 'other';
}

export function resolvePayrollWorksheet(
  record: PayrollAdjustmentRecord,
  currentDefinitions?: PayrollAdjustmentDefinitionLike[],
): PayrollWorksheetView {
  const totals = calculatePayrollRecordTotals(record);
  const adjustments = payslipAdjustmentsFromRecord(record, currentDefinitions);
  const isSubmitted = SUBMITTED_PAYROLL_STATUSES.has(String(record.status ?? '').toLowerCase());
  const snapshot = isSubmitted ? parseAdjustmentSnapshot(record.adjustment_snapshot) : null;

  const deductionsList: ItemizedDeductionLine[] = [];

  if (snapshot && Array.isArray(snapshot.items)) {
    snapshot.items.forEach((item) => {
      if (item.category === 'deduction' && (item.amount ?? 0) > 0) {
        deductionsList.push({
          code: item.code,
          label: item.label ?? 'Deduction Item',
          amount: Number(item.amount),
          category: categorizeDeductionCode(item.code),
        });
      }
    });
  }

  // Fallback to normalized adjustments if snapshot produced no deduction lines
  if (deductionsList.length === 0) {
    if (totals.adjustments.deductions > 0) {
      deductionsList.push({
        code: 'general_deductions',
        label: 'General Deductions',
        amount: totals.adjustments.deductions,
        category: 'other',
      });
    }
    if (totals.adjustments.lateOnhold > 0) {
      deductionsList.push({
        code: 'late_onhold',
        label: 'Late Onhold Penalty',
        amount: totals.adjustments.lateOnhold,
        category: 'attendance',
      });
    }
    if (totals.adjustments.lateRemittance > 0) {
      deductionsList.push({
        code: 'late_remittance',
        label: 'Late Remittance Penalty',
        amount: totals.adjustments.lateRemittance,
        category: 'penalty',
      });
    }
    if (totals.adjustments.absentWithoutNotice > 0) {
      deductionsList.push({
        code: 'absent_without_notice',
        label: 'Absent Without Notice',
        amount: totals.adjustments.absentWithoutNotice,
        category: 'attendance',
      });
    }
  }

  return {
    grossPay: totals.grossPay,
    otherEarnings: totals.otherEarnings,
    fmPickupEarnings: totals.fmPickupEarnings,
    totalEarnings: totals.totalEarnings,
    totalDeductions: totals.totalDeductions,
    netPay: totals.netPay,
    isSnapshot: Boolean(snapshot),
    snapshotVersion: snapshot?.version,
    deductionsList,
    adjustments: totals.adjustments,
    totalsSnapshot: adjustments.totalsSnapshot,
  };
}
