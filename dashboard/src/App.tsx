import React, { useEffect, useMemo, useState, Component } from 'react';
import { Sidebar, type PageKey } from './components/common/Sidebar';
import { Topbar } from './components/common/Topbar';
import { DashboardSkeleton } from './components/common/DashboardSkeleton';
import { AdminDashboard } from './pages/AdminDashboard';
import { HRDashboard } from './pages/HRDashboard';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { Geofence } from './pages/Geofence';
import { Attendance } from './pages/Attendance';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { ReviewsModeration } from './pages/ReviewsModeration';
import { AuditLogs } from './pages/AuditLogs';
import { Login } from './pages/Login';
import { RiderDashboard } from './pages/RiderDashboard';
import { RiderAttendance } from './pages/RiderAttendance';
import { RiderMonitoring } from './pages/RiderMonitoring';
import { RiderProfile } from './pages/RiderProfile';
import { RiderTopNav, type RiderPageKey } from './components/rider/RiderTopNav';
import { PayrollDashboard } from './pages/PayrollDashboard';
import { PayrollComputation } from './pages/PayrollComputation';
import { PayrollReports } from './pages/PayrollReports';
import { DailyParcelEntry } from './pages/DailyParcelEntry';
import { ParcelHistory } from './pages/ParcelHistory';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabaseClient';
import { useRiderZone } from './context/RiderZoneContext';

import { useNotifications } from './hooks/useNotifications';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings } from './pages/Settings';
import { HelpSupportModal, type HelpTab } from './components/common/HelpSupportModal';
import { initSyncEngine } from './lib/sync/SyncEngine';
import { PAGE_TRANSITION_VARIANTS } from './lib/motion';

const pageVariants = PAGE_TRANSITION_VARIANTS;
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
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            Component Rendering Error Detected
          </h2>
          <p className="text-sm text-red-700 mb-4 font-medium">
            The reports dashboard encountered a runtime error and was caught by the emergency error boundary:
          </p>
          <div className="bg-red-950 text-red-100 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[300px] border border-red-900 leading-relaxed whitespace-pre-wrap">
            {(this.state.error instanceof Error ? this.state.error.stack : String(this.state.error)) || 'Unknown Error'}
          </div>
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

  const { session, user, signOut } = useAuth();
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
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTab>('guide');

  const { riders: allRiders, zones: allZones } = useRiderZone();
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  // Initialize SyncEngine for background offline synchronization
  useEffect(() => {
    initSyncEngine();
  }, []);

  // Sync state changes to URL hash
  useEffect(() => {
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
  }, [currentPage, riderPage, session]);

  // Listen for hash changes (e.g. browser back/forward buttons)
  useEffect(() => {
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
  }, [session]);

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


  // Trigger organic simulated skeleton loading on page/tab changes
  useEffect(() => {
    setIsPageLoading(true);
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [currentPage, riderPage]);

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
    const riderId = user.id.replace(/^u-rider-/, '');
    const rider = allRiders.find((r) => r.id === riderId) || { name: user.name, avatar: user.avatar, zoneId: null };
    const zone = allZones.find((z) => z.id === rider.zoneId);
    const zoneName = zone?.name || 'Zamboanga City';
    return (
      <div className="min-h-screen w-full bg-[#FAFAF7] text-[#1A1410] font-[Geist,sans-serif] flex flex-col">
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
            {isPageLoading ? (
              <div key="loading" className="h-full">
                <DashboardSkeleton page={riderPage} role="rider" />
              </div>
            ) : (
              <motion.div
                key={riderPage}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="h-full"
              >
                {riderPage === 'dashboard' && <RiderDashboard userId={user.id} />}
                {riderPage === 'attendance' &&
                  <RiderAttendance userId={user.id} onBack={() => setRiderPage('dashboard')} />
                }
                {riderPage === 'monitoring' &&
                  <RiderMonitoring
                    userId={user.id}
                    onBack={() => setRiderPage('dashboard')} />
                }
                {riderPage === 'profile' &&
                  <RiderProfile
                    userId={user.id}
                    onBack={() => setRiderPage('dashboard')} />
                }
              </motion.div>
            )}
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
        'audit_logs',
        'daily_parcels',
        'parcel_history'
      ];

      return allowed.includes(normalized) ? normalized : 'dashboard';
    }
    // payroll
    const allowed: PageKey[] = ['dashboard', 'computation', 'reports'];
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
    <div className="min-h-screen w-full bg-[#FAFAF7] text-[#1A1410] font-[Geist,sans-serif] flex">
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
            {isPageLoading ? (
              <div key="loading" className="h-full">
                <DashboardSkeleton page={safePage} role={dashRole} />
              </div>
            ) : (
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
                    {safePage === 'audit_logs' && <AuditLogs />}
                    {safePage === 'daily_parcels' && <DailyParcelEntry />}
                    {safePage === 'parcel_history' && <ParcelHistory />}
                  </>
                }
                {role === 'payroll' &&
                  <>
                    {safePage === 'dashboard' && <ErrorBoundary><PayrollDashboard role={dashRole} onNavigate={handleNavigate} /></ErrorBoundary>}
                    {safePage === 'computation' && <PayrollComputation />}
                    {safePage === 'reports' && <PayrollReports />}
                  </>
                }
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <Toaster position="top-right" reverseOrder={false} />
      <HelpSupportModal open={helpOpen} onClose={() => setHelpOpen(false)} defaultTab={helpTab} />
    </div>);

}
