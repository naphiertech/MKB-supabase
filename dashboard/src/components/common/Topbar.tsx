import { useEffect, useState } from 'react';
import { Bell, Search, Menu } from 'lucide-react';
import type { PageKey } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import type { Notification } from '../../hooks/useNotifications';
const TITLES: Record<
  PageKey,
  {
    title: string;
    subtitle: string;
  }> =
{
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Operations overview · Zamboanga City'
  },
  monitoring: {
    title: 'Live Monitoring',
    subtitle: 'Realtime rider geolocation'
  },
  geofence: {
    title: 'Geofence Zones',
    subtitle: 'Manage operational boundaries · Zamboanga City'
  },
  attendance: {
    title: 'Attendance',
    subtitle: 'Daily logs & shift compliance'
  },
  reports: {
    title: 'Reports',
    subtitle: 'Insights & exports'
  },
  users: {
    title: 'Users',
    subtitle: 'Manage admins, dispatchers, riders'
  },
  computation: {
    title: 'Salary Computation',
    subtitle: 'Compute gross pay from validated hours'
  }
};
type TopbarRole = 'admin' | 'hr' | 'payroll';
interface TopbarProps {
  page: PageKey;
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: number) => void;
  onMarkAllAsRead: () => void;
  onMenuClick?: () => void;
  role?: TopbarRole;
}
const ROLE_BADGE: Record<
  TopbarRole,
  {
    label: string;
    bg: string;
    border: string;
    text: string;
    dot: string;
  }> =
{
  admin: {
    label: 'Admin',
    bg: 'bg-[#FFF1E0]',
    border: 'border-[#db6c00]/30',
    text: 'text-[#b85a00]',
    dot: 'bg-[#db6c00]'
  },
  hr: {
    label: 'HR',
    bg: 'bg-[#FFF1E0]',
    border: 'border-[#db6c00]/30',
    text: 'text-[#b85a00]',
    dot: 'bg-[#db6c00]'
  },
  payroll: {
    label: 'Payroll',
    bg: 'bg-[#FEF3C7]',
    border: 'border-[#ca8a04]/40',
    text: 'text-[#a16207]',
    dot: 'bg-[#ca8a04]'
  }
};
export function Topbar({
  page,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onMenuClick,
  role = 'admin'
}: TopbarProps) {
  const [now, setNow] = useState(() => new Date());
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { title, subtitle } = TITLES[page];
  const timeStr = now.toLocaleTimeString('en-PH', {
    hour12: false
  });
  const dateStr = now.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const badge = ROLE_BADGE[role];
  return (
    <header className="sticky top-0 z-[1010] bg-white/90 backdrop-blur-md border-b border-[#EFEAE2]">
      <div className="flex items-center gap-3 md:gap-6 px-4 md:px-7 h-16">
        <button
          onClick={onMenuClick}
          className="md:hidden text-[#6B6258] hover:text-[#1A1410] p-1.5"
          aria-label="Open menu">
          
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-[#1A1410] font-semibold text-lg md:text-xl tracking-tight truncate">
              {title}
            </h1>
            <p className="hidden md:block text-xs text-[#6B6258] truncate">
              {subtitle}
            </p>
          </div>
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${badge.border} ${badge.bg} text-[11px] uppercase tracking-wider font-semibold ${badge.text}`}>
            
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] w-72 focus-within:border-[#db6c00]/40 focus-within:ring-2 focus-within:ring-[#db6c00]/15 transition">
          <Search className="w-4 h-4 text-[#6B6258]" />
          <input
            type="text"
            placeholder="Search riders, zones, logs…"
            className="bg-transparent text-sm text-[#1A1410] placeholder:text-[#6B6258]/70 outline-none flex-1" />
          
          <kbd className="hidden xl:inline text-[10px] font-mono text-[#6B6258] px-1.5 py-0.5 rounded border border-[#EFEAE2] bg-white">
            ⌘K
          </kbd>
        </div>

        {/* Time + status */}
        <div className="hidden sm:flex items-center gap-3 px-3 h-9 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2]">
          <span className="text-emerald-600 text-[11px] flex items-center gap-1.5">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="uppercase tracking-wider font-semibold">
              System
            </span>
          </span>
          <div className="h-4 w-px bg-[#EFEAE2]" />
          <div className="font-mono text-sm text-[#1A1410] tabular-nums">
            {timeStr}
          </div>
          <div className="hidden md:block text-[11px] text-[#6B6258] font-mono">
            {dateStr}
          </div>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className={`relative p-2 rounded-lg bg-white border transition ${isOpen ? 'border-[#db6c00]/40 text-[#db6c00]' : 'border-[#EFEAE2] text-[#6B6258] hover:text-[#db6c00] hover:border-[#db6c00]/30'}`}
            aria-label="Notifications"
            aria-expanded={isOpen}
            aria-haspopup="dialog">
            
            <Bell className="w-4 h-4" />
            {unreadCount > 0 &&
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#db6c00] text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-white">
                {unreadCount}
              </span>
            }
          </button>
          {isOpen &&
          <NotificationDropdown
            notifications={notifications}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onClose={() => setIsOpen(false)} />

          }
        </div>
      </div>
    </header>);

}
