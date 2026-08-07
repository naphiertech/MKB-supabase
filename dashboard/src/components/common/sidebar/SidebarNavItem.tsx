import { ComponentType } from 'react';
import { motion } from 'framer-motion';
import { PageKey, AccentTheme } from './sidebarNavigation';

interface SidebarNavItemProps {
  itemKey: PageKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  isCollapsed: boolean;
  mobile: boolean;
  accents: AccentTheme;
  badgeCount?: number;
  onNavigate: (key: PageKey) => void;
  onMouseEnterLink?: (label: string, e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeaveLink?: () => void;
}

export function SidebarNavItem({
  itemKey,
  label,
  icon: Icon,
  active,
  isCollapsed,
  mobile,
  accents: a,
  badgeCount,
  onNavigate,
  onMouseEnterLink,
  onMouseLeaveLink
}: SidebarNavItemProps) {
  const showCollapsed = !mobile && isCollapsed;

  return (
    <button
      onClick={() => onNavigate(itemKey)}
      onMouseEnter={(e) => onMouseEnterLink?.(label, e)}
      onMouseLeave={onMouseLeaveLink}
      aria-current={active ? 'page' : undefined}
      aria-label={showCollapsed ? label : undefined}
      className={`group relative z-0 w-full flex items-center rounded-lg text-sm transition cursor-pointer ${
        showCollapsed ? 'px-0 justify-center h-10' : 'px-3 py-2 gap-3'
      } ${active ? a.text : 'text-muted-foreground hover:text-foreground hover:bg-panel-bg'}`}
    >
      {active && (
        <motion.span
          layoutId={mobile ? undefined : "activeNav"}
          className={`absolute inset-0 rounded-lg -z-10 ${a.activeBg}`}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {active && (
        <motion.span
          layoutId={mobile ? undefined : "activeBar"}
          className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${a.activeBar}`}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}

      {/* Icon Slot Container */}
      <div className={`flex items-center justify-center shrink-0 relative ${
        showCollapsed ? 'w-9 h-9' : 'w-5 h-5'
      }`}>
        <Icon className={`w-[18px] h-[18px] transition-colors duration-150 ${active ? a.iconActive : 'text-muted-foreground group-hover:text-foreground'}`} />
        {showCollapsed && badgeCount ? (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
        ) : null}
      </div>

      {!showCollapsed && (
        <>
          <span className="flex-1 text-left font-medium truncate">{label}</span>
          {badgeCount ? (
            <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center shadow-sm shrink-0">
              {badgeCount}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}
