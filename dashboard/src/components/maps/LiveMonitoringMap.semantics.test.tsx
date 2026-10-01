// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveMonitoringMap } from './LiveMonitoringMap';
import { buildRiderIcon } from './RiderMarker';
import type { Rider } from '../../services/types';

// Mock Leaflet and React-Leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(({ children }, ref) => (
    <div ref={ref} data-testid="map">{children}</div>
  )),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({
    flyTo: vi.fn(),
    getContainer: () => null,
    invalidateSize: vi.fn()
  })
}));

vi.mock('./GeofenceCircle', () => ({
  GeofenceCircle: () => <div data-testid="geofence-circle" />
}));

describe('LiveMonitoringMap semantics and telemetry freshness', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const now = Date.now();

  const freshRider: Rider = {
    id: 'rider-fresh',
    name: 'Fresh Rider',
    avatar: '',
    zoneId: 'zone-1',
    status: 'active',
    operationalStatus: 'active',
    lat: 6.9214,
    lng: 122.0790,
    speed: 25,
    shift: 'morning',
    lastPing: now - 30_000, // 30s ago (fresh)
    phone: '',
    riderCode: 'MKB-001'
  };

  const staleRider: Rider = {
    id: 'rider-stale',
    name: 'Stale Rider',
    avatar: '',
    zoneId: 'zone-1',
    status: 'offline',
    operationalStatus: 'active', // Geofence DB status might have been active 2 days ago
    lat: 6.9214,
    lng: 122.0790,
    speed: 0,
    shift: 'morning',
    lastPing: now - (2 * 24 * 60 * 60 * 1000), // 2 days ago
    phone: '',
    riderCode: 'MKB-002'
  };

  it('buildRiderIcon assigns class "offline" when rider is stale or offline', () => {
    const freshIcon = buildRiderIcon(freshRider, { isFresh: true });
    expect(freshIcon.options.html).toContain('ar-rider-pin active');

    const staleIcon = buildRiderIcon(staleRider, { isFresh: false });
    expect(staleIcon.options.html).toContain('ar-rider-pin offline');
  });

  it('bottom pill tracks 0 riders when only stale rider is present and separates map refreshed label', () => {
    act(() => {
      root.render(
        <LiveMonitoringMap
          riders={[staleRider]}
          zones={[]}
          onlineUserIds={[]}
        />
      );
    });

    const pill = container.querySelector('.map-tracking-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toMatch(/Tracking 0 riders · Map refreshed \ds ago/);
  });

  it('bottom pill tracks 1 rider when one fresh rider and one stale rider are present', () => {
    act(() => {
      root.render(
        <LiveMonitoringMap
          riders={[freshRider, staleRider]}
          zones={[]}
          onlineUserIds={[]}
        />
      );
    });

    const pill = container.querySelector('.map-tracking-pill');
    expect(pill?.textContent).toMatch(/Tracking 1 rider · Map refreshed \ds ago/);
  });
});
