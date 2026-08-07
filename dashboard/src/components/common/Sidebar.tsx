import { useEffect, useState, useRef } from 'react';
import { BRANDING } from '../../config/branding';
import {
  Activity,
  X,
  BookOpen,
  HelpCircle,
  Headphones,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PageKey,
  SidebarRole,
  SidebarUser,
  SidebarItem,
  getSidebarNavigation
} from './sidebar/sidebarNavigation';
import { useSidebarCollapse } from './sidebar/useSidebarCollapse';
import { SidebarNavItem } from './sidebar/SidebarNavItem';
import { SidebarNavGroup } from './sidebar/SidebarNavGroup';
import { SidebarFlyout } from './sidebar/SidebarFlyout';
import { SidebarFooter } from './sidebar/SidebarFooter';

export type { PageKey, SidebarRole, SidebarUser, SidebarItem };

interface SidebarProps {
  current: PageKey;
  onNavigate: (page: PageKey) => void;
  role: SidebarRole;
  user: SidebarUser;
  onSignOut?: () => void;
  onOpenSettings?: () => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  onOpenHelp?: (tab: 'guide' | 'faq' | 'support') => void;
  badgeCounts?: Partial<Record<PageKey, number>>;
}

export function Sidebar({
  current,
  onNavigate,
  role,
  user,
  onSignOut,
  onOpenSettings,
  isMobileOpen = false,
  onMobileClose,
  onOpenHelp,
  badgeCounts
}: SidebarProps) {
  const { items, badgeLabel, accents: a } = getSidebarNavigation(role);
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();

  // Accordion open/close states for expanded sidebar
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Parcel Operations': true,
    'Tracking & Zones': true,
    'HR & Employees': true,
    'Finance & Reports': true,
    'Compensation': true,
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  // Collapsed flyout and tooltip states
  const [activeFlyout, setActiveFlyout] = useState<{
    title: string;
    top: number;
    item: Extract<SidebarItem, { type: 'section' }>;
  } | null>(null);

  const [hoveredTooltip, setHoveredTooltip] = useState<{
    label: string;
    top: number;
  } | null>(null);

  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterSection = (
    item: Extract<SidebarItem, { type: 'section' }>,
    e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => {
    if (!isCollapsed) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setHoveredTooltip(null);
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveFlyout({
      title: item.title,
      top: rect.top,
      item
    });
  };

  const handleMouseLeaveSection = () => {
    if (!isCollapsed) return;
    closeTimerRef.current = setTimeout(() => {
      setActiveFlyout(null);
    }, 180);
  };

  const handleMouseEnterFlyout = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  const handleMouseLeaveFlyout = () => {
    closeTimerRef.current = setTimeout(() => {
      setActiveFlyout(null);
    }, 180);
  };

  const handleMouseEnterLink = (label: string, e: React.MouseEvent<HTMLElement>) => {
    if (!isCollapsed) return;
    if (activeFlyout) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredTooltip({
      label,
      top: rect.top + rect.height / 2
    });
  };

  const handleMouseLeaveLink = () => {
    setHoveredTooltip(null);
  };

  // Auto-expand the section containing the active page on load/change
  useEffect(() => {
    const activeSection = items.find(
      (item) => item.type === 'section' && item.items.some((sub) => sub.key === current)
    );
    if (activeSection && activeSection.type === 'section') {
      setExpandedSections((prev) => ({
        ...prev,
        [activeSection.title]: true
      }));
    }
  }, [current, items]);

  // Lock body scroll while mobile drawer is open + ESC to close
  useEffect(() => {
    if (!isMobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onMobileClose?.();
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKey);
    };
  }, [isMobileOpen, onMobileClose]);

  // Escape key closes flyout menu or tooltip
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveFlyout(null);
        setHoveredTooltip(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleNavigate(key: PageKey) {
    onNavigate(key);
    setActiveFlyout(null);
    setHoveredTooltip(null);
    if (isMobileOpen) onMobileClose?.();
  }

  const panel = (mobile: boolean) => {
    const showCollapsed = !mobile && isCollapsed;

    return (
      <motion.aside
        initial={mobile ? { x: '-100%' } : { x: -20, opacity: 0 }}
        animate={mobile ? { x: 0 } : { x: 0, opacity: 1 }}
        exit={mobile ? { x: '-100%' } : undefined}
        transition={{ duration: mobile ? 0.3 : 0.4, ease: "easeOut" }}
        className={
          mobile
            ? `relative flex w-72 max-w-[85vw] shrink-0 flex-col bg-white border-r border-border h-full shadow-2xl z-[1050]`
            : `hidden md:flex ${showCollapsed ? 'w-[72px]' : 'w-64'} shrink-0 flex-col bg-white border-r border-border h-screen sticky top-0 transition-[width] duration-300 ease-in-out z-30`
        }
      >
        {/* Brand Header */}
        <div className={`pt-5 pb-4 border-b border-border ${showCollapsed ? 'px-2' : 'px-5'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className={`flex items-center gap-2.5 ${showCollapsed ? 'mx-auto' : ''}`}>
              <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-sm shrink-0">
                <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
              </div>
              {!showCollapsed && (
                <div className="flex flex-col leading-tight flex-1 min-w-0">
                  <span className="text-foreground font-semibold tracking-tight text-[15px] truncate">
                    {BRANDING.appName}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono truncate">
                    MKB Corp
                  </span>
                </div>
              )}
            </div>

            {/* Collapse button for Desktop */}
            {!mobile && !showCollapsed && (
              <button
                type="button"
                onClick={toggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-panel-bg flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}

            {/* Mobile close button */}
            {mobile && (
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close menu"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-panel-bg transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Desktop Collapsed Expand Button */}
          {!mobile && showCollapsed && (
            <div className="mt-3 flex flex-col items-center">
              <button
                type="button"
                onClick={toggleCollapse}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-panel-bg flex items-center justify-center transition cursor-pointer"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Role Badge */}
          {!showCollapsed ? (
            <div className={`mt-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${a.badgeBg} border ${a.badgeBorder}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${a.badgeDot}`} />
              <span className={`text-[11px] uppercase tracking-wider ${a.text} font-semibold`}>
                {badgeLabel}
              </span>
            </div>
          ) : (
            <div className="mt-2 flex justify-center">
              <span className={`w-2 h-2 rounded-full ${a.badgeDot}`} title={`Role: ${badgeLabel}`} />
            </div>
          )}
        </div>

        {/* Navigation Scroll Area */}
        <nav className={`flex-1 ${showCollapsed ? 'px-2 py-3 space-y-2' : 'px-3 py-3 space-y-1'} overflow-y-auto`}>
          {!showCollapsed ? (
            <div className="px-2 mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-mono">
              Operations
            </div>
          ) : (
            <div className="my-2 border-t border-border/60 mx-1" />
          )}

          {items.map((item, index) => {
            if (item.type === 'link') {
              const active = current === item.key;
              return (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 + 0.05 }}
                >
                  <SidebarNavItem
                    itemKey={item.key}
                    label={item.label}
                    icon={item.icon}
                    active={active}
                    isCollapsed={isCollapsed}
                    mobile={mobile}
                    accents={a}
                    badgeCount={badgeCounts?.[item.key]}
                    onNavigate={handleNavigate}
                    onMouseEnterLink={handleMouseEnterLink}
                    onMouseLeaveLink={handleMouseLeaveLink}
                  />
                </motion.div>
              );
            } else {
              const expanded = !!expandedSections[item.title];
              const isFlyoutOpen = showCollapsed && activeFlyout?.title === item.title;

              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 + 0.05 }}
                >
                  <SidebarNavGroup
                    item={item}
                    current={current}
                    isCollapsed={isCollapsed}
                    mobile={mobile}
                    expanded={expanded}
                    accents={a}
                    badgeCounts={badgeCounts}
                    isFlyoutOpen={isFlyoutOpen}
                    onToggleSection={toggleSection}
                    onNavigate={handleNavigate}
                    onMouseEnterSection={handleMouseEnterSection}
                    onMouseLeaveSection={handleMouseLeaveSection}
                  />
                </motion.div>
              );
            }
          })}

          {!showCollapsed ? (
            <div className="px-2 mt-4 mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-mono">
              Help & Support
            </div>
          ) : (
            <div className="my-3 border-t border-border/60 mx-1" />
          )}

          {/* User Guide */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: items.length * 0.04 + 0.1 }}
          >
            <SidebarNavItem
              itemKey="dashboard"
              label="User Guide"
              icon={BookOpen}
              active={false}
              isCollapsed={isCollapsed}
              mobile={mobile}
              accents={a}
              onNavigate={() => {
                onOpenHelp?.('guide');
                if (isMobileOpen) onMobileClose?.();
              }}
              onMouseEnterLink={handleMouseEnterLink}
              onMouseLeaveLink={handleMouseLeaveLink}
            />
          </motion.div>

          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (items.length + 1) * 0.04 + 0.1 }}
          >
            <SidebarNavItem
              itemKey="dashboard"
              label="FAQ"
              icon={HelpCircle}
              active={false}
              isCollapsed={isCollapsed}
              mobile={mobile}
              accents={a}
              onNavigate={() => {
                onOpenHelp?.('faq');
                if (isMobileOpen) onMobileClose?.();
              }}
              onMouseEnterLink={handleMouseEnterLink}
              onMouseLeaveLink={handleMouseLeaveLink}
            />
          </motion.div>

          {/* Contact Support */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (items.length + 2) * 0.04 + 0.1 }}
          >
            <SidebarNavItem
              itemKey="dashboard"
              label="Contact Support"
              icon={Headphones}
              active={false}
              isCollapsed={isCollapsed}
              mobile={mobile}
              accents={a}
              onNavigate={() => {
                onOpenHelp?.('support');
                if (isMobileOpen) onMobileClose?.();
              }}
              onMouseEnterLink={handleMouseEnterLink}
              onMouseLeaveLink={handleMouseLeaveLink}
            />
          </motion.div>

          {!showCollapsed ? (
            <>
              <div className="px-2 mt-4 mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-mono">
                System
              </div>
              <div className="mx-2 p-3 rounded-lg bg-panel-bg border border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Geofence
                  </span>
                  <span className="text-[11px] text-emerald-600 font-mono">
                    ● Online
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>Realtime</span>
                  <span className="text-emerald-600/90">1.8s tick</span>
                </div>
              </div>
            </>
          ) : (
            <div
              onMouseEnter={(e) => handleMouseEnterLink('Geofence: Online (1.8s tick)', e)}
              onMouseLeave={handleMouseLeaveLink}
              className="my-3 flex justify-center"
            >
              <div className="w-9 h-9 rounded-lg bg-panel-bg border border-border flex items-center justify-center cursor-help">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
          )}
        </nav>

        {/* Profile Footer */}
        <SidebarFooter
          user={user}
          current={current}
          isCollapsed={isCollapsed}
          mobile={mobile}
          accents={a}
          onNavigate={handleNavigate}
          onOpenSettings={onOpenSettings}
          onSignOut={onSignOut}
          onMouseEnterLink={handleMouseEnterLink}
          onMouseLeaveLink={handleMouseLeaveLink}
        />
      </motion.aside>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      {panel(false)}

      {/* Mobile drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="md:hidden fixed inset-0 z-[1050] pointer-events-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={onMobileClose}
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            />

            {/* Drawer panel */}
            <div className="absolute inset-y-0 left-0 flex">{panel(true)}</div>
          </div>
        )}
      </AnimatePresence>

      {/* Collapsed Dropdown Flyout Menu */}
      {isCollapsed && activeFlyout && (
        <SidebarFlyout
          activeFlyout={activeFlyout}
          current={current}
          accents={a}
          badgeCounts={badgeCounts}
          onNavigate={handleNavigate}
          onMouseEnterFlyout={handleMouseEnterFlyout}
          onMouseLeaveFlyout={handleMouseLeaveFlyout}
          onCloseFlyout={() => setActiveFlyout(null)}
        />
      )}

      {/* Collapsed Direct Item Tooltip */}
      {isCollapsed && hoveredTooltip && !activeFlyout && (
        <div
          style={{ top: hoveredTooltip.top }}
          className="hidden md:block fixed left-[78px] -translate-y-1/2 z-[1000] px-2.5 py-1 rounded-md bg-foreground text-background text-xs font-medium whitespace-nowrap shadow-md pointer-events-none transition-opacity duration-150"
          role="tooltip"
        >
          {hoveredTooltip.label}
        </div>
      )}
    </>
  );
}
