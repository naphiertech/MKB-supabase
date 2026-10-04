import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  FileCheck2,
  Lock,
  User,
  X,
  Loader2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { RightDrawer } from '../common/RightDrawer';
import {
  correctRiderAttendance,
  type AttendanceCorrectionType,
} from '../../services/attendance/attendanceCorrectionService';
import {
  listAttendancePolicyConfigurations,
  resolveLateThreshold,
  isTimePastThreshold,
  formatTime12Hour,
  DEFAULT_LATE_THRESHOLD,
  type AttendancePolicyConfiguration,
} from '../../services/attendance/attendancePolicyService';
import { appToast } from '../../hooks/useToast';

export interface AttendanceCorrectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialLog?: {
    id?: string;
    riderId: string;
    riderName?: string;
    date: string;
    timeIn?: string | null;
    timeOut?: string | null;
    status?: string | null;
    source?: string | null;
    zoneName?: string | null;
  } | null;
  ridersList?: Array<{
    id: string;
    name: string;
    mkb_id?: string;
  }>;
}

type FormCorrectionChoice =
  | 'forgot_time_in'
  | 'forgot_time_out'
  | 'verified_attendance_error'
  | 'app_device_issue'
  | 'mark_absent'
  | 'authorized_correction';

export interface ComputedAttendanceState {
  status: 'present' | 'late' | 'absent';
  punctuality: 'On Time' | 'Late' | 'Absent';
  explanation: string;
}

export interface PolicyDerivationParams {
  correctionChoice: FormCorrectionChoice;
  timeIn?: string | null;
  initialTimeIn?: string | null;
  initialStatus?: string | null;
  lateThreshold: string;
}

export function deriveAttendanceCorrectionStatus({
  correctionChoice,
  timeIn,
  initialTimeIn,
  initialStatus,
  lateThreshold,
}: PolicyDerivationParams): ComputedAttendanceState {
  const formattedThreshold = formatTime12Hour(lateThreshold);

  if (correctionChoice === 'mark_absent') {
    return {
      status: 'absent',
      punctuality: 'Absent',
      explanation: 'Record will be corrected to Absent. All clock timestamps will be cleared.',
    };
  }

  if (correctionChoice === 'forgot_time_out') {
    // Prioritize existing authoritative timeIn if present
    const effectiveTimeIn = initialTimeIn ? initialTimeIn : (timeIn || null);
    if (effectiveTimeIn) {
      const isLate = isTimePastThreshold(effectiveTimeIn, lateThreshold) || initialStatus === 'late';
      if (isLate) {
        return {
          status: 'late',
          punctuality: 'Late',
          explanation: `Existing time-in (${formatTime12Hour(effectiveTimeIn)}) was after the policy threshold (${formattedThreshold} PST). Status remains Late.`,
        };
      }
      return {
        status: 'present',
        punctuality: 'On Time',
        explanation: `Existing time-in (${formatTime12Hour(effectiveTimeIn)}) was on time (${formattedThreshold} PST threshold). Adding Time Out resolves to Present.`,
      };
    }
    return {
      status: 'present',
      punctuality: 'On Time',
      explanation: `Policy threshold is ${formattedThreshold} PST. Time In required to resolve final status.`,
    };
  }

  // For forgot_time_in, verified_attendance_error, app_device_issue, authorized_correction
  if (timeIn) {
    const isLate = isTimePastThreshold(timeIn, lateThreshold);
    if (isLate) {
      return {
        status: 'late',
        punctuality: 'Late',
        explanation: `Corrected time-in ${formatTime12Hour(timeIn)} exceeds the late threshold (${formattedThreshold} PST), so this correction will be recorded as Late.`,
      };
    }
    return {
      status: 'present',
      punctuality: 'On Time',
      explanation: `Corrected time-in ${formatTime12Hour(timeIn)} is on or before the late threshold (${formattedThreshold} PST), so this correction will be recorded as Present.`,
    };
  }

  return {
    status: 'present',
    punctuality: 'On Time',
    explanation: `Enter corrected Time In. Check-ins after ${formattedThreshold} PST will automatically resolve to Late.`,
  };
}

