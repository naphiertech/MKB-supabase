import { supabase } from '../lib/supabaseClient';
import { logActivity } from '../lib/apiService';
import { getLocalDateString } from './attendanceService';

export interface DailyParcelRow {
  riderId: string;
  riderName: string;
  riderMkbId: string;
  riderAvatar: string;
  zoneId: string;
  zoneName: string;
  attendanceStatus: 'present' | 'late' | 'absent' | 'on_leave' | 'none';
  timeIn: string | null;
  rawTimeIn?: string | null;
  timeOut?: string | null;
  hours?: number;
  deliveredParcels: number;
  assignedParcels?: number;
  failedDeliveries?: number;
  returnedParcels?: number;
  notes?: string;
  recordedBy?: string;
  recordedByName?: string;
  recordedByDetail?: string;
  verifiedBy?: string;
  submissionStatus?: 'draft' | 'saved' | 'completed';
  lastUpdated?: string | null;
  parcelLogId?: string | null;
  isModified?: boolean;
}

export interface ParcelHistoryItem {
  id: string;
  riderId: string;
  riderName: string;
  riderMkbId: string;
  riderAvatar: string;
  zoneId: string;
  zoneName: string;
  date: string;
  deliveredParcels: number;
  grossWagePreview: number;
  payrollCutoff: string;
  assignedParcels?: number;
  failedDeliveries?: number;
  returnedParcels?: number;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdByDetail?: string;
  createdAt: string;
  updatedAt: string;
  attendanceStatus?: 'present' | 'late' | 'absent' | 'on_leave' | 'none';
  timeIn?: string | null;
}

