import { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Loader2, Pencil, Plus, Search, X } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { useRiderZone } from '../context/RiderZoneContext';
import { pushToast } from '../hooks/useToast';
import { RightDrawer } from '../components/common/RightDrawer';
import { StatePanel } from '../components/common/DashboardPrimitives';
import { PayrollAdjustmentBatchDrawer } from '../components/payroll-adjustments/PayrollAdjustmentBatchDrawer';
import { PayrollAdjustmentRiderWorkspace } from '../components/payroll-adjustments/PayrollAdjustmentRiderWorkspace';
import {
  createPayrollAdjustmentsBatch,
  listEditablePayrollOptions,
  listPayrollEarningAdjustments,
  updatePayrollEarningAdjustment,
  type EditablePayrollOption,
  type PayrollAdjustmentBatchItem,
  type PayrollEarningAdjustment,
} from '../services/payroll/payrollAdjustmentRecordsService';

interface PayrollAdjustmentsProps { role: 'admin' | 'hr' | 'payroll' }
type WorkspaceTab = 'working' | 'history' | 'earning';
const php = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PayrollAdjustments({ role }: PayrollAdjustmentsProps) {
  const canManage = role === 'admin' || role === 'payroll';
  const { hubs, selectedHubId, workspaceKey } = useHub();
  const { riders } = useRiderZone();
  const [tab, setTab] = useState<WorkspaceTab>('working');
  const [refreshToken, setRefreshToken] = useState(0);
  const [earnings, setEarnings] = useState<PayrollEarningAdjustment[]>([]);
  const [payrolls, setPayrolls] = useState<EditablePayrollOption[]>([]);
  const [supportingLoading, setSupportingLoading] = useState(true);
  const [earningSearch, setEarningSearch] = useState('');
  const [earningType, setEarningType] = useState('all');
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedEarning, setSelectedEarning] = useState<PayrollEarningAdjustment | null>(null);
  const [earningEdit, setEarningEdit] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editReference, setEditReference] = useState('');
  const [saving, setSaving] = useState(false);

  const riderName = useCallback((id: string) => riders.find((rider) => rider.id === id)?.name ?? 'Unknown Rider', [riders]);
  const loadSupportingData = useCallback(async () => {
    setSupportingLoading(true);
    try {
      const [nextEarnings, nextPayrolls] = await Promise.all([
        listPayrollEarningAdjustments(), listEditablePayrollOptions(),
      ]);
      setEarnings(nextEarnings);
      setPayrolls(nextPayrolls);
    } catch (loadError) {
      pushToast({ title: 'Some adjustment tools are unavailable', description: loadError instanceof Error ? loadError.message : 'Please retry.', tone: 'error' });
    } finally { setSupportingLoading(false); }
  }, []);

  useEffect(() => { void loadSupportingData(); }, [loadSupportingData]);

  const refreshWorkspace = async () => {
    setRefreshToken((value) => value + 1);
    await loadSupportingData();
  };
  const recordBatch = async (riderId: string, items: PayrollAdjustmentBatchItem[]) => {
    setSaving(true);
    try {
      await createPayrollAdjustmentsBatch({ riderId, items, reason: 'Recorded selected payroll adjustments' });
      pushToast({ title: 'Adjustments recorded', description: `${items.length} Rider-specific adjustment${items.length === 1 ? '' : 's'} saved atomically.`, tone: 'success' });
      setBatchOpen(false);
      await refreshWorkspace();
    } catch (saveError) {
      pushToast({ title: 'Unable to record adjustments', description: saveError instanceof Error ? saveError.message : 'No records were saved.', tone: 'error' });
      throw saveError;
    } finally { setSaving(false); }
  };

  const saveEarningEdit = async () => {
    if (!selectedEarning) return;
    setSaving(true);
    try {
      await updatePayrollEarningAdjustment({ adjustmentId: selectedEarning.id, amount: Number(editAmount), adjustmentDate: editDate, reason: editReason, reference: editReference });
      pushToast({ title: 'Earning updated', description: 'The audited correction was saved.', tone: 'success' });
      setSelectedEarning(null);
      await refreshWorkspace();
    } catch (saveError) { pushToast({ title: 'Unable to update earning', description: saveError instanceof Error ? saveError.message : 'Please try again.', tone: 'error' }); }
    finally { setSaving(false); }
  };

  const filteredEarnings = useMemo(() => earnings.filter((row) => {
    const needle = earningSearch.trim().toLowerCase();
    return (!needle || riderName(row.rider_id).toLowerCase().includes(needle) || row.adjustment_code.includes(needle))
      && (earningType === 'all' || row.adjustment_code === earningType)
      && (!selectedHubId || row.hub_id === selectedHubId);
  }), [earningSearch, earningType, earnings, riderName, selectedHubId]);
  const editablePayrollIds = useMemo(() => new Set(payrolls.map((payroll) => payroll.id)), [payrolls]);

  return <div className="dashboard-page space-y-5">
    <section className="ui-toolbar flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5"><div><div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-primary" /><h2 className="ui-section-title">Rider Payroll Adjustments</h2></div><p className="mt-1 text-xs text-muted-foreground">Browse Rider balances first, then open the individual financial events behind them.</p></div>{canManage && <button type="button" onClick={() => setBatchOpen(true)} className="ui-button-primary inline-flex h-11 items-center justify-center gap-2 px-4 text-xs font-semibold"><Plus className="h-4 w-4" /> Record Adjustments</button>}</section>

    <section className="ui-card overflow-hidden">
      <div className="flex overflow-x-auto border-b border-border px-4 pt-3">
        <button type="button" onClick={() => setTab('working')} className={`h-11 shrink-0 border-b-2 px-3 text-xs font-semibold ${tab === 'working' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Open Obligations</button>
        <button type="button" onClick={() => setTab('history')} className={`h-11 shrink-0 border-b-2 px-3 text-xs font-semibold ${tab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>History</button>
        <button type="button" onClick={() => setTab('earning')} className={`h-11 shrink-0 border-b-2 px-3 text-xs font-semibold ${tab === 'earning' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>Earnings</button>
      </div>

      {tab !== 'earning' && <PayrollAdjustmentRiderWorkspace key={tab} mode={tab} hubs={hubs} selectedHubId={selectedHubId} workspaceKey={workspaceKey} canManage={canManage} refreshToken={refreshToken} />}

      {tab === 'earning' && <><div className="grid gap-3 border-b border-border bg-panel-bg/40 p-4 sm:grid-cols-2"><label className="relative block"><span className="sr-only">Search earnings</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={earningSearch} onChange={(event) => setEarningSearch(event.target.value)} placeholder="Search Rider or adjustment" className="ar-input pl-9" /></label><label><span className="sr-only">Earning type</span><select value={earningType} onChange={(event) => setEarningType(event.target.value)} className="ar-input"><option value="all">All types</option><option value="other_earnings">Other Earnings</option><option value="fm_pickup">FM Pick Up</option></select></label></div>{supportingLoading ? <StatePanel loading title="Loading earnings" description="Reading Rider earning adjustments…" /> : <div className="table-scroll-region" role="region" aria-label="Earning adjustments" tabIndex={0}><table className="data-table-wide w-full min-w-[860px] text-left text-xs"><thead><tr>{['Rider','Type','Amount','Cutoff','Date','Reason','Actions'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{filteredEarnings.map((row) => { const editable=Boolean(row.payroll_record_id && editablePayrollIds.has(row.payroll_record_id)); return <tr key={row.id}><td className="px-4 py-3 font-semibold">{riderName(row.rider_id)}</td><td className="px-4 py-3">{row.adjustment_code === 'fm_pickup' ? 'FM Pick Up' : 'Other Earnings'}</td><td className="px-4 py-3 font-mono font-bold text-emerald-700">{php(Number(row.amount))}</td><td className="px-4 py-3 font-mono">{row.cutoff_start} – {row.cutoff_end}</td><td className="px-4 py-3">{row.adjustment_date}</td><td className="px-4 py-3">{row.reason}</td><td className="px-4 py-3"><div className="flex gap-1.5"><button type="button" onClick={() => { setSelectedEarning(row); setEarningEdit(false); }} className="ui-button-secondary h-8 px-3 text-[11px]">View</button>{canManage && <button type="button" disabled={!editable} title={editable ? 'Edit earning' : 'Locked because the payroll is submitted'} onClick={() => { if (!editable) return; setSelectedEarning(row); setEarningEdit(true); setEditAmount(String(row.amount)); setEditDate(row.adjustment_date); setEditReason(row.reason); setEditReference(row.reference ?? ''); }} className="ui-button-secondary inline-flex h-8 items-center gap-1 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"><Pencil className="h-3 w-3" /> Edit</button>}</div></td></tr>; })}</tbody></table>{filteredEarnings.length === 0 && <StatePanel compact title="No earning adjustments" description="No records match the current filters." />}</div>}</>}
    </section>

    <PayrollAdjustmentBatchDrawer open={batchOpen} onClose={() => !saving && setBatchOpen(false)} riders={riders} payrolls={payrolls} onSave={recordBatch} />


    <RightDrawer open={Boolean(selectedEarning)} onClose={() => !saving && setSelectedEarning(null)} dismissible={!saving} ariaLabel="Earning details" widthClassName="max-w-md">{selectedEarning&&<><div className="flex items-start justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">{earningEdit?'Edit Earning':selectedEarning.adjustment_code==='fm_pickup'?'FM Pick Up':'Other Earnings'}</h2><p className="text-xs text-muted-foreground">{riderName(selectedEarning.rider_id)} · {selectedEarning.cutoff_start} – {selectedEarning.cutoff_end}</p></div><button type="button" onClick={()=>setSelectedEarning(null)} className="ui-icon-button" aria-label="Close earning details"><X className="h-4 w-4"/></button></div><div className="flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-xl border border-border bg-panel-bg p-3 text-xs"><p><b>Rider:</b> {riderName(selectedEarning.rider_id)}</p><p className="mt-1"><b>Type:</b> {selectedEarning.adjustment_code==='fm_pickup'?'FM Pick Up':'Other Earnings'}</p><p className="mt-2 text-[10px] text-muted-foreground">Rider, type, and cutoff are locked. Submitted payroll earnings are read-only.</p></div>{earningEdit?<><label className="block space-y-1"><span className="ui-eyebrow">Amount</span><input type="number" min="0.01" value={editAmount} onChange={(event)=>setEditAmount(event.target.value)} className="ar-input"/></label><label className="block space-y-1"><span className="ui-eyebrow">Date</span><input type="date" value={editDate} onChange={(event)=>setEditDate(event.target.value)} className="ar-input"/></label><label className="block space-y-1"><span className="ui-eyebrow">Reason</span><textarea value={editReason} onChange={(event)=>setEditReason(event.target.value)} rows={3} className="ar-textarea"/></label><label className="block space-y-1"><span className="ui-eyebrow">Reference</span><input value={editReference} onChange={(event)=>setEditReference(event.target.value)} className="ar-input"/></label></>:<div className="space-y-3 rounded-xl border border-border p-4 text-xs"><div className="flex justify-between"><span>Amount</span><span className="font-mono font-bold text-emerald-700">{php(Number(selectedEarning.amount))}</span></div><div className="flex justify-between gap-4"><span>Date</span><span>{selectedEarning.adjustment_date}</span></div><div><span className="text-muted-foreground">Reason</span><p className="mt-1">{selectedEarning.reason}</p></div>{selectedEarning.reference&&<div><span className="text-muted-foreground">Reference</span><p className="mt-1">{selectedEarning.reference}</p></div>}</div>}</div>{earningEdit&&<div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" onClick={()=>setSelectedEarning(null)} className="ui-button-secondary h-10 px-4">Cancel</button><button type="button" disabled={saving||Number(editAmount)<=0||!editReason.trim()} onClick={()=>void saveEarningEdit()} className="ui-button-primary inline-flex h-10 items-center gap-2 px-4">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>} Save Correction</button></div>}</>}</RightDrawer>
  </div>;
}
