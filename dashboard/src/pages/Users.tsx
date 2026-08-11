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
import { type AppUser, type EmploymentStatus, type UserRole, type UserStatus, type Zone } from '../services/types';
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
  archiveEmployee,
  hasOpenAttendance,
  requestStaffPasswordReset,
  restoreEmployment,
  setUserSuspension,
} from '../services/adminUserService';
import { EmploymentLifecycleModal } from '../components/users/EmploymentLifecycleModal';
import type { ArchiveInput } from '../services/employmentLifecycle';
import { createSyncOperationId } from '../lib/storage';
import { recoveryRedirectUrl } from '../lib/authRecoveryRoute';
import {
  getUsersAndRiders,
  updateUserProfile,
  getUserRiderId,
  updateRiderProfile,
  createRiderProfile,
  deleteRiderProfile,
  createUserProfile,
  getStaffAvatarSignedUrl,
} from '../services/userService';
import { isStaffRole } from '../services/staffProfilePolicy';


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
  const [employmentFilter, setEmploymentFilter] = useState<'all' | EmploymentStatus>('active');
  const [view, setView] = useState<'list' | 'form' | 'details'>('list');
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [lifecycleTarget, setLifecycleTarget] = useState<AppUser | null>(null);
  const [lifecycleMode, setLifecycleMode] = useState<'archive' | 'restore'>('archive');
  const [lifecycleRequestId, setLifecycleRequestId] = useState('');
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [attendanceCheckBusy, setAttendanceCheckBusy] = useState(false);
  const [archiveBlockedByAttendance, setArchiveBlockedByAttendance] = useState(false);

  // Sync roleFilter for HR
  useEffect(() => {
    if (currentUserRole === 'hr') {
      setRoleFilter('rider');
    }
  }, [currentUserRole]);

  // Reset pagination on filter changes
  useEffect(() => {
    setPage(1);
  }, [q, roleFilter, statusFilter, employmentFilter, zoneFilter]);

  const loadData = async () => {
    try {
      const [zList, dbUsers] = await Promise.all([
        getZones(),
        getUsersAndRiders()
      ]);

      setZonesList(zList);

      if (dbUsers) {
        const nameById = new Map(dbUsers.map((user: { id: string; full_name: string }) => [user.id, user.full_name]));
        const mapped: AppUser[] = await Promise.all(dbUsers.map(async (u: {
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
          employment_status?: string | null;
          archive_effective_date?: string | null;
          archive_reason?: string | null;
          archive_remarks?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          restored_at?: string | null;
          restored_by?: string | null;
          restore_reason?: string | null;
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
            status?: string | null;
          } | null;
        }) => {
          let staffAvatar: string | null = null;
          if (isStaffRole(u.role as UserRole)) {
            try {
              staffAvatar = await getStaffAvatarSignedUrl(u.id);
            } catch (error) {
              console.warn(`Unable to load staff profile photo for ${u.id}:`, error);
            }
          }
          const userObj: AppUser = {
            id: u.id,
            name: u.full_name,
            avatar: u.role === 'rider' && u.riders?.face_image_url
              ? u.riders.face_image_url
              : staffAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(u.full_name)}`,
            email: u.email,
            role: u.role as UserRole,
            zoneId: u.riders?.zone_id || null,
            status: u.status as UserStatus,
            employmentStatus: (u.employment_status || 'active') as EmploymentStatus,
            operationalStatus: u.role === 'rider' ? (u.riders?.status as AppUser['operationalStatus']) : null,
            archiveEffectiveDate: u.archive_effective_date || null,
            archiveReason: u.archive_reason || null,
            archiveRemarks: u.archive_remarks || null,
            archivedAt: u.archived_at || null,
            archivedBy: u.archived_by || null,
            archivedByName: u.archived_by ? nameById.get(u.archived_by) || null : null,
            restoredAt: u.restored_at || null,
            restoredBy: u.restored_by || null,
            restoreReason: u.restore_reason || null,
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
        }));
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

  const activeWorkforce = userList.filter((user) => user.employmentStatus === 'active');
  const counts = {
    admin: activeWorkforce.filter((u) => u.role === 'admin').length,
    hr: activeWorkforce.filter((u) => u.role === 'hr').length,
    rider: activeWorkforce.filter((u) => u.role === 'rider').length,
    payroll: activeWorkforce.filter((u) => u.role === 'payroll').length,
    archived: userList.filter((u) => u.employmentStatus === 'archived').length,
  };

  const filtered = useMemo(
    () =>
    userList.filter((u) => {
      const matchesQ =
      !q ||
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      const matchesEmployment = employmentFilter === 'all' || u.employmentStatus === employmentFilter;

      const matchesZone = zoneFilter === 'all' || u.zoneId === zoneFilter;

      return matchesQ && matchesRole && matchesStatus && matchesEmployment && matchesZone;
    }),
    [q, roleFilter, statusFilter, employmentFilter, zoneFilter, userList]
  );

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(page, totalPages);
  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const handleExportExcel = async () => {
    try {
      const headers = ['Name', 'Email', 'Role', 'Employment', 'Account', 'Contact', 'Zone'];
      
      const rows = filtered.map(u => {
        const zoneName = zonesList.find(z => z.id === u.zoneId)?.name || '—';
        return [
          u.name || '',
          u.email || '',
          u.role || '',
          u.employmentStatus,
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

  const handleSendPasswordReset = async (target: AppUser) => {
    try {
      const redirectTo = recoveryRedirectUrl(window.location);
      await requestStaffPasswordReset({ id: target.id, email: target.email, name: target.name }, redirectTo);
      toast.success(`Recovery email sent to ${target.email}`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Password recovery email could not be sent.');
      throw error;
    }
  };

  const handleToggleSuspension = async (target: AppUser, suspended: boolean) => {
    try {
      await setUserSuspension(target.id, suspended);
      await loadData();
      toast.success(`${target.name} was ${suspended ? 'suspended' : 'reactivated'}.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : `Unable to ${suspended ? 'suspend' : 'reactivate'} this account.`);
      throw error;
    }
  };

  const openArchive = async (target: AppUser) => {
    setLifecycleTarget(target);
    setLifecycleMode('archive');
    setLifecycleRequestId(createSyncOperationId());
    setLifecycleError(null);
    setArchiveBlockedByAttendance(false);
    if (!target.riderId) return;
    setAttendanceCheckBusy(true);
    try {
      setArchiveBlockedByAttendance(await hasOpenAttendance(target.riderId));
    } catch (error: unknown) {
      setLifecycleError(error instanceof Error ? error.message : 'Unable to verify open attendance.');
      setArchiveBlockedByAttendance(true);
    } finally {
      setAttendanceCheckBusy(false);
    }
  };

  const openRestore = (target: AppUser) => {
    setLifecycleTarget(target);
    setLifecycleMode('restore');
    setLifecycleRequestId(createSyncOperationId());
    setLifecycleError(null);
    setArchiveBlockedByAttendance(false);
  };

  const closeLifecycleModal = () => {
    if (lifecycleBusy) return;
    setLifecycleTarget(null);
    setLifecycleError(null);
  };

  const submitArchive = async (input: ArchiveInput) => {
    if (!lifecycleTarget) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await archiveEmployee(lifecycleTarget.id, {
        reason: input.reason as Exclude<ArchiveInput['reason'], ''>,
        effectiveDate: input.effectiveDate,
        remarks: input.remarks,
        requestId: lifecycleRequestId,
      });
      toast.success(`${lifecycleTarget.name} was archived. Historical records were preserved.`);
      setLifecycleTarget(null);
      await loadData();
    } catch (error: unknown) {
      setLifecycleError(error instanceof Error ? error.message : 'Unable to archive this employee.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  const submitRestore = async (reason: string) => {
    if (!lifecycleTarget) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await restoreEmployment(lifecycleTarget.id, { reason, requestId: lifecycleRequestId });
      toast.success(`${lifecycleTarget.name}'s employment was restored. Account reactivation is still required.`);
      setLifecycleTarget(null);
      await loadData();
    } catch (error: unknown) {
      setLifecycleError(error instanceof Error ? error.message : 'Unable to restore this employment record.');
    } finally {
      setLifecycleBusy(false);
    }
  };

  return (
    <>
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
                {currentUserRole === 'hr' ? counts.rider : activeWorkforce.length}
              </div>
              <div className="text-sm text-muted-foreground">
                {currentUserRole === 'hr' ? 'active riders' : 'active employees'}
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
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-panel-bg focus:outline-none focus:ring-2 focus:ring-primary/15 sm:h-9 sm:px-3.5 sm:text-sm cursor-pointer"
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
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/25 sm:h-9 sm:px-3.5 sm:text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Rider
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-border rounded-xl p-3 flex flex-wrap gap-2 items-center shadow-sm">
            <div className="flex h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-md border border-border bg-panel-bg px-3 transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 sm:h-9 sm:basis-auto sm:min-w-[220px] sm:max-w-md">
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
              className="h-9 px-3 rounded-md bg-panel-bg border border-border text-xs text-foreground font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer shadow-sm"
            >
              <option value="all">All Zones ({zonesList.length})</option>
              {zonesList.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>

            <Segmented
              label="Filter by employment lifecycle"
              value={employmentFilter}
              onChange={(v) => setEmploymentFilter(v as typeof employmentFilter)}
              options={[
                { v: 'active', l: 'Employment: Active' },
                { v: 'archived', l: `Archived (${counts.archived})` },
                { v: 'all', l: 'All Employment' },
              ]}
            />

            <Segmented
              label="Filter by account status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              options={[
              {
                v: 'all',
                l: 'All Accounts'
              },
              {
                v: 'active',
                l: 'Account: Active'
              },
              {
                v: 'suspended',
                l: 'Account: Suspended'
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
              currentUserId={session?.id}
              currentUserRole={currentUserRole === 'admin' || currentUserRole === 'hr' ? currentUserRole : undefined}
              onSendPasswordReset={handleSendPasswordReset}
              onToggleSuspension={handleToggleSuspension}
              onArchive={openArchive}
              onRestore={openRestore}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
    <EmploymentLifecycleModal
      open={Boolean(lifecycleTarget)}
      mode={lifecycleMode}
      user={lifecycleTarget}
      today={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}
      checkingAttendance={attendanceCheckBusy}
      hasOpenAttendance={archiveBlockedByAttendance}
      busy={lifecycleBusy}
      error={lifecycleError}
      onClose={closeLifecycleModal}
      onArchive={submitArchive}
      onRestore={submitRestore}
    />
    </>
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
  label = 'Filter options',
  value,
  onChange,
  options
}: {label?: string;value: string;onChange: (v: string) => void;options: {v: string;l: string;}[];}) {
  return (
    <div className="table-scroll-region flex w-full rounded-md border border-border bg-panel-bg p-0.5 sm:inline-flex sm:w-auto" role="group" aria-label={label} tabIndex={0}>
      {options.map((o) =>
      <button
        key={o.v}
        type="button"
        onClick={() => onChange(o.v)}
        aria-pressed={value === o.v}
        className={`h-9 shrink-0 rounded px-2.5 text-xs transition-colors sm:h-8 ${value === o.v ? 'bg-white text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
        
          {o.l}
        </button>
      )}
    </div>);

}
