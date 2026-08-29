import { supabase } from '../../lib/supabaseClient';
import { isPayrollPayable, getPayableDate } from '../../lib/payroll/payrollCalendar';

export interface PayrollTransitionRecordVersion {
  id: string;
  status: string;
  updated_at: string;
}

export interface PayrollBulkSelectionContext {
  cutoffStart?: string;
  cutoffEnd?: string;
}

export interface PayrollBulkSelectionState {
  count: number;
  canApprove: boolean;
  canMarkPaid: boolean;
  feedback: string | null;
}

export interface PayrollBulkTransitionResult {
  operation_id: string;
  request_id: string;
  operation: 'approve' | 'pay';
  processed_count: number;
  record_ids: string[];
  replayed: boolean;
}

interface PayrollBulkTransitionInput {
  records: PayrollTransitionRecordVersion[];
  cutoffStart: string;
  cutoffEnd: string;
  requestId: string;
}

export function getPayrollBulkSelectionState(
  records: readonly PayrollTransitionRecordVersion[],
  context?: PayrollBulkSelectionContext
): PayrollBulkSelectionState {
  const count = records.length;
  const canApprove = count > 0 && records.every((record) => record.status === 'pending');
  let canMarkPaid = count > 0 && records.every((record) => record.status === 'approved');
  let feedback: string | null = null;

  if (count > 0 && !canApprove && !canMarkPaid) {
    feedback = 'Select only Pending Review records to approve, or only Approved records to mark as Paid.';
  } else if (canMarkPaid && context?.cutoffStart && context?.cutoffEnd) {
    if (!isPayrollPayable(context.cutoffStart, context.cutoffEnd)) {
      canMarkPaid = false;
      const payableDate = getPayableDate(context.cutoffStart, context.cutoffEnd);
      feedback = payableDate
        ? `Payroll cannot be marked as Paid before earliest pay date (${payableDate}).`
        : null;
    }
  }

  return {
    count,
    canApprove,
    canMarkPaid,
    feedback,
  };
}

function controlledPayrollError(error: { message?: string } | null): Error {
  const match = error?.message?.match(/^PAYROLL_(?:BULK_)?[A-Z_]+:\s*(.+)$/s);
  if (match?.[1]) return new Error(match[1]);
  return new Error('The payroll action could not be completed. Refresh the list and try again.');
}

async function executePayrollBulkTransition(
  rpcName: 'bulk_approve_payroll_records' | 'bulk_mark_payroll_records_paid',
  input: PayrollBulkTransitionInput,
): Promise<PayrollBulkTransitionResult> {
  if (input.records.length === 0) throw new Error('Select at least one payroll record.');

  const { data, error } = await supabase.rpc(rpcName, {
    p_records: input.records.map(({ id, updated_at }) => ({ id, updated_at })),
    p_cutoff_start: input.cutoffStart,
    p_cutoff_end: input.cutoffEnd,
    p_request_id: input.requestId,
  });

  if (error) throw controlledPayrollError(error);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The payroll action returned an invalid response. Refresh the list before retrying.');
  }
  return data as unknown as PayrollBulkTransitionResult;
}

export function bulkApprovePayrollRecords(
  input: PayrollBulkTransitionInput,
): Promise<PayrollBulkTransitionResult> {
  return executePayrollBulkTransition('bulk_approve_payroll_records', input);
}

export function bulkMarkPayrollRecordsPaid(
  input: PayrollBulkTransitionInput,
): Promise<PayrollBulkTransitionResult> {
  return executePayrollBulkTransition('bulk_mark_payroll_records_paid', input);
}
