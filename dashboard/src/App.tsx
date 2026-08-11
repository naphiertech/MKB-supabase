import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState, Component } from 'react';
import { Sidebar, type PageKey } from './components/common/Sidebar';
import { Topbar } from './components/common/Topbar';
import { DashboardSkeleton } from './components/common/DashboardSkeleton';
import { AdminDashboard } from './pages/AdminDashboard';
import { HRDashboard } from './pages/HRDashboard';
import { Login } from './pages/Login';
import { RiderDashboard } from './pages/RiderDashboard';
import { RiderAttendance } from './pages/RiderAttendance';
import { RiderMonitoring } from './pages/RiderMonitoring';
import { RiderProfile } from './pages/RiderProfile';
import { RiderTopNav, type RiderPageKey } from './components/rider/RiderTopNav';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabaseClient';
import { useRiderZone } from './context/RiderZoneContext';

import { useNotifications } from './hooks/useNotifications';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpSupportModal, type HelpTab } from './components/common/HelpSupportModal';
import { initSyncEngine, startSyncEngine, stopSyncEngine } from './lib/sync/SyncEngine';
import { PAGE_TRANSITION_VARIANTS } from './lib/motion';
import { PasswordRecovery } from './components/auth/PasswordRecovery';
import { MfaChallenge } from './components/auth/MfaChallenge';
import { getCurrentAuthSessionIdentity, getMfaState, subscribeToOtherSessionLogout } from './services/authSecurity';
import { isPasswordRecoveryUrl } from './lib/authRecoveryRoute';

const pageVariants = PAGE_TRANSITION_VARIANTS;
const LiveMonitoring = lazy(() => import('./pages/LiveMonitoring').then((module) => ({ default: module.LiveMonitoring })));
const Geofence = lazy(() => import('./pages/Geofence').then((module) => ({ default: module.Geofence })));
const Attendance = lazy(() => import('./pages/Attendance').then((module) => ({ default: module.Attendance })));
const Reports = lazy(() => import('./pages/Reports').then((module) => ({ default: module.Reports })));
const Users = lazy(() => import('./pages/Users').then((module) => ({ default: module.Users })));
const ReviewsModeration = lazy(() => import('./pages/ReviewsModeration').then((module) => ({ default: module.ReviewsModeration })));
const AuditLogs = lazy(() => import('./pages/AuditLogs').then((module) => ({ default: module.AuditLogs })));
const PayrollDashboard = lazy(() => import('./pages/PayrollDashboard').then((module) => ({ default: module.PayrollDashboard })));
const PayrollComputation = lazy(() => import('./pages/PayrollComputation').then((module) => ({ default: module.PayrollComputation })));
const PayrollReports = lazy(() => import('./pages/PayrollReports').then((module) => ({ default: module.PayrollReports })));
const DailyParcelEntry = lazy(() => import('./pages/DailyParcelEntry').then((module) => ({ default: module.DailyParcelEntry })));
const ParcelHistory = lazy(() => import('./pages/ParcelHistory').then((module) => ({ default: module.ParcelHistory })));
const PayrollHistory = lazy(() => import('./pages/PayrollHistory').then((module) => ({ default: module.PayrollHistory })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: unknown }> {
  state: { hasError: boolean; error: unknown } = { hasError: false, error: null };
  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, error };
  }
  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-2xl mx-auto my-10 bg-red-50 border border-red-200 rounded-xl shadow-lg text-red-950 font-sans">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-2 text-red-800">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
            This section could not be displayed
          </h2>
          <p className="text-sm text-red-700 mb-4 font-medium">
            Your data was not changed. Reload the dashboard and try again. If the problem continues, contact an administrator.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { NotFound } from './pages/NotFound';

