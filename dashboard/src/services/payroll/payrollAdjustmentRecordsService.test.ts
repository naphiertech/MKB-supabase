import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock('../../lib/supabaseClient', () => ({ supabase: mocks }));

import {
  createPayrollAdjustmentsBatch,
  listPayrollDeductionBalances,
  savePayrollAdjustmentPlan,
  updatePayrollEarningAdjustment,
} from './payrollAdjustmentRecordsService';

describe('payroll adjustment record service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the authoritative deduction balance view', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ order }));
    mocks.from.mockReturnValue({ select });

    await expect(listPayrollDeductionBalances()).resolves.toEqual([]);
    expect(mocks.from).toHaveBeenCalledWith('v_payroll_deduction_balances');
  });

  it('saves the complete editable payroll plan through one RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await savePayrollAdjustmentPlan({
      payrollRecordId: 'payroll-1',
      earnings: [],
      allocations: [{ obligationId: 'obligation-1', amount: 200 }],
      reason: 'Apply authorized recovery',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('save_payroll_adjustment_plan', {
      p_payroll_record_id: 'payroll-1',
      p_earnings: [],
      p_allocations: [{ obligation_id: 'obligation-1', amount: 200 }],
      p_reason: 'Apply authorized recovery',
    });
  });

  it('creates mixed adjustment entries through one atomic batch RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await createPayrollAdjustmentsBatch({
      riderId: 'rider-1',
      reason: 'Record selected adjustments',
      items: [
        { adjustmentCode: 'general_deductions', amount: 100, adjustmentDate: '2026-08-20', reason: 'General' },
        { adjustmentCode: 'other_earnings', amount: 300, adjustmentDate: '2026-08-20', reason: 'Earning', payrollRecordId: 'payroll-1' },
      ],
    });
    expect(mocks.rpc).toHaveBeenCalledWith('create_payroll_adjustments_batch', {
      p_rider_id: 'rider-1',
      p_items: [
        { adjustment_code: 'general_deductions', amount: 100, adjustment_date: '2026-08-20', reason: 'General', reference: null, payroll_record_id: null },
        { adjustment_code: 'other_earnings', amount: 300, adjustment_date: '2026-08-20', reason: 'Earning', reference: null, payroll_record_id: 'payroll-1' },
      ],
      p_reason: 'Record selected adjustments',
    });
  });

  it('corrects an earning through the guarded earning RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await updatePayrollEarningAdjustment({
      adjustmentId: 'earning-1', amount: 350, adjustmentDate: '2026-08-21', reason: 'Correction', reference: 'REF-1',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('update_payroll_earning_adjustment', {
      p_adjustment_id: 'earning-1', p_amount: 350, p_adjustment_date: '2026-08-21', p_reason: 'Correction', p_reference: 'REF-1',
    });
  });
});
