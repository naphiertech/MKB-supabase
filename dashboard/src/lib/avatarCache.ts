import { supabase } from './supabaseClient';

const CACHE_PREFIX = 'mkb_avatar_';

/**
 * Retrieves the cached avatar string (Base64 data URL) for a rider.
 */
export function getCachedAvatar(riderId: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + riderId);
    if (!raw) return null;
    
    const entry = JSON.parse(raw);
    const TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // If the cache is older than 24 hours, expire it so it checks for updates
    if (Date.now() - entry.ts > TTL) {
      return null;
    }
    return entry.avatar;
  } catch (e) {
    return null;
  }
}

/**
 * Saves a rider's avatar in the local storage cache with a timestamp.
 */
export function setCachedAvatar(riderId: string, avatar: string): void {
  try {
    const entry = {
      avatar,
      ts: Date.now()
    };
    localStorage.setItem(CACHE_PREFIX + riderId, JSON.stringify(entry));
  } catch (e) {
    console.warn('LocalStorage avatar caching failed or quota exceeded:', e);
  }
}

/**
 * Clears the cached avatar for a specific rider.
 * Call this when a photo is updated.
 */
export function clearCachedAvatar(riderId: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + riderId);
  } catch (e) {
    // Ignore Storage Errors
  }
}

/**
 * Fetches the rider's face_image_url from the database.
 */
export async function fetchRiderAvatar(riderId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('riders')
      .select('face_image_url')
      .eq('id', riderId)
      .maybeSingle();

    if (error) {
      console.error(`Error fetching avatar for rider ${riderId}:`, error);
      return null;
    }
    return data?.face_image_url || null;
  } catch (err) {
    console.error(`Exception fetching avatar for rider ${riderId}:`, err);
    return null;
  }
}
