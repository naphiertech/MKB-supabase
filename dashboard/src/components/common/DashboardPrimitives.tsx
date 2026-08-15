import type { ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

type IconComponent = LucideIcon;

const SUMMARY_TONES = {
  brand: 'bg-accent text-primary ring-primary',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-500/20',
  danger: 'bg-rose-50 text-rose-700 ring-rose-500/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-500/20',
  neutral: 'bg-panel-bg text-muted-foreground ring-border',
} as const;

export type SemanticTone = keyof typeof SUMMARY_TONES;

interface SummaryCardProps {
  icon: IconComponent;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: SemanticTone;
  className?: string;
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = 'brand',
  className = '',
}: SummaryCardProps) {
  return (
    <article className={`ui-card min-w-0 p-4 ${className}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${SUMMARY_TONES[tone]}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="ui-eyebrow">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">{value}</p>
          {helper && <p className="mt-1 truncate text-xs text-muted-foreground">{helper}</p>}
        </div>
      </div>
    </article>
  );
}

const BADGE_TONES: Record<SemanticTone, string> = {
  brand: 'border-primary bg-accent text-accent-foreground',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  neutral: 'border-border bg-panel-bg text-muted-foreground',
};

const BADGE_DOTS: Record<SemanticTone, string> = {
  brand: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-blue-500',
  violet: 'bg-violet-500',
  neutral: 'bg-slate-400',
};

interface StatusBadgeProps {
  children: ReactNode;
  tone?: SemanticTone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  children,
  tone = 'neutral',
  dot = false,
  icon,
  className = '',
  size = 'sm',
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-semibold ${
        size === 'md' ? 'gap-1.5 px-2.5 py-1 text-xs' : 'gap-1 px-2 py-0.5 text-[10px]'
      } ${BADGE_TONES[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${BADGE_DOTS[tone]}`} aria-hidden="true" />}
      {icon}
      {children}
    </span>
  );
}

interface StatePanelProps {
  icon?: IconComponent;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

export function StatePanel({
  icon: Icon,
  title,
  description,
  action,
  loading = false,
  compact = false,
  className = '',
}: StatePanelProps) {
  return (
    <div
      className={`ui-state ${compact ? 'min-h-32 py-7' : 'min-h-48 py-10'} ${className}`}
      role={loading ? 'status' : undefined}
      aria-live={loading ? 'polite' : undefined}
    >
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-panel-bg text-muted-foreground">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /> : Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
      </span>
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ContentCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`ui-card ${className}`}>{children}</section>;
}

export function ToolbarSurface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-toolbar ${className}`}>{children}</div>;
}
