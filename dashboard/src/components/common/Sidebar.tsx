import { useEffect, ComponentType } from 'react';
import {
  LayoutDashboard,
  MapPin,
  ClipboardCheck,
  BarChart3,
  Users as UsersIcon,
  Activity,
  LogOut,
  ChevronRight,
  Target,
  Calculator,
  Wallet,
  Star,
  Settings,
  X,
  BookOpen,
  HelpCircle,
  Headphones } from
'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
export type PageKey =
  | 'dashboard'
  | 'monitoring'
  | 'geofence'
  | 'attendance'
  | 'reports'
  | 'users'
  | 'computation'
  | 'reviews'
  | 'payroll';
export type SidebarRole = 'admin' | 'hr' | 'payroll';
interface SidebarUser {
  name: string;
  email: string;
  avatar: string;
}
interface SidebarProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  role: SidebarRole;
  user: SidebarUser;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenHelp?: (tab: 'guide' | 'faq' | 'support') => void;
}
interface NavItem {
  key: PageKey;
  label: string;
  icon: ComponentType<{
    className?: string;
  }>;
  route: string;
}
const ADMIN_ITEMS: NavItem[] = [
{
  key: 'dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
  route: '/admin/dashboard'
},
{
  key: 'monitoring',
  label: 'Live Monitoring',
  icon: MapPin,
  route: '/admin/monitoring'
},
{
  key: 'geofence',
  label: 'Geofence / Zones',
  icon: Target,
  route: '/admin/geofence'
},
{
  key: 'attendance',
  label: 'Attendance',
  icon: ClipboardCheck,
  route: '/admin/attendance'
},
{
  key: 'payroll',
  label: 'Payroll Checklist',
  icon: Wallet,
  route: '/admin/payroll'
},
{
  key: 'reports',
  label: 'Reports',
  icon: BarChart3,
  route: '/admin/reports'
},
{
  key: 'users',
  label: 'Users',
  icon: UsersIcon,
  route: '/admin/users'
},
{
  key: 'reviews',
  label: 'Reviews',
  icon: Star,
  route: '/admin/reviews'
}];

const HR_ITEMS: NavItem[] = [
{
  key: 'dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
  route: '/hr/dashboard'
},
{
  key: 'monitoring',
  label: 'Monitoring',
  icon: MapPin,
  route: '/hr/monitoring'
},
{
  key: 'attendance',
  label: 'Attendance',
  icon: ClipboardCheck,
  route: '/hr/attendance'
},
{
  key: 'payroll',
  label: 'Payroll Checklist',
  icon: Wallet,
  route: '/hr/payroll'
},
{
  key: 'reports',
  label: 'Reports',
  icon: BarChart3,
  route: '/hr/reports'
},
{
  key: 'users',
  label: 'Employee Management',
  icon: UsersIcon,
  route: '/hr/users'
},
{
  key: 'reviews',
  label: 'Reviews',
  icon: Star,
  route: '/hr/reviews'
}];

const PAYROLL_ITEMS: NavItem[] = [
{
  key: 'dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
  route: '/payroll/dashboard'
},
{
  key: 'computation',
  label: 'Salary Computation',
  icon: Calculator,
  route: '/payroll/computation'
},
{
  key: 'reports',
  label: 'Payroll Reports',
  icon: Wallet,
  route: '/payroll/reports'
}];

