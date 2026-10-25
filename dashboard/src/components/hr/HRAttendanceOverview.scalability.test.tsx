// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttendanceLog, Zone } from '../../services/types';
import { getLocalDateString } from '../../services/attendance/attendanceService';
import { HRAttendanceOverview } from './HRAttendanceOverview';

const today = getLocalDateString();
const zones = [{ id: 'z-a', name: 'Alpha' }] as Zone[];

function log(id: number, overrides: Partial<AttendanceLog> = {}): AttendanceLog {
  return {
    id: `a-${id}`,
    riderId: `r-${id}`,
    riderName: `Rider ${String(id).padStart(3, '0')}`,
    riderAvatar: '',
    date: today,
    timeIn: '08:00',
    timeOut: '17:00',
    rawTimeIn: `${today}T08:00:00+08:00`,
    rawTimeOut: `${today}T17:00:00+08:00`,
    hours: 9,
    zoneId: 'z-a',
    zoneName: 'Alpha',
    status: 'present',
    presence: 'present',
    punctuality: 'on_time',
    completionStatus: 'complete',
    source: 'face-scan',
    events: [],
    ...overrides,
  } as AttendanceLog;
}

// 160 riders: 155 normal, 2 late, 1 missing time out, 1 manual, 1 absent.
const logs = [
  ...Array.from({ length: 155 }, (_, i) => log(i)),
  log(200, { status: 'late', punctuality: 'late' }),
  log(201, { status: 'late', punctuality: 'late' }),
  log(202, { timeOut: null, rawTimeOut: null, completionStatus: 'missing_time_out' }),
  log(203, { source: 'manual' }),
  log(204, { status: 'absent', presence: 'absent', timeIn: null, timeOut: null, completionStatus: 'absent' }),
];

describe('HRAttendanceOverview at 160 riders', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <HRAttendanceOverview
          logs={logs}
          zones={zones}
          zoneId="all"
          onZoneIdChange={() => undefined}
          search=""
          onSearchChange={() => undefined}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  const rows = () => container.querySelectorAll('tbody tr').length;
  const button = (label: string) =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label);

  it('renders one bounded page instead of all 160 rows', () => {
    expect(rows()).toBe(10);
    expect(container.textContent).toContain('1–10 of 160 entries');
  });

  it('moves between pages and grows the page with the row selector', () => {
    act(() => button('Next page')!.click());
    expect(container.textContent).toContain('11–20 of 160 entries');

    const select = container.querySelector('select[aria-label="Rows per page"]') as HTMLSelectElement;
    act(() => {
      select.value = '50';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rows()).toBe(50);
    expect(container.textContent).toContain('1–50 of 160 entries');
  });

  it('narrows 160 riders to the 5 exceptions with one click', () => {
    expect(container.textContent).toMatch(/Exceptions\s*5/);

    act(() => button('Exceptions')!.click());

    expect(rows()).toBe(5);
    expect(container.textContent).toContain('1–5 of 5 entries');
  });
});
