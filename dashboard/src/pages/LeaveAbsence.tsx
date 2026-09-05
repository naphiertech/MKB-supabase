import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { appToast } from '../hooks/useToast';
import { Modal } from '../components/common/Modal';
import { StatePanel, StatusBadge, SummaryCard } from '../components/common/DashboardPrimitives';
import { LeaveAbsenceSkeleton } from '../components/leave/LeaveAbsenceSkeleton';
import { useHub } from '../context/HubContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import {
  cancelApprovedRiderAbsenceRequest,
  getRiderAbsenceRequestDetail,
  getCurrentRiderAbsenceWindow,
  getRiderAbsenceWindowForDate,
  listRiderAbsenceRequests,
  reviewRiderAbsenceRequest,
  shiftRiderAbsenceWindow,
  type RiderAbsenceRequest,
  type RiderAbsenceRequestKind,
  type RiderAbsenceRequestStatus,
} from '../services/workforce/riderAbsenceRequestService';

type StaffLeaveView = 'pending' | 'notices' | 'approved' | 'rejected' | 'history';

const DAY_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(value: string): string {
  return DAY_FORMATTER.format(new Date(`${value}T00:00:00Z`));
}

function formatRange(request: RiderAbsenceRequest): string {
  return request.startDate === request.endDate
    ? formatDate(request.startDate)
    : `${formatDate(request.startDate)} – ${formatDate(request.endDate)}`;
}

function requestLabel(kind: RiderAbsenceRequestKind): string {
  return kind === 'planned_leave' ? 'Planned Leave' : 'Absence Notice';
}

function statusLabel(request: RiderAbsenceRequest): string {
  if (request.requestKind === 'absence_notice' && request.status === 'approved') return 'Accepted';
  return request.status.charAt(0).toUpperCase() + request.status.slice(1);
}

function statusTone(status: RiderAbsenceRequestStatus) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  if (status === 'pending') return 'warning' as const;
  return 'neutral' as const;
}

const TAB_LABELS: Array<[StaffLeaveView, string]> = [
  ['pending', 'Pending'],
  ['notices', 'Notices'],
  ['approved', 'Approved / Accepted'],
  ['rejected', 'Rejected'],
  ['history', 'History'],
];

