import { useEffect, useState, useMemo, useCallback } from 'react';
import { Bell, Search, Menu, X, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { PageKey } from './Sidebar';
import { NotificationDropdown } from './NotificationDropdown';
import type { Notification } from '../../hooks/useNotifications';
import { toast } from 'react-hot-toast';
import { getSearchIndexData } from '../../services/userService';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
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
    subtitle: 'Real-time rider geolocation'
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
    subtitle: 'Manage administrators, HR, payroll, and riders'
  },
  computation: {
    title: 'Salary Computation',
    subtitle: 'Compute gross pay from validated hours'
  },
  reviews: {
    title: 'Reviews Moderation',
    subtitle: 'Approve or delete public user reviews'
  },
  payroll: {
    title: 'Payroll Checklist',
    subtitle: 'Inspect finalized cutoff records and rider statistics'
  },
  settings: {
    title: 'Settings',
    subtitle: 'Manage your personal details and account credentials'
  },
  audit_logs: {
    title: 'Audit Logs',
    subtitle: 'Security history and administrative activity trail'
  },
  daily_parcels: {
    title: 'Daily Parcel Entry',
    subtitle: 'Operational manifest recording & delivery counts'
  },
  parcel_history: {
    title: 'Parcel History',
    subtitle: 'Searchable historical daily delivery logs & audit trail'
  },
  payroll_history: {
    title: 'Payroll History',
    subtitle: 'Read-only archive of historical payroll cutoffs & payslips'
  }
};
const ALLOWED_PAGES_BY_ROLE: Record<TopbarRole, PageKey[]> = {
  admin: ['dashboard', 'monitoring', 'geofence', 'attendance', 'users', 'reviews', 'payroll', 'reports', 'settings', 'audit_logs', 'daily_parcels', 'parcel_history'],
  hr: ['dashboard', 'monitoring', 'attendance', 'users', 'reviews', 'payroll', 'reports', 'settings', 'audit_logs', 'daily_parcels', 'parcel_history'],
  payroll: ['dashboard', 'computation', 'reports', 'settings']
};

type TopbarRole = 'admin' | 'hr' | 'payroll';
interface DbSearchUser {
  id: string;
  full_name: string;
  role: string;
  contact: string | null;
  riders: { zone_id: string | null; mkb_id: string | null } | { zone_id: string | null; mkb_id: string | null }[] | null;
}

