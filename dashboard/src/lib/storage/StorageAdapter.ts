/**
 * StorageAdapter Interface for Offline-First Data Layer.
 * Provides abstract Key-Value Caching and Outbox Queue APIs.
 */

export interface QueueItem {
  id: string;
  action: 'TIME_IN' | 'TIME_OUT' | 'LOCATION_PING' | 'PROFILE_UPDATE' | 'NOTIF_READ';
  payload: Record<string, unknown>;
  priority: number; // 1: Attendance, 2: Profile, 3: Location
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
  lastError?: string;
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
  enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<QueueItem>;
  getQueue(): Promise<QueueItem[]>;
  dequeue(id: string): Promise<void>;
  updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void>;
  clearQueue(): Promise<void>;
}
