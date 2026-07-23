import Dexie, { type Table } from 'dexie';
import { type StorageAdapter, type QueueItem, type CacheEntry } from './StorageAdapter';

class RiderOfflineDatabase extends Dexie {
  kvStore!: Table<CacheEntry, string>;
  syncQueue!: Table<QueueItem, string>;

  constructor() {
    super('MKB_Rider_Offline_DB');
    this.version(1).stores({
      kvStore: 'key, expiresAt',
      syncQueue: 'id, action, priority, createdAt, status'
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

  async enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<QueueItem> {
    const queueItem: QueueItem = {
      ...item,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending'
    };

    await this.db.syncQueue.put(queueItem);
    return queueItem;
  }

  async getQueue(): Promise<QueueItem[]> {
    try {
      return await this.db.syncQueue
        .orderBy('priority')
        .toArray();
    } catch (err) {
      console.warn('[DexieAdapter] getQueue failed:', err);
      return [];
    }
  }

  async dequeue(id: string): Promise<void> {
    try {
      await this.db.syncQueue.delete(id);
    } catch (err) {
      console.warn(`[DexieAdapter] dequeue failed for ID "${id}":`, err);
    }
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void> {
    try {
      await this.db.syncQueue.update(id, updates);
    } catch (err) {
      console.warn(`[DexieAdapter] updateQueueItem failed for ID "${id}":`, err);
    }
  }

  async clearQueue(): Promise<void> {
    try {
      await this.db.syncQueue.clear();
    } catch (err) {
      console.warn('[DexieAdapter] clearQueue failed:', err);
    }
  }
}
