import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStorageAdapter } from '../index';

const adapter = getStorageAdapter();

describe('DexieAdapter', () => {
  beforeEach(async () => {
    await adapter.clearCache();
    await adapter.clearQueue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores, reads, lists, and removes cached values', async () => {
    await adapter.setItem('test_profile', {
      name: 'Test Rider',
      mkbId: 'MKB-9999'
    });

    await expect(adapter.getItem('test_profile')).resolves.toEqual({
      name: 'Test Rider',
      mkbId: 'MKB-9999'
    });
    await expect(adapter.getAllKeys()).resolves.toContain('test_profile');

    await adapter.removeItem('test_profile');
    await expect(adapter.getItem('test_profile')).resolves.toBeNull();
  });

  it('removes cached values after their TTL expires', async () => {
    const now = 1_700_000_000_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);

    await adapter.setItem('temporary', 'value', 1_000);
    dateNow.mockReturnValue(now + 1_001);

    await expect(adapter.getItem('temporary')).resolves.toBeNull();
    await expect(adapter.getAllKeys()).resolves.not.toContain('temporary');
  });

  it('orders queued work by priority and supports updates and removal', async () => {
    const location = await adapter.enqueue({
      action: 'LOCATION_PING',
      riderId: 'rider-1',
      idempotencyKey: '10000000-0000-4000-8000-000000000001',
      eventTimestamp: '2026-08-04T08:00:00.000Z',
      payload: { riderId: 'rider-1' },
      priority: 3
    });
    const attendance = await adapter.enqueue({
      action: 'TIME_IN',
      riderId: 'rider-1',
      idempotencyKey: '10000000-0000-4000-8000-000000000002',
      eventTimestamp: '2026-08-04T08:01:00.000Z',
      payload: { riderId: 'rider-1' },
      priority: 1
    });

    const initialQueue = await adapter.getQueue();
    expect(initialQueue.map((item) => item.id)).toEqual([
      attendance.id,
      location.id
    ]);

    await adapter.updateQueueItem(attendance.id, {
      status: 'processing',
      retryCount: 1
    });
    const updatedQueue = await adapter.getQueue();
    expect(updatedQueue.find((item) => item.id === attendance.id)).toMatchObject({
      status: 'processing',
      retryCount: 1
    });

    await adapter.dequeue(attendance.id);
    await expect(adapter.getQueue()).resolves.toEqual([location]);
  });

  it('deduplicates operations by their stable idempotency key', async () => {
    const operation = {
      action: 'LOCATION_PING' as const,
      riderId: 'rider-1',
      idempotencyKey: '10000000-0000-4000-8000-000000000003',
      eventTimestamp: '2026-08-04T08:02:00.000Z',
      payload: {
        rider_id: 'rider-1',
        lat: 14.5995,
        lng: 120.9842,
        status: 'active'
      },
      priority: 3
    };

    const [first, duplicate] = await Promise.all([
      adapter.enqueue(operation),
      adapter.enqueue(operation)
    ]);

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.idempotencyKey).toBe(operation.idempotencyKey);
    expect(duplicate.eventTimestamp).toBe(operation.eventTimestamp);
    await expect(adapter.getQueue()).resolves.toHaveLength(1);
  });
});
