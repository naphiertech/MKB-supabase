import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));

vi.mock('../lib/apiService', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/hubWorkspaceState', () => ({
  getSelectedHubId: vi.fn(() => 'hub-workspace'),
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

describe('hub-scoped zone creation', () => {
  it('persists the explicitly selected form hub instead of deriving it from the workspace', async () => {
    const query = { insert: vi.fn(), select: vi.fn(), single: vi.fn() };
    query.insert.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockResolvedValue({
      data: {
        id: 'zone-1',
        hub_id: 'hub-form',
        name: 'Zone 1',
        lat: 7,
        lng: 122,
        radius: 500,
        color: '#db6c00',
        status: 'active',
        zone_type: 'circle',
        polygon_coordinates: null,
      },
      error: null,
    });
    mocks.from.mockReturnValue(query);

    await geofenceService.createZone({
      hubId: 'hub-form',
      name: 'Zone 1',
      lat: 7,
      lng: 122,
      radius: 500,
      color: '#db6c00',
      status: 'active',
      riderIds: [],
      zone_type: 'circle',
      polygon_coordinates: null,
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ hub_id: 'hub-form' }));
  });
});
