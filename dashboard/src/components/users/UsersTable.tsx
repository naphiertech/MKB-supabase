import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreVertical,
  KeyRound,
  Pencil,
  Ban,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  RotateCcw,
  Archive,
  History,
} from 'lucide-react';
import type { AppUser, UserRole, Zone } from '../../services/types';
import { useNow, relativeTime } from '../../hooks/useNow';
import { calculateUserActionMenuPosition, type ActionMenuPosition } from '../../lib/userActionMenuPosition';
import { Modal } from '../common/Modal';

interface UsersTableProps {
  users: AppUser[];
  zones: Zone[];
  onlineUserIds: string[];
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onEdit?: (user: AppUser) => void;
  onViewDetails?: (user: AppUser) => void;
  currentUserId?: string;
  currentUserRole?: 'admin' | 'hr';
  onSendPasswordReset?: (user: AppUser) => Promise<void>;
  onToggleSuspension?: (user: AppUser, suspended: boolean) => Promise<void>;
  onArchive?: (user: AppUser) => void;
  onRestore?: (user: AppUser) => void;
}

const ROLE_STYLES: Record<
  UserRole,
  {
    bg: string;
    text: string;
    border: string;
    label: string;
  }> =
{
  admin: {
    bg: 'bg-accent',
    border: 'border-primary/30',
    text: 'text-accent-foreground',
    label: 'Admin'
  },
  hr: {
    bg: 'bg-white',
    border: 'border-primary/40',
    text: 'text-primary',
    label: 'HR'
  },
  payroll: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-500/30',
    text: 'text-indigo-700',
    label: 'Payroll'
  },
  dispatcher: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700',
    label: 'Dispatcher'
  },
  rider: {
    bg: 'bg-panel-bg',
    border: 'border-border',
    text: 'text-[#475569]',
    label: 'Rider'
  }
};

const FALLBACK_ROLE_STYLE = {
  bg: 'bg-panel-bg',
  border: 'border-border',
  text: 'text-[#475569]',
  label: 'User'
};

function UserActionMenu({ anchor, label, onClose, children }: {
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [position, setPosition] = useState<ActionMenuPosition>(() => calculateUserActionMenuPosition(
    anchor.getBoundingClientRect(),
    { width: 176, height: 144 },
    { width: window.innerWidth, height: window.innerHeight }
  ));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    function updatePosition() {
      const menuRect = menuRef.current?.getBoundingClientRect();
      setPosition(calculateUserActionMenuPosition(
        anchor.getBoundingClientRect(),
        { width: menuRect?.width || 176, height: menuRect?.height || 144 },
        { width: window.innerWidth, height: window.innerHeight }
      ));
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchor]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    });
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !anchor.contains(target)) onCloseRef.current();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        anchor.focus();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex].focus();
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-placement={position.placement}
      style={{ position: 'fixed', top: position.top, left: position.left, width: 176, zIndex: 2000 }}
      className="bg-white border border-border rounded-md shadow-xl overflow-hidden"
    >
      {children}
    </div>,
    document.body
  );
}

