import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Shield } from 'lucide-react';
import type {
  PayrollDeductionBalance,
  PayrollEarningAdjustment,
} from '../../services/payroll/payrollAdjustmentRecordsService';
import {
  calculateProjectedPayrollPlan,
  evaluateEditableAllocationInput,
} from '../../lib/payroll/payrollAdjustmentPlanning';

type DeductionCode = 'general_deductions' | 'late_onhold' | 'late_remittance';
type EarningCode = 'other_earnings' | 'fm_pickup';

interface Props {
  role: 'admin' | 'hr' | 'payroll' | 'rider';
  grossPay: number;
  otherEarnings?: number;
  fmPickupAmount?: number;
  earningRecords: PayrollEarningAdjustment[];
  balances: PayrollDeductionBalance[];
  allocationAmounts: Record<string, number>;
  persistedAllocationAmounts: Record<string, number>;
  onAllocationChange: (obligationId: string, amount: number) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  saving: boolean;
  onSave: () => void | Promise<void>;
}

const EARNING_CATEGORIES: Array<{ code: EarningCode; label: string }> = [
  { code: 'other_earnings', label: 'Other Earnings' },
  { code: 'fm_pickup', label: 'FM Pick Up' },
];
const DEDUCTION_CATEGORIES: Array<{ code: DeductionCode; label: string }> = [
  { code: 'general_deductions', label: 'General Deductions' },
  { code: 'late_onhold', label: 'Late Onhold / FM' },
  { code: 'late_remittance', label: 'Late Remittance' },
];

