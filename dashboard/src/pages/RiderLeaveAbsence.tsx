import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  History,
  Loader2,
  RefreshCw,
  Send,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../components/common/Modal';
import { StatePanel, StatusBadge, SummaryCard } from '../components/common/DashboardPrimitives';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { createSyncOperationId } from '../lib/storage';
import {
  getCurrentRiderAbsenceWindow,
  getCachedRiderAbsenceRequests,
  getManilaBusinessDate,
  getRiderAbsenceWindowForDate,
  listRiderAbsenceRequests,
  shiftRiderAbsenceWindow,
  submitAbsenceNotice,
  submitPlannedLeave,
  setCachedRiderAbsenceRequests,
  validateAbsenceNoticeInput,
  validatePlannedLeaveInput,
  withdrawRiderAbsenceRequest,
  type RiderAbsenceRequest,
} from '../services/workforce/riderAbsenceRequestService';

type RiderLeaveView = 'request_leave' | 'report_absence' | 'current' | 'history';

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

function requestLabel(kind: RiderAbsenceRequest['requestKind']): string {
  return kind === 'planned_leave' ? 'Planned Leave' : 'Absence Notice';
}

function statusLabel(request: RiderAbsenceRequest): string {
  if (request.requestKind === 'absence_notice' && request.status === 'approved') return 'Accepted';
  return request.status.charAt(0).toUpperCase() + request.status.slice(1);
}

function statusTone(status: RiderAbsenceRequest['status']) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected') return 'danger' as const;
  if (status === 'pending') return 'warning' as const;
  return 'neutral' as const;
}

interface RiderLeaveAbsenceProps {
  userId: string;
  riderId: string;
}

export function RiderLeaveAbsence(props: RiderLeaveAbsenceProps) {
  return <RiderLeaveAbsenceContent key={`${props.userId}:${props.riderId}`} {...props} />;
}

