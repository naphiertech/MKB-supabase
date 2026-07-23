import { getStorageAdapter } from '../lib/storage';
import { getRiderUserMapping, getRiderFullProfile, getRiderDashboardStats } from './riderService';

import { type RiderStatus } from './types';

export interface DBRiderRow {
  id: string;
  name: string;
  face_image_url?: string | null;
  avatar_url?: string | null;
  zone_id: string | null;
  status: RiderStatus;
  lat?: number | null;
  lng?: number | null;
  speed?: number | null;
  shift?: string | null;
  last_ping?: string | number | null;
  contact?: string | null;
  mkb_id: string;
  face_descriptor?: number[] | null;
}

export interface DBAttendanceRow {
  id: string;
  rider_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  hours: number | null;
  status: string;
  source?: string | null;
}

export interface DBViolationRow {
  id: string;
  rider_id: string;
  resolved: boolean;
  lat?: number | null;
  lng?: number | null;
  zone_name?: string | null;
  created_at: string;
}

export interface CachedDashboardPayload {
  resolvedRiderId: string;
  dbUser: { rider_id: string | null } | null;
  dbRider: DBRiderRow | null;
  todayAttendance: DBAttendanceRow | null;
  latestViolation: DBViolationRow | null;
  monthAttendance: DBAttendanceRow[];
  monthViolationCount: number;
  timestamp: number;
}

const DASHBOARD_CACHE_PREFIX = 'rider_dashboard_cache_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days cache validity offline

/**
 * Retrieves cached dashboard data from IndexedDB.
 */
export async function getCachedRiderDashboard(userId: string): Promise<CachedDashboardPayload | null> {
  try {
    const storage = getStorageAdapter();
    const cacheKey = `${DASHBOARD_CACHE_PREFIX}${userId}`;
    const data = await storage.getItem<CachedDashboardPayload>(cacheKey);

    if (data) {
      console.log('[OfflineCache] Cache hit');
      return data;
    } else {
      console.log('[OfflineCache] Cache miss');
      return null;
    }
  } catch (err) {
    console.warn('[OfflineCache] Falling back to Supabase (IndexedDB read error):', err);
    return null;
  }
}

/**
 * Saves fresh dashboard payload to IndexedDB.
 */
export async function setCachedRiderDashboard(userId: string, payload: CachedDashboardPayload): Promise<void> {
  try {
    const storage = getStorageAdapter();
    const cacheKey = `${DASHBOARD_CACHE_PREFIX}${userId}`;
    await storage.setItem(cacheKey, payload, CACHE_TTL_MS);
    console.log('[OfflineCache] Cache updated');
  } catch (err) {
    console.warn('[OfflineCache] Failed to update cache:', err);
  }
}

/**
 * Executes a Stale-While-Revalidate fetch for the Rider Dashboard.
 * 1. Checks cache and invokes onCacheLoaded immediately if available.
 * 2. Fetches fresh data from Supabase in the background.
 * 3. Saves fresh data to cache and invokes onFreshDataLoaded.
 */
export async function fetchRiderDashboardWithSWR(
  userId: string,
  fallbackRiderId: string,
  todayStr: string,
  firstDayStr: string,
  firstDayOfMonthIso: string,
  callbacks: {
    onCacheLoaded?: (data: CachedDashboardPayload) => void;
    onFreshDataLoaded?: (data: CachedDashboardPayload) => void;
  }
): Promise<CachedDashboardPayload | null> {
  let hasServedCache = false;

  // 1. Try reading from local storage
  const cached = await getCachedRiderDashboard(userId);
  if (cached) {
    console.log('[OfflineCache] Loading cached dashboard');
    callbacks.onCacheLoaded?.(cached);
    hasServedCache = true;
  }

  // 2. Perform background revalidation
  console.log('[OfflineCache] Background revalidation started');
  try {
    const dbUser = await getRiderUserMapping(userId);
    const resolvedRiderId = dbUser?.rider_id || fallbackRiderId;
    const dbRider = await getRiderFullProfile(resolvedRiderId);

    const {
      todayAttendance,
      latestViolation,
      monthAttendance,
      monthViolationCount
    } = await getRiderDashboardStats(
      resolvedRiderId,
      todayStr,
      firstDayStr,
      firstDayOfMonthIso
    );

    const freshPayload: CachedDashboardPayload = {
      resolvedRiderId,
      dbUser,
      dbRider,
      todayAttendance,
      latestViolation,
      monthAttendance,
      monthViolationCount,
      timestamp: Date.now()
    };

    // Update cache
    await setCachedRiderDashboard(userId, freshPayload);
    callbacks.onFreshDataLoaded?.(freshPayload);

    return freshPayload;
  } catch (err) {
    if (hasServedCache) {
      console.warn('[OfflineCache] Revalidation failed, serving offline cache:', err);
      return cached;
    } else {
      console.warn('[OfflineCache] Falling back to Supabase');
      throw err;
    }
  }
}
