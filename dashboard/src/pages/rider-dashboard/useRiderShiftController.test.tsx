// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '../../components/rider/ActivityTimeline';
import { useRiderShiftController } from './useRiderShiftController';

const mocks = vi.hoisted(() => ({
  geoState: {
    position: { lat: 6.9214, lng: 122.079, accuracy: 8, ts: 1_000_000 },
    error: null as string | null,
    isLoading: false,
    hasVerifiedPosition: true,
    retry: vi.fn(),
  },
  faceState: {
    phase: 'idle', progress: 0,
    result: null as { matched: boolean; confidence: number; capturedAt: number } | null,
    start: vi.fn(), reset: vi.fn(), videoRef: { current: null }, canvasRef: { current: null },
    livenessPrompt: 'Look straight', debugInfo: {},
  },
  useGeolocation: vi.fn(), useFaceRecognition: vi.fn(),
  recordTimeIn: vi.fn(), recordTimeOut: vi.fn(), isAttendanceFinalized: vi.fn(),
  updateRiderStatus: vi.fn(), logRiderLocation: vi.fn(), updateCachedAttendanceState: vi.fn(),
  pushToast: vi.fn(), telemetryStart: vi.fn(),
}));

vi.mock('../../hooks/useGeolocation', () => ({ useGeolocation: mocks.useGeolocation }));
vi.mock('../../hooks/useFaceRecognition', () => ({ useFaceRecognition: mocks.useFaceRecognition }));
vi.mock('../../services/attendanceService', () => ({
  recordTimeIn: mocks.recordTimeIn, recordTimeOut: mocks.recordTimeOut,
  isAttendanceFinalized: mocks.isAttendanceFinalized,
}));
vi.mock('../../services/monitoringService', () => ({
  updateRiderStatus: mocks.updateRiderStatus, logRiderLocation: mocks.logRiderLocation,
}));
vi.mock('../../services/riderCacheService', () => ({ updateCachedAttendanceState: mocks.updateCachedAttendanceState }));
vi.mock('../../hooks/useToast', () => ({ pushToast: mocks.pushToast }));
vi.mock('../../lib/biometricTelemetry', () => ({
  BIOMETRIC_TIMING_NAMES: {
    userPerceivedTotal: (action: string) => `user-${action}`,
    attendancePersistence: (action: string) => `attendance-${action}`,
    riderStatusPersistence: (action: string) => `status-${action}`,
    dashboardRefresh: (action: string) => `refresh-${action}`,
  },
  biometricTelemetry: { start: mocks.telemetryStart },
}));

interface HookInput {
  userId: string; restricted: boolean; actualRiderId: string;
  rider: {
    id: string; name: string; avatar: string; zoneId: string | null;
    status: 'active' | 'idle' | 'violation' | 'offline'; lat: number; lng: number; speed: number;
    shift: 'morning' | 'afternoon' | 'evening'; lastPing: number; phone: string; riderCode: string;
    faceDescriptor?: number[] | null;
  } | null;
  zone: {
    id: string; name: string; center: [number, number]; radius: number; color: string;
    zone_type?: 'circle' | 'polygon'; polygon_coordinates?: [number, number][];
    hasValidGeometry?: boolean;
  } | null;
  attendance: { id: string | null; timeIn: string | null; timeOut: string | null };
  activeViolation: { lat: number; lng: number; zoneName: string } | null;
  loading: boolean; reload: () => Promise<void>;
  onDescriptorCalculated: (descriptor: number[]) => Promise<void> | void;
  setEvents: React.Dispatch<React.SetStateAction<ActivityEvent[]>>;
}

interface HookResult {
  action: 'closed' | 'completed' | 'time-out' | 'time-in'; canTimeIn: boolean;
  isOnline: boolean; onlineStatus: 'online' | 'offline'; duration: string | null;
  location: {
    position: { lat: number; lng: number; accuracy: number; ts: number };
    positionToUse: { lat: number; lng: number; accuracy: number; ts: number };
    distance: number | null; inZone: boolean | null; geofenceResolved: boolean;
    error: string | null; isLoading: boolean;
    hasVerifiedPosition: boolean; retry: () => void; zoneName: string | null; zoneRadius: number | null;
  };
  scanner: {
    open: boolean; setOpen: (open: boolean) => void; pendingAction: 'time-in' | 'time-out';
    openScan: (action: 'time-in' | 'time-out') => void; phase: string; progress: number;
    result: { matched: boolean; confidence: number; capturedAt: number } | null;
    start: () => void; reset: () => void; videoRef: { current: HTMLVideoElement | null };
    canvasRef: { current: HTMLCanvasElement | null }; livenessPrompt: string; debugInfo: unknown;
  };
}

