import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

import * as geofenceService from './geofenceService';

beforeEach(() => vi.clearAllMocks());

describe('authorized hub zone loading', () => {
  it('uses an explicit hub filter so the global workspace filter does not hide other authorized zones', async () => {
    const query = { select: vi.fn(), in: vi.fn(), order: vi.fn() };
    query.select.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.order.mockResolvedValue({ data: [], error: null });
    mocks.from.mockReturnValue(query);
    const getZonesForHubs = (geofenceService as typeof geofenceService & {
      getZonesForHubs?: (hubIds: string[]) => Promise<unknown[]>;
    }).getZonesForHubs;

    expect(typeof getZonesForHubs).toBe('function');
    await getZonesForHubs?.(['hub-1', 'hub-2']);

    expect(query.in).toHaveBeenCalledWith('hub_id', ['hub-1', 'hub-2']);
  });
});
