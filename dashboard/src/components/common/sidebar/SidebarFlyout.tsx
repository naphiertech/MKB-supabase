import { SidebarItem, PageKey, AccentTheme } from './sidebarNavigation';

interface SidebarFlyoutProps {
  activeFlyout: {
    title: string;
    top: number;
    item: Extract<SidebarItem, { type: 'section' }>;
  };
  current: PageKey;
  accents: AccentTheme;
  badgeCounts?: Partial<Record<PageKey, number>>;
  onNavigate: (key: PageKey) => void;
  onMouseEnterFlyout: () => void;
  onMouseLeaveFlyout: () => void;
  onCloseFlyout: () => void;
}

export function SidebarFlyout({
  activeFlyout,
  current,
  accents: a,
  badgeCounts,
  onNavigate,
  onMouseEnterFlyout,
  onMouseLeaveFlyout,
  onCloseFlyout
}: SidebarFlyoutProps) {
  const Icon = activeFlyout.item.icon;

  return (
    <div
      onMouseEnter={onMouseEnterFlyout}
      onMouseLeave={onMouseLeaveFlyout}
      style={{ top: Math.max(12, Math.min(window.innerHeight - 280, activeFlyout.top)) }}
      className="hidden md:block fixed left-[76px] z-[1000] min-w-[220px] bg-white border border-border rounded-xl shadow-xl py-2 px-1.5 animate-in fade-in-0 zoom-in-95 duration-150"
      role="menu"
      aria-label={activeFlyout.title}
    >
      <div className="px-3 py-2 border-b border-border/80 mb-1 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded bg-panel-bg flex items-center justify-center text-primary shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-bold text-foreground tracking-tight">
          {activeFlyout.title}
        </span>
      </div>
      <div className="space-y-0.5">
        {activeFlyout.item.items.map((subItem) => {
          const subActive = current === subItem.key;
          const SubIcon = subItem.icon;
          return (
            <button
              key={subItem.key}
              onClick={() => {
                onNavigate(subItem.key);
                onCloseFlyout();
              }}
              role="menuitem"
              className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                subActive
                  ? `${a.activeBg} ${a.text} font-semibold`
                  : 'text-muted-foreground hover:text-foreground hover:bg-panel-bg'
              }`}
            >
              <SubIcon className={`w-4 h-4 ${subActive ? a.iconActive : 'text-muted-foreground group-hover:text-foreground'}`} />
              <span className="flex-1 text-left">{subItem.label}</span>
              {badgeCounts?.[subItem.key] ? (
                <span className="bg-red-500 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] h-4 flex items-center justify-center">
                  {badgeCounts[subItem.key]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