export interface ParcelHistoryFilter {
  dateFrom?: string;
  dateTo?: string;
  riderId?: string;
  zoneId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SaveParcelEntryPayload {
  riderId: string;
  date: string;
  parcels: number;
  notes?: string;
  assignedParcels?: number;
  failedDeliveries?: number;
  returnedParcels?: number;
}

function formatTimeString(rawTime: string | null | undefined, fallbackTime: string | null | undefined): string | null {
  if (rawTime) {
    const d = new Date(rawTime);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
  }
  if (fallbackTime) {
    if (/^\d{1,2}:\d{2}$/.test(fallbackTime)) {
      const [hStr, mStr] = fallbackTime.split(':');
      let h = parseInt(hStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${mStr} ${ampm}`;
    }
    return fallbackTime;
  }
  return null;
}

/**
 * Converts raw user identifiers into clean, human-readable operator names & details.
 * Prevents raw UUIDs or implementation strings from ever leaking into the UI.
 */
export function formatRecorderIdentity(
  rawCreatedBy: string | null | undefined,
  userMap?: Record<string, { full_name?: string; email?: string; role?: string }>
): { name: string; detail: string } {
  if (!rawCreatedBy || rawCreatedBy === 'System' || rawCreatedBy === 'null' || rawCreatedBy === 'undefined') {
    return { name: 'Operations Staff', detail: 'HR Operations' };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(rawCreatedBy)) {
    const userInfo = userMap ? userMap[rawCreatedBy] : undefined;
    if (userInfo?.full_name) {
      return {
        name: userInfo.full_name,
        detail: userInfo.role ? `${userInfo.role.toUpperCase()} • ${userInfo.email || ''}` : (userInfo.email || 'Operations')
      };
    }
    return { name: 'Operations Staff', detail: 'HR Supervisor' };
  }

  if (rawCreatedBy.includes('@')) {
    const local = rawCreatedBy.split('@')[0];
    const formattedName = local
      .split(/[._-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return {
      name: formattedName || local,
      detail: `${rawCreatedBy}`
    };
  }

  return { name: rawCreatedBy, detail: 'HR Operations' };
}

/**
 * Computes standard payroll cutoff label from any date string (1st-15th or 16th-EOM)
 */
function getCutoffLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();

    if (day <= 15) {
      return `${month} 1–15, ${year}`;
    } else {
      const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
      return `${month} 16–${lastDay}, ${year}`;
    }
  } catch {
    return dateStr;
  }
}

export interface DailyParcelEntriesResponse {
  rows: DailyParcelRow[];
  absentRows: DailyParcelRow[];
  totalEligibleCount: number;
  encodedCount: number;
  absentCount: number;
}

/**
 * Retrieves daily parcel entries for the Operations module:
 * 1. Eligible Encoding Queue (rows): Present/Late riders for the date without a parcel_log.
 * 2. Absent / Off-Duty Riders (absentRows): Absent or On Leave riders for full operational monitoring.
 * Strictly operational - contains zero financial or wage calculations.
 */
export async function getDailyParcelEntries(params: {
  date?: string;
  zoneId?: string;
  search?: string;
  status?: string;
  includeEncoded?: boolean;
}): Promise<DailyParcelEntriesResponse> {
  const targetDate = params.date || getLocalDateString();

  // 1. Fetch active riders
  let ridersQuery = supabase
    .from('riders')
    .select('id, name, mkb_id, avatar_url, face_image_url, zone_id, status, zones(name)');

  if (params.zoneId && params.zoneId !== 'all') {
    ridersQuery = ridersQuery.eq('zone_id', params.zoneId);
  }

  const { data: ridersData, error: ridersError } = await ridersQuery;
  if (ridersError) {
    console.error('Error fetching riders for daily parcel entry:', ridersError);
    throw ridersError;
  }

  const riderList = (ridersData || []) as unknown as Array<{
    id: string;
    name: string;
    mkb_id: string;
    avatar_url: string | null;
    face_image_url: string | null;
    zone_id: string | null;
    status: string;
    zones?: { name: string } | null;
  }>;

  // 2. Fetch attendance summary for target date
  let attQuery = supabase
    .from('v_attendance_summary')
    .select('id, rider_id, rider_name, rider_avatar, rider_code, zone_id, zone_name, date, time_in, raw_time_in, time_out, raw_time_out, hours, log_status, hr_status')
    .eq('date', targetDate);

  if (params.zoneId && params.zoneId !== 'all') {
    attQuery = attQuery.eq('zone_id', params.zoneId);
  }

  const { data: attData, error: attError } = await attQuery;
  if (attError) {
    console.error('Error fetching attendance summary for daily parcel entry:', attError);
    throw attError;
  }

  const attLogs = (attData as unknown as Array<{
    id: string;
    rider_id: string;
    rider_name: string | null;
    rider_avatar: string | null;
    rider_code: string | null;
    zone_id: string | null;
    zone_name: string | null;
    date: string;
    time_in: string | null;
    time_out: string | null;
    raw_time_in: string | null;
    raw_time_out: string | null;
    hours: number | null;
    log_status: string | null;
    hr_status: string | null;
  }>) || [];

  // 3. Fetch existing parcel logs for target date
  const { data: parcelLogsData, error: parcelError } = await supabase
    .from('parcel_logs')
    .select('id, rider_id, date, parcels, assigned_parcels, failed_parcels, returned_parcels, notes, created_by, updated_at, rate, daily_gross')
    .eq('date', targetDate);

  if (parcelError) {
    console.error('Error fetching parcel logs for daily parcel entry:', parcelError);
    throw parcelError;
  }

  const parcelLogs = parcelLogsData || [];
  const encodedRiderMap = new Map(parcelLogs.map(p => [p.rider_id, p]));

  // 4. Map active riders into DailyParcelRow entries
  const allRows: DailyParcelRow[] = riderList.map(r => {
    const att = attLogs.find(a => a.rider_id === r.id);
    const existingLog = encodedRiderMap.get(r.id);

    const isLate = att?.log_status === 'late' || att?.hr_status === 'Late';
    const isPresent = !!att?.time_in || att?.log_status === 'present' || att?.hr_status === 'Present' || isLate;
    const isLeave = att?.log_status === 'on_leave' || att?.hr_status === 'On Leave';

    const presenceStatus: DailyParcelRow['attendanceStatus'] = isLeave
      ? 'on_leave'
      : isLate
      ? 'late'
      : isPresent
      ? 'present'
      : 'absent';

    const formattedTimeIn = formatTimeString(att?.raw_time_in, att?.time_in);
    const formattedTimeOut = formatTimeString(att?.raw_time_out, att?.time_out);
    const zoneObj = (Array.isArray(r.zones) ? r.zones[0] : r.zones) as unknown as { name: string } | null;
    const recorderInfo = formatRecorderIdentity(existingLog?.created_by);

    const resolvedAvatar = r.face_image_url || r.avatar_url || att?.rider_avatar || null;

    return {
      riderId: r.id,
      riderName: r.name || 'Unknown Rider',
      riderMkbId: r.mkb_id || 'N/A',
      riderAvatar: resolvedAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(r.name || '')}`,
      zoneId: r.zone_id || '',
      zoneName: zoneObj?.name || 'Unassigned',
      attendanceStatus: presenceStatus,
      timeIn: formattedTimeIn,
      rawTimeIn: att?.raw_time_in || null,
      timeOut: formattedTimeOut,
      hours: att?.hours || 0,
      deliveredParcels: existingLog ? existingLog.parcels : 0,
      assignedParcels: existingLog?.assigned_parcels ?? 0,
      failedDeliveries: existingLog?.failed_parcels ?? 0,
      returnedParcels: existingLog?.returned_parcels ?? 0,
      notes: existingLog?.notes ?? '',
      recordedBy: existingLog?.created_by || undefined,
      recordedByName: recorderInfo.name,
      recordedByDetail: recorderInfo.detail,
      lastUpdated: existingLog?.updated_at || undefined,
      parcelLogId: existingLog?.id || null,
      submissionStatus: existingLog ? 'saved' : 'draft',
      isModified: false,
    };
  });

  // Partition into Eligible Queue vs Absent / Off-Duty
  const eligibleRiders = allRows.filter(r => r.attendanceStatus === 'present' || r.attendanceStatus === 'late');
  const absentRiders = allRows.filter(r => r.attendanceStatus === 'absent' || r.attendanceStatus === 'on_leave');

  const totalEligibleCount = eligibleRiders.length;
  const encodedCount = eligibleRiders.filter(r => encodedRiderMap.has(r.riderId)).length;
  const absentCount = absentRiders.length;

  // Pending encoding queue: Present/Late riders without a parcel_log
  let rows = params.includeEncoded
    ? eligibleRiders
    : eligibleRiders.filter(r => !encodedRiderMap.has(r.riderId));

  let absentRows = absentRiders;

  // Apply search query filtering
  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter(r => r.riderName.toLowerCase().includes(q) || r.riderMkbId.toLowerCase().includes(q));
    absentRows = absentRows.filter(r => r.riderName.toLowerCase().includes(q) || r.riderMkbId.toLowerCase().includes(q));
  }

