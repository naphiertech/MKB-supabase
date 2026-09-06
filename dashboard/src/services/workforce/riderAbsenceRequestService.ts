import { supabase } from '../../lib/supabaseClient';
import { invalidateAttendanceContext } from '../attendance/attendanceContextInvalidation';
import { createSyncOperationId, getStorageAdapter } from '../../lib/storage';
import type { Database, Json } from '../../types/supabase';

export type RiderAbsenceRequestKind = Database['public']['Enums']['rider_absence_request_kind'];
export type RiderAbsenceRequestStatus = Database['public']['Enums']['rider_absence_request_status'];

export interface PlannedLeaveInput {
  startDate: string;
  endDate: string;
  reason: string;
  requestKey?: string;
}

export interface AbsenceNoticeInput {
  date: string;
  reason: string;
  requestKey?: string;
}

export interface RiderAbsenceRequest {
  id: string;
  riderId: string;
  riderName: string;
  riderMkbId: string;
  requestKind: RiderAbsenceRequestKind;
  startDate: string;
  endDate: string;
  hubId: string;
  hubName: string;
  reason: string | null;
  submittedBy: string;
  submittedByName: string | null;
  submittedAt: string;
  status: RiderAbsenceRequestStatus;
  revision: number;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  withdrawnBy: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

type RiderAbsenceRequestRpcRow = Database['public']['Functions']['list_rider_absence_requests']['Returns'][number];

export interface RiderAbsenceRequestDetail {
  request: Record<string, unknown>;
  audit: Array<Record<string, unknown>>;
}

const CACHE_PREFIX = 'rider_absence_request_cache_v1:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 1 as const;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface RiderAbsenceDateWindow {
  fromDate: string;
  toDate: string;
}

function parseDateOnly(value: string): Date | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function trimmed(value: string): string {
  return value.trim();
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getManilaBusinessDate(value = new Date()): string {
  const parts = Object.fromEntries(
    MANILA_DATE_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getRiderAbsenceWindowForDate(value: string): RiderAbsenceDateWindow {
  const date = parseDateOnly(value);
  if (!date) throw new Error('A valid business date is required.');
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { fromDate: formatDateOnly(from), toDate: formatDateOnly(to) };
}

export function getCurrentRiderAbsenceWindow(value = new Date()): RiderAbsenceDateWindow {
  return getRiderAbsenceWindowForDate(getManilaBusinessDate(value));
}

export function shiftRiderAbsenceWindow(fromDate: string, monthDelta: number): RiderAbsenceDateWindow {
  const date = parseDateOnly(fromDate);
  if (!date || date.getUTCDate() !== 1 || !Number.isInteger(monthDelta)) {
    throw new Error('A valid month window is required.');
  }
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthDelta, 1));
  return getRiderAbsenceWindowForDate(formatDateOnly(shifted));
}

export function validatePlannedLeaveInput(input: Pick<PlannedLeaveInput, 'startDate' | 'endDate' | 'reason'>): string | null {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start || !end) return 'Enter a valid start and end business date.';
  if (end.getTime() < start.getTime()) return 'The end date cannot be before the start date.';
  if (trimmed(input.reason).length < 3) return 'Add a reason of at least three characters.';
  return null;
}

export function validateAbsenceNoticeInput(input: Pick<AbsenceNoticeInput, 'date' | 'reason'>): string | null {
  if (!parseDateOnly(input.date)) return 'Enter a valid business date.';
  if (trimmed(input.reason).length < 3) return 'Add a reason of at least three characters.';
  return null;
}

function assertDateRange(fromDate: string, toDate: string): void {
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  if (!from || !to || to.getTime() < from.getTime()) {
    throw new Error('The Leave & Absence date range is invalid.');
  }
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (dayCount > 92) throw new Error('Leave & Absence reads are limited to 93 calendar days.');
}

function getErrorMessage(error: { message?: string } | null, fallback: string): string {
  return error?.message || fallback;
}

