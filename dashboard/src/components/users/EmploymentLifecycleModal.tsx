import { useEffect, useState } from 'react';
import { AlertTriangle, Archive, RotateCcw } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  ARCHIVE_REASONS,
  validateArchiveInput,
  type ArchiveInput,
  type ArchiveReason,
} from '../../lib/workforce/employmentLifecycle';
import type { AppUser } from '../../services/types';

interface EmploymentLifecycleModalProps {
  open: boolean;
  mode: 'archive' | 'restore';
  user: AppUser | null;
  today: string;
  checkingAttendance?: boolean;
  hasOpenAttendance?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onArchive: (input: ArchiveInput) => Promise<void>;
  onRestore: (reason: string) => Promise<void>;
}

export function EmploymentLifecycleModal({
  open,
  mode,
  user,
  today,
  checkingAttendance = false,
  hasOpenAttendance = false,
  busy = false,
  error,
  onClose,
  onArchive,
  onRestore,
}: EmploymentLifecycleModalProps) {
  const [reason, setReason] = useState<ArchiveReason | ''>('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [restoreReason, setRestoreReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setReason('');
    setEffectiveDate(today);
    setRemarks('');
    setRestoreReason('');
    setErrors({});
  }, [open, today, mode, user?.id]);

  if (!user) return null;

  async function submit() {
    if (mode === 'archive') {
      const input: ArchiveInput = { reason, effectiveDate, remarks };
      const nextErrors = validateArchiveInput(input, today);
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length || hasOpenAttendance) return;
      await onArchive(input);
      return;
    }
    if (!restoreReason.trim()) {
      setErrors({ restoreReason: 'Enter the reason for restoring employment.' });
      return;
    }
    await onRestore(restoreReason.trim());
  }

  const blocked = busy || checkingAttendance || (mode === 'archive' && hasOpenAttendance);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'archive' ? `Archive ${user.name}` : `Restore ${user.name}`}
      subtitle={mode === 'archive' ? 'End active employment while preserving the complete record.' : 'Return the existing identity to the workforce.'}
      size="md"
      dismissible={!busy}
    >
      <div className="space-y-4">
        {mode === 'archive' ? (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              Account access will be disabled. This employee will leave Time In/Out, Live Monitoring,
              future parcel work, and future payroll initialization. Attendance, parcels, payroll,
              violations, documents, and audit history remain preserved.
            </div>
            {hasOpenAttendance && (
              <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This Rider currently has an open attendance session. Resolve the attendance record before archiving.</span>
              </div>
            )}
            <label className="block text-xs font-semibold text-foreground" htmlFor="archive-reason">
              Reason <span className="text-red-600">*</span>
            </label>
            <select
              id="archive-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as ArchiveReason | '')}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? 'archive-reason-error' : undefined}
              className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">Select a reason</option>
              {ARCHIVE_REASONS.map((option) => <option key={option}>{option}</option>)}
            </select>
            {errors.reason && <p id="archive-reason-error" className="text-xs text-red-600">{errors.reason}</p>}

            <label className="block text-xs font-semibold text-foreground" htmlFor="archive-effective-date">
              Effective Date <span className="text-red-600">*</span>
            </label>
            <input
              id="archive-effective-date"
              type="date"
              max={today}
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
              aria-invalid={Boolean(errors.effectiveDate)}
              aria-describedby={errors.effectiveDate ? 'archive-date-error' : undefined}
              className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary"
            />
            {errors.effectiveDate && <p id="archive-date-error" className="text-xs text-red-600">{errors.effectiveDate}</p>}

            <label className="block text-xs font-semibold text-foreground" htmlFor="archive-remarks">
              Remarks {reason === 'Other' && <span className="text-red-600">*</span>}
            </label>
            <textarea
              id="archive-remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              aria-invalid={Boolean(errors.remarks)}
              aria-describedby={errors.remarks ? 'archive-remarks-error' : undefined}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {errors.remarks && <p id="archive-remarks-error" className="text-xs text-red-600">{errors.remarks}</p>}
          </>
        ) : (
          <>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">
              Restore keeps the Rider account restricted and offline. An authorized user must confirm
              the zone and explicitly restore full account access before operations resume. Existing identity,
              facial enrollment, documents, and history are preserved.
            </div>
            <label className="block text-xs font-semibold text-foreground" htmlFor="restore-reason">
              Restore Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              id="restore-reason"
              value={restoreReason}
              onChange={(event) => setRestoreReason(event.target.value)}
              rows={3}
              aria-invalid={Boolean(errors.restoreReason)}
              aria-describedby={errors.restoreReason ? 'restore-reason-error' : undefined}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {errors.restoreReason && <p id="restore-reason-error" className="text-xs text-red-600">{errors.restoreReason}</p>}
          </>
        )}

        {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={blocked}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${mode === 'archive' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'}`}
          >
            {mode === 'archive' ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            {checkingAttendance ? 'Checking attendance…' : busy ? 'Saving…' : mode === 'archive' ? 'Archive Employment' : 'Restore Employment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
