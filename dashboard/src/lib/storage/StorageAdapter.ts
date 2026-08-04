/**
 * StorageAdapter Interface for Offline-First Data Layer.
 * Provides abstract Key-Value Caching and Outbox Queue APIs.
 */

export const SYNC_QUEUE_CHANGED_EVENT = 'attenrider-sync-queue-changed';

export type QueueAction = 'TIME_IN' | 'TIME_OUT' | 'LOCATION_PING';

export interface QueueItem {
  id: string;
  action: string;
  riderId: string;
  idempotencyKey: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
  priority: number; // 1: Attendance, 2: Profile, 3: Location
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  lastError?: string;
  processingStartedAt?: string | null;
  failedAt?: string | null;
}

export interface QueueEnqueueInput {
  action: QueueAction;
  riderId: string;
  idempotencyKey: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
  priority: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: string;
  expiresAt?: number | null;
}

export interface StorageAdapter {
  // Key-Value Cache API
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  removeItem(key: string): Promise<void>;
  clearCache(): Promise<void>;
  getAllKeys(): Promise<string[]>;

  // Outbox Queue API
  enqueue(item: QueueEnqueueInput): Promise<QueueItem>;
  getQueue(): Promise<QueueItem[]>;
  dequeue(id: string): Promise<void>;
  updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void>;
  clearQueue(): Promise<void>;
}

export function createSyncOperationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
