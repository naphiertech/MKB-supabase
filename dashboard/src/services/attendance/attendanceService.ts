import { supabase } from '../../lib/supabaseClient';
import { type AttendanceLog, type AttendanceStatus, type AttendancePresence, type PunctualityStatus } from '../types';
import { getCachedAvatar } from '../../lib/avatarCache';
import { getStorageAdapter, createSyncOperationId, type QueueEnqueueInput } from '../../lib/storage';
import { dispatchNotificationSafe } from '../notifications/notificationService';
import { downloadCsv } from '../../lib/exports/exportUtils';
import {
  getAttendancePresenceDisplay,
  isPresentAttendance,
  matchesAttendanceStatusFilter,
  resolveAttendancePunctuality,
  resolveAttendanceSummaryFacts,
  type AttendancePresenceDisplay,
  type PresentAttendanceCandidate,
} from '../../lib/attendance/attendanceSummaryPolicy';

export {
  getAttendancePresenceDisplay,
  isPresentAttendance,
  matchesAttendanceStatusFilter,
  type AttendancePresenceDisplay,
  type PresentAttendanceCandidate,
};
import {
  getAttendanceContextLabel,
  getPresentationContextCode,
  getPresentationStatus,
  type AttendancePresentationLog,
} from './attendanceContextService';

