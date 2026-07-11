import { supabase } from '../lib/supabaseClient';
import { type AttendanceLog, type AttendanceStatus } from './types';

// Helper to convert dynamic timestamps (timestamptz) back to HH:MM format expected by frontend UI
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

interface DbAttendanceLogRow {
  id: string;
  rider_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  hours: number | null;
  status: string;
  source: string;
  notes: string | null;
  riders: {
    name: string;
    avatar_url: string | null;
    face_image_url: string | null;
    zone_id: string;
    zones: { name: string } | { name: string }[] | null;
  } | {
    name: string;
    avatar_url: string | null;
    face_image_url: string | null;
    zone_id: string;
    zones: { name: string } | { name: string }[] | null;
  }[] | null;
}

export async function getAttendanceLogs(filters?: {
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  zoneId?: string;
}): Promise<AttendanceLog[]> {
  let query = supabase
    .from('attendance_logs')
    .select(`
      id,
      rider_id,
      date,
      time_in,
      time_out,
      hours,
      status,
      source,
      notes,
      riders (
        name,
        avatar_url,
        face_image_url,
        zone_id,
        zones (
          name
        )
      )
    `);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.dateFrom) {
    query = query.gte('date', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('date', filters.dateTo);
  }

  // Sort descending by date
  query = query.order('date', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching attendance logs:', error);
    return [];
  }

  // Map nested objects to match the original flat AttendanceLog shape
  let result: AttendanceLog[] = (data || []).map((row: DbAttendanceLogRow) => {
    const rider = Array.isArray(row.riders) ? row.riders[0] : row.riders;
    const zone = rider?.zones;
    const zoneName = Array.isArray(zone) ? zone[0]?.name : zone?.name;
    return {
      id: row.id,
      riderId: row.rider_id,
      riderName: rider?.name || 'Unknown Rider',
      riderAvatar: rider?.face_image_url || rider?.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rider?.name || '')}`,
      date: row.date,
      timeIn: toHHMM(row.time_in),
      timeOut: toHHMM(row.time_out),
      hours: row.hours || 0,
      zoneId: rider?.zone_id || '',
      zoneName: zoneName || 'No Zone',
      status: row.status as AttendanceStatus,
      source: row.source as 'face-scan' | 'manual',
      events: []
    };
  });

  // Fetch matching violations to build historical timelines
  const riderIds = result.map(r => r.riderId);
  const dates = result.map(r => r.date).filter(Boolean);

  if (riderIds.length > 0 && dates.length > 0) {
    try {
      const minDate = dates.reduce((a, b) => a < b ? a : b);
      const maxDate = dates.reduce((a, b) => a > b ? a : b);

      const { data: dbViolations } = await supabase
        .from('violations')
        .select('rider_id, zone_name, type, created_at')
        .in('rider_id', riderIds)
        .gte('created_at', `${minDate}T00:00:00Z`)
        .lte('created_at', `${maxDate}T23:59:59Z`);

      result = result.map(log => {
        const logEvents: AttendanceLog['events'] = [];

        // 1. Add clock-in enter event if timeIn exists
        if (log.timeIn) {
          logEvents.push({
            ts: log.timeIn,
            type: 'enter',
            zone: log.zoneName
          });
        }

        // 2. Add geofence exit violations for this rider on this date
        if (dbViolations && dbViolations.length > 0) {
          const matchingViolations = dbViolations.filter(v => {
            if (v.rider_id !== log.riderId) return false;
            const vDate = (v.created_at || '').split('T')[0] || (v.created_at || '').split(' ')[0];
            return vDate === log.date;
          });

          matchingViolations.forEach(v => {
            logEvents.push({
              ts: toHHMM(v.created_at) || '00:00',
              type: 'exit',
              zone: v.zone_name || log.zoneName
            });
          });
        }

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
  } else {
    // If no logs, fallback to clock-in only
    result = result.map(log => {
      const logEvents: AttendanceLog['events'] = [];
      if (log.timeIn) {
        logEvents.push({
          ts: log.timeIn,
          type: 'enter',
          zone: log.zoneName
        });
      }
      return { ...log, events: logEvents };
    });
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

/**
 * HR-focused KPIs for today.
 * - onDuty: any time-in recorded
 * - complete: has both time-in and time-out
 * - absent: status === 'absent' or no time-in
 * - pending: needs review — manual source OR has time-in but no time-out
 */
export async function getHrTodayKpis() {
  const today = getLocalDateString();
  const todays = await getAttendanceLogs({ dateFrom: today, dateTo: today });
  
  const onDuty = todays.filter((l) => !!l.timeIn).length;
  const complete = todays.filter((l) => !!l.timeIn && !!l.timeOut).length;
  const absent = todays.filter((l) => l.status === 'absent' || !l.timeIn).length;
  const pending = todays.filter(
    (l) =>
      (l.source === 'manual' && l.status !== 'absent') ||
      (!!l.timeIn && !l.timeOut && l.status !== 'on_leave')
  ).length;

  return { onDuty, complete, absent, pending };
}

export async function recordTimeIn(riderId: string): Promise<void> {
  const now = new Date();
  const dateStr = getLocalDateString(now);

  // Standard late cut-off rule: if signing in after 8:15 AM
  const isLate = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() > 15);
  const status = isLate ? 'late' : 'present';

  const { error } = await supabase
    .from('attendance_logs')
    .insert({
      rider_id: riderId,
      date: dateStr,
      time_in: now.toISOString(),
      source: 'face-scan',
      status: status
    });

  if (error) {
    console.error('Error recording time in:', error);
    throw error;
  }
}

export async function recordTimeOut(riderId: string): Promise<void> {
  const today = getLocalDateString();

  // Find today's existing log for this rider
  const { data: existing, error: findError } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('rider_id', riderId)
    .eq('date', today)
    .maybeSingle();

  if (findError) {
    console.error('Error finding today attendance log for sign-out:', findError);
    throw findError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('attendance_logs')
      .update({
        time_out: new Date().toISOString()
      })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Error updating time out:', updateError);
      throw updateError;
    }
  } else {
    // Failsafe: if no record exists for today, insert a complete row directly
    const now = new Date();
    const { error: insertError } = await supabase
      .from('attendance_logs')
      .insert({
        rider_id: riderId,
        date: today,
        time_in: now.toISOString(),
        time_out: now.toISOString(),
        source: 'face-scan',
        status: 'present'
      });

    if (insertError) {
      console.error('Failsafe sign-out insert failed:', insertError);
      throw insertError;
    }
  }
}

/** HR view status derived from raw attendance fields. */
export type HrLogStatus = 'Complete' | 'Incomplete' | 'Absent' | 'Late';

export function deriveHrStatus(log: AttendanceLog): HrLogStatus {
  if (log.status === 'absent' || !log.timeIn && log.status !== 'on_leave')
    return 'Absent';
  if (log.status === 'late') return 'Late';
  if (log.timeIn && log.timeOut) return 'Complete';
  return 'Incomplete';
}

/** Build a CSV string + trigger a download in the browser. */
export function exportLogsCsv(
  logs: AttendanceLog[],
  fileName = 'attendance.csv'
) {
  const headers = [
    'Rider Name',
    'Rider ID',
    'Date',
    'Zone',
    'Time-In',
    'Time-Out',
    'Hours',
    'Status',
    'Source'
  ];

  const rows = logs.map((l) => [
    l.riderName,
    l.riderId,
    l.date,
    l.zoneName,
    l.timeIn ?? '',
    l.timeOut ?? '',
    l.hours?.toString() ?? '',
    deriveHrStatus(l),
    l.source
  ]);

  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

  const csv =
    [headers, ...rows]
      .map((r) => r.map((c) => escape(String(c ?? ''))).join(','))
      .join('\n') + '\n';

  if (typeof window === 'undefined') return csv;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return csv;
}

// Fetch rider attendance logs in date range
export const getRiderAttendanceInDateRange = async (
  riderId: string,
  from: string,
  to: string
) => {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select('date, time_in')
    .eq('rider_id', riderId)
    .gte('date', from)
    .lte('date', to);

  if (error) throw error;
  return data || [];
};

