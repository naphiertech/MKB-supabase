import { supabase } from '../../lib/supabaseClient';
import { getStorageAdapter } from '../../lib/storage';
import type { PayrollWeekPeriod } from '../../lib/payroll/payrollCalendar';
import {
  buildRiderParcelPeriodView,
  type RiderParcelAttendanceHint,
  type RiderParcelPeriodView,
  type RiderParcelRawLog,
} from '../../lib/parcels/riderParcelsModel';

const CACHE_PREFIX = 'rider_parcels_cache_v1:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CachedRiderParcelPeriod {
  userId: string;
  riderId: string;
  cutoffStart: string;
  cutoffEnd: string;
  logs: RiderParcelRawLog[];
  attendanceLogs: RiderParcelAttendanceHint[];
  payrollStatus: string | null;
  cachedAt: number;
}

function parcelCacheKey(
  userId: string,
  riderId: string,
  cutoffStart: string,
  cutoffEnd: string,
): string {
  return `${CACHE_PREFIX}${userId}:${riderId}:${cutoffStart}:${cutoffEnd}`;
}

async function readCachedPeriod(
  userId: string,
  riderId: string,
  cutoffStart: string,
  cutoffEnd: string,
): Promise<CachedRiderParcelPeriod | null> {
  try {
    const cached = await getStorageAdapter().getItem<CachedRiderParcelPeriod>(
      parcelCacheKey(userId, riderId, cutoffStart, cutoffEnd),
    );
    if (
      !cached
      || cached.userId !== userId
      || cached.riderId !== riderId
      || cached.cutoffStart !== cutoffStart
      || cached.cutoffEnd !== cutoffEnd
      || !Array.isArray(cached.logs)
    ) {
      return null;
    }
    return cached;
  } catch (err) {
    console.warn('[OfflineCache] Unable to read Rider parcel cache:', err);
    return null;
  }
}

async function writeCachedPeriod(payload: CachedRiderParcelPeriod): Promise<void> {
  try {
    await getStorageAdapter().setItem(
      parcelCacheKey(payload.userId, payload.riderId, payload.cutoffStart, payload.cutoffEnd),
      payload,
      CACHE_TTL_MS,
    );
  } catch (err) {
    console.warn('[OfflineCache] Unable to write Rider parcel cache:', err);
  }
}

export async function clearRiderParcelCache(userId: string, riderId?: string): Promise<void> {
  try {
    const storage = getStorageAdapter();
    const prefix = riderId
      ? `${CACHE_PREFIX}${userId}:${riderId}:`
      : `${CACHE_PREFIX}${userId}:`;
    const keys = await storage.getAllKeys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => storage.removeItem(key)),
    );
  } catch (err) {
    console.warn('[OfflineCache] Unable to clear Rider parcel cache:', err);
  }
}

export interface LoadRiderParcelPeriodParams {
  userId: string;
  riderId: string;
  period: PayrollWeekPeriod;
}

/**
 * Loads a rider's daily parcel logs, morning attendance Time-In hints, and matching
 * payroll cutoff status in parallel, with read-only offline snapshot fallback.
 */
export async function loadRiderParcelPeriod(
  params: LoadRiderParcelPeriodParams,
): Promise<RiderParcelPeriodView> {
  const { userId, riderId, period } = params;

  try {
    const [parcelRes, attendanceRes, payrollRes] = await Promise.all([
      supabase
        .from('parcel_logs')
        .select(
          'id, rider_id, date, parcels, heavy_parcels, assigned_parcels, failed_parcels, returned_parcels, rate, heavy_rate, standard_earnings, heavy_earnings, daily_gross, notes, updated_at',
        )
        .eq('rider_id', riderId)
        .gte('date', period.cutoff_start)
        .lte('date', period.cutoff_end)
        .order('date', { ascending: false }),
      supabase
        .from('attendance_logs')
        .select('date, time_in, status')
        .eq('rider_id', riderId)
        .gte('date', period.cutoff_start)
        .lte('date', period.cutoff_end),
      supabase
        .from('payroll_records')
        .select('status')
        .eq('rider_id', riderId)
        .eq('cutoff_start', period.cutoff_start)
        .eq('cutoff_end', period.cutoff_end)
        .maybeSingle(),
    ]);

    if (parcelRes.error) {
      throw parcelRes.error;
    }

    const logs = (parcelRes.data ?? []) as RiderParcelRawLog[];
    const attendanceLogs = (
      attendanceRes.error ? [] : (attendanceRes.data ?? [])
    ) as RiderParcelAttendanceHint[];
    const payrollStatus = payrollRes.error
      ? null
      : (payrollRes.data?.status ?? null);

    const cachedAt = Date.now();
    await writeCachedPeriod({
      userId,
      riderId,
      cutoffStart: period.cutoff_start,
      cutoffEnd: period.cutoff_end,
      logs,
      attendanceLogs,
      payrollStatus,
      cachedAt,
    });

    return buildRiderParcelPeriodView({
      period,
      logs,
      attendanceLogs,
      payrollStatus,
      isOfflineSnapshot: false,
      cachedAt,
    });
  } catch (err) {
    const cached = await readCachedPeriod(
      userId,
      riderId,
      period.cutoff_start,
      period.cutoff_end,
    );
    if (cached) {
      return buildRiderParcelPeriodView({
        period,
        logs: cached.logs,
        attendanceLogs: cached.attendanceLogs,
        payrollStatus: cached.payrollStatus,
        isOfflineSnapshot: true,
        cachedAt: cached.cachedAt,
      });
    }
    throw err;
  }
}
