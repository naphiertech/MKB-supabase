import { describe, expect, it } from 'vitest';
import type { RiderAssignmentRow } from '../services/riders/riderAssignmentService';
import { calculateAssignmentSummary, filterAssignmentRows, validateAssignmentTarget } from './riderAssignmentUtils';

const rows = [
  {
    riderId: 'rider-1', riderName: 'Alpha Rider', riderCode: 'MKB-1',
    homeHubId: 'hub-1', homeHubName: 'Home One', operationalHubId: 'hub-2', operationalHubName: 'Ops Two',
    homeZoneId: 'zone-1', homeZoneName: 'Zone One', operationalZoneId: 'zone-2', operationalZoneName: 'Zone Two',
    assignmentId: 'assignment-1', assignmentType: 'temporary_deployment', startDate: '2026-08-13', endDate: '2026-08-15', status: 'active',
  },
  {
    riderId: 'rider-2', riderName: 'Beta Rider', riderCode: 'MKB-2',
    homeHubId: null, homeHubName: null, operationalHubId: null, operationalHubName: null,
    homeZoneId: null, homeZoneName: null, operationalZoneId: null, operationalZoneName: null,
    assignmentId: null, assignmentType: 'unassigned', startDate: null, endDate: null, status: 'unassigned',
  },
] satisfies RiderAssignmentRow[];

describe('Rider assignment workspace filtering', () => {
  it('combines hub, zone, assignment type, status, and rider search', () => {
    expect(filterAssignmentRows(rows, {
      hubId: 'hub-2', zoneId: 'zone-2', assignmentType: 'temporary_deployment', status: 'active', search: 'MKB-1',
    }).map((row) => row.riderId)).toEqual(['rider-1']);
  });

  it('counts active, temporary, expiring, and unassigned riders', () => {
    expect(calculateAssignmentSummary(rows, '2026-08-13')).toEqual({
      activeAssignments: 1, temporaryDeployments: 1, expiringSoon: 1, unassignedRiders: 1,
    });
  });

  it('rejects a target zone outside the selected hub before submitting', () => {
    expect(validateAssignmentTarget('hub-1', 'zone-2', [
      { id: 'zone-2', hubId: 'hub-2', status: 'active' },
    ])).toBe('Select an active zone under the target hub.');
  });
});
