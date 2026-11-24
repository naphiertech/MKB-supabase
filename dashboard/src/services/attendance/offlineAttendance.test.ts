// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMap = new Map<string, unknown>();
const enqueuedOps: unknown[] = [];

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(),
  },
}));

vi.mock('../../lib/storage', () => ({
  createSyncOperationId: () => 'op-test-123',
  getStorageAdapter: () => ({
    getItem: async <T,>(key: string) => (storageMap.has(key) ? (storageMap.get(key) as T) : null),
    setItem: async (key: string, value: unknown) => {
      storageMap.set(key, value);
    },
    removeItem: async (key: string) => {
      storageMap.delete(key);
    },
    enqueue: async (op: unknown) => {
      enqueuedOps.push(op);
      return op;
    },
  }),
}));

vi.mock('../notifications/notificationService', () => ({
  dispatchNotificationSafe: vi.fn(),
}));

import {
  getMyHubAttendanceGeofence,
  recordTimeIn,
  recordTimeOut,
} from './attendanceService';

describe('offline rider attendance capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
    enqueuedOps.length = 0;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('caches hub attendance geofence online and serves cached geofence when offline', async () => {
    const fence = {
      hub_id: 'hub-1',
      hub_name: 'Baliwasan Operations Hub',
      latitude: 6.912,
      longitude: 122.071,
      attendance_radius_m: 150,
      is_configured: true,
      reason: null,
      message: null,
    };
    mocks.rpc.mockResolvedValueOnce({ data: fence, error: null });

    const onlineFence = await getMyHubAttendanceGeofence('rider-1');
    expect(onlineFence.hub_name).toBe('Baliwasan Operations Hub');

    mocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const offlineFence = await getMyHubAttendanceGeofence('rider-1');
    expect(offlineFence).toEqual(fence);
  });

  it('queues TIME_IN locally with GPS coordinates when rider has no data/signal', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    const log = await recordTimeIn(
      'rider-1',
      { lat: 6.912, lng: 122.071, accuracy: 12, positionTimestamp: '2026-10-27T00:30:00.000Z' },
      24, // allow regardless of local wall clock during test
    );

    expect(log).not.toBeNull();
    expect(log?.id).toBe('offline-op-test-123');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(enqueuedOps).toHaveLength(1);
    expect(enqueuedOps[0]).toMatchObject({
      action: 'TIME_IN',
      riderId: 'rider-1',
      payload: expect.objectContaining({
        lat: 6.912,
        lng: 122.071,
        accuracy: 12,
      }),
    });
  });

  it('queues TIME_OUT locally when network drops mid-request', async () => {
    mocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const ok = await recordTimeOut('offline-op-test-123', {
      riderId: 'rider-1',
      date: '2026-10-27',
      lat: 6.912,
      lng: 122.071,
      accuracy: 10,
      positionTimestamp: '2026-10-27T09:00:00.000Z',
    });

    expect(ok).toBe(true);
    expect(enqueuedOps).toHaveLength(1);
    expect(enqueuedOps[0]).toMatchObject({
      action: 'TIME_OUT',
      riderId: 'rider-1',
      payload: expect.objectContaining({
        lat: 6.912,
        lng: 122.071,
        accuracy: 10,
      }),
    });
  });
});
