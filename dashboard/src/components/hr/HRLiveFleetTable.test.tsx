// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rider, RiderStatus, Zone } from '../../services/types';
import { HRLiveFleetTable } from './HRLiveFleetTable';

const zones = [{ id: 'z-a', name: 'Alpha' }] as Zone[];

function rider(id: number, status: RiderStatus): Rider {
  return {
    id: `r-${id}`,
    name: `Rider ${String(id).padStart(3, '0')}`,
    riderCode: `MKB-${id}`,
    avatar: '',
    zoneId: 'z-a',
    status,
    speed: 0,
    lastPing: Date.now(),
  } as Rider;
}

// 160 riders: 120 active, 10 idle, 3 violation, 27 offline.
const riders = [
  ...Array.from({ length: 120 }, (_, i) => rider(i, 'active')),
  ...Array.from({ length: 10 }, (_, i) => rider(200 + i, 'idle')),
  ...Array.from({ length: 3 }, (_, i) => rider(300 + i, 'violation')),
  ...Array.from({ length: 27 }, (_, i) => rider(400 + i, 'offline')),
];

describe('HRLiveFleetTable at 160 riders', () => {
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

  function render(status: RiderStatus | null = null) {
    act(() => {
      root.render(
        <HRLiveFleetTable
          riders={riders}
          zones={zones}
          todayLogs={[]}
          zoneId="all"
          onZoneClear={vi.fn()}
          search=""
          onSearchChange={vi.fn()}
          status={status}
          onStatusChange={vi.fn()}
        />,
      );
    });
  }

  it('shows one page of the roster with violations first', () => {
    render();

    expect(container.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(container.textContent).toContain('1–10 of 160 riders');
    const firstRow = container.querySelector('tbody tr')!;
    expect(firstRow.textContent).toContain('Violation');
  });

  it('filters to the selected status', () => {
    render('offline');

    expect(container.textContent).toContain('1–10 of 27 riders');
  });
});
