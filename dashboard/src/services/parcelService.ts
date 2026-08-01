import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/apiService';
import { PayrollStatus } from '../types/payroll';
import { dispatchNotificationSafe } from './notificationService';

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

// Save finalized payroll record for a rider (defaults status to draft)
export const savePayrollRecord = async (
  riderId: string,
  cutoffFrom: string,
  cutoffTo: string,
  totalParcels: number,
  ratePerParcel: number,
  grossPay?: number
): Promise<void> => {
  const finalGross = grossPay ?? (totalParcels * ratePerParcel);

  const { error } = await supabase
    .from('payroll_records')
    .upsert(
      {
        rider_id: riderId,
        cutoff_start: cutoffFrom,
        cutoff_end: cutoffTo,
        total_parcels: totalParcels,
        rate_per_parcel: ratePerParcel,
        gross_pay: finalGross,
        status: PayrollStatus.DRAFT,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rider_id,cutoff_start' }
    );

  if (error) throw error;

  // Retrieve rider details to create a descriptive activity log
  try {
    const { data: rider } = await supabase
      .from('riders')
      .select('name')
      .eq('id', riderId)
      .single();

    const riderName = rider?.name || 'Rider';

    await logActivity({
      riderId,
      eventType: 'payroll_finalize',
      description: `Finalized payroll worksheet (Draft) for ${riderName} (${cutoffFrom} to ${cutoffTo}) - Net Pay: ₱${finalGross.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      metadata: {
        cutoff_start: cutoffFrom,
        cutoff_end: cutoffTo,
        total_parcels: totalParcels,
        gross_pay: finalGross,
        status: PayrollStatus.DRAFT
      }
    });
  } catch (logErr) {
    console.warn('Failed to log payroll finalize activity:', logErr);
  }
};

/**
 * Initializes draft payroll records for all active riders for a specific cutoff period.
 * Idempotent: Skips riders that already have a payroll record for the given cutoff.
 */
export const initializeCutoffPayrollForFleet = async (
  cutoffFrom: string,
  cutoffTo: string,
  userId?: string
): Promise<{ initializedCount: number; totalRiders: number }> => {
  // 1. Fetch all riders from database
  const { data: riders, error: riderErr } = await supabase
    .from('riders')
    .select('id, name');

  if (riderErr) throw riderErr;
  if (!riders || riders.length === 0) {
    return { initializedCount: 0, totalRiders: 0 };
  }

  // 2. Fetch existing payroll records for this cutoff period
  const { data: existingRecords, error: recordErr } = await supabase
    .from('payroll_records')
    .select('rider_id')
    .eq('cutoff_start', cutoffFrom);

  if (recordErr) throw recordErr;

  const existingRiderIds = new Set((existingRecords || []).map(r => r.rider_id));

  // 3. Filter riders missing payroll records
  const missingRiders = riders.filter(r => !existingRiderIds.has(r.id));

  if (missingRiders.length === 0) {
    return { initializedCount: 0, totalRiders: riders.length };
  }

  // 4. Batch insert missing draft payroll records
  const newRecords = missingRiders.map(r => ({
    rider_id: r.id,
    cutoff_start: cutoffFrom,
    cutoff_end: cutoffTo,
    total_parcels: 0,
    rate_per_parcel: 10,
    gross_pay: 0,
    status: PayrollStatus.DRAFT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    submitted_by: userId || null
  }));

  const { error: insertErr } = await supabase
    .from('payroll_records')
    .upsert(newRecords, { onConflict: 'rider_id,cutoff_start' });

  if (insertErr) throw insertErr;

  return {
    initializedCount: missingRiders.length,
    totalRiders: riders.length
  };
};

/**
 * Deletes unedited draft payroll records (0 parcels and status 'draft') for a specific cutoff period.
 * Preserves any records that have parcels logged or status updated (submitted/approved/paid).
 */
export const resetDraftPayrollForCutoff = async (
  cutoffFrom: string
): Promise<number> => {
  const { data, error } = await supabase
    .from('payroll_records')
    .delete()
    .eq('cutoff_start', cutoffFrom)
    .eq('status', PayrollStatus.DRAFT)
    .eq('total_parcels', 0)
    .select('id');

  if (error) throw error;
  return data ? data.length : 0;
};

/**
 * Deletes a single payroll record by ID.
 */
export const deletePayrollRecord = async (id: string): Promise<void> => {
  const { data, error } = await supabase
    .from('payroll_records')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('Record could not be deleted or does not exist.');
  }
};

/**
 * Bulk deletes payroll records by IDs.
 */
export const deleteBulkPayrollRecords = async (ids: string[]): Promise<number> => {
  if (!ids || ids.length === 0) return 0;
  const { data, error } = await supabase
    .from('payroll_records')
    .delete()
    .in('id', ids)
    .select('id');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No records were deleted. Permission denied or records not found.');
  }
  return data.length;
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
  status: PayrollStatus | 'draft' | 'pending' | 'approved' | 'paid' | 'flagged' | 'rejected' | 'draft',
  auditData?: {
    userId: string;
    rejectionReason?: string;
  }
): Promise<void> => {
  const normStatus = status as PayrollStatus;
  const updatePayload: any = { status: normStatus, updated_at: new Date().toISOString() };
  if (auditData) {
    const { userId, rejectionReason } = auditData;
    if (normStatus === PayrollStatus.PENDING) {
      updatePayload.submitted_by = userId;
      updatePayload.submitted_at = new Date().toISOString();
    } else if (normStatus === PayrollStatus.APPROVED) {
      updatePayload.approved_by = userId;
      updatePayload.approved_at = new Date().toISOString();
    } else if (normStatus === PayrollStatus.REJECTED) {
      updatePayload.rejected_by = userId;
      updatePayload.rejected_at = new Date().toISOString();
      updatePayload.rejection_reason = rejectionReason || null;
    } else if (normStatus === PayrollStatus.PAID) {
      updatePayload.paid_by = userId;
      updatePayload.paid_at = new Date().toISOString();
      updatePayload.processed_at = new Date().toISOString(); // for backward compatibility
    } else if (normStatus === PayrollStatus.DRAFT) {
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

  // 1. Fetch record info to log activity properly
  let riderName = 'Rider';
  let cutoffStart = '';
  let cutoffEnd = '';
  let grossPay = 0;
  try {
    const { data: record } = await supabase
      .from('payroll_records')
      .select('cutoff_start, cutoff_end, gross_pay, riders(name)')
      .eq('id', recordId)
      .single();

    if (record) {
      riderName = (record.riders as any)?.name || 'Rider';
      cutoffStart = record.cutoff_start;
      cutoffEnd = record.cutoff_end;
      grossPay = record.gross_pay || 0;
    }
  } catch (err) {
    console.warn('Failed to fetch payroll record for status logging:', err);
  }

  const { error } = await supabase
    .from('payroll_records')
    .update(updatePayload)
    .eq('id', recordId);

  if (error) throw error;

  // 2. Write appropriate transition activity log
  try {
    let eventType = 'payroll_status_update';
    let description = `Updated payroll status for ${riderName} (${cutoffStart} to ${cutoffEnd}) to ${normStatus}`;
    
    if (normStatus === PayrollStatus.PENDING) {
      eventType = 'payroll_submit';
      description = `Submitted payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) for approval - Net Pay: ₱${grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Status: Pending Review)`;
    } else if (normStatus === PayrollStatus.APPROVED) {
      eventType = 'payroll_approve';
      description = `Approved payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) - Net Pay: ₱${grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Status: Approved)`;
    } else if (normStatus === PayrollStatus.REJECTED) {
      eventType = 'payroll_reject';
      const reasonStr = auditData?.rejectionReason ? ` Reason: "${auditData.rejectionReason}"` : '';
      description = `Rejected payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}).${reasonStr} (Status: Rejected)`;
    } else if (normStatus === PayrollStatus.PAID) {
      eventType = 'payroll_pay';
      description = `Disbursed & Paid payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) - Net Pay: ₱${grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Status: Paid)`;
    } else if (normStatus === PayrollStatus.DRAFT) {
      eventType = 'payroll_return';
      description = `Returned payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) for revision (Status: Draft)`;
    }

    await logActivity({
      userId: auditData?.userId || null,
      eventType,
      description,
      metadata: {
        record_id: recordId,
        status: normStatus
      }
    });

    // Non-blocking notification dispatches for Payroll transitions
    const senderId = auditData?.userId || null;
    if (normStatus === PayrollStatus.PENDING) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'medium',
        type: 'system',
        title: 'Payroll Submitted for Review',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) was submitted for approval`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    } else if (normStatus === PayrollStatus.APPROVED) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'high',
        type: 'system',
        title: 'Payroll Approved',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) has been approved`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    } else if (normStatus === PayrollStatus.PAID) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'high',
        type: 'system',
        title: 'Payroll Disbursed & Paid',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) has been paid`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    } else if (normStatus === PayrollStatus.REJECTED) {
      void dispatchNotificationSafe({
        senderId,
        category: 'payroll',
        priority: 'high',
        type: 'system',
        title: 'Payroll Rejected',
        message: `Payroll for ${riderName} (${cutoffStart} to ${cutoffEnd}) was returned/rejected`,
        actionLink: '/payroll',
        targetRoles: ['payroll', 'admin']
      });
    }
  } catch (logErr) {
    console.warn('Failed to write payroll transition log:', logErr);
  }
};

