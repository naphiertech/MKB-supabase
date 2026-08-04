import { supabase } from './supabaseClient';

export interface IpLocationData {
  ip: string;
  city: string;
  region: string;
  country_name: string;
  latitude: number;
  longitude: number;
  org: string;
}

/**
 * Option 2: Reverse Geocoding via Nominatim (OpenStreetMap)
 * Converts latitude and longitude to a human-readable street address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!lat || !lng) return 'No Coordinates';
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AttenRider-Dashboard/1.0 (Zamboanga City Geofence Tracker; mkb.ph)'
      }
    });
    if (!response.ok) throw new Error('Nominatim request failed');
    const data = await response.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch (err) {
    console.warn('[Nominatim] Failed to geocode coordinates:', err);
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

/**
 * Option 3: Fetch client IP & Location via free ipapi.co HTTPS service
 */
export async function fetchIpLocation(): Promise<IpLocationData | null> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('IP location request failed');
    return (await response.json()) as IpLocationData;
  } catch (err) {
    console.warn('[IP-API] Failed to resolve client location:', err);
    return null;
  }
}

export interface LogMetadata {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  [key: string]: unknown;
}

/**
 * DB Activity Logger: Logs unmodifiable user/system operations to public.activity_logs
 */
export async function logActivity(params: {
  userId?: string | null;
  riderId?: string | null;
  eventType: string;
  description: string;
  metadata?: LogMetadata;
}) {
  try {
    let finalUserId = params.userId;
    if (!finalUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      finalUserId = user?.id || null;
    }

    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: finalUserId,
        rider_id: params.riderId || null,
        event_type: params.eventType,
        description: params.description,
        metadata: params.metadata || {}
      });
    if (error) {
      console.warn('[ActivityLog] DB write failed:', error.message);
    }
  } catch (err) {
    console.warn('[ActivityLog] Failed to log activity:', err);
  }
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  rider_id: string | null;
  event_type: string;
  description: string;
  metadata: LogMetadata;
  created_at: string;
  users?: {
    full_name: string;
    email: string;
    role: string;
  } | null;
  riders?: {
    name: string;
    mkb_id: string;
  } | null;
}

export async function getActivityLogs(options: { limit?: number; offset?: number } = {}): Promise<ActivityLog[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const { data, error } = await supabase
    .from('activity_logs')
    .select(`
      id,
      user_id,
      rider_id,
      event_type,
      description,
      metadata,
      created_at,
      users (
        full_name,
        email,
        role
      ),
      riders (
        name,
        mkb_id
      )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching activity logs:', error);
    return [];
  }
  return (data || []) as unknown as ActivityLog[];
}
