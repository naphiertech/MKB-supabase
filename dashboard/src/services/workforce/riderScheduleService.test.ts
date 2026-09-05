import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    getAllKeys: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../../lib/storage', () => ({ getStorageAdapter: () => mocks.storage }));

import {
  addBusinessDays,
  cancelRiderSchedule,
  createRiderSchedule,
  getCachedRiderSchedules,
  getManilaBusinessDate,
  listRiderSchedules,
  startOfBusinessWeek,
  updateRiderSchedule,
  validateRiderScheduleDraft,
} from './riderScheduleService';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.storage.getItem.mockResolvedValue(null);
  mocks.storage.setItem.mockResolvedValue(undefined);
  mocks.storage.getAllKeys.mockResolvedValue([]);
  mocks.storage.removeItem.mockResolvedValue(undefined);
});

describe('Rider Scheduling validation', () => {
  const base = {
    riderId: 'rider-1',
    workDate: '2026-09-07',
    hubId: 'hub-1',
  };

  it('requires a same-day work interval', () => {
    expect(validateRiderScheduleDraft({ ...base, dayKind: 'work', startsAt: '09:00', endsAt: '09:00' })).toContain('before');
    expect(validateRiderScheduleDraft({ ...base, dayKind: 'work', startsAt: '17:00', endsAt: '08:00' })).toContain('before');
    expect(validateRiderScheduleDraft({ ...base, dayKind: 'work', startsAt: null, endsAt: '17:00' })).toContain('require');
  });

  it('rejects an interval on a day off', () => {
    expect(validateRiderScheduleDraft({ ...base, dayKind: 'day_off', startsAt: '08:00', endsAt: '17:00' })).toContain('Day Off');
    expect(validateRiderScheduleDraft({ ...base, dayKind: 'day_off', startsAt: null, endsAt: null })).toBeNull();
  });
});

describe('Rider Scheduling RPC boundary', () => {
  it('creates a day-off draft with no working interval', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'schedule-1', error: null });

    await createRiderSchedule({
      riderId: 'rider-1',
      workDate: '2026-09-07',
      hubId: 'hub-1',
      dayKind: 'day_off',
      startsAt: null,
      endsAt: null,
      reason: 'Weekly rest day',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('create_rider_schedule', {
      p_rider_id: 'rider-1',
      p_work_date: '2026-09-07',
      p_hub_id: 'hub-1',
      p_day_kind: 'day_off',
      p_starts_at: null,
      p_ends_at: null,
      p_reason: 'Weekly rest day',
    });
  });

  it('passes the expected revision for optimistic concurrency', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'schedule-1', error: null });

    await updateRiderSchedule({
      scheduleId: 'schedule-1',
      expectedRevision: 3,
      riderId: 'rider-1',
      workDate: '2026-09-07',
      hubId: 'hub-1',
      dayKind: 'work',
      startsAt: '08:00',
      endsAt: '17:00',
      reason: 'Coverage update',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('update_rider_schedule', {
      p_schedule_id: 'schedule-1',
      p_expected_revision: 3,
      p_hub_id: 'hub-1',
      p_day_kind: 'work',
      p_starts_at: '08:00',
      p_ends_at: '17:00',
      p_reason: 'Coverage update',
    });
  });

  it('uses one authoritative cancellation RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'schedule-1', error: null });

    await cancelRiderSchedule('schedule-1', 4, 'Route was cancelled');

    expect(mocks.rpc).toHaveBeenCalledWith('cancel_rider_schedule', {
      p_schedule_id: 'schedule-1',
      p_expected_revision: 4,
      p_reason: 'Route was cancelled',
    });
  });

  it('maps bounded list results and normalizes database time values', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        id: 'schedule-1', rider_id: 'rider-1', rider_name: 'Juan Dela Cruz', rider_mkb_id: 'MKB-1',
        work_date: '2026-09-07', hub_id: 'hub-1', hub_name: 'Main Hub', day_kind: 'work',
        starts_at: '08:00:00', ends_at: '17:00:00', status: 'published', revision: 2,
        created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
        published_at: '2026-09-02T00:00:00Z', cancelled_at: null, cancellation_reason: null,
      }],
      error: null,
    });

    await expect(listRiderSchedules({ fromDate: '2026-09-07', toDate: '2026-09-13', hubId: 'hub-1' })).resolves.toEqual([{
      id: 'schedule-1', riderId: 'rider-1', riderName: 'Juan Dela Cruz', riderMkbId: 'MKB-1',
      workDate: '2026-09-07', hubId: 'hub-1', hubName: 'Main Hub', dayKind: 'work',
      startsAt: '08:00', endsAt: '17:00', status: 'published', revision: 2,
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
      publishedAt: '2026-09-02T00:00:00Z', cancelledAt: null, cancellationReason: null,
    }]);
  });

  it('rejects over-broad reads before making a request', async () => {
    await expect(listRiderSchedules({ fromDate: '2026-09-01', toDate: '2026-10-15' })).rejects.toThrow('32 calendar days');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('Rider Scheduling dates and cache ownership', () => {
  it('uses the explicit Manila business date formatter', () => {
    expect(getManilaBusinessDate(new Date('2026-09-06T16:30:00.000Z'))).toBe('2026-09-07');
    expect(addBusinessDays('2026-09-07', 6)).toBe('2026-09-13');
    expect(startOfBusinessWeek('2026-09-13')).toBe('2026-09-07');
  });

  it('does not accept a cache payload owned by another account or rider', async () => {
    mocks.storage.getItem.mockResolvedValueOnce({
      userId: 'other-user', riderId: 'other-rider', fromDate: '2026-09-07', toDate: '2026-09-13',
      schedules: [], cachedAt: '2026-09-07T00:00:00Z',
    });

    await expect(getCachedRiderSchedules('user-1', 'rider-1', '2026-09-07', '2026-09-13')).resolves.toBeNull();
  });
});
