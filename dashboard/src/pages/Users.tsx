import { useMemo, useState, useEffect, ComponentType } from 'react';
import {
  Plus,
  Search,
  Shield,
  Users as UsersIcon,
  Bike,
  Wallet } from
'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { type AppUser, type Zone } from '../services/types';
import { supabase } from '../lib/supabaseClient';
import { getZones } from '../services/geofenceService';
import { UsersTable } from '../components/users/UsersTable';
import { UserDrawer } from '../components/users/UserDrawer';

type EditableRole = 'admin' | 'hr' | 'rider' | 'payroll';

export function Users() {
  const [userList, setUserList] = useState<AppUser[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | EditableRole>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'suspended'>(
    'all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const loadData = async () => {
    try {
      const zList = await getZones();
      setZonesList(zList);

      const { data: dbUsers, error } = await supabase
        .from('users')
        .select('*, riders(zone_id)')
        .order('full_name', { ascending: true });

      if (!error && dbUsers) {
        const mapped: AppUser[] = dbUsers.map((u: any) => ({
          id: u.id,
          name: u.full_name,
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(u.full_name)}`,
          email: u.email,
          role: u.role,
          zoneId: u.riders?.zone_id || null,
          status: u.status,
          lastLogin: u.last_login ? new Date(u.last_login).getTime() : Date.now()
        }));
        setUserList(mapped);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const counts = {
    admin: userList.filter((u) => u.role === 'admin').length,
    hr: userList.filter((u) => u.role === 'hr').length,
    rider: userList.filter((u) => u.role === 'rider').length,
    payroll: userList.filter((u) => u.role === 'payroll').length
  };

  const filtered = useMemo(
    () =>
    userList.filter((u) => {
      const matchesQ =
      !q ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
      statusFilter === 'all' || u.status === statusFilter;
      return matchesQ && matchesRole && matchesStatus;
    }),
    [q, roleFilter, statusFilter, userList]
  );

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="text-2xl font-semibold text-[#1A1410] tracking-tight">
            {userList.length}
          </div>
          <div className="text-sm text-[#6B6258]">total users</div>
          <div className="hidden md:flex items-center gap-1.5 ml-3">
            <RoleChip
              icon={Shield}
              label="Admin"
              count={counts.admin}
              tone="orange" />
            
            <RoleChip
              icon={UsersIcon}
              label="HR"
              count={counts.hr}
              tone="amber" />
            
            <RoleChip
              icon={Bike}
              label="Rider"
              count={counts.rider}
              tone="slate" />
            
            <RoleChip
              icon={Wallet}
              label="Payroll"
              count={counts.payroll}
              tone="indigo" />
            
          </div>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#db6c00]/25 shadow-sm">
          
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm">
        <div className="flex items-center gap-2 px-3 h-9 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] flex-1 min-w-[220px] max-w-md focus-within:border-[#db6c00] focus-within:ring-2 focus-within:ring-[#db6c00]/15 transition-shadow">
          <Search className="w-4 h-4 text-[#6B6258]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="bg-transparent outline-none text-sm text-[#1A1410] placeholder:text-[#A39988] flex-1" />
          
        </div>
        <Segmented
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as typeof roleFilter)}
          options={[
          {
            v: 'all',
            l: 'All Roles'
          },
          {
            v: 'admin',
            l: 'Admin'
          },
          {
            v: 'hr',
            l: 'HR'
          },
          {
            v: 'rider',
            l: 'Rider'
          },
          {
            v: 'payroll',
            l: 'Payroll'
          }]
          } />
        
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as typeof statusFilter)}
          options={[
          {
            v: 'all',
            l: 'All'
          },
          {
            v: 'active',
            l: 'Active'
          },
          {
            v: 'suspended',
            l: 'Suspended'
          }]
          } />
        
        <div className="flex-1" />
        <div className="text-xs text-[#6B6258] font-mono px-2">
          {filtered.length} shown
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#6B6258] text-sm">
          Loading users from Supabase...
        </div>
      ) : (
        <UsersTable
          users={filtered}
          zones={zonesList}
          onEdit={(u) => {
            setEditing(u);
            setDrawerOpen(true);
          }} />
      )}

      <UserDrawer
        open={drawerOpen}
        user={editing}
        zones={zonesList}
        onClose={() => setDrawerOpen(false)}
        onSaved={async (savedUser, mode) => {
          if (mode === 'edit') {
            // Update the profile first in public.users
            const { error: userErr } = await supabase
              .from('users')
              .update({
                full_name: savedUser.name,
                status: savedUser.status,
                role: savedUser.role,
                contact: savedUser.contact || null
              })
              .eq('id', savedUser.id);
            if (userErr) throw userErr;

            // If the user's role is rider, also synchronize the riders table details
            if (savedUser.role === 'rider') {
              const { data: userProfile } = await supabase
                .from('users')
                .select('rider_id')
                .eq('id', savedUser.id)
                .single();
              
              if (userProfile?.rider_id) {
                const dbShift = savedUser.shift
                  ? savedUser.shift.charAt(0).toUpperCase() + savedUser.shift.slice(1)
                  : null;
                const { error: riderErr } = await supabase
                  .from('riders')
                  .update({
                    name: savedUser.name,
                    contact: savedUser.contact || null,
                    zone_id: savedUser.zoneId || null,
                    shift: dbShift,
                    face_registered: !!savedUser.faceImage,
                    face_image_url: savedUser.faceImage || null
                  })
                  .eq('id', userProfile.rider_id);
                if (riderErr) throw riderErr;
              }
            }
          } else {
            // mode === 'create'
            let generatedRiderId: string | null = null;
            try {
              // 1. If role is rider, insert to public.riders first
              if (savedUser.role === 'rider') {
                const dbShift = savedUser.shift
                  ? savedUser.shift.charAt(0).toUpperCase() + savedUser.shift.slice(1)
                  : null;
                
                const { data: riderData, error: riderErr } = await supabase
                  .from('riders')
                  .insert({
                    name: savedUser.name,
                    mkb_id: savedUser.mkbRiderId || `MKB-${Math.floor(1000 + Math.random() * 9000)}`,
                    email: savedUser.email,
                    contact: savedUser.contact || null,
                    zone_id: savedUser.zoneId || null,
                    shift: dbShift,
                    status: 'offline',
                    face_registered: !!savedUser.faceImage,
                    face_image_url: savedUser.faceImage || null
                  })
                  .select('id')
                  .single();

                if (riderErr) throw riderErr;
                generatedRiderId = riderData.id;
              }

              // 2. Instantiate an isolated Supabase client in-memory ONLY to avoid active Admin session hijacking
              const tempSupabase = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                  auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                  }
                }
              );

              // 3. Call tempSupabase.auth.signUp to register the user in auth.users
              const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
                email: savedUser.email,
                password: savedUser.tempPassword || 'tempPassword123'
              });

              if (authErr) throw authErr;

              const authUser = authData.user;
              if (!authUser) {
                throw new Error('Authentication account could not be initialized.');
              }

              // 4. Insert the final user profile into public.users referencing the Auth UUID
              const { error: profileErr } = await supabase
                .from('users')
                .insert({
                  id: authUser.id,
                  full_name: savedUser.name,
                  email: savedUser.email,
                  role: savedUser.role,
                  contact: savedUser.contact || null,
                  rider_id: generatedRiderId,
                  status: savedUser.status || 'active'
                });

              if (profileErr) throw profileErr;

            } catch (transactionErr) {
              // Transaction rollback: clean up the newly created rider record if anything fails
              if (generatedRiderId) {
                await supabase.from('riders').delete().eq('id', generatedRiderId);
              }
              throw transactionErr;
            }
          }

          // Reload users list dynamically
          await loadData();
        }} />
      
    </div>);

}
function RoleChip({
  icon: Icon,
  label,
  count,
  tone




  


}: {icon: ComponentType<{className?: string;}>;label: string;count: number;tone: 'orange' | 'amber' | 'slate' | 'indigo';}) {
  const styles = {
    orange: 'bg-[#FFF1E0] border-[#db6c00]/30 text-[#b85a00]',
    amber: 'bg-[#FEF3C7] border-[#D97706]/30 text-[#B45309]',
    slate: 'bg-slate-100 border-slate-300 text-slate-600',
    indigo: 'bg-indigo-50 border-indigo-500/30 text-indigo-700'
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] ${styles}`}>
      
      <Icon className="w-3 h-3" />
      {label}
      <span className="font-mono tabular-nums opacity-80">{count}</span>
    </span>);

}
function Segmented({
  value,
  onChange,
  options







}: {value: string;onChange: (v: string) => void;options: {v: string;l: string;}[];}) {
  return (
    <div className="inline-flex p-0.5 rounded-md bg-[#FAFAF7] border border-[#EFEAE2]">
      {options.map((o) =>
      <button
        key={o.v}
        onClick={() => onChange(o.v)}
        className={`px-2.5 h-8 rounded text-xs transition-colors ${value === o.v ? 'bg-white text-[#1A1410] shadow-sm border border-[#EFEAE2]' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
        
          {o.l}
        </button>
      )}
    </div>);

}
