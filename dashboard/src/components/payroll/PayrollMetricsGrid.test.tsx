// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PayrollMetricsGrid } from './PayrollMetricsGrid';

describe('PayrollMetricsGrid Component', () => {
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

  it('renders all 5 metric cards including Absent Days in the correct order (Test 1, Test 9)', () => {
    act(() => {
      root.render(
        <PayrollMetricsGrid
          presentCount={1}
          lateCount={1}
          absentCount={4}
          violationCount={0}
          avgDailyParcels={0}
        />
      );
    });

    // Check all headers
    expect(container.textContent).toContain('Present Days');
    expect(container.textContent).toContain('Late Days');
    expect(container.textContent).toContain('Absent Days');
    expect(container.textContent).toContain('Geofence Alerts');
    expect(container.textContent).toContain('Avg Daily Parcels');

    // Strictly verify label wording
    expect(container.textContent).not.toContain('Penalty Days');
    expect(container.textContent).not.toContain('Deducted Absences');
    expect(container.textContent).not.toContain('Chargeable Absences');

    // Check values and singular/plural formatting
    const cardLabels = Array.from(
      container.querySelectorAll('.text-\\[10px\\].uppercase')
    ).map((el) => el.textContent?.trim());

    expect(cardLabels).toEqual([
      'Present Days',
      'Late Days',
      'Absent Days',
      'Geofence Alerts',
      'Avg Daily Parcels',
    ]);

    // Check Absent Days card value
    const absentCard = Array.from(container.querySelectorAll('.rounded-xl')).find(
      (el) => el.textContent?.includes('Absent Days')
    );
    expect(absentCard).toBeDefined();
    expect(absentCard?.textContent).toContain('4');
    expect(absentCard?.textContent).toContain('days');
    expect(absentCard?.className).toContain('bg-rose-50/50');
    expect(absentCard?.className).toContain('border-rose-500/10');
  });

  it('formats singular unit "1 day" and "1 event" accurately', () => {
    act(() => {
      root.render(
        <PayrollMetricsGrid
          presentCount={1}
          lateCount={1}
          absentCount={1}
          violationCount={1}
          avgDailyParcels={24.5}
        />
      );
    });

    const absentCard = Array.from(container.querySelectorAll('.rounded-xl')).find(
      (el) => el.textContent?.includes('Absent Days')
    );
    expect(absentCard?.textContent).toContain('1');
    expect(absentCard?.textContent).toContain('day');
    expect(absentCard?.textContent).not.toContain('days');

    const alertCard = Array.from(container.querySelectorAll('.rounded-xl')).find(
      (el) => el.textContent?.includes('Geofence Alerts')
    );
    expect(alertCard?.textContent).toContain('1');
    expect(alertCard?.textContent).toContain('event');
    expect(alertCard?.textContent).not.toContain('events');
  });

  it('uses responsive grid layout classes supporting 5 cards across screen widths (Test 9)', () => {
    act(() => {
      root.render(
        <PayrollMetricsGrid
          presentCount={5}
          lateCount={2}
          absentCount={3}
          violationCount={1}
          avgDailyParcels={18.2}
        />
      );
    });

    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toBeDefined();
    expect(gridContainer?.className).toContain('grid-cols-2');
    expect(gridContainer?.className).toContain('sm:grid-cols-3');
    expect(gridContainer?.className).toContain('xl:grid-cols-5');
    expect(gridContainer?.className).toContain('gap-3');

    // Verify 5th card spans 2 columns on mobile
    const avgCard = Array.from(container.querySelectorAll('.rounded-xl')).find(
      (el) => el.textContent?.includes('Avg Daily Parcels')
    );
    expect(avgCard?.className).toContain('col-span-2');
    expect(avgCard?.className).toContain('sm:col-span-1');
    expect(avgCard?.className).toContain('xl:col-span-1');
  });
});
