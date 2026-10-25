// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rider, RiderStatus, Zone } from '../../services/types';
import { summarizeFleet } from '../../lib/fleetRollup';
import { FleetRollupPanel } from './FleetRollupPanel';

const zones = Array.from({ length: 8 }, (_, i) => ({ id: `z-${i}`, name: `Zone ${i}` })) as Zone[];
const riders = zones.flatMap((zone, zi) =>
  Array.from({ length: 20 }, (_, i) => ({ id: `${zone.id}-${i}`, zoneId: zone.id, status: (i === 0 && zi === 0 ? 'violation' : 'active') as RiderStatus }) as Rider),
);

describe('FleetRollupPanel', () => {
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
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  function render(onStatusSelect = vi.fn(), onZoneSelect = vi.fn()) {
    act(() => {
      root.render(
        <FleetRollupPanel
          summary={summarizeFleet(riders, zones)}
          activeStatus={null}
          onStatusSelect={onStatusSelect}
          activeZoneId={null}
          onZoneSelect={onZoneSelect}
        />,
      );
    });
  }

  const button = (text: string) =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

  it('summarises 160 riders and caps the zone list until expanded', () => {
    render();

    expect(container.textContent).toContain('160 riders · 8 zones');
    expect(container.querySelectorAll('ul li')).toHaveLength(5);

    act(() => button('Show 3 more zones').click());
    expect(container.querySelectorAll('ul li')).toHaveLength(8);
  });

  it('reports the clicked status and zone so the roster can filter', () => {
    const onStatusSelect = vi.fn();
    const onZoneSelect = vi.fn();
    render(onStatusSelect, onZoneSelect);

    act(() => button('Violation').click());
    expect(onStatusSelect).toHaveBeenCalledWith('violation');

    act(() => button('Zone 0').click());
    expect(onZoneSelect).toHaveBeenCalledWith('z-0');
  });
});
