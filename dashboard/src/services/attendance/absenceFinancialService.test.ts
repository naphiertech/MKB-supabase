import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), assessments: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./absenceAssessmentService', () => ({ listAbsenceAssessments: mocks.assessments }));
import { confirmAbsenceFinancialDecision, waiveAbsenceFinancialDecision, sendAbsenceToPayroll,
  reverseAbsenceFinancialDecision, loadFinancialAbsencePage, financialErrorMessage } from './absenceFinancialService';

const input = { riderId: 'r1', businessDate: '2026-09-15', confirmationKey: 'key', supervisorName: 'Monitor', decisionNotes: 'Verified', evidenceReference: 'Proof' };
const row = { rider_id: 'r1', business_date: '2026-09-15', assessment_policy_version_id: 'p2', financial_eligibility_reason: 'absence_without_prior_notice', requires_confirmation: true, existing_consequence_id: null };
beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockResolvedValue({ data: 'id', error: null }); mocks.assessments.mockResolvedValue([]); });
describe('absence financial RPC contracts', () => {
  it('confirms with only human inputs and never materializes automatically', async () => {
    await confirmAbsenceFinancialDecision({ ...input, amount: 999 } as typeof input);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('confirm_rider_absence_financial_consequence', {
      p_rider_id: 'r1', p_business_date: '2026-09-15', p_confirmation_key: 'key', p_supervisor_name: 'Monitor', p_decision_notes: 'Verified', p_evidence_reference: 'Proof',
    });
  });
  it.each(['emergency', 'excused'] as const)('waives using controlled %s category', async category => {
    await waiveAbsenceFinancialDecision({ ...input, category });
    expect(mocks.rpc).toHaveBeenCalledWith('waive_rider_absence_financial_consequence', expect.objectContaining({ p_waiver_reason_category: category }));
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_applied_amount');
  });
  it('uses the separate Admin-only materialization RPC', async () => {
    await sendAbsenceToPayroll('c1');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('materialize_absence_financial_deduction_obligation', { p_consequence_id: 'c1' });
  });
  it('reverses without passing operational or monetary fields', async () => {
    await reverseAbsenceFinancialDecision('c1', 'Correction', 'Proof');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('reverse_rider_absence_financial_consequence', { p_consequence_id: 'c1', p_reversal_reason: 'Correction', p_evidence_reference: 'Proof' });
  });
  it('loads preview and enables decisions only from matching official V2 metadata', async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.assessments.mockResolvedValue([{ riderId: 'r1', businessDate: row.business_date, policyVersionId: 'p2', policyVersionNumber: 2, policyType: 'official' }]);
    const result = await loadFinancialAbsencePage({ startDate: row.business_date, endDate: row.business_date, hubId: 'h1', page: 0 }, 'hr');
    expect(result[0].policyApplicable).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('list_rider_absence_financial_eligibility', expect.objectContaining({ p_preview: true, p_hub_id: 'h1', p_limit: 25, p_offset: 0 }));
  });
  it('fails closed when policy metadata is provisional or mismatched', async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.assessments.mockResolvedValue([{ riderId: 'r1', businessDate: row.business_date, policyVersionId: 'p1', policyVersionNumber: 1, policyType: 'provisional' }]);
    expect((await loadFinancialAbsencePage({ startDate: row.business_date, endDate: row.business_date, page: 0 }, 'hr'))[0].policyApplicable).toBe(false);
  });
  it('HR never invokes the Admin/Payroll read projection', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...row, requires_confirmation: false, existing_consequence_id: 'c1', existing_consequence_status: 'confirmed' }], error: null });
    const result = await loadFinancialAbsencePage({ startDate: row.business_date, endDate: row.business_date, page: 0 }, 'hr');
    expect(result[0].financial).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('Admin reads obligation data only through the approved RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...row, requires_confirmation: false, existing_consequence_id: 'c1' }], error: null })
      .mockResolvedValueOnce({ data: [{ consequence_id: 'c1', deduction_obligation_id: 'o1' }], error: null });
    const result = await loadFinancialAbsencePage({ startDate: row.business_date, endDate: row.business_date, page: 0 }, 'admin');
    expect(result[0].financial?.deduction_obligation_id).toBe('o1');
    expect(mocks.rpc.mock.calls[1][0]).toBe('list_rider_absence_financial_consequences_for_payroll');
  });
  it('sanitizes transport and SQL errors in wrappers', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SQL SECRET stack trace' } });
    await expect(sendAbsenceToPayroll('c1')).rejects.toThrow('Unable to complete');
    expect(financialErrorMessage(new Error('SQL SECRET'))).not.toContain('SECRET');
  });
  it.each([
    ['ACTIVE_OFFICIAL_V2_REQUIRED', 'Financial Policy V2 is not active for this date.'],
    ['ABSENCE_ALREADY_DECIDED', 'This absence already has a financial decision.'],
    ['CONFIRMATION_KEY_CONFLICT', 'This decision request conflicts with an existing submission. Refresh and try again.'],
    ['ABSENCE_REVERSAL_PAYROLL_LOCKED', 'This penalty is linked to locked Payroll and cannot be reversed until the Payroll workflow permits correction.'],
    ['ABSENCE_REVERSAL_COMPENSATION_TARGET_REQUIRED', 'A valid future Payroll record is required before the paid penalty can be compensated.'],
  ])('maps %s without raw server text', (code, message) => expect(financialErrorMessage({ message: code + ': secret SQL' })).toBe(message));
});
