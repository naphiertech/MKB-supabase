// Browser implementation of the rider location adapter. Capacitor can replace
// the source later without changing attendance or synchronization behavior.
import { useCallback, useEffect, useState } from 'react';
import {
  startRiderGeolocationWatch,
  type GeoPosition
} from '../lib/riderGeolocation';

interface UseGeolocationOptions {
  /** Map anchor used only before a verified device position is available. */
  initial: { lat: number; lng: number };
  /** Pause updates when false. */
  enabled?: boolean;
}

export function useGeolocation({
  initial,
  enabled = true
}: UseGeolocationOptions) {
  const [position, setPosition] = useState<GeoPosition>({
    lat: initial.lat,
    lng: initial.lng,
    accuracy: 0,
    ts: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasVerifiedPosition, setHasVerifiedPosition] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setPosition({ lat: initial.lat, lng: initial.lng, accuracy: 0, ts: 0 });
      setHasVerifiedPosition(false);
      setIsLoading(false);
    }
  }, [initial.lat, initial.lng, enabled]);

  useEffect(() => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);

    return startRiderGeolocationWatch(navigator.geolocation || null, {
      onPosition: (nextPosition) => {
        setPosition(nextPosition);
        setHasVerifiedPosition(true);
        setIsLoading(false);
        setError(null);
      },
      onError: (message) => {
        console.warn('[Geolocation] Real GPS tracking failed:', message);
        setError(message);
        setIsLoading(false);
      }
    });
  }, [enabled, retryToken]);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  return {
    position,
    error,
    setError,
    isLoading,
    hasVerifiedPosition,
    retry
  };
}
