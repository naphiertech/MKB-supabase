import { AlertTriangle, LogOut } from 'lucide-react';
import { Modal } from '../common/Modal';

interface ActiveShiftLogoutModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isSigningOut?: boolean;
}

export function ActiveShiftLogoutModal({
  open,
  onCancel,
  onConfirm,
  isSigningOut = false
}: ActiveShiftLogoutModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="You still have an active shift"
      size="sm"
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-start gap-3.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1 text-xs leading-relaxed text-amber-800">
            You are currently timed in. Signing out will not end your attendance session. You will need to sign in again to complete Time Out.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSigningOut}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-4 text-xs font-semibold text-foreground transition-colors hover:bg-panel-bg focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSigningOut}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {isSigningOut ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Sign out anyway
          </button>
        </div>
      </div>
    </Modal>
  );
}
