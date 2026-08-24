import { useEffect, useState } from 'react';
import { Activity, Loader2, ShieldCheck } from 'lucide-react';
import { getMfaState, verifyTotpChallenge } from '../../services/auth/authSecurity';

interface MfaChallengeProps {
  onVerified: () => void;
  onSignOut: () => void;
}

export function MfaChallenge({ onVerified, onSignOut }: MfaChallengeProps) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getMfaState().then((state) => {
      setFactorId(state.factorId);
      if (!state.factorId) setError('No verified authenticator is available for this account.');
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to load authenticator settings.')).finally(() => setLoading(false));
  }, []);

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyTotpChallenge(factorId, code);
      onVerified();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The verification code is invalid or expired.');
    } finally {
      setVerifying(false);
    }
  }

  return <main className="min-h-screen bg-panel-bg px-4 py-10 grid place-items-center font-[Geist,sans-serif]"><div className="w-full max-w-sm rounded-2xl border border-border bg-white p-6 shadow-xl"><div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-white"><Activity className="h-6 w-6" /></div><div><h1 className="text-lg font-semibold">Authenticator verification</h1><p className="text-xs text-muted-foreground">Complete the second sign-in step</p></div></div>{loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading authenticator…</div> : <form onSubmit={handleVerify} className="space-y-4"><div className="rounded-xl border border-primary/20 bg-accent p-3 text-xs text-accent-foreground flex gap-2"><ShieldCheck className="h-4 w-4 shrink-0" /> Enter the current 6-digit code from your authenticator app.</div><div><label htmlFor="mfa-code" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Verification code</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required aria-invalid={Boolean(error)} aria-describedby={error ? 'mfa-challenge-error' : undefined} className="h-12 w-full rounded-lg border border-border text-center font-mono text-xl tracking-[0.4em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>{error && <p id="mfa-challenge-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}<button type="submit" disabled={verifying || !factorId || code.length !== 6} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{verifying ? 'Verifying…' : 'Verify and continue'}</button><button type="button" onClick={onSignOut} className="h-10 w-full text-xs font-semibold text-muted-foreground hover:text-foreground">Sign out</button></form>}</div></main>;
}
