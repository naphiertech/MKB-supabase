import { useEffect, useId, useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { StatePanel, StatusBadge } from '../common/DashboardPrimitives';
import { getCurrentRiderAbsenceWindow } from '../../services/workforce/riderAbsenceRequestService';
import {
  listFinancialConsequencesForPayroll, listMyFinancialConsequences, financialReadErrorMessage,
  FINANCIAL_PAGE_SIZE, FINANCIAL_STATUS_LABELS, COMPENSATION_RECORDED_LABEL, formatFinancialAmount,
  type FinancialDecisionRow, type MyFinancialConsequenceRow, type FinancialDecisionStatus,
} from '../../services/attendance/absenceFinancialService';

type Props = { audience: 'rider' } | {
  audience: 'payroll'; hubId?: string | null;
  hubs: Array<{ id: string; name: string }>; riders: Array<{ id: string; name: string }>;
};
type HistoryRow = FinancialDecisionRow | MyFinancialConsequenceRow;
const OBLIGATION_LABELS: Record<string, string> = {
  open: 'Open obligation', partially_recovered: 'Partially recovered obligation',
  settled: 'Settled obligation', voided: 'Voided obligation',
};
export function FinancialAbsenceHistory(props: Props) {
  const { session } = useAuth();
  const permitted = props.audience === 'rider' ? session?.role === 'rider'
    : session?.role === 'admin' || session?.role === 'payroll';
  if (!session || !permitted || session.accountStatus === 'suspended' || session.employmentStatus === 'archived') {
    return <StatePanel compact title="Financial history is unavailable for this account." />;
  }
  // The auth identity is only a UI lifecycle key, never a Rider RPC argument.
  return <FinancialHistory key={JSON.stringify([session.id, session.role, props.audience, props.audience === 'payroll' ? props.hubId : null])} {...props} />;
}

function FinancialHistory(props: Props) {
  const online = useNetworkStatus();
  const formId = useId();
  const [window] = useState(() => getCurrentRiderAbsenceWindow());
  const [from, setFrom] = useState(window.fromDate);
  const [to, setTo] = useState(window.toDate);
  const [hub, setHub] = useState(props.audience === 'payroll' ? props.hubId ?? '' : '');
  const [rider, setRider] = useState('');
  const [status, setStatus] = useState<FinancialDecisionStatus | ''>('');
  const [query, setQuery] = useState({ startDate: window.fromDate, endDate: window.toDate, hubId: hub, riderId: '', status: '' as FinancialDecisionStatus | '', page: 0 });
  const [refresh, setRefresh] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; rows: HistoryRow[]; loading: boolean; error: string | null }>({
    key: '', rows: [], loading: true, error: null,
  });
  const key = JSON.stringify(query);
  useEffect(() => {
    let current = true;
    if (!online) {
      setResult({ key, rows: [], loading: false, error: null });
      return () => { current = false; };
    }
    setResult({ key, rows: [], loading: true, error: null });
    const input = { startDate: query.startDate, endDate: query.endDate, status: query.status || null, page: query.page };
    const request = props.audience === 'payroll'
      ? listFinancialConsequencesForPayroll({ ...input, hubId: query.hubId || null, riderId: query.riderId || null })
      : listMyFinancialConsequences(input);
    void request.then(rows => {
      if (current) setResult({ key, rows, loading: false, error: null });
    }).catch(error => {
      if (current) setResult({ key, rows: [], loading: false, error: financialReadErrorMessage(error) });
    });
    return () => { current = false; };
  }, [online, query, key, refresh, props.audience]);

  const rows = online && result.key === key ? result.rows : [];
  const loading = online && (result.key !== key || result.loading);
  const error = online && result.key === key ? result.error : null;
  function apply(event: FormEvent) {
    event.preventDefault();
    const start = Date.parse(from + 'T00:00:00Z'), end = Date.parse(to + 'T00:00:00Z');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || (end - start) / 86400000 > 31) {
      setFormError('Choose a valid date window of at most 32 calendar days.'); return;
    }
    setFormError(null);
    setQuery({ startDate: from, endDate: to, hubId: hub, riderId: rider, status, page: 0 });
  }
  const isPayroll = props.audience === 'payroll';
  return <section className="min-w-0 space-y-4 p-4" aria-label={isPayroll ? 'Absence decisions for Payroll' : 'My financial absence history'}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="ui-section-title">{isPayroll ? 'Absence decisions' : 'Financial absence history'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Recorded decisions and financial links. Confirmation does not prove deduction, and compensation does not prove payment.</p></div>
      <button type="button" className="ui-button-secondary" disabled={!online || loading} onClick={() => setRefresh(n => n + 1)}>Refresh</button>
    </header>
    <form onSubmit={apply} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label htmlFor={formId + '-from'} className="text-xs font-semibold">From date
        <input id={formId + '-from'} aria-label="From date" type="date" className="ui-control mt-1 w-full" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label htmlFor={formId + '-to'} className="text-xs font-semibold">To date
        <input id={formId + '-to'} aria-label="To date" type="date" className="ui-control mt-1 w-full" value={to} onChange={e => setTo(e.target.value)} /></label>
      <label htmlFor={formId + '-status'} className="text-xs font-semibold">Consequence status
        <select id={formId + '-status'} aria-label="Consequence status" className="ui-control mt-1 w-full" value={status} onChange={e => setStatus(e.target.value as FinancialDecisionStatus | '')}>
          <option value="">All statuses</option>
          {Object.entries(FINANCIAL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      {props.audience === 'payroll' && <>
        <label htmlFor={formId + '-hub'} className="text-xs font-semibold">Hub
          <select id={formId + '-hub'} aria-label="Hub" className="ui-control mt-1 w-full" value={hub} onChange={e => setHub(e.target.value)}>
            <option value="">All authorized hubs</option>{props.hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></label>
        <label htmlFor={formId + '-rider'} className="text-xs font-semibold">Rider
          <select id={formId + '-rider'} aria-label="Rider" className="ui-control mt-1 w-full" value={rider} onChange={e => setRider(e.target.value)}>
            <option value="">All Riders</option>{props.riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label>
      </>}
      <button type="submit" className="ui-button-secondary self-end" disabled={!online || loading}>Apply filters</button>
    </form>
    {formError && <p role="alert" className="text-sm text-rose-700">{formError}</p>}
    {!online ? <StatePanel compact title="Financial history is unavailable offline" description="Connect to load current server records. No financial information is stored for offline use." />
      : loading ? <StatePanel compact loading title="Loading financial absence information" />
        : error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p>{error}</p><button type="button" className="ui-button-secondary mt-2" onClick={() => setRefresh(n => n + 1)}>Retry</button>
        </div>
          : !rows.length ? <StatePanel compact title={isPayroll ? 'No absence-related financial records found for this period.' : 'You have no absence-related financial records for this period.'} />
            : <div className="space-y-3">{rows.map(row => {
              const detail = isPayroll && 'rider_name' in row ? row : null;
              const hasObligation = detail ? Boolean(detail.deduction_obligation_id) : 'has_obligation' in row && row.has_obligation;
              return <article key={row.consequence_id} className="ui-card min-w-0 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 break-words">{detail && <h3 className="text-sm font-semibold">{detail.rider_name} · {detail.rider_code}</h3>}
                    {detail && <p className="text-xs text-muted-foreground">{detail.hub_name} · Historical hub</p>}
                    <p className="mt-1 text-xs font-medium">{row.business_date}</p></div>
                  <StatusBadge tone={row.status === 'confirmed' ? 'warning' : row.is_reversed ? 'info' : 'success'}>{FINANCIAL_STATUS_LABELS[row.status]}</StatusBadge>
                </div>
                <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-muted-foreground">Policy amount</dt><dd className="mt-1 font-mono">{formatFinancialAmount(row.policy_penalty_amount, row.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Recorded amount</dt><dd className="mt-1 font-mono">{formatFinancialAmount(row.applied_amount, row.currency)}</dd></div>
                  <div><dt className="text-muted-foreground">Payroll obligation</dt><dd className="mt-1">{hasObligation ? 'Payroll Obligation Created' : 'No Payroll obligation recorded'}</dd>
                    {detail?.obligation_status && <dd className="mt-1">{OBLIGATION_LABELS[detail.obligation_status] || 'Obligation state unavailable'}</dd>}</div>
                  {detail?.deduction_obligation_id && <>
                    <div><dt className="text-muted-foreground">Outstanding balance</dt><dd className="mt-1 font-mono">{formatFinancialAmount(detail.obligation_outstanding, row.currency)}</dd></div>
                    <div><dt className="text-muted-foreground">Available to allocate</dt><dd className="mt-1 font-mono">{formatFinancialAmount(detail.obligation_available_to_allocate, row.currency)}</dd></div>
                  </>}
                  {row.has_compensation && <div><dt className="text-muted-foreground">Compensation</dt><dd className="mt-1">{COMPENSATION_RECORDED_LABEL}</dd></div>}
                </dl>
              </article>;
            })}</div>}
    <footer className="flex items-center justify-between gap-2 text-xs" aria-label="Financial history pagination">
      <button type="button" className="ui-button-secondary" disabled={!online || loading || Boolean(error) || query.page === 0} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>Previous</button>
      <span aria-live="polite">Page {query.page + 1}</span>
      <button type="button" className="ui-button-secondary" disabled={!online || loading || Boolean(error) || rows.length < FINANCIAL_PAGE_SIZE || (query.page + 1) * FINANCIAL_PAGE_SIZE > 100000} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>Next</button>
    </footer>
  </section>;
}