export function UsersTable({
  users,
  zones,
  onlineUserIds,
  totalCount,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onViewDetails,
  currentUserId,
  currentUserRole,
  onSendPasswordReset,
  onToggleSuspension,
  onArchive,
  onRestore,
}: UsersTableProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'reset' | 'suspend' | 'reactivate'; user: AppUser } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = useNow();

  async function confirmAction() {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (pendingAction.type === 'reset') await onSendPasswordReset?.(pendingAction.user);
      else await onToggleSuspension?.(pendingAction.user, pendingAction.type === 'suspend');
      setPendingAction(null);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The account action could not be completed.');
    } finally {
      setActionBusy(false);
    }
  }

  const total = totalCount ?? users.length;
  const page = currentPage;
  const size = pageSize;
  const totalPages = Math.ceil(total / size) || 1;

  const startItem = total > 0 ? (page - 1) * size + 1 : 0;
  const endItem = Math.min(page * size, total);

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="table-scroll-region ar-scroll" role="region" aria-label="User records" tabIndex={0}>
        <table className="data-table-wide w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground border-b border-border bg-panel-bg">
              <th className="font-semibold py-3 px-4">User</th>
              <th className="font-semibold py-3 px-4">Role</th>
              <th className="font-semibold py-3 px-4">Email</th>
              <th className="font-semibold py-3 px-4">Zone</th>
              <th className="font-semibold py-3 px-4">Employment</th>
              <th className="font-semibold py-3 px-4">Account</th>
              <th className="font-semibold py-3 px-4">Presence</th>
              <th className="font-semibold py-3 px-4">Last Login</th>
              <th className="font-semibold py-3 px-4 w-12" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted-foreground italic text-xs">
                  No users found matching your filters.
                </td>
              </tr>
            ) : (
              users.map((u, idx) => {
                const zone = zones.find((z) => z.id === u.zoneId);
                const r = ROLE_STYLES[u.role] ?? FALLBACK_ROLE_STYLE;
                const archived = u.employmentStatus === 'archived';
                const canManageEmployment = u.id !== currentUserId &&
                  (currentUserRole === 'admin' || (currentUserRole === 'hr' && u.role === 'rider'));
                return (
                  <tr
                    key={u.id}
                    onClick={() => onViewDetails?.(u)}
                    className={`border-b border-border/70 hover:bg-accent/40 cursor-pointer ${idx % 2 === 1 ? 'bg-panel-bg/40' : ''} ${archived ? 'bg-slate-50/80 text-muted-foreground' : ''}`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.avatar}
                          alt=""
                          className="w-8 h-8 rounded-full bg-white border border-border"
                        />
                        <span className="text-foreground text-sm font-semibold">
                          {u.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${r.bg} ${r.text} ${r.border}`}
                      >
                        {r.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-muted-foreground text-xs">
                      {u.email}
                    </td>
                    <td className="py-2.5 px-4 text-foreground">
                      {zone?.name ?? '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${archived ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {archived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {u.status === 'suspended' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {u.role === 'rider' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${onlineUserIds.includes(u.id) && !archived ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          {archived ? 'Offline' : u.operationalStatus ? u.operationalStatus.charAt(0).toUpperCase() + u.operationalStatus.slice(1) : onlineUserIds.includes(u.id) ? 'Online' : 'Offline'}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-muted-foreground text-xs">
                      {u.lastLogin === 0 ? 'Never' : relativeTime(u.lastLogin, now)}
                    </td>
                    <td className="py-2.5 px-4 relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`Open actions for ${u.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openMenu === u.id}
                        onClick={(event) => {
                          if (openMenu === u.id) {
                            setOpenMenu(null);
                            setMenuAnchor(null);
                          } else {
                            setOpenMenu(u.id);
                            setMenuAnchor(event.currentTarget);
                          }
                        }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenu === u.id && menuAnchor && (
                        <UserActionMenu anchor={menuAnchor} label={`Actions for ${u.name}`} onClose={() => { setOpenMenu(null); setMenuAnchor(null); }}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onViewDetails?.(u);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5 text-primary" /> View Profile
                          </button>
                          {archived ? (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onViewDetails?.(u);
                                  setOpenMenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                              >
                                <History className="w-3.5 h-3.5" /> View History
                              </button>
                              {canManageEmployment && <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  onRestore?.(u);
                                  setOpenMenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> Restore Employment
                              </button>}
                            </>
                          ) : <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onEdit?.(u);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit User
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => { setActionError(null); setPendingAction({ type: 'reset', user: u }); setOpenMenu(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Send Password Reset
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={u.id === currentUserId || (currentUserRole === 'hr' && u.role !== 'rider')}
                            title={u.id === currentUserId ? 'You cannot change your own account status' : undefined}
                            onClick={() => { setActionError(null); setPendingAction({ type: u.status === 'suspended' ? 'reactivate' : 'suspend', user: u }); setOpenMenu(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-accent cursor-pointer disabled:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {u.status === 'suspended' ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                            {u.status === 'suspended' ? 'Reactivate Account' : 'Suspend Account'}
                          </button>
                          {canManageEmployment && <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onArchive?.(u);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50 cursor-pointer"
                          >
                            <Archive className="w-3.5 h-3.5" /> Archive Employee
                          </button>}
                          </>}
                        </UserActionMenu>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && onPageChange && (
        <div className="px-4 py-3 border-t border-border bg-panel-bg flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Showing <strong className="text-foreground font-semibold">{startItem}</strong> to{' '}
              <strong className="text-foreground font-semibold">{endItem}</strong> of{' '}
              <strong className="text-foreground font-semibold">{total}</strong> employees
            </span>

            {onPageSizeChange && (
              <div className="flex items-center gap-1.5 border-l border-border pl-4">
                <span>Per page:</span>
                <select
                  value={size}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="bg-white border border-border rounded px-2 py-1 text-xs text-foreground font-semibold outline-none focus:border-primary cursor-pointer shadow-sm"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 font-semibold">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
              className="p-1.5 rounded border border-border bg-white hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-foreground"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded border border-border bg-white hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-foreground"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 bg-white border border-border rounded font-mono text-xs text-foreground">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded border border-border bg-white hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-foreground"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              className="p-1.5 rounded border border-border bg-white hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-foreground"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <Modal
        open={Boolean(pendingAction)}
        onClose={() => !actionBusy && setPendingAction(null)}
        dismissible={!actionBusy}
        title={pendingAction?.type === 'reset' ? 'Send password reset?' : pendingAction?.type === 'suspend' ? 'Suspend this account?' : 'Reactivate this account?'}
        subtitle={pendingAction?.user.name}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {pendingAction?.type === 'reset'
              ? `A secure recovery link will be emailed to ${pendingAction.user.email}. No password will be displayed or generated here.`
              : pendingAction?.type === 'suspend'
                ? 'The user will be blocked from signing in. Employee, attendance, parcel, payroll, and audit records will be preserved.'
                : 'The user will be allowed to sign in again. Existing employee and operational records are unchanged.'}
          </p>
          {actionError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{actionError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={actionBusy} onClick={() => setPendingAction(null)} className="rounded-lg border border-border px-4 py-2 text-xs font-semibold disabled:opacity-60">Cancel</button>
            <button type="button" disabled={actionBusy} onClick={() => void confirmAction()} className={`rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${pendingAction?.type === 'suspend' ? 'bg-red-600' : 'bg-primary'}`}>
              {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : pendingAction?.type === 'reset' ? 'Send recovery link' : pendingAction?.type === 'suspend' ? 'Suspend account' : 'Reactivate account'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
