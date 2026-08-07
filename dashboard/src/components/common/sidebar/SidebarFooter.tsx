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
    <div className={`border-t border-border ${showCollapsed ? 'p-2' : 'p-3'}`}>
      {!showCollapsed ? (
        <div className={`flex items-center gap-3 px-2 py-2 rounded-lg bg-panel-bg ${a.profileHover} transition`}>
          <img
            src={user.avatar}
            alt={`${user.name} avatar`}
            className={`w-9 h-9 rounded-full bg-white border border-border ring-2 ${a.profileRing} shrink-0`}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground font-semibold truncate">
              {user.name}
            </div>
            <div className="text-[11px] text-muted-foreground truncate font-mono">
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenSettings || (() => onNavigate('settings'))}
            aria-label="Account settings"
            title="Account settings"
            className={`p-1.5 rounded-md hover:bg-white transition mr-0.5 cursor-pointer shrink-0 ${current === 'settings' ? a.iconActive : 'text-muted-foreground hover:text-primary'}`}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-white transition shrink-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <div
            onMouseEnter={(e) => onMouseEnterLink?.(user.name, e)}
            onMouseLeave={onMouseLeaveLink}
            className="w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <img
              src={user.avatar}
              alt={`${user.name} avatar`}
              className={`w-8 h-8 rounded-full bg-white border border-border ring-2 ${a.profileRing}`}
            />
          </div>
          <button
            type="button"
            onClick={onOpenSettings || (() => onNavigate('settings'))}
            onMouseEnter={(e) => onMouseEnterLink?.('Account settings', e)}
            onMouseLeave={onMouseLeaveLink}
            aria-label="Account settings"
            title="Account settings"
            className={`w-9 h-9 rounded-lg flex items-center justify-center hover:bg-panel-bg transition cursor-pointer ${current === 'settings' ? a.iconActive : 'text-muted-foreground hover:text-primary'}`}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSignOut}
            onMouseEnter={(e) => onMouseEnterLink?.('Sign out', e)}
            onMouseLeave={onMouseLeaveLink}
            aria-label="Sign out"
            title="Sign out"
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-panel-bg text-muted-foreground hover:text-destructive transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
