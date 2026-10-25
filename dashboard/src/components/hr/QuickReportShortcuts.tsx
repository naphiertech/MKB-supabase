import { ComponentType } from 'react';
import {
  CalendarRange,
  CalendarDays,
  AlertOctagon,
  ChevronRight,
} from 'lucide-react';

export type QuickReportKey = 'today' | 'weekly' | 'violation';

interface QuickReportShortcutsProps {
  onSelect: (key: QuickReportKey) => void;
  layout?: 'row' | 'stack';
  className?: string;
}

const SHORTCUTS: {
  key: QuickReportKey;
  title: string;
  caption: string;
  icon: ComponentType<{
    className?: string;
  }>;
  iconCls: string;
  ring: string;
}[] = [
  {
    key: 'today',
    title: "Today's Attendance Report",
    caption: 'Pre-filtered for today · CSV / PDF',
    icon: CalendarDays,
    iconCls: 'text-primary',
    ring: 'ring-primary/25 bg-accent',
  },
  {
    key: 'weekly',
    title: 'Weekly Summary',
    caption: 'Last 7 days roll-up by zone',
    icon: CalendarRange,
    iconCls: 'text-amber-600',
    ring: 'ring-amber-500/25 bg-amber-50',
  },
  {
    key: 'violation',
    title: 'Violation Log',
    caption: 'All geofence violations this week',
    icon: AlertOctagon,
    iconCls: 'text-red-600',
    ring: 'ring-red-500/25 bg-red-50',
  },
];

export function QuickReportShortcuts({
  onSelect,
  layout = 'row',
  className,
}: QuickReportShortcutsProps) {
  const containerClass =
    className ??
    (layout === 'stack'
      ? 'grid grid-cols-1 gap-2.5'
      : 'grid grid-cols-1 md:grid-cols-3 gap-3');

  return (
    <div className={containerClass}>
      {SHORTCUTS.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={`group text-left bg-white border border-border hover:border-primary/30 rounded-xl transition flex items-center gap-3 ar-card-hover cursor-pointer ${
              layout === 'stack' ? 'p-3' : 'p-4'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg ring-1 ${s.ring} flex items-center justify-center shrink-0`}
            >
              <Icon className={`w-4.5 h-4.5 ${s.iconCls}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">
                {s.title}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {s.caption}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </button>
        );
      })}
    </div>
  );
}
