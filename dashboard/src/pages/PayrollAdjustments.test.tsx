// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listSummaries: vi.fn(),
  listEvents: vi.fn(),
  listHistory: vi.fn(),
  listEarnings: vi.fn(),
  listPayrolls: vi.fn(),
  updateDeduction: vi.fn(),
  voidDeduction: vi.fn(),
  useHub: vi.fn(),
}));

vi.mock('../context/HubContext', () => ({ useHub: () => mocks.useHub() }));
vi.mock('../context/RiderZoneContext', () => ({ useRiderZone: () => ({ riders: [] }) }));
vi.mock('../hooks/useToast', () => ({ pushToast: vi.fn() }));
vi.mock('../components/payroll-adjustments/PayrollAdjustmentBatchDrawer', () => ({
  PayrollAdjustmentBatchDrawer: () => null,
}));
vi.mock('../services/payroll/payrollAdjustmentRecordsService', () => ({
  listPayrollAdjustmentRiderSummaries: mocks.listSummaries,
  listPayrollAdjustmentRiderEvents: mocks.listEvents,
  listDeductionAllocationHistory: mocks.listHistory,
  listPayrollEarningAdjustments: mocks.listEarnings,
  listEditablePayrollOptions: mocks.listPayrolls,
  createPayrollAdjustmentsBatch: vi.fn(),
  updatePayrollDeductionObligation: mocks.updateDeduction,
  updatePayrollEarningAdjustment: vi.fn(),
  voidPayrollDeductionObligation: mocks.voidDeduction,
}));

import { PayrollAdjustments } from './PayrollAdjustments';

describe('Payroll Adjustments Rider-first workspace', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useHub.mockReturnValue({ hubs: [{ id: 'hub-1', name: 'Main Hub' }], selectedHubId: null, workspaceKey: 'all' });
    mocks.listSummaries.mockResolvedValue({
      rows: [{ rider_id: 'rider-1', rider_name: 'Rider One', rider_code: 'MKB-001', hub_id: 'hub-1', hub_name: 'Main Hub', event_count: 2, adjustment_type_count: 1, total_remaining: 2000, latest_activity: '2026-08-29T00:00:00+08:00' }],
      total: 1,
    });
    mocks.listEvents.mockResolvedValue({
      rows: [
        { obligation_id: 'obligation-1500', rider_id: 'rider-1', hub_id: 'hub-1', adjustment_code: 'late_remittance', display_name: 'Late Remittance', original_amount: 1500, adjustment_date: '2026-08-20', reason: 'First incident', reference: 'LR-1', recovered: 0, committed: 0, planned: 0, outstanding: 1500, available_to_allocate: 1500, status: 'open', voided_at: null },
        { obligation_id: 'obligation-500', rider_id: 'rider-1', hub_id: 'hub-1', adjustment_code: 'late_remittance', display_name: 'Late Remittance', original_amount: 500, adjustment_date: '2026-08-29', reason: 'Second incident', reference: 'LR-2', recovered: 0, committed: 0, planned: 0, outstanding: 500, available_to_allocate: 500, status: 'open', voided_at: null },
      ],
      total: 2,
    });
    mocks.listHistory.mockResolvedValue([]);
    mocks.listEarnings.mockResolvedValue([]);
    mocks.listPayrolls.mockResolvedValue([]);
    mocks.updateDeduction.mockResolvedValue(undefined);
    mocks.voidDeduction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('loads server-filtered summaries and opens the selected Rider\'s independent events', async () => {
    await act(async () => { root.render(<PayrollAdjustments role="admin" />); });

    expect(mocks.listSummaries).toHaveBeenCalledWith(expect.objectContaining({ status: 'actionable', page: 1 }));
    expect(container.textContent).toContain('Rider One');
    expect(container.textContent).toContain('2 open events');

    const riderButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Rider One'));
    await act(async () => { riderButton?.click(); });

    expect(mocks.listEvents).toHaveBeenCalledWith(expect.objectContaining({ riderId: 'rider-1', status: 'actionable' }));
    expect(document.body.textContent).toContain('obligation-1500');
    expect(document.body.textContent).toContain('obligation-500');
    expect(document.body.textContent).toContain('2 events');
  });

  it('keeps settled and voided obligations behind the History workspace', async () => {
    await act(async () => { root.render(<PayrollAdjustments role="admin" />); });
    mocks.listSummaries.mockClear();

    const historyTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'History');
    await act(async () => { historyTab?.click(); });

    expect(mocks.listSummaries).toHaveBeenCalledWith(expect.objectContaining({ status: 'history', page: 1 }));
  });

  it('navigates Rider summary to obligation edit and back inside one drawer', async () => {
    await act(async () => { root.render(<PayrollAdjustments role="admin" />); });
    const riderButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Rider One'));
    await act(async () => { riderButton?.click(); });

    let drawer = document.querySelector<HTMLElement>('[role="dialog"]');
    const viewButton = Array.from(drawer?.querySelectorAll('button') ?? []).find((button) => button.textContent === 'View');
    await act(async () => { viewButton?.click(); });

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Allocation History');
    const editButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.trim() === 'Edit');
    await act(async () => { editButton?.click(); });
    expect(document.body.textContent).toContain('Edit Deduction');

    const cancelButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.trim() === 'Cancel');
    await act(async () => { cancelButton?.click(); });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Allocation History');

    const backButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes('Back to Rider Summary'));
    await act(async () => { backButton?.click(); });
    drawer = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(drawer?.textContent).toContain('Individual obligation events');
    expect(drawer?.textContent).toContain('obligation-1500');
  });

  it('saves an audited correction and returns to the updated obligation detail', async () => {
    await act(async () => { root.render(<PayrollAdjustments role="admin" />); });
    const riderButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Rider One'));
    await act(async () => { riderButton?.click(); });
    const viewButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent === 'View');
    await act(async () => { viewButton?.click(); });
    const editButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.trim() === 'Edit');
    await act(async () => { editButton?.click(); });

    mocks.listEvents.mockResolvedValue({
      rows: [{ obligation_id: 'obligation-1500', rider_id: 'rider-1', hub_id: 'hub-1', adjustment_code: 'late_remittance', display_name: 'Late Remittance', original_amount: 1500, adjustment_date: '2026-08-20', reason: 'Corrected incident', reference: 'LR-1', recovered: 0, committed: 0, planned: 0, outstanding: 1500, available_to_allocate: 1500, status: 'open', voided_at: null }],
      total: 1,
    });
    const saveButton = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes('Save Correction'));
    await act(async () => { saveButton?.click(); });

    expect(mocks.updateDeduction).toHaveBeenCalledWith(expect.objectContaining({ obligationId: 'obligation-1500' }));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Corrected incident');
    expect(document.body.textContent).toContain('Allocation History');
    expect(document.body.textContent).not.toContain('Save Correction');
  });
});
