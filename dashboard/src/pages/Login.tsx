import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
  AlertCircle } from
'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { pushToast } from '../hooks/useToast';
import { BRANDING } from '../config/branding';
import { motion, AnimatePresence } from 'framer-motion';
import { LoginSkeleton } from '../components/common/DashboardSkeleton';
const DEMO_ACCOUNTS = [
{
  role: 'admin' as const,
  email: 'admin@mkb.ph',
  label: 'Admin',
  name: 'Renata Cruz'
},
{
  role: 'hr' as const,
  email: 'hr@mkb.ph',
  label: 'HR',
  name: 'Patricia Domingo'
},
{
  role: 'payroll' as const,
  email: 'payroll@mkb.ph',
  label: 'Payroll',
  name: 'Sofia Reyes'
}];

export function Login() {
  const { signIn } = useAuth();
  const [isInitLoading, setIsInitLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [activeRole, setActiveRole] = useState<
    'admin' | 'hr' | 'rider' | 'payroll' | null>(
    null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitLoading(false);
    }, 450);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn(email, password);
    setLoading(false);
    if (!res.ok) {
      const errorMsg = res.error ?? 'Sign-in failed.';
      setError(errorMsg);
      const isDeviceLock = errorMsg.includes('Device Lock Active') || errorMsg.includes('actively bound to');
      if (isDeviceLock) {
        pushToast({
          title: 'Device not authorized',
          description: 'This account can only be accessed from its registered device.',
          tone: 'error'
        });
      } else {
        pushToast({
          title: 'Sign-in failed',
          description: errorMsg,
          tone: 'error'
        });
      }
    } else {
      pushToast({
        title: 'Welcome back',
        description: `Successfully signed in to ${BRANDING.appName}.`,
        tone: 'success'
      });
    }
  }
  function handleDemoLogin(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword('demo1234');
    setActiveRole(account.role);
    setError(null);
  }
  return (
    <motion.div 
      className="min-h-screen w-full bg-white text-foreground font-[Geist,sans-serif] flex flex-col lg:flex-row"
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
    >
      {/* Left brand panel */}
      <motion.aside 
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative hidden lg:flex lg:w-1/2 xl:w-[55%] overflow-hidden bg-gradient-to-br from-accent via-accent/60 to-white items-center justify-center p-12"
      >
        {/* Decorative ornaments */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full bg-amber-500/15 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-primary/15" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full border border-primary/10" />
          <MapPin className="absolute top-16 right-24 w-5 h-5 text-primary/40" />
          <MapPin className="absolute bottom-24 left-24 w-4 h-4 text-primary/30" />
        </div>

        <div className="relative max-w-md text-center">
          <div className="ar-float inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-amber-500 shadow-[0_20px_50px_-12px_rgba(219,108,0,0.45)] mb-6">
            <Activity className="w-10 h-10 text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight text-foreground">
            Run your fleet on
            <span className="block mt-1 bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent">
              real-time confidence
            </span>
          </h2>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {BRANDING.appName} gives MKB Corporation a single pane of glass for
            attendance, geofence compliance, and rider performance across
            Zamboanga City — updated every 1.8 seconds.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 max-w-sm mx-auto">
            <Pill label="Realtime" value="1.8s" />
            <Pill label="Zones" value="5" />
            <Pill label="Riders" value="40+" />
          </div>

          <div className="mt-10 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-primary/25 text-[11px] uppercase tracking-[0.18em] text-accent-foreground font-semibold shadow-sm">
            <Sparkles className="w-3 h-3" />
            MKB Corp · Zamboanga
          </div>
        </div>
      </motion.aside>

      {/* Right form panel */}
      <motion.main 
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex-1 flex items-center justify-center px-4 py-10 sm:py-12 bg-white relative"
      >
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {isInitLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <LoginSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <a
                  href={import.meta.env.VITE_LANDING_URL || 'http://localhost:3000'}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-primary transition-colors mb-8"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to website
                </a>

                {/* Mobile brand */}
                <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
                  <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-[0_10px_25px_-8px_rgba(219,108,0,0.45)]">
                    <Activity className="w-6 h-6 text-white" strokeWidth={2.5} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-foreground font-semibold tracking-tight text-lg">
                      {BRANDING.appName}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
                      MKB Corp · Zamboanga
                    </span>
                  </div>
                </div>

                <div className="mb-6">
                  <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
                    Welcome back
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Sign in to access the {BRANDING.appName} dashboard.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <motion.div
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const v = e.target.value.toLowerCase();
                        setEmail(e.target.value);
                        setActiveRole(
                          v.includes('@riders.') ?
                          'rider' :
                          v.includes('payroll') ?
                          'payroll' :
                          v.includes('hr') ?
                          'hr' :
                          v.includes('admin') ?
                          'admin' :
                          activeRole
                        );
                      }}
                      placeholder="name@mkb.ph"
                      autoComplete="email"
                      required
                      className="w-full h-11 px-3.5 rounded-lg bg-white border border-border text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                  </motion.div>

                  <motion.div
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
                        Password
                      </label>
                      <button
                        type="button"
                        className="text-[11px] text-primary hover:text-primary-hover font-semibold cursor-pointer">
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                        className="w-full h-11 px-3.5 pr-11 rounded-lg bg-white border border-border text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition font-mono focus:border-primary focus:ring-2 focus:ring-primary/15" />
                      
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        aria-label={showPw ? 'Hide password' : 'Show password'}>
                        {showPw ?
                        <EyeOff className="w-4 h-4" /> :
                        <Eye className="w-4 h-4" />
                        }
                      </button>
                    </div>
                  </motion.div>

                  {error && (() => {
                    const isDeviceLock = error.includes('Device Lock Active') || error.includes('actively bound to');
                    if (isDeviceLock) {
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-red-50/90 border border-red-200 rounded-xl p-4 text-xs text-red-950 shadow-xs space-y-1.5 font-[Geist,sans-serif]"
                        >
                          <div className="flex items-center gap-2 text-red-800 font-bold text-sm">
                            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                            <span>Device not authorized</span>
                          </div>
                          <p className="text-xs text-red-900 leading-relaxed">
                            This account can only be accessed from its registered device. If you need to use a different device, contact HR or an administrator to request a device transfer.
                          </p>
                        </motion.div>
                      );
                    }

                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs text-red-700 bg-red-50 border border-red-500/30 rounded-xl px-3.5 py-2.5 flex items-center gap-2"
                      >
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>{error}</span>
                      </motion.div>
                    );
                  })()}

                  <motion.button
                    type="submit"
                    disabled={loading}
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-11 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition focus:outline-none focus:ring-4 disabled:opacity-60 bg-primary hover:bg-primary-hover active:bg-primary/90 text-white focus:ring-primary/25 shadow-[0_10px_25px_-8px_rgba(219,108,0,0.45)] cursor-pointer">
                    {loading ? 'Signing in…' : 'Sign in'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </motion.button>
                </form>

                {/* Demo accounts */}
                <motion.div 
                  className="mt-7 pt-6 border-t border-border"
                  initial={{ y: 16, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono font-semibold">
                      Demo accounts
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Click to autofill
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {DEMO_ACCOUNTS.map((a) => {
                      const isActive = activeRole === a.role;
                      return (
                        <button
                          key={a.role}
                          type="button"
                          onClick={() => handleDemoLogin(a)}
                          className={`text-left p-3 rounded-lg border transition cursor-pointer ${isActive ? 'bg-accent border-primary/50 ring-2 ring-primary/20' : 'bg-white border-border hover:border-primary/30 hover:bg-accent/50'}`}>
                          
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-primary">
                              {a.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              →
                            </span>
                          </div>
                          <div className="text-sm text-foreground font-semibold">
                            {a.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            {a.email}
                          </div>
                        </button>);
                    })}
                  </div>
                  <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
                    Demo build — any non-empty password works. In production, sign-in
                    is handled by Supabase Auth.
                  </p>
                </motion.div>

                <div className="text-center mt-8 text-[11px] text-muted-foreground font-mono">
                  {BRANDING.copyright}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.main>
    </motion.div>);

}
function Pill({ label, value }: {label: string;value: string;}) {
  return (
    <div className="rounded-xl bg-white/80 backdrop-blur border border-border px-3 py-2.5 text-center shadow-sm">
      <div className="text-xl font-semibold text-primary tabular-nums">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono mt-0.5 font-semibold">
        {label}
      </div>
    </div>);

}
