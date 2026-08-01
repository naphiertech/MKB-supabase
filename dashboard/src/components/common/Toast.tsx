import { ComponentType } from 'react';
import { CheckCircle2, Info, AlertTriangle, X, Flag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToasts, type ToastTone } from '../../hooks/useToast';
const TONE: Record<
  ToastTone,
  {
    icon: ComponentType<{
      className?: string;
    }>;
    iconCls: string;
    ring: string;
    bg: string;
    leftBar: string;
  }> =
{
  default: {
    icon: Flag,
    iconCls: 'text-primary',
    ring: 'ring-primary/25',
    bg: 'bg-accent',
    leftBar: 'bg-primary'
  },
  success: {
    icon: CheckCircle2,
    iconCls: 'text-emerald-600',
    ring: 'ring-emerald-500/25',
    bg: 'bg-emerald-50',
    leftBar: 'bg-emerald-500'
  },
  info: {
    icon: Info,
    iconCls: 'text-primary',
    ring: 'ring-primary/25',
    bg: 'bg-accent',
    leftBar: 'bg-primary'
  },
  warning: {
    icon: AlertTriangle,
    iconCls: 'text-amber-600',
    ring: 'ring-amber-500/25',
    bg: 'bg-amber-50',
    leftBar: 'bg-amber-500'
  },
  error: {
    icon: AlertTriangle,
    iconCls: 'text-red-600',
    ring: 'ring-red-500/25',
    bg: 'bg-red-50',
    leftBar: 'bg-red-500'
  }
};
export function ToastViewport() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2 max-w-sm w-[calc(100%-2rem)]">
      <AnimatePresence>
      {toasts.map((t) => {
        const cfg = TONE[t.tone];
        const Icon = cfg.icon;
        return (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}
            role="status"
            className="pointer-events-auto relative w-full bg-white backdrop-blur border border-border rounded-xl shadow-[0_12px_32px_-12px_rgba(26,20,16,0.18)] pl-4 pr-3.5 py-3 flex items-start gap-3 overflow-hidden">
            
            <span
              className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.leftBar}`} />
            
            <div
              className={`w-8 h-8 shrink-0 rounded-lg ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center`}>
              
              <Icon className={`w-4 h-4 ${cfg.iconCls}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {t.title}
              </div>
              {t.description &&
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {t.description}
                </div>
              }
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded">
              
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>);

      })}
      </AnimatePresence>
    </div>);

}
