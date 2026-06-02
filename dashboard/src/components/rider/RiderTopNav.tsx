import { useState } from 'react';
import {
  Activity,
  LayoutDashboard,
  Clock4,
  MapPin,
  User,
  LogOut,
  Menu,
  X,
  Bell } from
'lucide-react';
import { NotificationDropdown } from '../common/NotificationDropdown';
import type { Notification } from '../../hooks/useNotifications';
export type RiderPageKey = 'dashboard' | 'attendance' | 'monitoring' | 'profile';
interface RiderTopNavProps {
  current: RiderPageKey;
  onNavigate: (page: RiderPageKey) => void;
  user: {
    name: string;
    avatar: string;
    zoneName: string;
  };
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: number) => void;
  onMarkAllAsRead: () => void;
  onSignOut?: () => void;
}
const ITEMS: {
  key: RiderPageKey;
  label: string;
  icon: typeof LayoutDashboard;
  route: string;
}[] = [
{
  key: 'dashboard',
  label: 'Dashboard',
  icon: LayoutDashboard,
  route: '/rider/dashboard'
},
{
  key: 'attendance',
  label: 'Time-In/Out',
  icon: Clock4,
  route: '/rider/attendance'
},
{
  key: 'monitoring',
  label: 'My Location',
  icon: MapPin,
  route: '/rider/monitoring'
},
{
  key: 'profile',
  label: 'Profile',
  icon: User,
  route: '/rider/profile'
}];

export function RiderTopNav({
  current,
  onNavigate,
  user,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onSignOut
}: RiderTopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <header className="sticky top-0 z-[1010] bg-white/90 backdrop-blur-md border-b border-[#EFEAE2]">
      <div className="flex items-center gap-3 md:gap-6 px-4 md:px-7 h-16">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-[#db6c00] to-[#f59e0b] flex items-center justify-center shadow-sm">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-[#1A1410] font-semibold tracking-tight text-[15px]">
              AttenRider
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#6B6258] font-mono">
              Rider Portal
            </span>
          </div>
        </div>

        <div className="hidden md:block h-6 w-px bg-[#EFEAE2]" />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {ITEMS.map(({ key, label, icon: Icon }) => {
            const active = current === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onNavigate(key)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${active ? 'bg-[#FFF1E0] text-[#b85a00]' : 'text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7]'}`}>
                
                <Icon
                  className={`w-[16px] h-[16px] ${active ? 'text-[#db6c00]' : ''}`} />
                
                <span className="font-semibold">{label}</span>
                {active &&
                <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-[#db6c00]" />
                }
              </button>);

          })}
        </nav>

        <div className="flex-1 md:hidden" />

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className={`relative p-2 rounded-lg bg-white border transition ${notifOpen ? 'border-[#db6c00]/40 text-[#db6c00]' : 'border-[#EFEAE2] text-[#6B6258] hover:text-[#db6c00] hover:border-[#db6c00]/30'}`}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            aria-haspopup="dialog">
            
            <Bell className="w-4 h-4" />
            {unreadCount > 0 &&
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#db6c00] text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-white">
                {unreadCount}
              </span>
            }
          </button>
          {notifOpen &&
          <NotificationDropdown
            notifications={notifications}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onClose={() => setNotifOpen(false)} />

          }
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg bg-white border border-[#EFEAE2] text-[#1A1410] hover:text-[#db6c00] hover:border-[#db6c00]/30 transition"
          aria-label="Toggle menu">
          
          {mobileOpen ?
          <X className="w-4 h-4" /> :

          <Menu className="w-4 h-4" />
          }
        </button>

        {/* User pill */}
        <div className="hidden sm:flex items-center gap-2.5 pl-3 pr-1.5 py-1 rounded-full bg-[#FAFAF7] border border-[#EFEAE2]">
          <div className="text-right leading-tight hidden lg:block">
            <div className="text-xs text-[#1A1410] font-semibold truncate max-w-[140px]">
              {user.name}
            </div>
            <div className="text-[10px] text-[#db6c00] font-mono uppercase tracking-wider font-semibold">
              {user.zoneName}
            </div>
          </div>
          <img
            src={user.avatar}
            alt={`${user.name} avatar`}
            className="w-8 h-8 rounded-full bg-white border border-[#EFEAE2] ring-2 ring-[#db6c00]/15" />
          
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="text-[#6B6258] hover:text-[#DC2626] p-1.5 rounded-full hover:bg-white transition">
            
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen &&
      <div className="md:hidden border-t border-[#EFEAE2] bg-white px-4 py-3 space-y-1">
          {ITEMS.map(({ key, label, icon: Icon }) => {
          const active = current === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                onNavigate(key);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${active ? 'bg-[#FFF1E0] text-[#b85a00] font-semibold' : 'text-[#1A1410] hover:bg-[#FAFAF7]'}`}>
              
                <Icon className={`w-4 h-4 ${active ? 'text-[#db6c00]' : ''}`} />
                {label}
              </button>);

        })}
        </div>
      }
    </header>);

}