type UseShiftHook = (input: HookInput) => HookResult;

const rider: NonNullable<HookInput['rider']> = {
  id: 'rider-1', name: 'Juan Rider', avatar: 'avatar.jpg', zoneId: 'zone-1', status: 'active',
  lat: 6.9214, lng: 122.079, speed: 0, shift: 'morning', lastPing: 0, phone: '', riderCode: 'MKB-1',
  faceDescriptor: null,
};
const circleZone: NonNullable<HookInput['zone']> = {
  id: 'zone-1', name: 'North', center: [6.9214, 122.079], radius: 1000, color: '#f00', zone_type: 'circle',
};

async function flushAsyncWork() {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}

describe('useRiderShiftController characterization', () => {
  let root: Root; let container: HTMLDivElement; let latest: HookResult | null;
  let latestEvents: ActivityEvent[];
  let currentInput: Omit<HookInput, 'setEvents'>;
  const useHook = useRiderShiftController as UseShiftHook;

  function Probe() {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    latestEvents = events;
    latest = useHook!({ ...currentInput, setEvents }); return null;
  }

  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.geoState = {
      position: { lat: 6.9214, lng: 122.079, accuracy: 8, ts: 1_000_000 },
      error: null, isLoading: false, hasVerifiedPosition: true, retry: vi.fn(),
    };
    mocks.faceState = {
      phase: 'idle', progress: 0, result: null, start: vi.fn(), reset: vi.fn(),
      videoRef: { current: null }, canvasRef: { current: null }, livenessPrompt: 'Look straight', debugInfo: {},
    };
    mocks.useGeolocation.mockImplementation(() => mocks.geoState);
    mocks.useFaceRecognition.mockImplementation(() => mocks.faceState);
    mocks.isAttendanceFinalized.mockReturnValue(false);
    mocks.recordTimeIn.mockResolvedValue({ id: 'attendance-1', date: '1970-01-01', rawTimeIn: '1970-01-01T00:16:40.000Z' });
    mocks.recordTimeOut.mockResolvedValue(true); mocks.updateRiderStatus.mockResolvedValue(undefined);
    mocks.logRiderLocation.mockResolvedValue(undefined); mocks.updateCachedAttendanceState.mockResolvedValue(undefined);
    mocks.telemetryStart.mockImplementation(() => vi.fn());
    currentInput = {
      userId: 'user-1', restricted: false, actualRiderId: 'rider-1', rider, zone: circleZone,
      attendance: { id: null, timeIn: null, timeOut: null }, activeViolation: null, loading: false,
      reload: vi.fn().mockResolvedValue(undefined), onDescriptorCalculated: vi.fn(),
    };
    latest = null; latestEvents = []; container = document.createElement('div');
    document.body.appendChild(container); root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount()); document.body.innerHTML = ''; vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function renderController() {
    await act(async () => { root.render(<Probe />); await flushAsyncWork(); });
  }
  async function rerenderController() {
    await act(async () => { root.render(<Probe />); await flushAsyncWork(); });
  }
  async function openAndMatch(action: 'time-in' | 'time-out') {
    act(() => latest!.scanner.openScan(action));
    mocks.faceState = { ...mocks.faceState, phase: 'matched', result: { matched: true, confidence: 0.98, capturedAt: 1_000_000 } };
    await rerenderController();
    await act(async () => { await flushAsyncWork(); });
  }

  it('records Time In with fresh GPS and never uses display violation coordinates', async () => {
    currentInput.activeViolation = { lat: 99, lng: 88, zoneName: 'Display fallback' };
    await renderController(); expect(latest!.location.positionToUse).toMatchObject({ lat: 99, lng: 88 });
    await openAndMatch('time-in');
    expect(mocks.recordTimeIn).toHaveBeenCalledWith('rider-1');
    expect(mocks.updateRiderStatus).toHaveBeenCalledWith('rider-1', 'active', 6.9214, 122.079);
    expect(mocks.logRiderLocation).toHaveBeenCalledWith('rider-1', 6.9214, 122.079, 'active');
  });

  it('blocks Time In when GPS expires during face verification', async () => {
    await renderController(); act(() => latest!.scanner.openScan('time-in'));
    mocks.geoState = { ...mocks.geoState, position: { ...mocks.geoState.position, ts: 879_999 } };
    mocks.faceState = { ...mocks.faceState, phase: 'matched', result: { matched: true, confidence: 0.98, capturedAt: 1_000_000 } };
    await rerenderController();
    expect(mocks.recordTimeIn).not.toHaveBeenCalled(); expect(mocks.geoState.retry).toHaveBeenCalled();
  });

  it('allows Time Out without GPS and uses the current attendance ID', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    mocks.geoState = { ...mocks.geoState, hasVerifiedPosition: false, position: { ...mocks.geoState.position, ts: 0 } };
    await renderController(); await openAndMatch('time-out');
    expect(mocks.recordTimeOut).toHaveBeenCalledWith('attendance-current', { riderId: 'rider-1', date: '1970-01-01' });
  });

  it('patches offline Time In cache before reload', async () => {
    const events: string[] = []; Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mocks.recordTimeIn.mockImplementation(async () => { events.push('attendance'); return { id: 'attendance-1', date: '1970-01-01', rawTimeIn: 'raw-in' }; });
    mocks.updateRiderStatus.mockImplementation(async () => { events.push('status'); });
    mocks.logRiderLocation.mockImplementation(async () => { events.push('location'); });
    mocks.updateCachedAttendanceState.mockImplementation(async () => { events.push('cache'); });
    currentInput.reload = vi.fn(async () => { events.push('reload'); });
    await renderController(); await openAndMatch('time-in');
    expect(events).toEqual(['attendance', 'status', 'location', 'cache', 'reload']);
  });

  it('patches offline Time Out cache before reload', async () => {
    const events: string[] = []; Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    mocks.geoState = { ...mocks.geoState, hasVerifiedPosition: false };
    mocks.recordTimeOut.mockImplementation(async () => { events.push('attendance'); return true; });
    mocks.updateRiderStatus.mockImplementation(async () => { events.push('status'); });
    mocks.updateCachedAttendanceState.mockImplementation(async () => { events.push('cache'); });
    currentInput.reload = vi.fn(async () => { events.push('reload'); });
    await renderController(); await openAndMatch('time-out');
    expect(events).toEqual(['attendance', 'status', 'cache', 'reload']);
  });

  it('writes attendance once for one stable matched result across rerenders', async () => {
    await renderController(); await openAndMatch('time-in'); await rerenderController();
    expect(mocks.recordTimeIn).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing 220ms scanner timing', async () => {
    await renderController(); act(() => latest!.scanner.openScan('time-in'));
    await vi.advanceTimersByTimeAsync(219); expect(mocks.faceState.start).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(mocks.faceState.start).toHaveBeenCalledOnce();
  });

  it('cancels an obsolete scanner start when the scanner closes before 220ms', async () => {
    await renderController();
    act(() => latest!.scanner.openScan('time-in'));
    act(() => latest!.scanner.setOpen(false));

    await vi.advanceTimersByTimeAsync(220);
    expect(mocks.faceState.start).not.toHaveBeenCalled();
  });

  it('executes Time In once when matched results change during an in-flight write', async () => {
    let resolveTimeIn!: (value: { id: string; date: string; rawTimeIn: string }) => void;
    mocks.recordTimeIn.mockReturnValue(new Promise(resolve => { resolveTimeIn = resolve; }));
    await renderController();
    await openAndMatch('time-in');

    mocks.faceState = {
      ...mocks.faceState,
      result: { matched: true, confidence: 0.99, capturedAt: 1_000_001 },
    };
    await rerenderController();
    expect(mocks.recordTimeIn).toHaveBeenCalledTimes(1);

    resolveTimeIn({ id: 'attendance-1', date: '1970-01-01', rawTimeIn: 'raw-in' });
    await act(async () => { await flushAsyncWork(); });
  });

  it('executes Time Out once when matched results change during an in-flight write', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    let resolveTimeOut!: (value: boolean) => void;
    mocks.recordTimeOut.mockReturnValue(new Promise(resolve => { resolveTimeOut = resolve; }));
    await renderController();
    await openAndMatch('time-out');

    mocks.faceState = {
      ...mocks.faceState,
      result: { matched: true, confidence: 0.99, capturedAt: 1_000_001 },
    };
    await rerenderController();
    expect(mocks.recordTimeOut).toHaveBeenCalledTimes(1);

    resolveTimeOut(true);
    await act(async () => { await flushAsyncWork(); });
  });

  it('syncs immediately and the 30-second sync uses latest refs', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    await renderController(); await act(async () => { await flushAsyncWork(); });
    expect(mocks.logRiderLocation).toHaveBeenCalledWith('rider-1', 6.9214, 122.079, 'active');
    mocks.logRiderLocation.mockClear();
    mocks.geoState = { ...mocks.geoState, position: { lat: 7.1, lng: 122.2, accuracy: 5, ts: 1_000_000 } };
    await rerenderController(); await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.logRiderLocation).toHaveBeenCalledWith('rider-1', 7.1, 122.2, 'violation');
  });

  it('cleans the 30-second sync interval on unmount', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    await renderController(); await act(async () => { await flushAsyncWork(); }); mocks.logRiderLocation.mockClear();
    act(() => root.unmount()); await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.logRiderLocation).not.toHaveBeenCalled(); root = createRoot(container);
  });

  it('does not run location-sync follow-up effects after cleanup', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    let resolveLocation!: () => void;
    mocks.logRiderLocation.mockReturnValue(new Promise<void>(resolve => { resolveLocation = resolve; }));
    const successLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await renderController();
    expect(mocks.logRiderLocation).toHaveBeenCalledOnce();

    act(() => root.unmount());
    resolveLocation();
    await act(async () => { await flushAsyncWork(); });
    expect(successLog).not.toHaveBeenCalled();
    successLog.mockRestore();
    root = createRoot(container);
  });

  it('preserves circle and polygon geofence interpretation', async () => {
    await renderController(); expect(latest!.location.inZone).toBe(true);
    currentInput.zone = { ...circleZone, zone_type: 'polygon', polygon_coordinates: [[6.90, 122.05], [6.95, 122.05], [6.95, 122.10], [6.90, 122.10]] };
    await rerenderController(); expect(latest!.location.inZone).toBe(true);
  });

  it('keeps geofence state unresolved and submits only real coordinates when no zone is resolved', async () => {
    currentInput.zone = null;
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };

    await renderController();
    await act(async () => { await flushAsyncWork(); });

    expect(latest!.location).toMatchObject({
      distance: null,
      inZone: null,
      geofenceResolved: false,
      zoneName: null,
      zoneRadius: null,
    });
    expect(mocks.logRiderLocation).toHaveBeenCalledWith('rider-1', 6.9214, 122.079);
  });

  it('does not calculate against zero coordinates when assigned zone geometry is invalid', async () => {
    currentInput.zone = {
      ...circleZone,
      center: [0, 0],
      radius: 0,
      hasValidGeometry: false,
    };
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };

    await renderController();
    await act(async () => { await flushAsyncWork(); });

    expect(latest!.location.distance).toBeNull();
    expect(latest!.location.inZone).toBeNull();
    expect(latest!.location.geofenceResolved).toBe(false);
    expect(mocks.logRiderLocation).toHaveBeenCalledWith('rider-1', 6.9214, 122.079);
  });

  it('seeds the activity timeline and keeps the 90-second geofence event behavior', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    await renderController();
    expect(latestEvents).toEqual([{
      id: 'seed-1', ts: '06:58', kind: 'note', label: 'Zone assignment received',
      detail: 'Assigned Zone · North',
    }]);

    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(latestEvents[0]).toMatchObject({
      id: 'geo-1090000', kind: 'geofence_ok', label: 'Geofence check passed',
    });
  });

  it('restarts the 90-second activity interval when geofence-derived values change', async () => {
    currentInput.attendance = { id: 'attendance-current', timeIn: '08:00', timeOut: null };
    await renderController();
    await act(async () => { await vi.advanceTimersByTimeAsync(89_000); });

    mocks.geoState = {
      ...mocks.geoState,
      position: { lat: 7.1, lng: 122.2, accuracy: 5, ts: Date.now() },
    };
    await rerenderController();
    await act(async () => { await vi.advanceTimersByTimeAsync(89_999); });
    expect(latestEvents.filter((event) => event.id.startsWith('geo-'))).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(latestEvents[0]).toMatchObject({ kind: 'geofence_alert', label: 'Boundary alert triggered' });
  });
});
