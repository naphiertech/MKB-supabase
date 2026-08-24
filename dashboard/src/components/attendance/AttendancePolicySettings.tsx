import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Clock,
  FileText,
  History,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Role } from '../../hooks/useAuth';
import { pushToast } from '../../hooks/useToast';
import { Modal } from '../common/Modal';
import { RightDrawer } from '../common/RightDrawer';
import {
  createFutureAttendancePolicy,
  deactivateFutureAttendancePolicy,
  addDays,
  formatTime12Hour,
  getEffectiveAttendancePolicy,
  listAttendancePolicyAudit,
  listAttendancePolicyConfigurations,
  localDateString,
  validateAttendancePolicyInput,
  type AttendancePolicyAuditWithPerson,
  type AttendancePolicyConfiguration,
  type AttendancePolicyInput,
} from '../../services/attendance/attendancePolicyService';

interface AttendancePolicySettingsProps {
  role: Role;
}

const DEFAULT_INPUT: AttendancePolicyInput = {
  lateThreshold: '08:30',
  effectiveFrom: '',
  reason: '',
};

function formatDate(value: string | null): string {
  if (!value) return 'No end date';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function auditSummary(values: AttendancePolicyAuditWithPerson['new_values'] | null): string {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return '—';
  const record = values as Record<string, unknown>;
  const threshold = typeof record.late_threshold === 'string' ? formatTime12Hour(record.late_threshold) : '—';
  const from = typeof record.effective_from === 'string' ? formatDate(record.effective_from) : '—';
  return `Late after ${threshold} (From ${from})`;
}

export function AttendancePolicySettings({ role }: AttendancePolicySettingsProps) {
  const canManage = role === 'admin';
  const [configurations, setConfigurations] = useState<AttendancePolicyConfiguration[]>([]);
  const [audit, setAudit] = useState<AttendancePolicyAuditWithPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<AttendancePolicyConfiguration | null>(null);
  const [input, setInput] = useState<AttendancePolicyInput>(DEFAULT_INPUT);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const policyRows = await listAttendancePolicyConfigurations();
      setConfigurations(policyRows);

      if (role === 'admin') {
        try {
          const auditRows = await listAttendancePolicyAudit();
          setAudit(auditRows);
        } catch (auditErr) {
          console.warn('Unable to load attendance policy audit trail:', auditErr);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Please try again.';
      setLoadError(msg);
      pushToast({
        title: 'Unable to load attendance policy settings',
        description: msg,
        tone: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => localDateString(), []);
  const current = useMemo(() => getEffectiveAttendancePolicy(configurations, today), [configurations, today]);

  const futurePolicies = useMemo(
    () =>
      configurations
        .filter((c) => c.active && c.effective_from > today)
        .sort((a, b) => a.effective_from.localeCompare(b.effective_from)),
    [configurations, today]
  );

  const pastPolicies = useMemo(
    () =>
      configurations
        .filter((c) => c.effective_from <= today || !c.active)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    [configurations, today]
  );

  const minEffectiveDate = useMemo(() => {
    return addDays(today, 1);
  }, [today]);

  const openScheduleModal = () => {
    setInput({
      lateThreshold: current ? current.late_threshold.slice(0, 5) : '08:30',
      effectiveFrom: minEffectiveDate,
      reason: '',
    });
    setError('');
    setScheduleModalOpen(true);
  };

  const handleSave = async () => {
    const validation = validateAttendancePolicyInput(input, today);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createFutureAttendancePolicy(input);
      pushToast({
        title: 'Attendance policy scheduled',
        description: `New threshold (Late after ${formatTime12Hour(input.lateThreshold)}) will take effect on ${formatDate(input.effectiveFrom)}.`,
        tone: 'success',
      });
      setScheduleModalOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to schedule policy.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    if (!deactivateReason.trim()) {
      setError('A reason is required to cancel a scheduled policy.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await deactivateFutureAttendancePolicy(deactivating.id, deactivateReason);
      pushToast({
        title: 'Scheduled policy canceled',
        description: `The policy scheduled for ${formatDate(deactivating.effective_from)} has been canceled.`,
        tone: 'success',
      });
      setDeactivating(null);
      setDeactivateReason('');
      await load();
    } catch (deactError) {
      setError(deactError instanceof Error ? deactError.message : 'Unable to cancel policy.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ui-card flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading attendance policies…</span>
      </div>
    );
  }

  if (loadError && configurations.length === 0) {
    return (
      <div className="ui-card space-y-4 border-rose-200 p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-foreground">Unable to Load Attendance Policy</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-white shadow-sm hover:bg-primary-hover active:scale-[0.97] cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* HR/workforce policy toolbar */}
      <div className="ui-toolbar flex flex-col gap-4 p-4 md:p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Attendance Punctuality Policy</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure the daily check-in lateness threshold for workforce attendance and Daily Time Records (DTR).
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:flex sm:w-auto sm:items-center shrink-0">
          {canManage && (
            <button
              type="button"
              onClick={() => setAuditDrawerOpen(true)}
              className="ui-button-secondary inline-flex h-10 items-center justify-center gap-2 px-3.5 text-xs font-bold cursor-pointer"
            >
              <History className="h-4 w-4 text-muted-foreground" />
              Audit Log ({audit.length})
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={openScheduleModal}
              className="ui-button-primary inline-flex h-10 items-center justify-center gap-2 px-4 text-xs font-bold cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Schedule Policy Change
            </button>
          )}
        </div>
      </div>

      {/* Historical Protection Notice */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-xs">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <p className="leading-relaxed">
          <strong>Historical Attendance Protection:</strong> Attendance punctuality is resolved based on the policy active on each specific attendance date. Scheduling or changing future policies never alters or reclassifies prior records.
        </p>
      </div>

      {/* Current Active Policy Card */}
      <div className="ui-card space-y-4 p-4 md:p-5">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Current Policy</h3>
          </div>
          {current ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              In Effect
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              No Active Rule
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-panel-bg/50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Late after</div>
            <div className="mt-1 text-sm font-bold text-foreground">
              {current ? formatTime12Hour(current.late_threshold) : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-panel-bg/50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Effective from</div>
            <div className="mt-1 text-sm font-bold text-foreground">
              {current ? formatDate(current.effective_from) : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-panel-bg/50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Effective until</div>
            <div className="mt-1 text-sm font-bold text-foreground">
              {current?.effective_until ? formatDate(current.effective_until) : current ? 'Open-ended' : '—'}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-panel-bg/50 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="mt-1 text-sm font-bold text-foreground">
              {current ? 'In Effect' : 'No active rate'}
            </div>
          </div>
        </div>

        {current?.change_reason && (
          <div className="rounded-xl border border-border/80 bg-panel-bg/50 p-3.5 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Reason / Policy Notes
            </div>
            <p className="text-xs text-foreground leading-relaxed">{current.change_reason}</p>
          </div>
        )}
      </div>

      {/* Scheduled Future Changes Section */}
      <div className="ui-card space-y-4 p-4 md:p-5">
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Scheduled Changes</h3>
          </div>
          <span className="rounded-full border border-border bg-panel-bg px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
            {futurePolicies.length} {futurePolicies.length === 1 ? 'scheduled' : 'scheduled'}
          </span>
        </div>

        {futurePolicies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-panel-bg/30 p-6 text-center space-y-3">
            <p className="text-xs text-muted-foreground">No scheduled policy changes.</p>
            {canManage && (
              <button
                type="button"
                onClick={openScheduleModal}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-bold text-foreground hover:bg-panel-bg shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 text-primary" />
                Schedule Future Policy
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {futurePolicies.map((policy) => (
              <div
                key={policy.id}
                className="rounded-xl border border-border bg-panel-bg/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Late after {formatTime12Hour(policy.late_threshold)}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      Scheduled
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    Effective on {formatDate(policy.effective_from)}
                  </p>
                  {policy.change_reason && (
                    <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                      &ldquo;{policy.change_reason}&rdquo;
                    </p>
                  )}
                </div>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeactivating(policy);
                      setDeactivateReason('');
                      setError('');
                    }}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors shadow-xs shrink-0 cursor-pointer"
                  >
                    <Power className="h-3.5 w-3.5" />
                    Cancel Policy
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policy History Table */}
      {pastPolicies.length > 0 && (
        <section className="ui-card overflow-hidden" aria-labelledby="policy-history-heading">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 id="policy-history-heading" className="text-sm font-bold text-foreground">Policy History</h3>
            </div>
            {!canManage && (
              <span className="rounded-full border border-border bg-panel-bg px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                Read only
              </span>
            )}
          </div>
          <div className="table-scroll-region" role="region" aria-label="Attendance policy configuration history" tabIndex={0}>
            <table className="data-table-wide w-full text-left text-xs">
              <thead className="bg-panel-bg text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  {['Effective period', 'Late threshold', 'Status', 'Reason / Notes'].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-bold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pastPolicies.map((p) => {
                  const isCurrent = p.id === current?.id;
                  return (
                    <tr key={p.id} className="hover:bg-panel-bg/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatDate(p.effective_from)} – {formatDate(p.effective_until)}
                      </td>
                      <td className="px-4 py-3 font-bold text-foreground">
                        Late after {formatTime12Hour(p.late_threshold)}
                      </td>
                      <td className="px-4 py-3">
                        {p.active ? (
                          isCurrent ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              Historical
                            </span>
                          )
                        ) : (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                            Canceled
                          </span>
                        )}
                      </td>
                      <td className="max-w-72 px-4 py-3 text-muted-foreground">
                        {p.change_reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Schedule Policy Change Modal */}
      <Modal open={scheduleModalOpen} onClose={() => setScheduleModalOpen(false)} title="Schedule Attendance Policy Change">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Schedule a new attendance lateness threshold to take effect on a specified future date. Prior attendance logs will maintain their historical classifications.
          </p>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 shadow-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="modalLateThreshold" className="block text-[11px] font-semibold text-foreground">
                Late Threshold Time <span className="text-primary">*</span>
              </label>
              <input
                id="modalLateThreshold"
                type="time"
                value={input.lateThreshold}
                onChange={(e) => setInput({ ...input, lateThreshold: e.target.value })}
                className="ar-input w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground">Riders checking in after this time will be tagged as Late.</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="modalEffectiveFrom" className="block text-[11px] font-semibold text-foreground">
                Effective Start Date <span className="text-primary">*</span>
              </label>
              <input
                id="modalEffectiveFrom"
                type="date"
                min={minEffectiveDate}
                value={input.effectiveFrom}
                onChange={(e) => setInput({ ...input, effectiveFrom: e.target.value })}
                className="ar-input w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground">Must be a future date (tomorrow or later).</p>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="modalPolicyReason" className="block text-[11px] font-semibold text-foreground">
              Reason for Policy Change <span className="text-primary">*</span>
            </label>
            <textarea
              id="modalPolicyReason"
              rows={3}
              placeholder="e.g., Extended shift grace window per management memo #2026-08..."
              value={input.reason}
              onChange={(e) => setInput({ ...input, reason: e.target.value })}
              className="ar-textarea w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setScheduleModalOpen(false)}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-white hover:bg-panel-bg text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Schedule Policy
            </button>
          </div>
        </div>
      </Modal>

      {/* Deactivate / Cancel Scheduled Policy Modal */}
      <Modal
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        title="Cancel Scheduled Attendance Policy"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Are you sure you want to cancel the policy scheduled for{' '}
            <strong className="text-foreground">{deactivating ? formatDate(deactivating.effective_from) : ''}</strong> (Late after{' '}
            {deactivating ? formatTime12Hour(deactivating.late_threshold) : ''})?
          </p>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 shadow-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="deactivatePolicyReason" className="block text-[11px] font-semibold text-foreground">
              Cancellation Reason <span className="text-primary">*</span>
            </label>
            <textarea
              id="deactivatePolicyReason"
              rows={3}
              placeholder="Provide reason for canceling this scheduled policy..."
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              className="ar-textarea w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setDeactivating(null)}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-white hover:bg-panel-bg text-foreground transition-colors cursor-pointer"
            >
              Keep Policy
            </button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
              Cancel Policy
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit Log Drawer */}
      <RightDrawer
        open={auditDrawerOpen}
        onClose={() => setAuditDrawerOpen(false)}
        ariaLabel="Attendance Policy Audit Trail"
        widthClassName="max-w-[560px]"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground tracking-tight">
                Attendance Policy Audit Trail
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Append-only record of all attendance policy creations, modifications, and cancellations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAuditDrawerOpen(false)}
            aria-label="Close audit drawer"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-panel-bg hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto ar-scroll px-5 py-4 space-y-3 text-xs">
          {audit.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">No audit entries found.</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-white overflow-hidden shadow-xs">
              {audit.map((entry) => (
                <div key={entry.id} className="p-4 space-y-2 hover:bg-panel-bg/40 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-border bg-panel-bg px-2.5 py-0.5 text-[10px] font-bold uppercase text-foreground">
                      {entry.action}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {new Date(entry.changed_at).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="font-semibold text-foreground text-xs">{auditSummary(entry.new_values)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Author: <strong className="text-foreground">{entry.changedByName}</strong>
                  </p>
                  {entry.change_reason && (
                    <div className="rounded-lg border border-border/80 bg-panel-bg/60 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                      &ldquo;{entry.change_reason}&rdquo;
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </RightDrawer>
    </div>
  );
}
