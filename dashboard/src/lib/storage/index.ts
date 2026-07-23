import { type StorageAdapter } from './StorageAdapter';
import { DexieAdapter } from './DexieAdapter';

export * from './StorageAdapter';
export * from './DexieAdapter';

let storageInstance: StorageAdapter | null = null;

/**
 * Returns the active StorageAdapter singleton instance.
 * Currently defaults to DexieAdapter (IndexedDB).
 * Can be swapped to Native SQLite Adapter for Capacitor builds seamlessly.
 */
export function getStorageAdapter(): StorageAdapter {
  if (!storageInstance) {
    storageInstance = new DexieAdapter();
  }
  return storageInstance;
}
