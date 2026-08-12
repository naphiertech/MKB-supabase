import { describe, expect, it } from 'vitest';
import type { Rider } from '../../services/types';
import * as zoneFormUtils from './zoneFormUtils';

describe('zone hub selection', () => {
  it('preselects an active authorized workspace hub and requires a choice in All Hubs', () => {
    expect(zoneFormUtils.resolveInitialZoneHubId('hub-2', ['hub-1', 'hub-2'])).toBe('hub-2');
    expect(zoneFormUtils.resolveInitialZoneHubId(null, ['hub-1', 'hub-2'])).toBe('');
    expect(zoneFormUtils.resolveInitialZoneHubId('inactive-hub', ['hub-1'])).toBe('');
  });

  it('only offers riders assigned to the selected hub', () => {
    const riders = [
      { id: 'rider-1', hubId: 'hub-1' },
      { id: 'rider-2', hubId: 'hub-2' },
      { id: 'legacy-rider', hubId: null },
    ] as Rider[];

    expect(zoneFormUtils.filterRidersForZoneHub(riders, 'hub-1').map((rider) => rider.id)).toEqual(['rider-1']);
    expect(zoneFormUtils.filterRidersForZoneHub(riders, '').map((rider) => rider.id)).toEqual([]);
  });
});

describe('zone save errors', () => {
  it('surfaces Error and PostgREST validation messages', () => {
    expect(zoneFormUtils.getZoneSaveErrorMessage(new Error('Assigned hub is required.')))
      .toBe('Assigned hub is required.');
    expect(zoneFormUtils.getZoneSaveErrorMessage({
      code: '23514',
      message: 'Rider and zone must belong to the same hub.',
      details: null,
    })).toBe('Rider and zone must belong to the same hub.');
  });

  it('uses a safe fallback when no database reason is available', () => {
    expect(zoneFormUtils.getZoneSaveErrorMessage(null)).toBe('Unable to save the zone.');
  });
});
