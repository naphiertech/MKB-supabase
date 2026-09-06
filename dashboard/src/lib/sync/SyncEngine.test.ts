import { describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../supabaseClient', () => ({
  supabase: { from: supabaseMocks.from },
}));
import {
  MAX_SYNC_RETRIES,
  SyncEngine,
  buildLocationRecord,
  isAttendanceEventTimestampValid,
  isPermanentSyncFailure,
  type SyncEngineOptions,
  type SyncIdentity
} from './SyncEngine';
import {
  createSyncOperationId,
  type QueueEnqueueInput,
  type QueueItem,
  type StorageAdapter
} from '../storage';

class MemoryStorageAdapter implements StorageAdapter {
  private queue: QueueItem[];

  constructor(items: QueueItem[] = []) {
    this.queue = items.map((item) => ({ ...item, payload: { ...item.payload } }));
  }

  async getItem<T>(_key: string): Promise<T | null> {
    return null;
  }

  async setItem<T>(_key: string, _value: T, _ttlMs?: number): Promise<void> {
    return undefined;
  }

  async removeItem(_key: string): Promise<void> {
    return undefined;
  }

  async clearCache(): Promise<void> {
    return undefined;
  }
  async getAllKeys(): Promise<string[]> {
    return [];
  }

  async enqueue(input: QueueEnqueueInput): Promise<QueueItem> {
    const existing = this.queue.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const item: QueueItem = {
      ...input,
      id: createSyncOperationId(),
      createdAt: input.eventTimestamp,
      retryCount: 0,
      status: 'pending',
      processingStartedAt: null,
      failedAt: null
    };
    this.queue.push(item);
    return item;
  }

  async getQueue(): Promise<QueueItem[]> {
    return this.queue.map((item) => ({ ...item, payload: { ...item.payload } }));
  }

  async dequeue(id: string): Promise<void> {
    this.queue = this.queue.filter((item) => item.id !== id);
  }

  async updateQueueItem(id: string, updates: Partial<QueueItem>): Promise<void> {
    const item = this.queue.find((entry) => entry.id === id);
    if (item) Object.assign(item, updates);
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
  }
}

function queueItem(
  action: string,
  overrides: Partial<QueueItem> = {}
): QueueItem {
  const eventTimestamp = overrides.eventTimestamp || '2026-08-04T08:00:00.000Z';
  return {
    id: overrides.id || createSyncOperationId(),
    action,
    riderId: overrides.riderId ?? 'rider-1',
    idempotencyKey: overrides.idempotencyKey || createSyncOperationId(),
    eventTimestamp,
    payload: overrides.payload || {},
    priority: overrides.priority || 1,
    createdAt: overrides.createdAt || eventTimestamp,
    retryCount: overrides.retryCount || 0,
    status: overrides.status || 'pending',
    processingStartedAt: overrides.processingStartedAt ?? null,
    failedAt: overrides.failedAt ?? null,
    lastError: overrides.lastError
  };
}

class RecordingSyncEngine extends SyncEngine {
  readonly replayAttempts: QueueItem[] = [];
  readonly persistedKeys: Set<string>;
  databaseWrites = 0;
  failWith: Error | null = null;

  constructor(options: SyncEngineOptions, persistedKeys: Set<string> = new Set()) {
    super(options);
    this.persistedKeys = persistedKeys;
  }

  private async record(item: QueueItem): Promise<void> {
    this.replayAttempts.push(item);
    if (this.failWith) throw this.failWith;
    if (!this.persistedKeys.has(item.idempotencyKey)) this.databaseWrites += 1;
    this.persistedKeys.add(item.idempotencyKey);
  }

  protected override syncTimeIn(item: QueueItem): Promise<void> {
    return this.record(item);
  }

  protected override syncTimeOut(item: QueueItem): Promise<void> {
    return this.record(item);
  }

  protected override syncLocationPing(item: QueueItem): Promise<void> {
    return this.record(item);
  }
}

class DatabaseSyncEngine extends SyncEngine {
  replayTimeIn(item: QueueItem): Promise<void> {
    return super.syncTimeIn(item);
  }

  replayTimeOut(item: QueueItem): Promise<void> {
    return super.syncTimeOut(item);
  }
}

const identity: SyncIdentity = {
  authUserId: 'auth-user-1',
  riderId: 'rider-1'
};

