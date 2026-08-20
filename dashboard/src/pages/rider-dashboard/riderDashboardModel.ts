import type {
  CachedDashboardPayload,
  DBAttendanceRow,
  DBRiderRow,
} from '../../services/riderCacheService';
import type { Rider } from '../../services/types';

export interface DashboardAttendanceLog {
  id: string;
  rider_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  hours: number | null;
  status: string;
  source?: string | null;
}

export interface DashboardViolation {
  id: string;
  rider_id: string;
  zone_name: string;
  type: string;
  lat: number;
  lng: number;
  created_at: string;
  read: boolean;
  resolved: boolean;
}

export interface DashboardStats {
  daysPresent: number;
  hoursThisWeek: number;
  violationsThisMonth: number;
}

export interface DashboardAttendanceState {
  id: string | null;
  timeIn: string | null;
  timeOut: string | null;
}

export interface DashboardActiveViolation {
  lat: number;
  lng: number;
  zoneName: string;
}

export type DashboardRider = Rider & { faceDescriptor?: number[] | null };

export interface DashboardPayloadState {
  resolvedRiderId: string;
  rider: DashboardRider | undefined;
  attendance: DashboardAttendanceState;
  activeViolation: DashboardActiveViolation | null;
  monthAttendanceLogs: DBAttendanceRow[];
  stats: DashboardStats;
}

export interface WeeklyBreakdownDay {
  name: string;
  dateLabel: string;
  hours: number;
  status: string;
}

export function nowHHMM(d: Date = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function toHHMM(dateStr: string | null): string | null {
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

export function format12h(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = (h + 11) % 12 + 1;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function diffPretty(fromHHMM: string, to: Date = new Date()) {
  const [h, m] = fromHHMM.split(':').map(Number);
  const start = new Date();
  start.setHours(h, m, 0, 0);
  let diff = Math.max(0, to.getTime() - start.getTime());
  const hours = Math.floor(diff / 3600000);
  diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);
  return `${hours}h ${String(mins).padStart(2, '0')}m`;
}

export function getLocalDateString(d: Date = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function mapDbRiderToDashboardRider(dbRider: DBRiderRow): DashboardRider {
  return {
    id: dbRider.id,
    name: dbRider.name,
    avatar: dbRider.face_image_url || dbRider.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(dbRider.name)}`,
    zoneId: dbRider.zone_id,
    status: dbRider.status,
    lat: dbRider.lat || 0,
    lng: dbRider.lng || 0,
    speed: dbRider.speed || 0,
    shift: (dbRider.shift || 'Morning').toLowerCase() as 'morning' | 'afternoon' | 'evening',
    lastPing: dbRider.last_ping ? new Date(dbRider.last_ping).getTime() : 0,
    phone: dbRider.contact || '',
    riderCode: dbRider.mkb_id,
    faceDescriptor: dbRider.face_descriptor || null,
  };
}

export function deriveDashboardStats(
  monthLogs: Array<{ status: string; date: string; hours: number | null }>,
  firstDayOfWeekStr: string,
  violationCount: number,
): DashboardStats {
  let presentCount = 0;
  let weekHours = 0;

  for (const log of monthLogs) {
    if (log.status === 'present' || log.status === 'late') {
      presentCount++;
    }
    if (log.date >= firstDayOfWeekStr) {
      weekHours += (log.hours || 0);
    }
  }

  return {
    daysPresent: presentCount,
    hoursThisWeek: Number(weekHours.toFixed(1)),
    violationsThisMonth: violationCount || 0,
  };
}

export function mapCachedDashboardPayloadToState(
  payload: CachedDashboardPayload,
  firstDayOfWeekStr: string,
): DashboardPayloadState {
  const monthAttendanceLogs = payload.monthAttendance || [];
  const violationData = payload.latestViolation;

  return {
    resolvedRiderId: payload.resolvedRiderId,
    rider: payload.dbRider ? mapDbRiderToDashboardRider(payload.dbRider) : undefined,
    attendance: payload.todayAttendance
      ? {
          id: payload.todayAttendance.id,
          timeIn: payload.todayAttendance.time_in ? toHHMM(payload.todayAttendance.time_in) : null,
          timeOut: payload.todayAttendance.time_out ? toHHMM(payload.todayAttendance.time_out) : null,
        }
      : { id: null, timeIn: null, timeOut: null },
    activeViolation: violationData && !violationData.resolved && violationData.lat && violationData.lng
      ? {
          lat: violationData.lat,
          lng: violationData.lng,
          zoneName: violationData.zone_name || 'Talon-Talon',
        }
      : null,
    monthAttendanceLogs,
    stats: deriveDashboardStats(monthAttendanceLogs, firstDayOfWeekStr, payload.monthViolationCount),
  };
}

export function buildWeeklyBreakdown(
  monthAttendanceLogs: Array<{ date: string; hours: number | null; status: string }>,
  todayDate: Date = new Date(),
): WeeklyBreakdownDay[] {
  const dayOfWeek = todayDate.getDay();
  const diff = todayDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

  const monday = new Date(todayDate.getFullYear(), todayDate.getMonth(), diff);
  const days: WeeklyBreakdownDay[] = [];
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = getLocalDateString(d);
    const log = monthAttendanceLogs.find(l => l.date === dateStr);
    days.push({
      name: weekdays[i],
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      hours: log ? (log.hours || 0) : 0,
      status: log ? log.status : 'no_log',
    });
  }

  return days;
}

export function deriveAttendanceAction(
  isClosed: boolean,
  timeIn: string | null,
  timeOut: string | null,
): 'closed' | 'completed' | 'time-out' | 'time-in' {
  return isClosed
    ? 'closed'
    : timeIn && timeOut
      ? 'completed'
      : timeIn
        ? 'time-out'
        : 'time-in';
}
