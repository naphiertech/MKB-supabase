import { supabase } from '../../lib/supabaseClient';
import type { AttendanceLog } from '../types';

export type AttendanceContextStatus = 'present' | 'late' | 'absent' | 'on_leave' | 'day_off' | 'not_finalized';
export type AttendanceContextCode =
  | 'approved_leave'
  | 'leave_rejected'
  | 'leave_pending'
  | 'leave_withdrawn'
  | 'leave_cancelled'
  | 'accepted_notice'
  | 'notice_rejected'
  | 'notice_pending'
  | 'notice_withdrawn'
  | 'notice_cancelled'
  | 'no_notice'
  | 'worked_during_approved_leave'
  | 'worked_despite_accepted_notice'
  | 'manual_legacy_on_leave'
  | 'published_day_off';
export type AttendanceContextExcusal = 'excused' | 'not_excused' | 'not_applicable';
export type AttendanceContextCompletion = 'complete' | 'active' | 'missing_time_out' | 'absent' | 'not_expected' | 'not_finalized';
export type AttendanceContextPunctuality = 'on_time' | 'late' | 'none';
export type AbsenceRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'cancelled';
export type AbsenceRequestKind = 'planned_leave' | 'absence_notice';
export type AttendanceSource = 'face-scan' | 'manual' | 'system';

export const ATTENDANCE_CONTEXT_LABELS: Record<AttendanceContextCode, string> = {
  approved_leave: 'Approved Leave',
  leave_rejected: 'Leave Rejected',
  leave_pending: 'Leave Pending Review',
  leave_withdrawn: 'Leave Withdrawn',
  leave_cancelled: 'Leave Cancelled',
  accepted_notice: 'Accepted Notice',
  notice_rejected: 'Notice Rejected',
  notice_pending: 'Notice Pending Review',
  notice_withdrawn: 'Notice Withdrawn',
  notice_cancelled: 'Notice Cancelled',
  no_notice: 'No Notice',
  worked_during_approved_leave: 'Worked During Approved Leave',
  worked_despite_accepted_notice: 'Worked Despite Accepted Notice',
  manual_legacy_on_leave: 'Manual / Legacy',
  published_day_off: 'Published Day Off',
};

export function getAttendanceContextLabel(code: AttendanceContextCode | null | undefined): string | null {
  return code ? ATTENDANCE_CONTEXT_LABELS[code] : null;
}

export interface AttendanceContextApiRow {
  rider_id: string;
  rider_name: string;
  rider_mkb_id: string | null;
  rider_avatar: string | null;
  rider_lat: number | null;
  rider_lng: number | null;
  zone_id: string | null;
  zone_name: string | null;
  business_date: string;
  attendance_log_id: string | null;
  raw_status: 'present' | 'late' | 'absent' | 'on_leave' | null;
  time_in: string | null;
  time_out: string | null;
  hours: number | null;
  attendance_source: AttendanceSource | null;
  effective_status: AttendanceContextStatus;
  completion_state: AttendanceContextCompletion;
  punctuality_state: AttendanceContextPunctuality;
  is_finalized: boolean;
  expected_to_work: boolean;
  expected_work_basis: string;
  planned_leave_state: AbsenceRequestStatus | null;
  planned_leave_effective: boolean;
  planned_leave_request_id: string | null;
  planned_leave_request_revision: number | null;
  absence_notice_state: AbsenceRequestStatus | null;
  absence_notice_effective: boolean;
  absence_notice_request_id: string | null;
  absence_notice_request_revision: number | null;
  excusal_state: AttendanceContextExcusal;
  context_code: AttendanceContextCode | null;
  context_request_id: string | null;
  context_request_kind: AbsenceRequestKind | null;
  context_request_revision: number | null;
  hub_id: string | null;
  schedule_id: string | null;
  schedule_day_kind: 'work' | 'day_off' | null;
}

export interface AttendanceContextLog {
  id: string | null;
  attendanceLogId: string | null;
  riderId: string;
  riderName: string;
  riderAvatar: string;
  faceScanUrl?: string;
  riderCode: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  rawTimeIn: string | null;
  rawTimeOut: string | null;
  hours: number;
  zoneId: string;
  zoneName: string;
  rawStatus: AttendanceContextApiRow['raw_status'];
  status: AttendanceContextStatus;
  presence: AttendanceContextStatus;
  punctuality: AttendanceContextPunctuality;
  completionState: AttendanceContextCompletion;
  source: AttendanceSource | null;
  lat: number | null;
  lng: number | null;
  isFinalized: boolean;
  expectedToWork: boolean;
  expectedWorkBasis: string;
  plannedLeaveState: AbsenceRequestStatus | null;
  plannedLeaveEffective: boolean;
  plannedLeaveRequestId: string | null;
  plannedLeaveRequestRevision: number | null;
  absenceNoticeState: AbsenceRequestStatus | null;
  absenceNoticeEffective: boolean;
  absenceNoticeRequestId: string | null;
  absenceNoticeRequestRevision: number | null;
  excusalState: AttendanceContextExcusal;
  contextCode: AttendanceContextCode | null;
  contextRequestId: string | null;
  contextRequestKind: AbsenceRequestKind | null;
  contextRequestRevision: number | null;
  hubId: string | null;
  scheduleId: string | null;
  scheduleDayKind: 'work' | 'day_off' | null;
  events: { ts: string; type: 'enter' | 'exit' | 'idle'; zone: string }[];
}

export interface AttendanceContextQuery {
  fromDate: string;
  toDate: string;
  hubId?: string | null;
  riderId?: string | null;
}

