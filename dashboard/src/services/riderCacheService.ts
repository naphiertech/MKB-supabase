import { getStorageAdapter } from '../lib/storage';
import { getRiderUserMapping, getRiderFullProfile, getRiderDashboardStats } from './riderService';
import { getUserProfileById } from './userService';
import { getZones } from './geofenceService';
import { getRouteForRider, computeRouteStats, type RoutePoint, type RouteStats } from './routeService';
import { type RiderStatus, type Zone } from './types';

export interface DBUserProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  last_login?: string | number | null;
  rider_id?: string | null;
}

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
  zones?: {
    id: string;
    name: string;
    lat?: number | null;
    lng?: number | null;
    radius?: number | null;
    color?: string;
    status?: string;
    zone_type?: string;
    polygon_coordinates?: unknown;
  } | null;
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

/**
 * Mutates cached todayAttendance in IndexedDB when offline write occurs.
 */
export async function updateCachedAttendanceState(userId: string, attLog: DBAttendanceRow | null): Promise<void> {
  try {
    const cached = await getCachedRiderDashboard(userId);
    if (cached) {
      cached.todayAttendance = attLog;
      await setCachedRiderDashboard(userId, cached);
    }
  } catch (err) {
    console.warn('[OfflineCache] Failed to update cached attendance state:', err);
  }
}

const MONITORING_CACHE_PREFIX = 'rider_monitoring_cache_';
const PROFILE_CACHE_PREFIX = 'rider_profile_cache_';

export interface CachedMonitoringPayload {
  resolvedRiderId: string;
  dbUser: { rider_id: string | null } | null;
  dbRider: DBRiderRow | null;
  zone: Zone | null;
  routePoints: RoutePoint[];
  routeStats: RouteStats | null;
  timestamp: number;
}

export interface CachedProfilePayload {
  dbUser: DBUserProfileRow | null;
  dbRider: DBRiderRow | null;
  timestamp: number;
}

export async function fetchRiderMonitoringWithSWR(
  userId: string,
  fallbackRiderId: string,
  todayStr: string,
  callbacks: {
    onCacheLoaded?: (data: CachedMonitoringPayload) => void;
    onFreshDataLoaded?: (data: CachedMonitoringPayload) => void;
  }
): Promise<CachedMonitoringPayload | null> {
  const storage = getStorageAdapter();
  const cacheKey = `${MONITORING_CACHE_PREFIX}${userId}`;
  let hasServedCache = false;

  try {
    const cached = await storage.getItem<CachedMonitoringPayload>(cacheKey);
    if (cached) {
      console.log('[OfflineCache] Loading cached monitoring view');
      callbacks.onCacheLoaded?.(cached);
      hasServedCache = true;
    }
  } catch (err) {
    console.warn('[OfflineCache] Read monitoring cache error:', err);
  }

  console.log('[OfflineCache] Background revalidation started (Monitoring)');
  try {
    const dbUser = await getRiderUserMapping(userId);
    const resolvedRiderId = dbUser?.rider_id || fallbackRiderId;
    const dbRider = await getRiderFullProfile(resolvedRiderId);

    let zone: Zone | null = null;
    if (dbRider?.zones) {
      const dbZone = dbRider.zones;
      let center: [number, number] = [0, 0];
      if (dbZone.lat !== null && dbZone.lng !== null) {
        center = [dbZone.lat, dbZone.lng];
      } else if (dbZone.polygon_coordinates && dbZone.polygon_coordinates.length > 0) {
        const polyCoords = dbZone.polygon_coordinates as [number, number][];
        const latSum = polyCoords.reduce((sum: number, c: [number, number]) => sum + c[0], 0);
        const lngSum = polyCoords.reduce((sum: number, c: [number, number]) => sum + c[1], 0);
        center = [latSum / polyCoords.length, lngSum / polyCoords.length];
      }
      zone = {
        id: dbZone.id,
        name: dbZone.name,
        center,
        radius: dbZone.radius || 0,
        color: dbZone.color,
        status: dbZone.status,
        zone_type: dbZone.zone_type,
        polygon_coordinates: dbZone.polygon_coordinates || undefined
      };
    } else {
      const zList = await getZones();
      if (zList.length > 0) zone = zList[0];
    }

    const routePoints = await getRouteForRider(resolvedRiderId, todayStr);
    const routeStats = computeRouteStats(routePoints);

    const freshPayload: CachedMonitoringPayload = {
      resolvedRiderId,
      dbUser,
      dbRider,
      zone,
      routePoints,
      routeStats,
      timestamp: Date.now()
    };

    await storage.setItem(cacheKey, freshPayload, CACHE_TTL_MS);
    console.log('[OfflineCache] Monitoring cache updated');
    callbacks.onFreshDataLoaded?.(freshPayload);

    return freshPayload;
  } catch (err) {
    if (hasServedCache) {
      console.warn('[OfflineCache] Revalidation failed for monitoring, using cached data:', err);
      return null;
    } else {
      console.warn('[OfflineCache] Falling back to Supabase (Monitoring)');
      throw err;
    }
  }
}

export async function fetchRiderProfileWithSWR(
  userId: string,
  fallbackRiderId: string,
  callbacks: {
    onCacheLoaded?: (data: CachedProfilePayload) => void;
    onFreshDataLoaded?: (data: CachedProfilePayload) => void;
  }
): Promise<CachedProfilePayload | null> {
  const storage = getStorageAdapter();
  const cacheKey = `${PROFILE_CACHE_PREFIX}${userId}`;
  let hasServedCache = false;

  try {
    const cached = await storage.getItem<CachedProfilePayload>(cacheKey);
    if (cached) {
      console.log('[OfflineCache] Loading cached profile view');
      callbacks.onCacheLoaded?.(cached);
      hasServedCache = true;
    }
  } catch (err) {
    console.warn('[OfflineCache] Read profile cache error:', err);
  }

  console.log('[OfflineCache] Background revalidation started (Profile)');
  try {
    const dbUser = await getUserProfileById(userId);
    const resolvedRiderId = dbUser?.rider_id || fallbackRiderId;
    const dbRider = await getRiderFullProfile(resolvedRiderId);

    const freshPayload: CachedProfilePayload = {
      dbUser,
      dbRider,
      timestamp: Date.now()
    };

    await storage.setItem(cacheKey, freshPayload, CACHE_TTL_MS);
    console.log('[OfflineCache] Profile cache updated');
    callbacks.onFreshDataLoaded?.(freshPayload);

    return freshPayload;
  } catch (err) {
    if (hasServedCache) {
      console.warn('[OfflineCache] Revalidation failed for profile, using cached data:', err);
      return null;
    } else {
      console.warn('[OfflineCache] Falling back to Supabase (Profile)');
      throw err;
    }
  }
}
