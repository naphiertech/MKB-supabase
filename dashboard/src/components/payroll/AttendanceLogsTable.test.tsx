// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceLogsTable } from './AttendanceLogsTable';
import { type ParcelLog } from '../../services/parcelService';

describe('AttendanceLogsTable Component', () => {
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

  const sampleDayEntries: ParcelLog[] = [
    {
      id: 'log-1',
      riderId: 'rider-1',
      date: '2026-08-01',
      parcels: 20,
      heavyParcels: 3,
      assignedParcels: 25,
      failedParcels: 1,
      returnedParcels: 1,
      rate: 12,
      heavyRate: 17,
      standardEarnings: 240,
      heavyEarnings: 51,
      dailyGross: 291,
      rateConfigurationId: 'rate-1',
      calculationVersion: 2,
      source: 'live',
    },
    {
      id: 'log-2',
      riderId: 'rider-1',
      date: '2026-08-02',
      parcels: 0,
      heavyParcels: 0,
      assignedParcels: null,
      failedParcels: 0,
      returnedParcels: 0,
      rate: 12,
      heavyRate: 17,
      standardEarnings: 0,
      heavyEarnings: 0,
      dailyGross: 0,
      rateConfigurationId: 'rate-1',
      calculationVersion: 2,
      source: 'live',
    },
    {
      id: 'log-3',
      riderId: 'rider-1',
      date: '2026-08-03',
      parcels: 0,
      heavyParcels: 0,
      assignedParcels: null,
      failedParcels: 0,
      returnedParcels: 0,
      rate: 12,
      heavyRate: 17,
      standardEarnings: 0,
      heavyEarnings: 0,
      dailyGross: 0,
      rateConfigurationId: 'rate-1',
      calculationVersion: 2,
      source: 'live',
    },
  ];

  it('renders "Absent" badge for absent attendance dates in Daily Log Breakdown', () => {
    const setSelectedDate = vi.fn();
    act(() => {
      root.render(
        <AttendanceLogsTable
          dayEntries={sampleDayEntries}
          selectedDate={null}
          setSelectedDate={setSelectedDate}
          attendanceLogs={[
            { date: '2026-08-01', time_in: '08:00', time_out: '17:00', status: 'present' },
            { date: '2026-08-02', time_in: null, time_out: null, status: 'absent' },
            { date: '2026-08-03', time_in: null, time_out: null, status: 'on_leave' },
          ]}
          violations={[]}
        />
      );
    });

    expect(container.textContent).toContain('Present');
    expect(container.textContent).toContain('Absent');
    expect(container.textContent).toContain('On Leave');

    const absentBadge = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'Absent'
    );
    expect(absentBadge).toBeDefined();
    expect(absentBadge?.className).toContain('bg-rose-50');
    expect(absentBadge?.className).toContain('text-rose-700');
  });

  it('renders "No Attendance" when no attendance log exists for that day', () => {
    const setSelectedDate = vi.fn();
    act(() => {
      root.render(
        <AttendanceLogsTable
          dayEntries={[sampleDayEntries[0]]}
          selectedDate={null}
          setSelectedDate={setSelectedDate}
          attendanceLogs={[]}
          violations={[]}
        />
      );
    });

    expect(container.textContent).toContain('No Attendance');
    const noAttBadge = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'No Attendance'
    );
    expect(noAttBadge).toBeDefined();
    expect(noAttBadge?.className).toContain('bg-gray-50');
  });
});
