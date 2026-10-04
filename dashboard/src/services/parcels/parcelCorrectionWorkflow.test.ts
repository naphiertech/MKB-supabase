import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getCutoffRangeForDate: vi.fn(),
  refreshDraftPayrollForRiderCutoff: vi.fn(),
  logActivity: vi.fn(),
  validateParcelCount: vi.fn(),
  validateParcelWorkDate: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('../parcelService', () => ({
  getCutoffRangeForDate: mocks.getCutoffRangeForDate,
  refreshDraftPayrollForRiderCutoff: mocks.refreshDraftPayrollForRiderCutoff,
}));
vi.mock('../../lib/apiService', () => ({ logActivity: mocks.logActivity }));
vi.mock('./parcelOperationsPolicy', () => ({
  validateParcelCount: mocks.validateParcelCount,
  validateParcelWorkDate: mocks.validateParcelWorkDate,
}));
import {
  createParcelCorrectionRequest,
  getParcelLogAuditHistory,
  isCutoffLockedForDate,
  reviewParcelCorrectionRequest,
} from './parcelCorrectionWorkflow';

const validReviewerId = '11111111-1111-4111-8111-111111111111';
const requestRow = {
  id: 'request-1',
  parcel_log_id: 'log-1',
  rider_id: 'rider-1',
  date: '2026-08-05',
  previous_delivered: 20,
  previous_heavy: 2,
  previous_failed: 1,
  previous_returned: 0,
  requested_delivered: 22,
  requested_heavy: 3,
  requested_failed: 1,
  requested_returned: 0,
  reason: 'Corrected manifest',
  requested_by: '22222222-2222-4222-8222-222222222222',
};

