import { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { completePasswordRecovery } from '../../services/authSecurity';
import { pushToast } from '../../hooks/useToast';
import { BRANDING } from '../../config/branding';
import { getRecoveryLinkError } from '../../lib/authRecoveryRoute';

interface PasswordRecoveryProps {
  onReturnToLogin: () => void;
}

export function PasswordRecovery({ onReturnToLogin }: PasswordRecoveryProps) {
  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const linkError = getRecoveryLinkError(window.location.hash);
    if (linkError) setError(linkError);

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session));
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setHasRecoverySession(Boolean(session));
        setChecking(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await completePasswordRecovery(password);
      await supabase.auth.signOut({ scope: 'global' });
      setCompleted(true);
      pushToast({ title: 'Password updated', description: 'Sign in with your new password.', tone: 'success' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password could not be updated. Request a new recovery link and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-panel-bg px-4 py-10 grid place-items-center font-[Geist,sans-serif]">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-white"><Activity className="h-6 w-6" /></div>
          <div><h1 className="text-xl font-semibold text-foreground">Set a new password</h1><p className="text-xs text-muted-foreground">{BRANDING.appName} account recovery</p></div>
        </div>

        {checking ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Verifying recovery link…</div>
        ) : completed ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0" /> Your password was updated successfully.</div>
            <button type="button" onClick={onReturnToLogin} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover">Return to sign in</button>
          </div>
        ) : !hasRecoverySession ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex gap-2"><AlertCircle className="h-5 w-5 shrink-0" /> {error || 'This recovery link is invalid or has expired. Request a new link from the sign-in page.'}</div>
            <button type="button" onClick={onReturnToLogin} className="h-11 w-full rounded-lg border border-border bg-white text-sm font-semibold text-foreground hover:bg-panel-bg">Return to sign in</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="recovery-password" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">New password</label>
              <div className="relative"><input id="recovery-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required className="h-11 w-full rounded-lg border border-border px-3.5 pr-11 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>
            <div><label htmlFor="recovery-confirm" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Confirm password</label><input id="recovery-confirm" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" required aria-invalid={Boolean(error)} aria-describedby={error ? 'recovery-error' : undefined} className="h-11 w-full rounded-lg border border-border px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>
            {error && <p id="recovery-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            <button type="submit" disabled={submitting} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{submitting ? 'Updating password…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
