import { useEffect, ComponentType, useState } from 'react';
import { BRANDING } from '../../config/branding';
import {
  LayoutDashboard,
  MapPin,
  ClipboardCheck,
  BarChart3,
  Users as UsersIcon,
  Activity,
  LogOut,
  ChevronDown,
  Target,
  Calculator,
  Wallet,
  Star,
  Settings,
  X,
  BookOpen,
  HelpCircle,
  Headphones,
  PackageCheck,
  History
} from 'lucide-react';
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
  | 'payroll'
  | 'settings'
  | 'audit_logs'
  | 'daily_parcels'
  | 'parcel_history';
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
  badgeCounts?: Partial<Record<PageKey, number>>;
}

export type SidebarItem =
  | {
      type: 'link';
      key: PageKey;
      label: string;
      icon: ComponentType<{ className?: string }>;
    }
  | {
      type: 'section';
      title: string;
      icon: ComponentType<{ className?: string }>;
      items: {
        key: PageKey;
        label: string;
        icon: ComponentType<{ className?: string }>;
      }[];
    };

const ADMIN_ITEMS: SidebarItem[] = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    type: 'section',
    title: 'Tracking & Zones',
    icon: MapPin,
    items: [
      { key: 'monitoring', label: 'Live Monitoring', icon: Activity },
      { key: 'geofence', label: 'Geofence / Zones', icon: Target }
    ]
  },
  {
    type: 'section',
    title: 'HR & Employees',
    icon: ClipboardCheck,
    items: [
      { key: 'attendance', label: 'Attendance logs', icon: ClipboardCheck },
      { key: 'users', label: 'Users Registry', icon: UsersIcon },
      { key: 'reviews', label: 'Courier Reviews', icon: Star },
      { key: 'audit_logs', label: 'Audit Logs', icon: BookOpen }
    ]
  },
  {
    type: 'section',
    title: 'Parcel Operations',
    icon: PackageCheck,
    items: [
      { key: 'daily_parcels', label: 'Daily Parcel Entry', icon: PackageCheck },
      { key: 'parcel_history', label: 'Parcel History', icon: History }
    ]
  },
  {
    type: 'section',
    title: 'Finance & Reports',
    icon: Wallet,
    items: [
      { key: 'payroll', label: 'Payroll Checklist', icon: Wallet },
      { key: 'reports', label: 'Insights & Reports', icon: BarChart3 }
    ]
  }
];

const HR_ITEMS: SidebarItem[] = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    type: 'section',
    title: 'Tracking & Zones',
    icon: MapPin,
    items: [
      { key: 'monitoring', label: 'Live Monitoring', icon: Activity }
    ]
  },
  {
    type: 'section',
    title: 'HR & Employees',
    icon: ClipboardCheck,
    items: [
      { key: 'attendance', label: 'Attendance logs', icon: ClipboardCheck },
      { key: 'users', label: 'Employee Management', icon: UsersIcon },
      { key: 'reviews', label: 'Courier Reviews', icon: Star },
      { key: 'audit_logs', label: 'Audit Logs', icon: BookOpen }
    ]
  },
  {
    type: 'section',
    title: 'Parcel Operations',
    icon: PackageCheck,
    items: [
      { key: 'daily_parcels', label: 'Daily Parcel Entry', icon: PackageCheck },
      { key: 'parcel_history', label: 'Parcel History', icon: History }
    ]
  },
  {
    type: 'section',
    title: 'Finance & Reports',
    icon: Wallet,
    items: [
      { key: 'payroll', label: 'Payroll Checklist', icon: Wallet },
      { key: 'reports', label: 'Insights & Reports', icon: BarChart3 }
    ]
  }
];