function RiderLeaveAbsenceContent({ userId, riderId }: RiderLeaveAbsenceProps) {
  const isOnline = useNetworkStatus();
  const identityKey = `${userId}:${riderId}`;
  const [windowStart, setWindowStart] = useState(() => getCurrentRiderAbsenceWindow().fromDate);
  const [view, setView] = useState<RiderLeaveView>('current');
  const [requests, setRequests] = useState<RiderAbsenceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cacheState, setCacheState] = useState<'empty' | 'cached' | 'fresh' | 'failed'>('empty');
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [plannedStart, setPlannedStart] = useState(() => getManilaBusinessDate(new Date(Date.now() + 86400000)));
  const [plannedEnd, setPlannedEnd] = useState(() => getManilaBusinessDate(new Date(Date.now() + 86400000)));
  const [plannedReason, setPlannedReason] = useState('');
  const [plannedRequestKey, setPlannedRequestKey] = useState(createSyncOperationId);
  const [absenceDate, setAbsenceDate] = useState(getManilaBusinessDate);
  const [absenceReason, setAbsenceReason] = useState('');
  const [absenceRequestKey, setAbsenceRequestKey] = useState(createSyncOperationId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<RiderAbsenceRequest | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const loadSequence = useRef(0);
  const mountedRef = useRef(false);
  const activeIdentityRef = useRef(identityKey);
  const plannedAttemptSignature = useRef<string | null>(null);
  const absenceAttemptSignature = useRef<string | null>(null);

  const { fromDate, toDate } = useMemo(() => getRiderAbsenceWindowForDate(windowStart), [windowStart]);
  const rangeLabel = `${formatDate(fromDate)} – ${formatDate(toDate)}`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSequence.current += 1;
    };
  }, []);

  useEffect(() => {
    activeIdentityRef.current = identityKey;
    loadSequence.current += 1;
    setRequests([]);
    setCachedAt(null);
    setCacheState('empty');
    setLoadError(null);
    plannedAttemptSignature.current = null;
    absenceAttemptSignature.current = null;
  }, [identityKey]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const isActive = () => mountedRef.current
      && activeIdentityRef.current === identityKey
      && sequence === loadSequence.current;
    setLoadError(null);
    setLoading(true);

    let hasCache = false;
    try {
      const cached = await getCachedRiderAbsenceRequests(userId, riderId, fromDate, toDate);
      if (cached && isActive()) {
        setRequests(cached.requests);
        setCachedAt(cached.cachedAt);
        setCacheState('cached');
        hasCache = true;
      }
    } catch {
      // The cache helper is intentionally fault-isolated; online data remains authoritative.
    }

    if (!isActive()) return;

    if (!isOnline) {
      setLoading(false);
      if (!hasCache) setLoadError('You are offline and no cached Leave & Absence history is available.');
      return;
    }

    try {
      const fresh = await listRiderAbsenceRequests({ fromDate, toDate, riderId });
      if (!isActive()) return;
      setRequests(fresh);
      setCacheState('fresh');
      const timestamp = new Date().toISOString();
      setCachedAt(timestamp);
      if (!isActive()) return;
      await setCachedRiderAbsenceRequests({ userId, riderId, cacheVersion: 1, fromDate, toDate, requests: fresh, cachedAt: timestamp });
    } catch (error) {
      if (isActive() && !hasCache) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load Leave & Absence history.');
      }
      if (isActive() && hasCache) {
        setCacheState('failed');
        setLoadError(error instanceof Error ? error.message : 'Server revalidation failed; showing cached history.');
      }
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [fromDate, identityKey, isOnline, riderId, toDate, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending' || request.status === 'approved'),
    [requests],
  );
  const visibleRequests = view === 'current' ? currentRequests : requests;

  function changeWindow(monthDelta: number) {
    const nextWindow = shiftRiderAbsenceWindow(fromDate, monthDelta);
    setRequests([]);
    setCachedAt(null);
    setCacheState('empty');
    setLoadError(null);
    setWindowStart(nextWindow.fromDate);
  }

  function focusWindowForDate(date: string): boolean {
    const nextWindow = getRiderAbsenceWindowForDate(date);
    const changed = nextWindow.fromDate !== fromDate || nextWindow.toDate !== toDate;
    if (changed) {
      setRequests([]);
      setCachedAt(null);
      setCacheState('empty');
      setLoadError(null);
      setWindowStart(nextWindow.fromDate);
    }
    return changed;
  }

  async function handlePlannedLeaveSubmit() {
    const validation = validatePlannedLeaveInput({ startDate: plannedStart, endDate: plannedEnd, reason: plannedReason });
    if (validation) {
      setActionError(validation);
      return;
    }
    if (!isOnline) {
      setActionError('Planned Leave requests require an online connection and were not queued.');
      return;
    }
    setSaving(true);
    setActionError(null);
    const signature = `${plannedStart}|${plannedEnd}|${plannedReason.trim()}`;
    let requestKey = plannedRequestKey;
    if (plannedAttemptSignature.current && plannedAttemptSignature.current !== signature) {
      requestKey = createSyncOperationId();
      setPlannedRequestKey(requestKey);
    }
    plannedAttemptSignature.current = signature;
    try {
      await submitPlannedLeave({ startDate: plannedStart, endDate: plannedEnd, reason: plannedReason, requestKey });
      toast.success('Planned Leave submitted for review.');
      setPlannedReason('');
      plannedAttemptSignature.current = null;
      setPlannedRequestKey(createSyncOperationId());
      setView('current');
      if (!focusWindowForDate(plannedStart)) await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to submit Planned Leave.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAbsenceNoticeSubmit() {
    const validation = validateAbsenceNoticeInput({ date: absenceDate, reason: absenceReason });
    if (validation) {
      setActionError(validation);
      return;
    }
    if (!isOnline) {
      setActionError('Absence Notices require an online connection and were not queued.');
      return;
    }
    setSaving(true);
    setActionError(null);
    const signature = `${absenceDate}|${absenceReason.trim()}`;
    let requestKey = absenceRequestKey;
    if (absenceAttemptSignature.current && absenceAttemptSignature.current !== signature) {
      requestKey = createSyncOperationId();
      setAbsenceRequestKey(requestKey);
    }
    absenceAttemptSignature.current = signature;
    try {
      await submitAbsenceNotice({ date: absenceDate, reason: absenceReason, requestKey });
      toast.success('Absence Notice submitted for review.');
      setAbsenceReason('');
      absenceAttemptSignature.current = null;
      setAbsenceRequestKey(createSyncOperationId());
      setView('current');
      if (!focusWindowForDate(absenceDate)) await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to submit the Absence Notice.');
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawTarget) return;
    if (!isOnline) {
      setActionError('Withdrawals require an online connection and were not queued.');
      return;
    }
    if (withdrawReason.trim().length < 3) {
      setActionError('Add a withdrawal reason of at least three characters.');
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      await withdrawRiderAbsenceRequest(withdrawTarget.id, withdrawTarget.revision, withdrawReason);
      toast.success('Request withdrawn.');
      setWithdrawTarget(null);
      setWithdrawReason('');
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to withdraw the request.');
    } finally {
      setSaving(false);
    }
  }

  if (loading && requests.length === 0) {
    return <StatePanel loading title="Loading Leave & Absence" description="Preparing your private request history." />;
  }

  return (
    <div className="dashboard-page min-w-0 space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard icon={CalendarDays} label="Current requests" value={currentRequests.length} helper="Pending or approved" tone="brand" />
        <SummaryCard icon={FileWarning} label="Absence Notices" value={requests.filter((request) => request.requestKind === 'absence_notice').length} helper="Review evidence only" tone="warning" />
        <SummaryCard icon={History} label="History" value={requests.length} helper="Within the displayed range" tone="info" />
      </section>

      <section className="ui-card space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="ui-eyebrow">Rider self-service</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Leave &amp; Absence</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Submit a full-day Planned Leave request or record an Absence Notice for HR review.</p>
          </div>
          <StatusBadge tone={isOnline ? 'success' : 'warning'} dot size="md">
            {!isOnline ? 'Offline view' : cacheState === 'cached' ? 'Cached / Revalidating' : cacheState === 'failed' ? 'Cached / Revalidation failed' : 'Online'}
          </StatusBadge>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span>Displayed range: {rangeLabel}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => changeWindow(-1)} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Previous date range"><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous</button>
            <button type="button" onClick={() => changeWindow(1)} className="ui-button-secondary inline-flex items-center gap-1.5" aria-label="Next date range">Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-3" role="tablist" aria-label="Leave and absence sections">
          {([
            ['current', 'Current Requests'],
            ['request_leave', 'Request Leave'],
            ['report_absence', 'Report Absence'],
            ['history', 'History'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => { setView(key); setActionError(null); }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${view === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-panel-bg hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {(cacheState === 'cached' || cacheState === 'failed') && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>{cacheState === 'failed' ? 'Cached copy · server revalidation failed; may be stale.' : 'Cached copy · may be stale. Private reasons are hidden in offline cache.'}</span>
            {cachedAt && <span>Cached {new Date(cachedAt).toLocaleString('en-PH')}</span>}
          </div>
        )}
        {loadError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => void load()} className="ui-button-secondary inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry</button>
          </div>
        )}

        {view === 'request_leave' && (
          <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-panel-bg/45 p-4">
            <div><h2 className="text-sm font-semibold text-foreground">Request Planned Leave</h2><p className="mt-1 text-xs text-muted-foreground">Use full Manila business dates. HR/Admin will review the request.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-semibold text-foreground">Start date<input type="date" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} className="ui-control mt-1.5 min-h-11" disabled={saving || !isOnline} /></label>
              <label className="space-y-1.5 text-xs font-semibold text-foreground">End date<input type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} className="ui-control mt-1.5 min-h-11" disabled={saving || !isOnline} /></label>
            </div>
            <label className="block space-y-1.5 text-xs font-semibold text-foreground">Reason<textarea value={plannedReason} onChange={(event) => setPlannedReason(event.target.value)} className="ui-textarea mt-1.5 min-h-28 w-full" placeholder="Explain why you need the leave." disabled={saving || !isOnline} /></label>
            <p className="text-xs text-muted-foreground">No leave balance, paid/unpaid, statutory, or payroll result is calculated by this workflow.</p>
            {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{actionError}</p>}
            <button type="button" onClick={() => void handlePlannedLeaveSubmit()} disabled={saving || !isOnline} className="ui-button-primary inline-flex items-center gap-2"><Send className="h-4 w-4" aria-hidden="true" />{saving ? 'Submitting…' : 'Submit Planned Leave'}</button>
          </div>
        )}

        {view === 'report_absence' && (
          <div className="max-w-2xl space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div><h2 className="text-sm font-semibold text-foreground">Report Absence</h2><p className="mt-1 text-xs text-muted-foreground">An Absence Notice records evidence for one Manila business date. It is not a payroll decision.</p></div>
            <label className="block max-w-xs space-y-1.5 text-xs font-semibold text-foreground">Business date<input type="date" value={absenceDate} onChange={(event) => setAbsenceDate(event.target.value)} className="ui-control mt-1.5 min-h-11" disabled={saving || !isOnline} /></label>
            <label className="block space-y-1.5 text-xs font-semibold text-foreground">Reason<textarea value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} className="ui-textarea mt-1.5 min-h-28 w-full" placeholder="Explain why you could not report." disabled={saving || !isOnline} /></label>
            <p className="text-xs text-amber-900">The notice is not submitted until the server confirms it. Offline attempts are not queued.</p>
            {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{actionError}</p>}
            <button type="button" onClick={() => void handleAbsenceNoticeSubmit()} disabled={saving || !isOnline} className="ui-button-primary inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4" aria-hidden="true" />{saving ? 'Submitting…' : 'Submit Absence Notice'}</button>
          </div>
        )}

        {(view === 'current' || view === 'history') && (
          visibleRequests.length === 0 ? (
            <StatePanel compact icon={view === 'current' ? CalendarDays : History} title={view === 'current' ? 'No current requests' : 'No request history'} description={view === 'current' ? 'Submit Planned Leave or Report Absence when you need to record a request.' : 'Requests in the displayed Manila date range will appear here.'} />
          ) : (
            <div className="space-y-3" aria-live="polite">
              {visibleRequests.map((request) => (
                <article key={request.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold text-foreground">{requestLabel(request.requestKind)}</h2><StatusBadge tone={statusTone(request.status)} dot>{statusLabel(request)}</StatusBadge></div>
                      <p className="mt-1 text-sm font-medium text-foreground">{formatRange(request)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Submitted {new Date(request.submittedAt).toLocaleString('en-PH')} · Revision {request.revision}</p>
                    </div>
                    {request.status === 'pending' && (
                      <button type="button" onClick={() => { setWithdrawTarget(request); setWithdrawReason(''); setActionError(null); }} disabled={!isOnline} className="ui-button-secondary inline-flex items-center gap-1.5"><Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Withdraw</button>
                    )}
                  </div>
                  <div className="mt-3 border-t border-border/70 pt-3 text-xs">
                    <p className="font-semibold text-muted-foreground">Reason</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{request.reason ?? 'Reason unavailable in offline cache.'}</p>
                    {request.reviewReason && <p className="mt-2 text-muted-foreground"><span className="font-semibold">Review note:</span> {request.reviewReason}</p>}
                  </div>
                </article>
              ))}
            </div>
          )
        )}
      </section>

      <Modal open={Boolean(withdrawTarget)} onClose={() => !saving && setWithdrawTarget(null)} title="Withdraw request" subtitle={withdrawTarget ? `${requestLabel(withdrawTarget.requestKind)} · ${formatRange(withdrawTarget)}` : undefined} dismissible={!saving}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Withdrawal is available only while the request is pending. This action is recorded in the request history.</p>
          <label className="block space-y-1.5 text-xs font-semibold text-foreground">Withdrawal reason<textarea value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} className="ui-textarea mt-1.5 min-h-24 w-full" disabled={saving} /></label>
          {actionError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">{actionError}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setWithdrawTarget(null)} disabled={saving} className="ui-button-secondary">Keep request</button><button type="button" onClick={() => void handleWithdraw()} disabled={saving || !isOnline} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Withdraw</button></div>
        </div>
      </Modal>
    </div>
  );
}
