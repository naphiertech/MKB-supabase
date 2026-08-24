import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import { createRiderProfile, updateRiderProfile } from './userService';

beforeEach(() => vi.clearAllMocks());

describe('Rider hub persistence', () => {
  it('creates the Rider with the explicitly selected hub and zone', async () => {
    const query = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
    };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockResolvedValue({ data: { id: 'rider-1' }, error: null });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('riders');
      return query;
    });

    await createRiderProfile({
      name: 'Juan Rider',
      email: 'juan@example.test',
      hubId: 'hub-1',
      zoneId: 'zone-1',
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      hub_id: 'hub-1',
      zone_id: 'zone-1',
    }));
  });

  it('updates hub and zone together so the database consistency trigger remains authoritative', async () => {
    const query = { update: vi.fn(), eq: vi.fn() };
    query.update.mockReturnValue(query);
    query.eq.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('riders');
      return query;
    });

    await updateRiderProfile('rider-1', {
      name: 'Juan Rider',
      hubId: 'hub-2',
      zoneId: 'zone-2',
    });

    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      hub_id: 'hub-2',
      zone_id: 'zone-2',
    }));
  });
});