function mapRequest(row: RiderAbsenceRequestRpcRow): RiderAbsenceRequest {
  return {
    id: row.id,
    riderId: row.rider_id,
    riderName: row.rider_name,
    riderMkbId: row.rider_mkb_id,
    requestKind: row.request_kind,
    startDate: row.start_date,
    endDate: row.end_date,
    hubId: row.hub_id,
    hubName: row.hub_name,
    reason: row.reason,
    submittedBy: row.submitted_by,
    submittedByName: row.submitted_by_name,
    submittedAt: row.submitted_at,
    status: row.status,
    revision: row.revision,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    reviewReason: row.review_reason,
    withdrawnBy: row.withdrawn_by,
    withdrawnAt: row.withdrawn_at,
    withdrawalReason: row.withdrawal_reason,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export async function submitPlannedLeave(input: PlannedLeaveInput): Promise<string> {
  const validation = validatePlannedLeaveInput(input);
  if (validation) throw new Error(validation);

  const { data, error } = await supabase.rpc('submit_rider_absence_request', {
    p_request_kind: 'planned_leave',
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_reason: trimmed(input.reason),
    p_request_key: input.requestKey ?? createSyncOperationId(),
  });
  if (error) throw new Error(getErrorMessage(error, 'Unable to submit planned leave.'));
  invalidateAttendanceContext();
  return data;
}

export async function submitAbsenceNotice(input: AbsenceNoticeInput): Promise<string> {
  const validation = validateAbsenceNoticeInput(input);
  if (validation) throw new Error(validation);

  const { data, error } = await supabase.rpc('submit_rider_absence_request', {
    p_request_kind: 'absence_notice',
    p_start_date: input.date,
    p_end_date: input.date,
    p_reason: trimmed(input.reason),
    p_request_key: input.requestKey ?? createSyncOperationId(),
  });
  if (error) throw new Error(getErrorMessage(error, 'Unable to submit the Absence Notice.'));
  invalidateAttendanceContext();
  return data;
}

export async function withdrawRiderAbsenceRequest(
  requestId: string,
  expectedRevision: number,
  reason: string,
): Promise<string> {
  if (trimmed(reason).length < 3) throw new Error('A withdrawal reason of at least three characters is required.');
  const { data, error } = await supabase.rpc('withdraw_rider_absence_request', {
    p_request_id: requestId,
    p_expected_revision: expectedRevision,
    p_reason: trimmed(reason),
  });
  if (error) throw new Error(getErrorMessage(error, 'Unable to withdraw the request.'));
  invalidateAttendanceContext();
  return data;
}

export async function reviewRiderAbsenceRequest(
  requestId: string,
  expectedRevision: number,
  decision: 'approved' | 'rejected',
  reason: string,
): Promise<string> {
  if (trimmed(reason).length < 3) throw new Error('A review reason of at least three characters is required.');
  const { data, error } = await supabase.rpc('review_rider_absence_request', {
    p_request_id: requestId,
    p_expected_revision: expectedRevision,
    p_decision: decision,
    p_reason: trimmed(reason),
  });
  if (error) throw new Error(getErrorMessage(error, 'Unable to review the request.'));
  invalidateAttendanceContext();
  return data;
}

export async function cancelApprovedRiderAbsenceRequest(
  requestId: string,
  expectedRevision: number,
  reason: string,
): Promise<string> {
  if (trimmed(reason).length < 3) throw new Error('A cancellation reason of at least three characters is required.');
  const { data, error } = await supabase.rpc('cancel_approved_rider_absence_request', {
    p_request_id: requestId,
    p_expected_revision: expectedRevision,
    p_reason: trimmed(reason),
  });
  if (error) throw new Error(getErrorMessage(error, 'Unable to cancel the approved request.'));
  invalidateAttendanceContext();
  return data;
}

export async function listRiderAbsenceRequests(options: {
  fromDate: string;
  toDate: string;
  hubId?: string | null;
  riderId?: string | null;
  status?: RiderAbsenceRequestStatus | null;
  requestKind?: RiderAbsenceRequestKind | null;
}): Promise<RiderAbsenceRequest[]> {
  assertDateRange(options.fromDate, options.toDate);
  const { data, error } = await supabase.rpc('list_rider_absence_requests', {
    p_from_date: options.fromDate,
    p_to_date: options.toDate,
    p_hub_id: options.hubId ?? null,
    p_rider_id: options.riderId ?? null,
    p_status: options.status ?? null,
    p_request_kind: options.requestKind ?? null,
  });
  if (error) throw new Error(getErrorMessage(error, 'Unable to load Leave & Absence requests.'));
  return (data ?? []).map(mapRequest);
}

export async function getRiderAbsenceRequestDetail(requestId: string): Promise<RiderAbsenceRequestDetail> {
  const { data, error } = await supabase.rpc('get_rider_absence_request_detail', { p_request_id: requestId });
  if (error) throw new Error(getErrorMessage(error, 'Unable to load the request history.'));
  const payload = (data ?? {}) as { request?: Record<string, unknown>; audit?: Array<Record<string, unknown>> };
  return { request: payload.request ?? {}, audit: Array.isArray(payload.audit) ? payload.audit : [] };
}

export interface CachedRiderAbsenceRequests {
  userId: string;
  riderId: string;
  cacheVersion: typeof CACHE_VERSION;
  fromDate: string;
  toDate: string;
  requests: RiderAbsenceRequest[];
  cachedAt: string;
}

function cacheKey(userId: string, riderId: string, fromDate: string, toDate: string): string {
  return `${CACHE_PREFIX}${userId}:${riderId}:${fromDate}:${toDate}`;
}

function withoutPrivateReasons(request: RiderAbsenceRequest): RiderAbsenceRequest {
  return {
    ...request,
    reason: null,
    reviewReason: null,
    withdrawalReason: null,
    cancellationReason: null,
  };
}

export async function getCachedRiderAbsenceRequests(
  userId: string,
  riderId: string,
  fromDate: string,
  toDate: string,
): Promise<CachedRiderAbsenceRequests | null> {
  try {
    const cached = await getStorageAdapter().getItem<CachedRiderAbsenceRequests>(cacheKey(userId, riderId, fromDate, toDate));
    if (!cached) return null;
    if (
      cached.userId !== userId
      || cached.riderId !== riderId
      || cached.cacheVersion !== CACHE_VERSION
      || cached.fromDate !== fromDate
      || cached.toDate !== toDate
      || !Array.isArray(cached.requests)
    ) return null;
    return cached;
  } catch (error) {
    console.warn('[OfflineCache] Unable to read Rider Leave & Absence cache:', error);
    return null;
  }
}

export async function setCachedRiderAbsenceRequests(payload: CachedRiderAbsenceRequests): Promise<void> {
  try {
    await getStorageAdapter().setItem(
      cacheKey(payload.userId, payload.riderId, payload.fromDate, payload.toDate),
      {
        ...payload,
        cacheVersion: CACHE_VERSION,
        requests: payload.requests.map(withoutPrivateReasons),
      },
      CACHE_TTL_MS,
    );
  } catch (error) {
    console.warn('[OfflineCache] Unable to write Rider Leave & Absence cache:', error);
  }
}

export async function clearRiderAbsenceRequestCache(userId: string, riderId?: string): Promise<void> {
  try {
    const prefix = riderId ? `${CACHE_PREFIX}${userId}:${riderId}:` : `${CACHE_PREFIX}${userId}:`;
    const keys = await getStorageAdapter().getAllKeys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix)).map((key) => getStorageAdapter().removeItem(key)));
  } catch (error) {
    console.warn('[OfflineCache] Unable to clear Rider Leave & Absence cache:', error);
  }
}

// Keep this type import visible to consumers that need to narrow Supabase JSON
// returned by the detail RPC without making the service depend on any UI shape.
export type RiderAbsenceRequestJson = Json;
