import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatLatLng,
  haversine,
  isPointInPolygon,
  metersToReadable
} from './geofenceUtils';

describe('geofence utilities', () => {
  it('formats distances using the existing display thresholds', () => {
    expect(metersToReadable(999.6)).toBe('1000 m');
    expect(metersToReadable(1_200)).toBe('1.2 km');
    expect(metersToReadable(2_000)).toBe('2 km');
    expect(metersToReadable(-1)).toBe('—');
  });

  it('formats coordinates at the requested precision', () => {
    expect(formatLatLng([14.599512, 120.984222], 3)).toBe('14.600, 120.984');
  });

  it('clamps numbers to the supplied range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('detects whether a point is inside a polygon', () => {
    const polygon: [number, number][] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0]
    ];

    expect(isPointInPolygon([5, 5], polygon)).toBe(true);
    expect(isPointInPolygon([15, 5], polygon)).toBe(false);
  });

  it('calculates a zero distance for identical coordinates', () => {
    expect(haversine(14.5995, 120.9842, 14.5995, 120.9842)).toBe(0);
  });
});
