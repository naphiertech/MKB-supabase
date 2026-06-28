// Lightweight geolocation hook for AttenRider rider view.
// TODO: Replace mock simulation with `navigator.geolocation.watchPosition` and Supabase Realtime upsert.
import { useEffect, useRef, useState } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number; // meters
  ts: number;
}

interface UseGeolocationOptions {
  /** Initial / anchor position the simulated jitter is centered on */
  initial: { lat: number; lng: number };
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
  enabled = true,
}: UseGeolocationOptions) {
  const [position, setPosition] = useState<GeoPosition>({
    lat: initial.lat,
    lng: initial.lng,
    accuracy: 8,
    ts: Date.now(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef(initial);

  useEffect(() => {
    anchorRef.current = initial;
    if (!enabled) {
      setPosition({
        lat: initial.lat,
        lng: initial.lng,
        accuracy: 8,
        ts: Date.now()
      });
      setIsLoading(false);
    }
  }, [initial, enabled]);

  useEffect(() => {
    if (!enabled) return;

    let watchId: number | null = null;
    let fallbackIntervalId: number | null = null;

    const startSimulation = () => {
      if (fallbackIntervalId) return;
      fallbackIntervalId = window.setInterval(() => {
        const { lat, lng } = anchorRef.current;
        const dLat = (Math.random() - 0.5) * 2 * jitter;
        const dLng = (Math.random() - 0.5) * 2 * jitter;
        setPosition({
          lat: lat + dLat,
          lng: lng + dLng,
          accuracy: 10 + Math.random() * 10,
          ts: Date.now(),
        });
        setIsLoading(false);
      }, intervalMs);
    };

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            ts: pos.timestamp,
          });
          setIsLoading(false);
          setError(null);
          if (fallbackIntervalId) {
            clearInterval(fallbackIntervalId);
            fallbackIntervalId = null;
          }
        },
        (err) => {
          console.warn(
            "[Geolocation] Real GPS tracking failed or denied. Falling back to simulator:",
            err.message,
          );
          setError(err.message);
          startSimulation();
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    } else {
      console.warn(
        "[Geolocation] Geolocation API not supported by browser. Falling back to simulator.",
      );
      setError("Geolocation not supported");
      startSimulation();
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (fallbackIntervalId !== null) {
        clearInterval(fallbackIntervalId);
      }
    };
  }, [enabled, jitter, intervalMs]);

  return { position, error, setError, isLoading };
}