export function App() {
  // Check for 404 path before any other rendering
  const isNotFound = typeof window !== 'undefined' && 
    window.location.pathname !== '/' && 
    window.location.pathname !== '' && 
    window.location.pathname !== '/index.html';

  const { session, isReady: isAuthReady, user, signOut, signOutLocally } = useAuth();
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isPasswordRecoveryUrl(window.location);
  });
  const [mfaChecking, setMfaChecking] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const getInitialPage = (): PageKey => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (hash) {
        return hash as PageKey;
      }
    }
    return 'dashboard';
  };

  const getInitialRiderPage = (): RiderPageKey => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (hash) {
        return hash as RiderPageKey;
      }
    }
    return 'dashboard';
  };

  const [currentPage, setCurrentPage] = useState<PageKey>(getInitialPage());
  const [riderPage, setRiderPage] = useState<RiderPageKey>(getInitialRiderPage());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>('guide');

  const { riders: allRiders, zones: allZones } = useRiderZone();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  const refreshMfaGate = useCallback(async () => {
    if (!session || isPasswordRecovery || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setMfaRequired(false);
      setMfaChecking(false);
      setMfaError(null);
      return;
    }
    setMfaChecking(true);
    setMfaError(null);
    try {
      const state = await getMfaState();
      setMfaRequired(state.requiresChallenge);
    } catch (error: unknown) {
      setMfaRequired(false);
      setMfaError(error instanceof Error ? error.message : 'Unable to verify account security.');
    } finally {
      setMfaChecking(false);
    }
  }, [isPasswordRecovery, session]);

  useEffect(() => {
    void refreshMfaGate();
  }, [refreshMfaGate]);

  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`account-status-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${session.id}` },
        (payload) => {
          const updated = payload.new as { status?: string; employment_status?: string };
          if (updated.status === 'suspended' || updated.employment_status === 'archived') void signOut();
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session?.id, signOut]);

  useEffect(() => {
    if (!session?.id || isPasswordRecovery) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void getCurrentAuthSessionIdentity()
      .then((identity) => {
        if (!active || identity.userId !== session.id) return undefined;
        return subscribeToOtherSessionLogout(identity, () => void signOutLocally());
      })
      .then((cleanup) => {
        if (!cleanup) return;
        if (active) unsubscribe = cleanup;
        else cleanup();
      })
      .catch((error) => console.error('Session-control subscription failed:', error));

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [isPasswordRecovery, session?.id, signOutLocally]);

  // Attach passive listeners, then activate replay only after rider identity is verified.
  useEffect(() => {
    initSyncEngine();
    if (!isAuthReady || session?.role !== 'rider' || !session.riderId) {
      stopSyncEngine();
      return;
    }

    void startSyncEngine({
      authUserId: session.id,
      riderId: session.riderId
    }).catch((err) => {
      console.error('[SyncEngine] Failed to start authenticated synchronization:', err);
    });

    return () => stopSyncEngine();
  }, [isAuthReady, session?.id, session?.riderId, session?.role]);

  // Sync state changes to URL hash
  useEffect(() => {
    if (isPasswordRecovery) return;
    if (!session) {
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return;
    }
    const role = session.role;
    const page = role === 'rider' ? riderPage : currentPage;
    if (page && typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace('#/', '').replace('#', '');
      if (currentHash !== page) {
        window.location.hash = page;
      }
    }
  }, [currentPage, isPasswordRecovery, riderPage, session]);

  // Listen for hash changes (e.g. browser back/forward buttons)
  useEffect(() => {
    if (isPasswordRecovery) return;
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (!hash) return;

      if (session?.role === 'rider') {
        setRiderPage((prev) => (prev !== hash ? (hash as RiderPageKey) : prev));
      } else {
        setCurrentPage((prev) => (prev !== hash ? (hash as PageKey) : prev));
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isPasswordRecovery, session]);

  // Riders and zones are now loaded globally via RiderZoneContext

  // Real-time Presence Tracking for the logged-in user
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase.channel('online-users');

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const activeIds = Object.values(presenceState)
          .flatMap((presencePresences: Record<string, unknown>[]) => presencePresences.map((p: Record<string, unknown>) => p.user_id as string))
          .filter(Boolean) as string[];
        
        setOnlineUserIds(Array.from(new Set(activeIds)));
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: session.id,
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);


  const role = session?.role;
  // Riders only see attendance + system notifications.
  // Payroll only sees system notifications.
  const allowedTypes = useMemo(
    () =>
      role === 'rider' ?
        (['attendance', 'system'] as const).slice() :
        role === 'payroll' ?
          (['system'] as const).slice() :
          undefined,
    [role]
  );
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications(allowedTypes);

  const sidebarBadgeCounts = useMemo(() => {
    return {
      attendance: notifications.filter(n => !n.read && (n.type === 'attendance' || n.type === 'absent')).length,
      monitoring: notifications.filter(n => !n.read && n.type === 'violation').length,
    } as Partial<Record<PageKey, number>>;
  }, [notifications]);

  // If route is 404
  if (isNotFound) {
    return <NotFound />;
  }

  if (isPasswordRecovery) {
    return <><PasswordRecovery onReturnToLogin={() => {
      window.history.replaceState(null, '', window.location.pathname);
      setIsPasswordRecovery(false);
    }} /><Toaster position="top-right" reverseOrder={false} /></>;
  }

  if (session && mfaChecking) {
    return <div className="min-h-screen grid place-items-center bg-panel-bg text-sm text-muted-foreground">Verifying account security…</div>;
  }

  if (session && mfaError) {
    return <div className="min-h-screen grid place-items-center bg-panel-bg p-6"><div className="max-w-sm rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm"><h1 className="font-semibold text-red-800">Security verification unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{mfaError}</p><div className="mt-4 flex justify-center gap-2"><button type="button" onClick={() => void refreshMfaGate()} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white">Retry</button><button type="button" onClick={signOut} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold">Sign out</button></div></div></div>;
  }

  if (session && mfaRequired) {
    return <><MfaChallenge onVerified={() => void refreshMfaGate()} onSignOut={signOut} /><Toaster position="top-right" reverseOrder={false} /></>;
  }

  // Unauthenticated — show login
  if (!session || !user) {
    return (
      <>
        <Login />
        <Toaster position="top-right" reverseOrder={false} />
      </>);

  }
  // Rider role — dedicated top-nav layout (no sidebar)
  if (role === 'rider') {
    const riderId = session.riderId;
    if (!riderId) {
      return (
        <div className="min-h-screen grid place-items-center bg-panel-bg p-6">
          <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-red-800">Rider profile not linked</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This account has no canonical rider ID. Contact HR or an administrator before recording attendance.
            </p>
            <button
              type="button"
              onClick={signOut}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    const rider = allRiders.find((r) => r.id === riderId) || { name: user.name, avatar: user.avatar, zoneId: null };
    const zone = allZones.find((z) => z.id === rider.zoneId);
    const zoneName = zone?.name || 'Zamboanga City';
    return (
      <div className="rider-shell min-h-screen w-full bg-panel-bg text-foreground font-[Geist,sans-serif] flex flex-col">
        <RiderTopNav
          current={riderPage}
          onNavigate={setRiderPage}
          user={{
            name: rider.name,
            avatar: rider.avatar,
            zoneName: zoneName
          }}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onSignOut={signOut} />

        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
                key={riderPage}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                {riderPage === 'dashboard' && <RiderDashboard userId={user.id} riderId={riderId} />}
                {riderPage === 'attendance' &&
                  <RiderAttendance userId={user.id} riderId={riderId} onBack={() => setRiderPage('dashboard')} />
                }
                {riderPage === 'monitoring' &&
                  <RiderMonitoring
                    userId={user.id}
                    riderId={riderId}
                    onBack={() => setRiderPage('dashboard')} />
                }
                {riderPage === 'profile' &&
                  <RiderProfile
                    userId={user.id}
                    riderId={riderId}
                    onBack={() => setRiderPage('dashboard')} />
                }
            </motion.div>
          </AnimatePresence>
        </main>
        <Toaster position="top-right" reverseOrder={false} />
      </div>);

  }
  // Past this point: role is 'admin' | 'hr' | 'payroll'.
  const dashRole = role as 'admin' | 'hr' | 'payroll';
  // Guards: scope each role to its allowed pages with route key normalization
  function safePageFor(r: 'admin' | 'hr' | 'payroll', p: PageKey): PageKey {
    const normalized = (p as string).replace(/-/g, '_') as PageKey;
    if (normalized === 'settings') return 'settings';
    if (r === 'admin') {
      const allowed: PageKey[] = [
        'dashboard',
        'monitoring',
        'geofence',
        'attendance',
        'reports',
        'users',
        'reviews',
        'payroll',
        'payroll_history',
        'audit_logs',
        'daily_parcels',
        'parcel_history'
      ];
      return allowed.includes(normalized) ? normalized : 'dashboard';
    }
    if (r === 'hr') {
      const allowed: PageKey[] = [
        'dashboard',
        'monitoring',
        'attendance',
        'reports',
        'reviews',
        'users',
        'payroll',
        'payroll_history',
        'audit_logs',
        'daily_parcels',
        'parcel_history'
      ];

      return allowed.includes(normalized) ? normalized : 'dashboard';
    }
    // payroll
    const allowed: PageKey[] = ['dashboard', 'computation', 'payroll_history', 'reports', 'parcel_history'];
    return allowed.includes(normalized) ? normalized : 'dashboard';
  }
  const safePage = safePageFor(dashRole, currentPage);
  function handleHrNavigate(
    page: 'monitoring' | 'attendance' | 'reports',
    _params?: Record<string, string>) {
    setCurrentPage(page);
    setMobileNavOpen(false);
  }
  function handleNavigate(p: PageKey) {
    setCurrentPage(p);
    setMobileNavOpen(false);
  }


  return (
    <div className="min-h-screen w-full bg-panel-bg text-foreground font-[Geist,sans-serif] flex">
      <Sidebar
        current={safePage}
        onNavigate={handleNavigate}
        role={dashRole}
        user={{
          name: user.name,
          email: user.email,
          avatar: user.avatar
        }}
        onSignOut={signOut}
        isMobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onOpenHelp={(tab) => {
          setHelpTab(tab);
          setHelpOpen(true);
        }}
        badgeCounts={sidebarBadgeCounts} />

      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          page={safePage}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          role={dashRole}
          onMenuClick={() => setMobileNavOpen(true)}
          onNavigate={handleNavigate} />

        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <Suspense fallback={<DashboardSkeleton page={safePage} role={dashRole} />}>
              <motion.div
                key={safePage}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                {safePage === 'settings' && <Settings />}
                {role === 'admin' &&
                  <>
                    {safePage === 'dashboard' &&
                      <AdminDashboard
                        onNavigate={(p) => handleNavigate(p as PageKey)} />
                    }
                    {safePage === 'monitoring' && <LiveMonitoring />}
                    {safePage === 'geofence' && <Geofence />}
                    {safePage === 'attendance' && <Attendance />}
                    {safePage === 'reports' && <ErrorBoundary><Reports /></ErrorBoundary>}
                    {safePage === 'users' && <Users onlineUserIds={onlineUserIds} />}
                    {safePage === 'reviews' && <ReviewsModeration />}
                    {safePage === 'payroll' && <ErrorBoundary><PayrollDashboard role={dashRole} onNavigate={handleNavigate} /></ErrorBoundary>}
                    {safePage === 'payroll_history' && <PayrollHistory role={dashRole} onNavigate={handleNavigate} />}
                    {safePage === 'audit_logs' && <AuditLogs />}
                    {safePage === 'daily_parcels' && <DailyParcelEntry />}
                    {safePage === 'parcel_history' && <ParcelHistory />}
                  </>
                }
                {role === 'hr' &&
                  <>
                    {safePage === 'dashboard' &&
                      <HRDashboard onNavigate={handleHrNavigate} />
                    }
                    {safePage === 'monitoring' && <LiveMonitoring />}
                    {safePage === 'attendance' && <Attendance />}
                    {safePage === 'reports' && <ErrorBoundary><Reports /></ErrorBoundary>}
                    {safePage === 'reviews' && <ReviewsModeration />}
                    {safePage === 'users' && <Users onlineUserIds={onlineUserIds} />}
                    {safePage === 'payroll' && <ErrorBoundary><PayrollDashboard role={dashRole} onNavigate={handleNavigate} /></ErrorBoundary>}
                    {safePage === 'payroll_history' && <PayrollHistory role={dashRole} onNavigate={handleNavigate} />}
                    {safePage === 'audit_logs' && <AuditLogs />}
                    {safePage === 'daily_parcels' && <DailyParcelEntry />}
                    {safePage === 'parcel_history' && <ParcelHistory />}
                  </>
                }
                {role === 'payroll' &&
                  <>
                    {safePage === 'dashboard' && <ErrorBoundary><PayrollDashboard role={dashRole} onNavigate={handleNavigate} /></ErrorBoundary>}
                    {safePage === 'computation' && <PayrollComputation />}
                    {safePage === 'payroll_history' && <PayrollHistory role={dashRole} onNavigate={handleNavigate} />}
                    {safePage === 'reports' && <PayrollReports />}
                    {safePage === 'parcel_history' && <ParcelHistory />}
                  </>
                }
              </motion.div>
            </Suspense>
          </AnimatePresence>
        </main>
      </div>
      <Toaster position="top-right" reverseOrder={false} />
      <HelpSupportModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        defaultTab={helpTab}
        currentUser={{ id: session.id, name: session.fullName, role: session.role }}
      />
    </div>);

}
