// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callbacks: [] as unknown[],
  fetchRiderDashboardWithSWR: vi.fn(),
  setCachedDescriptor: vi.fn(),
  zones: [] as Array<{
    id: string;
    name: string;
    center: [number, number];
    radius: number;
    color: string;
    hasValidGeometry?: boolean;
  }>,
}));

vi.mock('../../services/riderCacheService', () => ({
  fetchRiderDashboardWithSWR: mocks.fetchRiderDashboardWithSWR,
}));
vi.mock('../../context/RiderZoneContext', () => ({
  useRiderZone: () => ({ zones: mocks.zones }),
}));
vi.mock('../../lib/descriptorCache', () => ({
  setCachedDescriptor: mocks.setCachedDescriptor,
}));
import { useRiderDashboardData } from './useRiderDashboardData';

interface DashboardCallbacks {
  onCacheLoaded?: (payload: DashboardPayload) => void;
  onFreshDataLoaded?: (payload: DashboardPayload) => void;
}

interface DashboardPayload {
  resolvedRiderId: string;
  dbUser: { rider_id: string | null } | null;
  dbRider: {
    id: string;
    name: string;
    face_image_url?: string | null;
    avatar_url?: string | null;
    zone_id: string | null;
    status: 'active' | 'idle' | 'violation' | 'offline';
    lat?: number | null;
    lng?: number | null;
    speed?: number | null;
    shift?: string | null;
    last_ping?: string | number | null;
    contact?: string | null;
    mkb_id: string;
    face_descriptor?: number[] | null;
  } | null;
  todayAttendance: {
    id: string;
    rider_id: string;
    date: string;
    time_in: string | null;
    time_out: string | null;
    hours: number | null;
    status: string;
  } | null;
  latestViolation: {
    id: string;
    rider_id: string;
    resolved: boolean;
    lat?: number | null;
    lng?: number | null;
    zone_name?: string | null;
    created_at: string;
  } | null;
  monthAttendance: Array<{
    id: string;
    rider_id: string;
    date: string;
    time_in: string | null;
    time_out: string | null;
    hours: number | null;
    status: string;
  }>;
  monthViolationCount: number;
  timestamp: number;
}

interface HookResult {
  actualRiderId: string;
  rider: { id: string; name: string; zoneId: string | null; faceDescriptor?: number[] | null } | null;
  zone: { id: string; name: string } | null;
  loading: boolean;
  attendance: { id: string | null; timeIn: string | null; timeOut: string | null };
  activeViolation: { lat: number; lng: number; zoneName: string } | null;
  stats: { daysPresent: number; hoursThisWeek: number; violationsThisMonth: number };
  monthAttendanceLogs: DashboardPayload['monthAttendance'];
  reload: () => Promise<unknown>;
  updateRiderFaceDescriptor: (descriptor: number[]) => void;
}

type UseDataHook = (input: { userId: string; riderId: string }) => HookResult;

const cachedPayload: DashboardPayload = {
  resolvedRiderId: 'rider-1',
  dbUser: { rider_id: 'rider-1' },
  dbRider: {
    id: 'rider-1', name: 'Cached Rider', face_image_url: 'cached.jpg', avatar_url: null,
    zone_id: 'zone-2', status: 'active', lat: 6.9, lng: 122.08, speed: 0,
    shift: 'Morning', last_ping: null, contact: '', mkb_id: 'MKB-1', face_descriptor: null,
  },
  todayAttendance: {
    id: 'attendance-cache', rider_id: 'rider-1', date: '2026-08-05',
    time_in: '2026-08-05T08:00:00', time_out: null, hours: 0, status: 'present',
  },
  latestViolation: {
    id: 'violation-cache', rider_id: 'rider-1', resolved: false,
    lat: 6.92, lng: 122.09, zone_name: 'Cached Zone', created_at: '2026-08-05T09:00:00.000Z',
  },
  monthAttendance: [{
    id: 'attendance-cache', rider_id: 'rider-1', date: '2026-08-05',
    time_in: '2026-08-05T08:00:00', time_out: null, hours: 7, status: 'present',
  }],
  monthViolationCount: 1,
  timestamp: 1,
};

