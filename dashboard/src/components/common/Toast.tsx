import React, { Component } from 'react';
import { CheckCircle2, Info, AlertTriangle, X, Flag } from 'lucide-react';
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
    iconCls: 'text-[#db6c00]',
    ring: 'ring-[#db6c00]/25',
    bg: 'bg-[#FFF1E0]',
    leftBar: 'bg-[#db6c00]'
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
    iconCls: 'text-[#db6c00]',
    ring: 'ring-[#db6c00]/25',
    bg: 'bg-[#FFF1E0]',
    leftBar: 'bg-[#db6c00]'
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
      {toasts.map((t) => {
        const cfg = TONE[t.tone];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto relative w-full bg-white backdrop-blur border border-[#EFEAE2] rounded-xl shadow-[0_12px_32px_-12px_rgba(26,20,16,0.18)] pl-4 pr-3.5 py-3 flex items-start gap-3 ar-toast-in overflow-hidden">
            
            <span
              className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.leftBar}`} />
            
            <div
              className={`w-8 h-8 shrink-0 rounded-lg ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center`}>
              
              <Icon className={`w-4 h-4 ${cfg.iconCls}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1A1410] truncate">
                {t.title}
              </div>
              {t.description &&
              <div className="text-[11px] text-[#6B6258] mt-0.5 truncate">
                  {t.description}
                </div>
              }
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-[#6B6258] hover:text-[#1A1410] p-1 -m-1 rounded">
              
              <X className="w-3.5 h-3.5" />
            </button>
          </div>);

      })}
      <style>{`
        @keyframes ar-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .ar-toast-in { animation: ar-toast-in 220ms cubic-bezier(.2,.8,.2,1); }
      `}</style>
    </div>);

}