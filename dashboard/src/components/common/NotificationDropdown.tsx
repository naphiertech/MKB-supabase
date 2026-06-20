import { useEffect, useRef, useLayoutEffect } from 'react';
import {
  AlertTriangle,
  UserX,
  CheckCircle2,
  Info,
  X } from
'lucide-react';
import { motion } from 'framer-motion';
import { Notification, NotificationType } from '../../hooks/useNotifications';
interface NotificationDropdownProps {
  notifications: Notification[];
  onMarkAsRead: (id: string | number) => void;
  onMarkAllAsRead: () => void;
  onClose: () => void;
}
const TYPE_STYLES: Record<
  NotificationType,
  {
    icon: React.ElementType;
    bg: string;
    fg: string;
  }> =
{
  violation: {
    icon: AlertTriangle,
    bg: 'bg-red-50',
    fg: 'text-red-600'
  },
  absent: {
    icon: UserX,
    bg: 'bg-amber-50',
    fg: 'text-amber-600'
  },
  attendance: {
    icon: CheckCircle2,
    bg: 'bg-emerald-50',
    fg: 'text-emerald-600'
  },
  system: {
    icon: Info,
    bg: 'bg-sky-50',
    fg: 'text-sky-600'
  }
};
export function NotificationDropdown({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose
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
  // Lock body scroll on mobile while the panel is open so the page
  // behind the scrim can't drift, which is what makes things feel "blurry".
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
  return (
    <>
      {/* Mobile backdrop — solid scrim (no blur), closes on tap */}
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
        initial={{ opacity: 0, scale: 0.95, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        ref={ref}
        role="dialog"
        aria-label="Notifications"
        className="
          fixed left-2 right-2 top-[68px] z-50
          sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)]
          sm:w-[360px]
          bg-white border border-[#EFEAE2] rounded-xl shadow-2xl overflow-hidden
        ">

        
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-[#EFEAE2]">
          <h2 className="text-sm font-semibold text-[#1A1410]">
            Notifications
          </h2>
          <div className="flex items-center gap-1">
            {hasUnread &&
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="text-xs font-semibold text-[#db6c00] hover:text-[#b85a00] transition px-2 py-1 rounded">
              
                Mark all as read
              </button>
            }
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="sm:hidden p-1.5 rounded-md text-[#6B6258] hover:text-[#1A1410] hover:bg-[#FAFAF7] transition">
              
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* List */}
        {notifications.length === 0 ?
        <div className="px-4 py-10 text-center text-sm text-[#6B6258]">
            You're all caught up.
          </div> :

        <ul className="max-h-[60vh] sm:max-h-[420px] overflow-y-auto divide-y divide-[#EFEAE2]">
            {notifications.map((n, index) => {
            const { icon: Icon, bg, fg } = TYPE_STYLES[n.type];
            return (
              <motion.li 
                key={n.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ 
                  delay: index * 0.05, 
                  type: "spring", 
                  stiffness: 300, 
                  damping: 24 
                }}
              >
                  <button
                  type="button"
                  onClick={() => !n.read && onMarkAsRead(n.id)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 transition ${n.read ? 'bg-white hover:bg-[#FAFAF7]' : 'bg-[#FFF8EE] hover:bg-[#FFF1E0]'}`}>
                  
                    <span
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}
                    aria-hidden="true">
                    
                      <Icon className={`w-4 h-4 ${fg}`} strokeWidth={2.25} />
                    </span>

                    <div className="flex-1 min-w-0">
                      <p
                      className={`text-sm text-[#1A1410] leading-snug break-words ${n.read ? 'font-normal' : 'font-semibold'}`}>
                      
                        {n.message}
                      </p>
                      <p className="mt-0.5 text-[11px] font-mono text-[#6B6258]">
                        {n.time}
                      </p>
                    </div>

                    {!n.read &&
                  <span
                    className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#db6c00]"
                    aria-label="Unread" />

                  }
                  </button>
                </motion.li>);

          })}
          </ul>
        }
      </motion.div>
    </>);

}
