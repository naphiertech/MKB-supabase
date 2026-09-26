// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), role: 'admin' }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ session: { id: mock.role + '-account', role: mock.role, accountStatus: 'active', employmentStatus: 'active' } }) }));
vi.mock('../../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
vi.mock('../../hooks/useAttendanceContextVersion', () => ({ useAttendanceContextVersion: () => 'v1' }));
vi.mock('../../hooks/useToast', () => ({ appToast: { success: vi.fn() } }));
import { FinancialAbsencePanel } from './FinancialAbsencePanel';
import { FinancialAbsenceHistory } from './FinancialAbsenceHistory';

it('Admin decisions flow into sanitized Payroll and Rider reads through approved RPCs only', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  let state: 'confirmed' | 'reversed' | null = null;
  let obligation: string | null = null;
  const safeDecision = () => ({
    consequence_id: 'c1', rider_id: 'r1', rider_name: 'Juan', rider_code: 'MKB1', hub_id: 'h1', hub_name: 'Main',
    business_date: '2026-09-15', status: state, status_label: state === 'reversed' ? 'Financial penalty reversed' : 'Financial penalty confirmed',
    policy_penalty_amount: 875.25, applied_amount: 875.25, currency: 'PHP', deduction_obligation_id: obligation,
    obligation_status: obligation ? 'open' : null, obligation_outstanding: obligation ? 875.25 : null,
    obligation_available_to_allocate: obligation ? 875.25 : null, has_obligation: Boolean(obligation),
    reversal_earning_id: state === 'reversed' ? 'e1' : null, has_compensation: state === 'reversed', is_reversed: state === 'reversed',
  });
  // These are controlled server responses, not a simulation of database rules.
  mock.rpc.mockImplementation(async (name: string) => {
    if (name === 'list_rider_absence_financial_eligibility') return { error: null, data: [{
      rider_id: 'r1', business_date: '2026-09-15', assessment_status: 'unexcused', attendance_context_code: 'no_notice',
      assessment_policy_version_id: 'p2', notice_timeliness: 'no_notice', notice_days: null,
      financial_eligibility_reason: 'absence_without_prior_notice', requires_confirmation: state === null,
      existing_consequence_id: state ? 'c1' : null, existing_consequence_status: state, evaluation_mode: 'preview',
    }] };
    if (name === 'list_rider_absence_assessments') return { error: null, data: [{
      rider_id: 'r1', business_date: '2026-09-15', policy_version_id: 'p2', policy_version_number: 2, policy_type: 'official',
    }] };
    if (name === 'confirm_rider_absence_financial_consequence') { state = 'confirmed'; return { data: 'c1', error: null }; }
    if (name === 'materialize_absence_financial_deduction_obligation') { obligation = 'o1'; return { data: 'o1', error: null }; }
    if (name === 'reverse_rider_absence_financial_consequence') { state = 'reversed'; return { data: 'c1', error: null }; }
    if (name === 'list_rider_absence_financial_consequences_for_payroll' || name === 'list_my_absence_financial_consequences') {
      return { data: state ? [safeDecision()] : [], error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  async function click(name: string) {
    await act(async () => {
      const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!;
      expect(button, name).toBeDefined(); button.click();
    });
  }
  async function fill(label: string, value: string) {
    const l = [...host.querySelectorAll('label')].find(el => el.textContent === label)!;
    const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + l.htmlFor)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set?.call(field,value);
      field.dispatchEvent(new Event('input',{ bubbles: true }));
    });
  }
  async function submit() {
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit',{ bubbles: true, cancelable: true })); });
  }
  async function admin() {
    mock.role = 'admin';
    await act(async () => root.render(<FinancialAbsencePanel startDate="2026-09-01" endDate="2026-09-30" hubId="h1" riderNames={{ r1: 'Juan' }} />));
  }
  try {
    await admin(); await click('Confirm'); await fill('Supervisor / Attendance Monitor','Monitor'); await fill('Decision notes','Verified'); await submit();
    expect(host.textContent).toContain('Financial Penalty Confirmed');
    expect(mock.rpc.mock.calls.some(([name]) => name === 'materialize_absence_financial_deduction_obligation')).toBe(false);
    await click('Send to Payroll'); await submit(); expect(host.textContent).toContain('Payroll Obligation Created');

    mock.role = 'payroll';
    await act(async () => root.render(<FinancialAbsenceHistory audience="payroll" hubId="h1" hubs={[{ id: 'h1',name:'Main' }]} riders={[]} />));
    expect(host.textContent).toContain('Financial Penalty Confirmed'); expect(host.textContent).toContain('Payroll Obligation Created');
    expect(host.textContent).toContain('875.25');

    await admin(); await click('Reverse Decision'); await fill('Reversal reason','Corrected decision'); await submit();
    expect(host.textContent).toContain('Financial Penalty Reversed');
    mock.role = 'payroll';
    await act(async () => root.render(<FinancialAbsenceHistory audience="payroll" hubs={[]} riders={[]} />));
    expect(host.textContent).toContain('Financial Penalty Reversed');
    mock.role = 'rider';
    await act(async () => root.render(<FinancialAbsenceHistory audience="rider" />));
    expect(host.textContent).toContain('Financial Penalty Reversed'); expect(host.textContent).toContain('Compensation Recorded');
    expect(host.textContent).not.toMatch(/refund paid|deducted/i);
    expect(mock.rpc.mock.calls.find(([name]) => name === 'list_my_absence_financial_consequences')?.[1]).not.toHaveProperty('p_rider_id');
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc.mock.calls.filter(([name]) => !name.startsWith('list_')).map(([name]) => name)).toEqual([
      'confirm_rider_absence_financial_consequence','materialize_absence_financial_deduction_obligation','reverse_rider_absence_financial_consequence',
    ]);
  } finally { act(() => root.unmount()); host.remove(); }
});
