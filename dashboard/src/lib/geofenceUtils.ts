import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { haversine, type Zone } from '../services/types';

export { haversine };

/**
 * Validates whether a Zone has usable, operational geometry.
 */
export function hasOperationalZoneGeometry(zone: Zone | null | undefined): zone is Zone {
  if (!zone || zone.hasValidGeometry === false) return false;
  if (zone.zone_type === 'polygon') {
    return Boolean(
      zone.polygon_coordinates
      && zone.polygon_coordinates.length >= 3
      && zone.polygon_coordinates.every((coord) => coord.every(Number.isFinite))
    );
  }
  return (
    Array.isArray(zone.center)
    && zone.center.length === 2
    && zone.center.every(Number.isFinite)
    && Number.isFinite(zone.radius)
    && zone.radius > 0
  );
}

/**
 * Evaluates whether a location coordinate falls within a zone's boundary.
 * Works uniformly for both radial circle zones and polygonal geofences.
 */
export function isPointInZone(
  point: [number, number] | { lat: number; lng: number },
  zone: Zone | null | undefined,
): boolean | null {
  if (!hasOperationalZoneGeometry(zone)) return null;

  const lat = Array.isArray(point) ? point[0] : point.lat;
  const lng = Array.isArray(point) ? point[1] : point.lng;

  if (zone.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length >= 3) {
    return isPointInPolygon([lat, lng], zone.polygon_coordinates);
  }

  const distance = haversine(zone.center[0], zone.center[1], lat, lng);
  return distance <= zone.radius;
}

/**
 * Evaluates whether a Rider coordinate is inside their Hub Operational Territory:
 * - Their Primary Dispatch Zone, OR
 * - Any active sibling Delivery Zone belonging to the same Hub, OR
 * - Their Hub Attendance Geofence circle.
 */
export function isPointInHubOperationalTerritory(
  point: [number, number] | { lat: number; lng: number },
  primaryZone: Zone | null | undefined,
  hubZones: Zone[] = [],
  hubCircle?: {
    latitude?: number | null;
    longitude?: number | null;
    attendance_radius_m?: number | null;
  } | null,
): boolean | null {
  const lat = Array.isArray(point) ? point[0] : point.lat;
  const lng = Array.isArray(point) ? point[1] : point.lng;

  let hasEvaluatableBoundary = false;

  if (hasOperationalZoneGeometry(primaryZone) && primaryZone.status !== 'inactive') {
    hasEvaluatableBoundary = true;
    if (isPointInZone([lat, lng], primaryZone) === true) {
      return true;
    }
  }

  if (
    hubCircle &&
    Number.isFinite(hubCircle.latitude) &&
    Number.isFinite(hubCircle.longitude) &&
    Number.isFinite(hubCircle.attendance_radius_m) &&
    Number(hubCircle.attendance_radius_m) > 0
  ) {
    hasEvaluatableBoundary = true;
    const dist = haversine(
      Number(hubCircle.latitude),
      Number(hubCircle.longitude),
      lat,
      lng,
    );
    if (dist <= Number(hubCircle.attendance_radius_m)) {
      return true;
    }
  }

  for (const siblingZone of hubZones) {
    if (!hasOperationalZoneGeometry(siblingZone) || siblingZone.status === 'inactive') continue;
    hasEvaluatableBoundary = true;
    if (isPointInZone([lat, lng], siblingZone) === true) {
      return true;
    }
  }

  if (!hasEvaluatableBoundary) {
    return isPointInZone(point, primaryZone);
  }

  return false;
}

/**
 * Format a meter value for compact display.
 * < 1000 → "850 m"; >= 1000 → "1.2 km"
 */
