import { supabase } from '../supabaseClient';
import { getStorageAdapter, type QueueItem } from '../storage';
import { updateCachedAttendanceState } from '../../services/riderCacheService';
import { isAttendanceFinalized } from '../../services/attendanceService';

const MAX_RETRIES = 5;

/**
 * Calculates distance in meters between two lat/lng coordinates (Haversine formula).
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Production-Grade Background Synchronization Engine.
 * Handles FIFO outbox processing, exponential backoff, GPS log thinning,
 * idempotent attendance sync, and automatic cache consistency.
 */
export class SyncEngine {
  private static instance: SyncEngine | null = null;
  private syncing = false;
  private retryTimer: number | null = null;
  private initialized = false;

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) {
      SyncEngine.instance = new SyncEngine();
    }
    return SyncEngine.instance;
  }

  /**
   * Initializes global sync engine event listeners.
   */
  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network restored');
        this.triggerSync();
      });

      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Network lost');
      });
    }

    // Attempt sync on startup if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.triggerSync();
    }
  }

  public isSyncing(): boolean {
    return this.syncing;
  }

  /**
   * Main synchronization loop.
   */
  public async triggerSync(): Promise<void> {
    if (this.syncing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[SyncEngine] Sync skipped: Offline');
      return;
    }

    this.syncing = true;
    const storage = getStorageAdapter();

    try {
      const rawQueue = await storage.getQueue();
      if (!rawQueue || rawQueue.length === 0) {
        console.log('[SyncEngine] Queue empty');
        this.syncing = false;
        return;
      }

      // Filter non-exceeded pending/failed items
      const pendingItems = rawQueue.filter(
        item => item.status === 'pending' || (item.status === 'failed' && item.retryCount < MAX_RETRIES)
      );

      if (pendingItems.length === 0) {
        console.log('[SyncEngine] Queue empty');
        this.syncing = false;
        return;
      }

      console.log(`[SyncEngine] Processing queue (${pendingItems.length} items)`);

      // 1. Separate Location Pings from Attendance/Other events
      const locationPings = pendingItems.filter(item => item.action === 'LOCATION_PING');
      const criticalEvents = pendingItems.filter(item => item.action !== 'LOCATION_PING');

      // 2. Perform GPS Log Thinning for accumulated location pings
      const thinnedLocationPings = await this.thinLocationPings(locationPings, storage);

      // 3. Sort items into strict priority and FIFO order
      // Attendance (Priority 1) -> Location (Priority 3)
      const executableItems = [...criticalEvents, ...thinnedLocationPings].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // 4. Execute each queue item
      for (const item of executableItems) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.log('[SyncEngine] Connectivity lost during sync loop. Pausing.');
          break;
        }

        const success = await this.processItem(item, storage);
        if (!success) {
          // Break loop on failure to preserve strict order & schedule backoff
          break;
        }
      }
    } catch (err) {
      console.warn('[SyncEngine] Unexpected error during sync loop:', err);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * GPS Thinning: Removes redundant location pings recorded close together in time & distance.
   */
  private async thinLocationPings(pings: QueueItem[], storage: ReturnType<typeof getStorageAdapter>): Promise<QueueItem[]> {
    if (pings.length <= 1) return pings;

    const originalCount = pings.length;
    // Sort chronologically
    const sorted = [...pings].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const kept: QueueItem[] = [];
    const discarded: QueueItem[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const payload = current.payload as { lat?: number; lng?: number; status?: string };

      if (i === 0) {
        kept.push(current);
        continue;
      }

      const prevKept = kept[kept.length - 1];
      const prevPayload = prevKept.payload as { lat?: number; lng?: number; status?: string };

      // Always keep violations
      if (payload.status === 'violation') {
        kept.push(current);
        continue;
      }

      const timeDiffMs = Math.abs(
        new Date(current.createdAt).getTime() - new Date(prevKept.createdAt).getTime()
      );

      let distMeters = 100;
      if (
        payload.lat != null &&
        payload.lng != null &&
        prevPayload.lat != null &&
        prevPayload.lng != null
      ) {
        distMeters = haversineMeters(prevPayload.lat, prevPayload.lng, payload.lat, payload.lng);
      }

      // Discard if recorded within 15s AND moved less than 10 meters
      if (timeDiffMs < 15000 && distMeters < 10 && payload.status === prevPayload.status) {
        discarded.push(current);
      } else {
        kept.push(current);
      }
    }

    if (discarded.length > 0) {
      console.log(`[SyncEngine] GPS Thinning: reduced ${originalCount} location pings to ${kept.length} pings`);
      // Dequeue discarded redundant items quietly
      for (const disc of discarded) {
        await storage.dequeue(disc.id);
      }
    }

    return kept;
  }

  /**
   * Processes an individual QueueItem.
   */
  private async processItem(item: QueueItem, storage: ReturnType<typeof getStorageAdapter>): Promise<boolean> {
    await storage.updateQueueItem(item.id, { status: 'processing' });

    try {
      switch (item.action) {
        case 'TIME_IN':
          await this.syncTimeIn(item);
          break;
        case 'TIME_OUT':
          await this.syncTimeOut(item);
          break;
        case 'LOCATION_PING':
          await this.syncLocationPing(item);
          break;
        default:
          console.warn(`[SyncEngine] Unknown action type: ${item.action}`);
          break;
      }

      // Mark synced and remove from queue
      await storage.updateQueueItem(item.id, { status: 'synced' });
      await storage.dequeue(item.id);
      console.log('[SyncEngine] Success');
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const nextRetryCount = item.retryCount + 1;
      await storage.updateQueueItem(item.id, {
        status: 'failed',
        retryCount: nextRetryCount,
        lastError: errorMsg
      });

      console.warn(`[SyncEngine] Error syncing ${item.action} (attempt ${nextRetryCount}/${MAX_RETRIES}):`, errorMsg);

      if (nextRetryCount < MAX_RETRIES) {
        const delay = Math.min(30000, Math.pow(2, nextRetryCount) * 1000);
        console.log(`[SyncEngine] Retry scheduled (attempt ${nextRetryCount} in ${delay}ms)`);
        if (this.retryTimer) window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.triggerSync(), delay);
      } else {
        console.error(`[SyncEngine] Maximum retry attempts reached for item ${item.id}. Marked as failed.`);
      }
      return false;
    }
  }

  /**
   * Syncs a TIME_IN event to Supabase.
   */
  private async syncTimeIn(item: QueueItem): Promise<void> {
    console.log('[SyncEngine] Syncing TIME_IN');
    const p = item.payload as {
      id: string;
      rider_id: string;
      date: string;
      time_in: string;
      status?: string;
      source?: string;
    };

    if (!p.id || !p.rider_id) throw new Error('Invalid TIME_IN payload: Missing id or rider_id');

    if (isAttendanceFinalized(p.date)) {
      console.warn(`[SyncEngine] TIME_IN log ${p.id} discarded: Date ${p.date} is finalized.`);
      return;
    }

    // Idempotent Insert using client UUID
    const { error } = await supabase.from('attendance_logs').insert({
      id: p.id,
      rider_id: p.rider_id,
      date: p.date,
      time_in: p.time_in,
      status: p.status || 'present',
      source: p.source || 'facial_scan'
    });

    if (error) {
      // 23505 = duplicate key value violates unique constraint
      if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
        console.log(`[SyncEngine] TIME_IN log ${p.id} already exists in DB. Treating as synced.`);
      } else {
        throw error;
      }
    }

    // Update rider status to active
    try {
      await supabase.from('riders').update({ status: 'active' }).eq('id', p.rider_id);
    } catch (err) {
      console.warn('[SyncEngine] Failed to update active status in riders table:', err);
    }

    // Keep cached state aligned
    await updateCachedAttendanceState(p.rider_id, {
      id: p.id,
      rider_id: p.rider_id,
      date: p.date,
      time_in: p.time_in,
      time_out: null,
      hours: 0,
      status: p.status || 'present'
    });
  }

  /**
   * Syncs a TIME_OUT event to Supabase.
   */
  private async syncTimeOut(item: QueueItem): Promise<void> {
    console.log('[SyncEngine] Syncing TIME_OUT');
    const p = item.payload as {
      id: string;
      rider_id: string;
      time_out: string;
      date?: string;
    };

    if (!p.id) throw new Error('Invalid TIME_OUT payload: Missing id');

    // Omit generated column 'hours'
    const { error } = await supabase
      .from('attendance_logs')
      .update({
        time_out: p.time_out
      })
      .eq('id', p.id);

    if (error) throw error;

    // Update rider status to offline
    if (p.rider_id) {
      try {
        await supabase.from('riders').update({ status: 'offline' }).eq('id', p.rider_id);
      } catch (err) {
        console.warn('[SyncEngine] Failed to update offline status in riders table:', err);
      }

      await updateCachedAttendanceState(p.rider_id, {
        id: p.id,
        rider_id: p.rider_id,
        date: p.date || new Date().toISOString().split('T')[0],
        time_in: null,
        time_out: p.time_out,
        hours: 0,
        status: 'present'
      });
    }
  }

  /**
   * Syncs a LOCATION_PING event to Supabase.
   */
  private async syncLocationPing(item: QueueItem): Promise<void> {
    console.log('[SyncEngine] Syncing LOCATION_PING');
    const p = item.payload as {
      rider_id: string;
      lat: number;
      lng: number;
      status: string;
      recorded_at?: string;
    };

    if (!p.rider_id || p.lat == null || p.lng == null) {
      throw new Error('Invalid LOCATION_PING payload');
    }

    const { error } = await supabase.from('rider_locations').insert({
      rider_id: p.rider_id,
      lat: p.lat,
      lng: p.lng,
      status: p.status || 'active'
    });

    if (error) throw error;
  }
}

/**
 * Singleton instance accessor.
 */
export function getSyncEngine(): SyncEngine {
  return SyncEngine.getInstance();
}

/**
 * Global initialization helper.
 */
export function initSyncEngine(): void {
  getSyncEngine().init();
}
