import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  LayoutDashboard,
  Clock4,
  MapPin,
  User,
  LogOut
} from 'lucide-react';
import type { RiderPageKey } from './RiderTopNav';

interface RiderMobileDrawerProps {
  open: boolean;
  onClose: () => void;
  current: RiderPageKey;
  onNavigate: (page: RiderPageKey) => void;
  user: {
    name: string;
    avatar: string;
    zoneName: string;
  };
  onSignOut?: () => void;
  triggerRef?: RefObject<HTMLElement | null>;
}

const ITEMS: {
  key: RiderPageKey;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard
  },
  {
    key: 'attendance',
    label: 'Time-In/Out',
    icon: Clock4
  },
  {
    key: 'monitoring',
    label: 'My Location',
    icon: MapPin
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: User
  }
];

export function RiderMobileDrawer({
  open,
  onClose,
  current,
  onNavigate,
  user,
  onSignOut,
  triggerRef
}: RiderMobileDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    openerRef.current = triggerRef?.current ?? (document.activeElement as HTMLElement | null);
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('hidden'));

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable ?? panelRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, triggerRef]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          id="rider-mobile-drawer"
          className="fixed inset-0 z-[1200] overflow-hidden lg:hidden"
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Close menu backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            onClick={onClose}
            style={{ backgroundColor: 'color-mix(in srgb, var(--foreground) 45%, transparent)' }}
            className="fixed inset-0 h-dvh w-screen cursor-default border-0 p-0 backdrop-blur-xs"
          />

          {/* Slide-in panel from the right */}
          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Rider navigation menu"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="safe-drawer fixed inset-y-0 right-0 z-10 flex h-dvh w-[min(19rem,calc(100vw-2.5rem))] flex-col border-l border-border bg-white shadow-2xl sm:w-[320px]"
          >
            {/* Header / Rider Identity */}
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Rider Portal
                </span>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close navigation"
                  title="Close navigation"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition hover:bg-panel-bg hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Rider card */}
              <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-border bg-panel-bg/70 p-3">
                <img
                  src={user.avatar}
                  alt={`${user.name} avatar`}
                  className="h-10 w-10 shrink-0 rounded-full border border-border bg-white ring-2 ring-primary/20"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {user.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground font-mono">
                    <MapPin className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate">{user.zoneName || 'Unassigned Zone'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation links */}
            <nav
              aria-label="Rider Mobile Navigation"
              className="flex-1 overflow-y-auto p-3 space-y-1"
            >
              <div className="px-2 pb-1.5 pt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70">
                Menu
              </div>
              {ITEMS.map(({ key, label, icon: Icon }) => {
                const active = current === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onNavigate(key);
                      onClose();
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                      active
                        ? 'bg-accent text-accent-foreground font-semibold border-l-2 border-primary'
                        : 'text-foreground hover:bg-panel-bg hover:text-primary'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Sign Out footer */}
            <div className="border-t border-border p-3 sm:p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut?.();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-red-50/80 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer"
              >
                <LogOut className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-destructive" />
                <span>Sign out</span>
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
