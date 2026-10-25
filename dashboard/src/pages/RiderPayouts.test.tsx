// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  payrollHistory: vi.fn(),
  deductionBalances: vi.fn(),
}));

vi.mock('../services/riders/riderService', () => ({
  getRiderPayrollHistory: mocks.payrollHistory,
}));

vi.mock('../services/payroll/payrollAdjustmentRecordsService', () => ({
  listPayrollDeductionBalances: mocks.deductionBalances,
}));

vi.mock('../components/payroll/PayrollDetailsModal', () => ({
  PayrollDetailsModal: ({ isOpen, onClose, record }: any) =>
    isOpen ? (
      <div data-testid="payslip-modal">
        <span>Modal for {record?.id}</span>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null,
}));

import { RiderPayouts } from './RiderPayouts';

const sampleRecords = [
  {
    id: 'rec-1',
    cutoff_start: '2026-10-05T00:00:00Z',
    cutoff_end: '2026-10-11T23:59:59Z',
    total_parcels: 210,
    rate_per_parcel: 18,
    gross_pay: 3780,
    deductions: 250,
    late_onhold: 50,
    late_remittance: 0,
    total_earnings_snapshot: 3780,
    total_deductions_snapshot: 300,
    net_pay_snapshot: 3480,
    status: 'paid',
    adjustment_snapshot: {
      version: 2,
      items: [
        { code: 'general_deductions', label: 'Uniform Deduction', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 250 },
        { code: 'late_onhold', label: 'Late Onhold Penalty', category: 'deduction', input_mode: 'manual_amount', active: true, amount: 50 },
      ],
    },
    riders: {
      id: 'rider-1',
      name: 'Juan Dela Cruz',
      mkb_id: 'MKB-001',
      avatar_url: null,
      shift: 'Morning',
      zones: { name: 'Tetuan Sector' },
    },
  },
  {
    id: 'rec-2',
    cutoff_start: '2026-09-28T00:00:00Z',
    cutoff_end: '2026-10-04T23:59:59Z',
    total_parcels: 190,
    rate_per_parcel: 18,
    gross_pay: 3420,
    deductions: 100,
    late_onhold: 0,
    late_remittance: 0,
    total_earnings_snapshot: 3420,
    total_deductions_snapshot: 100,
    net_pay_snapshot: 3320,
    status: 'approved',
    adjustment_snapshot: null,
    riders: {
      id: 'rider-1',
      name: 'Juan Dela Cruz',
      mkb_id: 'MKB-001',
      avatar_url: null,
      shift: 'Morning',
      zones: { name: 'Tetuan Sector' },
    },
  },
];

const sampleBalances = [
  {
    obligation_id: 'ob-1',
    adjustment_code: 'general_deductions',
    display_name: 'Uniform Installment',
    reference: 'UNI-2026-01',
    original_amount: 1000,
    recovered: 500,
    outstanding: 500,
    status: 'active',
  },
];

async function flushEffects() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('RiderPayouts', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.payrollHistory.mockResolvedValue(sampleRecords);
    mocks.deductionBalances.mockResolvedValue(sampleBalances);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders summary stat cards, payout records, and deductions tab', async () => {
    await act(async () => {
      root.render(<RiderPayouts userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    expect(container.textContent).toContain('My Payouts');
    expect(container.textContent).toContain('Total Net Paid');
    expect(container.textContent).toContain('Total Deductions');
    expect(container.textContent).toContain('Approved / Ready');
    expect(container.textContent).toContain('Oct 5');
    expect(container.textContent).toContain('Uniform Deduction');
  });

  it('opens payslip modal on clicking view payslip button', async () => {
    await act(async () => {
      root.render(<RiderPayouts userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    const viewButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('View Details') || btn.textContent?.includes('View Payslip')
    );
    expect(viewButton).toBeDefined();

    await act(async () => {
      viewButton?.click();
    });

    expect(container.textContent).toContain('Modal for rec-1');
  });

  it('switches to active deduction obligations tab to show outstanding balances', async () => {
    await act(async () => {
      root.render(<RiderPayouts userId="user-1" riderId="rider-1" />);
    });
    await flushEffects();

    const obligationsTab = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Deduction Balances') || btn.textContent?.includes('Outstanding Deductions')
    );
    expect(obligationsTab).toBeDefined();

    await act(async () => {
      obligationsTab?.click();
    });

    expect(container.textContent).toContain('Uniform Installment');
    expect(container.textContent).toContain('500');
  });
});
