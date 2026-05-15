// Attendance service — stubbed for Magic Patterns
// TODO: Replace with Supabase queries in production
import {
  attendanceLogs,
  type AttendanceLog,
  type AttendanceStatus } from
'./mockData';

export async function getAttendanceLogs(filters?: {
  status?: AttendanceStatus;
  dateFrom?: string;
  dateTo?: string;
  zoneId?: string;
}): Promise<AttendanceLog[]> {
  // TODO: supabase.from('attendance_logs').select('*').match(...)
  let result = [...attendanceLogs];
  if (filters?.status)
  result = result.filter((l) => l.status === filters.status);
  if (filters?.dateFrom)
  result = result.filter((l) => l.date >= filters.dateFrom!);
  if (filters?.dateTo) result = result.filter((l) => l.date <= filters.dateTo!);
  if (filters?.zoneId)
  result = result.filter((l) => l.zoneId === filters.zoneId);
  return Promise.resolve(result.sort((a, b) => b.date.localeCompare(a.date)));
}

export async function getTodayKpis() {
  const today = new Date().toISOString().slice(0, 10);
  const todays = attendanceLogs.filter((l) => l.date === today);
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
  const today = new Date().toISOString().slice(0, 10);
  const todays = attendanceLogs.filter((l) => l.date === today);
  const onDuty = todays.filter((l) => !!l.timeIn).length;
  const complete = todays.filter((l) => !!l.timeIn && !!l.timeOut).length;
  const absent = todays.filter((l) => l.status === 'absent' || !l.timeIn).length;
  const pending = todays.filter(
    (l) =>
    l.source === 'manual' && l.status !== 'absent' ||
    !!l.timeIn && !l.timeOut && l.status !== 'on_leave'
  ).length;
  return { onDuty, complete, absent, pending };
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
fileName = 'attendance.csv')
{
  const headers = [
  'Rider Name',
  'Rider ID',
  'Date',
  'Zone',
  'Time-In',
  'Time-Out',
  'Hours',
  'Status',
  'Source'];

  const rows = logs.map((l) => [
  l.riderName,
  l.riderId,
  l.date,
  l.zoneName,
  l.timeIn ?? '',
  l.timeOut ?? '',
  l.hours?.toString() ?? '',
  deriveHrStatus(l),
  l.source]
  );
  const escape = (v: string) =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const csv =
  [headers, ...rows].
  map((r) => r.map((c) => escape(String(c ?? ''))).join(',')).
  join('\n') + '\n';

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