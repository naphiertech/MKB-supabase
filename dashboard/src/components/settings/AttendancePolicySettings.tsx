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
} from 'lucide-react';
import type { Role } from '../../hooks/useAuth';
import { pushToast } from '../../hooks/useToast';
import { Modal } from '../common/Modal';
import { RightDrawer } from '../common/RightDrawer';
import {
  createFutureAttendancePolicy,
  deactivateFutureAttendancePolicy,
  formatTime12Hour,
  getEffectiveAttendancePolicy,
  listAttendancePolicyAudit,
  listAttendancePolicyConfigurations,
  localDateString,
  validateAttendancePolicyInput,
  type AttendancePolicyAuditWithPerson,
  type AttendancePolicyConfiguration,
  type AttendancePolicyInput,
} from '../../services/attendancePolicyService';

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
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return localDateString(tomorrow);
  }, []);

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
      await deactivateFutureAttendancePolicy(deactivating.id, deactivateReason, today);
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

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            Attendance Punctuality Policy
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure the daily check-in lateness threshold for workforce attendance and Daily Time Records (DTR).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => setAuditDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-panel-bg hover:bg-panel-bg/80 text-foreground transition-colors"
            >
              <History className="w-3.5 h-3.5 text-muted-foreground" />
              Audit Log ({audit.length})
            </button>
          )}
          {canManage && (
            <button
              onClick={openScheduleModal}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-accent text-primary hover:bg-accent/90 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Schedule Policy Change
            </button>
          )}
        </div>
      </div>

      {/* Historical Protection Notice */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-semibold text-foreground">Historical Attendance Protection</p>
          <p className="text-muted-foreground leading-relaxed">
            Attendance punctuality is resolved based on the policy active on each specific attendance date.
            Changing or scheduling a future threshold <strong>does not retroactively reclassify</strong> prior attendance logs or Daily Time Records.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <span className="text-xs">Loading attendance policies...</span>
        </div>
      ) : loadError && configurations.length === 0 ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-8 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">Unable to Load Attendance Policy Settings</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">{loadError}</p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Loading
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Active Policy Card */}
          <div className="lg:col-span-2 rounded-2xl border border-border bg-panel-bg/50 p-6 space-y-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent">Active Policy</span>
                  <h3 className="text-lg font-bold text-foreground">
                    {current ? `Late After ${formatTime12Hour(current.late_threshold)}` : 'No Active Policy Configured'}
                  </h3>
                </div>
              </div>
              {current ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  In Effect
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  No Active Rule
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Effective Start Date
                </span>
                <p className="text-sm font-bold text-foreground">
                  {current ? formatDate(current.effective_from) : '—'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarClock className="w-3 h-3" />
                  Effective Until
                </span>
                <p className="text-sm font-bold text-foreground">
                  {current?.effective_until ? formatDate(current.effective_until) : current ? 'Open-Ended (Active)' : '—'}
                </p>
              </div>
            </div>

            {current?.change_reason && (
              <div className="p-3.5 rounded-xl border border-border/60 bg-background/40 space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  Policy Notes / Reason
                </span>
                <p className="text-xs text-foreground leading-relaxed">{current.change_reason}</p>
              </div>
            )}
          </div>

          {/* Scheduled Future Policies */}
          <div className="rounded-2xl border border-border bg-panel-bg/50 p-6 space-y-4 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-accent" />
                  Scheduled Changes
                </h4>
                <span className="text-xs font-bold text-muted-foreground">{futurePolicies.length}</span>
              </div>

              {futurePolicies.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">No upcoming policy changes scheduled.</p>
                  <p className="text-[11px] text-muted-foreground/70">
                    The current threshold will continue indefinitely until an Admin schedules a new effective date.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {futurePolicies.map((policy) => (
                    <div key={policy.id} className="p-3 rounded-xl border border-accent/20 bg-accent/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Late after {formatTime12Hour(policy.late_threshold)}
                        </span>
                        {canManage && (
                          <button
                            onClick={() => {
                              setDeactivating(policy);
                              setDeactivateReason('');
                              setError('');
                            }}
                            className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-accent" />
                        Takes effect on {formatDate(policy.effective_from)}
                      </p>
                      {policy.change_reason && (
                        <p className="text-[10px] text-muted-foreground/80 italic line-clamp-2">
                          &ldquo;{policy.change_reason}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canManage && futurePolicies.length === 0 && (
              <button
                onClick={openScheduleModal}
                className="w-full py-2 px-3 text-xs font-semibold rounded-xl border border-dashed border-border hover:border-accent hover:text-accent text-muted-foreground transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Schedule Future Policy
              </button>
            )}
          </div>
        </div>
      )}

      {/* Historical Policies Table */}
      {!loading && pastPolicies.length > 0 && (
        <div className="rounded-2xl border border-border bg-panel-bg/40 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <History className="w-4 h-4 text-muted-foreground" />
              Policy Timeline & History
            </h4>
            <span className="text-xs text-muted-foreground">{pastPolicies.length} recorded versions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-background/50 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                <tr>
                  <th className="py-3 px-4">Threshold</th>
                  <th className="py-3 px-4">Effective Dates</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-muted-foreground">
                {pastPolicies.map((p) => (
                  <tr key={p.id} className="hover:bg-panel-bg/60 transition-colors">
                    <td className="py-3 px-4 font-bold text-foreground">
                      Late after {formatTime12Hour(p.late_threshold)}
                    </td>
                    <td className="py-3 px-4">
                      {formatDate(p.effective_from)} &rarr; {formatDate(p.effective_until)}
                    </td>
                    <td className="py-3 px-4">
                      {p.active ? (
                        p.id === current?.id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            Current
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                            Historical
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          Canceled
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground/90 max-w-xs truncate">
                      {p.change_reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schedule Policy Change Modal */}
      <Modal open={scheduleModalOpen} onClose={() => setScheduleModalOpen(false)} title="Schedule Attendance Policy Change">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Schedule a new attendance lateness threshold to take effect on a specified future date.
            Prior attendance logs will maintain their historical classifications.
          </p>

          {error && (
            <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-accent" />
                Late Threshold Time
              </label>
              <input
                type="time"
                value={input.lateThreshold}
                onChange={(e) => setInput({ ...input, lateThreshold: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:border-accent"
              />
              <span className="text-[10px] text-muted-foreground">
                Riders checking in after this time will be tagged as Late.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                Effective Start Date
              </label>
              <input
                type="date"
                min={minEffectiveDate}
                value={input.effectiveFrom}
                onChange={(e) => setInput({ ...input, effectiveFrom: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:border-accent"
              />
              <span className="text-[10px] text-muted-foreground">
                Must be a future date (tomorrow or later).
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-accent" />
              Reason for Policy Change
            </label>
            <textarea
              rows={3}
              placeholder="e.g., Extended shift grace window per management memo #2026-08..."
              value={input.reason}
              onChange={(e) => setInput({ ...input, reason: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={() => setScheduleModalOpen(false)}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-panel-bg hover:bg-panel-bg/80 text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-primary hover:bg-accent/90 transition-colors shadow-xs disabled:opacity-50"
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
            <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Cancellation Reason</label>
            <textarea
              rows={3}
              placeholder="Provide reason for canceling this scheduled policy..."
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:outline-hidden focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              onClick={() => setDeactivating(null)}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border bg-panel-bg hover:bg-panel-bg/80 text-foreground transition-colors"
            >
              Keep Policy
            </button>
            <button
              onClick={handleDeactivate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-xs disabled:opacity-50"
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
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            <h3 className="text-sm font-bold text-foreground">Attendance Policy Audit Trail</h3>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Complete record of all attendance policy creations, updates, and cancellations.
          </p>

          {audit.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">No audit entries found.</div>
          ) : (
            <div className="space-y-3">
              {audit.map((entry) => (
                <div key={entry.id} className="p-3.5 rounded-xl border border-border bg-background/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
                      {entry.action}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(entry.changed_at).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-foreground">{auditSummary(entry.new_values)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Changed by: <strong className="text-foreground">{entry.changedByName}</strong>
                  </p>
                  {entry.change_reason && (
                    <p className="text-[11px] text-muted-foreground/80 italic border-t border-border/40 pt-1.5">
                      &ldquo;{entry.change_reason}&rdquo;
                    </p>
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
