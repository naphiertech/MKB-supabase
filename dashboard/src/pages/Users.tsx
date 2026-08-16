import { useCallback, useMemo, useState, useEffect, useRef, ComponentType } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Search,
  Shield,
  Users as UsersIcon,
  Bike,
  Wallet,
  Download,
  Filter,
  ChevronDown,
  RotateCcw,
  X,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { type AppUser, type EmploymentStatus, type UserRole, type UserStatus, type Zone } from '../services/types';
import { logActivity } from '../lib/apiService';
import { getZones, getZonesForHubs } from '../services/geofenceService';
import { UsersTable } from '../components/users/UsersTable';
import { UserForm } from '../components/users/UserForm';
import { EmployeeDetails } from '../components/users/EmployeeDetails';
import { useAuth } from '../hooks/useAuth';
import { clearCachedAvatar } from '../lib/avatarCache';
import { exportXLSXFile } from '../lib/exports/excelHelper';
import { buildExportFilename } from '../lib/exports/exportUtils';
import { toast } from 'react-hot-toast';
import {
  archiveEmployee,
  hasOpenAttendance,
  requestStaffPasswordReset,
  restoreEmployment,
  setUserAccountAccess,
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
import { setUserHubAccess } from '../services/hubService';
import { useHub } from '../context/HubContext';


type EditableRole = 'admin' | 'hr' | 'rider' | 'payroll';

interface UsersProps {
  onlineUserIds: string[];
  onManageAssignment?: (riderId: string) => void;
}

export function Users({ onlineUserIds = [], onManageAssignment }: UsersProps) {
  const { session } = useAuth();
  const { hubs, workspaceKey } = useHub();
  const currentUserRole = session?.role;

  const [userList, setUserList] = useState<AppUser[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [riderFormZones, setRiderFormZones] = useState<Zone[]>([]);
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

  const [showFiltersPopover, setShowFiltersPopover] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);

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

  // Dismiss popover on outside click or Escape key
  useEffect(() => {
    if (!showFiltersPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setShowFiltersPopover(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowFiltersPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFiltersPopover]);

  const loadData = useCallback(async () => {
    try {
      const workspaceZonesPromise = getZones();
      const authorizedZonesPromise = workspaceKey === 'all'
        ? workspaceZonesPromise
        : getZonesForHubs(hubs.filter((hub) => hub.active).map((hub) => hub.id));
      const [zList, authorizedZones, dbUsers] = await Promise.all([
        workspaceZonesPromise,
        authorizedZonesPromise,
        getUsersAndRiders()
      ]);

      setZonesList(zList);
      setRiderFormZones(authorizedZones);

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
          hub_access_scope?: 'global' | 'assigned';
          user_hub_access?: { hub_id: string }[];
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
            hub_id?: string | null;
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
            hubId: u.riders?.hub_id || null,
            hubAccessScope: u.hub_access_scope || 'assigned',
            authorizedHubIds: u.user_hub_access?.map((access) => access.hub_id) || [],
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
  }, [hubs, workspaceKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeWorkforce = userList.filter((user) => user.employmentStatus === 'active');
  const counts = {
    admin: activeWorkforce.filter((u) => u.role === 'admin').length,
    hr: activeWorkforce.filter((u) => u.role === 'hr').length,
    rider: activeWorkforce.filter((u) => u.role === 'rider').length,
    payroll: activeWorkforce.filter((u) => u.role === 'payroll').length,
    archived: userList.filter((u) => u.employmentStatus === 'archived').length,
  };

  const groupedZones = useMemo(() => {
    if (workspaceKey !== 'all' || hubs.length <= 1) {
      return { isGrouped: false, list: zonesList, groups: [] };
    }
    const activeHubIds = new Set(hubs.map((h) => h.id));
    const groups: { hubName: string; zones: Zone[] }[] = [];

    hubs.forEach((hub) => {
      const hubZones = zonesList.filter((z) => z.hubId === hub.id);
      if (hubZones.length > 0) {
        groups.push({ hubName: hub.name, zones: hubZones });
      }
    });

    const unassigned = zonesList.filter((z) => !z.hubId || !activeHubIds.has(z.hubId));
    if (unassigned.length > 0) {
      groups.push({ hubName: 'Other / Unassigned', zones: unassigned });
    }

    return { isGrouped: true, list: zonesList, groups };
  }, [zonesList, hubs, workspaceKey]);

  const activeExtraFiltersCount = useMemo(() => {
    let count = 0;
    if (employmentFilter !== 'active') count++;
    if (statusFilter !== 'all') count++;
    return count;
  }, [employmentFilter, statusFilter]);

  const isAnyFilterActive = useMemo(() => {
    return Boolean(
      q.trim() ||
      (currentUserRole !== 'hr' && roleFilter !== 'all') ||
      zoneFilter !== 'all' ||
      employmentFilter !== 'active' ||
      statusFilter !== 'all'
    );
  }, [q, roleFilter, zoneFilter, employmentFilter, statusFilter, currentUserRole]);

  const handleResetFilters = () => {
    setQ('');
    if (currentUserRole !== 'hr') setRoleFilter('all');
    setZoneFilter('all');
    setEmploymentFilter('active');
    setStatusFilter('all');
    setPage(1);
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
        buildExportFilename({ prefix: 'employee_registry', extension: 'xlsx' }).replace(/\.xlsx$/, ''),
        'employeeRegistry'
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
      await setUserAccountAccess(target.id, target.role, suspended);
      await loadData();
      const verb = target.role === 'rider'
        ? suspended ? 'restricted' : 'restored to full access'
        : suspended ? 'suspended' : 'reactivated';
      toast.success(`${target.name} was ${verb}.`);
    } catch (error: unknown) {
      const action = target.role === 'rider'
        ? suspended ? 'restrict' : 'restore full access to'
        : suspended ? 'suspend' : 'reactivate';
      toast.error(error instanceof Error ? error.message : `Unable to ${action} this account.`);
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
      toast.success(`${lifecycleTarget.name}'s employment was restored. Full account access must still be restored separately.`);
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
            zones={riderFormZones}
            hubs={hubs}
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
                      hubId: savedUser.hubId,
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
                } else if (currentUserRole === 'admin') {
                  await setUserHubAccess(savedUser.id, savedUser.hubAccessScope || 'assigned', savedUser.authorizedHubIds || []);
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
                      hubId: savedUser.hubId,
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
                    notes: savedUser.notes,
                    hubAccessScope: savedUser.hubAccessScope
                  });

                  if (savedUser.role !== 'rider' && currentUserRole === 'admin') {
                    await setUserHubAccess(authUser.id, savedUser.hubAccessScope || 'assigned', savedUser.authorizedHubIds || []);
                  }

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
            onManageAssignment={onManageAssignment}
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
          className="dashboard-page space-y-5"
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
                Export XLSX
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

          {/* Compact Filter Toolbar */}
          <div className="ui-toolbar p-3">
            <div className="flex flex-col flex-wrap items-stretch gap-2.5 sm:flex-row sm:items-center lg:flex-nowrap">
              {/* Search Input */}
              <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-panel-bg px-3 transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={currentUserRole === 'hr' ? "Search riders by name or email…" : "Search by name or email…"}
                  className="bg-transparent outline-none text-xs sm:text-sm text-foreground placeholder:text-subtle-text flex-1 min-w-0"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ('')}
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
                {/* Role Select Dropdown */}
                {currentUserRole !== 'hr' && (
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                    aria-label="Filter by role"
                    className="ui-control h-9 w-full px-3 text-xs font-medium sm:w-36"
                  >
                    <option value="all">All Roles</option>
                    <option value="admin">Admin ({counts.admin})</option>
                    <option value="hr">HR ({counts.hr})</option>
                    <option value="rider">Rider ({counts.rider})</option>
                    <option value="payroll">Payroll ({counts.payroll})</option>
                  </select>
                )}

                {/* Hub-Aware Zone Dropdown */}
                <select
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  aria-label="Filter by zone"
                  className="ui-control h-9 w-full truncate px-3 text-xs font-medium sm:w-64"
                >
                  <option value="all">All Zones ({zonesList.length})</option>
                  {groupedZones.isGrouped
                    ? groupedZones.groups.map((group) => (
                        <optgroup key={group.hubName} label={group.hubName}>
                          {group.zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : groupedZones.list.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                </select>

                {/* More Filters Popover Button & Container */}
                <div className="relative" ref={filtersRef}>
                  <button
                    type="button"
                    onClick={() => setShowFiltersPopover((prev) => !prev)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors cursor-pointer ${
                      activeExtraFiltersCount > 0 || showFiltersPopover
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-border bg-panel-bg text-foreground hover:bg-panel-bg/80'
                    }`}
                    aria-expanded={showFiltersPopover}
                    aria-label="More filters"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>Filters</span>
                    {activeExtraFiltersCount > 0 && (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-white">
                        {activeExtraFiltersCount}
                      </span>
                    )}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showFiltersPopover ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Popover Card */}
                  <AnimatePresence>
                    {showFiltersPopover && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-white p-4 shadow-lg"
                      >
                        <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5 text-primary" /> Filter Options
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowFiltersPopover(false)}
                            className="rounded p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                            aria-label="Close filter popover"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-3.5">
                          {/* Employment Status Filter */}
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                              Employment Lifecycle
                            </label>
                            <select
                              value={employmentFilter}
                              onChange={(e) => setEmploymentFilter(e.target.value as typeof employmentFilter)}
                              aria-label="Filter by employment lifecycle"
                              className="w-full h-8 px-2.5 rounded-md bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary cursor-pointer"
                            >
                              <option value="active">Employment: Active</option>
                              <option value="archived">Archived ({counts.archived})</option>
                              <option value="all">All Employment</option>
                            </select>
                          </div>

                          {/* Account Access Filter */}
                          <div>
                            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                              Account Status
                            </label>
                            <select
                              value={statusFilter}
                              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                              aria-label="Filter by account status"
                              className="w-full h-8 px-2.5 rounded-md bg-panel-bg border border-border text-xs font-medium text-foreground outline-none focus:border-primary cursor-pointer"
                            >
                              <option value="all">All Accounts</option>
                              <option value="active">Account: Active</option>
                              <option value="suspended">Account: Restricted / Suspended</option>
                            </select>
                          </div>

                          {/* Popover Footer Reset */}
                          <div className="pt-2 border-t border-border flex items-center justify-between">
                            <button
                              type="button"
                              onClick={handleResetFilters}
                              disabled={!isAnyFilterActive}
                              className="text-xs text-muted-foreground hover:text-primary disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <RotateCcw className="w-3 h-3" /> Reset all
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowFiltersPopover(false)}
                              className="px-3 py-1 rounded bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors cursor-pointer"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Toolbar Reset Button (when any filter is active) */}
                {isAnyFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    title="Reset filters to default"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}

                {/* Results Count Badge */}
                <div className="ml-auto text-xs text-muted-foreground font-mono px-1 shrink-0">
                  {filtered.length} shown
                </div>
              </div>
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

