import { useState } from 'react';
import {
  MoreVertical,
  KeyRound,
  Pencil,
  Ban,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import type { AppUser, UserRole, Zone } from '../../services/types';
import { useNow, relativeTime } from '../../hooks/useNow';

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
    bg: 'bg-[#FFF1E0]',
    border: 'border-[#db6c00]/30',
    text: 'text-[#b85a00]',
    label: 'Admin'
  },
  hr: {
    bg: 'bg-white',
    border: 'border-[#db6c00]/40',
    text: 'text-[#db6c00]',
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
    bg: 'bg-[#FAFAF7]',
    border: 'border-[#EFEAE2]',
    text: 'text-[#475569]',
    label: 'Rider'
  }
};

const FALLBACK_ROLE_STYLE = {
  bg: 'bg-[#FAFAF7]',
  border: 'border-[#EFEAE2]',
  text: 'text-[#475569]',
  label: 'User'
};

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
  onViewDetails
}: UsersTableProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const now = useNow();

  const total = totalCount ?? users.length;
  const page = currentPage;
  const size = pageSize;
  const totalPages = Math.ceil(total / size) || 1;

  const startItem = total > 0 ? (page - 1) * size + 1 : 0;
  const endItem = Math.min(page * size, total);

  return (
    <div className="bg-white border border-[#EFEAE2] rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto ar-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-[#6B6258] border-b border-[#EFEAE2] bg-[#FAFAF7]">
              <th className="font-semibold py-3 px-4">User</th>
              <th className="font-semibold py-3 px-4">Role</th>
              <th className="font-semibold py-3 px-4">Email</th>
              <th className="font-semibold py-3 px-4">Zone</th>
              <th className="font-semibold py-3 px-4">Status</th>
              <th className="font-semibold py-3 px-4">Last Login</th>
              <th className="font-semibold py-3 px-4 w-12" />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#6B6258] italic text-xs">
                  No users found matching your filters.
                </td>
              </tr>
            ) : (
              users.map((u, idx) => {
                const zone = zones.find((z) => z.id === u.zoneId);
                const r = ROLE_STYLES[u.role] ?? FALLBACK_ROLE_STYLE;
                return (
                  <tr
                    key={u.id}
                    onClick={() => onViewDetails?.(u)}
                    className={`border-b border-[#EFEAE2]/70 hover:bg-[#FFF1E0]/40 cursor-pointer ${idx % 2 === 1 ? 'bg-[#FAFAF7]/40' : ''}`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={u.avatar}
                          alt=""
                          className="w-8 h-8 rounded-full bg-white border border-[#EFEAE2]"
                        />
                        <span className="text-[#1A1410] text-sm font-semibold">
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
                    <td className="py-2.5 px-4 font-mono text-[#6B6258] text-xs">
                      {u.email}
                    </td>
                    <td className="py-2.5 px-4 text-[#1A1410]">
                      {zone?.name ?? '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      {u.status === 'suspended' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Suspended
                        </span>
                      ) : onlineUserIds.includes(u.id) ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#6B6258] text-xs">
                      {u.lastLogin === 0 ? 'Never' : relativeTime(u.lastLogin, now)}
                    </td>
                    <td className="py-2.5 px-4 relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenu(openMenu === u.id ? null : u.id)
                        }
                        className="p-1.5 rounded-md text-[#6B6258] hover:text-[#db6c00] hover:bg-[#FFF1E0] transition cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenu === u.id && (
                        <div className="absolute right-2 mt-1 w-44 bg-white border border-[#EFEAE2] rounded-md shadow-xl z-20 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => {
                              onViewDetails?.(u);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#1A1410] hover:bg-[#FFF1E0] cursor-pointer"
                          >
                            <User className="w-3.5 h-3.5 text-[#db6c00]" /> View Profile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onEdit?.(u);
                              setOpenMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#1A1410] hover:bg-[#FFF1E0] cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit User
                          </button>
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#1A1410] hover:bg-[#FFF1E0] cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Reset Password
                          </button>
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" /> Suspend
                          </button>
                        </div>
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
        <div className="px-4 py-3 border-t border-[#EFEAE2] bg-[#FAFAF7] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#6B6258]">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Showing <strong className="text-[#1A1410] font-semibold">{startItem}</strong> to{' '}
              <strong className="text-[#1A1410] font-semibold">{endItem}</strong> of{' '}
              <strong className="text-[#1A1410] font-semibold">{total}</strong> employees
            </span>

            {onPageSizeChange && (
              <div className="flex items-center gap-1.5 border-l border-[#EFEAE2] pl-4">
                <span>Per page:</span>
                <select
                  value={size}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="bg-white border border-[#EFEAE2] rounded px-2 py-1 text-xs text-[#1A1410] font-semibold outline-none focus:border-[#db6c00] cursor-pointer shadow-sm"
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
              className="p-1.5 rounded border border-[#EFEAE2] bg-white hover:bg-[#FFF1E0]/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-[#1A1410]"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded border border-[#EFEAE2] bg-white hover:bg-[#FFF1E0]/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-[#1A1410]"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 bg-white border border-[#EFEAE2] rounded font-mono text-xs text-[#1A1410]">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded border border-[#EFEAE2] bg-white hover:bg-[#FFF1E0]/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-[#1A1410]"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              className="p-1.5 rounded border border-[#EFEAE2] bg-white hover:bg-[#FFF1E0]/50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-[#1A1410]"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
