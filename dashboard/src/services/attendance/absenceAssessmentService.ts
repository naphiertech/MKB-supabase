import { supabase } from '../../lib/supabaseClient';

export type AbsenceAssessmentStatus =
  | 'excused'
  | 'unexcused'
  | 'pending_review'
  | 'not_absent'
  | 'not_applicable';

export interface AbsenceAssessmentApiRow {
  rider_id: string;
  business_date: string;
  effective_status: string | null;
  context_code: string | null;
  expected_to_work: boolean;
  is_finalized: boolean;
  assessment_status: AbsenceAssessmentStatus;
  assessment_reason: string;
  policy_version_id: string;
  policy_version_number: number;
  policy_type: 'provisional' | 'official';
  attendance_log_id: string | null;
}

export interface AbsenceAssessmentRow {
  riderId: string;
  businessDate: string;
  effectiveStatus: string | null;
  contextCode: string | null;
  expectedToWork: boolean;
  isFinalized: boolean;
  assessmentStatus: AbsenceAssessmentStatus;
  assessmentReason: string;
  policyVersionId: string;
  policyVersionNumber: number;
  policyType: 'provisional' | 'official';
  attendanceLogId: string | null;
}

export interface ListAbsenceAssessmentsInput {
  startDate: string;
  endDate: string;
  hubId?: string | null;
  riderId?: string | null;
  assessmentStatus?: AbsenceAssessmentStatus | null;
  limit?: number;
  offset?: number;
}

export const MAX_RANGE_DAYS = 32;
export const MAX_PAGE_SIZE = 500;

export const VALID_ASSESSMENT_STATUSES: readonly AbsenceAssessmentStatus[] = [
  'excused',
  'unexcused',
  'pending_review',
  'not_absent',
  'not_applicable',
] as const;

export const ABSENCE_ASSESSMENT_STATUS_LABELS: Record<AbsenceAssessmentStatus, string> = {
  excused: 'Excused',
  unexcused: 'Unexcused',
  pending_review: 'Pending Review',
  not_absent: 'Not Absent',
  not_applicable: 'Not Applicable',
};

export const ABSENCE_ASSESSMENT_REASON_LABELS: Record<string, string> = {
  actual_attendance: 'Actual Attendance',
  published_day_off: 'Published Day Off',
  approved_leave: 'Approved Leave',
  accepted_notice: 'Accepted Notice',
  leave_pending_review: 'Leave Pending Review',
  notice_pending_review: 'Notice Pending Review',
  leave_rejected: 'Leave Rejected',
  notice_rejected: 'Notice Rejected',
  leave_withdrawn: 'Leave Withdrawn',
  notice_withdrawn: 'Notice Withdrawn',
  leave_cancelled: 'Leave Cancelled',
  notice_cancelled: 'Notice Cancelled',
  no_notice: 'No Notice',
};

export function getAssessmentStatusLabel(status: AbsenceAssessmentStatus | string | null | undefined): string {
  if (!status) return '—';
  return ABSENCE_ASSESSMENT_STATUS_LABELS[status as AbsenceAssessmentStatus] || status;
}

export function getAssessmentReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '—';
  return ABSENCE_ASSESSMENT_REASON_LABELS[reason] || reason;
}

function isValidIsoDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function getDayDiff(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

export function mapAbsenceAssessmentRow(row: AbsenceAssessmentApiRow): AbsenceAssessmentRow {
  return {
    riderId: row.rider_id,
    businessDate: row.business_date,
    effectiveStatus: row.effective_status ?? null,
    contextCode: row.context_code ?? null,
    expectedToWork: Boolean(row.expected_to_work),
    isFinalized: Boolean(row.is_finalized),
    assessmentStatus: row.assessment_status,
    assessmentReason: row.assessment_reason,
    policyVersionId: row.policy_version_id,
    policyVersionNumber: Number(row.policy_version_number),
    policyType: row.policy_type,
    attendanceLogId: row.attendance_log_id ?? null,
  };
}

export async function listAbsenceAssessments(
  input: ListAbsenceAssessmentsInput
): Promise<AbsenceAssessmentRow[]> {
  const {
    startDate,
    endDate,
    hubId = null,
    riderId = null,
    assessmentStatus = null,
    limit = 500,
    offset = 0,
  } = input;

  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate < startDate) {
    throw new Error('A valid Absence assessment date range is required.');
  }

  const rangeDays = getDayDiff(startDate, endDate);
  if (rangeDays > MAX_RANGE_DAYS) {
    throw new Error(`Absence assessment reads are limited to ${MAX_RANGE_DAYS} calendar days.`);
  }

  if (limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new Error(`Absence assessment page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }

  if (offset < 0 || offset > 100000) {
    throw new Error('Absence assessment page offset must be between 0 and 100000.');
  }

  if (assessmentStatus && !VALID_ASSESSMENT_STATUSES.includes(assessmentStatus)) {
    throw new Error(`Unsupported assessment status: ${assessmentStatus}`);
  }

  const { data, error } = await supabase.rpc('list_rider_absence_assessments', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_hub_id: hubId,
    p_rider_id: riderId,
    p_assessment_status: assessmentStatus,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    throw error;
  }

  const rows = (data || []) as unknown as AbsenceAssessmentApiRow[];
  return rows.map(mapAbsenceAssessmentRow);
}
