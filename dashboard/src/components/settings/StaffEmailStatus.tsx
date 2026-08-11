import { CheckCircle2, Clock3 } from 'lucide-react';

interface StaffEmailStatusProps {
  currentEmail: string;
  pendingEmail: string | null;
  emailVerified: boolean;
}

export function StaffEmailStatus({ currentEmail, pendingEmail, emailVerified }: StaffEmailStatusProps) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-panel-bg/60 p-3" aria-live="polite">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current email</p>
          <p className="text-xs font-semibold text-foreground">{currentEmail || 'Not available'}</p>
          <p className="text-[10px] text-muted-foreground">{emailVerified ? 'Verified' : 'Verification pending'}</p>
        </div>
      </div>
      {pendingEmail && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending email · Awaiting confirmation</p>
            <p className="text-xs font-semibold text-amber-950">{pendingEmail}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
              Confirmation required. We sent a confirmation link to {pendingEmail}. Your current login email will remain {currentEmail} until the new address is confirmed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
