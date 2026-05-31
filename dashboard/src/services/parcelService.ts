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
  ratePerParcel: number
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
    .select('*, riders(name, mkb_id, zones(name))')
    .eq('cutoff_start', cutoffFrom)
    .eq('cutoff_end', cutoffTo)
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
