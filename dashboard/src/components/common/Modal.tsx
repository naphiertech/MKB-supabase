import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Width preset */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  /** Disable closing via backdrop/Esc (useful during a critical scan). */
  dismissible?: boolean;
  children: React.ReactNode;
}
const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-5xl',
  '3xl': 'max-w-6xl',
  '4xl': 'max-w-7xl',
  '5xl': 'max-w-[90vw]'
};
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  dismissible = true,
  children
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissible) {
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute('hidden'));

      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (firstFocusable ?? dialogRef.current)?.focus();
    });

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, [open, onClose, dismissible]);
  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center px-4 py-8"
        >
          
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={() => dismissible && onClose()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-foreground/40 backdrop-blur-sm cursor-default border-none outline-none appearance-none w-screen h-screen" />
          
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Dialog'}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className={`relative w-full ${SIZE[size]} bg-white border border-border rounded-2xl shadow-[0_30px_60px_-20px_rgba(26,20,16,0.25)] overflow-hidden`}>
            
            {(title || dismissible) &&
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border/70">
            <div className="min-w-0">
              {title &&
            <h2
              id={titleId}
              className="text-foreground font-semibold text-base tracking-tight">
              
                  {title}
                </h2>
            }
              {subtitle &&
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            }
            </div>
            {dismissible &&
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground min-h-11 min-w-11 p-1.5 -mr-1.5 -mt-1.5 rounded-md hover:bg-panel-bg inline-flex items-center justify-center">
            
                <X className="w-4 h-4" />
              </button>
          }
          </div>
        }
          <div className="px-5 py-5">{children}</div>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );

}