export function AttendanceCorrectionDrawer({
  isOpen,
  onClose,
  onSuccess,
  initialLog,
  ridersList = [],
}: AttendanceCorrectionDrawerProps) {
  const [policies, setPolicies] = useState<AttendancePolicyConfiguration[]>([]);
  const [riderId, setRiderId] = useState(initialLog?.riderId || '');
  const [date, setDate] = useState(initialLog?.date || new Date().toISOString().slice(0, 10));
  const [correctionChoice, setCorrectionChoice] = useState<FormCorrectionChoice>('forgot_time_out');
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch policies on mount
  useEffect(() => {
    let mounted = true;
    listAttendancePolicyConfigurations()
      .then((data) => {
        if (mounted) setPolicies(data);
      })
      .catch((err) => {
        console.error('Failed to load attendance policy configurations:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync state when initialLog changes
  useEffect(() => {
    if (initialLog) {
      setRiderId(initialLog.riderId);
      setDate(initialLog.date);

      // Extract HH:mm from ISO timestamp if present
      if (initialLog.timeIn) {
        const d = new Date(initialLog.timeIn);
        if (!isNaN(d.getTime())) {
          const ph = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
          setTimeIn(`${String(ph.getHours()).padStart(2, '0')}:${String(ph.getMinutes()).padStart(2, '0')}`);
        } else {
          setTimeIn('');
        }
      } else {
        setTimeIn('');
      }

      if (initialLog.timeOut) {
        const d = new Date(initialLog.timeOut);
        if (!isNaN(d.getTime())) {
          const ph = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
          setTimeOut(`${String(ph.getHours()).padStart(2, '0')}:${String(ph.getMinutes()).padStart(2, '0')}`);
        } else {
          setTimeOut('');
        }
      } else {
        setTimeOut('');
      }

      if (!initialLog.timeIn && initialLog.timeOut) {
        setCorrectionChoice('forgot_time_in');
      } else if (initialLog.timeIn && !initialLog.timeOut) {
        setCorrectionChoice('forgot_time_out');
      } else if (initialLog.status === 'absent') {
        setCorrectionChoice('forgot_time_in');
      } else {
        setCorrectionChoice('verified_attendance_error');
      }
    } else {
      setRiderId('');
      setDate(new Date().toISOString().slice(0, 10));
      setTimeIn('');
      setTimeOut('');
      setCorrectionChoice('forgot_time_in');
    }
    setReason('');
    setEvidenceRef('');
    setFormError(null);
  }, [initialLog, isOpen]);

  // Resolve late threshold for the selected date
  const lateThreshold = useMemo(() => {
    return resolveLateThreshold(policies, date) || DEFAULT_LATE_THRESHOLD;
  }, [policies, date]);

  const formattedThreshold = useMemo(() => {
    return formatTime12Hour(lateThreshold);
  }, [lateThreshold]);

  const computedState = useMemo<ComputedAttendanceState>(() => {
    return deriveAttendanceCorrectionStatus({
      correctionChoice,
      timeIn,
      initialTimeIn: initialLog?.timeIn,
      initialStatus: initialLog?.status,
      lateThreshold,
    });
  }, [correctionChoice, timeIn, initialLog, lateThreshold]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!riderId) {
      setFormError('Please select a rider.');
      return;
    }

    if (!date) {
      setFormError('Please select the attendance date.');
      return;
    }

    if (!reason.trim()) {
      setFormError('A specific business justification is required for auditing purposes.');
      return;
    }

    // Determine RPC parameters
    const rpcStatus = computedState.status;
    let rpcCorrectionType: AttendanceCorrectionType = 'authorized_correction';
    if (correctionChoice === 'mark_absent') {
      rpcCorrectionType = 'authorized_correction';
    } else {
      rpcCorrectionType = correctionChoice;
    }

    let payloadTimeIn: string | null = null;
    let payloadTimeOut: string | null = null;

    if (rpcStatus !== 'absent') {
      if (correctionChoice === 'forgot_time_in') {
        if (!timeIn) {
          setFormError('Corrected Time In is required for Forgot Time In.');
          return;
        }
        payloadTimeIn = `${date}T${timeIn}:00+08:00`;
        payloadTimeOut = timeOut ? `${date}T${timeOut}:00+08:00` : null;
      } else if (correctionChoice === 'forgot_time_out') {
        if (!timeOut) {
          setFormError('Corrected Time Out is required for Forgot Time Out.');
          return;
        }
        if (!initialLog?.timeIn && !timeIn) {
          setFormError('An existing or provided Time In is required before adding Time Out.');
          return;
        }
        payloadTimeIn = timeIn ? `${date}T${timeIn}:00+08:00` : (initialLog?.timeIn || null);
        payloadTimeOut = `${date}T${timeOut}:00+08:00`;
      } else {
        if (!timeIn && !initialLog?.timeIn) {
          setFormError('Time In is required for working attendance.');
          return;
        }
        payloadTimeIn = timeIn ? `${date}T${timeIn}:00+08:00` : (initialLog?.timeIn || null);
        payloadTimeOut = timeOut ? `${date}T${timeOut}:00+08:00` : (initialLog?.timeOut || null);
      }

      if (payloadTimeIn && payloadTimeOut && payloadTimeOut < payloadTimeIn) {
        setFormError('Time Out cannot be earlier than Time In.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await correctRiderAttendance({
        riderId,
        date,
        status: rpcStatus,
        correctionType: rpcCorrectionType,
        reason: reason.trim(),
        timeIn: payloadTimeIn,
        timeOut: payloadTimeOut,
        evidenceReference: evidenceRef.trim() || null,
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      appToast.success(`Attendance successfully corrected for ${data?.rider_name || 'rider'}!`);
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RightDrawer
      open={isOpen}
      onClose={onClose}
      ariaLabel="Attendance correction drawer"
      widthClassName="max-w-xl"
      backdropClassName="bg-black/60"
    >
      <form onSubmit={handleSubmit} className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Authoritative Attendance Correction</h2>
              <p className="text-xs text-muted-foreground">
                Policy-derived attendance adjustment and permanent audit recording.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-panel-bg transition"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 custom-scrollbar">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Target Record Card */}
          <div className="p-3.5 bg-panel-bg border border-border rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Target Record Details
              </span>
              <span className="text-[11px] font-mono font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                Authoritative
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                  Rider
                </label>
                {initialLog ? (
                  <div className="flex items-center gap-2 font-medium text-foreground py-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>{initialLog.riderName}</span>
                  </div>
                ) : (
                  <select
                    value={riderId}
                    onChange={(e) => setRiderId(e.target.value)}
                    required
                    className="w-full text-xs rounded-lg border border-border bg-white px-2.5 py-1.5 focus:border-primary focus:outline-none"
                  >
                    <option value="">-- Choose Rider --</option>
                    {ridersList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.mkb_id ? `(${r.mkb_id})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-semibold text-muted-foreground mb-1">
                  Date
                </label>
                {initialLog ? (
                  <div className="flex items-center gap-2 font-mono font-medium text-foreground py-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>{initialLog.date}</span>
                  </div>
                ) : (
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full text-xs rounded-lg border border-border bg-white px-2.5 py-1.5 font-mono focus:border-primary focus:outline-none"
                  />
                )}
              </div>
            </div>

            {initialLog && (
              <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Current Status:{' '}
                  <strong className="text-foreground uppercase">{initialLog.status || 'None'}</strong>
                </span>
                <span>
                  Source: <strong className="text-foreground">{initialLog.source || 'Unrecorded'}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Correction Reason Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Correction Scenario</span>
              <span className="text-[11px] text-muted-foreground font-normal">Select exception reason</span>
            </label>
            <select
              value={correctionChoice}
              onChange={(e) => setCorrectionChoice(e.target.value as FormCorrectionChoice)}
              className="w-full text-xs rounded-lg border border-border bg-white px-3 py-2 text-foreground focus:border-primary focus:outline-none"
            >
              <option value="forgot_time_out">Forgot Time Out (Rider clocked in, missed check-out)</option>
              <option value="forgot_time_in">Forgot Time In (Rider worked, missed check-in)</option>
              <option value="verified_attendance_error">Correct Both Times (Full shift rectification)</option>
              <option value="app_device_issue">App / Device Issue (Biometric scanner / GPS fault)</option>
              <option value="mark_absent">Mark as Absent (Unexcused absence / Cancel shift)</option>
              <option value="authorized_correction">Other Authorized Correction (Managerial)</option>
            </select>
          </div>

          {/* Timestamp Fields */}
          {correctionChoice === 'mark_absent' ? (
            <div className="p-3 bg-panel-bg border border-border rounded-xl text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-500" />
                <span>No clock timestamps required</span>
              </div>
              <p className="text-[11px]">
                Marking this attendance record as Absent will clear any existing Time In and Time Out values.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Time In */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-foreground">
                      Time In{' '}
                      {correctionChoice !== 'forgot_time_out' && <span className="text-red-500">*</span>}
                    </label>
                    {correctionChoice === 'forgot_time_out' && initialLog?.timeIn && (
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Authoritative
                      </span>
                    )}
                  </div>
                  {correctionChoice === 'forgot_time_out' && initialLog?.timeIn ? (
                    <div className="px-3 py-2 rounded-lg bg-panel-bg border border-border text-xs font-mono text-muted-foreground flex items-center justify-between">
                      <span>{formatTime12Hour(initialLog.timeIn)}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">(Existing)</span>
                    </div>
                  ) : (
                    <input
                      type="time"
                      value={timeIn}
                      onChange={(e) => setTimeIn(e.target.value)}
                      required={correctionChoice !== 'forgot_time_out'}
                      className="w-full text-xs rounded-lg border border-border bg-white px-3 py-2 font-mono focus:border-primary focus:outline-none"
                    />
                  )}
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    {correctionChoice === 'forgot_time_out' && initialLog?.timeIn
                      ? 'Preserved from rider check-in.'
                      : `Threshold: ${formattedThreshold} PST`}
                  </span>
                </div>

                {/* Time Out */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-foreground">
                      Time Out{' '}
                      {correctionChoice === 'forgot_time_out' && <span className="text-red-500">*</span>}
                    </label>
                    <span className="text-[10px] text-muted-foreground font-mono">End of shift</span>
                  </div>
                  <input
                    type="time"
                    value={timeOut}
                    onChange={(e) => setTimeOut(e.target.value)}
                    required={correctionChoice === 'forgot_time_out'}
                    className="w-full text-xs rounded-lg border border-border bg-white px-3 py-2 font-mono focus:border-primary focus:outline-none"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">
                    {correctionChoice === 'forgot_time_out' ? 'Required for check-out correction.' : 'Optional if shift ongoing.'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Live Policy-Derived Preview Section */}
          <div className="p-3.5 bg-panel-bg border border-border rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Computed Attendance Result</span>
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Policy-Derived (Read-Only)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                  Status
                </span>
                {computedState.status === 'present' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Present
                  </span>
                )}
                {computedState.status === 'late' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5" /> Late
                  </span>
                )}
                {computedState.status === 'absent' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-50 border border-red-200 text-red-700">
                    <XCircle className="w-3.5 h-3.5" /> Absent
                  </span>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                  Punctuality & Policy
                </span>
                <div className="font-semibold text-foreground text-xs">{computedState.punctuality}</div>
                <div className="text-[11px] text-muted-foreground font-mono">Late after {formattedThreshold} PST</div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-border text-[11px] text-muted-foreground flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{computedState.explanation}</span>
            </div>
          </div>

          {/* Audit Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>
                Audit Reason <span className="text-red-500">*</span>
              </span>
              <span className="text-[10px] text-muted-foreground">Permanently recorded</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="State clear business justification (e.g. Rider completed shift but biometric scanner encountered connectivity failure; verified via zone log)..."
              className="w-full text-xs rounded-lg border border-border bg-white p-3 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
            <span className="text-[10px] text-muted-foreground block">
              This statement will be stored in the immutable attendance audit trail with your user identity.
            </span>
          </div>

          {/* Evidence Reference */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Evidence Reference (Optional)</span>
              <span className="text-[10px] text-muted-foreground">Ticket / Link / Reference</span>
            </label>
            <input
              type="text"
              value={evidenceRef}
              onChange={(e) => setEvidenceRef(e.target.value)}
              placeholder="e.g. Ticket #4928, CCTV clip ref, signed memo"
              className="w-full text-xs rounded-lg border border-border bg-white px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Leave Notice Banner */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-amber-950">Official Leave Workflow Protected</div>
              <p className="text-[11px] text-amber-800">
                Attendance corrections cannot manually set <code className="font-mono font-bold">on_leave</code>.
                Official leave must be filed and approved through the Leave &amp; Absence workflow.
              </p>
            </div>
          </div>
        </div>

        {/* Sticky Drawer Footer */}
        <div className="border-t border-border px-5 py-4 bg-white/95 backdrop-blur-xs flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg hover:bg-panel-bg transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !reason.trim() || !riderId}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <FileCheck2 className="w-4 h-4" />
                <span>Authorize &amp; Apply Correction</span>
              </>
            )}
          </button>
        </div>
      </form>
    </RightDrawer>
  );
}

// Backward compatibility alias
export const AttendanceCorrectionModal = AttendanceCorrectionDrawer;
