// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SelectedDayDetails } from './SelectedDayDetails';

describe('SelectedDayDetails Component', () => {
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

  it('renders "Late" with amber styling when selectedDayAtt status is "late"', () => {
    act(() => {
      root.render(
        <SelectedDayDetails
          selectedDate="2026-08-19"
          selectedDayAtt={{
            time_in: '2026-08-19T10:31:00.000Z',
            time_out: '2026-08-19T17:34:00.000Z',
            status: 'late',
            hours: 7.05,
          }}
          selectedDayLog={{
            parcels: 25,
            heavyParcels: 4,
            failedParcels: 1,
            returnedParcels: 0,
          }}
          selectedDayViolations={[]}
        />
      );
    });

    expect(container.textContent).toContain('Attendance Status');
    expect(container.textContent).not.toContain('Late Time');
    expect(container.textContent).not.toContain('On Time');
    expect(container.textContent).toContain('Late');

    const lateSpan = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'Late'
    );
    expect(lateSpan).toBeDefined();
    expect(lateSpan?.className).toContain('text-amber-600');
  });

  it('renders "Present" with emerald styling when selectedDayAtt status is "present"', () => {
    act(() => {
      root.render(
        <SelectedDayDetails
          selectedDate="2026-08-16"
          selectedDayAtt={{
            time_in: '2026-08-16T07:55:00.000Z',
            time_out: '2026-08-16T17:00:00.000Z',
            status: 'present',
            hours: 9.08,
          }}
          selectedDayLog={{
            parcels: 26,
            heavyParcels: 2,
            failedParcels: 2,
            returnedParcels: 3,
          }}
          selectedDayViolations={[]}
        />
      );
    });

    expect(container.textContent).toContain('Attendance Status');
    expect(container.textContent).toContain('Present');

    const presentSpan = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'Present'
    );
    expect(presentSpan).toBeDefined();
    expect(presentSpan?.className).toContain('text-emerald-600');
  });

  it('renders "—" when selectedDayAtt status is null or missing', () => {
    act(() => {
      root.render(
        <SelectedDayDetails
          selectedDate="2026-08-17"
          selectedDayAtt={null}
          selectedDayLog={{
            parcels: 0,
            heavyParcels: 0,
            failedParcels: 0,
            returnedParcels: 0,
          }}
          selectedDayViolations={[]}
        />
      );
    });

    expect(container.textContent).toContain('Attendance Status');
    expect(container.textContent).toContain('—');
  });
});
