import React, { useState } from 'react';
import { MoreVertical, KeyRound, Pencil, Ban } from 'lucide-react';
import type { AppUser, UserRole, Zone } from '../../services/mockData';
import { useNow, relativeTime } from '../../hooks/useNow';
interface UsersTableProps {
  users: AppUser[];
  zones: Zone[];
  onEdit?: (user: AppUser) => void;
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
export function UsersTable({ users, zones, onEdit }: UsersTableProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const now = useNow();
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
            {users.map((u, idx) => {
              const zone = zones.find((z) => z.id === u.zoneId);
              const r = ROLE_STYLES[u.role] ?? FALLBACK_ROLE_STYLE;
              return (
                <tr
                  key={u.id}
                  className={`border-b border-[#EFEAE2]/70 hover:bg-[#FFF1E0]/40 ${idx % 2 === 1 ? 'bg-[#FAFAF7]/40' : ''}`}>
                  
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={u.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full bg-white border border-[#EFEAE2]" />
                      
                      <span className="text-[#1A1410] text-sm font-semibold">
                        {u.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${r.bg} ${r.text} ${r.border}`}>
                      
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
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${u.status === 'active' ? 'text-emerald-600' : 'text-red-600'}`}>
                      
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      
                      {u.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[#6B6258] text-xs">
                    {relativeTime(u.lastLogin, now)}
                  </td>
                  <td className="py-2.5 px-4 relative">
                    <button
                      onClick={() =>
                      setOpenMenu(openMenu === u.id ? null : u.id)
                      }
                      className="p-1.5 rounded-md text-[#6B6258] hover:text-[#db6c00] hover:bg-[#FFF1E0] transition">
                      
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenu === u.id &&
                    <div className="absolute right-2 mt-1 w-44 bg-white border border-[#EFEAE2] rounded-md shadow-xl z-20 overflow-hidden">
                        <button
                        onClick={() => {
                          onEdit?.(u);
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#1A1410] hover:bg-[#FFF1E0]">
                        
                          <Pencil className="w-3.5 h-3.5" /> Edit User
                        </button>
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#1A1410] hover:bg-[#FFF1E0]">
                          <KeyRound className="w-3.5 h-3.5" /> Reset Password
                        </button>
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                          <Ban className="w-3.5 h-3.5" /> Suspend
                        </button>
                      </div>
                    }
                  </td>
                </tr>);

            })}
          </tbody>
        </table>
      </div>
    </div>);

}