import { getStorageAdapter } from '../index';

/**
 * Diagnostic Verification Runner for DexieAdapter
 * Validates KV Caching, TTL Expiration, and Outbox Queue CRUD operations.
 */
export async function runDexieAdapterTests(): Promise<{ success: boolean; logs: string[] }> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[StorageAdapter Test] ${msg}`);
    logs.push(msg);
  };

  try {
    log('Initializing StorageAdapter instance...');
    const adapter = getStorageAdapter();

    // 1. Cache setItem and getItem test
    log('Testing setItem and getItem...');
    await adapter.setItem('test_profile', { name: 'Test Rider', mkbId: 'MKB-9999' });
    const profile = await adapter.getItem<{ name: string; mkbId: string }>('test_profile');

    if (!profile || profile.name !== 'Test Rider') {
      throw new Error('KV Store setItem/getItem verification failed!');
    }
    log('KV Store setItem/getItem PASSED.');

    // 2. Cache TTL test
    log('Testing TTL expiration...');
    await adapter.setItem('temp_key', 'temp_value', 50); // 50ms TTL
    await new Promise((resolve) => setTimeout(resolve, 100)); // wait 100ms
    const expiredVal = await adapter.getItem<string>('temp_key');
    if (expiredVal !== null) {
      throw new Error('TTL Expiration verification failed!');
    }
    log('TTL Expiration PASSED.');

    // 3. Queue enqueue and getQueue test
    log('Testing Outbox Queue enqueue...');
    const queuedItem = await adapter.enqueue({
      action: 'TIME_IN',
      payload: { riderId: 'test-uuid-123' },
      priority: 1
    });

    const queue = await adapter.getQueue();
    if (queue.length === 0 || queue[0].id !== queuedItem.id) {
      throw new Error('Outbox Queue enqueue verification failed!');
    }
    log('Outbox Queue enqueue PASSED.');

    // 4. Queue dequeue cleanup
    log('Cleaning up test queue item...');
    await adapter.dequeue(queuedItem.id);
    await adapter.removeItem('test_profile');
    log('Clean up PASSED.');

    log('ALL STORAGE ADAPTER TESTS PASSED SUCCESSFULLY! ✅');
    return { success: true, logs };
  } catch (err) {
    const errorMsg = `STORAGE ADAPTER TEST FAILED: ${err instanceof Error ? err.message : String(err)}`;
    console.error(errorMsg);
    logs.push(errorMsg);
    return { success: false, logs };
  }
}