export function LeaveAbsence() {
  const { selectedHubId } = useHub();
  const isOnline = useNetworkStatus();
  const [windowStart, setWindowStart] = useState(() => getCurrentRiderAbsenceWindow().fromDate);
  const [view, setView] = useState<StaffLeaveView>('pending');
  const [requests, setRequests] = useState<RiderAbsenceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RiderAbsenceRequest | null>(null);
  const [detail, setDetail] = useState<{ request: Record<string, unknown>; audit: Array<Record<string, unknown>> } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'cancelled' | null>(null);
  const [reason, setReason] = useState('');
  const loadSequence = useRef(0);
  const detailSequence = useRef(0);

  const { fromDate, toDate } = useMemo(() => getRiderAbsenceWindowForDate(windowStart), [windowStart]);
  const rangeLabel = `${formatDate(fromDate)} – ${formatDate(toDate)}`;

  function changeWindow(monthDelta: number) {
    const nextWindow = shiftRiderAbsenceWindow(fromDate, monthDelta);
    setRequests([]);
    setLoadError(null);
    setWindowStart(nextWindow.fromDate);
  }

  const filters = useMemo(() => {
    const status: RiderAbsenceRequestStatus | null = view === 'pending'
      ? 'pending'
      : view === 'approved'
        ? 'approved'
        : view === 'rejected'
          ? 'rejected'
          : null;
    const requestKind: RiderAbsenceRequestKind | null = view === 'notices' ? 'absence_notice' : null;
    return { status, requestKind };
  }, [view]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const fresh = await listRiderAbsenceRequests({
        fromDate,
        toDate,
        hubId: selectedHubId,
        status: filters.status,
        requestKind: filters.requestKind,
      });
      if (sequence === loadSequence.current) setRequests(fresh);
    } catch (error) {
      if (sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : 'Unable to load Leave & Absence requests.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [filters.requestKind, filters.status, fromDate, selectedHubId, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(request: RiderAbsenceRequest) {
    const sequence = ++detailSequence.current;
    setSelected(request);
    setDetail(null);
    setDecision(null);
    setReason('');
    setDetailLoading(true);
    try {
      const nextDetail = await getRiderAbsenceRequestDetail(request.id);
      if (sequence === detailSequence.current) setDetail(nextDetail);
    } catch (error) {
      if (sequence === detailSequence.current) appToast.error(error instanceof Error ? error.message : 'Unable to load request history.');
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false);
    }
  }

  async function saveDecision(nextDecision: 'approved' | 'rejected' | 'cancelled' = decision ?? 'approved') {
    if (!selected) return;
    if (!isOnline) {
      setReason('');
      appToast.error('Review actions require an online connection and were not queued.');
      return;
    }
    if (reason.trim().length < 3) {
      appToast.error(nextDecision === 'cancelled' ? 'Add a cancellation reason.' : 'Add a review reason.');
      return;
    }
    setSaving(true);
    try {
      if (nextDecision === 'cancelled') {
        await cancelApprovedRiderAbsenceRequest(selected.id, selected.revision, reason);
        appToast.success('Approved request cancelled.');
      } else {
        await reviewRiderAbsenceRequest(selected.id, selected.revision, nextDecision, reason);
        appToast.success(nextDecision === 'approved' ? 'Request approved.' : 'Request rejected.');
      }
      setSelected(null);
      setDetail(null);
      setDecision(null);
      setReason('');
      await load();
    } catch (error) {
      appToast.error(error instanceof Error ? error.message : 'Unable to save the request decision.');
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const noticeCount = requests.filter((request) => request.requestKind === 'absence_notice').length;
  const approvedCount = requests.filter((request) => request.status === 'approved').length;

  if (loading && requests.length === 0) {
    return <LeaveAbsenceSkeleton />;
  }

  return (
    <div className="dashboard-page min-w-0 space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={CalendarDays} label="Pending review" value={pendingCount} helper="Requests requiring an HR/Admin decision" tone="warning" />
        <SummaryCard icon={FileWarning} label="Absence Notices" value={noticeCount} helper="Evidence records in this view" tone="info" />
        <SummaryCard icon={Check} label="Approved / Accepted" value={approvedCount} helper="No payroll rule is applied here" tone="success" />
      </section>

      <section className="ui-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="ui-eyebrow">Authorized staff workflow</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Leave &amp; Absence</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review private Rider submissions within the stored date-effective Hub scope.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={isOnline ? 'success' : 'warning'} dot size="md">{isOnline ? 'Online' : 'Offline · read only'}</StatusBadge><span className="text-xs text-muted-foreground">{selectedHubId ? 'Selected Hub' : 'All authorized Hubs'}</span></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span>Displayed range: {rangeLabel}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => changeWindow(-1)} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Previous date range"><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous</button>
            <button type="button" onClick={() => changeWindow(1)} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Next date range">Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="Leave and absence review sections">
          {TAB_LABELS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${view === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-panel-bg hover:text-foreground'}`}>{label}</button>
          ))}
        </div>

        {loadError && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert"><span>{loadError}</span><button type="button" onClick={() => void load()} className="ui-button-secondary inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry</button></div>}

        {requests.length === 0 ? (
          <StatePanel compact icon={view === 'notices' ? ShieldAlert : History} title="No requests in this view" description="Change the review section or Hub workspace, or wait for a Rider submission." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border" role="region" aria-label="Leave and absence request list" tabIndex={0}>
            <table className="min-w-[50rem] w-full text-sm">
              <thead className="bg-panel-bg text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 text-left font-semibold">Rider</th><th className="px-4 py-3 text-left font-semibold">Type</th><th className="px-4 py-3 text-left font-semibold">Dates</th><th className="px-4 py-3 text-left font-semibold">Status</th><th className="px-4 py-3 text-left font-semibold">Updated</th><th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-border">{requests.map((request) => <tr key={request.id} className="hover:bg-panel-bg/50"><td className="px-4 py-3"><p className="font-semibold text-foreground">{request.riderName}</p><p className="mt-0.5 text-xs text-muted-foreground">{request.riderMkbId} · {request.hubName}</p></td><td className="px-4 py-3 text-xs text-foreground">{requestLabel(request.requestKind)}</td><td className="px-4 py-3 whitespace-nowrap text-xs text-foreground">{formatRange(request)}</td><td className="px-4 py-3"><StatusBadge tone={statusTone(request.status)} dot>{statusLabel(request)}</StatusBadge></td><td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(request.updatedAt).toLocaleString('en-PH')}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void openDetail(request)} className="ui-button-secondary">Review</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={Boolean(selected)} onClose={() => !saving && setSelected(null)} title={selected ? `${requestLabel(selected.requestKind)} · ${selected.riderName}` : undefined} subtitle={selected ? `${formatRange(selected)} · ${selected.hubName}` : undefined} size="lg" dismissible={!saving}>
        {selected && <div className="space-y-4">
          {detailLoading ? <StatePanel loading compact title="Loading request history" /> : <>
            <div className="rounded-xl border border-border bg-panel-bg/45 p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-foreground">{statusLabel(selected)}</span><StatusBadge tone={statusTone(selected.status)} dot>Revision {selected.revision}</StatusBadge></div><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Private reason</p><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{selected.reason || 'No reason returned.'}</p>{selected.reviewReason && <p className="mt-3 text-xs text-muted-foreground"><span className="font-semibold">Review note:</span> {selected.reviewReason}</p>}</div>
            {selected.status === 'pending' && <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4"><p className="text-xs font-semibold text-blue-950">Review decision</p><p className="mt-1 text-xs text-blue-900">A reason is required and will be stored in immutable request history.</p><textarea value={reason} onChange={(event) => setReason(event.target.value)} className="ui-textarea mt-3 min-h-24 w-full bg-white" placeholder="Explain the approval or rejection decision." disabled={saving || !isOnline} /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setDecision('rejected'); void saveDecision('rejected'); }} disabled={saving || !isOnline} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"><X className="h-3.5 w-3.5" aria-hidden="true" /> Reject</button><button type="button" onClick={() => { setDecision('approved'); void saveDecision('approved'); }} disabled={saving || !isOnline} className="ui-button-primary inline-flex items-center gap-1.5 disabled:opacity-50"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve</button></div></div>}
            {selected.status === 'approved' && <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><p className="text-xs font-semibold text-amber-950">Cancel approved request</p><textarea value={reason} onChange={(event) => setReason(event.target.value)} className="ui-textarea mt-3 min-h-20 w-full bg-white" placeholder="Explain why the approved request is being cancelled." disabled={saving || !isOnline} /><div className="mt-3 flex justify-end"><button type="button" onClick={() => { setDecision('cancelled'); void saveDecision('cancelled'); }} disabled={saving || !isOnline} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Cancel approved request</button></div></div>}
            <div><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" aria-hidden="true" /><h3 className="text-sm font-semibold text-foreground">Immutable history</h3></div><div className="mt-2 space-y-2">{(detail?.audit ?? []).map((event) => <div key={String(event.id)} className="rounded-lg border border-border px-3 py-2 text-xs"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold capitalize text-foreground">{String(event.action)}</span><span className="text-muted-foreground">Revision {String(event.revision)} · {event.created_at ? new Date(String(event.created_at)).toLocaleString('en-PH') : '—'}</span></div><p className="mt-1 text-muted-foreground">{String(event.reason)}</p>{Boolean(event.actor_name) && <p className="mt-1 text-[11px] text-muted-foreground">Actor: {String(event.actor_name)}</p>}</div>)}</div></div>
          </>}
        </div>}
      </Modal>
    </div>
  );
}
