import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '../common/Modal';
import { pushToast } from '../../hooks/useToast';
import { enrollTotpFactor, getMfaState, logoutOtherSessions, unenrollTotpFactor, verifyTotpChallenge, type TotpEnrollment } from '../../services/authSecurity';

export function AccountSecurityControls() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  async function refreshMfa() {
    const state = await getMfaState();
    setMfaEnabled(state.enabled);
    setFactorId(state.factorId);
  }

  useEffect(() => {
    void refreshMfa().catch((err) => console.error('Failed to load MFA state:', err)).finally(() => setLoading(false));
  }, []);

  async function beginEnrollment() {
    setBusy(true);
    try {
      setEnrollment(await enrollTotpFactor());
      setCode('');
    } catch (err: unknown) {
      pushToast({ title: 'Authenticator setup failed', description: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally { setBusy(false); }
  }

  async function verifyEnrollment() {
    if (!enrollment) return;
    setBusy(true);
    try {
      await verifyTotpChallenge(enrollment.factorId, code);
      setEnrollment(null);
      await refreshMfa();
      pushToast({ title: '2-step verification enabled', description: 'Future sign-ins require your authenticator code.', tone: 'success' });
    } catch (err: unknown) {
      pushToast({ title: 'Verification failed', description: err instanceof Error ? err.message : 'Check the code and try again.', tone: 'error' });
    } finally { setBusy(false); }
  }

  async function cancelEnrollment() {
    const pendingFactorId = enrollment?.factorId;
    setEnrollment(null);
    setCode('');
    if (!pendingFactorId) return;
    try {
      await unenrollTotpFactor(pendingFactorId);
    } catch (error) {
      console.warn('Failed to discard unverified MFA factor:', error);
    }
  }

  async function disableMfa() {
    if (!factorId) return;
    setBusy(true);
    try {
      await unenrollTotpFactor(factorId);
      setDisableOpen(false);
      await refreshMfa();
      pushToast({ title: '2-step verification disabled', description: 'Authenticator verification is no longer required.', tone: 'info' });
    } catch (err: unknown) {
      pushToast({ title: 'Unable to disable authenticator', description: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally { setBusy(false); }
  }

  async function revokeOtherSessions() {
    setBusy(true);
    try {
      await logoutOtherSessions();
      setSessionsOpen(false);
      pushToast({ title: 'Other sessions revoked', description: 'This session remains signed in. Existing access tokens on other devices expire automatically.', tone: 'success' });
    } catch (err: unknown) {
      pushToast({ title: 'Session logout failed', description: err instanceof Error ? err.message : 'Please try again.', tone: 'error' });
    } finally { setBusy(false); }
  }

  return <>
    <div className="bg-white border border-border rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-foreground">Account Security</h3><span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${mfaEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-panel-bg text-muted-foreground'}`}>{loading ? 'Checking' : mfaEnabled ? 'Protected' : 'Optional'}</span></div>
      <div className="flex items-start justify-between gap-4"><div className="space-y-0.5"><h4 className="text-xs font-semibold text-foreground">2-Step Verification</h4><p className="text-[10px] text-muted-foreground leading-relaxed">Use a TOTP authenticator app for a second sign-in step.</p></div><button type="button" disabled={loading || busy} onClick={() => mfaEnabled ? setDisableOpen(true) : void beginEnrollment()} aria-pressed={mfaEnabled} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition disabled:opacity-60 ${mfaEnabled ? 'bg-primary' : 'bg-border'}`}><span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${mfaEnabled ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>
      <div className="h-px bg-border" />
      <div className="flex items-start justify-between gap-4"><div className="space-y-0.5"><h4 className="text-xs font-semibold text-foreground">Support Access</h4><p className="text-[10px] text-muted-foreground leading-relaxed">Planned controlled access for authorized support. This control is not connected yet.</p></div><button type="button" disabled aria-label="Support Access — not yet available" title="Not yet available" className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-border opacity-60"><span className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm" /></button></div>
    </div>
    <div className="bg-white border border-border rounded-2xl p-5 shadow-xs space-y-3"><h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Active Sessions</h3><p className="text-[11px] text-muted-foreground leading-relaxed">Revoke every other refresh session while keeping this device signed in.</p><button type="button" onClick={() => setSessionsOpen(true)} className="w-full py-2 bg-panel-bg hover:bg-accent border border-border text-foreground rounded-xl text-xs font-bold transition">Log out of all other devices</button></div>

    <Modal open={Boolean(enrollment)} onClose={() => void cancelEnrollment()} title="Set up authenticator" subtitle="Scan the QR code, then enter the current 6-digit code."><div className="space-y-4">{enrollment && <><div className="mx-auto w-48 rounded-xl border border-border bg-white p-3"><img src={enrollment.qrCode} alt="Authenticator QR code" className="h-auto w-full" /></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Manual setup key</p><code className="block break-all rounded-lg bg-panel-bg p-2 text-xs">{enrollment.secret}</code></div><div><label htmlFor="mfa-enrollment-code" className="mb-1 block text-xs font-semibold">Verification code</label><input id="mfa-enrollment-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="h-11 w-full rounded-lg border border-border px-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary" /></div><button type="button" disabled={busy || code.length !== 6} onClick={() => void verifyEnrollment()} className="h-10 w-full rounded-lg bg-primary text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Verify and enable'}</button></>}</div></Modal>
    <Modal open={disableOpen} onClose={() => setDisableOpen(false)} title="Disable 2-step verification?" subtitle="Future sign-ins will require only the account password."><div className="flex justify-end gap-2"><button type="button" onClick={() => setDisableOpen(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold">Cancel</button><button type="button" disabled={busy} onClick={() => void disableMfa()} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">Disable authenticator</button></div></Modal>
    <Modal open={sessionsOpen} onClose={() => setSessionsOpen(false)} title="Log out other devices?" subtitle="Your current session will remain active."><div className="space-y-4"><div className="flex gap-2 rounded-xl border border-primary/20 bg-accent p-3 text-xs text-accent-foreground"><ShieldCheck className="h-4 w-4 shrink-0" /> Other refresh sessions will be revoked. Already-issued access tokens can remain valid until their short expiry.</div><div className="flex justify-end gap-2"><button type="button" onClick={() => setSessionsOpen(false)} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold">Cancel</button><button type="button" disabled={busy} onClick={() => void revokeOtherSessions()} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">Log out other devices</button></div></div></Modal>
  </>;
}