// Helper to convert dynamic timestamps (timestamptz) back to HH:MM format in local timezone
function toHHMM(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const formatted = dateStr.includes(' ') && !dateStr.includes('T')
      ? dateStr.replace(' ', 'T')
      : dateStr;
    const d = new Date(formatted);
    if (isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

export function getLocalDateString(d: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

interface DbAttendanceViewRow {
  id: string;
  hub_id: string | null;
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
  notes: string | null;
  source: string | null;
  log_status: string | null;
  lat: number | null;
  lng: number | null;
  hr_status: string | null;
  completion_status: string | null;
}

export function isAttendanceFinalized(targetDate: string = getLocalDateString(), cutoffHour = 17): boolean {
  const now = new Date();
  const todayStr = getLocalDateString(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now));
  if (targetDate < todayStr) return true;
  if (targetDate === todayStr && hour >= cutoffHour) return true;
  return false;
}

export async function getAttendanceLogs(filters?: {
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  zoneId?: string;
  riderId?: string;
}, options: { finalizeDaily?: boolean; throwOnError?: boolean; includeEvents?: boolean } = {}): Promise<AttendanceLog[]> {
  let query = supabase
    .from('v_attendance_summary')
    .select('*');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.dateFrom) {
    query = query.gte('date', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('date', filters.dateTo);
  }
  if (filters?.zoneId && filters.zoneId !== 'all') {
    query = query.eq('zone_id', filters.zoneId);
  }
  if (filters?.riderId) {
    query = query.eq('rider_id', filters.riderId);
  }

  // Sort descending by date
  query = query.order('date', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching attendance summary view:', error);
    if (options.throwOnError) throw error;
    return [];
  }

  let result: AttendanceLog[] = ((data as unknown as DbAttendanceViewRow[]) || []).map((row: DbAttendanceViewRow) => {
    const cached = getCachedAvatar(row.rider_id);
    const realPhoto = row.rider_avatar || cached || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.rider_name || '')}`;
    const summaryFacts = resolveAttendanceSummaryFacts({
      timeIn: row.time_in,
      rawTimeIn: row.raw_time_in,
      logStatus: row.log_status,
      hrStatus: row.hr_status,
    });
    const isPresent = summaryFacts.hasFormattedTimeIn || summaryFacts.isLogPresent || summaryFacts.isLate;
    const presence = (summaryFacts.isLogLeave ? 'on_leave' : isPresent ? 'present' : 'absent');
    const punctuality = resolveAttendancePunctuality(summaryFacts.isLate, isPresent);

    return {
      id: row.id,
      hubId: row.hub_id,
      riderId: row.rider_id,
      riderName: row.rider_name || 'Unknown Rider',
      riderAvatar: realPhoto,
      date: row.date,
      timeIn: row.time_in,
      timeOut: row.time_out,
      rawTimeIn: row.raw_time_in,
      rawTimeOut: row.raw_time_out,
      hours: row.hours || 0,
      zoneId: row.zone_id || '',
      zoneName: row.zone_name || 'Unassigned',
      status: (summaryFacts.isLate ? 'late' : isPresent ? 'present' : 'absent') as AttendanceStatus,
      presence: presence as AttendancePresence,
      punctuality: punctuality as PunctualityStatus,
      completionStatus: row.completion_status === 'Complete'
        ? 'complete'
        : row.completion_status === 'Missing Time Out'
          ? 'missing_time_out'
          : row.completion_status === 'Active'
            ? 'active'
            : 'absent',
      source: (row.source || 'face-scan') as 'face-scan' | 'manual',
      notes: row.notes || undefined,
      lat: row.lat || 0,
      lng: row.lng || 0,
      events: []
    };
  });

  // Fetch matching violations and activity logs to build historical timelines
  const riderIds = result.map(r => r.riderId);
  const dates = result.map(r => r.date).filter(Boolean);

  if (options.includeEvents !== false && riderIds.length > 0 && dates.length > 0) {
    try {
      const minDate = dates.reduce((a, b) => a < b ? a : b);
      const maxDate = dates.reduce((a, b) => a > b ? a : b);

      const [violationsRes, activitiesRes] = await Promise.all([
        supabase
          .from('violations')
          .select('rider_id, zone_name, type, created_at')
          .in('rider_id', riderIds)
          .gte('created_at', `${minDate}T00:00:00Z`)
          .lte('created_at', `${maxDate}T23:59:59Z`),
        supabase
          .from('activity_logs')
          .select('rider_id, event_type, description, metadata, created_at')
          .in('rider_id', riderIds)
          .in('event_type', ['geofence_exit', 'geofence_enter'])
          .gte('created_at', `${minDate}T00:00:00Z`)
          .lte('created_at', `${maxDate}T23:59:59Z`)
      ]);

      const dbViolations = violationsRes.data || [];
      const dbActivities = activitiesRes.data || [];

      result = result.map(log => {
        const logEvents: AttendanceLog['events'] = [];

        // 1. Filter violations so they only attach if v.created_at is within [raw_time_in, raw_time_out] shift window
        const matchingViolations = dbViolations.filter(v => {
          if (v.rider_id !== log.riderId) return false;

          const vTime = new Date(v.created_at).getTime();
          if (isNaN(vTime)) return false;

          const shiftStart = log.rawTimeIn ? new Date(log.rawTimeIn).getTime() : null;
          const shiftEnd = log.rawTimeOut ? new Date(log.rawTimeOut).getTime() : null;

          // Must occur at or after shift start time (with 5-minute margin)
          if (shiftStart && vTime < shiftStart - 300000) return false;

          // If shift is closed (has time_out), violation must occur before or at shift end time (with 5-minute margin)
          if (shiftEnd && vTime > shiftEnd + 300000) return false;

          return true;
        });

        matchingViolations.forEach(v => {
          const ts = toHHMM(v.created_at) || '00:00';
          const exists = logEvents.some(e => e.ts === ts && e.type === 'exit');
          if (!exists) {
            logEvents.push({
              ts,
              type: 'exit',
              zone: v.zone_name || log.zoneName
            });
          }
        });

        // 2. Filter geofence enter/exit from activity_logs ONLY during this shift session
        const matchingActivities = dbActivities.filter(a => {
          if (a.rider_id !== log.riderId) return false;

          const aTime = new Date(a.created_at).getTime();
          if (isNaN(aTime)) return false;

          const shiftStart = log.rawTimeIn ? new Date(log.rawTimeIn).getTime() : null;
          const shiftEnd = log.rawTimeOut ? new Date(log.rawTimeOut).getTime() : null;

          if (shiftStart && aTime < shiftStart - 300000) return false;
          if (shiftEnd && aTime > shiftEnd + 300000) return false;

          return true;
        });

        matchingActivities.forEach(a => {
          const type = a.event_type === 'geofence_exit' ? 'exit' : 'enter';
          const meta = a.metadata as { zone_name?: string } | null;
          const zone = meta?.zone_name || log.zoneName;
          const ts = toHHMM(a.created_at) || '00:00';

          const exists = logEvents.some(e => e.ts === ts && e.type === type);
          if (!exists) {
            logEvents.push({ ts, type, zone });
          }
        });

        // Sort events chronologically by timestamp string
        logEvents.sort((a, b) => a.ts.localeCompare(b.ts));

        return {
          ...log,
          events: logEvents
        };
      });
    } catch (err) {
      console.error('Error fetching geofence events for logs:', err);
    }
  }

  // Safe in-memory filtering for zoneId to handle nested relational bounds robustly
  if (filters?.zoneId) {
    result = result.filter((l) => l.zoneId === filters.zoneId);
  }

  return result;
}

export async function getTodayLogs(): Promise<AttendanceLog[]> {
  const today = getLocalDateString();
  return getAttendanceLogs({ dateFrom: today, dateTo: today });
}

export async function getTodayKpis() {
  const today = getLocalDateString();
  const todays = await getAttendanceLogs({ dateFrom: today, dateTo: today });
  return {
    present: todays.filter(isPresentAttendance).length,
    late: todays.filter((l) => l.status === 'late' || l.punctuality === 'late').length,
    absent: todays.filter((l) => !isPresentAttendance(l) && l.status === 'absent').length,
    onLeave: todays.filter((l) => !isPresentAttendance(l) && l.status === 'on_leave').length
  };
}

export async function getHrTodayKpis() {
  const today = getLocalDateString();
  const todays = await getAttendanceLogs({ dateFrom: today, dateTo: today });
  return {
    onDuty: todays.filter((l) => l.timeIn !== null).length,
    complete: todays.filter((l) => l.timeIn !== null && l.timeOut !== null).length,
    absent: todays.filter((l) => l.status === 'absent' || l.timeIn === null).length,
    pending: todays.filter((l) => l.source === 'manual' || (l.timeIn !== null && l.timeOut === null)).length
  };
}

export type HrLogStatus = 'Complete' | 'Incomplete' | 'Missing Time Out' | 'Absent' | 'Late';

export function deriveHrStatus(log: AttendanceLog): HrLogStatus {
  if (!log.timeIn) return 'Absent';
  if (log.timeIn && log.timeOut) return 'Complete';
  if (log.completionStatus === 'missing_time_out') return 'Missing Time Out';
  if (log.status === 'late') return 'Late';
  return 'Incomplete';
}

export function exportLogsCsv(logs: AttendancePresentationLog[], filename = 'attendance_logs.csv') {
  const headers = ['Rider Name', 'Date', 'Time In', 'Time Out', 'Hours', 'Zone', 'Status', 'Context', 'Source'];
  const rows = logs.map((l) => [
    l.riderName,
    l.date,
    l.timeIn || '',
    l.timeOut || '',
    l.hours ? l.hours.toFixed(2) : '0.00',
    l.zoneName,
    getPresentationStatus(l),
    getAttendanceContextLabel(getPresentationContextCode(l)) || '',
    l.source || ''
  ]);

  downloadCsv([headers, ...rows], filename);
}

export async function getRiderAttendanceInDateRange(riderId: string, dateFrom: string, dateTo: string): Promise<AttendanceLog[]> {
  return getAttendanceLogs(
    { riderId, dateFrom, dateTo },
    { finalizeDaily: false }
  );
}

export interface HubAttendanceGeofence {
  hub_id: string | null;
  hub_name: string | null;
  latitude: number | null;
  longitude: number | null;
  attendance_radius_m: number | null;
  is_configured: boolean;
  reason: string | null;
  message: string | null;
}

export function formatAttendanceErrorMessage(rawError?: string | null): string {
  if (!rawError) return 'An unexpected error occurred while recording attendance.';
  const msg = rawError.trim();

  if (msg.includes('OUTSIDE_HUB_GEOFENCE')) {
    const parts = msg.split('OUTSIDE_HUB_GEOFENCE:');
    if (parts.length > 1) {
      return `You're outside your Hub attendance area. ${parts[1].trim()}`;
    }
    return "You're outside your Hub attendance area. Move within the allowed radius to continue.";
  }
  if (msg.includes('NO_ASSIGNED_HUB')) {
    return 'No assigned Hub was found for your account. Please contact your administrator.';
  }
  if (msg.includes('HUB_GEOFENCE_NOT_CONFIGURED')) {
    return 'Attendance location has not been configured for your Hub. Please contact your administrator.';
  }
  if (msg.includes('STALE_GPS_POSITION')) {
    return 'Your location is outdated. Please wait for a fresh GPS signal.';
  }
  if (msg.includes('FUTURE_GPS_TIMESTAMP')) {
    return 'Your device clock appears incorrect. Please check your system date and time.';
  }
  if (msg.includes('INVALID_COORDINATES') || msg.includes('MISSING_GPS_TIMESTAMP')) {
    return 'Current location is required to record attendance.';
  }
  if (msg.includes('ATTENDANCE_CLOSED')) {
    return "Today's attendance has already been finalized.";
  }
  if (msg.includes('DUPLICATE_TIME_IN')) {
    return 'Time In has already been recorded for today.';
  }
  if (msg.includes('NO_ACTIVE_SHIFT')) {
    return 'No active shift found to clock out from.';
  }
  if (msg.includes('ALREADY_TIMED_OUT')) {
    return 'Time Out has already been recorded for today.';
  }
  if (msg.includes('RIDER_NOT_OPERATIONAL')) {
    return 'Your account is currently inactive or not operational.';
  }
  if (msg.includes('EXPIRED_OFFLINE_ATTENDANCE')) {
    return 'This offline attendance record is older than 24 hours. Please contact HR to record it manually.';
  }
  if (msg.includes('42501') || msg.includes('violates row-level security')) {
    return 'Attendance must be recorded through verified location scanning.';
  }
  return msg;
}