  // Apply status filter if specific
  if (params.status && params.status !== 'all') {
    if (params.status === 'present' || params.status === 'late') {
      rows = rows.filter(r => r.attendanceStatus === params.status);
      absentRows = [];
    } else if (params.status === 'absent' || params.status === 'on_leave') {
      absentRows = absentRows.filter(r => r.attendanceStatus === params.status);
      rows = [];
    }
  }

  return {
    rows,
    absentRows,
    totalEligibleCount,
    encodedCount,
    absentCount
  };
}

/**
 * Checks whether the payroll cutoff for a given shift date is locked (pending review, approved, or paid).
 * Returns true if direct edits are prohibited and must go through Correction Request workflow.
 */
export async function isCutoffLockedForDate(dateStr: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('payroll_records')
    .select('status')
    .lte('cutoff_start', dateStr)
    .gte('cutoff_end', dateStr)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  const status = (data[0].status || '').toLowerCase();
  return status === 'pending' || status === 'approved' || status === 'paid' || status === 'flagged';
}

/**
 * Saves or updates daily parcel entries in batch.
 * Purely operational data recording.
 */
export async function saveDailyParcelEntries(
  entries: SaveParcelEntryPayload[],
  recordedBy: string
): Promise<number> {
  if (entries.length === 0) return 0;

  // Validate if recordedBy is a valid UUID matching public.users(id)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validCreatedBy = uuidRegex.test(recordedBy) ? recordedBy : null;

  // Fetch existing logs for audit comparison
  const dates = Array.from(new Set(entries.map(e => e.date)));
  const riderIds = Array.from(new Set(entries.map(e => e.riderId)));
  const { data: existingLogs } = await supabase
    .from('parcel_logs')
    .select('id, rider_id, date, parcels, failed_parcels, returned_parcels')
    .in('date', dates)
    .in('rider_id', riderIds);

  const existingMap = new Map((existingLogs || []).map(l => [`${l.rider_id}_${l.date}`, l]));

  const payloads = entries.map(e => ({
    rider_id: e.riderId,
    date: e.date,
    parcels: e.parcels,
    assigned_parcels: e.assignedParcels || 0,
    failed_parcels: e.failedDeliveries || 0,
    returned_parcels: e.returnedParcels || 0,
    notes: e.notes || null,
    rate: 10, // Default baseline schema requirement
    created_by: validCreatedBy,
    updated_at: new Date().toISOString(),
  }));

  console.log('[ParcelOps] Sending payload to Supabase:', payloads);

  const res = await supabase
    .from('parcel_logs')
    .upsert(payloads, { onConflict: 'rider_id,date' })
    .select('id, rider_id, date, parcels, assigned_parcels, failed_parcels, returned_parcels, notes, rate, daily_gross');

  console.log('[ParcelOps] Supabase Response:', {
    data: res.data,
    error: res.error,
    status: res.status,
    statusText: res.statusText
  });

  if (res.error) {
    console.error('Database Error saving daily parcel entries:', res.error);
    throw new Error(`Supabase DB Error [${res.error.code}]: ${res.error.message}${res.error.details ? ` (${res.error.details})` : ''}`);
  }

  // Insert audit log entries for created / updated events
  if (res.data) {
    const auditEntries = res.data.map(savedLog => {
      const key = `${savedLog.rider_id}_${savedLog.date}`;
      const prev = existingMap.get(key);
      const isNew = !prev;

      return {
        parcel_log_id: savedLog.id,
        rider_id: savedLog.rider_id,
        date: savedLog.date,
        old_delivered: prev ? prev.parcels : 0,
        old_failed: prev ? prev.failed_parcels || 0 : 0,
        old_returned: prev ? prev.returned_parcels || 0 : 0,
        new_delivered: savedLog.parcels,
        new_failed: savedLog.failed_parcels || 0,
        new_returned: savedLog.returned_parcels || 0,
        action_type: (isNew ? 'created' : 'updated') as 'created' | 'updated',
        changed_by: validCreatedBy,
        reason: isNew ? 'Initial parcel count entry' : 'Direct operational edit in draft status',
        timestamp: new Date().toISOString(),
      };
    });

    const { error: auditErr } = await supabase.from('parcel_log_audit').insert(auditEntries);
    if (auditErr) {
      console.warn('Audit insert warning:', auditErr);
    }
  }

  // Audit activity log
  try {
    await logActivity({
      eventType: 'Daily Parcel Count Recorded',
      description: `Saved ${entries.length} daily parcel record(s) for date ${entries[0].date}.`,
      metadata: { count: entries.length, date: entries[0].date, recorded_by: recordedBy }
    });
  } catch (err) {
    console.warn('Activity log notice:', err);
  }

  return res.data?.length || entries.length;
}

