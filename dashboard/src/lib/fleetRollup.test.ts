import { describe, expect, it } from 'vitest';
import type { Rider, RiderStatus, Zone } from '../services/types';
import { summarizeFleet } from './fleetRollup';

const zones = [
  { id: 'z-a', name: 'Alpha' },
  { id: 'z-b', name: 'Bravo' },
  { id: 'z-c', name: 'Charlie' },
] as Zone[];

function rider(id: number, zoneId: string | null, status: RiderStatus): Rider {
  return { id: `r-${id}`, zoneId, status } as Rider;
}

describe('summarizeFleet', () => {
  it('counts a 160 rider fleet by status and zone and the parts add up to the whole', () => {
    const riders: Rider[] = [
      ...Array.from({ length: 100 }, (_, i) => rider(i, 'z-a', 'active')),
      ...Array.from({ length: 40 }, (_, i) => rider(100 + i, 'z-b', 'offline')),
      ...Array.from({ length: 12 }, (_, i) => rider(140 + i, 'z-c', 'idle')),
      ...Array.from({ length: 3 }, (_, i) => rider(152 + i, 'z-c', 'violation')),
      ...Array.from({ length: 5 }, (_, i) => rider(155 + i, null, 'offline')),
    ];

    const summary = summarizeFleet(riders, zones);

    expect(summary.total).toBe(160);
    expect(summary.byStatus).toEqual({ active: 100, idle: 12, violation: 3, offline: 45 });
    expect(summary.unassigned).toBe(5);
    expect(summary.zones.reduce((sum, zone) => sum + zone.total, summary.unassigned)).toBe(160);
  });

  it('ranks zones with violations first, then by size, and drops empty zones', () => {
    const riders: Rider[] = [
      rider(1, 'z-a', 'active'),
      rider(2, 'z-a', 'active'),
      rider(3, 'z-b', 'violation'),
    ];

    expect(summarizeFleet(riders, zones).zones.map((zone) => zone.name)).toEqual(['Bravo', 'Alpha']);
  });

  it('treats a rider in a deleted zone as unassigned', () => {
    const summary = summarizeFleet([rider(1, 'gone', 'active')], zones);
    expect(summary).toMatchObject({ total: 1, unassigned: 1, zones: [] });
  });
});