const ROLE_LABEL: Record<SidebarRole, string> = {
  admin: 'Admin',
  hr: 'HR',
  payroll: 'Payroll'
};
type AccentTheme = {
  text: string;
  badgeBg: string;
  badgeBorder: string;
  badgeDot: string;
  activeBg: string;
  activeBar: string;
  iconActive: string;
  chevron: string;
  profileRing: string;
  profileHover: string;
};
const ACCENTS: Record<SidebarRole, AccentTheme> = {
  admin: {
    text: 'text-[#b85a00]',
    badgeBg: 'bg-[#FFF1E0]',
    badgeBorder: 'border-[#db6c00]/30',
    badgeDot: 'bg-[#db6c00]',
    activeBg: 'bg-[#FFF1E0]',
    activeBar: 'bg-[#db6c00]',
    iconActive: 'text-[#db6c00]',
    chevron: 'text-[#db6c00]',
    profileRing: 'ring-[#db6c00]/15',
    profileHover: 'hover:bg-[#FFF1E0]/60'
  },
  hr: {
    text: 'text-[#b85a00]',
    badgeBg: 'bg-[#FFF1E0]',
    badgeBorder: 'border-[#db6c00]/30',
    badgeDot: 'bg-[#db6c00]',
    activeBg: 'bg-[#FFF1E0]',
    activeBar: 'bg-[#db6c00]',
    iconActive: 'text-[#db6c00]',
    chevron: 'text-[#db6c00]',
    profileRing: 'ring-[#db6c00]/15',
    profileHover: 'hover:bg-[#FFF1E0]/60'
  },
  payroll: {
    text: 'text-[#a16207]',
    badgeBg: 'bg-[#FEF3C7]',
    badgeBorder: 'border-[#ca8a04]/40',
    badgeDot: 'bg-[#ca8a04]',
    activeBg: 'bg-[#FEF9C3]',
    activeBar: 'bg-[#ca8a04]',
    iconActive: 'text-[#ca8a04]',
    chevron: 'text-[#ca8a04]',
    profileRing: 'ring-[#ca8a04]/20',
    profileHover: 'hover:bg-[#FEF9C3]/70'
  }
};
export function Sidebar({
  current,
  onNavigate,
  role,
  user,
  onSignOut,
  onOpenSettings,
  isMobileOpen = false,
  onMobileClose,
  onOpenHelp
}: SidebarProps) {
  const items =
  role === 'admin' ? ADMIN_ITEMS : role === 'hr' ? HR_ITEMS : PAYROLL_ITEMS;
  const badgeLabel = ROLE_LABEL[role];
  const a = ACCENTS[role];
  // Lock body scroll while mobile drawer is open + ESC to close
  useEffect(() => {
    if (!isMobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onMobileClose?.();
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isMobileOpen, onMobileClose]);
  function handleNavigate(key: PageKey) {
    onNavigate(key);
    // Auto-close drawer on mobile after selecting an item
    if (isMobileOpen) onMobileClose?.();
  }
  const panel = (mobile: boolean) =>
  <motion.aside
    initial={mobile ? { x: '-100%' } : { x: -20, opacity: 0 }}
    animate={mobile ? { x: 0 } : { x: 0, opacity: 1 }}
    exit={mobile ? { x: '-100%' } : undefined}
    transition={{ duration: mobile ? 0.3 : 0.4, ease: "easeOut" }}
    className={
    mobile ?
    `relative flex w-72 max-w-[85vw] shrink-0 flex-col bg-white border-r border-[#EFEAE2] h-full shadow-2xl` :
    'hidden md:flex w-64 shrink-0 flex-col bg-white border-r border-[#EFEAE2] h-screen sticky top-0'
    }>
    
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-[#EFEAE2]">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-[#db6c00] to-[#f59e0b] flex items-center justify-center shadow-sm">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div className="flex flex-col leading-tight flex-1 min-w-0">
            <span className="text-[#1A1410] font-semibold tracking-tight text-[15px]">
              AttenRider
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#6B6258] font-mono">
              MKB Corp
            </span>
          </div>
          {mobile &&
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close menu"
          className="p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition">
          
              <X className="w-5 h-5" />
            </button>
        }
        </div>
        <div
        className={`mt-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${a.badgeBg} border ${a.badgeBorder}`}>
        
          <span className={`w-1.5 h-1.5 rounded-full ${a.badgeDot}`} />
          <span
          className={`text-[11px] uppercase tracking-wider ${a.text} font-semibold`}>
          
            {badgeLabel}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-[#6B6258]/70 font-mono">
          Operations
        </div>
        {items.map(({ key, label, icon: Icon }, index) => {
        const active = current === key;
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 + 0.2 }}
          >
            <button
              onClick={() => handleNavigate(key)}
              className={`group relative z-0 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${active ? a.text : 'text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]'}`}>
              
                {active &&
              <motion.span
                layoutId="activeNav"
                className={`absolute inset-0 rounded-lg -z-10 ${a.activeBg}`}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
              }
                {active &&
              <motion.span
                layoutId="activeBar"
                className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${a.activeBar}`}
                transition={{ type: "spring", stiffness: 300, damping: 30 }} />

              }
              <Icon
              className={`w-[18px] h-[18px] ${active ? a.iconActive : 'text-[#6B6258] group-hover:text-[#1A1410]'}`} />
            
              <span className="flex-1 text-left font-medium">{label}</span>

              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                <motion.div
                  initial={false}
                  animate={{
                    opacity: active ? 1 : 0,
                    scale: active ? 1 : 0.6,
                    x: active ? 0 : -6
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`absolute ${a.chevron}`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </motion.div>

                {key === 'monitoring' && (
                  <motion.span
                    initial={false}
                    animate={{
                      opacity: active ? 0 : 1,
                      scale: active ? 0 : 1
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="absolute w-1.5 h-1.5 rounded-full bg-emerald-500"
                  />
                )}
              </div>
            </button>
          </motion.div>);

      })}

        <div className="px-2 mt-6 mb-2 text-[10px] uppercase tracking-[0.18em] text-[#6B6258]/70 font-mono">
          Help & Support
        </div>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: items.length * 0.05 + 0.2 }}
        >
          <button
            type="button"
            onClick={() => {
              onOpenHelp?.('guide');
              if (isMobileOpen) onMobileClose?.();
            }}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition cursor-pointer"
          >
            <BookOpen className="w-[18px] h-[18px] text-[#6B6258] group-hover:text-[#1A1410] shrink-0" />
            <span className="flex-1 text-left font-medium">User Guide</span>
          </button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: (items.length + 1) * 0.05 + 0.2 }}
        >
          <button
            type="button"
            onClick={() => {
              onOpenHelp?.('faq');
              if (isMobileOpen) onMobileClose?.();
            }}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition cursor-pointer"
          >
            <HelpCircle className="w-[18px] h-[18px] text-[#6B6258] group-hover:text-[#1A1410] shrink-0" />
            <span className="flex-1 text-left font-medium">FAQ</span>
          </button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: (items.length + 2) * 0.05 + 0.2 }}
        >
          <button
            type="button"
            onClick={() => {
              onOpenHelp?.('support');
              if (isMobileOpen) onMobileClose?.();
            }}
            className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition cursor-pointer"
          >
            <Headphones className="w-[18px] h-[18px] text-[#6B6258] group-hover:text-[#1A1410] shrink-0" />
            <span className="flex-1 text-left font-medium">Contact Support</span>
          </button>
        </motion.div>

        <div className="px-2 mt-6 mb-2 text-[10px] uppercase tracking-[0.18em] text-[#6B6258]/70 font-mono">
          System
        </div>
        <div className="mx-2 p-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-[#6B6258]">
              Geofence
            </span>
            <span className="text-[11px] text-emerald-600 font-mono">
              ● Online
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#6B6258] font-mono">
            <span>Realtime</span>
            <span className="text-emerald-600/90">1.8s tick</span>
          </div>
        </div>
      </nav>

      {/* Profile */}
      <div className="p-3 border-t border-[#EFEAE2]">
        <div
        className={`flex items-center gap-3 px-2 py-2 rounded-lg bg-[#FAFAF7] ${a.profileHover} transition`}>
        
          <img
          src={user.avatar}
          alt={`${user.name} avatar`}
          className={`w-9 h-9 rounded-full bg-white border border-[#EFEAE2] ring-2 ${a.profileRing}`} />
        
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[#1A1410] font-semibold truncate">
              {user.name}
            </div>
            <div className="text-[11px] text-[#6B6258] truncate font-mono">
              {user.email}
            </div>
          </div>
          {onOpenSettings && (
            <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Account settings"
            title="Account settings"
            className="text-[#6B6258] hover:text-[#db6c00] p-1.5 rounded-md hover:bg-white transition mr-0.5">
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button
          type="button"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="text-[#6B6258] hover:text-[#DC2626] p-1.5 rounded-md hover:bg-white transition">
          
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.aside>;

  return (
    <>
      {/* Desktop sidebar */}
      {panel(false)}

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="md:hidden fixed inset-0 z-[1050] pointer-events-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onMobileClose}
              className="absolute inset-0 bg-[#1A1410]/40 backdrop-blur-sm"
            />
            
            {/* Drawer panel */}
            <div className="absolute inset-y-0 left-0 flex">{panel(true)}</div>
          </div>
        )}
      </AnimatePresence>
    </>);

}
