import { supabase } from '../lib/supabaseClient';
import { type AttendanceLog, type AttendanceStatus, type AttendancePresence, type PunctualityStatus } from './types';
import { getCachedAvatar } from '../lib/avatarCache';
import { createSyncOperationId, getStorageAdapter, type QueueEnqueueInput } from '../lib/storage';
import { dispatchNotificationSafe } from './notificationService';

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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DbAttendanceViewRow {
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
  notes: string | null;
  source: string | null;
  log_status: string | null;
  lat: number | null;
  lng: number | null;
  hr_status: string | null;
}

export function isAttendanceFinalized(targetDate: string = getLocalDateString(), cutoffHour = 17): boolean {
  const now = new Date();
  const todayStr = getLocalDateString(now);
  if (targetDate < todayStr) return true;
  if (targetDate === todayStr && now.getHours() >= cutoffHour) return true;
  return false;
}

export async function finalizeDailyAttendance(targetDate: string = getLocalDateString(), cutoffHour = 17): Promise<number> {
  try {
    const isFinalized = isAttendanceFinalized(targetDate, cutoffHour);

    // Only finalize if targetDate is a past date OR today after cutoff hour (5:00 PM)
    if (!isFinalized) {
      return 0;
    }

    // 1. Fetch active riders
    const { data: riders, error: riderErr } = await supabase
      .from('riders')
      .select('id, name');

    if (riderErr || !riders || riders.length === 0) return 0;

    // 2. Fetch existing attendance records for targetDate
    const { data: existingLogs, error: logErr } = await supabase
      .from('attendance_logs')
      .select('rider_id')
      .eq('date', targetDate);

    if (logErr) return 0;

    const existingRiderIds = new Set((existingLogs || []).map(l => l.rider_id));

    // 3. Find riders without attendance logs for targetDate
    const missingRiders = riders.filter(r => !existingRiderIds.has(r.id));
    if (missingRiders.length === 0) return 0;

    // 4. Create auto-generated absent records
    const newRecords = missingRiders.map(r => ({
      rider_id: r.id,
      date: targetDate,
      time_in: null,
      time_out: null,
      hours: 0,
      status: 'absent',
      source: 'system',
      notes: 'Auto-generated absent record by system cutoff'
    }));

    const { error: insertErr } = await supabase
      .from('attendance_logs')
      .insert(newRecords);

    if (insertErr) {
      console.warn('[AttendanceService] Failed to insert auto-absent logs:', insertErr);
      return 0;
    }

    console.log(`[AttendanceService] Finalized ${newRecords.length} auto-absent records for ${targetDate}`);
    return newRecords.length;
  } catch (err) {
    console.error('[AttendanceService] Error in finalizeDailyAttendance:', err);
    return 0;
  }
}

export async function getAttendanceLogs(filters?: {
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  zoneId?: string;
  riderId?: string;
}, options: { finalizeDaily?: boolean } = {}): Promise<AttendanceLog[]> {
  // Trigger auto-absent finalization for requested dates
  if (options.finalizeDaily !== false) {
    const queryDate = filters?.dateFrom || getLocalDateString();
    await finalizeDailyAttendance(queryDate).catch(err => console.warn('Finalization notice:', err));
  }

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
    return [];
  }

  let result: AttendanceLog[] = ((data as unknown as DbAttendanceViewRow[]) || []).map((row: DbAttendanceViewRow) => {
    const cached = getCachedAvatar(row.rider_id);
    const realPhoto = row.rider_avatar || cached || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.rider_name || '')}`;
    const isLate = row.log_status === 'late' || row.hr_status === 'Late';
    const isPresent = !!row.time_in || row.log_status === 'present' || isLate;
    const presence = (row.log_status === 'on_leave' ? 'on_leave' : isPresent ? 'present' : 'absent');
    const punctuality = (isLate ? 'late' : isPresent ? 'on_time' : 'none');

    return {
      id: row.id,
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
      status: (isLate ? 'late' : isPresent ? 'present' : 'absent') as AttendanceStatus,
      presence: presence as AttendancePresence,
      punctuality: punctuality as PunctualityStatus,
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

  if (riderIds.length > 0 && dates.length > 0) {
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
    present: todays.filter((l) => l.status === 'present').length,
    late: todays.filter((l) => l.status === 'late').length,
    absent: todays.filter((l) => l.status === 'absent').length,
    onLeave: todays.filter((l) => l.status === 'on_leave').length
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

export type HrLogStatus = 'Complete' | 'Incomplete' | 'Absent' | 'Late';

export function deriveHrStatus(log: AttendanceLog): HrLogStatus {
  if (!log.timeIn) return 'Absent';
  if (log.timeIn && log.timeOut) return 'Complete';
  if (log.status === 'late') return 'Late';
  return 'Incomplete';
}

export function exportLogsCsv(logs: AttendanceLog[], filename = 'attendance_logs.csv') {
  const headers = ['Rider Name', 'Date', 'Time In', 'Time Out', 'Hours', 'Zone', 'Status', 'Source'];
  const rows = logs.map((l) => [
    `"${l.riderName.replace(/"/g, '""')}"`,
    l.date,
    l.timeIn || '',
    l.timeOut || '',
    l.hours ? l.hours.toFixed(2) : '0.00',
    `"${l.zoneName.replace(/"/g, '""')}"`,
    l.status,
    l.source
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function getRiderAttendanceInDateRange(riderId: string, dateFrom: string, dateTo: string): Promise<AttendanceLog[]> {
  return getAttendanceLogs(
    { riderId, dateFrom, dateTo },
    { finalizeDaily: false }
  );
}

