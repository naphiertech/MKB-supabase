import type { Rider, RiderStatus, Zone } from '../services/types';

export interface ZoneSummary {
  zoneId: string;
  name: string;
  total: number;
  violations: number;
}

export interface FleetSummary {
  total: number;
  byStatus: Record<RiderStatus, number>;
  zones: ZoneSummary[];
  /** Riders whose zone is missing or no longer exists. Counted in `total`, never filterable. */
  unassigned: number;
}

/**
 * Aggregates a fleet into status counts and per-zone counts so a 160+ rider workforce is read as
 * numbers first. Zones are ordered by what needs attention: violations, then size, then name.
 */
export function summarizeFleet(riders: readonly Rider[], zones: readonly Zone[]): FleetSummary {
  const byStatus: Record<RiderStatus, number> = { active: 0, idle: 0, violation: 0, offline: 0 };
  const zoneRows = new Map<string, ZoneSummary>(
    zones.map((zone) => [zone.id, { zoneId: zone.id, name: zone.name, total: 0, violations: 0 }]),
  );
  let unassigned = 0;

  for (const rider of riders) {
    byStatus[rider.status] += 1;
    const row = rider.zoneId ? zoneRows.get(rider.zoneId) : undefined;
    if (!row) {
      unassigned += 1;
      continue;
    }
    row.total += 1;
    if (rider.status === 'violation') row.violations += 1;
  }

  const rankedZones = [...zoneRows.values()]
    .filter((row) => row.total > 0)
    .sort((a, b) => b.violations - a.violations || b.total - a.total || a.name.localeCompare(b.name));

  return { total: riders.length, byStatus, zones: rankedZones, unassigned };
}