const HUB_GEOFENCE_CACHE_PREFIX = 'rider_hub_geofence_v1:';
const HUB_GEOFENCE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isNetworkFailureError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = (err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err ?? '')).toLowerCase();
  return (
    msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('network request failed')
    || msg.includes('load failed')
    || msg.includes('err_internet_disconnected')
    || msg.includes('fetcherror')
  );
}

export async function getMyHubAttendanceGeofence(riderId?: string): Promise<HubAttendanceGeofence> {
  const cacheKey = riderId ? `${HUB_GEOFENCE_CACHE_PREFIX}${riderId}` : null;
  try {
    const { data, error } = await supabase.rpc('get_my_hub_attendance_geofence');
    if (error) {
      throw error;
    }
    const fence = data as unknown as HubAttendanceGeofence;
    if (cacheKey) {
      await getStorageAdapter().setItem(cacheKey, fence, HUB_GEOFENCE_CACHE_TTL_MS).catch(() => undefined);
    }
    return fence;
  } catch (err) {
    if (cacheKey) {
      const cached = await getStorageAdapter().getItem<HubAttendanceGeofence>(cacheKey).catch(() => null);
      if (cached) {
        return cached;
      }
    }
    console.error('Error fetching hub attendance geofence:', err);
    const rawMsg = err instanceof Error ? err.message : (err as { message?: string })?.message;
    throw new Error(formatAttendanceErrorMessage(rawMsg));
  }
}

