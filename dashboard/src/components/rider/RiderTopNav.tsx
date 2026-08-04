import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  LayoutDashboard,
  Clock4,
  MapPin,
  User,
  LogOut,
  Menu,
  X,
  Bell,
  RefreshCw,
  TriangleAlert } from
'lucide-react';
import { BRANDING } from "../../config/branding";
import { NotificationDropdown } from '../common/NotificationDropdown';
import type { Notification } from '../../hooks/useNotifications';
import { useSyncQueueStatus } from '../../hooks/useSyncQueueStatus';
import { SyncQueueDiagnosticsModal } from './SyncQueueDiagnosticsModal';
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
  onMarkAsRead: (id: string | number) => void;
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
  const [syncDiagnosticsOpen, setSyncDiagnosticsOpen] = useState(false);
  const syncStatus = useSyncQueueStatus();
  const queuedCount = syncStatus.pending + syncStatus.processing;
  return (
    <header className="sticky top-0 z-[1010] bg-white/90 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-3 md:gap-6 px-4 md:px-7 h-16">
        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-[#f59e0b] flex items-center justify-center shadow-sm">
            <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-foreground font-semibold tracking-tight text-[15px]">
              {BRANDING.appName}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
              Rider Portal
            </span>
          </div>
        </div>

        <div className="hidden md:block h-6 w-px bg-border" />

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {ITEMS.map(({ key, label, icon: Icon }) => {
            const active = current === key;
            return (
              <motion.button
                key={key}
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => onNavigate(key)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition cursor-pointer ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-panel-bg'}`}>
                
                <Icon
                  className={`w-[16px] h-[16px] transition-colors duration-150 ${active ? 'text-primary' : ''}`} />
                
                <span className="font-semibold">{label}</span>
                {active && (
                  <motion.span
                    layoutId="riderActiveBar"
                    className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </nav>

        <div className="flex-1 md:hidden" />

        {(queuedCount > 0 || syncStatus.failed > 0) &&
        <button
          type="button"
          onClick={() => {
            if (syncStatus.failed > 0) setSyncDiagnosticsOpen(true);
          }}
          disabled={syncStatus.failed === 0}
          className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
            syncStatus.failed > 0
              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
              : 'cursor-default border-amber-200 bg-amber-50 text-amber-700'
          }`}
          aria-live="polite"
          title={syncStatus.failed > 0
            ? `${syncStatus.failed} offline operation${syncStatus.failed === 1 ? '' : 's'} failed permanently and remain stored for diagnostics.`
            : `${queuedCount} offline operation${queuedCount === 1 ? '' : 's'} waiting to synchronize.`}
        >
          {syncStatus.failed > 0
            ? <TriangleAlert className="h-3.5 w-3.5" />
            : <RefreshCw className={`h-3.5 w-3.5 ${syncStatus.syncing ? 'animate-spin' : ''}`} />}
          <span>{syncStatus.failed > 0 ? `${syncStatus.failed} failed` : `${queuedCount} pending`}</span>
        </button>
        }

        {/* Notifications */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            className={`relative p-2 rounded-lg bg-white border transition ${notifOpen ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-primary hover:border-primary/30'}`}
            aria-label="Notifications"
            aria-expanded={notifOpen}
            aria-haspopup="dialog">
            
            <Bell className="w-4 h-4" />
            {unreadCount > 0 &&
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-white">
                {unreadCount}
              </span>
            }
          </button>
          {notifOpen &&
          <NotificationDropdown
            notifications={notifications}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onClose={() => setNotifOpen(false)}
            onNavigate={(path) => {
              const key = path.replace('/rider/', '').replace('/', '') as RiderPageKey;
              if (onNavigate && (key === 'dashboard' || key === 'attendance' || key === 'monitoring' || key === 'profile')) {
                onNavigate(key);
              }
            }}
          />

          }
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg bg-white border border-border text-foreground hover:text-primary hover:border-primary/30 transition"
          aria-label="Toggle menu">
          
          {mobileOpen ?
          <X className="w-4 h-4" /> :

          <Menu className="w-4 h-4" />
          }
        </button>

        {/* User pill */}
        <div className="hidden sm:flex items-center gap-2.5 pl-3 pr-1.5 py-1 rounded-full bg-panel-bg border border-border">
          <div className="text-right leading-tight hidden lg:block">
            <div className="text-xs text-foreground font-semibold truncate max-w-[140px]">
              {user.name}
            </div>
            <div className="text-[10px] text-primary font-mono uppercase tracking-wider font-semibold">
              {user.zoneName}
            </div>
          </div>
          <img
            src={user.avatar}
            alt={`${user.name} avatar`}
            className="w-8 h-8 rounded-full bg-white border border-border ring-2 ring-primary/15" />
          
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="text-muted-foreground hover:text-[#DC2626] p-1.5 rounded-full hover:bg-white transition">
            
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen &&
      <div className="md:hidden border-t border-border bg-white px-4 py-3 space-y-1">
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
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${active ? 'bg-accent text-accent-foreground font-semibold' : 'text-foreground hover:bg-panel-bg'}`}>
              
                <Icon className={`w-4 h-4 ${active ? 'text-primary' : ''}`} />
                {label}
              </button>);

        })}
        </div>
      }
      <SyncQueueDiagnosticsModal
        open={syncDiagnosticsOpen}
        failedCount={syncStatus.failed}
        onClose={() => setSyncDiagnosticsOpen(false)}
      />
    </header>);

}