interface TopbarProps {
  page: PageKey;
  notifications: Notification[];
  unreadCount: number;
  onMarkAsRead: (id: string | number) => void;
  onMarkAllAsRead: () => void;
  onMenuClick?: () => void;
  role?: TopbarRole;
  onNavigate?: (page: PageKey) => void;
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
    bg: 'bg-accent',
    border: 'border-primary/30',
    text: 'text-accent-foreground',
    dot: 'bg-primary'
  },
  hr: {
    label: 'HR',
    bg: 'bg-accent',
    border: 'border-primary/30',
    text: 'text-accent-foreground',
    dot: 'bg-primary'
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
  role = 'admin',
  onNavigate
}: TopbarProps) {
  const isOnline = useNetworkStatus();
  const [now, setNow] = useState(() => new Date());
  const [isOpen, setIsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [riders, setRiders] = useState<{ id: string; name: string; contact?: string; mkbId?: string; zoneName?: string }[]>([]);
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasLoadedData, setHasLoadedData] = useState(false);

  const SCREENS = useMemo(() => {
    const allowed = ALLOWED_PAGES_BY_ROLE[role] || [];
    return Object.keys(TITLES)
      .filter((key) => allowed.includes(key as PageKey))
      .map((key) => {
        const pKey = key as PageKey;
        return {
          key: pKey,
          title: TITLES[pKey].title,
          subtitle: TITLES[pKey].subtitle
        };
      });
  }, [role]);

  const loadSearchData = useCallback(async () => {
    if (hasLoadedData) return;
    try {
      const { zones: zonesData, users: usersData } = await getSearchIndexData();

      setZones(zonesData.map(z => ({ id: z.id, name: z.name })));

      const mappedRiders = (usersData as unknown as DbSearchUser[])
        .filter((u) => u.role === 'rider')
        .map((u) => {
          const rData = (Array.isArray(u.riders) ? u.riders[0] : (u.riders || {})) as { zone_id: string | null; mkb_id: string | null };
          const zName = (zonesData || []).find((z: { id: string; name: string }) => z.id === rData.zone_id)?.name || 'Unassigned';
          return {
            id: u.id,
            name: u.full_name,
            contact: u.contact || '',
            mkbId: rData.mkb_id || '',
            zoneName: zName
          };
        });
      setRiders(mappedRiders);
      setHasLoadedData(true);
    } catch (err) {
      console.error('Failed to load search index:', err);
      toast.error('Failed to initialize search database');
    }
  }, [hasLoadedData]);

  useEffect(() => {
    if (searchOpen) {
      loadSearchData();
      setSearchQuery('');
    }
  }, [searchOpen, loadSearchData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredScreens = useMemo(() => {
    if (!searchQuery) return SCREENS;
    const q = searchQuery.toLowerCase();
    return SCREENS.filter(s => s.title.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q));
  }, [searchQuery, SCREENS]);

  const filteredRiders = useMemo(() => {
    const allowed = ALLOWED_PAGES_BY_ROLE[role] || [];
    if (!allowed.includes('users')) return [];

    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return riders.filter(r => r.name.toLowerCase().includes(q) || r.mkbId?.toLowerCase().includes(q));
  }, [searchQuery, riders, role]);

  const filteredZones = useMemo(() => {
    const allowed = ALLOWED_PAGES_BY_ROLE[role] || [];
    if (!allowed.includes('geofence')) return [];

    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return zones.filter(z => z.name.toLowerCase().includes(q));
  }, [searchQuery, zones, role]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const currentTitle = TITLES[page] || TITLES.dashboard;
  const { title, subtitle } = currentTitle;
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
    <header className="sticky top-0 z-[1010] bg-white/90 backdrop-blur-md border-b border-border">
      <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-4 md:gap-6 md:px-7">
        <button
          onClick={onMenuClick}
          className="md:hidden inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-panel-bg hover:text-foreground"
          aria-label="Open menu">
          
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0 flex items-center gap-2 sm:gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground min-[360px]:text-lg md:text-xl">
              {title}
            </h1>
            <p className="hidden md:block text-xs text-muted-foreground truncate">
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-lg bg-panel-bg border border-border w-72 hover:border-primary/30 transition text-left cursor-pointer outline-none focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15"
          >
            <Search className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground/70 flex-1">
              Search riders, zones, screens…
            </span>
            <kbd className="hidden xl:inline text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded border border-border bg-white">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="lg:hidden min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg border border-border bg-white text-muted-foreground hover:text-primary"
            aria-label="Open search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Search Dropdown overlay */}
          {searchOpen && (
            <>
              {/* Click catcher (transparent backdrop behind dropdown, but below header stack) */}
              <div 
                className="fixed inset-0 z-[1999] bg-transparent cursor-default" 
                onClick={() => setSearchOpen(false)} 
              />
              
              {/* Dropdown Container */}
              <div className="fixed left-3 right-3 top-[68px] w-auto sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[340px] bg-white/95 backdrop-blur-md rounded-xl border border-border/60 shadow-[0_12px_30px_-4px_rgba(26,20,16,0.12)] flex flex-col max-h-[380px] overflow-hidden z-[2000] animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Input Header */}
                <div className="flex items-center gap-3 px-3 border-b border-border/40 h-11 shrink-0">
                  <Search className="w-3.5 h-3.5 text-muted-foreground/60" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search riders, zones, screens..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none flex-1 py-2"
                  />
                  <button 
                    onClick={() => setSearchOpen(false)}
                    className="p-1 rounded-md hover:bg-panel-bg text-muted-foreground/60 hover:text-foreground transition-colors"
                    aria-label="Close search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Results Body */}
                <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {/* If no query, show quick navigation */}
                  {!searchQuery && (
                    <div className="space-y-0.5">
                      <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/55 px-2 pb-1.5">
                        Quick Navigation
                      </div>
                      {SCREENS.map(screen => (
                        <button
                          key={screen.key}
                          onClick={() => {
                            onNavigate?.(screen.key);
                            setSearchOpen(false);
                          }}
                          className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-panel-bg transition group cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors">
                              {screen.title}
                            </div>
                            <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
                              {screen.subtitle}
                            </div>
                          </div>
                          <ChevronRight className="w-3 h-3 text-border group-hover:text-primary transition-colors shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery && (
                    <>
                      {/* Screens Group */}
                      {filteredScreens.length > 0 && (
                        <div className="space-y-0.5">
                          <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/55 px-2 pb-1.5 border-b border-border/30 mb-1">
                            Screens
                          </div>
                          {filteredScreens.map(screen => (
                            <button
                              key={screen.key}
                              onClick={() => {
                                onNavigate?.(screen.key);
                                setSearchOpen(false);
                              }}
                              className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-panel-bg transition group cursor-pointer"
                            >
                              <div>
                                <div className="text-[11px] font-medium text-foreground group-hover:text-primary transition-colors">
                                  {screen.title}
                                </div>
                                <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                                  {screen.subtitle}
                                </div>
                              </div>
                              <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-primary transition-colors" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Riders Group */}
                      {filteredRiders.length > 0 && (
                        <div className="space-y-0.5">
                          <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/55 px-2 pb-1.5 border-b border-border/30 mb-1">
                            Riders
                          </div>
                          {filteredRiders.map(rider => (
                            <div
                              key={rider.id}
                              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-panel-bg transition text-[11px]"
                            >
                              <div>
                                <div className="font-medium text-foreground">
                                  {rider.name}
                                </div>
                                <div className="text-[9px] text-muted-foreground/70 font-mono mt-0.5">
                                  ID: {rider.mkbId || '—'} &bull; Zone: {rider.zoneName}
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                {rider.contact && (
                                  <a
                                    href={`https://wa.me/${rider.contact.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-1.5 py-0.5 text-[9px] font-medium border border-border hover:border-emerald-500 hover:text-emerald-600 rounded bg-white transition-colors inline-flex items-center"
                                  >
                                    Viber
                                  </a>
                                )}
                                <button
                                  onClick={() => {
                                    onNavigate?.('users');
                                    setSearchOpen(false);
                                  }}
                                  className="px-1.5 py-0.5 text-[9px] font-medium bg-primary/10 hover:bg-primary hover:text-white text-primary rounded transition-colors cursor-pointer"
                                >
                                  Go to Users
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Zones Group */}
                      {filteredZones.length > 0 && (
                        <div className="space-y-0.5">
                          <div className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/55 px-2 pb-1.5 border-b border-border/30 mb-1">
                            Zones
                          </div>
                          {filteredZones.map(zone => (
                            <div
                              key={zone.id}
                              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-panel-bg transition text-[11px]"
                            >
                              <div className="font-medium text-foreground">
                                {zone.name}
                              </div>
                              <button
                                onClick={() => {
                                  onNavigate?.('geofence');
                                  setSearchOpen(false);
                                }}
                                className="px-1.5 py-0.5 text-[9px] font-medium bg-primary/10 hover:bg-primary hover:text-white text-primary rounded transition-colors cursor-pointer"
                              >
                                Go to Geofence
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {filteredScreens.length === 0 && filteredRiders.length === 0 && filteredZones.length === 0 && (
                        <div className="text-center py-5 text-[10px] text-muted-foreground/60 italic">
                          No results found for "{searchQuery}"
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Time + status */}
        <div className="hidden sm:flex items-center gap-3 px-3 h-9 rounded-lg bg-panel-bg border border-border">
          <span className={`${isOnline ? 'text-emerald-700' : 'text-red-700'} text-[11px] flex items-center gap-1.5`}>
            <span className="relative flex w-2 h-2">
              {isOnline && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </span>
            <span className="uppercase tracking-wider font-semibold">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </span>
          <div className="h-4 w-px bg-border" />
          <div className="font-mono text-sm text-foreground tabular-nums">
            {timeStr}
          </div>
          <div className="hidden md:block text-[11px] text-muted-foreground font-mono">
            {dateStr}
          </div>
        </div>

        {/* Notifications */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className={`relative inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-white border transition cursor-pointer ${isOpen ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-primary hover:border-primary/30'}`}
            aria-label="Notifications"
            aria-expanded={isOpen}
            aria-haspopup="dialog">
            
            <motion.div
              animate={unreadCount > 0 ? { rotate: [0, -12, 10, -6, 4, 0] } : { rotate: 0 }}
              transition={{ duration: 0.55, ease: "easeInOut" }}
            >
              <Bell className="w-4 h-4" />
            </motion.div>

            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 450, damping: 25 }}
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-white shadow-sm"
              >
                {unreadCount}
              </motion.span>
            )}
          </motion.button>
          {isOpen &&
          <NotificationDropdown
            notifications={notifications}
            onMarkAsRead={onMarkAsRead}
            onMarkAllAsRead={onMarkAllAsRead}
            onClose={() => setIsOpen(false)}
            onNavigate={(path) => {
              const key = path.replace(/^\//, '').replace(/-/g, '_') as PageKey;
              if (onNavigate) {
                onNavigate(key);
              }
            }}
          />
          }
        </div>
      </div>
    </header>
  );
}
