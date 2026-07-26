import React, { useEffect, useRef, useLayoutEffect } from 'react';
import {
  AlertTriangle,
  UserX,
  CheckCircle2,
  Info,
  Clock,
  DollarSign,
  MapPin,
  UserCheck,
  User,
  Megaphone,
  ChevronRight,
  X
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Notification, NotificationType } from '../../hooks/useNotifications';
import { DROPDOWN_VARIANTS } from '../../lib/motion';

interface NotificationDropdownProps {
  notifications: Notification[];
  onMarkAsRead: (id: string | number) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

const CATEGORY_STYLES: Record<
  string,
  {
    icon: React.ElementType;
    bg: string;
    fg: string;
  }
> = {
  attendance: {
    icon: Clock,
    bg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    fg: 'text-emerald-600'
  },
  payroll: {
    icon: DollarSign,
    bg: 'bg-amber-50 text-amber-600 border-amber-100',
    fg: 'text-amber-600'
  },
  geofence: {
    icon: MapPin,
    bg: 'bg-rose-50 text-rose-600 border-rose-100',
    fg: 'text-rose-600'
  },
  biometrics: {
    icon: UserCheck,
    bg: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    fg: 'text-indigo-600'
  },
  account: {
    icon: User,
    bg: 'bg-sky-50 text-sky-600 border-sky-100',
    fg: 'text-sky-600'
  },
  announcement: {
    icon: Megaphone,
    bg: 'bg-purple-50 text-purple-600 border-purple-100',
    fg: 'text-purple-600'
  },
  system: {
    icon: Info,
    bg: 'bg-slate-50 text-slate-600 border-slate-100',
    fg: 'text-slate-600'
  }
};

const LEGACY_TYPE_STYLES: Record<
  NotificationType,
  {
    icon: React.ElementType;
    bg: string;
    fg: string;
  }
> = {
  violation: {
    icon: AlertTriangle,
    bg: 'bg-rose-50 text-rose-600 border-rose-100',
    fg: 'text-rose-600'
  },
  absent: {
    icon: UserX,
    bg: 'bg-amber-50 text-amber-600 border-amber-100',
    fg: 'text-amber-600'
  },
  attendance: {
    icon: CheckCircle2,
    bg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    fg: 'text-emerald-600'
  },
  system: {
    icon: Info,
    bg: 'bg-sky-50 text-sky-600 border-sky-100',
    fg: 'text-sky-600'
  }
};

const PRIORITY_BADGES: Record<string, { label: string; badge: string }> = {
  critical: { label: 'CRITICAL', badge: 'bg-rose-100 text-rose-700 border-rose-200 font-bold' },
  high: { label: 'HIGH', badge: 'bg-amber-100 text-amber-700 border-amber-200 font-semibold' },
  medium: { label: 'MEDIUM', badge: 'bg-sky-100 text-sky-700 border-sky-200 font-medium' },
  low: { label: 'LOW', badge: 'bg-slate-100 text-slate-600 border-slate-200 font-medium' }
};

export function NotificationDropdown({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
  onNavigate
}: NotificationDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches;
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const hasUnread = notifications.some((n) => !n.read);

  const handleCardClick = (n: Notification) => {
    if (!n.read) {
      onMarkAsRead(n.id);
    }
    if (n.actionLink) {
      if (onNavigate) {
        onNavigate(n.actionLink);
      } else if (typeof window !== 'undefined') {
        window.location.hash = n.actionLink;
      }
      onClose();
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="sm:hidden fixed inset-0 bg-[#1A1410]/45 z-40"
        aria-hidden="true"
      />

      <motion.div
        variants={DROPDOWN_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        ref={ref}
        role="dialog"
        aria-label="Notifications"
        className="
          fixed left-2 right-2 top-[68px] z-50
          sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)]
          sm:w-[380px]
          bg-white border border-[#EFEAE2] rounded-xl shadow-2xl overflow-hidden
        "
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-[#EFEAE2] bg-[#FAF9F6]">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#1A1410]">
              Notifications
            </h2>
            {hasUnread && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#db6c00]/10 text-[#db6c00] border border-[#db6c00]/20">
                NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {hasUnread && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="text-xs font-semibold text-[#db6c00] hover:text-[#b85a00] transition px-2 py-1 rounded hover:bg-[#FFF4E5]"
              >
                Mark all as read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="sm:hidden p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        {notifications.length === 0 ? (
          <div className="px-4 py-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-sm font-semibold text-[#1A1410]">You're all caught up!</h3>
            <p className="text-xs text-[#6B6258] mt-1 max-w-[220px]">
              No new alerts or system notifications at this time.
            </p>
          </div>
        ) : (
          <ul className="max-h-[60vh] sm:max-h-[420px] overflow-y-auto divide-y divide-[#EFEAE2]">
            {notifications.map((n, index) => {
              const categoryConfig = n.category && CATEGORY_STYLES[n.category]
                ? CATEGORY_STYLES[n.category]
                : (LEGACY_TYPE_STYLES[n.type] || CATEGORY_STYLES.system);

              const { icon: Icon, bg } = categoryConfig;
              const priorityInfo = n.priority && PRIORITY_BADGES[n.priority] ? PRIORITY_BADGES[n.priority] : null;

              return (
                <motion.li
                  key={n.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: index * 0.03,
                    type: "spring",
                    stiffness: 300,
                    damping: 24
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCardClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 transition group ${
                      n.read ? 'bg-white hover:bg-[#FAFAF7]' : 'bg-[#FFF9F2] hover:bg-[#FFF3E2]'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${bg}`}
                      aria-hidden="true"
                    >
                      <Icon className="w-4 h-4" strokeWidth={2.25} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-mono text-[#8C8275]">{n.time}</span>
                        {priorityInfo && (
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border ${priorityInfo.badge}`}>
                            {priorityInfo.label}
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-xs text-[#1A1410] leading-snug break-words ${
                          n.read ? 'font-normal' : 'font-semibold'
                        }`}
                      >
                        {n.message}
                      </p>

                      {n.actionLink && (
                        <div className="mt-1.5 flex items-center gap-0.5 text-[11px] font-semibold text-[#db6c00] group-hover:underline">
                          <span>View Details</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      )}
                    </div>

                    {!n.read && (
                      <span
                        className="shrink-0 mt-1 w-2 h-2 rounded-full bg-[#db6c00]"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </>
  );
}
