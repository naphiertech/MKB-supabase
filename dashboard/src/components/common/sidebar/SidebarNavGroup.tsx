import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { SidebarItem, PageKey, AccentTheme } from './sidebarNavigation';

interface SidebarNavGroupProps {
  item: Extract<SidebarItem, { type: 'section' }>;
  current: PageKey;
  isCollapsed: boolean;
  mobile: boolean;
  expanded: boolean;
  accents: AccentTheme;
  badgeCounts?: Partial<Record<PageKey, number>>;
  isFlyoutOpen: boolean;
  onToggleSection: (title: string) => void;
  onNavigate: (key: PageKey) => void;
  onMouseEnterSection: (
    item: Extract<SidebarItem, { type: 'section' }>,
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => void;
  onMouseLeaveSection: () => void;
}

export function SidebarNavGroup({
  item,
  current,
  isCollapsed,
  mobile,
  expanded,
  accents: a,
  badgeCounts,
  isFlyoutOpen,
  onToggleSection,
  onNavigate,
  onMouseEnterSection,
  onMouseLeaveSection
}: SidebarNavGroupProps) {
  const showCollapsed = !mobile && isCollapsed;
  const Icon = item.icon;
  const hasActiveChild = item.items.some((sub) => sub.key === current);
  const sectionBadgeSum = item.items.reduce((sum, sub) => sum + (badgeCounts?.[sub.key] || 0), 0);

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => {
          if (!showCollapsed) {
            onToggleSection(item.title);
          }
        }}
        onMouseEnter={(e) => onMouseEnterSection(item, e)}
        onMouseLeave={onMouseLeaveSection}
        onFocus={(e) => onMouseEnterSection(item, e)}
        onBlur={onMouseLeaveSection}
        onKeyDown={(e) => {
          if (showCollapsed && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onMouseEnterSection(item, e);
          }
        }}
        aria-expanded={showCollapsed ? isFlyoutOpen : expanded}
        aria-haspopup={showCollapsed ? 'menu' : undefined}
        aria-label={showCollapsed ? item.title : undefined}
        className={`group relative z-0 w-full flex items-center rounded-lg text-sm transition-all duration-300 ease-in-out cursor-pointer text-muted-foreground hover:text-foreground hover:bg-panel-bg ${
          showCollapsed ? 'px-0 justify-center h-10' : 'px-3 py-2 gap-3'
        } ${hasActiveChild ? `font-semibold ${a.text}` : ''}`}
      >
        {hasActiveChild && showCollapsed && (
          <motion.span className={`absolute inset-0 rounded-lg -z-10 ${a.activeBg}`} />
        )}
        {hasActiveChild && showCollapsed && (
          <motion.span className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full ${a.activeBar}`} />
        )}

        {/* Icon Slot Container */}
        <div className={`flex items-center justify-center shrink-0 relative transition-all duration-300 ease-in-out ${
          showCollapsed ? 'w-9 h-9' : 'w-5 h-5'
        }`}>
          <Icon className={`w-[18px] h-[18px] transition-colors duration-150 ${hasActiveChild ? a.iconActive : 'text-muted-foreground group-hover:text-foreground'}`} />
          {showCollapsed && sectionBadgeSum > 0 ? (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
          ) : null}
        </div>

        <span className={`flex-1 text-left font-medium truncate transition-all duration-300 ease-in-out ${
          showCollapsed ? 'opacity-0 max-w-0 overflow-hidden hidden' : 'opacity-100 max-w-[160px]'
        }`}>
          {item.title}
        </span>
        {sectionBadgeSum > 0 && !expanded && (
          <span className={`bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center mr-1 shadow-sm animate-pulse shrink-0 transition-all duration-300 ease-in-out ${
            showCollapsed ? 'opacity-0 max-w-0 overflow-hidden hidden' : 'opacity-100'
          }`}>
            {sectionBadgeSum}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-all duration-300 ease-in-out text-muted-foreground shrink-0 ${
          expanded ? 'rotate-180' : ''
        } ${showCollapsed ? 'opacity-0 max-w-0 overflow-hidden hidden' : 'opacity-100'}`} />
      </button>

      {/* Expanded Accordion List */}
      {!showCollapsed && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeInOut" }}
              className="overflow-hidden border-l border-border ml-5 pl-[14px] mt-1 space-y-1"
            >
              {item.items.map((subItem) => {
                const subActive = current === subItem.key;
                const SubIcon = subItem.icon;
                return (
                  <button
                    key={subItem.key}
                    onClick={() => onNavigate(subItem.key)}
                    aria-current={subActive ? 'page' : undefined}
                    className={`group relative z-0 w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${subActive ? a.text : 'text-muted-foreground hover:text-foreground hover:bg-panel-bg'}`}
                  >
                    {subActive && (
                      <motion.span
                        layoutId={mobile ? undefined : "activeSubNav"}
                        className={`absolute inset-0 rounded-lg -z-10 ${a.activeBg}`}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <SubIcon className={`w-3.5 h-3.5 ${subActive ? a.iconActive : 'text-muted-foreground group-hover:text-foreground'}`} />
                    <span className="flex-1 text-left font-medium truncate">{subItem.label}</span>
                    {badgeCounts?.[subItem.key] ? (
                      <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center ml-auto shadow-sm animate-pulse shrink-0">
                        {badgeCounts[subItem.key]}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
