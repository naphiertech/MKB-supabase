import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import {
  listPayrollAdjustmentDefinitions,
  updatePayrollAdjustmentDefinition,
} from './earningsDeductionsService';

describe('earnings and deductions definitions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the fixed definition registry', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ code: 'other_earnings', display_name: 'Other Earnings', category: 'earning', input_mode: 'manual_amount', active: true }],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    mocks.from.mockReturnValue({ select });

    await expect(listPayrollAdjustmentDefinitions()).resolves.toHaveLength(1);
    expect(mocks.from).toHaveBeenCalledWith('payroll_adjustment_definitions');
  });

  it('uses the Admin-only update RPC with a required reason', async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    await updatePayrollAdjustmentDefinition({
      code: 'fm_pickup',
      displayName: 'FM Pick Up',
      active: false,
      reason: 'Temporarily unavailable',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('update_payroll_adjustment_definition', {
      p_code: 'fm_pickup',
      p_display_name: 'FM Pick Up',
      p_active: false,
      p_reason: 'Temporarily unavailable',
    });
  });
});
