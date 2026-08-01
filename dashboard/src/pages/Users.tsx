import { useMemo, useState, useEffect, ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Search,
  Shield,
  Users as UsersIcon,
  Bike,
  Wallet,
  Download
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { type AppUser, type UserRole, type UserStatus, type Zone } from '../services/types';
import { logActivity } from '../lib/apiService';
import { getZones } from '../services/geofenceService';
import { UsersTable } from '../components/users/UsersTable';
import { UserForm } from '../components/users/UserForm';
import { EmployeeDetails } from '../components/users/EmployeeDetails';
import { useAuth } from '../hooks/useAuth';
import { clearCachedAvatar } from '../lib/avatarCache';
import { exportXLSXFile } from '../lib/exports/excelHelper';
import { toast } from 'react-hot-toast';
import {
  getUsersAndRiders,
  updateUserProfile,
  getUserRiderId,
  updateRiderProfile,
  createRiderProfile,
  deleteRiderProfile,
  createUserProfile
} from '../services/userService';


type EditableRole = 'admin' | 'hr' | 'rider' | 'payroll';

interface UsersProps {
  onlineUserIds: string[];
}

export function Users({ onlineUserIds = [] }: UsersProps) {
  const { session } = useAuth();
  const currentUserRole = session?.role;

  const [userList, setUserList] = useState<AppUser[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | EditableRole>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'suspended'>(
    'all');
  const [view, setView] = useState<'list' | 'form' | 'details'>('list');
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Sync roleFilter for HR
  useEffect(() => {
    if (currentUserRole === 'hr') {
      setRoleFilter('rider');
    }
  }, [currentUserRole]);

  // Reset pagination on filter changes
  useEffect(() => {
    setPage(1);
  }, [q, roleFilter, statusFilter, zoneFilter]);

  const loadData = async () => {
    try {
      const [zList, dbUsers] = await Promise.all([
        getZones(),
        getUsersAndRiders()
      ]);

      setZonesList(zList);

      if (dbUsers) {
        const mapped: AppUser[] = dbUsers.map((u: {
          id: string;
          full_name: string;
          email: string;
          role: string;
          status: string;
          last_login: string | null;
          contact: string | null;
          rider_id?: string | null;
          employment_type?: string | null;
          date_of_hire?: string | null;
          notes?: string | null;
          riders: {
            id?: string | null;
            face_image_url?: string | null;
            zone_id?: string | null;
            contact?: string | null;
            mkb_id?: string | null;
            shift?: string | null;
            face_descriptor?: number[] | null;
            province?: string | null;
            city?: string | null;
            barangay?: string | null;
            zip_code?: string | null;
            street_address?: string | null;
            emergency_contact_name?: string | null;
            emergency_contact_phone?: string | null;
            employment_type?: string | null;
            date_of_hire?: string | null;
            vehicle_type?: string | null;
            vehicle_plate_number?: string | null;
            notes?: string | null;
          } | null;
        }) => {
          const userObj: AppUser = {
            id: u.id,
            name: u.full_name,
            avatar: u.role === 'rider' && u.riders?.face_image_url
              ? u.riders.face_image_url
              : `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(u.full_name)}`,
            email: u.email,
            role: u.role as UserRole,
            zoneId: u.riders?.zone_id || null,
            status: u.status as UserStatus,
            lastLogin: u.last_login ? new Date(u.last_login).getTime() : 0,
            contact: u.contact || u.riders?.contact || '',
            mkbRiderId: u.riders?.mkb_id || '',
            riderId: u.riders?.id || u.rider_id || null,
            shift: u.riders?.shift ? u.riders.shift.toLowerCase() : '',
            faceImage: u.riders?.face_image_url || null,
            faceDescriptor: u.riders?.face_descriptor || null,
            province: u.riders?.province || '',
            city: u.riders?.city || '',
            barangay: u.riders?.barangay || '',
            zipCode: u.riders?.zip_code || '',
            streetAddress: u.riders?.street_address || '',
            emergencyContactName: u.riders?.emergency_contact_name || '',
            emergencyContactPhone: u.riders?.emergency_contact_phone || '',
            employmentType: u.employment_type || u.riders?.employment_type || '',
            dateOfHire: u.date_of_hire || u.riders?.date_of_hire || '',
            vehicleType: u.riders?.vehicle_type || '',
            vehiclePlateNumber: u.riders?.vehicle_plate_number || '',
            notes: u.notes || u.riders?.notes || ''
          };
          return userObj;
        });
        setUserList(mapped);
      }
    } catch (err) {
      console.error('Error loading users:', err);
      toast.error('Failed to load users list');
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
      
      const isOnline = onlineUserIds.includes(u.id);
      const liveStatus = u.status === 'suspended' ? 'suspended' : isOnline ? 'active' : 'offline';
      
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && liveStatus === 'active') ||
        (statusFilter === 'suspended' && liveStatus === 'suspended');

      const matchesZone = zoneFilter === 'all' || u.zoneId === zoneFilter;

      return matchesQ && matchesRole && matchesStatus && matchesZone;
    }),
    [q, roleFilter, statusFilter, zoneFilter, userList, onlineUserIds]
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const handleExportExcel = async () => {
    try {
      const headers = ['Name', 'Email', 'Role', 'Status', 'Contact', 'Zone'];
      
      const rows = filtered.map(u => {
        const zoneName = zonesList.find(z => z.id === u.zoneId)?.name || '—';
        return [
          u.name || '',
          u.email || '',
          u.role || '',
          u.status || '',
          u.contact || '',
          zoneName
        ];
      });

      await exportXLSXFile(
        'Employee Registry',
        headers,
        rows,
        `MKB_Employee_Registry_${new Date().toISOString().split('T')[0]}`,
        '/files/MKB_Employee_Registry_Template.xlsx'
      );
    } catch (err) {
      console.error('Failed to export registry:', err);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {view === 'form' ? (
        <motion.div
          key="form"
          initial={{ opacity: 0, y: 12, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.995 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full min-h-screen"
        >
          <UserForm
            user={editing}
            zones={zonesList}
            onClose={() => {
              setView('list');
              setEditing(null);
            }}
            onSaved={async (savedUser, mode) => {
              if (mode === 'edit') {
                // Update the profile first in public.users
                await updateUserProfile(savedUser.id, {
                  name: savedUser.name,
                  status: savedUser.status,
                  role: savedUser.role,
                  contact: savedUser.contact,
                  employmentType: savedUser.employmentType,
                  dateOfHire: savedUser.dateOfHire,
                  notes: savedUser.notes
                });

                logActivity({
                  eventType: 'user_updated',
                  description: `Updated user profile for "${savedUser.name}" (${savedUser.role}).`,
                  metadata: { user_id: savedUser.id, name: savedUser.name, role: savedUser.role, status: savedUser.status }
                }).catch(err => console.warn('Failed to log user update:', err));

                // If the user's role is rider, also synchronize the riders table details
                if (savedUser.role === 'rider') {
                  const riderId = await getUserRiderId(savedUser.id);
                  
                  if (riderId) {
                    await updateRiderProfile(riderId, {
                      name: savedUser.name,
                      contact: savedUser.contact,
                      zoneId: savedUser.zoneId,
                      faceImage: savedUser.faceImage,
                      faceDescriptor: savedUser.faceDescriptor,
                      province: savedUser.province,
                      city: savedUser.city,
                      barangay: savedUser.barangay,
                      zipCode: savedUser.zipCode,
                      streetAddress: savedUser.streetAddress,
                      emergencyContactName: savedUser.emergencyContactName,
                      emergencyContactPhone: savedUser.emergencyContactPhone,
                      employmentType: savedUser.employmentType,
                      dateOfHire: savedUser.dateOfHire,
                      vehicleType: savedUser.vehicleType,
                      vehiclePlateNumber: savedUser.vehiclePlateNumber,
                      notes: savedUser.notes
                    });
                    clearCachedAvatar(riderId);
                  }
                }
              } else {
                // mode === 'create'
                let generatedRiderId: string | null = null;
                try {
                  // 1. If role is rider, insert to public.riders first
                  if (savedUser.role === 'rider') {
                    generatedRiderId = await createRiderProfile({
                      name: savedUser.name,
                      email: savedUser.email,
                      mkbRiderId: savedUser.mkbRiderId || undefined,
                      contact: savedUser.contact,
                      zoneId: savedUser.zoneId,
                      faceImage: savedUser.faceImage,
                      faceDescriptor: savedUser.faceDescriptor,
                      province: savedUser.province,
                      city: savedUser.city,
                      barangay: savedUser.barangay,
                      zipCode: savedUser.zipCode,
                      streetAddress: savedUser.streetAddress,
                      emergencyContactName: savedUser.emergencyContactName,
                      emergencyContactPhone: savedUser.emergencyContactPhone,
                      employmentType: savedUser.employmentType,
                      dateOfHire: savedUser.dateOfHire,
                      vehicleType: savedUser.vehicleType,
                      vehiclePlateNumber: savedUser.vehiclePlateNumber,
                      notes: savedUser.notes
                    });
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
                  await createUserProfile(authUser.id, generatedRiderId, {
                    name: savedUser.name,
                    email: savedUser.email,
                    role: savedUser.role,
                    contact: savedUser.contact,
                    status: savedUser.status || 'active',
                    employmentType: savedUser.employmentType,
                    dateOfHire: savedUser.dateOfHire,
                    notes: savedUser.notes
                  });

                  logActivity({
                    eventType: 'user_created',
                    description: `Registered new user profile: "${savedUser.name}" with role: ${savedUser.role}.`,
                    metadata: { user_id: authUser.id, name: savedUser.name, role: savedUser.role }
                  }).catch(err => console.warn('Failed to log user creation:', err));

                } catch (transactionErr) {
                  // Transaction rollback: clean up the newly created rider record if anything fails
                  if (generatedRiderId) {
                    await deleteRiderProfile(generatedRiderId);
                  }
                  throw transactionErr;
                }
              }

              // Reload users list dynamically
              await loadData();
              setView('list');
              setEditing(null);
            }}
          />
        </motion.div>
      ) : view === 'details' && selectedUser ? (
        <motion.div
          key="details"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full min-h-screen"
        >
          <EmployeeDetails
            user={selectedUser}
            zones={zonesList}
            onClose={() => {
              setView('list');
              setSelectedUser(null);
            }}
            onEdit={() => {
              setEditing(selectedUser);
              setView('form');
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0, y: 12, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.995 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="p-4 md:p-6 lg:p-7 space-y-5"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-2xl font-semibold text-foreground tracking-tight">
                {currentUserRole === 'hr' ? counts.rider : userList.length}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentUserRole === 'hr' ? 'total riders' : 'total users'}
              </div>
              <div className="hidden md:flex items-center gap-1.5 ml-3">
                {currentUserRole !== 'hr' ? (
                  <>
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
                  </>
                ) : (
                  <RoleChip
                    icon={Bike}
                    label="Rider"
                    count={counts.rider}
                    tone="slate" />
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md border border-border bg-white text-foreground hover:bg-panel-bg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/15 shadow-sm cursor-pointer"
              >
                <Download className="w-4 h-4 text-primary" />
                Export Excel
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setView('form');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-md bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/25 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Rider
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-border rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm">
            <div className="flex items-center gap-2 px-3 h-9 rounded-md bg-panel-bg border border-border flex-1 min-w-[220px] max-w-md focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-shadow">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={currentUserRole === 'hr' ? "Search riders by name or email…" : "Search by name or email…"}
                className="bg-transparent outline-none text-sm text-foreground placeholder:text-subtle-text flex-1" />
              
            </div>
            {currentUserRole !== 'hr' && (
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
            )}
            
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#FAFAF7] border border-[#EFEAE2] text-xs text-[#1A1410] font-semibold outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15 cursor-pointer shadow-sm"
            >
              <option value="all">All Zones ({zonesList.length})</option>
              {zonesList.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>

            <Segmented
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              options={[
              {
                v: 'all',
                l: 'All Status'
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
            <div className="text-xs text-muted-foreground font-mono px-2">
              {filtered.length} shown
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Loading users from Supabase...
            </div>
          ) : (
            <UsersTable
              users={paginatedUsers}
              zones={zonesList}
              onlineUserIds={onlineUserIds}
              totalCount={filtered.length}
              currentPage={safePage}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              onEdit={(u) => {
                setEditing(u);
                setView('form');
              }}
              onViewDetails={(u) => {
                setSelectedUser(u);
                setView('details');
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

}
function RoleChip({
  icon: Icon,
  label,
  count,
  tone
}: {icon: ComponentType<{className?: string;}>;label: string;count: number;tone: 'orange' | 'amber' | 'slate' | 'indigo';}) {
  const styles = {
    orange: 'bg-accent border-primary/30 text-accent-foreground',
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
    <div className="inline-flex p-0.5 rounded-md bg-panel-bg border border-border">
      {options.map((o) =>
      <button
        key={o.v}
        onClick={() => onChange(o.v)}
        className={`px-2.5 h-8 rounded text-xs transition-colors ${value === o.v ? 'bg-white text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
        
          {o.l}
        </button>
      )}
    </div>);

}