export interface TimeInOptions {
  lat?: number;
  lng?: number;
  accuracy?: number;
  positionTimestamp?: string | number;
  zoneId?: string;
}

async function enqueueOfflineTimeIn(
  riderId: string,
  today: string,
  posTs: string,
  options: TimeInOptions,
): Promise<AttendanceLog> {
  const localId = `offline-${createSyncOperationId()}`;
  const idempotencyKey = `time-in:${riderId}:${today}`;
  await getStorageAdapter().enqueue({
    action: 'TIME_IN',
    riderId,
    idempotencyKey,
    eventTimestamp: posTs,
    payload: {
      id: localId,
      attendance_log_id: localId,
      rider_id: riderId,
      date: today,
      time_in: posTs,
      lat: options.lat,
      lng: options.lng,
      accuracy: options.accuracy ?? null,
      status: 'present',
      source: 'face-scan',
    },
    priority: 1,
  });

  return {
    id: localId,
    riderId,
    riderName: '',
    riderAvatar: '',
    date: today,
    timeIn: toHHMM(posTs),
    timeOut: null,
    rawTimeIn: posTs,
    rawTimeOut: null,
    hours: 0,
    zoneId: options.zoneId || '',
    zoneName: '',
    status: 'present',
    presence: 'present',
    punctuality: 'on_time',
    source: 'face-scan',
    events: [],
  };
}

