import { supabase } from '../lib/supabaseClient';
import { RoutePoint } from './types';
import { haversine } from '../lib/geofenceUtils';

export type { RoutePoint };

export interface RouteStats {
  totalDistanceKm: number;
  durationMinutes: number;
  averageSpeedKph: number;
  pointCount: number;
  startTime: string;
  currentTime: string;
}

export const getRouteForRider = async (
  riderId: string,
  date?: string
): Promise<RoutePoint[]> => {
  const targetDate = date ?? new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('rider_locations')
    .select('lat, lng, speed, recorded_at')
    .eq('rider_id', riderId)
    .gte('recorded_at', `${targetDate}T00:00:00`)
    .lte('recorded_at', `${targetDate}T23:59:59`)
    .order('recorded_at', { ascending: true });

  if (error) {
    console.error('Error fetching rider route for playback:', error);
    return [];
  }

  // Map recorded_at to the timestamp field required by frontend components
  return (data || []).map((row: any) => ({
    lat: row.lat,
    lng: row.lng,
    speed: row.speed || 0,
    timestamp: row.recorded_at
  }));
};

export const computeRouteStats = (
  points: RoutePoint[]
): RouteStats | null => {
  if (points.length < 2) return null;

  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += haversine(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
  }

  const start = new Date(points[0].timestamp);
  const end = new Date(points[points.length - 1].timestamp);
  const durationMinutes = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 60000)
  );

  const totalDistanceKm = parseFloat((totalDistance / 1000).toFixed(2));
  const averageSpeedKph = parseFloat(
    ((totalDistanceKm / durationMinutes) * 60).toFixed(1)
  );

  return {
    totalDistanceKm,
    durationMinutes,
    averageSpeedKph,
    pointCount: points.length,
    startTime: points[0].timestamp,
    currentTime: points[points.length - 1].timestamp,
  };
};
