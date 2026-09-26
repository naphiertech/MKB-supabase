import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
import { listFinancialConsequencesForPayroll, listMyFinancialConsequences,
  financialReadErrorMessage, FINANCIAL_STATUS_LABELS, formatFinancialAmount } from './absenceFinancialService';
beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockResolvedValue({ data: [], error: null }); });
describe('sanitized financial history contracts', () => {
  it('Payroll sends only supported filters to Phase 6', async () => {
    await listFinancialConsequencesForPayroll({ startDate: '2026-09-01', endDate: '2026-09-30', hubId: 'h1', riderId: 'r1', status: 'reversed', page: 2 });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('list_rider_absence_financial_consequences_for_payroll', {
      p_start_date: '2026-09-01', p_end_date: '2026-09-30', p_hub_id: 'h1', p_rider_id: 'r1', p_status: 'reversed', p_limit: 25, p_offset: 50,
    });
  });
  it('Rider sends no Rider, account, or Hub ID, even when extra fields are supplied', async () => {
    const input = { startDate: '2026-09-01', endDate: '2026-09-30', page: 0, riderId: 'other', hubId: 'other' };
    await listMyFinancialConsequences(input);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('list_my_absence_financial_consequences', {
      p_start_date: '2026-09-01', p_end_date: '2026-09-30', p_status: null, p_limit: 25, p_offset: 0,
    });
  });
  it('read failure is safe without PostgREST internals', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'SQL SECURITY DEFINER SECRET' } });
    const failure = await listMyFinancialConsequences({ startDate: '2026-09-01', endDate: '2026-09-30', page: 0 })
      .then(() => null, error => error);
    expect(failure).not.toBeNull();
    expect(financialReadErrorMessage(failure)).toBe('Something went wrong while loading financial absence information. Please try again.');
  });
  it.each([
    ['confirmed','Financial Penalty Confirmed'], ['waived_emergency','Penalty Waived'],
    ['waived_excused','Penalty Waived'], ['reversed','Financial Penalty Reversed'],
  ] as const)('shares truthful %s status with Admin/HR', (status,label) => expect(FINANCIAL_STATUS_LABELS[status]).toBe(label));
  it('formats server amounts including zero and non-500 values', () => {
    expect(formatFinancialAmount(725.5, 'PHP')).toContain('725.50');
    expect(formatFinancialAmount(0, 'PHP')).toContain('0.00');
    expect(formatFinancialAmount(1000.25, 'PHP')).toContain('1,000.25');
  });
  it('does not fabricate zero when amount is unavailable', () => expect(formatFinancialAmount(null,'PHP')).toBe('Not available'));
});
