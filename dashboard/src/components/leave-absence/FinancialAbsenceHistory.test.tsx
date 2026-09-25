// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), online: true, role: 'payroll', owner: 'user-1' }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('../../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => mocks.online }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ session: {
  id: mocks.owner, role: mocks.role, accountStatus: 'active', employmentStatus: 'active',
} }) }));
import { FinancialAbsenceHistory } from './FinancialAbsenceHistory';
import { FINANCIAL_STATUS_LABELS } from '../../services/attendance/absenceFinancialService';
const base = {
  consequence_id: 'c1', rider_id: 'r1', rider_name: 'Juan', rider_code: 'MKB1', hub_id: 'h1', hub_name: 'Historical Hub',
  business_date: '2026-09-15', status: 'confirmed', status_label: 'Financial penalty confirmed',
  policy_penalty_amount: 725.5, applied_amount: 725.5, currency: 'PHP',
  deduction_obligation_id: 'o1', obligation_status: 'open', obligation_outstanding: 725.5, obligation_available_to_allocate: 725.5,
  reversal_earning_id: null, has_obligation: true, has_compensation: false, is_reversed: false, decided_at: '2026-09-15',
  supervisor_name: 'SECRET SUPERVISOR', decision_notes: 'SECRET NOTES', evidence_reference: 'SECRET EVIDENCE',
  reversal_evidence_reference: 'SECRET REVERSAL', decided_by: 'SECRET REVIEWER', audit: { note: 'SECRET AUDIT' },
};
let root: Root, container: HTMLDivElement;
const btn = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name)!;
async function click(name: string) { await act(async () => btn(name).click()); }
async function change(label: string, value: string) {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function mount(audience: 'payroll' | 'rider', hubId = 'h1') {
  await act(async () => root.render(audience === 'payroll'
    ? <FinancialAbsenceHistory audience="payroll" hubId={hubId} hubs={[{ id: 'h1', name: 'Historical Hub' }, { id: 'h2', name: 'Other Hub' }]} riders={[{ id: 'r1', name: 'Juan' }]} />
    : <FinancialAbsenceHistory audience="rider" />));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks(); mocks.online = true; mocks.role = 'payroll'; mocks.owner = 'user-1';
  mocks.rpc.mockResolvedValue({ data: [base], error: null });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

for (const audience of ['payroll', 'rider'] as const) describe(`${audience} safe financial history`, () => {
  beforeEach(() => { mocks.role = audience; });
  it('loads only the approved sanitized read RPC', async () => {
    await mount(audience);
    expect(mocks.rpc.mock.calls[0][0]).toBe(audience === 'payroll' ? 'list_rider_absence_financial_consequences_for_payroll' : 'list_my_absence_financial_consequences');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.every(([name]) => name.startsWith('list_'))).toBe(true);
  });
  it('renders the server amount rather than hardcoded 500', async () => {
    await mount(audience); expect(container.textContent).toContain('725.50'); expect(container.textContent).not.toContain('500.00');
  });
  it.each(['confirmed','waived_emergency','waived_excused','reversed'] as const)('uses shared %s label', async status => {
    mocks.rpc.mockResolvedValue({ data: [{ ...base, status, status_label: 'IGNORED WRONG LABEL', applied_amount: status.startsWith('waived') ? 0 : 725.5,
      deduction_obligation_id: status.startsWith('waived') ? null : 'o1', has_obligation: !status.startsWith('waived'), is_reversed: status === 'reversed' }], error: null });
    await mount(audience); expect(container.textContent).toContain(FINANCIAL_STATUS_LABELS[status]);
    expect(container.textContent).not.toContain('IGNORED WRONG LABEL');
    if (status.startsWith('waived')) { expect(container.textContent).toContain('0.00'); expect(container.textContent).not.toContain('Payroll Obligation Created'); }
  });
  it('does not render private data even if an unexpected field arrives', async () => {
    await mount(audience); expect(container.textContent).not.toContain('SECRET');
    expect(container.innerHTML).not.toContain('evidence_reference');
  });
  it('offers no decision, obligation, or reversal actions', async () => {
    await mount(audience);
    for (const action of ['Confirm', 'Waive', 'Reverse Decision', 'Send to Payroll', 'Record Adjustments']) expect(btn(action)).toBeUndefined();
  });
  it('distinguishes obligation creation from an actual deduction', async () => {
    await mount(audience); expect(container.textContent).toContain('Payroll Obligation Created');
    expect(container.textContent).not.toMatch(/deducted|refund paid/i);
  });
  it('compensation presence never claims refund payment', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...base, status: 'reversed', has_compensation: true, is_reversed: true }], error: null });
    await mount(audience); expect(container.textContent).toContain('Compensation Recorded'); expect(container.textContent).not.toMatch(/refund paid/i);
  });
  it('shows an audience-specific empty state', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null }); await mount(audience);
    expect(container.textContent).toContain(audience === 'payroll' ? 'No absence-related financial records found for this period.' : 'You have no absence-related financial records for this period.');
  });
  it('shows loading until the server returns', async () => {
    let resolve!: (value: unknown) => void; mocks.rpc.mockReturnValue(new Promise(r => { resolve = r; }));
    await mount(audience); expect(container.textContent).toContain('Loading financial absence information');
    await act(async () => resolve({ data: [base], error: null })); expect(container.textContent).toContain('725.50');
  });
  it('sanitizes errors and supports retry', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SQL SECURITY DEFINER SECRET' } }); await mount(audience);
    expect(container.textContent).toContain('Something went wrong while loading financial absence information.');
    expect(container.textContent).not.toContain('SECRET'); mocks.rpc.mockResolvedValue({ data: [base], error: null });
    await click('Retry'); expect(container.textContent).toContain('725.50');
  });
  it('uses flowing cards with readable mobile data and labelled filters', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    await mount(audience); expect(container.querySelector('article')).not.toBeNull();
    expect(container.textContent).toContain('2026-09-15'); expect(container.textContent).toContain('725.50');
    expect(container.querySelector('[aria-label="From date"]')).not.toBeNull();
  });
  it('never reads or displays cached financial data offline', async () => {
    mocks.online = false; await mount(audience);
    expect(container.textContent).toContain('Financial history is unavailable offline'); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.online = true; await mount(audience); expect(container.textContent).toContain('725.50');
    mocks.online = false; await mount(audience); expect(container.textContent).not.toContain('725.50');
  });
  it('ignores delayed results from the previous account', async () => {
    let resolve!: (value: unknown) => void; mocks.rpc.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    await mount(audience); mocks.owner = 'user-2'; mocks.rpc.mockResolvedValue({ data: [], error: null }); await mount(audience);
    await act(async () => resolve({ data: [base], error: null })); expect(container.textContent).not.toContain('725.50');
  });
  it('paginates without inventing totals', async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 25 }, (_, i) => ({ ...base, consequence_id: 'c' + i })), error: null });
    await mount(audience); await click('Next'); expect(mocks.rpc.mock.lastCall?.[1].p_offset).toBe(25);
    expect(container.textContent).toContain('Page 2');
  });
});

