// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rider, RiderStatus, Zone } from '../../services/types';
import { OnlineRiders } from './OnlineRiders';

const zones = [{ id: 'z-a', name: 'Alpha' }] as Zone[];

function rider(id: number, status: RiderStatus): Rider {
  return {
    id: `r-${id}`,
    name: `Rider ${String(id).padStart(3, '0')}`,
    riderCode: `MKB-${id}`,
    avatar: '',
    zoneId: 'z-a',
    status,
    lastPing: Date.now(),
  } as Rider;
}

// 160 riders: 150 active, 2 in violation, 8 offline (so 152 are online).
const riders = [
  ...Array.from({ length: 150 }, (_, i) => rider(i, 'active')),
  rider(900, 'violation'),
  rider(901, 'violation'),
  ...Array.from({ length: 8 }, (_, i) => rider(950 + i, 'offline')),
];

describe('OnlineRiders at 160 riders', () => {
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

  it('shows six riders per page with violations ranked first', () => {
    act(() => {
      root.render(<OnlineRiders riders={riders} zones={zones} />);
    });

    expect(container.querySelectorAll('img')).toHaveLength(6);
    expect(container.textContent).toContain('1–6 of 152 riders');
    const firstTwo = Array.from(container.querySelectorAll('button')).slice(0, 2);
    expect(firstTwo.every((row) => row.textContent?.includes('Out of bounds'))).toBe(true);
  });

  it('lists offline riders only when the fleet overview selects them', () => {
    act(() => {
      root.render(<OnlineRiders riders={riders} zones={zones} status="offline" onClearStatus={vi.fn()} />);
    });

    expect(container.textContent).toContain('Offline Riders');
    expect(container.textContent).toContain('1–6 of 8 riders');
  });
});
