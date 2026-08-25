import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TraceablePayrollAdjustmentsCard } from './TraceablePayrollAdjustmentsCard';
import type { PayrollDeductionBalance, PayrollEarningAdjustment } from '../../services/payroll/payrollAdjustmentRecordsService';

const balance = (overrides: Partial<PayrollDeductionBalance>): PayrollDeductionBalance => ({
  obligation_id: 'o1', rider_id: 'r1', hub_id: 'h1', adjustment_code: 'late_onhold',
  display_name: 'Late Onhold / FM', original_amount: 150, recovered: 0, committed: 0,
  planned: 0, outstanding: 150, available_to_allocate: 150, status: 'open',
  adjustment_date: '2026-08-20', reason: 'Late onhold', reference: null, voided_at: null,
  ...overrides,
});

const earning = (overrides: Partial<PayrollEarningAdjustment>): PayrollEarningAdjustment => ({
  id: 'e1', rider_id: 'r1', hub_id: 'h1', payroll_record_id: 'p1', cutoff_start: '2026-08-16',
  cutoff_end: '2026-08-31', adjustment_code: 'other_earnings', amount: 200,
  adjustment_date: '2026-08-20', reason: 'Manual earning', reference: null, source: 'manual',
  created_by: 'u1', updated_by: 'u1', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z',
  voided_at: null, voided_by: null, void_reason: null,
  ...overrides,
});

const renderCard = (overrides: Partial<Parameters<typeof TraceablePayrollAdjustmentsCard>[0]> = {}) => renderToStaticMarkup(
  <TraceablePayrollAdjustmentsCard
    role="payroll"
    grossPay={612}
    otherEarnings={0}
    fmPickupAmount={0}
    earningRecords={[]}
    balances={[]}
    allocationAmounts={{}}
    persistedAllocationAmounts={{}}
    onAllocationChange={vi.fn()}
    reason="Authorized recovery"
    onReasonChange={vi.fn()}
    saving={false}
    onSave={vi.fn()}
    {...overrides}
  />,
);

describe('Traceable Payroll Details adjustments', () => {
  it('derives read-only earning totals and record counts from earning sources', () => {
    const html = renderCard({
      earningRecords: [
        earning({ id: 'e1', amount: 200 }),
        earning({ id: 'e2', amount: 100, reason: 'Correction' }),
        earning({ id: 'e3', adjustment_code: 'fm_pickup', amount: 100 }),
      ],
    });
    expect(html).toContain('Other Earnings');
    expect(html).toContain('+₱300.00');
    expect(html).toContain('2 earning records');
    expect(html).toContain('FM Pick Up');
    expect(html).toContain('+₱100.00');
    expect(html).toContain('1 earning record');
    expect(html).toContain('Total Earnings');
    expect(html).toContain('₱1,012.00');
  });

  it('renders compact official deduction categories and a direct single-obligation input', () => {
    const html = renderCard({ balances: [balance({})], allocationAmounts: { o1: 50 } });
    expect(html).toContain('General Deductions');
    expect(html).toContain('No outstanding obligation');
    expect(html).toContain('Late Onhold / FM');
    expect(html).toContain('Available ₱150.00 · 1 obligation');
    expect(html).toContain('Remaining after: ₱100.00');
    expect(html).toContain('Late Remittance');
  });

  it('keeps multiple obligations explicit behind View and combines categories in the projection', () => {
    const html = renderCard({
      balances: [
        balance({ obligation_id: 'g1', adjustment_code: 'general_deductions', display_name: 'General Deductions', original_amount: 10, available_to_allocate: 10, outstanding: 10 }),
        balance({ obligation_id: 'l1', available_to_allocate: 300, original_amount: 300, outstanding: 300 }),
        balance({ obligation_id: 'l2', available_to_allocate: 200, original_amount: 200, outstanding: 200 }),
      ],
      allocationAmounts: { g1: 10, l1: 50, l2: 0 },
    });
    expect(html).toContain('Available ₱500.00 · 2 obligations');
    expect(html).toContain('Allocate in View');
    expect(html).toContain('Total Deductions');
    expect(html).toContain('₱60.00');
    expect(html).toContain('Projected Net Pay');
    expect(html).toContain('₱552.00');
  });

  it('marks an over-allocation invalid, excludes it from projection, and disables Save', () => {
    const html = renderCard({ balances: [balance({})], allocationAmounts: { o1: 200 } });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Maximum available is ₱150.00');
    expect(html).toContain('Total Deductions');
    expect(html).toContain('₱0.00');
    expect(html).toContain('disabled=""');
  });

  it('keeps negative projected net pay invalid independently of obligation limits', () => {
    const html = renderCard({
      grossPay: 100,
      balances: [balance({ original_amount: 150, available_to_allocate: 150 })],
      allocationAmounts: { o1: 150 },
    });
    expect(html).toContain('Applied deductions cannot make projected net pay negative');
    expect(html).toContain('disabled=""');
  });
});
