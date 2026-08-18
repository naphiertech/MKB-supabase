import { Settings, LogOut } from 'lucide-react';
import { SidebarUser, PageKey, AccentTheme } from './sidebarNavigation';

interface SidebarFooterProps {
  user: SidebarUser;
  current: PageKey;
  isCollapsed: boolean;
  mobile: boolean;
  accents: AccentTheme;
  onNavigate: (key: PageKey) => void;
  onOpenSettings?: () => void;
  onSignOut?: () => void;
  onMouseEnterLink?: (label: string, e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeaveLink?: () => void;
}

export function SidebarFooter({
  user,
  current,
  isCollapsed,
  mobile,
  accents: a,
  onNavigate,
  onOpenSettings,
  onSignOut,
  onMouseEnterLink,
  onMouseLeaveLink
}: SidebarFooterProps) {
  const showCollapsed = !mobile && isCollapsed;

  return (
    <div className={`border-t border-border transition-all duration-300 ease-in-out ${showCollapsed ? 'p-2' : 'p-3'}`}>
      <div className={`flex items-center rounded-lg transition-all duration-300 ease-in-out ${
        showCollapsed ? 'flex-col justify-center gap-1 bg-transparent' : `gap-3 px-2 py-2 bg-panel-bg ${a.profileHover}`
      }`}>
        <div
          onMouseEnter={(e) => showCollapsed && onMouseEnterLink?.(user.name, e)}
          onMouseLeave={onMouseLeaveLink}
          className="w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer"
        >
          <img
            src={user.avatar}
            alt={`${user.name} avatar`}
            className={`rounded-full bg-white border border-border ring-2 ${a.profileRing} transition-all duration-300 ease-in-out ${
              showCollapsed ? 'w-8 h-8' : 'w-9 h-9'
            }`}
          />
        </div>

        <div
          aria-hidden={showCollapsed}
          className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${
            showCollapsed ? 'opacity-0 max-h-0 max-w-0 overflow-hidden pointer-events-none' : 'opacity-100 max-w-[140px]'
          }`}
        >
          <div className="text-sm text-foreground font-semibold truncate">
            {user.name}
          </div>
          <div className="text-[11px] text-muted-foreground truncate font-mono">
            {user.email}
          </div>
        </div>

        <div className={`flex items-center gap-0.5 transition-all duration-300 ease-in-out ${
          showCollapsed ? 'flex-col gap-1 mt-0.5' : ''
        }`}>
          <button
            type="button"
            onClick={onOpenSettings || (() => onNavigate('settings'))}
            onMouseEnter={(e) => showCollapsed && onMouseEnterLink?.('Account settings', e)}
            onMouseLeave={onMouseLeaveLink}
            aria-label="Account settings"
            title="Account settings"
            className={`rounded-lg flex items-center justify-center transition-all duration-300 ease-in-out cursor-pointer ${
              showCollapsed
                ? `w-8 h-8 hover:bg-panel-bg ${current === 'settings' ? a.iconActive : 'text-muted-foreground hover:text-primary'}`
                : `p-1.5 hover:bg-white mr-0.5 ${current === 'settings' ? a.iconActive : 'text-muted-foreground hover:text-primary'}`
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onSignOut}
            onMouseEnter={(e) => showCollapsed && onMouseEnterLink?.('Sign out', e)}
            onMouseLeave={onMouseLeaveLink}
            aria-label="Sign out"
            title="Sign out"
            className={`rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-all duration-300 ease-in-out cursor-pointer ${
              showCollapsed ? 'w-8 h-8 hover:bg-panel-bg' : 'p-1.5 hover:bg-white'
            }`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
