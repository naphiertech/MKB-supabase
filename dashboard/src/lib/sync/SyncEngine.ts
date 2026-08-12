import { supabase } from '../supabaseClient';
import {
  SYNC_QUEUE_CHANGED_EVENT,
  getStorageAdapter,
  type QueueItem,
  type StorageAdapter
} from '../storage';
import { patchCachedAttendanceState } from '../../services/riderCacheService';

export const MAX_SYNC_RETRIES = 5;
export const PROCESSING_LEASE_MS = 2 * 60 * 1000;

export interface SyncIdentity {
  authUserId: string;
  riderId: string;
}

export interface SyncQueueStatus {
  pending: number;
  processing: number;
  failed: number;
  syncing: boolean;
}

type ScheduleHandle = ReturnType<typeof setTimeout>;

export interface SyncEngineOptions {
  storage?: StorageAdapter;
  isOnline?: () => boolean;
  now?: () => Date;
  schedule?: (callback: () => void, delayMs: number) => ScheduleHandle;
  cancelScheduled?: (handle: ScheduleHandle) => void;
  patchAttendanceCache?: typeof patchCachedAttendanceState;
}

interface TimeInPayload {
  id?: string;
  attendance_log_id?: string;
  rider_id?: string;
  date?: string;
  time_in?: string;
  status?: string;
  source?: string;
}

interface TimeOutPayload {
  id?: string;
  attendance_log_id?: string;
  rider_id?: string;
  date?: string;
  time_in?: string | null;
  time_out?: string;
  lat?: number;
  lng?: number;
}

interface LocationPayload {
  rider_id?: string;
  lat?: number;
  lng?: number;
  status?: string;
  recorded_at?: string;
}

class PermanentSyncError extends Error {}

