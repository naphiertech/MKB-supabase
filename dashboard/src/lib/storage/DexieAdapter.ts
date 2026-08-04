import Dexie, { type Table } from 'dexie';
import {
  SYNC_QUEUE_CHANGED_EVENT,
  createSyncOperationId,
  type StorageAdapter,
  type QueueItem,
  type QueueEnqueueInput,
  type CacheEntry
} from './StorageAdapter';

function notifyQueueChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SYNC_QUEUE_CHANGED_EVENT));
  }
}

function legacyEventTimestamp(item: Partial<QueueItem>): string {
  const payload = item.payload || {};
  const timestamp = payload.recorded_at || payload.time_in || payload.time_out;
  return typeof timestamp === 'string' ? timestamp : item.createdAt || new Date().toISOString();
}

function legacyRiderId(item: Partial<QueueItem>): string {
  const riderId = item.payload?.rider_id;
  return typeof riderId === 'string' ? riderId : '';
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function legacyIdempotencyKey(item: Partial<QueueItem>): string {
  const payloadId = item.payload?.id;
  if (item.action === 'TIME_IN' && isUuid(payloadId)) return payloadId;
  if (item.action === 'LOCATION_PING' && isUuid(item.id)) return item.id;
  return createSyncOperationId();
}

class RiderOfflineDatabase extends Dexie {
  kvStore!: Table<CacheEntry, string>;
  syncQueue!: Table<QueueItem, string>;

  constructor() {
    super('MKB_Rider_Offline_DB');
    this.version(1).stores({
      kvStore: 'key, expiresAt',
      syncQueue: 'id, action, priority, createdAt, status'
    });
    this.version(2).stores({
      kvStore: 'key, expiresAt',
      syncQueue: 'id, &idempotencyKey, action, riderId, priority, createdAt, status, processingStartedAt'
    }).upgrade(async (transaction) => {
      await transaction.table<QueueItem, string>('syncQueue').toCollection().modify((item) => {
        item.idempotencyKey ||= legacyIdempotencyKey(item);
        item.eventTimestamp ||= legacyEventTimestamp(item);
        item.riderId ||= legacyRiderId(item);
        item.processingStartedAt ??= null;
        item.failedAt ??= null;
      });
    });
  }
}

export class DexieAdapter implements StorageAdapter {
  private db: RiderOfflineDatabase;

  constructor() {
    this.db = new RiderOfflineDatabase();
  }

  // --- Key-Value Cache API ---

  async getItem<T>(key: string): Promise<T | null> {
    try {
      const record = await this.db.kvStore.get(key);
      if (!record) return null;

      // Check TTL expiration
      if (record.expiresAt && Date.now() > record.expiresAt) {
        await this.removeItem(key);
        return null;
      }

      return record.value as T;
    } catch (err) {
      console.warn(`[DexieAdapter] getItem failed for key "${key}":`, err);
      return null;
    }
  }

  async setItem<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const expiresAt = ttlMs ? Date.now() + ttlMs : null;
      await this.db.kvStore.put({
        key,
        value,
        updatedAt: new Date().toISOString(),
        expiresAt
      });
    } catch (err) {
      console.warn(`[DexieAdapter] setItem failed for key "${key}":`, err);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await this.db.kvStore.delete(key);
    } catch (err) {
      console.warn(`[DexieAdapter] removeItem failed for key "${key}":`, err);
    }
  }

  async clearCache(): Promise<void> {
    try {
      await this.db.kvStore.clear();
    } catch (err) {
      console.warn('[DexieAdapter] clearCache failed:', err);
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      return await this.db.kvStore.toCollection().primaryKeys();
    } catch (err) {
      console.warn('[DexieAdapter] getAllKeys failed:', err);
      return [];
    }
  }

  // --- Outbox Queue API ---

  async enqueue(item: QueueEnqueueInput): Promise<QueueItem> {
    const existing = await this.db.syncQueue
      .where('idempotencyKey')
      .equals(item.idempotencyKey)
      .first();
    if (existing) return existing;

    const queueItem: QueueItem = {
      ...item,
      id: createSyncOperationId(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
      processingStartedAt: null,
      failedAt: null
    };

    try {
      await this.db.syncQueue.put(queueItem);
    } catch (error) {
      // Concurrent producers can pass the initial lookup together. The unique
      // index remains authoritative and both callers receive the same row.
      const duplicate = await this.db.syncQueue
        .where('idempotencyKey')
        .equals(item.idempotencyKey)
        .first();
      if (duplicate) return duplicate;
      throw error;
    }
    notifyQueueChanged();
    return queueItem;
  }

  async getQueue(): Promise<QueueItem[]> {
    return this.db.syncQueue
      .orderBy('priority')
      .toArray();
  }

  async dequeue(id: string): Promise<void> {
    await this.db.syncQueue.delete(id);
    notifyQueueChanged();
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void> {
    await this.db.syncQueue.update(id, updates);
    notifyQueueChanged();
  }

  async clearQueue(): Promise<void> {
    await this.db.syncQueue.clear();
    notifyQueueChanged();
  }
}
