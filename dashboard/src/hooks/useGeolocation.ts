// Lightweight geolocation hook for AttenRider rider view.
// TODO: Replace mock simulation with `navigator.geolocation.watchPosition` and Supabase Realtime upsert.
import { useEffect, useRef, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number; // meters
  ts: number;
}

interface UseGeolocationOptions {
  /** Initial / anchor position the simulated jitter is centered on */
  initial: {lat: number;lng: number;};
  /** Jitter radius in degrees (~111km per degree). Default ~10–15m. */
  jitter?: number;
  /** Update interval in ms. */
  intervalMs?: number;
  /** Pause updates when false. */
  enabled?: boolean;
}

/**
 * Simulates a rider's live GPS coordinates by jittering around an anchor.
 * The first reading is the exact anchor so callers can use it immediately.
 */
export function useGeolocation({
  initial,
  jitter = 0.00012,
  intervalMs = 2500,
  enabled = true
}: UseGeolocationOptions) {
  const [position, setPosition] = useState<GeoPosition>({
    lat: initial.lat,
    lng: initial.lng,
    accuracy: 8,
    ts: Date.now()
  });
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef(initial);

  useEffect(() => {
    anchorRef.current = initial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.lat, initial.lng]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const { lat, lng } = anchorRef.current;
      const dLat = (Math.random() - 0.5) * 2 * jitter;
      const dLng = (Math.random() - 0.5) * 2 * jitter;
      setPosition({
        lat: lat + dLat,
        lng: lng + dLng,
        accuracy: 5 + Math.random() * 8,
        ts: Date.now()
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, jitter, intervalMs]);

  return { position, error, setError };
}