export type AttendancePresentationLog = AttendanceLog | AttendanceContextLog;

export function getPresentationStatus(log: AttendancePresentationLog & { effectiveStatus?: AttendanceContextStatus }): AttendanceContextStatus {
  if (log.effectiveStatus) return log.effectiveStatus;
  if ('contextCode' in log) return log.status;
  if (log.presence === 'on_leave') return 'on_leave';
  return log.status;
}

export function getPresentationContextCode(log: AttendancePresentationLog): AttendanceContextCode | null {
  return 'contextCode' in log ? log.contextCode : null;
}

export function getPresentationCompletionState(log: AttendancePresentationLog): AttendanceContextCompletion {
  if ('completionState' in log) return log.completionState;
  return log.completionStatus || (log.timeIn ? (log.timeOut ? 'complete' : 'active') : 'absent');
}

/**
 * Authoritative check for whether an underlying raw attendance_logs record exists.
 * Distinguishes genuine attendance events from synthetic context rows (e.g. published Day Off or expected riders without a clock).
 */
export function hasUnderlyingAttendanceLog(log: AttendancePresentationLog): boolean {
  if ('attendanceLogId' in log && typeof log.attendanceLogId !== 'undefined') {
    return log.attendanceLogId !== null;
  }
  if ('rawStatus' in log) {
    return log.rawStatus !== null;
  }
  return log.id !== null;
}

const PAGE_SIZE = 500;
const MAX_WINDOW_DAYS = 32;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

export function mapAttendanceContextRow(row: AttendanceContextApiRow): AttendanceContextLog {
  return {
    id: row.attendance_log_id,
    attendanceLogId: row.attendance_log_id,
    riderId: row.rider_id,
    riderName: row.rider_name,
    riderAvatar: row.rider_avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.rider_name)}`,
    riderCode: row.rider_mkb_id || '',
    date: row.business_date,
    timeIn: row.time_in ? new Date(row.time_in).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' }) : null,
    timeOut: row.time_out ? new Date(row.time_out).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Manila' }) : null,
    rawTimeIn: row.time_in,
    rawTimeOut: row.time_out,
    hours: row.hours || 0,
    zoneId: row.zone_id || '',
    zoneName: row.zone_name || 'Unassigned',
    rawStatus: row.raw_status,
    status: row.effective_status,
    presence: row.effective_status,
    punctuality: row.punctuality_state,
    completionState: row.completion_state,
    source: row.attendance_source,
    lat: row.rider_lat,
    lng: row.rider_lng,
    isFinalized: row.is_finalized,
    expectedToWork: row.expected_to_work,
    expectedWorkBasis: row.expected_work_basis,
    plannedLeaveState: row.planned_leave_state,
    plannedLeaveEffective: row.planned_leave_effective,
    plannedLeaveRequestId: row.planned_leave_request_id,
    plannedLeaveRequestRevision: row.planned_leave_request_revision,
    absenceNoticeState: row.absence_notice_state,
    absenceNoticeEffective: row.absence_notice_effective,
    absenceNoticeRequestId: row.absence_notice_request_id,
    absenceNoticeRequestRevision: row.absence_notice_request_revision,
    excusalState: row.excusal_state,
    contextCode: row.context_code,
    contextRequestId: row.context_request_id,
    contextRequestKind: row.context_request_kind,
    contextRequestRevision: row.context_request_revision,
    hubId: row.hub_id,
    scheduleId: row.schedule_id,
    scheduleDayKind: row.schedule_day_kind,
    events: [],
  };
}

export function mergeAttendanceContextDetails(
  contextRows: AttendanceContextLog[],
  rawRows: AttendanceLog[],
): AttendanceContextLog[] {
  const detailsByKey = new Map(rawRows.map(row => [`${row.riderId}:${row.date}`, row]));
  return contextRows.map(row => {
    const detail = detailsByKey.get(`${row.riderId}:${row.date}`);
    if (!detail) return row;
    return {
      ...row,
      riderAvatar: detail.riderAvatar || row.riderAvatar,
      source: row.source || detail.source,
      lat: detail.lat ?? row.lat,
      lng: detail.lng ?? row.lng,
      events: detail.events,
    };
  });
}

export async function listAttendanceContext(query: AttendanceContextQuery): Promise<AttendanceContextLog[]> {
  if (!isValidDate(query.fromDate) || !isValidDate(query.toDate) || query.toDate < query.fromDate) {
    throw new Error('A valid Attendance context date range is required.');
  }

  const rows: AttendanceContextLog[] = [];
  let windowStart = query.fromDate;

  while (windowStart <= query.toDate) {
    const windowEnd = addDays(windowStart, MAX_WINDOW_DAYS - 1) < query.toDate
      ? addDays(windowStart, MAX_WINDOW_DAYS - 1)
      : query.toDate;
    let pageOffset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase.rpc('list_rider_attendance_context', {
        p_from_date: windowStart,
        p_to_date: windowEnd,
        p_hub_id: query.hubId ?? null,
        p_rider_id: query.riderId ?? null,
        p_page_size: PAGE_SIZE,
        p_page_offset: pageOffset,
      });
      if (error) throw error;

      const page = (data || []) as unknown as AttendanceContextApiRow[];
      rows.push(...page.map(mapAttendanceContextRow));
      hasMore = page.length === PAGE_SIZE;
      pageOffset += PAGE_SIZE;
    }

    if (windowEnd === query.toDate) break;
    windowStart = addDays(windowEnd, 1);
  }

  return rows;
}