export async function recordTimeIn(riderId: string, zoneId?: string, cutoffHour = 17): Promise<AttendanceLog | null> {
  const today = getLocalDateString();

  // Strictly enforce cutoff finalization rule: Reject time-in if attendance is finalized
  if (isAttendanceFinalized(today, cutoffHour)) {
    throw new Error("Attendance Closed: Today's attendance has already been finalized.");
  }

  const now = new Date().toISOString();
  const logId = createSyncOperationId();

  if (!navigator.onLine) {
    console.log('[OfflineSync] Offline detected. Queuing TIME_IN event...', logId);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'TIME_IN',
        riderId,
        idempotencyKey: logId,
        eventTimestamp: now,
        payload: {
          id: logId,
          attendance_log_id: logId,
          rider_id: riderId,
          date: today,
          time_in: now,
          status: 'present',
          source: 'face-scan'
        },
        priority: 1
      });
    } catch (err) {
      console.error('[OfflineSync] Failed to enqueue TIME_IN event:', err);
      throw new Error('Unable to save Time In for later synchronization.');
    }

    return {
      id: logId,
      riderId,
      riderName: '',
      riderAvatar: '',
      date: today,
      timeIn: toHHMM(now),
      timeOut: null,
      rawTimeIn: now,
      rawTimeOut: null,
      hours: 0,
      zoneId: zoneId || '',
      zoneName: '',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: []
    };
  }

  // Check if an existing system-generated absent record exists for today
  const { data: existingSystemLog } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('rider_id', riderId)
    .eq('date', today)
    .eq('source', 'system')
    .maybeSingle();

  const targetLogId = existingSystemLog?.id || logId;

  const { data, error } = await supabase
    .from('attendance_logs')
    .upsert({
      id: targetLogId,
      rider_id: riderId,
      date: today,
      time_in: now,
      status: 'present',
      source: 'face-scan',
      notes: null
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error recording time-in on Supabase, falling back to local queue:', error);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'TIME_IN',
        riderId,
        idempotencyKey: logId,
        eventTimestamp: now,
        payload: {
          id: targetLogId,
          attendance_log_id: targetLogId,
          rider_id: riderId,
          date: today,
          time_in: now,
          status: 'present',
          source: 'face-scan'
        },
        priority: 1
      });
    } catch (err) {
      console.error('[OfflineSync] Failed to enqueue TIME_IN fallback event:', err);
      throw new Error('Unable to save Time In for later synchronization.');
    }

    return {
      id: targetLogId,
      riderId,
      riderName: '',
      riderAvatar: '',
      date: today,
      timeIn: toHHMM(now),
      timeOut: null,
      rawTimeIn: now,
      rawTimeOut: null,
      hours: 0,
      zoneId: zoneId || '',
      zoneName: '',
      status: 'present',
      presence: 'present',
      punctuality: 'on_time',
      source: 'face-scan',
      events: []
    };
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

  return {
    id: data.id,
    riderId: data.rider_id,
    riderName: '',
    riderAvatar: '',
    date: data.date,
    timeIn: toHHMM(data.time_in),
    timeOut: null,
    rawTimeIn: data.time_in,
    rawTimeOut: null,
    hours: 0,
    zoneId: zoneId || '',
    zoneName: '',
    status: 'present',
    presence: 'present',
    punctuality: 'on_time',
    source: 'face-scan',
    events: []
  };
}

export interface TimeOutContext {
  riderId: string;
  date: string;
  lat?: number;
  lng?: number;
}

export function buildTimeOutQueueOperation(
  logId: string,
  context: TimeOutContext,
  eventTimestamp: string,
  idempotencyKey: string
): QueueEnqueueInput {
  const coordinates = context.lat != null && context.lng != null
    ? { lat: context.lat, lng: context.lng }
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
  const now = new Date().toISOString();
  const idempotencyKey = createSyncOperationId();
  const queuedOperation = buildTimeOutQueueOperation(logId, context, now, idempotencyKey);

  if (!navigator.onLine) {
    console.log('[OfflineSync] Offline detected. Queuing TIME_OUT event...', logId);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue(queuedOperation);
    } catch (err) {
      console.error('[OfflineSync] Failed to enqueue TIME_OUT event:', err);
      throw new Error('Unable to save Time Out for later synchronization.');
    }
    return true;
  }

  const { data, error } = await supabase
    .from('attendance_logs')
    .update({
      time_out: now
    })
    .eq('id', logId)
    .eq('rider_id', context.riderId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('Error recording time-out on Supabase, falling back to local queue:', error || 'Attendance row not found');
    try {
      const storage = getStorageAdapter();
      await storage.enqueue(queuedOperation);
    } catch (err) {
      console.error('[OfflineSync] Failed to enqueue TIME_OUT fallback event:', err);
      throw new Error('Unable to save Time Out for later synchronization.');
    }
    return true;
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
}
