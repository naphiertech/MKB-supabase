import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/supabase';
import type { PayrollAdjustmentCode, PayrollAdjustmentDefinitionLike } from '../../lib/payroll/payrollAdjustments';

export type PayrollAdjustmentDefinition = Database['public']['Tables']['payroll_adjustment_definitions']['Row'];
export type PayrollAdjustmentDefinitionAudit = Database['public']['Tables']['payroll_adjustment_definition_audit']['Row'];

export interface PayrollAdjustmentDefinitionAuditWithPerson extends PayrollAdjustmentDefinitionAudit {
  changedByName: string;
}

export interface UpdatePayrollAdjustmentDefinitionInput {
  code: PayrollAdjustmentCode;
  displayName: string;
  active: boolean;
  reason: string;
}

const DEFINITION_ORDER: PayrollAdjustmentCode[] = [
  'other_earnings',
  'fm_pickup',
  'general_deductions',
  'late_onhold',
  'late_remittance',
];

export async function listPayrollAdjustmentDefinitions(): Promise<PayrollAdjustmentDefinition[]> {
  const { data, error } = await supabase
    .from('payroll_adjustment_definitions')
    .select('*')
    .order('code');
  if (error) throw error;
  const order = new Map(DEFINITION_ORDER.map((code, index) => [code, index]));
  return [...(data ?? [])].sort((left, right) =>
    (order.get(left.code as PayrollAdjustmentCode) ?? 99)
    - (order.get(right.code as PayrollAdjustmentCode) ?? 99));
}

export async function listPayrollAdjustmentDefinitionAudit(): Promise<PayrollAdjustmentDefinitionAuditWithPerson[]> {
  const { data, error } = await supabase
    .from('payroll_adjustment_definition_audit')
    .select('*, users:changed_by(full_name)')
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    changedByName: (row.users as { full_name?: string } | null)?.full_name || 'System',
  }));
}

export async function updatePayrollAdjustmentDefinition(
  input: UpdatePayrollAdjustmentDefinitionInput,
): Promise<void> {
  if (!input.displayName.trim()) throw new Error('Display name is required.');
  if (!input.reason.trim()) throw new Error('Change reason is required.');
  const { error } = await supabase.rpc('update_payroll_adjustment_definition', {
    p_code: input.code,
    p_display_name: input.displayName.trim(),
    p_active: input.active,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
}

export function toPayrollAdjustmentDefinitionLike(
  definition: PayrollAdjustmentDefinition,
): PayrollAdjustmentDefinitionLike {
  return {
    code: definition.code as PayrollAdjustmentCode,
    label: definition.display_name,
    category: definition.category as 'earning' | 'deduction',
    input_mode: 'manual_amount',
    active: definition.active,
  };
}
