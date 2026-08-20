// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RiderDashboard } from './RiderDashboard';

const mocks = vi.hoisted(() => ({
  dashboardData: null as unknown as ReturnTypeData,
  getRiderPayrollHistory: vi.fn(),
  getRiderViolationsForMonth: vi.fn(),
}));

interface ReturnTypeData {
  actualRiderId: string;
  rider: {
    id: string; name: string; avatar: string; zoneId: string | null;
    status: 'active' | 'idle' | 'violation' | 'offline'; lat: number; lng: number; speed: number;
    shift: 'morning' | 'afternoon' | 'evening'; lastPing: number; phone: string; riderCode: string;
    faceDescriptor?: number[] | null;
  };
  zone: {
    id: string; name: string; center: [number, number]; radius: number; color: string;
    zone_type?: 'circle' | 'polygon'; polygon_coordinates?: [number, number][];
  };
  loading: boolean;
  attendance: { id: string | null; timeIn: string | null; timeOut: string | null };
  activeViolation: null;
  stats: { daysPresent: number; hoursThisWeek: number; violationsThisMonth: number };
  monthAttendanceLogs: unknown[];
  reload: () => Promise<void>;
  updateRiderFaceDescriptor: (descriptor: number[]) => void;
}

vi.mock('./rider-dashboard/useRiderDashboardData', () => ({
  useRiderDashboardData: () => mocks.dashboardData,
}));
vi.mock('./rider-dashboard/useRiderShiftController', () => ({
  useRiderShiftController: () => ({
    action: 'time-in', canTimeIn: true, onlineStatus: 'offline', duration: null,
    location: {
      position: { lat: 6.9214, lng: 122.079, accuracy: 8, ts: Date.now() },
      positionToUse: { lat: 6.9214, lng: 122.079, accuracy: 8, ts: Date.now() },
      distance: 0, inZone: true, error: null, isLoading: false, hasVerifiedPosition: true,
      retry: vi.fn(), zoneName: 'North Hub', zoneRadius: 1000,
    },
    scanner: {
      open: false, setOpen: vi.fn(), pendingAction: 'time-in', openScan: vi.fn(),
      phase: 'idle', progress: 0, result: null, start: vi.fn(), reset: vi.fn(),
      videoRef: { current: null }, canvasRef: { current: null },
      livenessPrompt: '', debugInfo: {},
    },
  }),
}));
vi.mock('../services/riderService', () => ({
  getRiderPayrollHistory: mocks.getRiderPayrollHistory,
  getRiderViolationsForMonth: mocks.getRiderViolationsForMonth,
  cacheRiderFaceDescriptor: vi.fn(),
}));
vi.mock('../components/maps/RiderMap', () => ({ RiderMap: () => <div /> }));
vi.mock('../lib/faceAi', () => ({ preloadBiometrics: vi.fn(), releaseBiometrics: vi.fn() }));
vi.mock('../lib/biometricPreloadScheduler', () => ({
  biometricPreloadPriority: { canContinueBackground: () => false },
  scheduleBiometricPreload: () => () => undefined,
  waitForBrowserIdle: vi.fn(),
}));
vi.mock('../lib/biometricTelemetry', () => ({
  BIOMETRIC_TIMING_NAMES: {
    dashboardInteractive: 'dashboard-interactive', preloadScheduled: 'preload-scheduled',
    preloadStarted: 'preload-started', preloadComplete: 'preload-complete',
  },
  biometricTelemetry: { record: vi.fn() },
  observeBiometricPreloadLongTasks: () => () => undefined,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

function payrollRecord(id: string, riderId: string, totalParcels: number) {
  return {
    id, rider_id: riderId, cutoff_start: '2026-08-01', cutoff_end: '2026-08-15',
    total_parcels: totalParcels, rate_per_parcel: 8, gross_pay: totalParcels * 8,
    status: 'draft', riders: null,
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('RiderDashboard async request ownership', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.dashboardData = {
      actualRiderId: 'rider-1',
      rider: {
        id: 'rider-1', name: 'Rider One', avatar: '', zoneId: 'zone-1', status: 'active',
        lat: 6.9214, lng: 122.079, speed: 0, shift: 'morning', lastPing: 0,
        phone: '', riderCode: 'MKB-001', faceDescriptor: null,
      },
      zone: { id: 'zone-1', name: 'North Hub', center: [6.9214, 122.079], radius: 1000, color: '#f00' },
      loading: false,
      attendance: { id: null, timeIn: null, timeOut: null },
      activeViolation: null,
      stats: { daysPresent: 1, hoursThisWeek: 8, violationsThisMonth: 1 },
      monthAttendanceLogs: [],
      reload: vi.fn().mockResolvedValue(undefined),
      updateRiderFaceDescriptor: vi.fn(),
    };
    mocks.getRiderViolationsForMonth.mockResolvedValue([]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function renderPage() {
    await act(async () => {
      root.render(<RiderDashboard userId="user-1" riderId="rider-1" restricted={false} />);
      await flushAsyncWork();
    });
  }

  it('does not let an older Rider payroll response replace the current Rider payroll', async () => {
    const riderOne = deferred<ReturnType<typeof payrollRecord>[]>();
    const riderTwo = deferred<ReturnType<typeof payrollRecord>[]>();
    mocks.getRiderPayrollHistory.mockImplementation((riderId: string) => (
      riderId === 'rider-1' ? riderOne.promise : riderTwo.promise
    ));
    await renderPage();

    mocks.dashboardData = {
      ...mocks.dashboardData,
      actualRiderId: 'rider-2',
      rider: { ...mocks.dashboardData.rider, id: 'rider-2', name: 'Rider Two', riderCode: 'MKB-002' },
    };
    await renderPage();
    await act(async () => { riderTwo.resolve([payrollRecord('payroll-2', 'rider-2', 22)]); await flushAsyncWork(); });
    expect(document.body.textContent).toContain('22 pcs');

    await act(async () => { riderOne.resolve([payrollRecord('payroll-1', 'rider-1', 11)]); await flushAsyncWork(); });
    expect(document.body.textContent).toContain('22 pcs');
    expect(document.body.textContent).not.toContain('11 pcs');
  });

  it('does not let an older violation response replace a newer response', async () => {
    mocks.getRiderPayrollHistory.mockResolvedValue([]);
    const older = deferred<Array<Record<string, unknown>>>();
    const newer = deferred<Array<Record<string, unknown>>>();
    mocks.getRiderViolationsForMonth
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    await renderPage();

    const violationButton = Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Violations · This Month'));
    expect(violationButton).toBeTruthy();
    act(() => violationButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => violationButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    await act(async () => {
      newer.resolve([{
        id: 'new', type: 'boundary_exit', zone_name: 'New Zone', resolved: false,
        lat: 6.9, lng: 122.08, created_at: '2026-08-20T08:00:00.000Z',
      }]);
      await flushAsyncWork();
    });
    expect(document.body.textContent).toContain('New Zone');

    await act(async () => {
      older.resolve([{
        id: 'old', type: 'boundary_exit', zone_name: 'Old Zone', resolved: false,
        lat: 6.8, lng: 122.07, created_at: '2026-08-20T07:00:00.000Z',
      }]);
      await flushAsyncWork();
    });
    expect(document.body.textContent).toContain('New Zone');
    expect(document.body.textContent).not.toContain('Old Zone');
  });
});
