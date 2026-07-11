import { supabase } from '../lib/supabaseClient';

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
      .gte('date', firstDayStr),
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
export const getRidersLookup = async () => {
  const { data, error } = await supabase
    .from('riders')
    .select('id, name, mkb_id, zones(name)')
    .order('name');

  if (error) throw error;
  return data || [];
};