const freshDescriptor = Array.from({ length: 128 }, (_, index) => index / 128);
const freshPayload: DashboardPayload = {
  ...cachedPayload,
  dbRider: {
    ...cachedPayload.dbRider!,
    name: 'Fresh Rider',
    zone_id: 'zone-1',
    face_image_url: 'fresh.jpg',
    face_descriptor: freshDescriptor,
  },
  todayAttendance: {
    ...cachedPayload.todayAttendance!,
    id: 'attendance-fresh',
    time_out: '2026-08-05T17:00:00',
    hours: 9,
  },
  latestViolation: null,
  monthAttendance: [
    cachedPayload.monthAttendance[0],
    {
      id: 'attendance-late', rider_id: 'rider-1', date: '2026-08-06',
      time_in: '2026-08-06T08:30:00', time_out: null, hours: 8.25, status: 'late',
    },
  ],
  monthViolationCount: 2,
  timestamp: 2,
};

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useRiderDashboardData characterization', () => {
  let root: Root;
  let container: HTMLDivElement;
  let latest: HookResult | null;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.zones = [
      { id: 'zone-1', name: 'North', center: [6.9, 122.08], radius: 1000, color: '#f00' },
      { id: 'zone-2', name: 'South', center: [6.8, 122.07], radius: 900, color: '#0f0' },
    ];
    mocks.fetchRiderDashboardWithSWR.mockImplementation(async (
      _userId: string,
      _riderId: string,
      _today: string,
      _monthStart: string,
      _monthStartIso: string,
      callbacks: DashboardCallbacks,
    ) => {
      mocks.callbacks.push(callbacks);
      return null;
    });
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    latest = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function renderHook(useHook: UseDataHook, restricted = false) {
    function Probe() {
      void restricted;
      latest = useHook({ userId: 'user-1', riderId: 'rider-1' });
      return null;
    }
    await act(async () => {
      root.render(<Probe />);
      await flushAsyncWork();
    });
  }

  it('applies cached payload before fresh payload and resolves each Rider zone', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const callbacks = mocks.callbacks[0] as DashboardCallbacks;

    await act(async () => {
      callbacks.onCacheLoaded?.(cachedPayload);
      await flushAsyncWork();
    });
    expect(latest).toMatchObject({
      actualRiderId: 'rider-1',
      rider: { name: 'Cached Rider', zoneId: 'zone-2' },
      zone: { id: 'zone-2', name: 'South' },
      loading: false,
      attendance: { id: 'attendance-cache', timeIn: '08:00', timeOut: null },
      activeViolation: { lat: 6.92, lng: 122.09, zoneName: 'Cached Zone' },
      stats: { daysPresent: 1, violationsThisMonth: 1 },
    });

    await act(async () => {
      callbacks.onFreshDataLoaded?.(freshPayload);
      await flushAsyncWork();
    });
    expect(latest).toMatchObject({
      rider: { name: 'Fresh Rider', zoneId: 'zone-1' },
      zone: { id: 'zone-1', name: 'North' },
      attendance: { id: 'attendance-fresh', timeIn: '08:00', timeOut: '17:00' },
      activeViolation: null,
      stats: { daysPresent: 2, violationsThisMonth: 2 },
      monthAttendanceLogs: freshPayload.monthAttendance,
    });
    expect(mocks.setCachedDescriptor).toHaveBeenCalledWith('rider-1', freshDescriptor, 'fresh.jpg');
  });

  it('does not substitute the first zone when the Rider is unassigned', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const callbacks = mocks.callbacks[0] as DashboardCallbacks;

    await act(async () => {
      callbacks.onFreshDataLoaded?.({
        ...freshPayload,
        dbRider: { ...freshPayload.dbRider!, zone_id: null },
      });
      await flushAsyncWork();
    });

    expect(latest!.rider?.zoneId).toBeNull();
    expect(latest!.zone).toBeNull();
  });

  it('leaves the zone unresolved when the assigned zone ID is missing from loaded zones', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const callbacks = mocks.callbacks[0] as DashboardCallbacks;

    await act(async () => {
      callbacks.onFreshDataLoaded?.({
        ...freshPayload,
        dbRider: { ...freshPayload.dbRider!, zone_id: 'zone-missing' },
      });
      await flushAsyncWork();
    });

    expect(latest!.zone).toBeNull();
  });

  it('leaves the zone unresolved when no zones are loaded', async () => {
    mocks.zones = [];
    await renderHook(useRiderDashboardData as UseDataHook);
    const callbacks = mocks.callbacks[0] as DashboardCallbacks;

    await act(async () => {
      callbacks.onFreshDataLoaded?.(freshPayload);
      await flushAsyncWork();
    });

    expect(latest!.zone).toBeNull();
  });

  it('clears a previously resolved zone when refreshed zones no longer contain the assignment', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const callbacks = mocks.callbacks[0] as DashboardCallbacks;
    await act(async () => {
      callbacks.onCacheLoaded?.(cachedPayload);
      await flushAsyncWork();
    });
    expect(latest!.zone?.id).toBe('zone-2');

    mocks.zones = [mocks.zones[0]];
    await act(async () => {
      latest!.updateRiderFaceDescriptor([0.1]);
      await flushAsyncWork();
    });

    expect(latest!.rider?.zoneId).toBe('zone-2');
    expect(latest!.zone).toBeNull();
  });

  it('keeps reload stable and applies later reload callbacks to the same state', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const initialReload = latest!.reload;

    await act(async () => {
      await initialReload();
      await flushAsyncWork();
    });
    expect(mocks.fetchRiderDashboardWithSWR).toHaveBeenCalledTimes(2);
    expect(latest!.reload).toBe(initialReload);

    const secondCallbacks = mocks.callbacks[1] as DashboardCallbacks;
    await act(async () => {
      secondCallbacks.onFreshDataLoaded?.(freshPayload);
      await flushAsyncWork();
    });
    expect(latest).toMatchObject({ rider: { name: 'Fresh Rider' }, attendance: { id: 'attendance-fresh' } });
  });

  it('ignores callbacks from an older reload after a newer reload owns the state', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const olderCallbacks = mocks.callbacks[0] as DashboardCallbacks;

    await act(async () => {
      await latest!.reload();
      await flushAsyncWork();
    });
    const newerCallbacks = mocks.callbacks[1] as DashboardCallbacks;

    await act(async () => {
      newerCallbacks.onFreshDataLoaded?.(freshPayload);
      await flushAsyncWork();
    });
    await act(async () => {
      olderCallbacks.onFreshDataLoaded?.(cachedPayload);
      await flushAsyncWork();
    });

    expect(latest).toMatchObject({
      rider: { name: 'Fresh Rider' },
      attendance: { id: 'attendance-fresh' },
      stats: { violationsThisMonth: 2 },
    });
  });

  it('updates only local Rider state when the face descriptor action is used', async () => {
    await renderHook(useRiderDashboardData as UseDataHook);
    const callbacks = mocks.callbacks[0] as DashboardCallbacks;
    await act(async () => {
      callbacks.onCacheLoaded?.(cachedPayload);
      await flushAsyncWork();
    });
    mocks.setCachedDescriptor.mockClear();
    const descriptor = [0.1, 0.2, 0.3];

    act(() => latest!.updateRiderFaceDescriptor(descriptor));

    expect(latest!.rider?.faceDescriptor).toEqual(descriptor);
    expect(mocks.setCachedDescriptor).not.toHaveBeenCalled();
  });

  it('continues loading primary data when the parent Rider is restricted', async () => {
    await renderHook(useRiderDashboardData as UseDataHook, true);

    expect(mocks.fetchRiderDashboardWithSWR).toHaveBeenCalledOnce();
  });

  it('preserves error fallback by ending loading without inventing state', async () => {
    mocks.fetchRiderDashboardWithSWR.mockRejectedValue(new Error('network failed'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await renderHook(useRiderDashboardData as UseDataHook);

    expect(latest).toMatchObject({
      actualRiderId: 'rider-1', rider: null, zone: null, loading: false,
      attendance: { id: null, timeIn: null, timeOut: null }, activeViolation: null,
    });
  });
});
