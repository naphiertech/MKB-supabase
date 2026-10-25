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
