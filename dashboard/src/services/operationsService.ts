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
    .select('id, rider_id, date, parcels, created_by, updated_at, rate, daily_gross')
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

  const payloads = entries.map(e => ({
    rider_id: e.riderId,
    date: e.date,
    parcels: e.parcels,
    rate: 10, // Default baseline schema requirement
    created_by: validCreatedBy,
    updated_at: new Date().toISOString(),
  }));

  console.log('[ParcelOps] Sending payload to Supabase:', payloads);

  const res = await supabase
    .from('parcel_logs')
    .upsert(payloads, { onConflict: 'rider_id,date' })
    .select('id, rider_id, date, parcels, rate, daily_gross');

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

  // Audit activity log
  await logActivity({
    eventType: 'Daily Parcel Count Recorded',
    description: `Saved ${entries.length} daily parcel record(s) for date ${entries[0].date}.`,
    metadata: { count: entries.length, date: entries[0].date, recorded_by: recordedBy }
  }).catch(err => console.warn('Activity log notice:', err));

  return res.data?.length || entries.length;
}

interface DbHistoryRow {
  id: string;
  rider_id: string;
  date: string;
  parcels: number;
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
