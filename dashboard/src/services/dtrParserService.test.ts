import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('../lib/apiService', () => ({ logActivity: mocks.logActivity }));

import { saveImportedLogs } from './dtrParserService';

describe('DTR attendance persistence', () => {
  it('never sends PostgreSQL generated hours in an upsert', async () => {
    const query = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    mocks.from.mockReturnValue(query);

    await expect(saveImportedLogs([{
      riderId: 'rider-1',
      riderName: 'Rider One',
      date: '2026-08-01',
      timeIn: '08:00',
      timeOut: '17:00',
      hours: 9,
      status: 'present',
    }])).resolves.toEqual({ count: 1, error: null });

    const [records] = query.upsert.mock.calls[0];
    expect(records[0]).not.toHaveProperty('hours');
    expect(records[0]).toMatchObject({
      rider_id: 'rider-1',
      date: '2026-08-01',
      time_in: '2026-08-01T08:00:00+08:00',
      time_out: '2026-08-01T17:00:00+08:00',
    });
  });
});