interface DbHistoryRow {
  id: string;
  rider_id: string;
  date: string;
  parcels: number;
  assigned_parcels?: number | null;
  failed_parcels?: number | null;
  returned_parcels?: number | null;
  notes?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  riders: {
    id: string;
    name: string;
    mkb_id: string;
    avatar_url: string | null;
    face_image_url: string | null;
    zone_id: string;
    zones: { name: string } | null;
  } | null;
}

/**
 * Retrieves historical parcel logs for auditing and operational review.
 */
export async function getParcelHistory(filters: ParcelHistoryFilter): Promise<{
  data: ParcelHistoryItem[];
  totalCount: number;
}> {
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 15;
  const fromIndex = (page - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  let query = supabase
    .from('parcel_logs')
    .select(
      `
      id,
      rider_id,
      date,
      parcels,
      assigned_parcels,
      failed_parcels,
      returned_parcels,
      notes,
      created_by,
      created_at,
      updated_at,
      riders!inner (
        id,
        name,
        mkb_id,
        avatar_url,
        face_image_url,
        zone_id,
        zones (name)
      )
    `,
      { count: 'exact' }
    );

  if (filters.dateFrom) {
    query = query.gte('date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('date', filters.dateTo);
  }
  if (filters.riderId && filters.riderId !== 'all') {
    query = query.eq('rider_id', filters.riderId);
  }
  if (filters.zoneId && filters.zoneId !== 'all') {
    query = query.eq('riders.zone_id', filters.zoneId);
  }

  query = query.order('date', { ascending: false }).order('created_at', { ascending: false });
  query = query.range(fromIndex, toIndex);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching parcel history:', error);
    throw error;
  }

  const rawRows = (data || []) as unknown as DbHistoryRow[];
  const dates = Array.from(new Set(rawRows.map(r => r.date)));
  const riderIds = Array.from(new Set(rawRows.map(r => r.rider_id)));

  // 1. Join attendance info for history context
  let attLogs: Array<{ rider_id: string; date: string; log_status: string; hr_status: string; time_in: string; raw_time_in: string }> = [];
  if (dates.length > 0 && riderIds.length > 0) {
    const attRes = await supabase
      .from('v_attendance_summary')
      .select('rider_id, date, log_status, hr_status, time_in, raw_time_in')
      .in('date', dates)
      .in('rider_id', riderIds);
    attLogs = attRes.data || [];
  }

  // 2. Fetch users for any created_by UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userIdsToFetch = Array.from(
    new Set(rawRows.map(r => r.created_by).filter((cb): cb is string => !!cb && uuidRegex.test(cb)))
  );

  const userMap: Record<string, { full_name?: string; email?: string; role?: string }> = {};
  if (userIdsToFetch.length > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .in('id', userIdsToFetch);

    if (usersData) {
      usersData.forEach((u: { id: string; full_name?: string; email?: string; role?: string }) => {
        userMap[u.id] = u;
      });
    }
  }

  let mapped: ParcelHistoryItem[] = rawRows.map(row => {
    const rider = Array.isArray(row.riders) ? row.riders[0] : row.riders;
    const zoneObj = (Array.isArray(rider?.zones) ? rider?.zones[0] : rider?.zones) as { name: string } | null;
    const att = attLogs.find(a => a.rider_id === row.rider_id && a.date === row.date);

    const isLate = att?.log_status === 'late' || att?.hr_status === 'Late';
    const isPresent = !!att?.time_in || att?.log_status === 'present' || isLate;
    const presenceStatus: ParcelHistoryItem['attendanceStatus'] =
      att?.log_status === 'on_leave' ? 'on_leave' : isLate ? 'late' : isPresent ? 'present' : 'absent';

    const formattedTimeIn = formatTimeString(att?.raw_time_in, att?.time_in);
    const recorderInfo = formatRecorderIdentity(row.created_by, userMap);
    const resolvedAvatar = rider?.face_image_url || rider?.avatar_url || null;

    return {
      id: row.id,
      riderId: row.rider_id,
      riderName: rider?.name || 'Unknown Rider',
      riderMkbId: rider?.mkb_id || 'N/A',
      riderAvatar: resolvedAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rider?.name || '')}`,
      zoneId: rider?.zone_id || '',
      zoneName: zoneObj?.name || 'Unassigned',
      date: row.date,
      deliveredParcels: row.parcels,
      assignedParcels: row.assigned_parcels || 0,
      failedDeliveries: row.failed_parcels || 0,
      returnedParcels: row.returned_parcels || 0,
      notes: row.notes || undefined,
      grossWagePreview: row.parcels * 10,
      payrollCutoff: getCutoffLabel(row.date),
      createdBy: row.created_by || 'System',
      createdByName: recorderInfo.name,
      createdByDetail: recorderInfo.detail,
      createdAt: row.created_at || row.updated_at,
      updatedAt: row.updated_at || row.created_at,
      attendanceStatus: presenceStatus,
      timeIn: formattedTimeIn,
    };
  });

  if (filters.search) {
    const q = filters.search.toLowerCase();
    mapped = mapped.filter(m => m.riderName.toLowerCase().includes(q) || m.riderMkbId.toLowerCase().includes(q));
  }

  return {
    data: mapped,
    totalCount: count || mapped.length,
  };
}

export interface ParcelCorrectionRequest {
  id: string;
  parcelLogId: string;
  riderId: string;
  riderName?: string;
  riderMkbId?: string;
  riderAvatar?: string;
  date: string;
  previousDelivered: number;
  previousFailed: number;
  previousReturned: number;
  requestedDelivered: number;
  requestedFailed: number;
  requestedReturned: number;
  reason: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface ParcelLogAuditEntry {
  id: string;
  parcelLogId: string;
  riderId: string;
  date: string;
  oldDelivered: number;
  oldFailed: number;
  oldReturned: number;
  newDelivered: number;
  newFailed: number;
  newReturned: number;
  actionType: 'created' | 'updated' | 'correction_requested' | 'correction_approved' | 'correction_rejected';
  correctionRequestId?: string;
  reason?: string;
  changedBy?: string;
  changedByName?: string;
  approvedBy?: string;
  approvedByName?: string;
  timestamp: string;
}

/**
 * Creates a formal parcel log correction request when an existing record is modified.
 */
export async function createParcelCorrectionRequest(payload: {
  parcelLogId: string;
  riderId: string;
  date: string;
  previousDelivered: number;
  previousFailed: number;
  previousReturned: number;
  requestedDelivered: number;
  requestedFailed: number;
  requestedReturned: number;
  reason: string;
  requestedBy: string;
}): Promise<void> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validRequestedBy = uuidRegex.test(payload.requestedBy) ? payload.requestedBy : null;

  const { data: request, error } = await supabase.from('parcel_correction_requests').insert({
    parcel_log_id: payload.parcelLogId,
    rider_id: payload.riderId,
    date: payload.date,
    previous_delivered: payload.previousDelivered,
    previous_failed: payload.previousFailed,
    previous_returned: payload.previousReturned,
    requested_delivered: payload.requestedDelivered,
    requested_failed: payload.requestedFailed,
    requested_returned: payload.requestedReturned,
    reason: payload.reason,
    requested_by: validRequestedBy,
    status: 'pending',
    requested_at: new Date().toISOString(),
  }).select('id').single();

  if (error || !request) {
    console.error('Error creating parcel correction request:', error);
    throw new Error(`Failed to submit correction request: ${error?.message || 'Insert error'}`);
  }

  const { error: auditErr } = await supabase.from('parcel_log_audit').insert({
    parcel_log_id: payload.parcelLogId,
    rider_id: payload.riderId,
    date: payload.date,
    old_delivered: payload.previousDelivered,
    old_failed: payload.previousFailed,
    old_returned: payload.previousReturned,
    new_delivered: payload.requestedDelivered,
    new_failed: payload.requestedFailed,
    new_returned: payload.requestedReturned,
    action_type: 'correction_requested',
    correction_request_id: request.id,
    reason: payload.reason,
    changed_by: validRequestedBy,
    timestamp: new Date().toISOString(),
  });

  if (auditErr) {
    console.warn('Audit insert warning:', auditErr);
  }

  try {
    await logActivity({
      eventType: 'Parcel Correction Requested',
      description: `Submitted correction request for rider date ${payload.date}: Delivered ${payload.previousDelivered} → ${payload.requestedDelivered}. Reason: ${payload.reason}`,
      metadata: { parcel_log_id: payload.parcelLogId, rider_id: payload.riderId, date: payload.date }
    });
  } catch (err) {
    console.warn('Activity log notice:', err);
  }
}

/**
 * Fetches all parcel correction requests (or filtered by status) for Admin review.
 */
export async function getParcelCorrectionRequests(statusFilter?: 'pending' | 'approved' | 'rejected'): Promise<ParcelCorrectionRequest[]> {
  let query = supabase
    .from('parcel_correction_requests')
    .select(`
      id,
      parcel_log_id,
      rider_id,
      date,
      previous_delivered,
      previous_failed,
      previous_returned,
      requested_delivered,
      requested_failed,
      requested_returned,
      reason,
      requested_by,
      requested_at,
      status,
      reviewed_by,
      reviewed_at,
      review_notes,
      riders (
        name,
        mkb_id,
        avatar_url,
        face_image_url
      )
    `);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  query = query.order('requested_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching correction requests:', error);
    throw error;
  }

  const rawRows = (data || []) as unknown as Array<{
    id: string;
    parcel_log_id: string;
    rider_id: string;
    date: string;
    previous_delivered: number;
    previous_failed: number;
    previous_returned: number;
    requested_delivered: number;
    requested_failed: number;
    requested_returned: number;
    reason: string;
    requested_by: string | null;
    requested_at: string;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
    riders: { name: string; mkb_id: string; avatar_url: string | null; face_image_url: string | null } | null;
  }>;

  const userIds = Array.from(
    new Set(
      rawRows
        .flatMap(r => [r.requested_by, r.reviewed_by])
        .filter((id): id is string => !!id)
    )
  );

  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds);
    if (users) {
      users.forEach(u => {
        userMap[u.id] = u.full_name || u.email || 'User';
      });
    }
  }

  return rawRows.map(r => {
    const rider = Array.isArray(r.riders) ? r.riders[0] : r.riders;
    const resolvedAvatar = rider?.face_image_url || rider?.avatar_url || null;

    return {
      id: r.id,
      parcelLogId: r.parcel_log_id,
      riderId: r.rider_id,
      riderName: rider?.name || 'Unknown Rider',
      riderMkbId: rider?.mkb_id || 'N/A',
      riderAvatar: resolvedAvatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rider?.name || '')}`,
      date: r.date,
      previousDelivered: r.previous_delivered,
      previousFailed: r.previous_failed,
      previousReturned: r.previous_returned,
      requestedDelivered: r.requested_delivered,
      requestedFailed: r.requested_failed,
      requestedReturned: r.requested_returned,
      reason: r.reason,
      requestedBy: r.requested_by || 'System',
      requestedByName: r.requested_by ? userMap[r.requested_by] || 'HR Staff' : 'Operations Staff',
      requestedAt: r.requested_at,
      status: r.status,
      reviewedBy: r.reviewed_by || undefined,
      reviewedByName: r.reviewed_by ? userMap[r.reviewed_by] || 'Admin' : undefined,
      reviewedAt: r.reviewed_at || undefined,
      reviewNotes: r.review_notes || undefined,
    };
  });
}

