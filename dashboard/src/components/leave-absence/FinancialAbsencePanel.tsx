import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAttendanceContextVersion } from '../../hooks/useAttendanceContextVersion';
import { appToast } from '../../hooks/useToast';
import { Modal } from '../common/Modal';
import { StatePanel, StatusBadge } from '../common/DashboardPrimitives';
import { createSyncOperationId } from '../../lib/storage';
import { getAssessmentReasonLabel, getAssessmentStatusLabel } from '../../services/attendance/absenceAssessmentService';
import {
  loadFinancialAbsencePage, confirmAbsenceFinancialDecision, waiveAbsenceFinancialDecision,
  sendAbsenceToPayroll, reverseAbsenceFinancialDecision, financialErrorMessage,
  FINANCIAL_PAGE_SIZE, FINANCIAL_REASON_LABELS, FINANCIAL_STATUS_LABELS,
  COMPENSATION_RECORDED_LABEL, formatFinancialAmount,
  type FinancialReviewRow, type WaiverCategory,
} from '../../services/attendance/absenceFinancialService';

interface Props {
  startDate: string; endDate: string; hubId?: string | null; riderId?: string | null;
  riderNames?: Record<string, string>;
}
type Action = 'confirm' | 'waive' | 'send' | 'reverse';
const TITLES: Record<Action, string> = {
  confirm: 'Confirm Financial Decision', waive: 'Waive Penalty',
  send: 'Send to Payroll', reverse: 'Reverse Decision',
};
const SUCCESS: Record<Action, string> = {
  confirm: 'Financial Penalty Confirmed', waive: 'Penalty Waived',
  send: 'Payroll Obligation Created', reverse: 'Financial Penalty Reversed',
};
const rowKey = (row: FinancialReviewRow) => `${row.rider_id}:${row.business_date}`;

export function FinancialAbsencePanel(props: Props) {
  const { session } = useAuth();
  if (!session || (session.role !== 'admin' && session.role !== 'hr')) {
    return <StatePanel compact title="Financial review is available to Admin and HR." />;
  }
  // Scope/account changes discard drafts and detach late reads/mutation feedback.
  return <FinancialReview key={JSON.stringify([session.id, session.role, props.hubId, props.startDate, props.endDate, props.riderId])}
    {...props} role={session.role} />;
}

