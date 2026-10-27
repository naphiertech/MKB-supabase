import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { supabase } from './supabaseClient';

export interface ForegroundTrackingOptions {
  riderId: string;
  hubName?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  authToken?: string;
}

export interface ForegroundLocationEvent {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface ForegroundTrackingPlugin {
  startTracking(options: {
    riderId: string;
    hubName?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    authToken?: string;
  }): Promise<{ status: string }>;
  stopTracking(): Promise<{ status: string }>;
  isTracking(): Promise<{ active: boolean }>;
  addListener(
    eventName: 'onLocationUpdate',
    listenerFunc: (event: ForegroundLocationEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'onMockLocationDetected',
    listenerFunc: (event: { lat: number; lng: number; timestamp: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const ForegroundTracking = registerPlugin<ForegroundTrackingPlugin>('ForegroundTracking');

function isNativeAndroid(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Starts Android native foreground service with persistent notification and partial wake lock.
 * Ensures continuous GPS location logging even when the rider's phone screen is locked.
 */
export async function startForegroundDutyTracking(options: {
  riderId: string;
  hubName?: string;
}): Promise<boolean> {
  if (!isNativeAndroid()) return false;

  try {
    const session = (await supabase.auth.getSession()).data.session;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const authToken = session?.access_token || '';

    await ForegroundTracking.startTracking({
      riderId: options.riderId,
      hubName: options.hubName || 'Assigned Hub',
      supabaseUrl,
      supabaseAnonKey,
      authToken,
    });
    return true;
  } catch (err) {
    console.warn('[ForegroundTracking] Failed to start native foreground duty tracking:', err);
    return false;
  }
}

/**
 * Stops Android native foreground service and dismisses ongoing notification.
 */
export async function stopForegroundDutyTracking(): Promise<boolean> {
  if (!isNativeAndroid()) return false;

  try {
    await ForegroundTracking.stopTracking();
    return true;
  } catch (err) {
    console.warn('[ForegroundTracking] Failed to stop native foreground duty tracking:', err);
    return false;
  }
}

/**
 * Checks if the native foreground service is actively running.
 */
export async function isForegroundDutyTracking(): Promise<boolean> {
  if (!isNativeAndroid()) return false;

  try {
    const res = await ForegroundTracking.isTracking();
    return Boolean(res?.active);
  } catch {
    return false;
  }
}

/**
 * Subscribes to live location updates pushed by the native foreground service.
 */
export async function subscribeToForegroundLocation(
  callback: (event: ForegroundLocationEvent) => void,
): Promise<() => void> {
  if (!isNativeAndroid()) return () => undefined;

  try {
    const handle = await ForegroundTracking.addListener('onLocationUpdate', callback);
    return () => {
      void handle.remove();
    };
  } catch (err) {
    console.warn('[ForegroundTracking] Failed to bind location update listener:', err);
    return () => undefined;
  }
}

/**
 * Subscribes to mock / spoofed location detection events pushed by the native GPS engine.
 */
export async function subscribeToMockLocationAlert(
  callback: (event: { lat: number; lng: number; timestamp: number }) => void,
): Promise<() => void> {
  if (!isNativeAndroid()) return () => undefined;

  try {
    const handle = await ForegroundTracking.addListener('onMockLocationDetected', callback);
    return () => {
      void handle.remove();
    };
  } catch (err) {
    console.warn('[ForegroundTracking] Failed to bind mock location listener:', err);
    return () => undefined;
  }
}
