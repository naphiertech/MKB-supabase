import { supabase } from '../lib/supabaseClient';

export interface ParcelLog {
  id: string;
  riderId: string;
  date: string;
  parcels: number;
  rate: number;
  dailyGross: number;
}

export interface ParcelSummary {
  totalParcels: number;
  grossPay: number;
  rate: number;
  days: ParcelLog[];
}

// Get all parcel logs for a rider within a cutoff period
export const getParcelLogs = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<ParcelLog[]> => {
  const { data, error } = await supabase
    .from('parcel_logs')
    .select('*')
    .eq('rider_id', riderId)
    .gte('date', cutoffFrom)
    .lte('date', cutoffTo)
    .order('date', { ascending: true });

  if (error) throw error;

  return (data ?? []).map(row => ({
    id: row.id,
    riderId: row.rider_id,
    date: row.date,
    parcels: row.parcels,
    rate: parseFloat(row.rate),
    dailyGross: parseFloat(row.daily_gross),
  }));
};

// Upsert a single day parcel entry
// Updates if exists, inserts if not
export const upsertParcelLog = async (
  riderId: string,
  date: string,
  parcels: number,
  rate: number,
  createdBy: string
): Promise<void> => {
  const { error } = await supabase
    .from('parcel_logs')
    .upsert(
      {
        rider_id: riderId,
        date,
        parcels,
        rate,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rider_id,date' }
    );

  if (error) throw error;
};

// Compute summary from logs
export const computeParcelSummary = (
  logs: ParcelLog[],
  rate: number
): ParcelSummary => {
  const totalParcels = logs.reduce((sum, l) => sum + l.parcels, 0);
  return {
    totalParcels,
    grossPay: totalParcels * rate,
    rate,
    days: logs,
  };
};

// Save finalized payroll record for a rider
export const savePayrollRecord = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string,
  totalParcels: number,
  ratePerParcel: number,
  grossPay?: number
): Promise<void> => {
  const { error } = await supabase
    .from('payroll_records')
    .upsert(
      {
        rider_id: riderId,
        cutoff_start: cutoffFrom,
        cutoff_end: cutoffTo,
        total_parcels: totalParcels,
        rate_per_parcel: ratePerParcel,
        gross_pay: grossPay ?? (totalParcels * ratePerParcel),
        status: 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rider_id,cutoff_start,cutoff_end' }
    );

  if (error) throw error;
};

// Get all payroll records for dashboard
export const getPayrollRecords = async (
  cutoffFrom: string,
  cutoffTo: string
) => {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('*, riders(id, name, mkb_id, avatar_url, zone_id, notes, zones(name))')
    .gte('cutoff_start', cutoffFrom)
    .lte('cutoff_start', cutoffTo)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

// Get parcel logs for a rider for their own view
export const getMyParcelLogs = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<ParcelLog[]> => {
  return getParcelLogs(riderId, cutoffFrom, cutoffTo);
};

export interface PayrollMetrics {
  presentDays: number;
  lateDays: number;
  violationsCount: number;
  attendanceLogs: {
    date: string;
    time_in: string | null;
    time_out: string | null;
    status: string;
  }[];
  violations: {
    created_at: string;
    type: string;
    zone_name: string | null;
  }[];
}

// Get attendance and violation counts/logs for a rider within a cutoff period
export const getRiderPayrollMetrics = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string
): Promise<PayrollMetrics> => {
  const { data: attendance, error: attError } = await supabase
    .from('attendance_logs')
    .select('date, time_in, time_out, status')
    .eq('rider_id', riderId)
    .gte('date', cutoffFrom)
    .lte('date', cutoffTo);

  if (attError) throw attError;

  // Query violations for this rider in the cutoff range
  const startIso = `${cutoffFrom}T00:00:00.000Z`;
  const endIso = `${cutoffTo}T23:59:59.999Z`;
  const { data: violations, error: violError } = await supabase
    .from('violations')
    .select('created_at, type, zone_name')
    .eq('rider_id', riderId)
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (violError) throw violError;

  const presentDays = (attendance ?? []).filter(a => a.status === 'present' || a.status === 'late').length;
  const lateDays = (attendance ?? []).filter(a => a.status === 'late').length;
  const violationsCount = (violations ?? []).filter(v => v.type === 'boundary_exit' || v.type === 'idle_excess').length;

  return {
    presentDays,
    lateDays,
    violationsCount,
    attendanceLogs: attendance ?? [],
    violations: violations ?? []
  };
};

// Update payroll record status
export const updatePayrollRecordStatus = async (
  recordId: string,
  status: 'pending' | 'approved' | 'paid' | 'flagged'
): Promise<void> => {
  const { error } = await supabase
    .from('payroll_records')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', recordId);

  if (error) throw error;
};

// Fetch parcel logs in date range for all riders
export const getParcelLogsSummary = async (from: string, to: string) => {
  const { data, error } = await supabase
    .from('parcel_logs')
    .select('parcels, daily_gross, date, rider_id, riders(id, name, zone_id)')
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;
  return data || [];
};

// Fetch payroll records status summaries in date range
export const getPayrollRecordsSummary = async (from: string, to: string) => {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('rider_id, status')
    .gte('cutoff_start', from)
    .lte('cutoff_start', to);

  if (error) throw error;
  return data || [];
};

// Fetch dynamic filtered parcel logs details with linked rider & zone profiles
export const getParcelLogsDetails = async (
  from: string,
  to: string,
  filters?: {
    riderId?: string;
    riderIds?: string[];
  }
) => {
  let query = supabase
    .from('parcel_logs')
    .select('*, riders(name, mkb_id, zones(name))')
    .gte('date', from)
    .lte('date', to);

  if (filters?.riderId) {
    query = query.eq('rider_id', filters.riderId);
  } else if (filters?.riderIds && filters.riderIds.length > 0) {
    query = query.in('rider_id', filters.riderIds);
  }

  const { data, error } = await query.order('date', { ascending: true });
  if (error) throw error;
  return data || [];
};

