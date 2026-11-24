// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPayrollWeek } from '../lib/payroll/payrollCalendar';
import { buildRiderParcelPeriodView } from '../lib/parcels/riderParcelsModel';

const mocks = vi.hoisted(() => ({
  loadRiderParcelPeriod: vi.fn(),
  useParcelLogsRealtimeVersion: vi.fn(),
}));

vi.mock('../services/parcels/riderParcelService', () => ({
  loadRiderParcelPeriod: mocks.loadRiderParcelPeriod,
}));

vi.mock('../hooks/useParcelLogsRealtimeVersion', () => ({
  useParcelLogsRealtimeVersion: mocks.useParcelLogsRealtimeVersion,
}));

import { RiderParcels } from './RiderParcels';

describe('RiderParcels', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.useParcelLogsRealtimeVersion.mockReturnValue(0);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders KPI summary, daily parcel rows, applied rates, source badge, and Time-In context', async () => {
    const period = getPayrollWeek('2026-10-27');
    mocks.loadRiderParcelPeriod.mockResolvedValue(
      buildRiderParcelPeriodView({
        period,
        logs: [
          {
            id: 'log-1',
            rider_id: 'rider-1',
            date: '2026-10-27',
            parcels: 80,
            heavy_parcels: 6,
            assigned_parcels: 100,
            failed_parcels: 4,
            returned_parcels: 0,
            rate: 12,
            heavy_rate: 25,
            standard_earnings: 960,
            heavy_earnings: 150,
            daily_gross: 1110,
            notes: 'FMS Confirmed: 999001',
            updated_at: '2026-10-27T09:00:00Z',
          },
        ],
        attendanceLogs: [
          { date: '2026-10-27', time_in: '2026-10-27T00:15:00Z', status: 'present' },
        ],
        payrollStatus: 'draft',
      }),
    );

    await act(async () => {
      root.render(<RiderParcels userId="user-1" riderId="rider-1" />);
    });

    expect(container.textContent).toContain('My Parcels');
    expect(container.textContent).toContain('Pre-Payroll (Live)');
    expect(container.textContent).toContain('86');
    expect(container.textContent).toContain('₱1,110');
    expect(container.textContent).toContain('FMS Import');
    expect(container.textContent).toContain('8:15');
    expect(container.textContent).toContain('₱12/std');
  });

  it('renders empty state and offline snapshot banner when viewing cached empty period', async () => {
    const period = getPayrollWeek('2026-10-27');
    mocks.loadRiderParcelPeriod.mockResolvedValue(
      buildRiderParcelPeriodView({
        period,
        logs: [],
        payrollStatus: null,
        isOfflineSnapshot: true,
        cachedAt: 1730000000000,
      }),
    );

    await act(async () => {
      root.render(<RiderParcels userId="user-1" riderId="rider-1" />);
    });

    expect(container.textContent).toContain('Offline snapshot shown.');
    expect(container.textContent).toContain('No delivered parcels recorded for this cutoff');
  });

  it('steps to previous cutoff week and reloads through riderParcelService', async () => {
    const period = getPayrollWeek();
    mocks.loadRiderParcelPeriod.mockResolvedValue(
      buildRiderParcelPeriodView({
        period,
        logs: [],
        payrollStatus: null,
      }),
    );

    await act(async () => {
      root.render(<RiderParcels userId="user-1" riderId="rider-1" />);
    });

    expect(mocks.loadRiderParcelPeriod).toHaveBeenCalledTimes(1);

    const prevButton = container.querySelector('button[aria-label="Previous cutoff week"]') as HTMLButtonElement;
    expect(prevButton).not.toBeNull();

    await act(async () => {
      prevButton.click();
    });

    expect(mocks.loadRiderParcelPeriod).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('This Week');
  });
});