/**
 * Reviews (Approve or Reject) a parcel correction request.
 */
export async function reviewParcelCorrectionRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewerId: string,
  reviewNotes?: string
): Promise<void> {
  const { data: request, error: fetchErr } = await supabase
    .from('parcel_correction_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    throw new Error(`Correction request not found: ${fetchErr?.message || requestId}`);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validReviewerId = uuidRegex.test(reviewerId) ? reviewerId : null;
  const now = new Date().toISOString();

  if (decision === 'approved') {
    // 1. Update master parcel_logs record
    const { error: updateLogErr } = await supabase
      .from('parcel_logs')
      .update({
        parcels: request.requested_delivered,
        failed_parcels: request.requested_failed,
        returned_parcels: request.requested_returned,
        updated_at: now,
      })
      .eq('id', request.parcel_log_id);

    if (updateLogErr) {
      console.error('Error updating parcel_log on approval:', updateLogErr);
      throw new Error(`Failed to update parcel log: ${updateLogErr.message}`);
    }

    // 2. Insert immutable audit trail entry 'correction_approved'
    const { error: auditErr } = await supabase.from('parcel_log_audit').insert({
      parcel_log_id: request.parcel_log_id,
      rider_id: request.rider_id,
      date: request.date,
      old_delivered: request.previous_delivered,
      old_failed: request.previous_failed,
      old_returned: request.previous_returned,
      new_delivered: request.requested_delivered,
      new_failed: request.requested_failed,
      new_returned: request.requested_returned,
      action_type: 'correction_approved',
      correction_request_id: request.id,
      reason: request.reason,
      changed_by: request.requested_by,
      approved_by: validReviewerId,
      timestamp: now,
    });

    if (auditErr) {
      console.warn('Audit record insert warning:', auditErr);
    }
  } else {
    const { error: rejectAuditErr } = await supabase.from('parcel_log_audit').insert({
      parcel_log_id: request.parcel_log_id,
      rider_id: request.rider_id,
      date: request.date,
      old_delivered: request.previous_delivered,
      old_failed: request.previous_failed,
      old_returned: request.previous_returned,
      new_delivered: request.requested_delivered,
      new_failed: request.requested_failed,
      new_returned: request.requested_returned,
      action_type: 'correction_rejected',
      correction_request_id: request.id,
      reason: reviewNotes || request.reason,
      changed_by: request.requested_by,
      approved_by: validReviewerId,
      timestamp: now,
    });
    if (rejectAuditErr) {
      console.warn('Audit insert warning:', rejectAuditErr);
    }
  }

  // 3. Mark request status
  const { error: reqUpdateErr } = await supabase
    .from('parcel_correction_requests')
    .update({
      status: decision,
      reviewed_by: validReviewerId,
      reviewed_at: now,
      review_notes: reviewNotes || null,
      updated_at: now,
    })
    .eq('id', requestId);

  if (reqUpdateErr) {
    console.error('Error updating correction request status:', reqUpdateErr);
    throw new Error(`Failed to update request status: ${reqUpdateErr.message}`);
  }

  try {
    await logActivity({
      eventType: decision === 'approved' ? 'Parcel Correction Approved' : 'Parcel Correction Rejected',
      description: `${decision === 'approved' ? 'Approved' : 'Rejected'} parcel correction request for date ${request.date}. ${reviewNotes ? `Notes: ${reviewNotes}` : ''}`,
      metadata: { requestId, parcel_log_id: request.parcel_log_id, decision, reviewerId }
    });
  } catch (err) {
    console.warn('Activity log notice:', err);
  }
}

/**
 * Retrieves full audit trail for a specific parcel log record.
 */
export async function getParcelLogAuditHistory(parcelLogId: string): Promise<ParcelLogAuditEntry[]> {
  const { data, error } = await supabase
    .from('parcel_log_audit')
    .select('*')
    .eq('parcel_log_id', parcelLogId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Error fetching parcel audit history:', error);
    return [];
  }

  const rawRows = (data || []) as unknown as Array<{
    id: string;
    parcel_log_id: string;
    rider_id: string;
    date: string;
    old_delivered: number;
    old_failed: number;
    old_returned: number;
    new_delivered: number;
    new_failed: number;
    new_returned: number;
    action_type: 'created' | 'updated' | 'correction_requested' | 'correction_approved' | 'correction_rejected';
    correction_request_id: string | null;
    reason: string | null;
    changed_by: string | null;
    approved_by: string | null;
    timestamp: string;
  }>;

  const userIds = Array.from(
    new Set(
      rawRows
        .flatMap(r => [r.changed_by, r.approved_by])
        .filter((id): id is string => !!id)
    )
  );

  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds);
    if (users) {
      users.forEach(u => {
        userMap[u.id] = u.full_name || u.email || 'User';
      });
    }
  }

  return rawRows.map(r => ({
    id: r.id,
    parcelLogId: r.parcel_log_id,
    riderId: r.rider_id,
    date: r.date,
    oldDelivered: r.old_delivered,
    oldFailed: r.old_failed,
    oldReturned: r.old_returned,
    newDelivered: r.new_delivered,
    newFailed: r.new_failed,
    newReturned: r.new_returned,
    actionType: r.action_type,
    correctionRequestId: r.correction_request_id || undefined,
    reason: r.reason || undefined,
    changedBy: r.changed_by || undefined,
    changedByName: r.changed_by ? userMap[r.changed_by] || 'HR Staff' : 'Operations Staff',
    approvedBy: r.approved_by || undefined,
    approvedByName: r.approved_by ? userMap[r.approved_by] || 'Admin' : 'System Admin',
    timestamp: r.timestamp,
  }));
}
