import { toast } from 'react-hot-toast';
import React from 'react';
import { CheckCircle2, Info, AlertTriangle, X, Flag } from 'lucide-react';

export type ToastTone = 'default' | 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

const TONE = {
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

export function pushToast(input: {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}) {
  const tone = input.tone ?? 'default';
  const cfg = TONE[tone];
  const Icon = cfg.icon;

  return toast.custom(
    (t) => React.createElement(
      'div',
      {
        className: `${t.visible ? 'animate-enter' : 'animate-leave'} pointer-events-auto relative w-full max-w-sm bg-white border border-[#EFEAE2] rounded-xl shadow-[0_12px_32px_-12px_rgba(26,20,16,0.18)] pl-4 pr-3.5 py-3 flex items-start gap-3 overflow-hidden transition-all duration-300`,
        style: {
          opacity: t.visible ? 1 : 0,
          transform: t.visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.9)'
        }
      },
      React.createElement('span', { className: `absolute left-0 top-0 bottom-0 w-1 ${cfg.leftBar}` }),
      React.createElement(
        'div',
        { className: `w-8 h-8 shrink-0 rounded-lg ${cfg.bg} ring-1 ${cfg.ring} flex items-center justify-center` },
        React.createElement(Icon, { className: `w-4 h-4 ${cfg.iconCls}` })
      ),
      React.createElement(
        'div',
        { className: 'flex-1 min-w-0' },
        React.createElement('div', { className: 'text-sm font-semibold text-[#1A1410] truncate' }, input.title),
        input.description && React.createElement(
          'div',
          { className: 'text-[11px] text-[#6B6258] mt-0.5 truncate' },
          input.description
        )
      ),
      React.createElement(
        'button',
        {
          onClick: () => toast.dismiss(t.id),
          'aria-label': 'Dismiss',
          className: 'text-[#6B6258] hover:text-[#1A1410] p-1 -m-1 rounded'
        },
        React.createElement(X, { className: 'w-3.5 h-3.5' })
      )
    ),
    {
      duration: input.duration ?? 3200,
      position: 'top-right'
    }
  );
}

export function dismissToast(id: string) {
  toast.dismiss(id);
}

export function useToasts() {
  return { toasts: [] as Toast[], dismiss: (id: string) => toast.dismiss(id) };
}
