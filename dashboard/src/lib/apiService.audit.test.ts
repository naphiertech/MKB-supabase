import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  },
}));

import { getActivityLogs, logActivity } from './apiService';

describe('activity-log actor identity semantics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the immutable actor UUID rather than an email snapshot for new events', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'current@gmail.com' } } });
    mocks.from.mockReturnValue({ insert });

    await logActivity({ eventType: 'test_event', description: 'Test event' });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'admin-1',
      rider_id: null,
      event_type: 'test_event',
      description: 'Test event',
      metadata: {},
    });
    expect(insert.mock.calls[0][0]).not.toHaveProperty('email');
  });

  it('resolves the displayed actor email through the current public.users identity', async () => {
    const range = vi.fn().mockResolvedValue({ data: [], error: null });
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range,
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    await getActivityLogs();

    expect(mocks.from).toHaveBeenCalledWith('activity_logs');
    expect(query.select).toHaveBeenCalledWith(expect.stringMatching(/users\s*\(\s*full_name,\s*email,\s*role\s*\)/));
  });
});
