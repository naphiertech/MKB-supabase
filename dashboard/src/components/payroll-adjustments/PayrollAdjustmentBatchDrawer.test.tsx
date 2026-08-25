import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PayrollAdjustmentBatchForm,
  selectedBatchItems,
  type BatchDrafts,
} from './PayrollAdjustmentBatchDrawer';

const drafts: BatchDrafts = {
  general_deductions: { selected: true, amount: '100', date: '2026-08-20', reason: 'General', reference: '', payrollRecordId: '' },
  late_onhold: { selected: false, amount: '0', date: '2026-08-20', reason: '', reference: '', payrollRecordId: '' },
  late_remittance: { selected: false, amount: '', date: '2026-08-20', reason: '', reference: '', payrollRecordId: '' },
  other_earnings: { selected: true, amount: '300', date: '2026-08-20', reason: 'Earning', reference: '', payrollRecordId: 'payroll-1' },
  fm_pickup: { selected: true, amount: '0', date: '2026-08-20', reason: 'Zero', reference: '', payrollRecordId: 'payroll-1' },
};

describe('Payroll Adjustment multi-entry drawer', () => {
  it('renders one Rider selector and all five independent adjustment types', () => {
    const html = renderToStaticMarkup(<PayrollAdjustmentBatchForm riders={[]} payrolls={[]} onCancel={() => undefined} onSave={async () => undefined} />);
    expect(html.match(/Select Rider/g)).toHaveLength(1);
    for (const label of ['General Deductions', 'Late Onhold / FM', 'Late Remittance', 'Other Earnings', 'FM Pick Up']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Save Adjustments');
  });

  it('submits only selected positive entries and preserves separate codes', () => {
    expect(selectedBatchItems(drafts)).toEqual([
      { adjustmentCode: 'general_deductions', amount: 100, adjustmentDate: '2026-08-20', reason: 'General', reference: null, payrollRecordId: null },
      { adjustmentCode: 'other_earnings', amount: 300, adjustmentDate: '2026-08-20', reason: 'Earning', reference: null, payrollRecordId: 'payroll-1' },
    ]);
  });
});
