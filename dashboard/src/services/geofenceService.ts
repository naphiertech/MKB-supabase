// Geofence service — in-memory CRUD over the mock zones + riders arrays.
// TODO: replace with Supabase queries when wiring to production backend.
import {
  zones,
  riders,
  violations,
  type Zone,
  type ZoneStatus,
  type Rider } from
'./mockData';
import { randomZoneColor } from '../lib/geofenceUtils';

export interface ZoneInput {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  status: ZoneStatus;
  riderIds: string[];
}

export function listZones(): Zone[] {
  return zones;
}

export function getZoneById(id: string): Zone | undefined {
  return zones.find((z) => z.id === id);
}

export function ridersInZone(zoneId: string): Rider[] {
  return riders.filter((r) => r.zoneId === zoneId);
}

export function riderCountByZone(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const z of zones) counts[z.id] = 0;
  for (const r of riders) {
    if (r.zoneId && counts[r.zoneId] !== undefined) counts[r.zoneId] += 1;
  }
  return counts;
}

export function violationsTodayByZone(): Record<string, number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();
  const counts: Record<string, number> = {};
  for (const z of zones) counts[z.id] = 0;
  for (const v of violations) {
    if (v.ts < cutoff) continue;
    const z = zones.find((zz) => zz.name === v.zoneName);
    if (z) counts[z.id] += 1;
  }
  return counts;
}

export function totalViolationsToday(): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return violations.filter((v) => v.ts >= startOfDay.getTime()).length;
}

export function createZone(input: ZoneInput): Zone {
  const zone: Zone = {
    id: `z-${Date.now()}`,
    name: input.name.trim() || 'Untitled Zone',
    center: [input.lat, input.lng],
    radius: input.radius,
    color: randomZoneColor(),
    status: input.status
  };
  zones.push(zone);
  assignRidersToZone(zone.id, input.riderIds);
  return zone;
}

export function updateZone(id: string, patch: Partial<ZoneInput>): Zone | null {
  const zone = zones.find((z) => z.id === id);
  if (!zone) return null;
  if (patch.name !== undefined) zone.name = patch.name.trim() || zone.name;
  if (patch.lat !== undefined || patch.lng !== undefined) {
    zone.center = [patch.lat ?? zone.center[0], patch.lng ?? zone.center[1]];
  }
  if (patch.radius !== undefined) zone.radius = patch.radius;
  if (patch.status !== undefined) zone.status = patch.status;
  if (patch.riderIds !== undefined) {
    // Unassign previous riders of this zone, then reassign
    riders.forEach((r) => {
      if (r.zoneId === id && !patch.riderIds!.includes(r.id)) {
        r.zoneId = null;
      }
    });
    assignRidersToZone(id, patch.riderIds);
  }
  return zone;
}

export function deleteZone(id: string): {
  zone: Zone | null;
  unassignedRiderIds: string[];
} {
  const idx = zones.findIndex((z) => z.id === id);
  if (idx === -1) return { zone: null, unassignedRiderIds: [] };
  const [zone] = zones.splice(idx, 1);
  const unassigned: string[] = [];
  riders.forEach((r) => {
    if (r.zoneId === id) {
      r.zoneId = null;
      unassigned.push(r.id);
    }
  });
  return { zone, unassignedRiderIds: unassigned };
}

export function assignRidersToZone(zoneId: string, riderIds: string[]): void {
  const set = new Set(riderIds);
  riders.forEach((r) => {
    if (set.has(r.id)) {
      r.zoneId = zoneId;
    }
  });
}

export function setZoneStatus(id: string, status: ZoneStatus): void {
  const z = zones.find((zz) => zz.id === id);
  if (z) z.status = status;
}