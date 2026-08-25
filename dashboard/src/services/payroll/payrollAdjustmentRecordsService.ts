import { supabase } from '../../lib/supabaseClient';
import type { Database, Json } from '../../types/supabase';

export type PayrollEarningAdjustment = Database['public']['Tables']['payroll_earning_adjustments']['Row'];
export type PayrollDeductionAllocation = Database['public']['Tables']['payroll_deduction_allocations']['Row'];
type BalanceRow = Database['public']['Views']['v_payroll_deduction_balances']['Row'];

export interface PayrollDeductionBalance extends BalanceRow {
  obligation_id: string;
  rider_id: string;
  hub_id: string;
  adjustment_code: string;
  display_name: string;
  original_amount: number;
  recovered: number;
  committed: number;
  planned: number;
  outstanding: number;
  available_to_allocate: number;
  status: string;
}

export interface EarningPlanInput {
  id?: string | null;
  adjustmentCode: 'other_earnings' | 'fm_pickup';
  amount: number;
  adjustmentDate: string;
  reason: string;
  reference?: string | null;
}

export interface AllocationPlanInput {
  obligationId: string;
  amount: number;
}

export interface SavePayrollAdjustmentPlanInput {
  payrollRecordId: string;
  earnings: EarningPlanInput[];
  allocations: AllocationPlanInput[];
  reason: string;
}

export type PayrollAdjustmentRecordCode =
  | 'general_deductions' | 'late_onhold' | 'late_remittance'
  | 'other_earnings' | 'fm_pickup';

export interface PayrollAdjustmentBatchItem {
  adjustmentCode: PayrollAdjustmentRecordCode;
  amount: number;
  adjustmentDate: string;
  reason: string;
  reference?: string | null;
  payrollRecordId?: string | null;
}

export interface EditablePayrollOption {
  id: string;
  rider_id: string;
  cutoff_start: string;
  cutoff_end: string;
  status: string;
}

function normalizeBalance(row: BalanceRow): PayrollDeductionBalance {
  return {
    ...row,
    obligation_id: row.obligation_id ?? '',
    rider_id: row.rider_id ?? '',
    hub_id: row.hub_id ?? '',
    adjustment_code: row.adjustment_code ?? '',
    display_name: row.display_name ?? row.adjustment_code ?? 'Deduction',
    original_amount: Number(row.original_amount ?? 0),
    recovered: Number(row.recovered ?? 0),
    committed: Number(row.committed ?? 0),
    planned: Number(row.planned ?? 0),
    outstanding: Number(row.outstanding ?? 0),
    available_to_allocate: Number(row.available_to_allocate ?? 0),
    status: row.status ?? 'open',
  };
}

export async function listPayrollDeductionBalances(): Promise<PayrollDeductionBalance[]> {
  const { data, error } = await supabase
    .from('v_payroll_deduction_balances')
    .select('*')
    .order('adjustment_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeBalance);
}

export async function listPayrollEarningAdjustments(payrollRecordId?: string): Promise<PayrollEarningAdjustment[]> {
  let query = supabase
    .from('payroll_earning_adjustments')
    .select('*')
    .is('voided_at', null)
    .order('adjustment_date', { ascending: false });
  if (payrollRecordId) query = query.eq('payroll_record_id', payrollRecordId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listPayrollDeductionAllocations(payrollRecordId: string): Promise<PayrollDeductionAllocation[]> {
  const { data, error } = await supabase
    .from('payroll_deduction_allocations')
    .select('*')
    .eq('payroll_record_id', payrollRecordId)
    .is('voided_at', null);
  if (error) throw error;
  return data ?? [];
}

export async function listDeductionAllocationHistory(obligationId: string): Promise<PayrollDeductionAllocation[]> {
  const { data, error } = await supabase
    .from('payroll_deduction_allocations')
    .select('*')
    .eq('deduction_obligation_id', obligationId)
    .order('cutoff_start', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listEditablePayrollOptions(): Promise<EditablePayrollOption[]> {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('id,rider_id,cutoff_start,cutoff_end,status')
    .in('status', ['draft', 'rejected'])
    .order('cutoff_start', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPayrollDeductionObligation(input: {
  riderId: string;
  adjustmentCode: 'general_deductions' | 'late_onhold' | 'late_remittance';
  originalAmount: number;
  adjustmentDate: string;
  reason: string;
  reference?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_payroll_deduction_obligation', {
    p_rider_id: input.riderId,
    p_adjustment_code: input.adjustmentCode,
    p_original_amount: input.originalAmount,
    p_adjustment_date: input.adjustmentDate,
    p_reason: input.reason.trim(),
    p_reference: input.reference?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

export async function createPayrollAdjustmentsBatch(input: {
  riderId: string;
  items: PayrollAdjustmentBatchItem[];
  reason: string;
}): Promise<Json> {
  const items = input.items.map((item) => ({
    adjustment_code: item.adjustmentCode,
    amount: item.amount,
    adjustment_date: item.adjustmentDate,
    reason: item.reason,
    reference: item.reference ?? null,
    payroll_record_id: item.payrollRecordId ?? null,
  }));
  const { data, error } = await supabase.rpc('create_payroll_adjustments_batch', {
    p_rider_id: input.riderId,
    p_items: items as Json,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
  return data;
}

export async function updatePayrollDeductionObligation(input: {
  obligationId: string;
  originalAmount: number;
  adjustmentDate: string;
  reason: string;
  reference?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_payroll_deduction_obligation', {
    p_obligation_id: input.obligationId,
    p_original_amount: input.originalAmount,
    p_adjustment_date: input.adjustmentDate,
    p_reason: input.reason.trim(),
    p_reference: input.reference?.trim() || undefined,
  });
  if (error) throw error;
}

export async function updatePayrollEarningAdjustment(input: {
  adjustmentId: string;
  amount: number;
  adjustmentDate: string;
  reason: string;
  reference?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('update_payroll_earning_adjustment', {
    p_adjustment_id: input.adjustmentId,
    p_amount: input.amount,
    p_adjustment_date: input.adjustmentDate,
    p_reason: input.reason.trim(),
    p_reference: input.reference?.trim() || undefined,
  });
  if (error) throw error;
}

export async function voidPayrollDeductionObligation(obligationId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('void_payroll_deduction_obligation', {
    p_obligation_id: obligationId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}

export async function savePayrollAdjustmentPlan(input: SavePayrollAdjustmentPlanInput): Promise<void> {
  const earnings = input.earnings.map((item) => ({
    id: item.id ?? null,
    adjustment_code: item.adjustmentCode,
    amount: item.amount,
    adjustment_date: item.adjustmentDate,
    reason: item.reason,
    reference: item.reference ?? null,
  }));
  const allocations = input.allocations
    .filter((item) => item.amount > 0)
    .map((item) => ({ obligation_id: item.obligationId, amount: item.amount }));
  const { error } = await supabase.rpc('save_payroll_adjustment_plan', {
    p_payroll_record_id: input.payrollRecordId,
    p_earnings: earnings as Json,
    p_allocations: allocations as Json,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
}

export async function deleteDraftPayrollRecord(recordId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('delete_draft_payroll_record', {
    p_payroll_record_id: recordId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}
