import { supabase } from '../lib/supabaseClient';
import { getLocalDateString } from './attendanceService';
import { getCachedRiderDashboard } from './riderCacheService';

/**
 * Checks whether the rider currently has an active attendance session
 * (i.e. has timed in today and has not yet timed out).
 *
 * This performs an authoritative query against the attendance_logs table
 * when online, and falls back to the local IndexedDB cache when offline.
 */
export async function checkHasActiveAttendance(
  riderId: string,
  userId?: string
): Promise<boolean> {
  if (!riderId) return false;

  const todayStr = getLocalDateString();

  try {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('id, time_in, time_out')
      .eq('rider_id', riderId)
      .eq('date', todayStr)
      .maybeSingle();

    if (!error && data) {
      return Boolean(data.time_in && !data.time_out);
    }
  } catch (err) {
    console.warn('[AttendanceCheck] Online query failed, checking offline cache:', err);
  }

  if (userId) {
    try {
      const cached = await getCachedRiderDashboard(userId);
      if (cached?.todayAttendance) {
        return Boolean(cached.todayAttendance.time_in && !cached.todayAttendance.time_out);
      }
    } catch (err) {
      console.warn('[AttendanceCheck] Offline cache query failed:', err);
    }
  }

  return false;
}