const PAYROLL_ITEMS: SidebarItem[] = [
  {
    type: 'link',
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    type: 'section',
    title: 'Compensation',
    icon: Calculator,
    items: [
      { key: 'computation', label: 'Salary Computation', icon: Calculator },
      { key: 'reports', label: 'Payroll Reports', icon: Wallet }
    ]
  }
];

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
    profileRing: 'ring-[#db6c00]/20',
    profileHover: 'hover:bg-[#FFF1E0]/70'
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
    profileRing: 'ring-[#db6c00]/20',
    profileHover: 'hover:bg-[#FFF1E0]/70'
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
  onOpenHelp,
  badgeCounts
}: SidebarProps) {
  const items =
  role === 'admin' ? ADMIN_ITEMS : role === 'hr' ? HR_ITEMS : PAYROLL_ITEMS;
  const badgeLabel = ROLE_LABEL[role];
  const a = ACCENTS[role];

  // Accordion open/close states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Parcel Operations': true,
    'Tracking & Zones': true,
    'HR & Employees': true,
    'Finance & Reports': true,
    'Compensation': true,
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  // Auto-expand the section containing the active page on load/change
  useEffect(() => {
    const activeSection = items.find(
      (item) => item.type === 'section' && item.items.some((sub) => sub.key === current)
    );
    if (activeSection && activeSection.type === 'section') {
      setExpandedSections((prev) => ({
        ...prev,
        [activeSection.title]: true
      }));
    }
  }, [current, items]);

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
              {BRANDING.appName}
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
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.18em] text-[#6B6258]/70 font-mono">
          Operations
        </div>
        {items.map((item, index) => {
          if (item.type === 'link') {
            const active = current === item.key;
            const Icon = item.icon;
            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 + 0.1 }}
              >
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleNavigate(item.key)}
                  className={`group relative z-0 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition cursor-pointer ${active ? a.text : 'text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]'}`}>
                  {active && (
                    <motion.span
                      layoutId="activeNav"
                      className={`absolute inset-0 rounded-lg -z-10 ${a.activeBg}`}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {active && (
                    <motion.span
                      layoutId="activeBar"
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${a.activeBar}`}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-[18px] h-[18px] transition-colors duration-150 ${active ? a.iconActive : 'text-[#6B6258] group-hover:text-[#1A1410]'}`} />
                  <span className="flex-1 text-left font-medium">{item.label}</span>
                  {badgeCounts?.[item.key] ? (
                    <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center shadow-sm">
                      {badgeCounts[item.key]}
                    </span>
                  ) : null}
                </motion.button>
              </motion.div>
            );
          } else {
            const Icon = item.icon;
            const expanded = !!expandedSections[item.title];
            const hasActiveChild = item.items.some((sub) => sub.key === current);
            const sectionBadgeSum = item.items.reduce((sum, sub) => sum + (badgeCounts?.[sub.key] || 0), 0);
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 + 0.1 }}
                className="space-y-0.5"
              >
                <button
                  onClick={() => toggleSection(item.title)}
                  className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition cursor-pointer text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] ${hasActiveChild ? 'font-semibold text-[#1A1410]' : ''}`}>
                  <Icon className={`w-[18px] h-[18px] ${hasActiveChild ? a.iconActive : 'text-[#6B6258] group-hover:text-[#1A1410]'}`} />
                  <span className="flex-1 text-left font-medium">{item.title}</span>
                  {sectionBadgeSum > 0 && !expanded && (
                    <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center mr-1 shadow-sm animate-pulse">
                      {sectionBadgeSum}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 text-[#6B6258] ${expanded ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeInOut" }}
                      className="overflow-hidden border-l border-[#EFEAE2] ml-5 pl-[14px] mt-1 space-y-1"
                    >
                      {item.items.map((subItem) => {
                        const subActive = current === subItem.key;
                        const SubIcon = subItem.icon;
                        return (
                          <button
                            key={subItem.key}
                            onClick={() => handleNavigate(subItem.key)}
                            className={`group relative z-0 w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${subActive ? a.text : 'text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]'}`}>
                            {subActive && (
                              <motion.span
                                layoutId="activeSubNav"
                                className={`absolute inset-0 rounded-lg -z-10 ${a.activeBg}`}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                              />
                            )}
                            <SubIcon className={`w-3.5 h-3.5 ${subActive ? a.iconActive : 'text-[#6B6258] group-hover:text-[#1A1410]'}`} />
                            <span className="flex-1 text-left font-medium">{subItem.label}</span>
                            {badgeCounts?.[subItem.key] ? (
                              <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center ml-auto shadow-sm animate-pulse">
                                {badgeCounts[subItem.key]}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          }
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
          <button
            type="button"
            onClick={onOpenSettings || (() => handleNavigate('settings'))}
            aria-label="Account settings"
            title="Account settings"
            className={`p-1.5 rounded-md hover:bg-white transition mr-0.5 cursor-pointer ${current === 'settings' ? a.iconActive : 'text-[#6B6258] hover:text-[#db6c00]'}`}>
            <Settings className="w-4 h-4" />
          </button>
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