function configureReview(options: {
  events: string[];
  rpcError?: { message: string } | null;
}) {
  const rpc = vi.fn(async (fnName: string, _args: unknown) => {
    if (fnName === 'review_parcel_correction_request') {
      options.events.push('rpc-review');
      return { error: options.rpcError ?? null };
    }
    throw new Error(`Unexpected rpc: ${fnName}`);
  });
  mocks.rpc.mockImplementation(rpc);

  mocks.from.mockImplementation((table: string) => {
    if (table === 'parcel_correction_requests') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn(async () => {
              options.events.push('fetch-request');
              return { data: requestRow, error: null };
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { rpc };
}

describe('parcel correction workflow characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCutoffRangeForDate.mockReturnValue({ cutoffFrom: '2026-08-01', cutoffTo: '2026-08-15' });
    mocks.refreshDraftPayrollForRiderCutoff.mockResolvedValue({ success: true });
    mocks.logActivity.mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('creates the request via submit_parcel_correction_request RPC and logs activity', async () => {
    const events: string[] = [];
    mocks.rpc.mockImplementation(async (fnName: string, _args: unknown) => {
      if (fnName === 'submit_parcel_correction_request') {
        events.push('rpc-submit');
        return { data: { success: true, request_id: 'request-1' }, error: null };
      }
      throw new Error(`Unexpected rpc: ${fnName}`);
    });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
    });

    await createParcelCorrectionRequest({
      parcelLogId: 'log-1', riderId: 'rider-1', date: '2026-08-05',
      previousDelivered: 20, previousHeavy: 2, previousFailed: 1, previousReturned: 0,
      requestedDelivered: 22, requestedHeavy: 3, requestedFailed: 1, requestedReturned: 0,
      reason: 'Corrected manifest', requestedBy: 'user-1',
    });

    expect(events).toEqual(['rpc-submit', 'activity']);
    expect(mocks.rpc).toHaveBeenCalledWith('submit_parcel_correction_request', {
      p_parcel_log_id: 'log-1',
      p_requested_delivered: 22,
      p_requested_heavy: 3,
      p_requested_failed: 1,
      p_requested_returned: 0,
      p_reason: 'Corrected manifest',
    });
  });

  it('throws when submit_parcel_correction_request RPC fails', async () => {
    mocks.rpc.mockImplementation(async (fnName: string) => {
      if (fnName === 'submit_parcel_correction_request') {
        return { data: null, error: { message: 'Database transaction failed' } };
      }
      throw new Error(`Unexpected rpc: ${fnName}`);
    });

    await expect(createParcelCorrectionRequest({
      parcelLogId: 'log-1', riderId: 'rider-1', date: '2026-08-05',
      previousDelivered: 20, previousHeavy: 2, previousFailed: 1, previousReturned: 0,
      requestedDelivered: 22, requestedHeavy: 3, requestedFailed: 1, requestedReturned: 0,
      reason: 'Corrected manifest', requestedBy: 'user-1',
    })).rejects.toThrow('Failed to submit correction request: Database transaction failed');

    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it('preserves approval ordering', async () => {
    const events: string[] = [];
    const configured = configureReview({ events });
    mocks.refreshDraftPayrollForRiderCutoff.mockImplementation(async () => {
      events.push('payroll-sync');
      return { success: true };
    });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
    });
    await reviewParcelCorrectionRequest('request-1', 'approved', validReviewerId, 'Approved');

    expect(events).toEqual([
      'fetch-request', 'rpc-review', 'payroll-sync', 'activity',
    ]);
    expect(configured.rpc).toHaveBeenCalledWith('review_parcel_correction_request', {
      p_request_id: 'request-1',
      p_decision: 'approved',
      p_review_notes: 'Approved',
    });
    expect(mocks.refreshDraftPayrollForRiderCutoff).toHaveBeenCalledWith('rider-1', '2026-08-01', '2026-08-15');
  });

  it('preserves rejection ordering without synchronizing payroll', async () => {
    const events: string[] = [];
    const configured = configureReview({ events });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
    });
    await reviewParcelCorrectionRequest('request-1', 'rejected', validReviewerId, 'Rejected notes');

    expect(events).toEqual(['fetch-request', 'rpc-review', 'activity']);
    expect(mocks.refreshDraftPayrollForRiderCutoff).not.toHaveBeenCalled();
    expect(configured.rpc).toHaveBeenCalledWith('review_parcel_correction_request', {
      p_request_id: 'request-1',
      p_decision: 'rejected',
      p_review_notes: 'Rejected notes',
    });
  });

  it('stops immediately when the review RPC fails', async () => {
    const events: string[] = [];
    configureReview({ events, rpcError: { message: 'RPC execution failed' } });
    await expect(reviewParcelCorrectionRequest('request-1', 'approved', validReviewerId))
      .rejects.toThrow('Failed to review correction request: RPC execution failed');
    expect(events).toEqual(['fetch-request', 'rpc-review']);
    expect(mocks.refreshDraftPayrollForRiderCutoff).not.toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it('keeps payroll sync and activity failures warning-only', async () => {
    const events: string[] = [];
    configureReview({ events });
    mocks.refreshDraftPayrollForRiderCutoff.mockImplementation(async () => {
      events.push('payroll-sync');
      throw new Error('sync failed');
    });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
      throw new Error('activity failed');
    });
    await expect(reviewParcelCorrectionRequest('request-1', 'approved', validReviewerId))
      .resolves.toBeUndefined();
    expect(events).toEqual([
      'fetch-request', 'rpc-review', 'payroll-sync', 'activity',
    ]);
  });

  it.each([
    ['pending', true],
    ['approved', true],
    ['paid', true],
    ['flagged', true],
    ['draft', false],
    ['rejected', false],
  ])('returns %s lock behavior unchanged', async (status, expected) => {
    const limit = vi.fn().mockResolvedValue({ data: [{ status }], error: null });
    const query = {
      select: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(), limit,
    };
    mocks.from.mockReturnValue(query);
    await expect(isCutoffLockedForDate('2026-08-05')).resolves.toBe(expected);
  });

  it('returns an empty audit history when the audit query fails', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'audit read failed' } });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order,
    });
    await expect(getParcelLogAuditHistory('log-1')).resolves.toEqual([]);
  });
});
