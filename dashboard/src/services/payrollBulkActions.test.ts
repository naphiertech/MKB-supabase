import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: mocks.rpc },
}));

import {
  bulkApprovePayrollRecords,
  bulkMarkPayrollRecordsPaid,
  getPayrollBulkSelectionState,
} from './payrollBulkActions';

const pending = {
  id: '10000000-0000-4000-8000-000000000001',
  status: 'pending',
  updated_at: '2026-08-09T12:00:00Z',
};
const approved = {
  id: '10000000-0000-4000-8000-000000000002',
  status: 'approved',
  updated_at: '2026-08-09T12:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

describe('payroll bulk selection eligibility', () => {
  it('enables only approval for an all-Pending Review selection', () => {
    expect(getPayrollBulkSelectionState([pending, { ...pending, id: '10000000-0000-4000-8000-000000000003' }])).toEqual({
      count: 2,
      canApprove: true,
      canMarkPaid: false,
      feedback: null,
    });
  });

  it('enables only payment for an all-Approved selection', () => {
    expect(getPayrollBulkSelectionState([approved])).toEqual({
      count: 1,
      canApprove: false,
      canMarkPaid: true,
      feedback: null,
    });
  });

  it('keeps mixed statuses safe and explains why neither transition is available', () => {
    expect(getPayrollBulkSelectionState([pending, approved])).toEqual({
      count: 2,
      canApprove: false,
      canMarkPaid: false,
      feedback: 'Select only Pending Review records to approve, or only Approved records to mark as Paid.',
    });
  });
});

describe('payroll bulk transition RPCs', () => {
  it('sends immutable record versions and cutoff context to the approval RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { processed_count: 1, replayed: false }, error: null });

    await expect(bulkApprovePayrollRecords({
      records: [pending],
      cutoffStart: '2026-08-01',
      cutoffEnd: '2026-08-15',
      requestId: '20000000-0000-4000-8000-000000000001',
    })).resolves.toMatchObject({ processed_count: 1, replayed: false });

    expect(mocks.rpc).toHaveBeenCalledWith('bulk_approve_payroll_records', {
      p_records: [{ id: pending.id, updated_at: pending.updated_at }],
      p_cutoff_start: '2026-08-01',
      p_cutoff_end: '2026-08-15',
      p_request_id: '20000000-0000-4000-8000-000000000001',
    });
  });

  it('uses a distinct payment RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: { processed_count: 1, replayed: false }, error: null });

    await bulkMarkPayrollRecordsPaid({
      records: [approved],
      cutoffStart: '2026-08-01',
      cutoffEnd: '2026-08-15',
      requestId: '20000000-0000-4000-8000-000000000002',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('bulk_mark_payroll_records_paid', expect.objectContaining({
      p_records: [{ id: approved.id, updated_at: approved.updated_at }],
    }));
  });

  it('returns only the controlled database message for expected validation failures', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'PAYROLL_BULK_CONFLICT: 2 selected payroll records are no longer Pending Review.', details: 'raw database details' },
    });

    await expect(bulkApprovePayrollRecords({
      records: [pending],
      cutoffStart: '2026-08-01',
      cutoffEnd: '2026-08-15',
      requestId: '20000000-0000-4000-8000-000000000003',
    })).rejects.toThrow('2 selected payroll records are no longer Pending Review.');
  });
});
