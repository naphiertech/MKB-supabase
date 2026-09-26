import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/exports/exportUtils';
import { listAbsenceAssessments, type AbsenceAssessmentStatus } from './absenceAssessmentService';

export type FinancialDecisionStatus = 'confirmed' | 'waived_emergency' | 'waived_excused' | 'reversed';
export type FinancialReason = 'absence_without_prior_notice' | 'denied_unauthorized_absence';
export type WaiverCategory = 'emergency' | 'excused';
export interface FinancialEligibilityRow {
  rider_id: string; business_date: string; hub_id: string | null;
  assessment_status: AbsenceAssessmentStatus | null; assessment_reason: string | null;
  attendance_context_code: string | null; expected_to_work: boolean; is_finalized: boolean;
  assessment_policy_version_id: string | null; notice_timeliness: 'timely' | 'late' | 'no_notice';
  notice_days: number | null; financial_eligibility_reason: FinancialReason | null;
  requires_confirmation: boolean; existing_consequence_id: string | null;
  existing_consequence_status: FinancialDecisionStatus | null; evaluation_mode: 'preview' | 'inactive';
}
export interface FinancialDecisionRow {
  consequence_id: string; rider_id: string; rider_name: string; rider_code: string;
  hub_id: string; hub_name: string; business_date: string; status: FinancialDecisionStatus;
  policy_penalty_amount: number; applied_amount: number; currency: string;
  deduction_obligation_id: string | null; obligation_status: string | null;
  obligation_outstanding: number | null; obligation_available_to_allocate: number | null;
  reversal_earning_id: string | null; has_compensation: boolean; is_reversed: boolean; decided_at: string;
}
export interface MyFinancialConsequenceRow {
  consequence_id: string; business_date: string; status: FinancialDecisionStatus; status_label: string;
  policy_penalty_amount: number; applied_amount: number; currency: string;
  has_obligation: boolean; is_reversed: boolean; has_compensation: boolean; decided_at: string;
}
export interface FinancialHistoryQuery {
  startDate: string; endDate: string; status?: FinancialDecisionStatus | null; page: number;
}
export interface PayrollFinancialHistoryQuery extends FinancialHistoryQuery {
  hubId?: string | null; riderId?: string | null;
}
export interface FinancialReviewRow extends FinancialEligibilityRow {
  policyApplicable: boolean;
  financial: FinancialDecisionRow | null;
}
export interface FinancialReviewQuery {
  startDate: string; endDate: string; hubId?: string | null; riderId?: string | null; page: number;
}
export interface FinancialDecisionInput {
  riderId: string; businessDate: string; confirmationKey: string;
  supervisorName: string; decisionNotes: string; evidenceReference?: string;
}
export const FINANCIAL_PAGE_SIZE = 25;
export const FINANCIAL_REASON_LABELS: Record<FinancialReason, string> = {
  absence_without_prior_notice: 'Absence Without Prior Notice',
  denied_unauthorized_absence: 'Unauthorized Absence After Denied Request',
};
export const FINANCIAL_STATUS_LABELS: Record<FinancialDecisionStatus, string> = {
  confirmed: 'Financial Penalty Confirmed', waived_emergency: 'Penalty Waived',
  waived_excused: 'Penalty Waived', reversed: 'Financial Penalty Reversed',
};
export const COMPENSATION_RECORDED_LABEL = 'Compensation Recorded';
export function formatFinancialAmount(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(Number(value))) return 'Not available';
  return currency === 'PHP' ? formatCurrency(Number(value))
    : `${currency} ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const DOMAIN_MESSAGES: Record<string, string> = {
  ACTIVE_OFFICIAL_V2_REQUIRED: 'Financial Policy V2 is not active for this date.',
  ABSENCE_ALREADY_DECIDED: 'This absence already has a financial decision.',
  CONFIRMATION_KEY_CONFLICT: 'This decision request conflicts with an existing submission. Refresh and try again.',
  ABSENCE_NOT_ELIGIBLE: 'This absence is no longer eligible for a financial decision. Refresh to see its current state.',
  ABSENCE_REVERSAL_PAYROLL_LOCKED: 'This penalty is linked to locked Payroll and cannot be reversed until the Payroll workflow permits correction.',
  ABSENCE_REVERSAL_COMPENSATION_TARGET_REQUIRED: 'A valid future Payroll record is required before the paid penalty can be compensated.',
  ABSENCE_REVERSAL_CONFLICT: 'This decision already has a different reversal. Refresh to see the recorded result.',
  ABSENCE_REVERSAL_STATE_CHANGED: 'Payroll changed while this request was being processed. Refresh and try again.',
  POLICY_AMOUNT_REQUIRED: 'The applicable policy amount is not configured. Contact your administrator.',
};
class FinancialServiceError extends Error {}
export function financialErrorMessage(error: unknown): string {
  if (error instanceof FinancialServiceError) return error.message;
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  for (const [code, safe] of Object.entries(DOMAIN_MESSAGES)) {
    if (message.includes(code)) return safe;
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === '42501') {
    return 'Your account is not authorized to perform this action.';
  }
  return 'Unable to complete the financial request. Refresh and try again, or contact your administrator.';
}
export function financialReadErrorMessage(error: unknown): string {
  const safe = financialErrorMessage(error);
  return safe.startsWith('Unable to complete the financial request.')
    ? 'Something went wrong while loading financial absence information. Please try again.' : safe;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data as T;
  } catch (error) {
    throw new FinancialServiceError(financialErrorMessage(error));
  }
}
export async function listFinancialEligibility(input: FinancialReviewQuery): Promise<FinancialEligibilityRow[]> {
  return (await rpc<FinancialEligibilityRow[]>('list_rider_absence_financial_eligibility', {
    p_start_date: input.startDate, p_end_date: input.endDate, p_hub_id: input.hubId ?? null,
    p_rider_id: input.riderId ?? null, p_limit: FINANCIAL_PAGE_SIZE,
    p_offset: input.page * FINANCIAL_PAGE_SIZE, p_preview: true,
  })) ?? [];
}
export async function listFinancialDecisionsForAdmin(
  input: Omit<FinancialReviewQuery, 'page'>,
): Promise<FinancialDecisionRow[]> {
  return (await rpc<FinancialDecisionRow[]>('list_rider_absence_financial_consequences_for_payroll', {
    p_start_date: input.startDate, p_end_date: input.endDate, p_hub_id: input.hubId ?? null,
    p_rider_id: input.riderId ?? null, p_status: null, p_limit: 500, p_offset: 0,
  })) ?? [];
}
export async function listFinancialConsequencesForPayroll(input: PayrollFinancialHistoryQuery): Promise<FinancialDecisionRow[]> {
  return (await rpc<FinancialDecisionRow[]>('list_rider_absence_financial_consequences_for_payroll', {
    p_start_date: input.startDate, p_end_date: input.endDate, p_hub_id: input.hubId ?? null,
    p_rider_id: input.riderId ?? null, p_status: input.status ?? null,
    p_limit: FINANCIAL_PAGE_SIZE, p_offset: input.page * FINANCIAL_PAGE_SIZE,
  })) ?? [];
}
export async function listMyFinancialConsequences(input: FinancialHistoryQuery): Promise<MyFinancialConsequenceRow[]> {
  return (await rpc<MyFinancialConsequenceRow[]>('list_my_absence_financial_consequences', {
    p_start_date: input.startDate, p_end_date: input.endDate, p_status: input.status ?? null,
    p_limit: FINANCIAL_PAGE_SIZE, p_offset: input.page * FINANCIAL_PAGE_SIZE,
  })) ?? [];
}
export async function loadFinancialAbsencePage(
  input: FinancialReviewQuery, role: 'admin' | 'hr',
): Promise<FinancialReviewRow[]> {
  try {
    const rows = await listFinancialEligibility(input);
    // Per-Rider reads stay bounded by the 32-day window (at most 32 decisions).
    // Independent RPC pagination/orderings must never be zipped by row index.
    const candidates = [...new Set(rows.filter(r => r.requires_confirmation && r.financial_eligibility_reason).map(r => r.rider_id))];
    const decided = role === 'admin' ? [...new Set(rows.filter(r => r.existing_consequence_id).map(r => r.rider_id))] : [];
    const [policies, decisions] = await Promise.all([
      Promise.all(candidates.map(riderId => listAbsenceAssessments({ ...input, riderId, assessmentStatus: null, limit: 500, offset: 0 }))),
      Promise.all(decided.map(riderId => listFinancialDecisionsForAdmin({ ...input, riderId }))),
    ]);
    const policyRows = policies.flat();
    const financialRows = decisions.flat();
    return rows.map(row => ({
      ...row,
      // Presentation gate from published server metadata, never a substitute
      // for Phase 3 authorization, effective-policy validation, or eligibility.
      policyApplicable: policyRows.some(p => p.riderId === row.rider_id && p.businessDate === row.business_date
        && p.policyVersionId === row.assessment_policy_version_id && p.policyVersionNumber === 2 && p.policyType === 'official'),
      financial: financialRows.find(d => d.consequence_id === row.existing_consequence_id) ?? null,
    }));
  } catch (error) {
    throw new FinancialServiceError(financialErrorMessage(error));
  }
}
function decisionArgs(input: FinancialDecisionInput) {
  return {
    p_rider_id: input.riderId, p_business_date: input.businessDate,
    p_confirmation_key: input.confirmationKey, p_supervisor_name: input.supervisorName.trim(),
    p_decision_notes: input.decisionNotes.trim(), p_evidence_reference: input.evidenceReference?.trim() || null,
  };
}
export function confirmAbsenceFinancialDecision(input: FinancialDecisionInput): Promise<string> {
  return rpc<string>('confirm_rider_absence_financial_consequence', decisionArgs(input));
}
export function waiveAbsenceFinancialDecision(input: FinancialDecisionInput & { category: WaiverCategory }): Promise<string> {
  return rpc<string>('waive_rider_absence_financial_consequence', { ...decisionArgs(input), p_waiver_reason_category: input.category });
}
export function sendAbsenceToPayroll(consequenceId: string): Promise<string> {
  return rpc<string>('materialize_absence_financial_deduction_obligation', { p_consequence_id: consequenceId });
}
export function reverseAbsenceFinancialDecision(consequenceId: string, reason: string, evidenceReference?: string): Promise<string> {
  return rpc<string>('reverse_rider_absence_financial_consequence', {
    p_consequence_id: consequenceId, p_reversal_reason: reason.trim(), p_evidence_reference: evidenceReference?.trim() || null,
  });
}