const php = (amount: number) => `₱${amount.toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export function TraceablePayrollAdjustmentsCard({
  role,
  grossPay,
  earningRecords,
  balances,
  allocationAmounts,
  persistedAllocationAmounts,
  onAllocationChange,
  reason,
  onReasonChange,
  saving,
  onSave,
}: Props) {
  const canManage = role === 'admin' || role === 'payroll';
  const [openEarning, setOpenEarning] = useState<EarningCode | null>(null);
  const [openDeduction, setOpenDeduction] = useState<DeductionCode | null>(null);

  const earningGroups = EARNING_CATEGORIES.map((category) => {
    const records = earningRecords.filter((record) => record.adjustment_code === category.code);
    return {
      ...category,
      records,
      total: records.reduce((sum, record) => sum + Number(record.amount), 0),
    };
  });
  const otherEarnings = earningGroups.find((group) => group.code === 'other_earnings')?.total ?? 0;
  const fmPickupAmount = earningGroups.find((group) => group.code === 'fm_pickup')?.total ?? 0;

  const allocationStates = balances.map((row) => ({
    row,
    current: Number(allocationAmounts[row.obligation_id] ?? 0),
    ...evaluateEditableAllocationInput({
      authoritativeAvailable: row.available_to_allocate,
      persistedAllocation: Number(persistedAllocationAmounts[row.obligation_id] ?? 0),
      enteredAmount: Number(allocationAmounts[row.obligation_id] ?? 0),
    }),
  }));
  const deductionGroups = DEDUCTION_CATEGORIES.map((category) => {
    const states = allocationStates.filter((state) => state.row.adjustment_code === category.code);
    return {
      ...category,
      states,
      editableAvailable: states.reduce((sum, state) => sum + state.editableAvailable, 0),
      enteredTotal: states.reduce((sum, state) => sum + state.current, 0),
      projectedTotal: states.reduce((sum, state) => sum + state.projectedAmount, 0),
      remainingAfter: states.reduce((sum, state) => sum + state.remainingAfter, 0),
      valid: states.every((state) => state.valid),
    };
  });

  const plan = calculateProjectedPayrollPlan({
    grossPay,
    otherEarnings,
    fmPickupAmount,
    allocations: allocationStates.map((state) => state.projectedAmount),
  });
  const hasInvalidAllocation = allocationStates.some((state) => !state.valid);
  const invalidNetPay = plan.projectedNetPay < 0;
  const invalid = hasInvalidAllocation || invalidNetPay;

  return <div className="space-y-4 rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start gap-3 border-b border-dashed border-border pb-3">
      <span className="rounded-lg bg-accent p-1.5 ring-1 ring-primary/20"><Shield className="h-5 w-5 text-primary" /></span>
      <div><h4 className="text-xs font-extrabold uppercase tracking-[0.16em]">Payroll Computation</h4><p className="mt-1 text-[11px] text-muted-foreground">Earnings are derived from recorded sources. Enter only this cutoff's deduction allocations.</p></div>
    </div>

    <section className="space-y-2" aria-labelledby="compact-earnings-heading">
      <h5 id="compact-earnings-heading" className="ui-eyebrow">Earnings</h5>
      <div className="flex items-center justify-between py-1 text-xs"><span className="text-muted-foreground">Base Delivery Pay</span><span className="font-mono font-semibold">{php(grossPay)}</span></div>
      {earningGroups.map((group) => <div key={group.code} className="border-t border-border/60 py-2">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-medium text-foreground">{group.label}</p><div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground"><span>{group.records.length} earning {group.records.length === 1 ? 'record' : 'records'}</span>{group.records.length > 0 && <button type="button" onClick={() => setOpenEarning((current) => current === group.code ? null : group.code)} className="font-semibold text-primary hover:underline">View</button>}</div></div><span className="font-mono text-xs font-semibold text-emerald-700">+{php(group.total)}</span></div>
        {openEarning === group.code && <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-panel-bg/45">{group.records.map((record) => <div key={record.id} className="grid gap-1 p-2.5 text-[10px] sm:grid-cols-[auto_1fr_auto]"><span className="font-mono font-semibold text-emerald-700">{php(Number(record.amount))}</span><span className="text-muted-foreground">{record.reason}{record.reference ? ` · ${record.reference}` : ''}</span><span className="text-muted-foreground">{record.adjustment_date} · {record.created_by ? `Recorded by ${record.created_by}` : 'Legacy migration'}</span></div>)}</div>}
      </div>)}
      <div className="flex items-center justify-between border-t border-border pt-2 text-xs font-bold"><span>Total Earnings</span><span className="font-mono">{php(plan.payBeforeDeductions)}</span></div>
    </section>

    <section className="space-y-2 border-t border-dashed border-border pt-3" aria-labelledby="compact-deductions-heading">
      <h5 id="compact-deductions-heading" className="ui-eyebrow">Deductions</h5>
      {deductionGroups.map((group) => {
        const single = group.states.length === 1 ? group.states[0] : null;
        const inputErrorId = `category-allocation-error-${group.code}`;
        return <div key={group.code} className={`border-t py-2 first:border-t-0 ${group.valid ? 'border-border/60' : 'border-red-300'}`}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-foreground">{group.label}</p><div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">{group.states.length === 0 ? <span>No outstanding obligation</span> : <span>Available {php(group.editableAvailable)} · {group.states.length} {group.states.length === 1 ? 'obligation' : 'obligations'}</span>}{group.states.length > 0 && <button type="button" onClick={() => setOpenDeduction((current) => current === group.code ? null : group.code)} className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">View {openDeduction === group.code ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>}</div></div>
            {group.states.length === 0 ? <div className="flex items-center gap-1"><span className="text-[10px]">₱</span><input type="number" value="" placeholder="0.00" disabled className="ar-input h-8 w-28 text-right font-mono text-xs" /></div>
            : single && canManage ? <div className="flex items-center gap-1"><span className="text-[10px]">₱</span><input type="number" min="0" max={single.editableAvailable} step="0.01" value={single.current || ''} aria-invalid={!single.valid} aria-describedby={!single.valid ? inputErrorId : undefined} onChange={(event) => onAllocationChange(single.row.obligation_id, Math.max(Number(event.target.value), 0))} className={`ar-input h-8 w-28 text-right font-mono text-xs ${single.valid ? '' : 'border-red-400 focus:border-red-500 focus:ring-red-200'}`} /></div>
            : <div className="text-right"><p className="font-mono text-xs font-semibold">-{php(group.enteredTotal)}</p>{group.states.length > 1 && canManage && <p className="mt-0.5 text-[10px] font-semibold text-primary">Allocate in View</p>}</div>}
          </div>
          {single && !single.valid && <p id={inputErrorId} className="mt-1 text-right text-[10px] font-semibold text-red-700">{single.error}</p>}
          {group.states.length > 0 && <p className="mt-1 text-right text-[10px] text-muted-foreground">Remaining after: {group.valid ? php(group.remainingAfter) : '—'}</p>}
          {openDeduction === group.code && <div className="mt-2 space-y-2 rounded-lg border border-border bg-panel-bg/45 p-2.5">{group.states.map((state) => {
            const detailErrorId = `obligation-allocation-error-${state.row.obligation_id}`;
            return <div key={state.row.obligation_id} className={`rounded-lg border bg-white p-2.5 ${state.valid ? 'border-border' : 'border-red-300'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-semibold">{state.row.reason}</p><p className="mt-0.5 text-[9px] text-muted-foreground">Incident {state.row.adjustment_date}{state.row.reference ? ` · ${state.row.reference}` : ''}</p></div><span className="font-mono text-[10px] font-semibold">Available {php(state.editableAvailable)}</span></div><div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-muted-foreground sm:grid-cols-4"><span>Original {php(state.row.original_amount)}</span><span>Recovered {php(state.row.recovered)}</span><span>Committed {php(state.row.committed)}</span><span>Planned {php(state.row.planned)}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-[9px] text-muted-foreground">Apply this cutoff</span>{canManage ? <input type="number" min="0" max={state.editableAvailable} step="0.01" value={state.current || ''} aria-invalid={!state.valid} aria-describedby={!state.valid ? detailErrorId : undefined} onChange={(event) => onAllocationChange(state.row.obligation_id, Math.max(Number(event.target.value), 0))} className={`ar-input h-8 w-28 text-right font-mono text-xs ${state.valid ? '' : 'border-red-400'}`} /> : <span className="font-mono text-xs">{php(state.current)}</span>}</div>{!state.valid && <p id={detailErrorId} className="mt-1 text-right text-[9px] font-semibold text-red-700">{state.error}</p>}</div>;
          })}</div>}
        </div>;
      })}
      <div className="flex items-center justify-between border-t border-border pt-2 text-xs font-bold"><span>Total Deductions</span><span className="font-mono">{php(plan.plannedDeductions)}</span></div>
    </section>

    <div className={`rounded-xl border p-3 ${invalidNetPay ? 'border-red-200 bg-red-50' : 'border-border bg-panel-bg'}`}><div className="flex justify-between text-sm font-semibold"><span>Projected Net Pay</span><span className="font-mono">{php(plan.projectedNetPay)}</span></div>{invalidNetPay && <p className="mt-2 text-[11px] text-red-700">Applied deductions cannot make projected net pay negative. Enter a smaller amount.</p>}</div>
    {canManage && <div className="space-y-2"><label className="block space-y-1"><span className="ui-eyebrow">Change reason</span><textarea value={reason} onChange={(event) => onReasonChange(event.target.value)} rows={2} className="ar-textarea" placeholder="Explain the authorized allocations for this cutoff." /></label><button type="button" disabled={saving || invalid || !reason.trim()} onClick={() => void onSave()} className="ui-button-primary inline-flex h-10 w-full items-center justify-center gap-2 text-xs font-semibold">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save adjustment plan</button></div>}
  </div>;
}
