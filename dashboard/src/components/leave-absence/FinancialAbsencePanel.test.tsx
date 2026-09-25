// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: 'admin', online: true, load: vi.fn(), confirm: vi.fn(), waive: vi.fn(), send: vi.fn(), reverse: vi.fn(), toast: vi.fn(),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ session: { id: 'staff', role: mocks.role } }) }));
vi.mock('../../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mocks.online }));
vi.mock('../../hooks/useAttendanceContextVersion', () => ({ useAttendanceContextVersion: () => 'v1' }));
vi.mock('../../hooks/useToast', () => ({ appToast: { success: mocks.toast } }));
vi.mock('../../services/attendance/absenceFinancialService', async () => ({
  ...await vi.importActual<typeof import('../../services/attendance/absenceFinancialService')>('../../services/attendance/absenceFinancialService'),
  loadFinancialAbsencePage: mocks.load, confirmAbsenceFinancialDecision: mocks.confirm,
  waiveAbsenceFinancialDecision: mocks.waive, sendAbsenceToPayroll: mocks.send, reverseAbsenceFinancialDecision: mocks.reverse,
}));
import { FinancialAbsencePanel } from './FinancialAbsencePanel';
import type { FinancialReviewRow, FinancialDecisionRow } from '../../services/attendance/absenceFinancialService';
const candidate: FinancialReviewRow = {
  rider_id: 'r1', business_date: '2026-09-15', hub_id: 'h1', assessment_status: 'unexcused',
  assessment_reason: 'no_notice', attendance_context_code: 'no_notice', expected_to_work: true, is_finalized: true,
  assessment_policy_version_id: 'p2', notice_timeliness: 'no_notice', notice_days: null,
  financial_eligibility_reason: 'absence_without_prior_notice', requires_confirmation: true,
  existing_consequence_id: null, existing_consequence_status: null, evaluation_mode: 'preview', policyApplicable: true, financial: null,
};
const financial: FinancialDecisionRow = {
  consequence_id: 'c1', rider_id: 'r1', rider_name: 'Juan', rider_code: 'MKB1', hub_id: 'h1', hub_name: 'Main',
  business_date: candidate.business_date, status: 'confirmed', policy_penalty_amount: 725.5, applied_amount: 725.5,
  currency: 'PHP', deduction_obligation_id: null, obligation_status: null, obligation_outstanding: null,
  obligation_available_to_allocate: null, reversal_earning_id: null, has_compensation: false, is_reversed: false, decided_at: '2026-09-15',
};
const decided: FinancialReviewRow = { ...candidate, requires_confirmation: false, existing_consequence_id: 'c1', existing_consequence_status: 'confirmed', financial };
let container: HTMLDivElement, root: Root;
function buttons(label: string) { return [...container.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent?.trim() === label); }
async function click(label: string) { await act(async () => { const b = buttons(label)[0]; expect(b, label).toBeDefined(); b.click(); }); }
async function fill(label: string, value: string) {
  const l = [...container.querySelectorAll('label')].find(x => x.textContent === label)!;
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('#' + l.htmlFor)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit() { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }
async function render(hubId = 'h1') {
  await act(async () => root.render(<FinancialAbsencePanel startDate="2026-09-01" endDate="2026-09-30" hubId={hubId} riderNames={{ r1: 'Juan' }} />));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); mocks.role = 'admin'; mocks.online = true;
  mocks.load.mockResolvedValue([candidate]); mocks.confirm.mockResolvedValue('c1'); mocks.waive.mockResolvedValue('c1');
  mocks.send.mockResolvedValue('o1'); mocks.reverse.mockResolvedValue('c1');
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
describe('Admin/HR financial absence workflow', () => {
  it('renders server assessment, notice timing, eligibility and derived Pending Confirmation', async () => {
    await render(); expect(container.textContent).toContain('Juan');
    expect(container.textContent).toContain('Unexcused'); expect(container.textContent).toContain('No notice');
    expect(container.textContent).toContain('Absence Without Prior Notice'); expect(container.textContent).toContain('Pending Confirmation');
  });
  it('clearly marks inactive preview and disables financial decisions', async () => {
    mocks.load.mockResolvedValue([{ ...candidate, policyApplicable: false }]); await render();
    expect(container.textContent).toContain('Preview / Not active');
    expect(buttons('Confirm')[0].disabled).toBe(true); expect(buttons('Waive')[0].disabled).toBe(true);
  });
  it('non-eligible rows have no Confirm/Waive actions', async () => {
    mocks.load.mockResolvedValue([{ ...candidate, financial_eligibility_reason: null, requires_confirmation: false }]); await render();
    expect(buttons('Confirm')).toHaveLength(0); expect(buttons('Waive')).toHaveLength(0);
  });
  it('HR sees eligible Confirm/Waive but no Admin actions', async () => {
    mocks.role = 'hr'; mocks.load.mockResolvedValue([candidate, { ...decided, business_date: '2026-09-16', financial: null }]); await render();
    expect(buttons('Confirm')[0].disabled).toBe(false); expect(buttons('Waive')[0].disabled).toBe(false);
    expect(buttons('Send to Payroll')).toHaveLength(0); expect(buttons('Reverse Decision')).toHaveLength(0);
  });
  it('Confirm validates required fields before invoking the service', async () => {
    await render(); await click('Confirm'); await submit();
    expect(mocks.confirm).not.toHaveBeenCalled(); expect(container.textContent).toContain('Supervisor name and decision notes are required');
  });
  it('Confirm sends human inputs and a retry key, then refreshes the persisted decision', async () => {
    await render(); await click('Confirm'); await fill('Supervisor / Attendance Monitor', 'Monitor'); await fill('Decision notes', 'Checked');
    mocks.load.mockResolvedValue([decided]); await submit();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ riderId: 'r1', businessDate: candidate.business_date, supervisorName: 'Monitor', decisionNotes: 'Checked', confirmationKey: expect.any(String) }));
    expect(mocks.confirm.mock.calls[0][0]).not.toHaveProperty('amount'); expect(mocks.send).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Financial Penalty Confirmed'); expect(container.textContent).not.toContain('Pending Confirmation');
  });
  it('blocks duplicate submission synchronously while pending', async () => {
    let finish!: (id: string) => void; mocks.confirm.mockReturnValue(new Promise<string>(r => { finish = r; }));
    await render(); await click('Confirm'); await fill('Supervisor / Attendance Monitor', 'Monitor'); await fill('Decision notes', 'Checked');
    await submit(); await submit(); expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async () => finish('c1'));
  });
  it('reuses confirmation key for an unchanged failed submission', async () => {
    mocks.confirm.mockRejectedValue(new Error('Network failed'));
    await render(); await click('Confirm'); await fill('Supervisor / Attendance Monitor', 'Monitor'); await fill('Decision notes', 'Checked');
    await submit(); await submit();
    expect(mocks.confirm.mock.calls[0][0].confirmationKey).toBe(mocks.confirm.mock.calls[1][0].confirmationKey);
  });
  it.each(['emergency', 'excused'])('Waive permits controlled %s category', async category => {
    await render(); await click('Waive');
    const select = container.querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map(o => o.value)).toEqual(['emergency', 'excused']);
    await fill('Waiver category', category); await fill('Supervisor / Attendance Monitor', 'Monitor'); await fill('Decision notes', 'Proof reviewed');
    await submit(); expect(mocks.waive).toHaveBeenCalledWith(expect.objectContaining({ category }));
  });
  it('Admin can separately materialize a confirmed decision', async () => {
    mocks.load.mockResolvedValue([decided]); await render(); await click('Send to Payroll'); await submit();
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith('c1'); expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('shows created obligation without claiming deduction', async () => {
    mocks.load.mockResolvedValue([{ ...decided, financial: { ...financial, deduction_obligation_id: 'o1', obligation_status: 'open' } }]); await render();
    expect(container.textContent).toContain('Payroll Obligation Created'); expect(buttons('Send to Payroll')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/already deducted/i);
  });
  it('does not offer materialization when Admin obligation state is unknown', async () => {
    mocks.load.mockResolvedValue([{ ...decided, financial: null }]); await render(); expect(buttons('Send to Payroll')).toHaveLength(0);
  });
  it('renders the amount supplied by the backend rather than 500', async () => {
    mocks.load.mockResolvedValue([decided]); await render(); expect(container.textContent).toContain('725.50'); expect(container.textContent).not.toContain('500.00');
  });
  it('requires reversal reason and a deliberate dialog submission', async () => {
    mocks.load.mockResolvedValue([decided]); await render(); await click('Reverse Decision');
    expect(mocks.reverse).not.toHaveBeenCalled(); await submit(); expect(mocks.reverse).not.toHaveBeenCalled();
    await fill('Reversal reason', 'Incorrect attendance'); await fill('Evidence reference (optional)', 'Proof'); await submit();
    expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith('c1', 'Incorrect attendance', 'Proof');
  });
  it.each([
    ['ABSENCE_REVERSAL_PAYROLL_LOCKED', 'linked to locked Payroll'],
    ['ABSENCE_REVERSAL_COMPENSATION_TARGET_REQUIRED', 'valid future Payroll record'],
  ])('renders safe reversal error %s', async (code, expected) => {
    mocks.reverse.mockRejectedValue({ message: code + ': SQL SECRET' }); mocks.load.mockResolvedValue([decided]);
    await render(); await click('Reverse Decision'); await fill('Reversal reason', 'Correction'); await submit();
    expect(container.textContent).toContain(expected); expect(container.textContent).not.toContain('SECRET');
  });
  it('shows inactive policy failure safely and blocks further attempts', async () => {
    mocks.confirm.mockRejectedValue({ message: 'ACTIVE_OFFICIAL_V2_REQUIRED: SECRET' });
    await render(); await click('Confirm'); await fill('Supervisor / Attendance Monitor', 'Monitor'); await fill('Decision notes', 'Checked'); await submit();
    expect(container.textContent).toContain('Financial Policy V2 is not active for this date.'); expect(container.textContent).not.toContain('SECRET');
  });
  it('uses a generic safe retry message for unknown database failures', async () => {
    mocks.load.mockRejectedValue(new Error('SQL SECRET')); await render();
    expect(container.textContent).toContain('Unable to complete'); expect(container.textContent).not.toContain('SECRET');
    mocks.load.mockResolvedValue([candidate]); await click('Retry'); expect(container.textContent).toContain('Juan');
  });
  it('renders loading and empty states', async () => {
    let done!: (rows: FinancialReviewRow[]) => void; mocks.load.mockReturnValue(new Promise<FinancialReviewRow[]>(r => { done = r; }));
    await render(); expect(container.textContent).toContain('Loading financial review');
    await act(async () => done([])); expect(container.textContent).toContain('No financial review rows');
  });
  it('keeps mobile actions in flowing cards and reuses the accessible dialog', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    await render(); expect(container.querySelector('article')).not.toBeNull(); await click('Confirm');
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true'); expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('does not read or offer financial actions offline', async () => {
    mocks.online = false; await render();
    expect(container.textContent).toContain('Financial review is unavailable offline');
    expect(buttons('Confirm')).toHaveLength(0); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('does not start a refresh when an in-flight decision completes offline', async () => {
    let done!: (id: string) => void;
    mocks.confirm.mockReturnValue(new Promise<string>(resolve => { done = resolve; }));
    await render(); await click('Confirm'); await fill('Supervisor / Attendance Monitor', 'Monitor'); await fill('Decision notes', 'Checked');
    await submit(); const reads = mocks.load.mock.calls.length;
    mocks.online = false; await render();
    await act(async () => done('c1'));
    expect(mocks.load).toHaveBeenCalledTimes(reads);
    expect(container.textContent).toContain('Financial review is unavailable offline');
  });
  it('rejects stale reads after switching hubs', async () => {
    let done!: (rows: FinancialReviewRow[]) => void; mocks.load.mockReturnValueOnce(new Promise<FinancialReviewRow[]>(r => { done = r; }));
    await render('h1'); mocks.load.mockResolvedValue([]); await render('h2');
    await act(async () => done([candidate])); expect(container.textContent).not.toContain('Juan');
  });
  it('denies non-staff roles without financial requests', async () => {
    mocks.role = 'payroll'; await render(); expect(mocks.load).not.toHaveBeenCalled(); expect(buttons('Confirm')).toHaveLength(0);
  });
});
