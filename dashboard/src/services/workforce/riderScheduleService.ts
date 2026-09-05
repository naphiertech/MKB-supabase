import { getStorageAdapter } from '../../lib/storage';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/supabase';

export type RiderScheduleDayKind = Database['public']['Enums']['rider_schedule_day_kind'];
export type RiderScheduleStatus = Database['public']['Enums']['rider_schedule_status'];

export interface RiderSchedule {
  id: string;
  riderId: string;
  riderName: string;
  riderMkbId: string;
  workDate: string;
  hubId: string;
  hubName: string;
  dayKind: RiderScheduleDayKind;
  startsAt: string | null;
  endsAt: string | null;
  status: RiderScheduleStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface RiderScheduleDraftInput {
  riderId: string;
  workDate: string;
  hubId: string;
  dayKind: RiderScheduleDayKind;
  startsAt: string | null;
  endsAt: string | null;
}

type RiderScheduleRpcRow = Database['public']['Functions']['list_rider_schedules']['Returns'][number];

const CACHE_PREFIX = 'rider_schedule_cache_v1:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MANILA_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function asDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('A valid business date is required.');
  }
  return date;
}

export function getManilaBusinessDate(value = new Date()): string {
  const parts = MANILA_DATE_PARTS.formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addBusinessDays(value: string, amount: number): string {
  const date = asDateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function startOfBusinessWeek(value: string): string {
  const date = asDateOnly(value);
  const day = date.getUTCDay();
  return addBusinessDays(value, day === 0 ? -6 : 1 - day);
}

export function validateRiderScheduleDraft(input: RiderScheduleDraftInput): string | null {
  if (!input.riderId) return 'Select a Rider.';
  try {
    asDateOnly(input.workDate);
  } catch {
    return 'Enter a valid business date.';
  }
  if (!input.hubId) return 'Select the planned operational Hub.';

  if (input.dayKind === 'work') {
    if (!input.startsAt || !input.endsAt) return 'Work days require a start and end time.';
    if (!/^\d{2}:\d{2}$/.test(input.startsAt) || !/^\d{2}:\d{2}$/.test(input.endsAt)) {
      return 'Use valid 24-hour start and end times.';
    }
    if (input.startsAt >= input.endsAt) return 'The start time must be before the end time on the same day.';
    return null;
  }

  if (input.dayKind === 'day_off') {
    if (input.startsAt || input.endsAt) return 'Day Off cannot contain a working interval.';
    return null;
  }

  return 'Select Work or Day Off.';
}

function mapSchedule(row: RiderScheduleRpcRow): RiderSchedule {
  return {
    id: row.id,
    riderId: row.rider_id,
    riderName: row.rider_name,
    riderMkbId: row.rider_mkb_id,
    workDate: row.work_date,
    hubId: row.hub_id,
    hubName: row.hub_name,
    dayKind: row.day_kind,
    startsAt: row.starts_at ? row.starts_at.slice(0, 5) : null,
    endsAt: row.ends_at ? row.ends_at.slice(0, 5) : null,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
  };
}

function assertDateRange(fromDate: string, toDate: string): void {
  const from = asDateOnly(fromDate);
  const to = asDateOnly(toDate);
  const dayCount = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (dayCount < 0) throw new Error('The schedule date range is invalid.');
  if (dayCount > 31) throw new Error('Schedule reads are limited to 32 calendar days.');
}

export async function listRiderSchedules(options: {
  fromDate: string;
  toDate: string;
  hubId?: string | null;
  riderId?: string | null;
}): Promise<RiderSchedule[]> {
  assertDateRange(options.fromDate, options.toDate);
  const { data, error } = await supabase.rpc('list_rider_schedules', {
    p_from_date: options.fromDate,
    p_to_date: options.toDate,
    p_hub_id: options.hubId ?? null,
    p_rider_id: options.riderId ?? null,
  });
  if (error) throw new Error(error.message || 'Unable to load Rider schedules.');
  return (data ?? []).map(mapSchedule);
}

function assertMutationInput(input: RiderScheduleDraftInput, reason: string): void {
  const validation = validateRiderScheduleDraft(input);
  if (validation) throw new Error(validation);
  if (reason.trim().length < 3) throw new Error('A schedule reason of at least three characters is required.');
}

export async function createRiderSchedule(input: RiderScheduleDraftInput & { reason: string }): Promise<string> {
  assertMutationInput(input, input.reason);
  const { data, error } = await supabase.rpc('create_rider_schedule', {
    p_rider_id: input.riderId,
    p_work_date: input.workDate,
    p_hub_id: input.hubId,
    p_day_kind: input.dayKind,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_reason: input.reason.trim(),
  });
  if (error) throw new Error(error.message || 'Unable to create the Rider schedule.');
  return data;
}

export async function updateRiderSchedule(input: RiderScheduleDraftInput & {
  scheduleId: string;
  expectedRevision: number;
  reason: string;
}): Promise<string> {
  assertMutationInput(input, input.reason);
  const { data, error } = await supabase.rpc('update_rider_schedule', {
    p_schedule_id: input.scheduleId,
    p_expected_revision: input.expectedRevision,
    p_hub_id: input.hubId,
    p_day_kind: input.dayKind,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_reason: input.reason.trim(),
  });
  if (error) throw new Error(error.message || 'Unable to update the Rider schedule.');
  return data;
}

export async function publishRiderSchedule(scheduleId: string, expectedRevision: number, reason: string): Promise<string> {
  if (reason.trim().length < 3) throw new Error('A schedule reason of at least three characters is required.');
  const { data, error } = await supabase.rpc('publish_rider_schedule', {
    p_schedule_id: scheduleId,
    p_expected_revision: expectedRevision,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message || 'Unable to publish the Rider schedule.');
  return data;
}

export async function cancelRiderSchedule(scheduleId: string, expectedRevision: number, reason: string): Promise<string> {
  if (reason.trim().length < 3) throw new Error('A cancellation reason of at least three characters is required.');
  const { data, error } = await supabase.rpc('cancel_rider_schedule', {
    p_schedule_id: scheduleId,
    p_expected_revision: expectedRevision,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message || 'Unable to cancel the Rider schedule.');
  return data;
}

export interface CachedRiderSchedules {
  userId: string;
  riderId: string;
  fromDate: string;
  toDate: string;
  schedules: RiderSchedule[];
  cachedAt: string;
}

function scheduleCacheKey(userId: string, riderId: string, fromDate: string, toDate: string): string {
  return `${CACHE_PREFIX}${userId}:${riderId}:${fromDate}:${toDate}`;
}

export async function getCachedRiderSchedules(
  userId: string,
  riderId: string,
  fromDate: string,
  toDate: string,
): Promise<CachedRiderSchedules | null> {
  try {
    const cached = await getStorageAdapter().getItem<CachedRiderSchedules>(scheduleCacheKey(userId, riderId, fromDate, toDate));
    if (!cached) return null;
    if (
      cached.userId !== userId
      || cached.riderId !== riderId
      || cached.fromDate !== fromDate
      || cached.toDate !== toDate
      || !Array.isArray(cached.schedules)
    ) return null;
    return cached;
  } catch (error) {
    console.warn('[OfflineCache] Unable to read Rider schedule cache:', error);
    return null;
  }
}

export async function setCachedRiderSchedules(payload: CachedRiderSchedules): Promise<void> {
  try {
    await getStorageAdapter().setItem(
      scheduleCacheKey(payload.userId, payload.riderId, payload.fromDate, payload.toDate),
      payload,
      CACHE_TTL_MS,
    );
  } catch (error) {
    console.warn('[OfflineCache] Unable to write Rider schedule cache:', error);
  }
}

export async function clearRiderScheduleCache(userId: string, riderId?: string): Promise<void> {
  try {
    const prefix = `${CACHE_PREFIX}${userId}:${riderId ?? ''}`;
    const keys = await getStorageAdapter().getAllKeys();
    await Promise.all(
      keys
        .filter((key) => riderId ? key.startsWith(prefix) : key.startsWith(`${CACHE_PREFIX}${userId}:`))
        .map((key) => getStorageAdapter().removeItem(key)),
    );
  } catch (error) {
    console.warn('[OfflineCache] Unable to clear Rider schedule cache:', error);
  }
}
