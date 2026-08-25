import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeDollarSign, Loader2, Pencil, Plus, X } from 'lucide-react';
import { useRiderZone } from '../context/RiderZoneContext';
import { pushToast } from '../hooks/useToast';
import { RightDrawer } from '../components/common/RightDrawer';
import { StatePanel, StatusBadge } from '../components/common/DashboardPrimitives';
import { PayrollAdjustmentBatchDrawer } from '../components/payroll-adjustments/PayrollAdjustmentBatchDrawer';
import {
  createPayrollAdjustmentsBatch,
  listDeductionAllocationHistory,
  listEditablePayrollOptions,
  listPayrollDeductionBalances,
  listPayrollEarningAdjustments,
  updatePayrollDeductionObligation,
  updatePayrollEarningAdjustment,
  voidPayrollDeductionObligation,
  type EditablePayrollOption,
  type PayrollAdjustmentBatchItem,
  type PayrollDeductionAllocation,
  type PayrollDeductionBalance,
  type PayrollEarningAdjustment,
} from '../services/payroll/payrollAdjustmentRecordsService';

interface PayrollAdjustmentsProps { role: 'admin' | 'hr' | 'payroll' }
type RecordKind = 'deduction' | 'earning';
const php = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayrollAdjustments({ role }: PayrollAdjustmentsProps) {
  const canManage = role === 'admin' || role === 'payroll';
  const { riders } = useRiderZone();
  const [tab, setTab] = useState<RecordKind>('deduction');
  const [balances, setBalances] = useState<PayrollDeductionBalance[]>([]);
  const [earnings, setEarnings] = useState<PayrollEarningAdjustment[]>([]);
  const [payrolls, setPayrolls] = useState<EditablePayrollOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedDeduction, setSelectedDeduction] = useState<PayrollDeductionBalance | null>(null);
  const [deductionHistory, setDeductionHistory] = useState<PayrollDeductionAllocation[]>([]);
  const [deductionEdit, setDeductionEdit] = useState(false);
  const [selectedEarning, setSelectedEarning] = useState<PayrollEarningAdjustment | null>(null);
  const [earningEdit, setEarningEdit] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editReference, setEditReference] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [saving, setSaving] = useState(false);

  const riderName = useCallback((id: string) => riders.find((rider) => rider.id === id)?.name ?? 'Unknown Rider', [riders]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextBalances, nextEarnings, nextPayrolls] = await Promise.all([
        listPayrollDeductionBalances(), listPayrollEarningAdjustments(), listEditablePayrollOptions(),
      ]);
      setBalances(nextBalances); setEarnings(nextEarnings); setPayrolls(nextPayrolls);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payroll adjustments.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filteredBalances = useMemo(() => balances.filter((row) => {
    const needle = search.toLowerCase();
    return (!needle || riderName(row.rider_id).toLowerCase().includes(needle) || row.display_name.toLowerCase().includes(needle))
      && (typeFilter === 'all' || row.adjustment_code === typeFilter)
      && (statusFilter === 'all' || row.status === statusFilter);
  }), [balances, riderName, search, statusFilter, typeFilter]);
  const filteredEarnings = useMemo(() => earnings.filter((row) => {
    const needle = search.toLowerCase();
    return (!needle || riderName(row.rider_id).toLowerCase().includes(needle) || row.adjustment_code.includes(needle))
      && (typeFilter === 'all' || row.adjustment_code === typeFilter);
  }), [earnings, riderName, search, typeFilter]);
  const editablePayrollIds = useMemo(() => new Set(payrolls.map((payroll) => payroll.id)), [payrolls]);

  const recordBatch = async (riderId: string, items: PayrollAdjustmentBatchItem[]) => {
    setSaving(true);
    try {
      await createPayrollAdjustmentsBatch({ riderId, items, reason: 'Recorded selected payroll adjustments' });
      pushToast({ title: 'Adjustments recorded', description: `${items.length} Rider-specific adjustment${items.length === 1 ? '' : 's'} saved atomically.`, tone: 'success' });
      setBatchOpen(false); await load();
    } catch (saveError) {
      pushToast({ title: 'Unable to record adjustments', description: saveError instanceof Error ? saveError.message : 'No records were saved.', tone: 'error' });
      throw saveError;
    } finally { setSaving(false); }
  };

  const openDeduction = async (row: PayrollDeductionBalance, edit: boolean) => {
    setSelectedDeduction(row); setDeductionEdit(edit); setVoidReason('');
    setEditAmount(String(row.original_amount)); setEditDate(row.adjustment_date ?? '');
    setEditReason(row.reason ?? ''); setEditReference(row.reference ?? '');
    try { setDeductionHistory(await listDeductionAllocationHistory(row.obligation_id)); }
    catch { setDeductionHistory([]); }
  };

  const saveDeductionEdit = async () => {
    if (!selectedDeduction) return;
    setSaving(true);
    try {
      await updatePayrollDeductionObligation({ obligationId: selectedDeduction.obligation_id, originalAmount: Number(editAmount), adjustmentDate: editDate, reason: editReason, reference: editReference });
      pushToast({ title: 'Deduction updated', description: 'The audited correction was saved.', tone: 'success' });
      setSelectedDeduction(null); await load();
    } catch (saveError) { pushToast({ title: 'Unable to update deduction', description: saveError instanceof Error ? saveError.message : 'Please try again.', tone: 'error' }); }
    finally { setSaving(false); }
  };

  const openEarning = (row: PayrollEarningAdjustment, edit: boolean) => {
    setSelectedEarning(row); setEarningEdit(edit);
    setEditAmount(String(row.amount)); setEditDate(row.adjustment_date);
    setEditReason(row.reason); setEditReference(row.reference ?? '');
  };

  const saveEarningEdit = async () => {
    if (!selectedEarning) return;
    setSaving(true);
    try {
      await updatePayrollEarningAdjustment({ adjustmentId: selectedEarning.id, amount: Number(editAmount), adjustmentDate: editDate, reason: editReason, reference: editReference });
      pushToast({ title: 'Earning updated', description: 'The editable payroll aggregate was resynchronized.', tone: 'success' });
      setSelectedEarning(null); await load();
    } catch (saveError) { pushToast({ title: 'Unable to update earning', description: saveError instanceof Error ? saveError.message : 'Please try again.', tone: 'error' }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="dashboard-page"><StatePanel loading title="Loading Payroll Adjustments" description="Reading earning records and deduction balances…" /></div>;
  if (error) return <div className="dashboard-page"><StatePanel icon={AlertTriangle} title="Unable to load Payroll Adjustments" description={error} action={<button type="button" onClick={() => void load()} className="ui-button-secondary">Retry</button>} /></div>;

  return <div className="dashboard-page space-y-5">
    <section className="ui-toolbar flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"><div><div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-primary" /><h2 className="ui-section-title">Rider Payroll Adjustments</h2></div><p className="mt-1 text-xs text-muted-foreground">Record financial events once; Payroll Details automatically consumes them each cutoff.</p></div>{canManage && <button type="button" onClick={() => setBatchOpen(true)} className="ui-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-xs font-semibold"><Plus className="h-4 w-4" /> Record Adjustments</button>}</section>

    <section className="ui-card overflow-hidden"><div className="flex border-b border-border px-4 pt-3"><button type="button" onClick={() => { setTab('deduction'); setTypeFilter('all'); }} className={`h-10 border-b-2 px-3 text-xs font-semibold ${tab === 'deduction' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Deduction Obligations</button><button type="button" onClick={() => { setTab('earning'); setTypeFilter('all'); }} className={`h-10 border-b-2 px-3 text-xs font-semibold ${tab === 'earning' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Earnings</button></div><div className="grid gap-3 border-b border-border bg-panel-bg/40 p-4 sm:grid-cols-3"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Rider or adjustment" className="ar-input" /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="ar-input"><option value="all">All types</option>{(tab === 'deduction' ? [['general_deductions','General Deductions'],['late_onhold','Late Onhold / FM'],['late_remittance','Late Remittance']] : [['other_earnings','Other Earnings'],['fm_pickup','FM Pick Up']]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{tab === 'deduction' ? <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="ar-input"><option value="all">All statuses</option><option value="open">Open</option><option value="partially_recovered">Partially Recovered</option><option value="settled">Settled</option><option value="voided">Voided</option></select> : <div />}</div>
      {tab === 'deduction' ? <div className="table-scroll-region" role="region" aria-label="Deduction obligations" tabIndex={0}><table className="data-table-wide w-full min-w-[980px] text-left text-xs"><thead><tr>{['Rider','Adjustment','Total Amount','Already Deducted','In Process','For This Payroll','Remaining','Status','Actions'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{filteredBalances.map((row) => <tr key={row.obligation_id}><td className="px-4 py-3 font-semibold">{riderName(row.rider_id)}</td><td className="px-4 py-3">{row.display_name}</td><td className="px-4 py-3 font-mono">{php(row.original_amount)}</td><td className="px-4 py-3 font-mono">{php(row.recovered)}</td><td className="px-4 py-3 font-mono text-amber-700">{php(row.committed)}</td><td className="px-4 py-3 font-mono">{php(row.planned)}</td><td className="px-4 py-3 font-mono font-bold">{php(row.available_to_allocate)}</td><td className="px-4 py-3"><StatusBadge tone={row.status === 'settled' ? 'success' : row.status === 'voided' ? 'neutral' : 'warning'} dot>{row.status.replace('_',' ')}</StatusBadge></td><td className="px-4 py-3"><div className="flex gap-1.5"><button type="button" onClick={() => void openDeduction(row,false)} className="ui-button-secondary h-8 px-3 text-[11px]">View</button>{canManage && row.status !== 'voided' && <button type="button" onClick={() => void openDeduction(row,true)} className="ui-button-secondary inline-flex h-8 items-center gap-1 px-3 text-[11px]"><Pencil className="h-3 w-3" /> Edit</button>}</div></td></tr>)}</tbody></table>{filteredBalances.length === 0 && <StatePanel compact title="No deduction obligations" description="No records match the current filters." />}</div>
      : <div className="table-scroll-region" role="region" aria-label="Earning adjustments" tabIndex={0}><table className="data-table-wide w-full min-w-[860px] text-left text-xs"><thead><tr>{['Rider','Type','Amount','Cutoff','Date','Reason','Actions'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{filteredEarnings.map((row) => { const editable=Boolean(row.payroll_record_id && editablePayrollIds.has(row.payroll_record_id)); return <tr key={row.id}><td className="px-4 py-3 font-semibold">{riderName(row.rider_id)}</td><td className="px-4 py-3">{row.adjustment_code === 'fm_pickup' ? 'FM Pick Up' : 'Other Earnings'}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{php(Number(row.amount))}</td><td className="px-4 py-3 font-mono">{row.cutoff_start} – {row.cutoff_end}</td><td className="px-4 py-3">{row.adjustment_date}</td><td className="px-4 py-3">{row.reason}</td><td className="px-4 py-3"><div className="flex gap-1.5"><button type="button" onClick={() => openEarning(row,false)} className="ui-button-secondary h-8 px-3 text-[11px]">View</button>{canManage && <button type="button" disabled={!editable} title={editable ? 'Edit earning' : 'Locked because the payroll is submitted'} onClick={() => editable && openEarning(row,true)} className="ui-button-secondary inline-flex h-8 items-center gap-1 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"><Pencil className="h-3 w-3" /> Edit</button>}</div></td></tr>; })}</tbody></table>{filteredEarnings.length === 0 && <StatePanel compact title="No earning adjustments" description="No records match the current filters." />}</div>}
    </section>

    <PayrollAdjustmentBatchDrawer open={batchOpen} onClose={() => !saving && setBatchOpen(false)} riders={riders} payrolls={payrolls} onSave={recordBatch} />

    <RightDrawer open={Boolean(selectedDeduction)} onClose={() => !saving && setSelectedDeduction(null)} dismissible={!saving} ariaLabel="Deduction details" widthClassName="max-w-xl">{selectedDeduction && <><div className="flex items-start justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">{deductionEdit ? 'Edit Deduction' : selectedDeduction.display_name}</h2><p className="text-xs text-muted-foreground">{riderName(selectedDeduction.rider_id)} · {deductionEdit ? 'Audited correction' : 'Recovery history'}</p></div><button type="button" onClick={() => setSelectedDeduction(null)} className="ui-icon-button" aria-label="Close deduction details"><X className="h-4 w-4" /></button></div><div className="flex-1 space-y-4 overflow-y-auto p-5">{deductionEdit ? <><div className="rounded-xl border border-border bg-panel-bg p-3 text-xs"><p><b>Rider:</b> {riderName(selectedDeduction.rider_id)}</p><p className="mt-1"><b>Type:</b> {selectedDeduction.display_name}</p><p className="mt-2 text-[10px] text-muted-foreground">Rider and type are locked because changing them would move financial history to a different ledger.</p></div>{selectedDeduction.recovered+selectedDeduction.committed>0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Total Amount and Incident Date are locked because this adjustment has already been used in submitted payroll. Reason and reference may still be corrected.</div>}<label className="block space-y-1"><span className="ui-eyebrow">Total Amount</span><input type="number" value={editAmount} disabled={selectedDeduction.recovered+selectedDeduction.committed>0} onChange={(event) => setEditAmount(event.target.value)} min={selectedDeduction.planned} className="ar-input" /></label><label className="block space-y-1"><span className="ui-eyebrow">Incident Date</span><input type="date" value={editDate} disabled={selectedDeduction.recovered+selectedDeduction.committed>0} onChange={(event) => setEditDate(event.target.value)} className="ar-input" /></label><label className="block space-y-1"><span className="ui-eyebrow">Reason</span><textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} rows={3} className="ar-textarea" /></label><label className="block space-y-1"><span className="ui-eyebrow">Reference</span><input value={editReference} onChange={(event) => setEditReference(event.target.value)} className="ar-input" /></label></> : <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[['Total Amount',selectedDeduction.original_amount],['Already Deducted',selectedDeduction.recovered],['In Process',selectedDeduction.committed],['For This Payroll',selectedDeduction.planned],['Outstanding',selectedDeduction.outstanding],['Remaining',selectedDeduction.available_to_allocate]].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-border p-3"><span className="ui-eyebrow">{label}</span><p className="mt-1 font-mono font-bold">{php(Number(value))}</p></div>)}</div><div><h3 className="ui-section-title">Allocation History</h3><div className="mt-2 divide-y divide-border rounded-xl border border-border">{deductionHistory.map((item) => <div key={item.id} className="flex justify-between p-3 text-xs"><span>{item.cutoff_start} – {item.cutoff_end}</span><span className="font-mono font-semibold">{php(Number(item.amount))}</span></div>)}{deductionHistory.length===0&&<p className="p-4 text-xs text-muted-foreground">No allocations yet.</p>}</div></div>{canManage&&selectedDeduction.recovered===0&&selectedDeduction.committed===0&&selectedDeduction.planned===0&&<div className="rounded-xl border border-border p-3"><label className="block space-y-1"><span className="ui-eyebrow">Void reason</span><textarea value={voidReason} onChange={(event)=>setVoidReason(event.target.value)} rows={2} className="ar-textarea" /></label><button type="button" disabled={!voidReason.trim()} onClick={() => void voidPayrollDeductionObligation(selectedDeduction.obligation_id,voidReason).then(async()=>{setSelectedDeduction(null);await load();})} className="ui-button-secondary mt-3 h-9 px-3 text-xs">Void unused obligation</button></div>}</>}</div>{deductionEdit&&<div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={()=>setSelectedDeduction(null)} className="ui-button-secondary h-10 px-4">Cancel</button><button type="button" disabled={saving||Number(editAmount)<=0||!editReason.trim()} onClick={()=>void saveDeductionEdit()} className="ui-button-primary inline-flex h-10 items-center gap-2 px-4">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>} Save Correction</button></div>}</>}</RightDrawer>

    <RightDrawer open={Boolean(selectedEarning)} onClose={() => !saving && setSelectedEarning(null)} dismissible={!saving} ariaLabel="Earning details" widthClassName="max-w-md">{selectedEarning&&<><div className="flex items-start justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">{earningEdit?'Edit Earning':selectedEarning.adjustment_code==='fm_pickup'?'FM Pick Up':'Other Earnings'}</h2><p className="text-xs text-muted-foreground">{riderName(selectedEarning.rider_id)} · {selectedEarning.cutoff_start} – {selectedEarning.cutoff_end}</p></div><button type="button" onClick={()=>setSelectedEarning(null)} className="ui-icon-button" aria-label="Close earning details"><X className="h-4 w-4"/></button></div><div className="flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-xl border border-border bg-panel-bg p-3 text-xs"><p><b>Rider:</b> {riderName(selectedEarning.rider_id)}</p><p className="mt-1"><b>Type:</b> {selectedEarning.adjustment_code==='fm_pickup'?'FM Pick Up':'Other Earnings'}</p><p className="mt-2 text-[10px] text-muted-foreground">Rider, type, and cutoff are locked. Submitted payroll earnings are read-only.</p></div>{earningEdit?<><label className="block space-y-1"><span className="ui-eyebrow">Amount</span><input type="number" min="0.01" value={editAmount} onChange={(event)=>setEditAmount(event.target.value)} className="ar-input"/></label><label className="block space-y-1"><span className="ui-eyebrow">Date</span><input type="date" value={editDate} onChange={(event)=>setEditDate(event.target.value)} className="ar-input"/></label><label className="block space-y-1"><span className="ui-eyebrow">Reason</span><textarea value={editReason} onChange={(event)=>setEditReason(event.target.value)} rows={3} className="ar-textarea"/></label><label className="block space-y-1"><span className="ui-eyebrow">Reference</span><input value={editReference} onChange={(event)=>setEditReference(event.target.value)} className="ar-input"/></label></>:<div className="space-y-3 rounded-xl border border-border p-4 text-xs"><div className="flex justify-between"><span>Amount</span><span className="font-mono font-bold text-emerald-700">{php(Number(selectedEarning.amount))}</span></div><div className="flex justify-between gap-4"><span>Date</span><span>{selectedEarning.adjustment_date}</span></div><div><span className="text-muted-foreground">Reason</span><p className="mt-1">{selectedEarning.reason}</p></div>{selectedEarning.reference&&<div><span className="text-muted-foreground">Reference</span><p className="mt-1">{selectedEarning.reference}</p></div>}</div>}</div>{earningEdit&&<div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={()=>setSelectedEarning(null)} className="ui-button-secondary h-10 px-4">Cancel</button><button type="button" disabled={saving||Number(editAmount)<=0||!editReason.trim()} onClick={()=>void saveEarningEdit()} className="ui-button-primary inline-flex h-10 items-center gap-2 px-4">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>} Save Correction</button></div>}</>}</RightDrawer>
  </div>;
}