type SupabaseLikeError = {
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

export function isPermanentSyncFailure(error: unknown): boolean {
  if (error instanceof PermanentSyncError) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as SupabaseLikeError;
  const status = typeof candidate.status === 'number'
    ? candidate.status
    : typeof candidate.statusCode === 'number'
      ? candidate.statusCode
      : null;
  if (status !== null && status >= 400 && status < 500 && ![408, 425, 429].includes(status)) {
    return true;
  }

  const code = typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
  if (code === 'PGRST000' || code === '40001' || code === '40P01') return false;
  return /^PGRST\d+$/.test(code)
    || /^(22|23|28|42)[0-9A-Z]{3}$/.test(code);
}

function isDuplicateError(error: { code?: string; message?: string }): boolean {
  const message = error.message || '';
  return error.code === '23505' || message.includes('unique constraint') || message.includes('duplicate key');
}

function assertRiderIdentity(item: QueueItem, payloadRiderId?: string): void {
  if (!item.riderId) throw new PermanentSyncError('Sync operation is missing its canonical rider ID.');
  if (payloadRiderId && payloadRiderId !== item.riderId) {
    throw new PermanentSyncError('Sync payload rider ID does not match the queue owner.');
  }
}

export function isAttendanceEventTimestampValid(
  targetDate: string,
  eventTimestamp: string,
  cutoffHour = 17
): boolean {
  const eventDate = new Date(eventTimestamp);
  if (Number.isNaN(eventDate.getTime())) return false;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(eventDate);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const businessDate = `${values.year}-${values.month}-${values.day}`;
  const businessHour = Number(values.hour);
  return businessDate === targetDate && businessHour < cutoffHour;
}

export function buildLocationRecord(item: QueueItem) {
  const payload = item.payload as LocationPayload;
  assertRiderIdentity(item, payload.rider_id);
  if (payload.lat == null || payload.lng == null) {
    throw new PermanentSyncError('Invalid LOCATION_PING payload: missing coordinates.');
  }

  return {
    id: item.idempotencyKey,
    rider_id: item.riderId,
    lat: payload.lat,
    lng: payload.lng,
    status: payload.status || 'active',
    recorded_at: item.eventTimestamp
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Background outbox processor. Queue ownership is activated only after the
 * authenticated rider profile has resolved both auth and canonical rider IDs.
 */
export class SyncEngine {
  private static instance: SyncEngine | null = null;
  private readonly storage: StorageAdapter;
  private readonly isOnlineCheck: () => boolean;
  private readonly now: () => Date;
  private readonly schedule: (callback: () => void, delayMs: number) => ScheduleHandle;
  private readonly cancelScheduled: (handle: ScheduleHandle) => void;
  private readonly patchAttendanceCache: typeof patchCachedAttendanceState;
  private readonly statusListeners = new Set<(status: SyncQueueStatus) => void>();
  private syncing = false;
  private retryTimer: ScheduleHandle | null = null;
  private initialized = false;
  private identity: SyncIdentity | null = null;

  constructor(options: SyncEngineOptions = {}) {
    this.storage = options.storage || getStorageAdapter();
    this.isOnlineCheck = options.isOnline || (() => typeof navigator === 'undefined' || navigator.onLine);
    this.now = options.now || (() => new Date());
    this.schedule = options.schedule || ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelScheduled = options.cancelScheduled || ((handle) => clearTimeout(handle));
    this.patchAttendanceCache = options.patchAttendanceCache || patchCachedAttendanceState;
  }

  public static getInstance(): SyncEngine {
    if (!SyncEngine.instance) SyncEngine.instance = new SyncEngine();
    return SyncEngine.instance;
  }

  /** Attach passive listeners. No replay is allowed until start() supplies identity. */
  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Network restored');
        void this.triggerSync();
      });
      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Network lost');
        void this.publishStatus();
      });
      window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, () => {
        void this.publishStatus();
        if (this.identity) void this.triggerSync();
      });
    }
  }

  public async start(identity: SyncIdentity): Promise<void> {
    if (!identity.authUserId || !identity.riderId) {
      throw new Error('SyncEngine requires both auth user ID and canonical rider ID.');
    }
    this.init();
    this.identity = { ...identity };
    await this.triggerSync();
  }

  public stop(): void {
    this.identity = null;
    if (this.retryTimer) {
      this.cancelScheduled(this.retryTimer);
      this.retryTimer = null;
    }
    void this.publishStatus();
  }

  public isSyncing(): boolean {
    return this.syncing;
  }

  public subscribe(listener: (status: SyncQueueStatus) => void): () => void {
    this.statusListeners.add(listener);
    void this.publishStatus();
    return () => this.statusListeners.delete(listener);
  }

  public async getStatus(): Promise<SyncQueueStatus> {
    const queue = await this.storage.getQueue();
    const owned = this.identity
      ? queue.filter((item) => !item.riderId || item.riderId === this.identity?.riderId)
      : [];
    return {
      pending: owned.filter((item) => item.status === 'pending' || (item.status === 'failed' && item.retryCount < MAX_SYNC_RETRIES)).length,
      processing: owned.filter((item) => item.status === 'processing').length,
      failed: owned.filter((item) => item.status === 'failed' && item.retryCount >= MAX_SYNC_RETRIES).length,
      syncing: this.syncing
    };
  }

  public async getFailedOperations(): Promise<QueueItem[]> {
    if (!this.identity) return [];
    const queue = await this.storage.getQueue();
    return queue.filter(
      (item) => (!item.riderId || item.riderId === this.identity?.riderId) &&
        item.status === 'failed' &&
        item.retryCount >= MAX_SYNC_RETRIES
    );
  }

  public async retryFailedOperation(id: string): Promise<boolean> {
    const identity = this.identity;
    if (!identity) return false;

    const queue = await this.storage.getQueue();
    const item = queue.find((candidate) => candidate.id === id);
    if (
      !item ||
      item.riderId !== identity.riderId ||
      item.status !== 'failed' ||
      item.retryCount < MAX_SYNC_RETRIES
    ) {
      return false;
    }

    await this.storage.updateQueueItem(item.id, {
      status: 'pending',
      retryCount: 0,
      processingStartedAt: null,
      failedAt: null
    });
    await this.triggerSync();
    return true;
  }

  public async triggerSync(): Promise<void> {
    const runIdentity = this.identity;
    if (!runIdentity || this.syncing) return;

    this.syncing = true;
    await this.publishStatus();
    try {
      let queue = await this.storage.getQueue();
      await this.quarantineInvalidItems(queue);
      queue = await this.storage.getQueue();
      await this.recoverStuckProcessing(queue, runIdentity);
      queue = await this.storage.getQueue();

      // Queue repair is local and must run at authenticated startup even while
      // offline. Network-dependent replay starts only after recovery completes.
      if (!this.isOnlineCheck()) return;

      const pendingItems = queue.filter(
        (item) => item.riderId === runIdentity.riderId &&
          (item.status === 'pending' || (item.status === 'failed' && item.retryCount < MAX_SYNC_RETRIES))
      );
      if (pendingItems.length === 0) return;

      const locationPings = pendingItems.filter((item) => item.action === 'LOCATION_PING');
      const criticalEvents = pendingItems.filter((item) => item.action !== 'LOCATION_PING');
      const thinnedLocationPings = await this.thinLocationPings(locationPings);
      const executableItems = [...criticalEvents, ...thinnedLocationPings].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      for (const item of executableItems) {
        if (!this.isOnlineCheck() || this.identity?.riderId !== runIdentity.riderId) break;
        const canContinue = await this.processItem(item, runIdentity);
        if (!canContinue) break;
      }
    } catch (err) {
      console.warn('[SyncEngine] Unexpected error during sync loop:', err);
    } finally {
      this.syncing = false;
      await this.publishStatus();
    }
  }

  private async quarantineInvalidItems(queue: QueueItem[]): Promise<void> {
    const supportedActions = new Set(['TIME_IN', 'TIME_OUT', 'LOCATION_PING']);
    for (const item of queue) {
      if (item.status === 'failed' && item.retryCount >= MAX_SYNC_RETRIES) continue;
      if (!supportedActions.has(item.action)) {
        await this.markPermanentFailure(item, `Unknown sync action: ${item.action}`);
      } else if (!item.riderId) {
        await this.markPermanentFailure(
          item,
          'Legacy sync operation is missing its canonical rider ID and cannot be replayed safely.'
        );
      }
    }
  }

  private async recoverStuckProcessing(queue: QueueItem[], identity: SyncIdentity): Promise<void> {
    const nowMs = this.now().getTime();
    let nextLeaseDelay: number | null = null;

    for (const item of queue) {
      if (item.riderId !== identity.riderId || item.status !== 'processing') continue;
      const startedAt = item.processingStartedAt ? new Date(item.processingStartedAt).getTime() : 0;
      const ageMs = startedAt ? nowMs - startedAt : PROCESSING_LEASE_MS;
      if (ageMs >= PROCESSING_LEASE_MS) {
        await this.storage.updateQueueItem(item.id, {
          status: 'pending',
          processingStartedAt: null,
          lastError: 'Recovered after an interrupted synchronization attempt.'
        });
      } else {
        const remaining = PROCESSING_LEASE_MS - ageMs;
        nextLeaseDelay = nextLeaseDelay == null ? remaining : Math.min(nextLeaseDelay, remaining);
      }
    }

    if (nextLeaseDelay != null) this.scheduleSync(nextLeaseDelay);
  }

  private async thinLocationPings(pings: QueueItem[]): Promise<QueueItem[]> {
    if (pings.length <= 1) return pings;
    const sorted = [...pings].sort(
      (a, b) => new Date(a.eventTimestamp).getTime() - new Date(b.eventTimestamp).getTime()
    );
    const kept: QueueItem[] = [];

    for (const current of sorted) {
      const payload = current.payload as LocationPayload;
      const previous = kept[kept.length - 1];
      if (!previous || payload.status === 'violation') {
        kept.push(current);
        continue;
      }

      const previousPayload = previous.payload as LocationPayload;
      const timeDiffMs = Math.abs(
        new Date(current.eventTimestamp).getTime() - new Date(previous.eventTimestamp).getTime()
      );
      let distanceMeters = 100;
      if (
        payload.lat != null && payload.lng != null &&
        previousPayload.lat != null && previousPayload.lng != null
      ) {
        distanceMeters = haversineMeters(previousPayload.lat, previousPayload.lng, payload.lat, payload.lng);
      }

      if (timeDiffMs < 15000 && distanceMeters < 10 && payload.status === previousPayload.status) {
        await this.storage.dequeue(current.id);
      } else {
        kept.push(current);
      }
    }

    return kept;
  }

  private async processItem(item: QueueItem, identity: SyncIdentity): Promise<boolean> {
    if (!['TIME_IN', 'TIME_OUT', 'LOCATION_PING'].includes(item.action)) {
      await this.markPermanentFailure(item, `Unknown sync action: ${item.action}`);
      return true;
    }

    await this.storage.updateQueueItem(item.id, {
      status: 'processing',
      processingStartedAt: this.now().toISOString(),
      failedAt: null
    });

    try {
      switch (item.action) {
        case 'TIME_IN':
          await this.syncTimeIn(item);
          await this.patchTimeInCache(item, identity);
          break;
        case 'TIME_OUT':
          await this.syncTimeOut(item);
          await this.patchTimeOutCache(item, identity);
          break;
        case 'LOCATION_PING':
          await this.syncLocationPing(item);
          break;
      }

      await this.storage.dequeue(item.id);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isPermanentSyncFailure(err)) {
        await this.markPermanentFailure(item, errorMessage);
        return true;
      }

      const nextRetryCount = item.retryCount + 1;
      const exhausted = nextRetryCount >= MAX_SYNC_RETRIES;
      await this.storage.updateQueueItem(item.id, {
        status: 'failed',
        retryCount: nextRetryCount,
        lastError: errorMessage,
        processingStartedAt: null,
        failedAt: exhausted ? this.now().toISOString() : null
      });

      if (!exhausted) {
        this.scheduleSync(Math.min(30000, Math.pow(2, nextRetryCount) * 1000));
      }
      return exhausted;
    }
  }

  private async markPermanentFailure(item: QueueItem, reason: string): Promise<void> {
    await this.storage.updateQueueItem(item.id, {
      status: 'failed',
      retryCount: MAX_SYNC_RETRIES,
      lastError: reason,
      processingStartedAt: null,
      failedAt: this.now().toISOString()
    });
  }

  private scheduleSync(delayMs: number): void {
    if (this.retryTimer) this.cancelScheduled(this.retryTimer);
    this.retryTimer = this.schedule(() => {
      this.retryTimer = null;
      void this.triggerSync();
    }, delayMs);
  }

  protected async syncTimeIn(item: QueueItem): Promise<void> {
    const payload = item.payload as TimeInPayload;
    assertRiderIdentity(item, payload.rider_id);
    if (!payload.date) throw new PermanentSyncError('Invalid TIME_IN payload: missing date.');
    if (!isAttendanceEventTimestampValid(payload.date, item.eventTimestamp)) {
      throw new PermanentSyncError(
        `TIME_IN event timestamp is outside the allowed attendance window for ${payload.date}.`
      );
    }

    const requestedId = payload.attendance_log_id || payload.id || item.idempotencyKey;
    const { data: existing, error: lookupError } = await supabase
      .from('attendance_logs')
      .select('id')
      .eq('rider_id', item.riderId)
      .eq('date', payload.date)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const attendanceLogId = existing?.id || requestedId;
    const { error } = await supabase.from('attendance_logs').upsert({
      id: attendanceLogId,
      rider_id: item.riderId,
      date: payload.date,
      time_in: item.eventTimestamp,
      status: payload.status || 'present',
      source: payload.source || 'face-scan'
    });
    if (error && !isDuplicateError(error)) throw error;

    payload.attendance_log_id = attendanceLogId;
    const { error: riderError } = await supabase
      .from('riders')
      .update({ status: 'active' })
      .eq('id', item.riderId);
    if (riderError) console.warn('[SyncEngine] Failed to update active rider status:', riderError);
  }

  protected async syncTimeOut(item: QueueItem): Promise<void> {
    const payload = item.payload as TimeOutPayload;
    assertRiderIdentity(item, payload.rider_id);
    const attendanceLogId = payload.attendance_log_id || payload.id;
    if (!attendanceLogId || !payload.date) {
      throw new PermanentSyncError('Invalid TIME_OUT payload: missing attendance log ID, rider ID, or date.');
    }

    const { data, error } = await supabase
      .from('attendance_logs')
      .update({ time_out: item.eventTimestamp })
      .eq('id', attendanceLogId)
      .eq('rider_id', item.riderId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Attendance log ${attendanceLogId} was not available for TIME_OUT replay.`);

    const riderUpdate: Record<string, unknown> = {
      status: 'offline',
      last_ping: item.eventTimestamp
    };
    if (payload.lat != null && payload.lng != null) {
      riderUpdate.lat = payload.lat;
      riderUpdate.lng = payload.lng;
    }
    const { error: riderError } = await supabase
      .from('riders')
      .update(riderUpdate)
      .eq('id', item.riderId);
    if (riderError) console.warn('[SyncEngine] Failed to update offline rider status:', riderError);
  }

  protected async syncLocationPing(item: QueueItem): Promise<void> {
    const record = buildLocationRecord(item);
    const { data: existing, error: lookupError } = await supabase
      .from('rider_locations')
      .select('id')
      .eq('id', record.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return;

    const { error } = await supabase.from('rider_locations').insert(record);
    if (error && !isDuplicateError(error)) throw error;
  }

  private async patchTimeInCache(item: QueueItem, identity: SyncIdentity): Promise<void> {
    const payload = item.payload as TimeInPayload;
    if (!payload.date) return;
    await this.patchAttendanceCache(identity.authUserId, identity.riderId, {
      id: payload.attendance_log_id || payload.id || item.idempotencyKey,
      rider_id: identity.riderId,
      date: payload.date,
      time_in: item.eventTimestamp,
      time_out: null,
      hours: 0,
      status: payload.status || 'present',
      source: payload.source || 'face-scan'
    });
  }

  private async patchTimeOutCache(item: QueueItem, identity: SyncIdentity): Promise<void> {
    const payload = item.payload as TimeOutPayload;
    const attendanceLogId = payload.attendance_log_id || payload.id;
    if (!attendanceLogId || !payload.date) return;
    await this.patchAttendanceCache(identity.authUserId, identity.riderId, {
      id: attendanceLogId,
      rider_id: identity.riderId,
      date: payload.date,
      time_in: payload.time_in,
      time_out: item.eventTimestamp,
      status: 'present'
    });
  }

  private async publishStatus(): Promise<void> {
    if (this.statusListeners.size === 0) return;
    try {
      const status = await this.getStatus();
      this.statusListeners.forEach((listener) => listener(status));
    } catch (err) {
      console.warn('[SyncEngine] Failed to publish queue status:', err);
    }
  }
}

export function getSyncEngine(): SyncEngine {
  return SyncEngine.getInstance();
}

export function initSyncEngine(): void {
  getSyncEngine().init();
}

export async function startSyncEngine(identity: SyncIdentity): Promise<void> {
  await getSyncEngine().start(identity);
}

export function stopSyncEngine(): void {
  getSyncEngine().stop();
}