// Bulk submit payroll records for approval (prevents resubmission of already pending/approved/paid)
export const bulkSubmitPayrollForApproval = async (
  recordIds: string[],
  userId: string
): Promise<void> => {
  if (recordIds.length === 0) return;

  // 1. Fetch current status of records to validate they are editable (draft or rejected)
  const { data: records, error: fetchError } = await supabase
    .from('payroll_records')
    .select('id, status, cutoff_start, cutoff_end, gross_pay, riders(name)')
    .in('id', recordIds);

  if (fetchError) throw fetchError;
  if (!records || records.length === 0) {
    throw new Error('No payroll records found for the selected IDs.');
  }

  // 2. Validate status to prevent resubmission
  const invalidRecords = records.filter(
    r => r.status !== PayrollStatus.DRAFT && r.status !== PayrollStatus.REJECTED
  );
  if (invalidRecords.length > 0) {
    throw new Error('Some selected records are already submitted, approved, or paid.');
  }

  // 3. Perform bulk update
  const { error: updateError } = await supabase
    .from('payroll_records')
    .update({
      status: PayrollStatus.PENDING,
      submitted_by: userId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', recordIds);

  if (updateError) throw updateError;

  // 4. Log activity for each record
  for (const rec of records) {
    const riderName = (rec.riders as any)?.name || 'Rider';
    await logActivity({
      userId,
      eventType: 'payroll_submit',
      description: `Submitted payroll for ${riderName} (${rec.cutoff_start} to ${rec.cutoff_end}) for approval - Net Pay: ₱${Number(rec.gross_pay || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Status: Pending Review)`,
      metadata: {
        record_id: rec.id,
        status: PayrollStatus.PENDING
      }
    });
  }
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
    daily_gross?: number;
    created_by: string;
  }[]
): Promise<void> => {
  const sanitizedLogs = logs.map(({ daily_gross: _daily_gross, ...rest }) => rest);
  const { error } = await supabase
    .from('parcel_logs')
    .upsert(sanitizedLogs, { onConflict: 'rider_id,date' });

  if (error) throw error;
};


