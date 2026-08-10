import React, { useState } from 'react';
import { ShieldAlert, Smartphone, Laptop, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_BACKDROP_VARIANTS, MODAL_CONTENT_VARIANTS } from '../../lib/motion';

export const RESET_REASONS = [
  'Device lost',
  'Device stolen',
  'Device replaced',
  'HR authorized transfer',
  'Technical issue',
  'Other'
] as const;

export type ResetReason = (typeof RESET_REASONS)[number];

export interface TrustedDeviceInfo {
  id: string;
  deviceName: string;
  platform: string;
  deviceUuid: string;
  registeredAt: string;
  lastUsedAt: string;
  status: 'trusted' | 'revoked';
}

interface DeviceResetModalProps {
  isOpen: boolean;
  riderName: string;
  device: TrustedDeviceInfo | null;
  onClose: () => void;
  onConfirm: (reason: ResetReason, customReason?: string) => Promise<void>;
}

export function DeviceResetModal({
  isOpen,
  riderName,
  device,
  onClose,
  onConfirm
}: DeviceResetModalProps) {
  const [reason, setReason] = useState<ResetReason>('Device replaced');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !device) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(reason, reason === 'Other' ? customReason : undefined);
      onClose();
    } catch (err) {
      console.error('Failed to reset device:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMobile = device.platform === 'android' || device.platform === 'ios';

  return (
    <AnimatePresence>
      <motion.div
        variants={MODAL_BACKDROP_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="device-reset-title"
          variants={MODAL_CONTENT_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          className="viewport-dialog relative w-full max-w-md rounded-xl border border-border bg-white p-4 text-foreground shadow-xl sm:rounded-2xl sm:p-6 font-[Geist,sans-serif]"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close device reset"
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300/40 flex items-center justify-center text-amber-700 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="device-reset-title" className="text-base font-bold text-foreground">Reset Trusted Device</h3>
              <p className="text-xs text-muted-foreground">Revoke active hardware binding for rider</p>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-5 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              Revoking this device will block logins from this current hardware. <strong>{riderName}</strong>'s next login from any phone or browser will register as their new trusted device.
            </div>
          </div>

          {/* Current Device Details Card */}
          <div className="bg-panel-bg border border-border rounded-xl p-3.5 mb-5 space-y-2 text-xs">
            <div className="flex items-center justify-between font-semibold">
              <div className="flex items-center gap-2 text-foreground">
                {isMobile ? (
                  <Smartphone className="w-4 h-4 text-primary" />
                ) : (
                  <Laptop className="w-4 h-4 text-primary" />
                )}
                <span>{device.deviceName}</span>
              </div>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Trusted
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
              <div>
                Platform: <span className="font-mono text-foreground capitalize">{device.platform}</span>
              </div>
              <div>
                Registered: <span className="text-foreground">{new Date(device.registeredAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Form: Select Reason for Reset */}
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                Reason for Device Reset <span className="text-rose-500">*</span>
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as ResetReason)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-white text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {RESET_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {reason === 'Other' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Custom Audit Explanation
                </label>
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="State the reason for resetting this device..."
                  rows={2}
                  required
                  className="w-full p-2.5 rounded-lg border border-border bg-white text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 h-9 rounded-lg border border-border bg-panel-bg text-xs font-semibold text-muted-foreground hover:bg-border/40 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  'Revoking...'
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Revoke Device
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