function engineOptions(storage: StorageAdapter): SyncEngineOptions {
  return {
    storage,
    isOnline: () => true,
    now: () => new Date('2026-08-04T10:00:00.000Z'),
    schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
    cancelScheduled: () => undefined,
    patchAttendanceCache: vi.fn().mockResolvedValue(undefined)
  };
}

describe('SyncEngine recovery and replay guarantees', () => {
  it('classifies permanent PostgREST 400 and authorization errors without retrying', () => {
    expect(isPermanentSyncFailure({ code: '428C9', status: 400 })).toBe(true);
    expect(isPermanentSyncFailure({ code: '42501', message: 'restricted' })).toBe(true);
    expect(isPermanentSyncFailure({ code: 'PGRST100', status: 400 })).toBe(true);
    expect(isPermanentSyncFailure({ code: 'PGRST000' })).toBe(false);
    expect(isPermanentSyncFailure({ status: 429 })).toBe(false);
  });

  it('does not replay queued work before authenticated rider identity is supplied', async () => {
    const pending = queueItem('TIME_IN', {
      payload: { rider_id: 'rider-1', date: '2026-08-04' }
    });
    const storage = new MemoryStorageAdapter([pending]);
    const engine = new RecordingSyncEngine(engineOptions(storage));

    await engine.triggerSync();
    expect(engine.replayAttempts).toHaveLength(0);
    await expect(storage.getQueue()).resolves.toHaveLength(1);

    await engine.start(identity);
    expect(engine.replayAttempts).toHaveLength(1);
  });

  it('recovers an interrupted processing item and reuses its idempotency key', async () => {
    const idempotencyKey = createSyncOperationId();
    const interrupted = queueItem('LOCATION_PING', {
      idempotencyKey,
      priority: 3,
      status: 'processing',
      processingStartedAt: '2026-08-04T09:50:00.000Z',
      payload: { rider_id: 'rider-1', lat: 14.5, lng: 121, status: 'active' }
    });
    const storage = new MemoryStorageAdapter([interrupted]);
    const alreadyPersisted = new Set([idempotencyKey]);
    const engine = new RecordingSyncEngine(engineOptions(storage), alreadyPersisted);

    await engine.start(identity);

    expect(engine.replayAttempts).toHaveLength(1);
    expect(engine.replayAttempts[0].idempotencyKey).toBe(idempotencyKey);
    expect(engine.databaseWrites).toBe(0);
    expect(alreadyPersisted).toHaveLength(1);
    await expect(storage.getQueue()).resolves.toHaveLength(0);
  });

  it('recovers stale processing state while offline without replaying it', async () => {
    const interrupted = queueItem('LOCATION_PING', {
      status: 'processing',
      processingStartedAt: '2026-08-04T09:50:00.000Z',
      payload: { rider_id: 'rider-1', lat: 14.5, lng: 121, status: 'active' }
    });
    const storage = new MemoryStorageAdapter([interrupted]);
    const engine = new RecordingSyncEngine({
      ...engineOptions(storage),
      isOnline: () => false
    });

    await engine.start(identity);

    await expect(storage.getQueue()).resolves.toEqual([
      expect.objectContaining({
        id: interrupted.id,
        status: 'pending',
        processingStartedAt: null,
        lastError: 'Recovered after an interrupted synchronization attempt.'
      })
    ]);
    expect(engine.replayAttempts).toHaveLength(0);
  });

  it('retains unknown actions as permanent failures', async () => {
    const unknown = queueItem('UNKNOWN_ACTION');
    const storage = new MemoryStorageAdapter([unknown]);
    const engine = new RecordingSyncEngine(engineOptions(storage));

    await engine.start(identity);

    const [failed] = await storage.getQueue();
    expect(failed.status).toBe('failed');
    expect(failed.retryCount).toBe(MAX_SYNC_RETRIES);
    expect(failed.failedAt).toBe('2026-08-04T10:00:00.000Z');
    expect(failed.lastError).toContain('Unknown sync action');
    await expect(engine.getFailedOperations()).resolves.toEqual([
      expect.objectContaining({ id: unknown.id, status: 'failed' })
    ]);
  });

  it('quarantines legacy operations that have no canonical rider owner', async () => {
    const unowned = queueItem('TIME_OUT', {
      riderId: '',
      payload: {
        attendance_log_id: '20000000-0000-4000-8000-000000000002',
        time_out: '2026-08-04T09:00:00.000Z'
      }
    });
    const storage = new MemoryStorageAdapter([unowned]);
    const engine = new RecordingSyncEngine(engineOptions(storage));

    await engine.start(identity);

    const [failed] = await engine.getFailedOperations();
    expect(failed).toMatchObject({
      id: unowned.id,
      status: 'failed',
      retryCount: MAX_SYNC_RETRIES
    });
    expect(failed.lastError).toContain('canonical rider ID');
    expect(engine.replayAttempts).toHaveLength(0);
  });

  it('marks an exhausted retry as permanently failed and keeps it visible', async () => {
    const item = queueItem('TIME_IN', { retryCount: MAX_SYNC_RETRIES - 1 });
    const storage = new MemoryStorageAdapter([item]);
    const engine = new RecordingSyncEngine(engineOptions(storage));
    engine.failWith = new Error('database unavailable');

    await engine.start(identity);

    const [failed] = await storage.getQueue();
    expect(failed).toMatchObject({
      status: 'failed',
      retryCount: MAX_SYNC_RETRIES,
      failedAt: '2026-08-04T10:00:00.000Z',
      lastError: 'database unavailable'
    });
  });

  it('quarantines a permanent database rejection after one attempt', async () => {
    const item = queueItem('TIME_IN');
    const storage = new MemoryStorageAdapter([item]);
    const engine = new RecordingSyncEngine(engineOptions(storage));
    engine.failWith = Object.assign(new Error('restricted'), { code: '42501', status: 403 });

    await engine.start(identity);

    const [failed] = await storage.getQueue();
    expect(engine.replayAttempts).toHaveLength(1);
    expect(failed).toMatchObject({
      status: 'failed',
      retryCount: MAX_SYNC_RETRIES,
      failedAt: '2026-08-04T10:00:00.000Z',
      lastError: 'restricted'
    });
  });

  it('allows the authenticated rider to safely retry a permanent failure', async () => {
    const item = queueItem('TIME_IN', {
      status: 'failed',
      retryCount: MAX_SYNC_RETRIES,
      failedAt: '2026-08-04T10:00:00.000Z',
      lastError: 'database unavailable'
    });
    const storage = new MemoryStorageAdapter([item]);
    const engine = new RecordingSyncEngine(engineOptions(storage));

    await engine.start(identity);
    await expect(engine.retryFailedOperation(item.id)).resolves.toBe(true);

    expect(engine.replayAttempts).toEqual([
      expect.objectContaining({
        id: item.id,
        idempotencyKey: item.idempotencyKey,
        retryCount: 0,
        status: 'pending'
      })
    ]);
    await expect(storage.getQueue()).resolves.toEqual([]);
  });

  it('does not retry a failed operation owned by another rider', async () => {
    const item = queueItem('TIME_IN', {
      riderId: 'rider-2',
      status: 'failed',
      retryCount: MAX_SYNC_RETRIES
    });
    const storage = new MemoryStorageAdapter([item]);
    const engine = new RecordingSyncEngine(engineOptions(storage));

    await engine.start(identity);
    await expect(engine.retryFailedOperation(item.id)).resolves.toBe(false);
    await expect(storage.getQueue()).resolves.toEqual([item]);
  });

  it('processes only the authenticated rider and uses the auth user ID for cache updates', async () => {
    const riderOne = queueItem('TIME_IN', {
      payload: { rider_id: 'rider-1', date: '2026-08-04' }
    });
    const riderTwo = queueItem('TIME_IN', {
      riderId: 'rider-2',
      payload: { rider_id: 'rider-2', date: '2026-08-04' }
    });
    const storage = new MemoryStorageAdapter([riderOne, riderTwo]);
    const options = engineOptions(storage);
    const engine = new RecordingSyncEngine(options);

    await engine.start(identity);

    expect(engine.replayAttempts.map((item) => item.riderId)).toEqual(['rider-1']);
    expect(options.patchAttendanceCache).toHaveBeenCalledWith(
      'auth-user-1',
      'rider-1',
      expect.any(Object)
    );
    await expect(storage.getQueue()).resolves.toEqual([
      expect.objectContaining({ riderId: 'rider-2', status: 'pending' })
    ]);
  });

  it('uses the original location timestamp and idempotency key in the database record', () => {
    const item = queueItem('LOCATION_PING', {
      idempotencyKey: '10000000-0000-4000-8000-000000000010',
      eventTimestamp: '2026-08-03T23:59:30.000Z',
      payload: { rider_id: 'rider-1', lat: 14.5, lng: 121, status: 'active' }
    });

    expect(buildLocationRecord(item)).toEqual({
      id: '10000000-0000-4000-8000-000000000010',
      rider_id: 'rider-1',
      lat: 14.5,
      lng: 121,
      status: 'active',
      recorded_at: '2026-08-03T23:59:30.000Z'
    });
  });

  it('replays unresolved-zone location coordinates without inventing a client status', () => {
    const item = queueItem('LOCATION_PING', {
      idempotencyKey: '10000000-0000-4000-8000-000000000011',
      eventTimestamp: '2026-08-04T08:00:00.000Z',
      payload: { rider_id: 'rider-1', lat: 6.9214, lng: 122.079 },
    });

    expect(buildLocationRecord(item)).toEqual({
      id: '10000000-0000-4000-8000-000000000011',
      rider_id: 'rider-1',
      lat: 6.9214,
      lng: 122.079,
      recorded_at: '2026-08-04T08:00:00.000Z',
    });
  });

  it('validates historical Time In against its event time rather than its replay day', () => {
    expect(isAttendanceEventTimestampValid(
      '2026-08-03',
      '2026-08-03T07:30:00.000Z'
    )).toBe(true);
    expect(isAttendanceEventTimestampValid(
      '2026-08-03',
      '2026-08-03T09:30:00.000Z'
    )).toBe(false);
  });

  it('replays a self-contained Time Out after a new engine instance starts', async () => {
    const timeOut = queueItem('TIME_OUT', {
      eventTimestamp: '2026-08-04T09:00:00.000Z',
      payload: {
        attendance_log_id: '20000000-0000-4000-8000-000000000001',
        rider_id: 'rider-1',
        date: '2026-08-04',
        time_out: '2026-08-04T09:00:00.000Z',
        lat: 14.5,
        lng: 121
      }
    });
    const storage = new MemoryStorageAdapter([timeOut]);

    const restartedEngine = new RecordingSyncEngine(engineOptions(storage));
    await restartedEngine.start(identity);

    expect(restartedEngine.replayAttempts).toEqual([
      expect.objectContaining({
        action: 'TIME_OUT',
        riderId: 'rider-1',
        eventTimestamp: '2026-08-04T09:00:00.000Z',
        payload: expect.objectContaining({
          attendance_log_id: '20000000-0000-4000-8000-000000000001',
          date: '2026-08-04',
          lat: 14.5,
          lng: 121
        })
      })
    ]);
    await expect(storage.getQueue()).resolves.toHaveLength(0);
  });

  it('scopes offline Time Out replay to the attendance business date in its payload', async () => {
    const query = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const canonicalLookup = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    canonicalLookup.select.mockReturnValue(canonicalLookup);
    canonicalLookup.eq.mockReturnValue(canonicalLookup);
    supabaseMocks.from.mockReturnValueOnce(query).mockReturnValueOnce(canonicalLookup);
    const item = queueItem('TIME_OUT', {
      eventTimestamp: '2026-08-05T09:00:00+08:00',
      payload: {
        attendance_log_id: 'monday-open',
        rider_id: 'rider-1',
        date: '2026-08-05',
        time_out: '2026-08-05T09:00:00+08:00',
      },
    });

    await expect(new DatabaseSyncEngine(engineOptions(new MemoryStorageAdapter())).replayTimeOut(item))
      .rejects.toThrow('was not available for TIME_OUT replay');

    expect(query.eq).toHaveBeenCalledWith('date', '2026-08-05');
  });

  it('replays a queued Time Out after Time In adopts the existing system row ID', async () => {
    const timeInLookup = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'system-absent' }, error: null }),
    };
    timeInLookup.select.mockReturnValue(timeInLookup);
    timeInLookup.eq.mockReturnValue(timeInLookup);
    const timeInUpsert = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    const riderActiveUpdate = { update: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }) };
    riderActiveUpdate.update.mockReturnValue(riderActiveUpdate);

    const oldTimeOutUpdate = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    oldTimeOutUpdate.update.mockReturnValue(oldTimeOutUpdate);
    oldTimeOutUpdate.eq.mockReturnValue(oldTimeOutUpdate);
    oldTimeOutUpdate.select.mockReturnValue(oldTimeOutUpdate);

    const canonicalLookup = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'system-absent' }, error: null }),
    };
    canonicalLookup.select.mockReturnValue(canonicalLookup);
    canonicalLookup.eq.mockReturnValue(canonicalLookup);
    const canonicalTimeOutUpdate = {
      update: vi.fn(),
      eq: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'system-absent' }, error: null }),
    };
    canonicalTimeOutUpdate.update.mockReturnValue(canonicalTimeOutUpdate);
    canonicalTimeOutUpdate.eq.mockReturnValue(canonicalTimeOutUpdate);
    canonicalTimeOutUpdate.select.mockReturnValue(canonicalTimeOutUpdate);
    const riderInactiveUpdate = { update: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }) };
    riderInactiveUpdate.update.mockReturnValue(riderInactiveUpdate);

    supabaseMocks.from
      .mockReturnValueOnce(timeInLookup)
      .mockReturnValueOnce(timeInUpsert)
      .mockReturnValueOnce(riderActiveUpdate)
      .mockReturnValueOnce(oldTimeOutUpdate)
      .mockReturnValueOnce(canonicalLookup)
      .mockReturnValueOnce(canonicalTimeOutUpdate)
      .mockReturnValueOnce(riderInactiveUpdate);

    const timeIn = queueItem('TIME_IN', {
      eventTimestamp: '2026-08-04T00:03:00.000Z',
      payload: {
        id: 'offline-attendance',
        attendance_log_id: 'offline-attendance',
        rider_id: 'rider-1',
        date: '2026-08-04',
        status: 'present',
        source: 'face-scan',
      },
    });
    const timeOut = queueItem('TIME_OUT', {
      eventTimestamp: '2026-08-04T09:00:00.000Z',
      payload: {
        id: 'offline-attendance',
        attendance_log_id: 'offline-attendance',
        rider_id: 'rider-1',
        date: '2026-08-04',
        time_in: '2026-08-04T00:03:00.000Z',
      },
    });
    const storage = new MemoryStorageAdapter([timeIn, timeOut]);
    let online = true;
    riderActiveUpdate.eq.mockImplementation(async () => {
      online = false; // connectivity lost after Time In; Time Out stays in storage
      return { error: null };
    });
    const firstEngine = new SyncEngine({ ...engineOptions(storage), isOnline: () => online });
    await firstEngine.start(identity);
    firstEngine.stop();
    const persistedQueue = JSON.parse(JSON.stringify(await storage.getQueue())) as QueueItem[];
    expect(persistedQueue).toHaveLength(1);
    expect(persistedQueue[0].payload.attendance_log_id).toBe('offline-attendance');
    const restartedStorage = new MemoryStorageAdapter(persistedQueue);
    const restartedOptions = engineOptions(restartedStorage);
    const restartedEngine = new SyncEngine(restartedOptions);
    await restartedEngine.start(identity);
    expect(await restartedStorage.getQueue()).toEqual([]);
    expect(restartedOptions.patchAttendanceCache).toHaveBeenCalledWith('auth-user-1','rider-1',expect.objectContaining({ id: 'system-absent' }));

    expect(oldTimeOutUpdate.eq).toHaveBeenCalledWith('id', 'offline-attendance');
    expect(canonicalLookup.eq).toHaveBeenCalledWith('rider_id', 'rider-1');
    expect(canonicalLookup.eq).toHaveBeenCalledWith('date', '2026-08-04');
    expect(canonicalTimeOutUpdate.eq).toHaveBeenCalledWith('id', 'system-absent');
  });

  it('persists Time In when the finalizer wins between canonical lookup and insert', async () => {
    const lookup = (data: { id: string } | null) => {
      const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
      query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
      return query;
    };
    const firstInsert = { upsert: vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate rider date' } }) };
    const retry = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    const riderUpdate = { update: vi.fn(), eq: vi.fn().mockResolvedValue({ error: null }) };
    riderUpdate.update.mockReturnValue(riderUpdate);
    supabaseMocks.from.mockReset();
    const attendanceQueries = [lookup(null), firstInsert, lookup({ id: 'finalizer-row' }), retry];
    supabaseMocks.from.mockImplementation((table: string) => table === 'riders' ? riderUpdate : attendanceQueries.shift());
    const item = queueItem('TIME_IN', { eventTimestamp: '2026-08-04T00:03:00Z', payload: { id: 'offline-row', rider_id: 'rider-1', date: '2026-08-04' } });
    await new DatabaseSyncEngine(engineOptions(new MemoryStorageAdapter())).replayTimeIn(item);
    expect(retry.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'finalizer-row', time_in: '2026-08-04T00:03:00Z' }));
    expect(retry.upsert.mock.calls[0][0]).not.toHaveProperty('time_out');
    expect(item.payload.attendance_log_id).toBe('finalizer-row');
  });
});
