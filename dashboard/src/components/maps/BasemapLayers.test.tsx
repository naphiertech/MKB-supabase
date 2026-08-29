// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveMonitoringMap } from './LiveMonitoringMap';
import { RiderMap } from './RiderMap';
import { RouteTrailMap } from './RouteTrailMap';
import { ZoneMapPreview } from '../geofence/ZoneMapPreview';
import { RiderProfile } from '../../pages/RiderProfile';
import type { CachedProfilePayload } from '../../services/riders/riderCacheService';
import type { Rider, Zone } from '../../services/types';

// Only network data is mocked; Leaflet, the page, and all layers are real.
vi.mock('../../lib/apiService', () => ({ reverseGeocode: async () => 'Test address' }));
vi.mock('../../services/riders/riderCacheService', () => ({
  fetchRiderProfileWithSWR: async (
    _userId: string,
    _riderId: string,
    callbacks: { onFreshDataLoaded?: (payload: CachedProfilePayload) => void },
  ) => callbacks.onFreshDataLoaded?.(profilePayload),
}));

const zone: Zone = {
  id: 'zone-1', name: 'Test zone', center: [6.925, 122.078], radius: 0,
  color: '#db6c00', zone_type: 'polygon',
  polygon_coordinates: [[6.92, 122.07], [6.93, 122.07], [6.93, 122.09]],
};
const rider: Rider = {
  id: 'rider-1', name: 'Test Rider', avatar: '', zoneId: zone.id, status: 'active',
  lat: 6.925, lng: 122.078, speed: 0, shift: 'morning', lastPing: 0, phone: '', riderCode: 'TEST-1',
};
const profilePayload: CachedProfilePayload = {
  resolvedRiderId: rider.id,
  dbUser: { id: 'user-1', full_name: rider.name, email: 'rider@example.test', role: 'rider', status: 'active' },
  dbRider: {
    id: rider.id, name: rider.name, mkb_id: rider.riderCode, zone_id: zone.id,
    status: rider.status, lat: rider.lat, lng: rider.lng,
    zones: {
      id: zone.id, name: zone.name, lat: zone.center[0], lng: zone.center[1],
      radius: zone.radius, color: zone.color, status: 'active',
      zone_type: zone.zone_type, polygon_coordinates: zone.polygon_coordinates,
    },
  },
  timestamp: 0,
};
const cases = [
  { name: 'Live Rider Map', render: () => <LiveMonitoringMap riders={[rider]} zones={[zone]} height="400px" /> },
  { name: 'Rider My Location', render: () => <RiderMap position={rider} zone={zone} inZone height="400px" /> },
  { name: 'My Location route trail', render: () => <RouteTrailMap points={[
    { lat: 6.924, lng: 122.077, speed: 0, timestamp: '2026-08-27T00:00:00Z' },
    { lat: 6.925, lng: 122.078, speed: 0, timestamp: '2026-08-27T00:01:00Z' },
  ]} stats={null} riderName={rider.name} zoneName={zone.name} /> },
];
const streetCases = [
  ...cases.map(testCase => ({ ...testCase, hasMarker: true })),
  { name: 'Geofence Zones', hasMarker: false, render: () => <ZoneMapPreview zones={[zone]} activeZoneId={null} onSelectZone={() => undefined} /> },
  { name: 'Rider profile map', hasMarker: false, render: () => <RiderProfile userId="user-1" riderId={rider.id} restricted={false} onBack={() => undefined} /> },
];

describe('keyless default basemaps', () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalSvg = L.Browser.svg;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      observe() { return undefined; }
      disconnect() { return undefined; }
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    Object.defineProperty(L.Browser, 'svg', { configurable: true, value: true }); // jsdom supports SVG DOM, not feature detection.
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.classList.remove('dark');
    Object.defineProperty(L.Browser, 'svg', { configurable: true, value: originalSvg });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const tileUrls = () => Array.from(container.querySelectorAll<HTMLImageElement>('img.leaflet-tile')).map(tile => tile.src);

  describe.each(['light', 'dark'])('%s application theme', (theme) => {
  it.each(streetCases)('$name requests OSM tiles with proper attribution while retaining overlays', async ({ render, hasMarker }) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    await act(async () => { root.render(render()); });
    const urls = tileUrls();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every(url => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url))).toBe(true);
    expect(container.querySelector('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]')).not.toBeNull();
    expect(container.querySelector('.leaflet-control-attribution')?.textContent).toContain('contributors');
    if (hasMarker) expect(container.querySelector('.leaflet-marker-icon')).not.toBeNull();
    expect(container.querySelector('.leaflet-overlay-pane path')).not.toBeNull();
  });
  });

  it.each(cases)('$name preserves the Satellite toggle and returns to keyless default tiles', async ({ render }) => {
    await act(async () => { root.render(render()); });
    const toggle = Array.from(container.querySelectorAll('button')).find(button =>
      button.getAttribute('aria-label') === 'Switch to satellite map' || button.textContent?.includes('Satellite'))!;
    expect(toggle).toBeDefined();
    await act(async () => { toggle.click(); });
    expect(tileUrls().some(url => url.startsWith('https://mt1.google.com/vt/'))).toBe(true);
    expect(container.querySelector('.leaflet-marker-icon')).not.toBeNull();
    await act(async () => { toggle.click(); });
    expect(tileUrls().length).toBeGreaterThan(0);
    expect(tileUrls().every(url => url.startsWith('https://tile.openstreetmap.org/'))).toBe(true);
  });
});