function FinancialReview({ startDate, endDate, hubId, riderId, riderNames, role }: Props & { role: 'admin' | 'hr' }) {
  const online = useNetworkStatus();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const contextVersion = useAttendanceContextVersion();
  const [rows, setRows] = useState<FinancialReviewRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ kind: Action; key: string } | null>(null);
  const [supervisor, setSupervisor] = useState('');
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState('');
  const [category, setCategory] = useState<WaiverCategory>('emergency');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [policyDenied, setPolicyDenied] = useState<Set<string>>(() => new Set());
  const alive = useRef(true);
  const sequence = useRef(0);
  const submitting = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    if (!onlineRef.current) { setRows([]); setLoading(false); setLoadError(null); return; }
    setLoading(true); setLoadError(null);
    try {
      const fresh = await loadFinancialAbsencePage({ startDate, endDate, hubId, riderId, page }, role);
      if (alive.current && request === sequence.current) setRows(fresh);
    } catch (error) {
      if (alive.current && request === sequence.current) setLoadError(financialErrorMessage(error));
    } finally {
      if (alive.current && request === sequence.current) setLoading(false);
    }
  }, [startDate, endDate, hubId, riderId, page, role, online]);
  useEffect(() => { void load(); }, [load, contextVersion]);

  const disabled = !online || loading || saving || Boolean(loadError);
  const current = rows.find(row => rowKey(row) === selected?.key);
  function actionable(row: FinancialReviewRow, kind: Action) {
    if (kind === 'confirm' || kind === 'waive') {
      return Boolean(row.financial_eligibility_reason && row.requires_confirmation && !row.existing_consequence_id
        && row.policyApplicable && !policyDenied.has(rowKey(row)));
    }
    if (role !== 'admin' || row.existing_consequence_status !== 'confirmed' || !row.existing_consequence_id) return false;
    return kind === 'reverse' || Boolean(row.financial && row.financial.status === 'confirmed' && !row.financial.deduction_obligation_id);
  }
  function open(row: FinancialReviewRow, kind: Action) {
    if (disabled || !actionable(row, kind)) return;
    setSelected({ kind, key: rowKey(row) }); setSupervisor(''); setNotes(''); setEvidence('');
    setCategory('emergency'); setDialogError(null); attempt.current = null;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || disabled || !selected || !current || !actionable(current, selected.kind)) return;
    const { kind } = selected;
    if ((kind === 'confirm' || kind === 'waive') && (!supervisor.trim() || !notes.trim())) {
      setDialogError('Supervisor name and decision notes are required.'); return;
    }
    if (kind === 'reverse' && !notes.trim()) { setDialogError('A reversal reason is required.'); return; }
    if (supervisor.trim().length > 120 || notes.trim().length > 500 || evidence.trim().length > 200) {
      setDialogError('One or more fields exceed the allowed length.'); return;
    }
    submitting.current = true; setSaving(true); setDialogError(null);
    try {
      if (kind === 'confirm' || kind === 'waive') {
        const signature = JSON.stringify([selected.key, kind, supervisor.trim(), notes.trim(), evidence.trim(), kind === 'waive' ? category : null]);
        if (attempt.current?.signature !== signature) attempt.current = { signature, key: createSyncOperationId() };
        const input = { riderId: current.rider_id, businessDate: current.business_date,
          confirmationKey: attempt.current.key, supervisorName: supervisor.trim(), decisionNotes: notes.trim(), evidenceReference: evidence.trim() };
        if (kind === 'confirm') await confirmAbsenceFinancialDecision(input);
        else await waiveAbsenceFinancialDecision({ ...input, category });
      } else if (kind === 'send') {
        await sendAbsenceToPayroll(current.existing_consequence_id!);
      } else {
        await reverseAbsenceFinancialDecision(current.existing_consequence_id!, notes.trim(), evidence.trim());
      }
      if (!alive.current) return;
      appToast.success(SUCCESS[kind]);
      setSelected(null);
      await load();
    } catch (error) {
      if (!alive.current) return;
      const message = financialErrorMessage(error);
      setDialogError(message);
      if (message === 'Financial Policy V2 is not active for this date.') {
        setPolicyDenied(previous => new Set(previous).add(selected.key));
      }
      // A failed response can still follow a committed operation. Refresh before
      // offering another attempt; the same unchanged input keeps its retry key.
      await load();
    } finally {
      submitting.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return <section className="space-y-4" aria-label="Absence financial review">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold">Financial review</h2>
        <p className="mt-1 text-xs text-muted-foreground">Attendance assessment, human decision, and Payroll processing are separate steps.</p></div>
      <button type="button" className="ui-button-secondary inline-flex items-center gap-2" onClick={() => void load()} disabled={!online || loading || saving}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh financial review
      </button>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
      <strong>Eligibility preview.</strong> Preview does not record a financial decision. Confirm and Waive require an applicable official Policy V2; the server checks again when you submit.
    </div>
    {!online && <p role="status" className="text-sm text-muted-foreground">Connect to the internet to record a financial decision.</p>}
    {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <span>{loadError}</span><button type="button" className="ui-button-secondary" onClick={() => void load()} disabled={loading}>Retry</button>
    </div>}
    {!online ? <StatePanel compact title="Financial review is unavailable offline" description="Connect to load current server records." />
      : loading && rows.length === 0 ? <StatePanel compact loading title="Loading financial review" />
      : !rows.length && !loadError ? <StatePanel compact title="No financial review rows" description="Try another date window or Hub." />
      : <div className="space-y-3" aria-busy={loading}>{rows.map(row => {
        const pending = Boolean(row.financial_eligibility_reason && row.requires_confirmation && !row.existing_consequence_id);
        const name = riderNames?.[row.rider_id] || row.financial?.rider_name || row.rider_id;
        const amount = row.financial ? Number(row.financial.applied_amount) : null;
        return <article key={rowKey(row)} className="ui-card min-w-0 p-4" aria-label={`${name} · ${row.business_date}`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 break-words"><h3 className="text-sm font-semibold">{name}</h3><p className="text-xs text-muted-foreground">{row.business_date}</p></div>
            {pending && !actionable(row, 'confirm') && <StatusBadge tone="warning">Preview / Not active</StatusBadge>}
          </div>
          <dl className="grid min-w-0 gap-4 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <div><dt className="ui-eyebrow mb-1">Attendance / V1 assessment</dt><dd>{getAssessmentStatusLabel(row.assessment_status)}</dd>
              <dd className="mt-1 text-muted-foreground">{getAssessmentReasonLabel(row.attendance_context_code)}</dd></div>
            <div><dt className="ui-eyebrow mb-1">Notice timing</dt><dd>{row.notice_timeliness === 'no_notice' ? 'No notice' : row.notice_timeliness === 'timely' ? 'Timely' : 'Late'}
              {row.notice_days !== null && ` · ${row.notice_days} calendar days`}</dd></div>
            <div><dt className="ui-eyebrow mb-1">Financial eligibility</dt><dd>{row.financial_eligibility_reason ? FINANCIAL_REASON_LABELS[row.financial_eligibility_reason] : 'Not eligible for a financial decision'}</dd>
              {pending && <dd className="mt-2"><StatusBadge tone="warning">Pending Confirmation</StatusBadge></dd>}</div>
            <div><dt className="ui-eyebrow mb-1">Human decision</dt>
              <dd>{row.existing_consequence_status ? FINANCIAL_STATUS_LABELS[row.existing_consequence_status] : 'No financial decision'}</dd>
              {amount !== null && Number.isFinite(amount) && <dd className="mt-1">Recorded amount: <span className="font-mono">{formatFinancialAmount(amount, row.financial!.currency)}</span></dd>}
              <dt className="ui-eyebrow mb-1 mt-3">Payroll obligation</dt>
              {row.financial?.deduction_obligation_id ? <dd className="mt-1">Payroll Obligation Created</dd>
                : <dd className="mt-1 text-muted-foreground">{row.existing_consequence_id && !row.financial ? 'Payroll details are available to Admin' : 'No Payroll obligation recorded'}</dd>}
              {row.financial?.has_compensation && <dd className="mt-1">{COMPENSATION_RECORDED_LABEL}</dd>}
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {pending && <>
              <button type="button" className="ui-button-primary" disabled={disabled || !actionable(row, 'confirm')} onClick={() => open(row, 'confirm')}>Confirm</button>
              <button type="button" className="ui-button-secondary" disabled={disabled || !actionable(row, 'waive')} onClick={() => open(row, 'waive')}>Waive</button>
              {!actionable(row, 'confirm') && <p className="w-full text-xs text-muted-foreground">Financial Policy V2 is not active or could not be verified for this date.</p>}
            </>}
            {actionable(row, 'send') && <button type="button" className="ui-button-secondary" disabled={disabled} onClick={() => open(row, 'send')}>Send to Payroll</button>}
            {actionable(row, 'reverse') && <button type="button" className="ui-button-danger" disabled={disabled} onClick={() => open(row, 'reverse')}>Reverse Decision</button>}
          </div>
        </article>;
      })}</div>}
    <div className="flex items-center justify-between gap-3 text-xs">
      <button type="button" className="ui-button-secondary" disabled={disabled || page === 0} onClick={() => { setRows([]); setPage(p => p - 1); }}>Previous</button>
      <span>Page {page + 1}</span>
      <button type="button" className="ui-button-secondary" disabled={disabled || rows.length < FINANCIAL_PAGE_SIZE || (page + 1) * FINANCIAL_PAGE_SIZE > 100000} onClick={() => { setRows([]); setPage(p => p + 1); }}>Next</button>
    </div>
    <Modal open={Boolean(selected)} onClose={() => !submitting.current && setSelected(null)} title={selected ? TITLES[selected.kind] : undefined}
      subtitle={current ? `${riderNames?.[current.rider_id] || current.financial?.rider_name || current.rider_id} · ${current.business_date}` : undefined} dismissible={!saving}>
      {selected && <form className="space-y-4" onSubmit={event => void submit(event)} noValidate>
        <p className="text-sm text-muted-foreground">
          {selected.kind === 'confirm' ? 'This records a financial consequence using the policy amount resolved by the server. It does not deduct money from Payroll.'
            : selected.kind === 'waive' ? 'This records an authorized waiver with zero applied amount. The original policy amount is retained by the server.'
              : selected.kind === 'send' ? 'Create an unallocated Payroll obligation for this confirmed decision. Allocation and payment are separate Payroll steps.'
                : 'Confirm reversal of this decision. The server checks Payroll state: it may void unused debt, remove editable allocations, block locked Payroll, or record compensation for a fully paid penalty.'}
        </p>
        <fieldset disabled={saving} className="space-y-4">
          {(selected.kind === 'confirm' || selected.kind === 'waive') && <div>
            <label htmlFor="financial-supervisor" className="mb-1 block text-xs font-semibold">Supervisor / Attendance Monitor</label>
            <input id="financial-supervisor" className="ui-control w-full" value={supervisor} onChange={e => setSupervisor(e.target.value)} maxLength={120} required />
          </div>}
          {selected.kind === 'waive' && <div><label htmlFor="financial-category" className="mb-1 block text-xs font-semibold">Waiver category</label>
            <select id="financial-category" className="ui-control w-full" value={category} onChange={e => setCategory(e.target.value as WaiverCategory)}>
              <option value="emergency">Emergency</option><option value="excused">Excused / Valid Justification</option>
            </select></div>}
          {selected.kind !== 'send' && <>
            <div><label htmlFor="financial-notes" className="mb-1 block text-xs font-semibold">{selected.kind === 'reverse' ? 'Reversal reason' : 'Decision notes'}</label>
              <textarea id="financial-notes" className="ui-control min-h-24 w-full py-2" rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} required aria-describedby={dialogError ? 'financial-dialog-error' : undefined} /></div>
            <div><label htmlFor="financial-evidence" className="mb-1 block text-xs font-semibold">Evidence reference (optional)</label>
              <input id="financial-evidence" className="ui-control w-full" value={evidence} onChange={e => setEvidence(e.target.value)} maxLength={200} /></div>
          </>}
        </fieldset>
        {dialogError && <p id="financial-dialog-error" role="alert" className="text-sm text-rose-700">{dialogError}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="ui-button-secondary" disabled={saving} onClick={() => setSelected(null)}>Cancel</button>
          <button type="submit" className={selected.kind === 'reverse' ? 'ui-button-danger' : 'ui-button-primary'}
            disabled={disabled || !current || !actionable(current, selected.kind)}>
            {saving ? 'Saving…' : selected.kind === 'confirm' ? 'Record Confirmation' : selected.kind === 'waive' ? 'Record Waiver' : selected.kind === 'send' ? 'Create Payroll Obligation' : 'Confirm Reversal'}
          </button>
        </div>
      </form>}
    </Modal>
  </section>;
}
