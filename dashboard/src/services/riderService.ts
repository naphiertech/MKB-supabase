import { supabase } from '../lib/supabaseClient';
import { dispatchNotificationSafe } from './notificationService';
import { logActivity } from '../lib/apiService';
import type { TrustedDeviceInfo } from '../components/users/DeviceResetModal';
import { getRiderWorkforceDirectory, type WorkforceScope } from './workforceDirectoryService';

export interface RiderPayrollRecord {
  id: string;
  cutoff_start: string;
  cutoff_end: string;
  total_parcels: number;
  rate_per_parcel: number | null;
  gross_pay: number | null;
  status: string;
  other_earnings?: number;
  fm_pickup_count?: number;
  deductions?: number;
  late_onhold?: number;
  late_remittance?: number;
  riders: {
    id: string;
    name: string;
    mkb_id: string;
    avatar_url: string | null;
    shift: string | null;
    zones: {
      name: string;
    } | null;
  } | null;
}

// Fetch payroll records for a rider
export const getRiderPayrollHistory = async (riderId: string): Promise<RiderPayrollRecord[]> => {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('*, riders(id, name, mkb_id, avatar_url, zones(name), shift)')
    .eq('rider_id', riderId)
    .order('cutoff_start', { ascending: false });

  if (error) throw error;
  return (data as unknown as RiderPayrollRecord[]) || [];
};

// Cache a rider's facial recognition descriptor
export const cacheRiderFaceDescriptor = async (riderId: string, descriptor: number[]): Promise<void> => {
  const { error } = await supabase
    .rpc('cache_rider_face_descriptor', {
      p_rider_id: riderId,
      p_descriptor: descriptor
    });

  if (error) throw error;

  // Non-blocking notification dispatch for face biometrics registration
  void dispatchNotificationSafe({
    category: 'biometrics',
    priority: 'medium',
    type: 'system',
    title: 'Face Biometrics Enrolled',
    message: `Rider facial biometric descriptor was registered/updated`,
    riderId,
    actionLink: '/users',
    targetRoles: ['hr', 'admin']
  });
};

// Fetch linked rider ID for active user profile
export const getRiderUserMapping = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('rider_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

// Fetch full profile info for a rider (User + Rider + Zone)
export const getRiderFullProfile = async (resolvedRiderId: string) => {
  const { data, error } = await supabase
    .from('riders')
    .select('*, zones(*)')
    .eq('id', resolvedRiderId)
    .maybeSingle();

  if (error) throw error;
  return data;
};

// Fetch rider dashboard real-time statistics
export const getRiderDashboardStats = async (
  resolvedRiderId: string,
  todayStr: string,
  firstDayStr: string,
  firstDayOfMonthStr: string
) => {
  const [attLogRes, violationRes, monthLogsRes, violationCountRes] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('*')
      .eq('rider_id', resolvedRiderId)
      .eq('date', todayStr)
      .maybeSingle(),
    supabase
      .from('violations')
      .select('*')
      .eq('rider_id', resolvedRiderId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('attendance_logs')
      .select('*')
      .eq('rider_id', resolvedRiderId)
      .gte('date', firstDayStr)
      .order('date', { ascending: false })
      .order('time_in', { ascending: false }),
    supabase
      .from('violations')
      .select('*', { count: 'exact', head: true })
      .eq('rider_id', resolvedRiderId)
      .gte('created_at', firstDayOfMonthStr)
  ]);

  if (attLogRes.error) throw attLogRes.error;
  if (violationRes.error) throw violationRes.error;
  if (monthLogsRes.error) throw monthLogsRes.error;
  if (violationCountRes.error) throw violationCountRes.error;

  return {
    todayAttendance: attLogRes.data,
    latestViolation: violationRes.data,
    monthAttendance: monthLogsRes.data || [],
    monthViolationCount: violationCountRes.count || 0
  };
};

// Fetch simplified list of riders with their zones ordered by name
export const getRidersLookup = async (options: { scope: WorkforceScope; date?: string }) =>
  getRiderWorkforceDirectory(options);

// Fetch violations for a specific rider within a month
export const getRiderViolationsForMonth = async (riderId: string, startOfMonthStr: string) => {
  const { data, error } = await supabase
    .from('violations')
    .select('*')
    .eq('rider_id', riderId)
    .gte('created_at', startOfMonthStr)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Update specific rider contact phone number
export const updateRiderContact = async (riderId: string, contactPhone: string) => {
  const { error } = await supabase
    .from('riders')
    .update({ contact: contactPhone })
    .eq('id', riderId);

  if (error) throw error;
};

/**
 * Fetch active trusted device details for a user.
 */
export const getUserTrustedDevice = async (userId: string): Promise<TrustedDeviceInfo | null> => {
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'trusted')
    .maybeSingle();

  if (error) {
    console.error('[riderService] Failed to fetch trusted device:', error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    deviceName: data.device_name,
    platform: data.platform,
    deviceUuid: data.device_uuid,
    registeredAt: data.registered_at,
    lastUsedAt: data.last_used_at,
    status: data.status as 'trusted' | 'revoked'
  };
};

/**
 * Reset/Revoke a user's active trusted device and log administrative audit trail.
 */
export const resetUserTrustedDevice = async (params: {
  userId: string;
  riderId?: string;
  adminUserId: string;
  riderName: string;
  reason: string;
  customReason?: string;
}): Promise<void> => {
  const activeDevice = await getUserTrustedDevice(params.userId);
  if (!activeDevice) return;

  // Revoke active device record
  const { error } = await supabase
    .from('user_devices')
    .update({ status: 'revoked' })
    .eq('id', activeDevice.id);

  if (error) throw error;

  const finalReason = params.reason === 'Other' && params.customReason ? params.customReason : params.reason;

  // Log administrative activity audit trail
  logActivity({
    userId: params.adminUserId,
    eventType: 'device_reset',
    description: `HR/Admin reset trusted device for ${params.riderName}. Reason: ${finalReason}`,
    metadata: {
      target_user_id: params.userId,
      target_rider_id: params.riderId || null,
      revoked_device_name: activeDevice.deviceName,
      revoked_device_uuid: activeDevice.deviceUuid,
      platform: activeDevice.platform,
      reason: finalReason,
      revoked_at: new Date().toISOString()
    }
  });

  // Dispatch system notification to Admin and HR
  void dispatchNotificationSafe({
    category: 'account',
    priority: 'high',
    type: 'system',
    title: 'Trusted Device Revoked',
    message: `Trusted device for ${params.riderName} (${activeDevice.deviceName}) was revoked by HR/Admin. Reason: ${finalReason}`,
    recipientId: params.userId,
    riderId: params.riderId,
    actionLink: '/users',
    targetRoles: ['hr', 'admin']
  });
};