export function metersToReadable(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1).replace(/\.0$/, '')} km`;
}

/**
 * Format a [lat, lng] pair as a fixed-precision comma-separated string.
 */
export function formatLatLng(coords: [number, number], precision = 4): string {
  const [lat, lng] = coords;
  return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
}

// Orange-leaning brand palette used for new zones
const ZONE_PALETTE = [
'#db6c00',
'#f59e0b',
'#b85a00',
'#d97706',
'#ea580c',
'#c2410c',
'#fb923c'];

let colorCursor = 0;
export function randomZoneColor(): string {
  const c = ZONE_PALETTE[colorCursor % ZONE_PALETTE.length];
  colorCursor += 1;
  return c;
}

/**
 * Clamp a number into [min, max]
 */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Ray-casting algorithm to determine if a [lat, lng] point is inside a polygon.
 */
export function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1];
    const xj = vs[j][0], yj = vs[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Perpendicular distance from a point to a line segment in [lat, lng] space.
 */
function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }

  const t = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

/**
 * Ramer-Douglas-Peucker simplification for freehand [lat, lng][] strokes.
 * Default tolerance ~0.00018 degrees (~20 meters) keeps organic shapes smooth
 * without storing hundreds of jittery mouse/touch points.
 */
export function simplifyPolygonPath(
  points: [number, number][],
  toleranceDeg = 0.00018
): [number, number][] {
  if (points.length <= 3) return points;

  // Deduplicate consecutive identical or sub-meter points first
  const deduped: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = points[i];
    if (Math.hypot(curr[0] - prev[0], curr[1] - prev[1]) >= 0.00003) {
      deduped.push(curr);
    }
  }

  // Strip trailing point if it duplicates the start point
  if (
    deduped.length > 3 &&
    Math.hypot(
      deduped[deduped.length - 1][0] - deduped[0][0],
      deduped[deduped.length - 1][1] - deduped[0][1]
    ) < toleranceDeg * 1.5
  ) {
    deduped.pop();
  }

  if (deduped.length <= 4) return deduped;

  function rdp(pts: [number, number][]): [number, number][] {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let index = 0;
    const end = pts.length - 1;

    for (let i = 1; i < end; i++) {
      const dist = perpendicularDistance(pts[i], pts[0], pts[end]);
      if (dist > maxDist) {
        index = i;
        maxDist = dist;
      }
    }

    if (maxDist > toleranceDeg) {
      const left = rdp(pts.slice(0, index + 1));
      const right = rdp(pts.slice(index));
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[end]];
  }

  const simplified = rdp(deduped);

  // Strip trailing point if it is collinear with simplified[last-1] -> simplified[0] or duplicates simplified[0]
  if (
    simplified.length > 3 &&
    perpendicularDistance(
      simplified[simplified.length - 1],
      simplified[simplified.length - 2],
      simplified[0]
    ) <= toleranceDeg
  ) {
    simplified.pop();
  }

  // Ensure at least 3 vertices survive if the input had >= 3 distinct points
  if (simplified.length < 3 && deduped.length >= 3) {
    const midIdx = Math.floor(deduped.length / 2);
    return [deduped[0], deduped[midIdx], deduped[deduped.length - 1]];
  }
  return simplified;
}

/**
 * Checks whether a candidate coordinate is within `snapRadiusMeters` of the first vertex
 * of an open polygon path (requiring at least 3 existing vertices to close a loop).
 */
export function isClosingPolygonLoop(
  points: [number, number][],
  candidate: [number, number],
  snapRadiusMeters = 85
): boolean {
  if (points.length < 3) return false;
  const [startLat, startLng] = points[0];
  return haversine(startLat, startLng, candidate[0], candidate[1]) <= snapRadiusMeters;
}

/**
 * Clips and snaps a polygon against existing zones so neighboring zones share
 * an exact flush border with zero overlap.
 */
export function snapPolygonToNeighborZones(
  newCoords: [number, number][],
  existingZones: Zone[],
  currentEditingId: string | null = null
): [number, number][] {
  if (newCoords.length < 3) return newCoords;

  const formattedNew = [...newCoords];
  if (
    formattedNew[0][0] !== formattedNew[formattedNew.length - 1][0] ||
    formattedNew[0][1] !== formattedNew[formattedNew.length - 1][1]
  ) {
    formattedNew.push(formattedNew[0]);
  }
  const newLngLat = formattedNew.map(([lat, lng]) => [lng, lat]);

  let currentTurfPoly: Feature<Polygon>;
  try {
    currentTurfPoly = turf.polygon([newLngLat]);
  } catch {
    return newCoords;
  }

  for (const zone of existingZones) {
    if (zone.id === currentEditingId) continue;

    let obstaclePoly: Feature<Polygon> | null = null;

    if (zone.zone_type === 'polygon' && zone.polygon_coordinates && zone.polygon_coordinates.length >= 3) {
      const obstacleCoords = [...zone.polygon_coordinates];
      if (
        obstacleCoords[0][0] !== obstacleCoords[obstacleCoords.length - 1][0] ||
        obstacleCoords[0][1] !== obstacleCoords[obstacleCoords.length - 1][1]
      ) {
        obstacleCoords.push(obstacleCoords[0]);
      }
      const obstacleLngLat = obstacleCoords.map(([lat, lng]) => [lng, lat]);
      try {
        obstaclePoly = turf.polygon([obstacleLngLat]);
      } catch {
        continue;
      }
    } else if (zone.zone_type === 'circle' && zone.center && zone.radius > 0) {
      try {
        obstaclePoly = turf.circle(
          [zone.center[1], zone.center[0]],
          zone.radius / 1000,
          { steps: 64, units: 'kilometers' }
        );
      } catch {
        continue;
      }
    }

    if (!obstaclePoly) continue;

    try {
      const diff: Feature<Polygon | MultiPolygon> | null = turf.difference(
        turf.featureCollection([currentTurfPoly, obstaclePoly])
      );
      if (!diff) continue;

      if (diff.geometry.type === 'MultiPolygon') {
        const multiCoords = diff.geometry.coordinates as number[][][][];
        let maxArea = 0;
        let bestPoly: Feature<Polygon> | null = null;
        for (const polyCoords of multiCoords) {
          const p = turf.polygon(polyCoords);
          const a = turf.area(p);
          if (a > maxArea) {
            maxArea = a;
            bestPoly = p;
          }
        }
        if (bestPoly) {
          currentTurfPoly = bestPoly;
        }
      } else if (diff.geometry.type === 'Polygon') {
        currentTurfPoly = diff as Feature<Polygon>;
      }
    } catch {
      continue;
    }
  }

  try {
    const finalCoords = currentTurfPoly.geometry.coordinates[0];
    const leafletCoords = finalCoords.map(([lng, lat]) => [
      Number(lat.toFixed(6)),
      Number(lng.toFixed(6)),
    ]) as [number, number][];
    if (leafletCoords.length > 3) {
      leafletCoords.pop();
    }
    return leafletCoords.length >= 3 ? leafletCoords : newCoords;
  } catch {
    return newCoords;
  }
}