export async function recordTimeIn(
  riderId: string,
  optionsOrZoneId?: TimeInOptions | string,
  cutoffHour = 17
): Promise<AttendanceLog | null> {
  const today = getLocalDateString();

  if (isAttendanceFinalized(today, cutoffHour)) {
    throw new Error("Attendance Closed: Today's attendance has already been finalized.");
  }

  const options: TimeInOptions = typeof optionsOrZoneId === 'string'
    ? { zoneId: optionsOrZoneId }
    : optionsOrZoneId || {};

  if (options.lat == null || options.lng == null) {
    throw new Error('Current location is required to record attendance.');
  }

  const posTs = options.positionTimestamp
    ? new Date(options.positionTimestamp).toISOString()
    : new Date().toISOString();

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return enqueueOfflineTimeIn(riderId, today, posTs, options);
  }

  try {
    const { data, error } = await supabase.rpc('record_my_time_in', {
      p_latitude: options.lat,
      p_longitude: options.lng,
      p_accuracy: options.accuracy ?? null,
      p_position_timestamp: posTs,
    });

    if (error || !data) {
      if (isNetworkFailureError(error)) {
        return enqueueOfflineTimeIn(riderId, today, posTs, options);
      }
      console.error('Error recording Time In via RPC:', error);
      throw new Error(formatAttendanceErrorMessage(error?.message));
    }

    // Non-blocking notification dispatch for Time-In
    void dispatchNotificationSafe({
      category: 'attendance',
      priority: 'medium',
      type: 'attendance',
      title: 'Rider Clock-In',
      message: `Rider clock-in recorded for shift on ${today}`,
      riderId: riderId,
      actionLink: '/attendance',
      targetRoles: ['hr', 'admin']
    });

    const timeInIso = data.time_in as string;

    return {
      id: data.attendance_log_id,
      riderId: data.rider_id,
      riderName: '',
      riderAvatar: '',
      date: data.date,
      timeIn: toHHMM(timeInIso),
      timeOut: null,
      rawTimeIn: timeInIso,
      rawTimeOut: null,
      hours: 0,
      zoneId: options.zoneId || '',
      zoneName: '',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: []
    };
  } catch (err) {
    if (isNetworkFailureError(err)) {
      return enqueueOfflineTimeIn(riderId, today, posTs, options);
    }
    throw err;
  }
}

export interface TimeOutContext {
  riderId: string;
  date: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  positionTimestamp?: string | number;
}

export function buildTimeOutQueueOperation(
  logId: string,
  context: TimeOutContext,
  eventTimestamp: string,
  idempotencyKey: string
): QueueEnqueueInput {
  const coordinates = context.lat != null && context.lng != null
    ? { lat: context.lat, lng: context.lng, accuracy: context.accuracy ?? null }
    : {};
  return {
    action: 'TIME_OUT' as const,
    riderId: context.riderId,
    idempotencyKey,
    eventTimestamp,
    payload: {
      id: logId,
      attendance_log_id: logId,
      rider_id: context.riderId,
      date: context.date,
      time_out: eventTimestamp,
      ...coordinates
    },
    priority: 1
  };
}

export async function recordTimeOut(logId: string, context: TimeOutContext): Promise<boolean> {
  if (context.lat == null || context.lng == null) {
    throw new Error('Current location is required to record attendance.');
  }

  const posTs = context.positionTimestamp
    ? new Date(context.positionTimestamp).toISOString()
    : new Date().toISOString();

  const queueOffline = async (): Promise<boolean> => {
    const idempotencyKey = `time-out:${context.riderId}:${context.date}`;
    await getStorageAdapter().enqueue(
      buildTimeOutQueueOperation(logId, context, posTs, idempotencyKey),
    );
    return true;
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueOffline();
  }

  try {
    const { data, error } = await supabase.rpc('record_my_time_out', {
      p_latitude: context.lat,
      p_longitude: context.lng,
      p_accuracy: context.accuracy ?? null,
      p_position_timestamp: posTs,
    });

    if (error || !data) {
      if (isNetworkFailureError(error)) {
        return queueOffline();
      }
      console.error('Error recording Time Out via RPC:', error);
      throw new Error(formatAttendanceErrorMessage(error?.message));
    }

    // Non-blocking notification dispatch for Time-Out after DB update succeeds
    void dispatchNotificationSafe({
      category: 'attendance',
      priority: 'medium',
      type: 'attendance',
      title: 'Rider Clock-Out',
      message: `Rider clock-out recorded for shift on ${getLocalDateString()}`,
      riderId: context.riderId,
      actionLink: '/attendance',
      targetRoles: ['hr', 'admin']
    });

    return true;
  } catch (err) {
    if (isNetworkFailureError(err)) {
      return queueOffline();
    }
    throw err;
  }
}
