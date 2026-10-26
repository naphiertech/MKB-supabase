import { describe, expect, it } from 'vitest';
import {
  clamp,
  formatLatLng,
  hasOperationalZoneGeometry,
  haversine,
  isClosingPolygonLoop,
  isPointInPolygon,
  isPointInZone,
  metersToReadable,
  simplifyPolygonPath
} from './geofenceUtils';
import type { Zone } from '../services/types';

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

  describe('isPointInZone and hasOperationalZoneGeometry', () => {
    const circleZone: Zone = {
      id: 'z-circle',
      name: 'Circle Zone',
      center: [14.5, 121.0],
      radius: 500,
      color: '#ff0000',
    };

    const polygonZone: Zone = {
      id: 'z-polygon',
      name: 'Polygon Zone',
      center: [14.5, 121.0],
      radius: 0,
      color: '#00ff00',
      zone_type: 'polygon',
      polygon_coordinates: [
        [14.0, 120.0],
        [15.0, 120.0],
        [15.0, 122.0],
        [14.0, 122.0],
      ],
    };

    it('validates operational geometry correctly', () => {
      expect(hasOperationalZoneGeometry(circleZone)).toBe(true);
      expect(hasOperationalZoneGeometry(polygonZone)).toBe(true);
      expect(hasOperationalZoneGeometry(null)).toBe(false);
      expect(hasOperationalZoneGeometry({ ...circleZone, radius: 0 })).toBe(false);
      expect(hasOperationalZoneGeometry({ ...polygonZone, polygon_coordinates: [] })).toBe(false);
    });

    it('evaluates containment for circle zones', () => {
      expect(isPointInZone([14.5, 121.0], circleZone)).toBe(true);
      expect(isPointInZone([15.5, 122.0], circleZone)).toBe(false);
    });

    it('evaluates containment for polygon zones', () => {
      expect(isPointInZone({ lat: 14.5, lng: 121.0 }, polygonZone)).toBe(true);
      expect(isPointInZone({ lat: 16.0, lng: 121.0 }, polygonZone)).toBe(false);
    });

    it('returns null when zone geometry is invalid or missing', () => {
      expect(isPointInZone([14.5, 121.0], null)).toBeNull();
    });
  });

  describe('simplifyPolygonPath and isClosingPolygonLoop', () => {
    it('simplifies dense freehand stroke points while preserving shape corners', () => {
      const denseLoop: [number, number][] = [
        [6.9200, 122.0700],
        [6.9225, 122.0700],
        [6.9250, 122.0700],
        [6.9275, 122.0700],
        [6.9300, 122.0700],
        [6.9300, 122.0750],
        [6.9300, 122.0800],
        [6.9250, 122.0800],
        [6.9200, 122.0800],
        [6.9200, 122.0750],
        [6.92005, 122.07005],
      ];

      const simplified = simplifyPolygonPath(denseLoop);
      expect(simplified.length).toBe(4);
      expect(simplified[0]).toEqual([6.9200, 122.0700]);
      expect(simplified).toContainEqual([6.9300, 122.0700]);
      expect(simplified).toContainEqual([6.9300, 122.0800]);
      expect(simplified).toContainEqual([6.9200, 122.0800]);
    });

    it('detects when a new point snaps to the start vertex to close a polygon loop', () => {
      const openPath: [number, number][] = [
        [6.9250, 122.0780],
        [6.9300, 122.0820],
        [6.9220, 122.0840],
      ];

      expect(isClosingPolygonLoop(openPath, [6.9251, 122.0781], 85)).toBe(true);
      expect(isClosingPolygonLoop(openPath, [6.9350, 122.0900], 85)).toBe(false);
      expect(isClosingPolygonLoop(openPath.slice(0, 2), [6.9250, 122.0780], 85)).toBe(false);
    });
  });
});
