import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getCutoffRangeForDate: vi.fn(),
  refreshDraftPayrollForRiderCutoff: vi.fn(),
  logActivity: vi.fn(),
  validateParcelCount: vi.fn(),
  validateParcelWorkDate: vi.fn(),
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
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
  parcelUpdateError?: { message: string } | null;
  auditError?: { message: string } | null;
  requestStatusError?: { message: string } | null;
}) {
  let correctionTableCalls = 0;
  const auditInsert = vi.fn(async () => {
    options.events.push('audit');
    return { error: options.auditError ?? null };
  });
  const parcelUpdate = vi.fn(() => {
    options.events.push('parcel-update');
    return { eq: vi.fn().mockResolvedValue({ error: options.parcelUpdateError ?? null }) };
  });
  const requestStatusUpdate = vi.fn(() => {
    options.events.push('request-status');
    return { eq: vi.fn().mockResolvedValue({ error: options.requestStatusError ?? null }) };
  });

  mocks.from.mockImplementation((table: string) => {
    if (table === 'parcel_correction_requests') {
      correctionTableCalls += 1;
      if (correctionTableCalls === 1) {
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
      return { update: requestStatusUpdate };
    }
    if (table === 'parcel_logs') return { update: parcelUpdate };
    if (table === 'parcel_log_audit') return { insert: auditInsert };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { auditInsert, parcelUpdate, requestStatusUpdate };
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

  it('creates the request before its audit and activity event', async () => {
    const events: string[] = [];
    const requestInsert = vi.fn(() => {
      events.push('request-insert');
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'request-1' }, error: null }),
        }),
      };
    });
    const auditInsert = vi.fn(async () => {
      events.push('audit');
      return { error: null };
    });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
    });
    mocks.from.mockImplementation((table: string) => table === 'parcel_correction_requests'
      ? { insert: requestInsert }
      : { insert: auditInsert });
    await createParcelCorrectionRequest({
      parcelLogId: 'log-1', riderId: 'rider-1', date: '2026-08-05',
      previousDelivered: 20, previousHeavy: 2, previousFailed: 1, previousReturned: 0,
      requestedDelivered: 22, requestedHeavy: 3, requestedFailed: 1, requestedReturned: 0,
      reason: 'Corrected manifest', requestedBy: 'not-a-uuid',
    });

    expect(events).toEqual(['request-insert', 'audit', 'activity']);
    expect(requestInsert).toHaveBeenCalledWith(expect.objectContaining({ requested_by: null, status: 'pending' }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ changed_by: null, action_type: 'correction_requested' }));
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
      'fetch-request', 'parcel-update', 'audit', 'payroll-sync', 'request-status', 'activity',
    ]);
    expect(configured.auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'correction_approved', approved_by: validReviewerId,
    }));
    expect(mocks.refreshDraftPayrollForRiderCutoff).toHaveBeenCalledWith('rider-1', '2026-08-01', '2026-08-15');
  });

  it('preserves rejection ordering without changing parcel logs or synchronizing payroll', async () => {
    const events: string[] = [];
    const configured = configureReview({ events });
    mocks.logActivity.mockImplementation(async () => {
      events.push('activity');
    });
    await reviewParcelCorrectionRequest('request-1', 'rejected', validReviewerId, 'Rejected notes');

    expect(events).toEqual(['fetch-request', 'audit', 'request-status', 'activity']);
    expect(configured.parcelUpdate).not.toHaveBeenCalled();
    expect(mocks.refreshDraftPayrollForRiderCutoff).not.toHaveBeenCalled();
    expect(configured.auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      action_type: 'correction_rejected', reason: 'Rejected notes', approved_by: validReviewerId,
    }));
  });

  it('stops immediately when the approved parcel update fails', async () => {
    const events: string[] = [];
    const configured = configureReview({ events, parcelUpdateError: { message: 'parcel update failed' } });
    await expect(reviewParcelCorrectionRequest('request-1', 'approved', validReviewerId))
      .rejects.toThrow('Failed to update parcel log: parcel update failed');
    expect(events).toEqual(['fetch-request', 'parcel-update']);
    expect(configured.auditInsert).not.toHaveBeenCalled();
    expect(configured.requestStatusUpdate).not.toHaveBeenCalled();
  });

  it('keeps audit, payroll sync, and activity failures warning-only', async () => {
    const events: string[] = [];
    configureReview({ events, auditError: { message: 'audit failed' } });
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
      'fetch-request', 'parcel-update', 'audit', 'payroll-sync', 'request-status', 'activity',
    ]);
  });

  it('preserves approval side effects when the final request-status update fails', async () => {
    const events: string[] = [];
    configureReview({ events, requestStatusError: { message: 'status failed' } });
    mocks.refreshDraftPayrollForRiderCutoff.mockImplementation(async () => {
      events.push('payroll-sync');
      return { success: true };
    });
    await expect(reviewParcelCorrectionRequest('request-1', 'approved', validReviewerId))
      .rejects.toThrow('Failed to update request status: status failed');
    expect(events).toEqual(['fetch-request', 'parcel-update', 'audit', 'payroll-sync', 'request-status']);
    expect(mocks.logActivity).not.toHaveBeenCalled();
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
