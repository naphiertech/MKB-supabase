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

export interface PaginatedPayrollParams {
  cutoffFrom: string;
  cutoffTo: string;
  page: number; // 1-indexed
  pageSize: number;
  search?: string;
  statusFilter?: string;
  zoneFilter?: string;
  sortBy?: 'riderName' | 'total_parcels' | 'gross_pay' | 'net_pay' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedPayrollResult {
  records: any[];
  totalCount: number;
}

// Get paginated, searched, filtered, and sorted payroll records for dashboard
export const getPaginatedPayrollRecords = async (params: PaginatedPayrollParams): Promise<PaginatedPayrollResult> => {
  const {
    cutoffFrom,
    cutoffTo,
    page,
    pageSize,
    search,
    statusFilter,
    zoneFilter,
    sortBy = 'riderName',
    sortOrder = 'asc'
  } = params;

  // 1. Build base query with exact count
  // We use riders!inner to allow filtering on relation attributes (name, mkb_id, zone_id)
  let query = supabase
    .from('payroll_records')
    .select(`
      *,
      riders!inner(id, name, mkb_id, avatar_url, zone_id, notes, zones(name)),
      submitted_user:users!payroll_records_submitted_by_fkey(full_name),
      approved_user:users!payroll_records_approved_by_fkey(full_name),
      rejected_user:users!payroll_records_rejected_by_fkey(full_name),
      paid_user:users!payroll_records_paid_by_fkey(full_name)
    `, { count: 'exact' })
    .gte('cutoff_start', cutoffFrom)
    .lte('cutoff_start', cutoffTo);

  // 2. Filter by status
  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter.toLowerCase());
  }

  // 3. Filter by zone
  if (zoneFilter && zoneFilter !== 'all') {
    query = query.eq('riders.zone_id', zoneFilter);
  }

  // 4. Search by Rider Name or MKB ID or Zone Name
  if (search && search.trim() !== '') {
    const s = search.trim();
    let matchingZoneIds: string[] = [];
    try {
      const { data: zonesData } = await supabase
        .from('zones')
        .select('id')
        .ilike('name', `%${s}%`);
      if (zonesData && zonesData.length > 0) {
        matchingZoneIds = zonesData.map(z => z.id);
      }
    } catch (e) {
      console.error('Failed to lookup matching zones:', e);
    }

    let orCondition = `name.ilike.%${s}%,mkb_id.ilike.%${s}%`;
    if (matchingZoneIds.length > 0) {
      const zoneInString = matchingZoneIds.map(id => `"${id}"`).join(',');
      orCondition += `,zone_id.in.(${zoneInString})`;
    }
    
    query = query.or(orCondition, { foreignTable: 'riders' });
  }

  // 5. Sorting
  if (sortBy === 'riderName') {
    query = query.order('name', { foreignTable: 'riders', ascending: sortOrder === 'asc' });
  } else if (sortBy === 'total_parcels') {
    query = query.order('total_parcels', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'gross_pay') {
    query = query.order('gross_pay', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'status') {
    query = query.order('status', { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'net_pay') {
    // Database does not store net_pay, fallback to gross_pay ordering
    query = query.order('gross_pay', { ascending: sortOrder === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // 6. Pagination range
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  query = query.range(start, end);

  const { data, count, error } = await query;
  if (error) throw error;

  return {
    records: data ?? [],
    totalCount: count ?? 0
  };
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
  status: 'pending' | 'approved' | 'paid' | 'flagged' | 'rejected' | 'draft',
  auditData?: {
    userId: string;
    rejectionReason?: string;
  }
): Promise<void> => {
  const updatePayload: any = { status, updated_at: new Date().toISOString() };
  if (auditData) {
    const { userId, rejectionReason } = auditData;
    if (status === 'pending') {
      updatePayload.submitted_by = userId;
      updatePayload.submitted_at = new Date().toISOString();
    } else if (status === 'approved') {
      updatePayload.approved_by = userId;
      updatePayload.approved_at = new Date().toISOString();
    } else if (status === 'rejected') {
      updatePayload.rejected_by = userId;
      updatePayload.rejected_at = new Date().toISOString();
      updatePayload.rejection_reason = rejectionReason || null;
    } else if (status === 'paid') {
      updatePayload.paid_by = userId;
      updatePayload.paid_at = new Date().toISOString();
      updatePayload.processed_at = new Date().toISOString(); // for backward compatibility
    } else if (status === 'draft') {
      // Returned for revision
      updatePayload.approved_by = null;
      updatePayload.approved_at = null;
      updatePayload.rejected_by = null;
      updatePayload.rejected_at = null;
      updatePayload.rejection_reason = null;
      updatePayload.paid_by = null;
      updatePayload.paid_at = null;
    }
  }

  const { error } = await supabase
    .from('payroll_records')
    .update(updatePayload)
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

// Bulk upsert daily parcel logs for multiple riders
export const bulkUpsertParcelLogs = async (
  logs: {
    rider_id: string;
    date: string;
    parcels: number;
    rate: number;
    daily_gross: number;
    created_by: string;
  }[]
): Promise<void> => {
  const { error } = await supabase
    .from('parcel_logs')
    .upsert(logs, { onConflict: 'rider_id,date' });

  if (error) throw error;
};