describe('role-specific projection boundaries', () => {
  it('Payroll filters send date, Hub, Rider, and status to the server', async () => {
    await mount('payroll');
    await change('From date','2026-09-01'); await change('To date','2026-09-30'); await change('Hub','h2');
    await change('Rider','r1'); await change('Consequence status','reversed'); await click('Apply filters');
    expect(mocks.rpc.mock.lastCall?.[1]).toMatchObject({ p_start_date: '2026-09-01', p_end_date: '2026-09-30', p_hub_id: 'h2', p_rider_id: 'r1', p_status: 'reversed', p_offset: 0 });
  });
  it('Payroll shows historical Hub and supplied balances', async () => {
    await mount('payroll'); expect(container.textContent).toContain('Historical Hub'); expect(container.textContent).toContain('Outstanding balance');
    expect(container.textContent).toContain('Open obligation');
  });
  it('Rider request has no Rider or Hub parameters and no identity controls', async () => {
    mocks.role = 'rider'; await mount('rider');
    expect(mocks.rpc.mock.lastCall?.[1]).not.toHaveProperty('p_rider_id');
    expect(mocks.rpc.mock.lastCall?.[1]).not.toHaveProperty('p_hub_id');
    expect(container.querySelector('[aria-label="Rider"]')).toBeNull(); expect(container.textContent).not.toContain('Historical Hub');
  });
  it('HR cannot open the Payroll projection', async () => {
    mocks.role = 'hr'; await mount('payroll'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('Admin cannot use the Rider-own projection', async () => {
    mocks.role = 'admin'; await mount('rider'); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects oversized date windows without a financial read', async () => {
    await mount('payroll'); const count = mocks.rpc.mock.calls.length;
    await change('From date','2026-01-01'); await change('To date','2026-09-30'); await click('Apply filters');
    expect(container.textContent).toContain('32 calendar days'); expect(mocks.rpc).toHaveBeenCalledTimes(count);
  });
});
