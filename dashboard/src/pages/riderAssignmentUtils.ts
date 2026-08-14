import type { RiderAssignmentRow } from '../services/riderAssignmentService';

export interface RiderAssignmentFilters {
  hubId: string;
  zoneId: string;
  assignmentType: string;
  status: string;
  search: string;
}

export function filterAssignmentRows(rows: RiderAssignmentRow[], filters: RiderAssignmentFilters): RiderAssignmentRow[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return rows.filter((row) => (
    (!filters.hubId || row.operationalHubId === filters.hubId || row.homeHubId === filters.hubId)
    && (!filters.zoneId || row.operationalZoneId === filters.zoneId)
    && (!filters.assignmentType || row.assignmentType === filters.assignmentType)
    && (!filters.status || row.status === filters.status)
    && (!query || row.riderName.toLocaleLowerCase().includes(query) || row.riderCode.toLocaleLowerCase().includes(query))
  ));
}

export function calculateAssignmentSummary(rows: RiderAssignmentRow[], today: string) {
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 7);
  const soonDate = soon.toISOString().slice(0, 10);
  return {
    activeAssignments: rows.filter((row) => Boolean(row.homeHubId && row.homeZoneId && row.operationalHubId && row.operationalZoneId)).length,
    temporaryDeployments: rows.filter((row) => row.assignmentType === 'temporary_deployment' && row.status === 'active').length,
    expiringSoon: rows.filter((row) => row.status === 'active' && row.endDate && row.endDate >= today && row.endDate <= soonDate).length,
    unassignedRiders: rows.filter((row) => !row.homeHubId || !row.homeZoneId).length,
  };
}

export function validateAssignmentTarget(
  hubId: string,
  zoneId: string,
  zones: Array<{ id: string; hubId?: string | null; status?: string }>,
): string | null {
  if (!hubId) return 'Target hub is required.';
  const zone = zones.find((item) => item.id === zoneId);
  if (!zone || zone.hubId !== hubId || zone.status !== 'active') return 'Select an active zone under the target hub.';
  return null;
}
