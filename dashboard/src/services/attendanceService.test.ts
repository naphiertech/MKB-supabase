import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));

import { buildTimeOutQueueOperation } from './attendanceService';

describe('Time Out offline payload', () => {
  it('remains independently replayable when GPS is unavailable', () => {
    const operation = buildTimeOutQueueOperation(
      '20000000-0000-4000-8000-000000000001',
      { riderId: 'rider-1', date: '2026-08-04' },
      '2026-08-04T09:00:00.000Z',
      '10000000-0000-4000-8000-000000000001'
    );

    expect(operation).toMatchObject({
      action: 'TIME_OUT',
      riderId: 'rider-1',
      idempotencyKey: '10000000-0000-4000-8000-000000000001',
      eventTimestamp: '2026-08-04T09:00:00.000Z',
      payload: {
        attendance_log_id: '20000000-0000-4000-8000-000000000001',
        rider_id: 'rider-1',
        date: '2026-08-04',
        time_out: '2026-08-04T09:00:00.000Z'
      }
    });
    expect(operation.payload).not.toHaveProperty('lat');
    expect(operation.payload).not.toHaveProperty('lng');
  });
});
