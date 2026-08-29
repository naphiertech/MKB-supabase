import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight,
  History, Loader2, Pencil, Search, Users, X,
} from 'lucide-react';
import { pushToast } from '../../hooks/useToast';
import type { Hub } from '../../services/hubs/hubService';
import {
  listDeductionAllocationHistory,
  listPayrollAdjustmentRiderEvents,
  listPayrollAdjustmentRiderSummaries,
  updatePayrollDeductionObligation,
  voidPayrollDeductionObligation,
  type PayrollAdjustmentRiderSummary,
  type PayrollAdjustmentStatusFilter,
  type PayrollDeductionAllocation,
  type PayrollDeductionBalance,
} from '../../services/payroll/payrollAdjustmentRecordsService';
import { RightDrawer } from '../common/RightDrawer';
import { StatePanel, StatusBadge } from '../common/DashboardPrimitives';

const PAGE_SIZE = 25;
const php = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const activityDate = (value: string) => new Intl.DateTimeFormat('en-PH', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
}).format(new Date(value));

function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  return <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
    <span>Showing {first}–{last} of {total}</span>
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="ui-icon-button disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
      <span className="font-mono text-foreground">Page {page} of {pages}</span>
      <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="ui-icon-button disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
    </div>
  </div>;
}

function Metrics({ obligation }: { obligation: PayrollDeductionBalance }) {
  const values = [
    ['Total Amount', obligation.original_amount],
    ['Already Deducted', obligation.recovered],
    ['In Process', obligation.committed],
    ['For This Payroll', obligation.planned],
    ['Outstanding', obligation.outstanding],
    ['Remaining', obligation.available_to_allocate],
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{values.map(([label, value]) => <div key={String(label)} className="rounded-xl border border-border bg-white p-3"><span className="ui-eyebrow">{label}</span><p className="mt-1 font-mono font-bold">{php(Number(value))}</p></div>)}</div>;
}

function groupEvents(events: PayrollDeductionBalance[]) {
  const groups = new Map<string, { label: string; events: PayrollDeductionBalance[]; remaining: number }>();
  for (const event of events) {
    const group = groups.get(event.adjustment_code) ?? { label: event.display_name, events: [], remaining: 0 };
    group.events.push(event);
    group.remaining += event.available_to_allocate;
    groups.set(event.adjustment_code, group);
  }
  return Array.from(groups.entries()).map(([code, group]) => ({ code, ...group }));
}

export function PayrollAdjustmentRiderWorkspace({
  mode,
  hubs,
  selectedHubId,
  workspaceKey,
  canManage,
  refreshToken,
}: {
  mode: 'working' | 'history';
  hubs: Hub[];
  selectedHubId: string | null;
  workspaceKey: string;
  canManage: boolean;
  refreshToken: number;
}) {
  const summaryRequest = useRef(0);
  const eventRequest = useRef(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [hubId, setHubId] = useState<string | null>(selectedHubId);
  const [type, setType] = useState('all');
  const [status, setStatus] = useState<PayrollAdjustmentStatusFilter>(mode === 'history' ? 'history' : 'actionable');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PayrollAdjustmentRiderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRider, setSelectedRider] = useState<PayrollAdjustmentRiderSummary | null>(null);
  const [events, setEvents] = useState<PayrollDeductionBalance[]>([]);
  const [eventPage, setEventPage] = useState(1);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [drawerMode, setDrawerMode] = useState<'summary' | 'details' | 'edit'>('summary');
  const [selectedObligation, setSelectedObligation] = useState<PayrollDeductionBalance | null>(null);
  const [allocationHistory, setAllocationHistory] = useState<PayrollDeductionAllocation[]>([]);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editReference, setEditReference] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setHubId(selectedHubId);
    setPage(1);
    setSelectedRider(null);
    setDrawerMode('summary');
    setSelectedObligation(null);
  }, [selectedHubId, workspaceKey]);

  const loadSummaries = useCallback(async () => {
    const requestId = ++summaryRequest.current;
    setLoading(true);
    setError('');
    try {
      const result = await listPayrollAdjustmentRiderSummaries({
        search,
        hubId,
        adjustmentCode: type === 'all' ? null : type,
        status,
        page,
        pageSize: PAGE_SIZE,
      });
      if (requestId !== summaryRequest.current) return;
      setRows(result.rows);
      setTotal(result.total);
    } catch (loadError) {
      if (requestId !== summaryRequest.current) return;
      setRows([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payroll adjustments.');
    } finally {
      if (requestId === summaryRequest.current) setLoading(false);
    }
  }, [hubId, page, search, status, type]);

  useEffect(() => { void loadSummaries(); }, [loadSummaries, refreshToken]);

  const loadEvents = useCallback(async (riderId: string, nextPage: number) => {
    const requestId = ++eventRequest.current;
    setEventsLoading(true);
    setEventsError('');
    try {
      const result = await listPayrollAdjustmentRiderEvents({
        riderId,
        adjustmentCode: type === 'all' ? null : type,
        status,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      if (requestId !== eventRequest.current) return undefined;
      setEvents(result.rows);
      setEventTotal(result.total);
      return result.rows;
    } catch (loadError) {
      if (requestId !== eventRequest.current) return undefined;
      setEvents([]);
      setEventTotal(0);
      setEventsError(loadError instanceof Error ? loadError.message : 'Unable to load Rider adjustments.');
      return [];
    } finally {
      if (requestId === eventRequest.current) setEventsLoading(false);
    }
  }, [status, type]);

  useEffect(() => {
    if (selectedRider) void loadEvents(selectedRider.rider_id, eventPage);
  }, [eventPage, loadEvents, refreshToken, selectedRider]);

  const resetForFilter = (change: () => void) => {
    change();
    setPage(1);
    setSelectedRider(null);
    setDrawerMode('summary');
    setSelectedObligation(null);
  };
  const openRider = (rider: PayrollAdjustmentRiderSummary) => {
    setSelectedRider(rider);
    setEventPage(1);
    setDrawerMode('summary');
    setSelectedObligation(null);
  };
  const closeRider = () => {
    if (saving) return;
    setSelectedRider(null);
    setDrawerMode('summary');
    setSelectedObligation(null);
  };
  const openObligation = async (obligation: PayrollDeductionBalance, edit = false) => {
    setSelectedObligation(obligation);
    setEditAmount(String(obligation.original_amount));
    setEditDate(obligation.adjustment_date ?? '');
    setEditReason(obligation.reason ?? '');
    setEditReference(obligation.reference ?? '');
    setVoidReason('');
    setAllocationHistory([]);
    setDrawerMode(edit ? 'edit' : 'details');
    try { setAllocationHistory(await listDeductionAllocationHistory(obligation.obligation_id)); }
    catch { setAllocationHistory([]); }
  };
  const returnToSummary = () => {
    setDrawerMode('summary');
    setSelectedObligation(null);
  };

  const saveObligation = async () => {
    if (!selectedObligation || !selectedRider) return;
    setSaving(true);
    try {
      const nextAmount = Number(editAmount);
      await updatePayrollDeductionObligation({
        obligationId: selectedObligation.obligation_id,
        originalAmount: nextAmount,
        adjustmentDate: editDate,
        reason: editReason,
        reference: editReference,
      });
      const amountLocked = selectedObligation.recovered + selectedObligation.committed > 0;
      const acceptedUpdate: PayrollDeductionBalance = {
        ...selectedObligation,
        original_amount: nextAmount,
        adjustment_date: editDate,
        reason: editReason,
        reference: editReference.trim() || null,
        outstanding: amountLocked ? selectedObligation.outstanding : nextAmount,
        available_to_allocate: amountLocked ? selectedObligation.available_to_allocate : Math.max(nextAmount - selectedObligation.planned, 0),
      };
      setSelectedObligation(acceptedUpdate);
      setDrawerMode('details');
      const refreshed = await loadEvents(selectedRider.rider_id, eventPage);
      const authoritative = refreshed?.find((event) => event.obligation_id === selectedObligation.obligation_id);
      if (authoritative) setSelectedObligation(authoritative);
      await loadSummaries();
      try { setAllocationHistory(await listDeductionAllocationHistory(selectedObligation.obligation_id)); }
      catch { setAllocationHistory([]); }
      pushToast({ title: 'Deduction updated', description: 'The audited correction was saved.', tone: 'success' });
    } catch (saveError) {
      pushToast({ title: 'Unable to update deduction', description: saveError instanceof Error ? saveError.message : 'Please try again.', tone: 'error' });
    } finally { setSaving(false); }
  };

  const voidObligation = async () => {
    if (!selectedObligation || !selectedRider || !voidReason.trim()) return;
    setSaving(true);
    try {
      await voidPayrollDeductionObligation(selectedObligation.obligation_id, voidReason);
      setDrawerMode('summary');
      setSelectedObligation(null);
      await Promise.all([loadSummaries(), loadEvents(selectedRider.rider_id, eventPage)]);
      pushToast({ title: 'Obligation voided', description: 'The unused obligation was voided with an audit reason.', tone: 'success' });
    } catch (voidError) {
      pushToast({ title: 'Unable to void obligation', description: voidError instanceof Error ? voidError.message : 'Please try again.', tone: 'error' });
    } finally { setSaving(false); }
  };

  const grouped = useMemo(() => groupEvents(events), [events]);

  return <>
    <div className="grid gap-3 border-b border-border bg-panel-bg/40 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="relative block"><span className="sr-only">Search Rider</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1); }} placeholder="Search Rider or MKB ID" className="ar-input pl-9" /></label>
      <label><span className="sr-only">Hub</span><select value={hubId ?? 'all'} onChange={(event) => resetForFilter(() => setHubId(event.target.value === 'all' ? null : event.target.value))} className="ar-input"><option value="all">All accessible Hubs</option>{hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></label>
      <label><span className="sr-only">Adjustment type</span><select value={type} onChange={(event) => resetForFilter(() => setType(event.target.value))} className="ar-input"><option value="all">All types</option><option value="general_deductions">General Deductions</option><option value="late_onhold">Late Onhold / FM</option><option value="late_remittance">Late Remittance</option></select></label>
      <label><span className="sr-only">Status</span><select value={status} onChange={(event) => resetForFilter(() => setStatus(event.target.value as PayrollAdjustmentStatusFilter))} className="ar-input">{mode === 'working' ? <><option value="actionable">All open obligations</option><option value="open">Open</option><option value="partially_recovered">Partially Recovered</option></> : <><option value="history">All history</option><option value="settled">Settled</option><option value="voided">Voided</option></>}</select></label>
    </div>

    {loading ? <StatePanel loading title="Loading Rider summaries" description="Reading the selected adjustment workspace…" />
      : error ? <StatePanel icon={AlertTriangle} title="Unable to load Payroll Adjustments" description={error} action={<button type="button" onClick={() => void loadSummaries()} className="ui-button-secondary">Retry</button>} />
      : rows.length === 0 ? <StatePanel icon={mode === 'history' ? History : Users} title={mode === 'history' ? 'No historical obligations' : 'No open obligations'} description="No Rider records match the current server-side filters." />
      : <div className="table-scroll-region" role="region" aria-label={mode === 'history' ? 'Historical Rider adjustment summaries' : 'Open Rider adjustment summaries'} tabIndex={0}>
        <table className="data-table-wide w-full min-w-[760px] text-left text-xs"><thead><tr>{['Rider', mode === 'history' ? 'History Events' : 'Open Events', 'Adjustment Types', 'Total Remaining', 'Latest Activity', ''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.rider_id}>
          <td className="px-4 py-3"><button type="button" onClick={() => openRider(row)} className="min-h-11 text-left"><span className="block font-semibold text-foreground">{row.rider_name}</span><span className="text-[10px] text-muted-foreground">{row.rider_code} · {row.hub_name}</span></button></td>
          <td className="px-4 py-3 font-semibold">{row.event_count} {mode === 'history' ? 'history' : 'open'} event{row.event_count === 1 ? '' : 's'}</td>
          <td className="px-4 py-3">{row.adjustment_type_count} type{row.adjustment_type_count === 1 ? '' : 's'}</td>
          <td className="px-4 py-3 font-mono font-bold">{php(row.total_remaining)}</td>
          <td className="px-4 py-3">{activityDate(row.latest_activity)}</td>
          <td className="px-4 py-3 text-right"><button type="button" onClick={() => openRider(row)} className="ui-button-secondary h-9 px-3 text-[11px]">View Rider</button></td>
        </tr>)}</tbody></table>
      </div>}
    <Pagination page={page} total={total} onPage={setPage} />

    <RightDrawer open={Boolean(selectedRider)} onClose={closeRider} dismissible={!saving} ariaLabel="Rider payroll adjustments" widthClassName="max-w-4xl">
      {selectedRider && drawerMode === 'summary' && <>
        <div className="flex items-start justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">{selectedRider.rider_name}</h2><p className="mt-0.5 text-xs text-muted-foreground">{selectedRider.rider_code} · {selectedRider.hub_name} · Individual obligation events</p></div><button type="button" onClick={closeRider} className="ui-icon-button" aria-label="Close Rider adjustments"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 overflow-y-auto bg-panel-bg/35 p-4 sm:p-5">{eventsLoading ? <StatePanel loading title="Loading Rider events" description="Reading individual obligation records…" /> : eventsError ? <StatePanel icon={AlertTriangle} title="Unable to load Rider events" description={eventsError} action={<button type="button" onClick={() => void loadEvents(selectedRider.rider_id, eventPage)} className="ui-button-secondary">Retry</button>} /> : grouped.length === 0 ? <StatePanel title="No individual events" description="No obligation events match this workspace." /> : <div className="space-y-4">{grouped.map((group) => <section key={group.code} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"><div className="border-b border-border bg-panel-bg/50 px-4 py-3"><h3 className="text-sm font-semibold">{group.label}</h3><p className="text-xs text-muted-foreground">{group.events.length} event{group.events.length === 1 ? '' : 's'} · {php(group.remaining)} remaining</p></div><div className="divide-y divide-border">{group.events.map((event) => <article key={event.obligation_id} className="space-y-3 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{event.adjustment_date}</span><StatusBadge tone={event.status === 'settled' ? 'success' : event.status === 'voided' ? 'neutral' : 'warning'} dot>{event.status.replace('_',' ')}</StatusBadge></div><p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">Obligation ID: {event.obligation_id}</p></div><div className="flex gap-2"><button type="button" onClick={() => void openObligation(event)} className="ui-button-secondary h-9 px-3 text-[11px]">View</button>{canManage && event.status !== 'voided' && <button type="button" onClick={() => void openObligation(event, true)} className="ui-button-secondary inline-flex h-9 items-center gap-1 px-3 text-[11px]"><Pencil className="h-3 w-3" /> Edit</button>}</div></div><Metrics obligation={event} /><div className="grid gap-3 text-xs sm:grid-cols-2"><div><span className="ui-eyebrow">Reason</span><p className="mt-1">{event.reason}</p></div><div><span className="ui-eyebrow">Reference</span><p className="mt-1">{event.reference || '—'}</p></div></div></article>)}</div></section>)}</div>}</div>
        <Pagination page={eventPage} total={eventTotal} onPage={setEventPage} />
      </>}

      {selectedObligation && drawerMode === 'details' && <>
        <div className="flex items-start justify-between border-b border-border px-5 py-4"><div><button type="button" onClick={returnToSummary} className="mb-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Back to Rider Summary</button><h2 className="font-semibold">{selectedObligation.display_name}</h2><p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">Obligation ID: {selectedObligation.obligation_id}</p></div><button type="button" onClick={closeRider} className="ui-icon-button" aria-label="Close Rider adjustments"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 space-y-5 overflow-y-auto bg-panel-bg/35 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ui-eyebrow">Adjustment Date</p><p className="mt-1 text-sm font-semibold">{selectedObligation.adjustment_date}</p></div><StatusBadge tone={selectedObligation.status === 'settled' ? 'success' : selectedObligation.status === 'voided' ? 'neutral' : 'warning'} dot>{selectedObligation.status.replace('_',' ')}</StatusBadge></div><Metrics obligation={selectedObligation} /><div className="grid gap-4 rounded-xl border border-border bg-white p-4 text-xs sm:grid-cols-2"><div><span className="ui-eyebrow">Reason</span><p className="mt-1">{selectedObligation.reason}</p></div><div><span className="ui-eyebrow">Reference</span><p className="mt-1">{selectedObligation.reference || '—'}</p></div></div><div><h3 className="ui-section-title">Allocation History</h3><div className="mt-2 divide-y divide-border rounded-xl border border-border bg-white">{allocationHistory.map((item) => <div key={item.id} className="flex justify-between p-3 text-xs"><span>{item.cutoff_start} – {item.cutoff_end}</span><span className="font-mono font-semibold">{php(Number(item.amount))}</span></div>)}{allocationHistory.length === 0 && <p className="p-4 text-xs text-muted-foreground">No allocations yet.</p>}</div></div>{canManage && selectedObligation.recovered === 0 && selectedObligation.committed === 0 && selectedObligation.planned === 0 && <div className="rounded-xl border border-border bg-white p-3"><label className="block space-y-1"><span className="ui-eyebrow">Void reason</span><textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} rows={2} className="ar-textarea" /></label><button type="button" disabled={saving || !voidReason.trim()} onClick={() => void voidObligation()} className="ui-button-secondary mt-3 h-9 px-3 text-xs">Void unused obligation</button></div>}</div>
        {canManage && selectedObligation.status !== 'voided' && <div className="flex justify-end border-t border-border p-4"><button type="button" onClick={() => setDrawerMode('edit')} className="ui-button-primary inline-flex h-10 items-center gap-2 px-4 text-xs"><Pencil className="h-4 w-4" /> Edit</button></div>}
      </>}

      {selectedObligation && drawerMode === 'edit' && <>
        <div className="flex items-start justify-between border-b border-border px-5 py-4"><div><button type="button" onClick={() => setDrawerMode('details')} className="mb-2 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"><ArrowLeft className="h-4 w-4" /> Back to Obligation Details</button><h2 className="font-semibold">Edit Deduction</h2><p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{selectedObligation.obligation_id}</p></div><button type="button" onClick={closeRider} className="ui-icon-button" aria-label="Close Rider adjustments"><X className="h-4 w-4" /></button></div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-xl border border-border bg-panel-bg p-3 text-xs"><p><b>Rider:</b> {selectedRider?.rider_name ?? 'Unknown Rider'}</p><p className="mt-1"><b>Type:</b> {selectedObligation.display_name}</p><p className="mt-2 text-[10px] text-muted-foreground">This form corrects only the selected financial event.</p></div>{selectedObligation.recovered + selectedObligation.committed > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Total Amount and Incident Date are locked because this adjustment has already been used in submitted payroll. Reason and reference may still be corrected.</div>}<label className="block space-y-1"><span className="ui-eyebrow">Total Amount</span><input type="number" value={editAmount} disabled={selectedObligation.recovered + selectedObligation.committed > 0} onChange={(event) => setEditAmount(event.target.value)} min={selectedObligation.planned} className="ar-input" /></label><label className="block space-y-1"><span className="ui-eyebrow">Incident Date</span><input type="date" value={editDate} disabled={selectedObligation.recovered + selectedObligation.committed > 0} onChange={(event) => setEditDate(event.target.value)} className="ar-input" /></label><label className="block space-y-1"><span className="ui-eyebrow">Reason</span><textarea value={editReason} onChange={(event) => setEditReason(event.target.value)} rows={3} className="ar-textarea" /></label><label className="block space-y-1"><span className="ui-eyebrow">Reference</span><input value={editReference} onChange={(event) => setEditReference(event.target.value)} className="ar-input" /></label></div>
        <div className="flex justify-end gap-2 border-t border-border p-4"><button type="button" disabled={saving} onClick={() => setDrawerMode('details')} className="ui-button-secondary h-10 px-4">Cancel</button><button type="button" disabled={saving || Number(editAmount) <= 0 || !editReason.trim()} onClick={() => void saveObligation()} className="ui-button-primary inline-flex h-10 items-center gap-2 px-4">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Correction</button></div>
      </>}
    </RightDrawer>
  </>;
}
