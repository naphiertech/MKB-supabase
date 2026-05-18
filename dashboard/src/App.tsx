import { useEffect, useMemo, useState } from 'react';
import { Sidebar, type PageKey } from './components/common/Sidebar';
import { Topbar } from './components/common/Topbar';
import { AdminDashboard } from './pages/AdminDashboard';
import { HRDashboard } from './pages/HRDashboard';
import { LiveMonitoring } from './pages/LiveMonitoring';
import { Geofence } from './pages/Geofence';
import { Attendance } from './pages/Attendance';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Login } from './pages/Login';
import { RiderDashboard } from './pages/RiderDashboard';
import { RiderAttendance } from './pages/RiderAttendance';
import { RiderMonitoring } from './pages/RiderMonitoring';
import { RiderProfile } from './pages/RiderProfile';
import { RiderTopNav, type RiderPageKey } from './components/rider/RiderTopNav';
import { PayrollDashboard } from './pages/PayrollDashboard';
import { PayrollComputation } from './pages/PayrollComputation';
import { PayrollReports } from './pages/PayrollReports';
import { riders as ALL_RIDERS, zones as ALL_ZONES } from './services/mockData';
import { useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useNotifications';
import { ToastViewport } from './components/common/Toast';
import { AnimatePresence, motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.25,
  ease: "easeInOut" as const
};
export function App() {
  const { session, user, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const [riderPage, setRiderPage] = useState<RiderPageKey>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  // Reset to dashboard whenever the role changes (e.g. switching accounts)
  useEffect(() => {
    setCurrentPage('dashboard');
    setRiderPage('dashboard');
    setMobileNavOpen(false);
  }, [session?.role]);
  // Unauthenticated — show login
  if (!session || !user) {
    return (
      <>
        <Login />
        <ToastViewport />
      </>);

  }
  // Rider role — dedicated top-nav layout (no sidebar)
  if (role === 'rider') {
    const riderId = user.id.replace(/^u-rider-/, '');
    const rider = ALL_RIDERS.find((r) => r.id === riderId) ?? ALL_RIDERS[0];
    const zone = ALL_ZONES.find((z) => z.id === rider.zoneId) ?? ALL_ZONES[0];
    return (
      <div className="min-h-screen w-full bg-[#FAFAF7] text-[#1A1410] font-[Geist,sans-serif] flex flex-col">
        <RiderTopNav
          current={riderPage}
          onNavigate={setRiderPage}
          user={{
            name: rider.name,
            avatar: rider.avatar,
            zoneName: zone.name
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
              transition={pageTransition}
              className="h-full"
            >
              {riderPage === 'dashboard' && <RiderDashboard userId={user.id} />}
              {riderPage === 'attendance' &&
              <RiderAttendance onBack={() => setRiderPage('dashboard')} />
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
          </AnimatePresence>
        </main>
        <ToastViewport />
      </div>);

  }
  // Past this point: role is 'admin' | 'hr' | 'payroll'.
  const dashRole = role as 'admin' | 'hr' | 'payroll';
  // Guards: scope each role to its allowed pages
  function safePageFor(r: 'admin' | 'hr' | 'payroll', p: PageKey): PageKey {
    if (r === 'admin') return p;
    if (r === 'hr') {
      const allowed: PageKey[] = [
      'dashboard',
      'monitoring',
      'attendance',
      'reports'];

      return allowed.includes(p) ? p : 'dashboard';
    }
    // payroll
    const allowed: PageKey[] = ['dashboard', 'computation', 'reports'];
    return allowed.includes(p) ? p : 'dashboard';
  }
  const safePage = safePageFor(dashRole, currentPage);
  function handleHrNavigate(
  page: 'monitoring' | 'attendance' | 'reports',
  _params?: Record<string, string>)
  {
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
        onMobileClose={() => setMobileNavOpen(false)} />
      
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          page={safePage}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          role={dashRole}
          onMenuClick={() => setMobileNavOpen(true)} />
        
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={safePage}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="h-full"
            >
              {role === 'admin' &&
              <>
                  {safePage === 'dashboard' &&
                <AdminDashboard
                  onNavigate={(p) => handleNavigate(p as PageKey)} />

                }
                  {safePage === 'monitoring' && <LiveMonitoring />}
                  {safePage === 'geofence' && <Geofence />}
                  {safePage === 'attendance' && <Attendance />}
                  {safePage === 'reports' && <Reports />}
                  {safePage === 'users' && <Users />}
                </>
              }
              {role === 'hr' &&
              <>
                  {safePage === 'dashboard' &&
                <HRDashboard onNavigate={handleHrNavigate} />
                }
                  {safePage === 'monitoring' && <LiveMonitoring />}
                  {safePage === 'attendance' && <Attendance />}
                  {safePage === 'reports' && <Reports />}
                </>
              }
              {role === 'payroll' &&
              <>
                  {safePage === 'dashboard' && <PayrollDashboard />}
                  {safePage === 'computation' && <PayrollComputation />}
                  {safePage === 'reports' && <PayrollReports />}
                </>
              }
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ToastViewport />
    </div>);

}