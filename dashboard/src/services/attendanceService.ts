import { supabase } from '../lib/supabaseClient';
import { type AttendanceLog, type AttendanceStatus, type AttendancePresence, type PunctualityStatus } from './types';
import { getCachedAvatar } from '../lib/avatarCache';
import { getStorageAdapter } from '../lib/storage';
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

export async function getAttendanceLogs(filters?: {
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  zoneId?: string;
}): Promise<AttendanceLog[]> {
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
  const logs = await getAttendanceLogs({ dateFrom, dateTo });
  return logs.filter(l => l.riderId === riderId);
}

export async function recordTimeIn(riderId: string, zoneId?: string): Promise<AttendanceLog | null> {
  const today = getLocalDateString();
  const now = new Date().toISOString();
  const logId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-timein`;

  if (!navigator.onLine) {
    console.log('[OfflineSync] Offline detected. Queuing TIME_IN event...', logId);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'TIME_IN',
        payload: {
          id: logId,
          rider_id: riderId,
          date: today,
          time_in: now,
          status: 'present',
          source: 'face-scan'
        },
        priority: 1
      });
    } catch (err) {
      console.warn('[OfflineSync] Failed to enqueue TIME_IN event:', err);
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

  const { data, error } = await supabase
    .from('attendance_logs')
    .insert({
      id: logId,
      rider_id: riderId,
      date: today,
      time_in: now,
      status: 'present',
      source: 'face-scan'
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error recording time-in on Supabase, falling back to local queue:', error);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'TIME_IN',
        payload: {
          id: logId,
          rider_id: riderId,
          date: today,
          time_in: now,
          status: 'present',
          source: 'face-scan'
        },
        priority: 1
      });
    } catch (err) {
      console.warn('[OfflineSync] Failed to enqueue TIME_IN fallback event:', err);
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

export async function recordTimeOut(logId: string): Promise<boolean> {
  const now = new Date().toISOString();

  if (!navigator.onLine) {
    console.log('[OfflineSync] Offline detected. Queuing TIME_OUT event...', logId);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'TIME_OUT',
        payload: {
          id: logId,
          time_out: now
        },
        priority: 1
      });
    } catch (err) {
      console.warn('[OfflineSync] Failed to enqueue TIME_OUT event:', err);
    }
    return true;
  }

  const { error } = await supabase
    .from('attendance_logs')
    .update({
      time_out: now
    })
    .eq('id', logId);

  if (error) {
    console.error('Error recording time-out on Supabase, falling back to local queue:', error);
    try {
      const storage = getStorageAdapter();
      await storage.enqueue({
        action: 'TIME_OUT',
        payload: {
          id: logId,
          time_out: now
        },
        priority: 1
      });
    } catch (err) {
      console.warn('[OfflineSync] Failed to enqueue TIME_OUT fallback event:', err);
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
    actionLink: '/attendance',
    targetRoles: ['hr', 'admin']
  });

  return true;
}
