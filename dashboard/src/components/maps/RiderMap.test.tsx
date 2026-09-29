// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiderMap } from './RiderMap';
import type { Zone } from '../../services/types';

const zone: Zone = {
  id: 'zone-1',
  name: 'Downtown Zone',
  center: [6.9214, 122.079],
  radius: 500,
  color: '#db6c00',
  zone_type: 'circle',
};

const riderPosition = { lat: 6.9214, lng: 122.079 };

describe('RiderMap Hub and Attendance UX', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      observe() { return undefined; }
      disconnect() { return undefined; }
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    Object.defineProperty(L.Browser, 'svg', { configurable: true, value: true });

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders assigned Hub marker, attendance radius circle, and legend when Hub is configured', async () => {
    await act(async () => {
      root.render(
        <RiderMap
          position={riderPosition}
          zone={zone}
          inZone={true}
          hub={{
            hub_id: 'hub-1',
            hub_name: 'Talon-Talon Hub',
            latitude: 6.922,
            longitude: 122.08,
            attendance_radius_m: 35,
            distance: 95,
            is_configured: true,
          }}
          height="320px"
        />,
      );
    });

    // Rider marker is present
    const riderPin = container.querySelector('.rider-self-pin');
    expect(riderPin).not.toBeNull();

    // Hub marker is present with custom icon class
    const hubPin = container.querySelector('.rider-hub-pin');
    expect(hubPin).not.toBeNull();

    // Legend contains My Location, Hub, Attendance Area, and Delivery Zone
    const legend = container.querySelector('[aria-label="Map Legend"]');
    expect(legend).not.toBeNull();
    expect(legend?.textContent).toContain('My Location');
    expect(legend?.textContent).toContain('Hub');
    expect(legend?.textContent).toContain('Attendance Area');
    expect(legend?.textContent).toContain('Delivery Zone');

    // Delivery zone tag is visible
    expect(container.textContent).toContain('Downtown Zone');
  });

  it('does NOT render Hub marker or attendance area when Rider has no assigned Hub', async () => {
    await act(async () => {
      root.render(
        <RiderMap
          position={riderPosition}
          zone={zone}
          inZone={true}
          hub={null}
          height="320px"
        />,
      );
    });

    // Rider marker is present
    expect(container.querySelector('.rider-self-pin')).not.toBeNull();

    // No Hub marker rendered
    expect(container.querySelector('.rider-hub-pin')).toBeNull();

    // Legend does not include Hub or Attendance Area
    const legend = container.querySelector('[aria-label="Map Legend"]');
    expect(legend?.textContent).toContain('My Location');
    expect(legend?.textContent).toContain('Delivery Zone');
    expect(legend?.textContent).not.toContain('Attendance Area');

    // Delivery Zone remains visible
    expect(container.textContent).toContain('Downtown Zone');
  });

  it('does NOT render fake coordinates or Hub marker when Hub geofence is unconfigured', async () => {
    await act(async () => {
      root.render(
        <RiderMap
          position={riderPosition}
          zone={zone}
          inZone={true}
          hub={{
            hub_id: 'hub-unconfigured',
            hub_name: 'Pending Hub',
            latitude: null,
            longitude: null,
            attendance_radius_m: null,
            is_configured: false,
          }}
          height="320px"
        />,
      );
    });

    // Rider marker is present
    expect(container.querySelector('.rider-self-pin')).not.toBeNull();

    // No Hub marker rendered
    expect(container.querySelector('.rider-hub-pin')).toBeNull();

    // Legend does not include Hub or Attendance Area
    const legend = container.querySelector('[aria-label="Map Legend"]');
    expect(legend?.textContent).not.toContain('Attendance Area');

    // Delivery Zone remains visible
    expect(container.textContent).toContain('Downtown Zone');
  });

  it('preserves Delivery Zone and renders coordinates pill', async () => {
    await act(async () => {
      root.render(
        <RiderMap
          position={riderPosition}
          zone={zone}
          inZone={false}
          height="320px"
        />,
      );
    });

    // Delivery zone name and radius
    expect(container.textContent).toContain('Downtown Zone');
    expect(container.textContent).toContain('500m');

    // Coordinates pill displays rounded coords
    expect(container.textContent).toContain('6.92140, 122.07900');
  });
});
