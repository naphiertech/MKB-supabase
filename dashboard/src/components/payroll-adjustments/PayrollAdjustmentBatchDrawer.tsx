import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { RightDrawer } from '../common/RightDrawer';
import type { Rider } from '../../services/types';
import type {
  EditablePayrollOption,
  PayrollAdjustmentBatchItem,
  PayrollAdjustmentRecordCode,
} from '../../services/payroll/payrollAdjustmentRecordsService';

export interface BatchDraft {
  selected: boolean;
  amount: string;
  date: string;
  reason: string;
  reference: string;
  payrollRecordId: string;
}
export type BatchDrafts = Record<PayrollAdjustmentRecordCode, BatchDraft>;

const DEFINITIONS: Array<{
  code: PayrollAdjustmentRecordCode;
  label: string;
  category: 'deduction' | 'earning';
}> = [
  { code: 'general_deductions', label: 'General Deductions', category: 'deduction' },
  { code: 'late_onhold', label: 'Late Onhold / FM', category: 'deduction' },
  { code: 'late_remittance', label: 'Late Remittance', category: 'deduction' },
  { code: 'other_earnings', label: 'Other Earnings', category: 'earning' },
  { code: 'fm_pickup', label: 'FM Pick Up', category: 'earning' },
];

const today = () => new Date().toISOString().slice(0, 10);
const initialDrafts = (): BatchDrafts => Object.fromEntries(DEFINITIONS.map(({ code }) => [code, {
  selected: false, amount: '', date: today(), reason: '', reference: '', payrollRecordId: '',
}])) as BatchDrafts;

export function selectedBatchItems(drafts: BatchDrafts): PayrollAdjustmentBatchItem[] {
  return DEFINITIONS.flatMap(({ code, category }) => {
    const draft = drafts[code];
    const amount = Number(draft.amount);
    if (!draft.selected || !Number.isFinite(amount) || amount <= 0) return [];
    return [{
      adjustmentCode: code,
      amount,
      adjustmentDate: draft.date,
      reason: draft.reason.trim(),
      reference: draft.reference.trim() || null,
      payrollRecordId: category === 'earning' ? draft.payrollRecordId || null : null,
    }];
  });
}

interface FormProps {
  riders: Rider[];
  payrolls: EditablePayrollOption[];
  onCancel: () => void;
  onSave: (riderId: string, items: PayrollAdjustmentBatchItem[]) => Promise<void>;
}

export function PayrollAdjustmentBatchForm({ riders, payrolls, onCancel, onSave }: FormProps) {
  const [riderId, setRiderId] = useState('');
  const [drafts, setDrafts] = useState<BatchDrafts>(initialDrafts);
  const [saving, setSaving] = useState(false);
  const riderPayrolls = payrolls.filter((payroll) => payroll.rider_id === riderId);
  const items = selectedBatchItems(drafts);
  const selectedDrafts = DEFINITIONS.filter(({ code }) => drafts[code].selected).map(({ code, category }) => ({
    draft: drafts[code], category,
  }));
  const valid = Boolean(riderId) && selectedDrafts.length > 0 && selectedDrafts.every(({ draft, category }) =>
    Number(draft.amount) > 0 && Boolean(draft.date) && Boolean(draft.reason.trim())
    && (category === 'deduction' || Boolean(draft.payrollRecordId)));

  const update = (code: PayrollAdjustmentRecordCode, patch: Partial<BatchDraft>) =>
    setDrafts((current) => ({ ...current, [code]: { ...current[code], ...patch } }));

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try { await onSave(riderId, items); }
    finally { setSaving(false); }
  };

  return <div className="flex h-full flex-col">
    <div className="flex items-start justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-semibold">Record Payroll Adjustments</h2><p className="mt-0.5 text-xs text-muted-foreground">Select one Rider, then include only the adjustments that apply.</p></div><button type="button" onClick={onCancel} className="ui-icon-button" aria-label="Close batch adjustment form"><X className="h-4 w-4" /></button></div>
    <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
      <label className="block space-y-1"><span className="ui-eyebrow">Rider</span><select value={riderId} onChange={(event) => { setRiderId(event.target.value); setDrafts(initialDrafts()); }} className="ar-input"><option value="">Select Rider</option>{riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name}</option>)}</select></label>
      {(['deduction','earning'] as const).map((category) => <section key={category} className="space-y-2"><h3 className="ui-eyebrow">{category === 'deduction' ? 'Deductions' : 'Earnings'}</h3>{DEFINITIONS.filter((definition) => definition.category === category).map((definition) => {
        const draft = drafts[definition.code];
        return <div key={definition.code} className={`rounded-xl border p-3 transition ${draft.selected ? 'border-primary/30 bg-accent/25' : 'border-border bg-white'}`}><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" checked={draft.selected} onChange={(event) => update(definition.code, { selected: event.target.checked })} className="h-4 w-4 accent-primary" /><span className="text-xs font-semibold">{definition.label}</span></label>{draft.selected && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block space-y-1"><span className="ui-eyebrow">Amount</span><input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => update(definition.code, { amount: event.target.value })} className="ar-input" placeholder="0.00" /></label>{category === 'earning' && <label className="block space-y-1"><span className="ui-eyebrow">Payroll Cutoff</span><select value={draft.payrollRecordId} onChange={(event) => update(definition.code, { payrollRecordId: event.target.value })} className="ar-input"><option value="">Select editable cutoff</option>{riderPayrolls.map((payroll) => <option key={payroll.id} value={payroll.id}>{payroll.cutoff_start} – {payroll.cutoff_end} · {payroll.status}</option>)}</select></label>}<label className="block space-y-1"><span className="ui-eyebrow">{category === 'deduction' ? 'Incident Date' : 'Date'}</span><input type="date" value={draft.date} onChange={(event) => update(definition.code, { date: event.target.value })} className="ar-input" /></label><label className="block space-y-1"><span className="ui-eyebrow">Reference (optional)</span><input value={draft.reference} onChange={(event) => update(definition.code, { reference: event.target.value })} className="ar-input" /></label><label className="block space-y-1 sm:col-span-2"><span className="ui-eyebrow">Reason</span><textarea value={draft.reason} onChange={(event) => update(definition.code, { reason: event.target.value })} rows={2} className="ar-textarea" /></label></div>}</div>;
      })}</section>)}
    </div>
    <div className="flex justify-end gap-2 border-t border-border px-5 py-4"><button type="button" onClick={onCancel} disabled={saving} className="ui-button-secondary h-10 px-4">Cancel</button><button type="button" onClick={() => void submit()} disabled={!valid || saving} className="ui-button-primary inline-flex h-10 items-center gap-2 px-4 text-xs font-semibold">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Adjustments</button></div>
  </div>;
}

interface DrawerProps extends Omit<FormProps, 'onCancel'> {
  open: boolean;
  onClose: () => void;
}

export function PayrollAdjustmentBatchDrawer({ open, onClose, riders, payrolls, onSave }: DrawerProps) {
  return <RightDrawer open={open} onClose={onClose} ariaLabel="Record payroll adjustments" widthClassName="max-w-2xl"><PayrollAdjustmentBatchForm riders={riders} payrolls={payrolls} onCancel={onClose} onSave={onSave} /></RightDrawer>;
}
