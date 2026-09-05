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
vi.mock('../../lib/storage', () => ({
  createSyncOperationId: () => 'request-key-generated',
  getStorageAdapter: () => mocks.storage,
}));

import {
  cancelApprovedRiderAbsenceRequest,
  clearRiderAbsenceRequestCache,
  getCurrentRiderAbsenceWindow,
  getCachedRiderAbsenceRequests,
  getRiderAbsenceWindowForDate,
  listRiderAbsenceRequests,
  reviewRiderAbsenceRequest,
  setCachedRiderAbsenceRequests,
  submitAbsenceNotice,
  submitPlannedLeave,
  shiftRiderAbsenceWindow,
  validateAbsenceNoticeInput,
  validatePlannedLeaveInput,
  withdrawRiderAbsenceRequest,
} from './riderAbsenceRequestService';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.storage.getItem.mockResolvedValue(null);
  mocks.storage.getAllKeys.mockResolvedValue([]);
  mocks.storage.setItem.mockResolvedValue(undefined);
  mocks.storage.removeItem.mockResolvedValue(undefined);
});

describe('Rider Leave & Absence validation', () => {
  it('validates full-day planned leave dates and reason', () => {
    expect(validatePlannedLeaveInput({ startDate: '2026-09-10', endDate: '2026-09-09', reason: 'Trip' })).toContain('before');
    expect(validatePlannedLeaveInput({ startDate: '2026-09-10', endDate: '2026-09-10', reason: '' })).toContain('reason');
    expect(validatePlannedLeaveInput({ startDate: '2026-09-10', endDate: '2026-09-12', reason: 'Personal leave' })).toBeNull();
  });

  it('keeps absence notices to one business date', () => {
    expect(validateAbsenceNoticeInput({ date: '', reason: 'Emergency' })).toContain('date');
    expect(validateAbsenceNoticeInput({ date: '2026-09-10', reason: 'x' })).toContain('reason');
    expect(validateAbsenceNoticeInput({ date: '2026-09-10', reason: 'Unable to report today' })).toBeNull();
  });

  it('uses stable Manila calendar windows that remain bounded and navigable', () => {
    expect(getRiderAbsenceWindowForDate('2026-09-05')).toEqual({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    expect(getRiderAbsenceWindowForDate('2026-09-30')).toEqual({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    expect(shiftRiderAbsenceWindow('2026-09-01', -1)).toEqual({ fromDate: '2026-08-01', toDate: '2026-08-31' });
    expect(shiftRiderAbsenceWindow('2026-09-01', 1)).toEqual({ fromDate: '2026-10-01', toDate: '2026-10-31' });
    expect(getCurrentRiderAbsenceWindow(new Date('2026-09-05T00:00:00Z'))).toEqual({ fromDate: '2026-09-01', toDate: '2026-09-30' });
  });
});

describe('Rider Leave & Absence RPC boundary', () => {
  it('submits planned leave without accepting a client timestamp', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'request-1', error: null });

    await submitPlannedLeave({
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      reason: 'Personal appointment',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('submit_rider_absence_request', {
      p_request_kind: 'planned_leave',
      p_start_date: '2026-09-10',
      p_end_date: '2026-09-12',
      p_reason: 'Personal appointment',
      p_request_key: 'request-key-generated',
    });
  });

  it('submits a single-date absence notice', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'request-2', error: null });

    await submitAbsenceNotice({ date: '2026-09-10', reason: 'Unable to report today', requestKey: 'request-key-2' });

    expect(mocks.rpc).toHaveBeenCalledWith('submit_rider_absence_request', {
      p_request_kind: 'absence_notice',
      p_start_date: '2026-09-10',
      p_end_date: '2026-09-10',
      p_reason: 'Unable to report today',
      p_request_key: 'request-key-2',
    });
  });

  it('uses revisioned RPCs for withdrawal, review, and cancellation', async () => {
    await withdrawRiderAbsenceRequest('request-1', 1, 'Plans changed');
    await reviewRiderAbsenceRequest('request-1', 2, 'approved', 'Reviewed by HR');
    await cancelApprovedRiderAbsenceRequest('request-1', 3, 'Request cancelled');

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'withdraw_rider_absence_request', {
      p_request_id: 'request-1', p_expected_revision: 1, p_reason: 'Plans changed',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'review_rider_absence_request', {
      p_request_id: 'request-1', p_expected_revision: 2, p_decision: 'approved', p_reason: 'Reviewed by HR',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, 'cancel_approved_rider_absence_request', {
      p_request_id: 'request-1', p_expected_revision: 3, p_reason: 'Request cancelled',
    });
  });

  it('maps a bounded staff request query', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });

    await listRiderAbsenceRequests({
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      hubId: 'hub-1',
      requestKind: 'absence_notice',
      status: 'pending',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('list_rider_absence_requests', {
      p_from_date: '2026-09-01',
      p_to_date: '2026-09-30',
      p_hub_id: 'hub-1',
      p_rider_id: null,
      p_status: 'pending',
      p_request_kind: 'absence_notice',
    });
  });

  it('rejects reads beyond the 93-day privacy boundary', async () => {
    await expect(listRiderAbsenceRequests({ fromDate: '2026-01-01', toDate: '2026-04-10' })).rejects.toThrow('93 calendar days');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('Rider Leave & Absence cache ownership', () => {
  it('rejects a cache owned by another Auth user or Rider', async () => {
    mocks.storage.getItem.mockResolvedValueOnce({
      userId: 'other-user',
      riderId: 'other-rider',
      cacheVersion: 1,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      requests: [],
      cachedAt: '2026-09-10T00:00:00Z',
    });

    await expect(getCachedRiderAbsenceRequests('user-1', 'rider-1', '2026-09-01', '2026-09-30')).resolves.toBeNull();
  });

  it('rejects a cache with an obsolete version even when identity matches', async () => {
    mocks.storage.getItem.mockResolvedValueOnce({
      userId: 'user-1',
      riderId: 'rider-1',
      cacheVersion: 0,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      requests: [],
      cachedAt: '2026-09-10T00:00:00Z',
    });

    await expect(getCachedRiderAbsenceRequests('user-1', 'rider-1', '2026-09-01', '2026-09-30')).resolves.toBeNull();
  });

  it('retrieves the same stable monthly cache window on the next Manila day', async () => {
    const dayOneWindow = getRiderAbsenceWindowForDate('2026-09-05');
    const dayTwoWindow = getRiderAbsenceWindowForDate('2026-09-06');
    expect(dayTwoWindow).toEqual(dayOneWindow);
    mocks.storage.getItem.mockResolvedValueOnce({
      userId: 'user-1',
      riderId: 'rider-1',
      cacheVersion: 1,
      ...dayOneWindow,
      requests: [],
      cachedAt: '2026-09-05T00:00:00Z',
    });

    await expect(getCachedRiderAbsenceRequests('user-1', 'rider-1', dayTwoWindow.fromDate, dayTwoWindow.toDate)).resolves.toEqual(
      expect.objectContaining(dayOneWindow),
    );
    expect(mocks.storage.getItem).toHaveBeenCalledWith('rider_absence_request_cache_v1:user-1:rider-1:2026-09-01:2026-09-30');
  });

  it('removes private reasons before writing the offline cache', async () => {
    await setCachedRiderAbsenceRequests({
      userId: 'user-1',
      riderId: 'rider-1',
      cacheVersion: 1,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      cachedAt: '2026-09-10T00:00:00Z',
      requests: [{
        id: 'request-1',
        riderId: 'rider-1',
        riderName: 'Juan Dela Cruz',
        riderMkbId: 'MKB-1',
        requestKind: 'planned_leave',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        hubId: 'hub-1',
        hubName: 'Main Hub',
        reason: 'Private medical reason',
        submittedBy: 'user-1',
        submittedByName: 'Juan Dela Cruz',
        submittedAt: '2026-09-10T00:00:00Z',
        status: 'pending',
        revision: 1,
        reviewedBy: null,
        reviewerName: null,
        reviewedAt: null,
        reviewReason: 'Private review note',
        withdrawnBy: null,
        withdrawnAt: null,
        withdrawalReason: 'Private withdrawal note',
        cancelledBy: null,
        cancelledAt: null,
        cancellationReason: 'Private cancellation note',
        createdAt: '2026-09-10T00:00:00Z',
        updatedAt: '2026-09-10T00:00:00Z',
        updatedBy: 'user-1',
      }],
    });

    expect(mocks.storage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ requests: [expect.objectContaining({ reason: null, reviewReason: null, withdrawalReason: null, cancellationReason: null })] }),
      expect.any(Number),
    );
  });

  it('clears every cached window for the authenticated Rider on logout', async () => {
    mocks.storage.getAllKeys.mockResolvedValueOnce([
      'rider_absence_request_cache_v1:user-1:rider-1:2026-08-01:2026-08-31',
      'rider_absence_request_cache_v1:user-1:rider-1:2026-09-01:2026-09-30',
      'rider_absence_request_cache_v1:other-user:rider-1:2026-09-01:2026-09-30',
    ]);

    await clearRiderAbsenceRequestCache('user-1', 'rider-1');

    expect(mocks.storage.removeItem).toHaveBeenCalledTimes(2);
    expect(mocks.storage.removeItem).toHaveBeenCalledWith('rider_absence_request_cache_v1:user-1:rider-1:2026-08-01:2026-08-31');
    expect(mocks.storage.removeItem).toHaveBeenCalledWith('rider_absence_request_cache_v1:user-1:rider-1:2026-09-01:2026-09-30');
  });
});
