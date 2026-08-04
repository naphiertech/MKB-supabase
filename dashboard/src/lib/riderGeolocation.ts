export const MAX_RIDER_POSITION_AGE_MS = 2 * 60 * 1000;

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
}

export interface RiderGeolocationSource {
  watchPosition(
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): number;
  clearWatch(watchId: number): void;
}

interface RiderGeolocationHandlers {
  onPosition: (position: GeoPosition) => void;
  onError: (message: string) => void;
}

export function startRiderGeolocationWatch(
  source: RiderGeolocationSource | null,
  handlers: RiderGeolocationHandlers
): () => void {
  if (!source) {
    handlers.onError('Geolocation is not supported on this device.');
    return () => undefined;
  }

  const watchId = source.watchPosition(
    (position) => {
      handlers.onPosition({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        ts: position.timestamp
      });
    },
    (error) => handlers.onError(error.message || 'Unable to acquire a GPS position.'),
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );

  return () => source.clearWatch(watchId);
}

export function isRecentRiderPosition(
  position: GeoPosition | null,
  now = Date.now(),
  maxAgeMs = MAX_RIDER_POSITION_AGE_MS
): position is GeoPosition {
  if (!position) return false;
  if (![position.lat, position.lng, position.accuracy, position.ts].every(Number.isFinite)) return false;
  const ageMs = now - position.ts;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function canStartRiderAttendance(
  action: 'time-in' | 'time-out',
  position: GeoPosition | null,
  now = Date.now()
): boolean {
  return action === 'time-out' || isRecentRiderPosition(position, now);
}
