// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  getAttendanceLogs: vi.fn(),
  listAttendanceContext: vi.fn(),
  getHrTodayKpis: vi.fn(),
  getNotifications: vi.fn(),
  getRidersLookup: vi.fn(),
  getZones: vi.fn(),
  loadPreferences: vi.fn(),
  removeChannel: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ session: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('../context/HubContext', () => ({
  useHub: () => ({ selectedHubId: null, workspaceKey: 'all', isReady: true }),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { channel: mocks.channel, removeChannel: mocks.removeChannel, rpc: mocks.rpc },
}));

vi.mock('../services/notifications/notificationService', async () => {
  const actual = await vi.importActual<typeof import('../services/notifications/notificationService')>('../services/notifications/notificationService');
  return {
    ...actual,
    getFlaggedViolationIds: vi.fn().mockResolvedValue(new Set()),
    getNotificationsForUser: mocks.getNotifications,
  };
});

vi.mock('../services/notifications/notificationPreferenceService', async () => {
  const actual = await vi.importActual<typeof import('../services/notifications/notificationPreferenceService')>('../services/notifications/notificationPreferenceService');
  return {
    ...actual,
    loadNotificationPreferences: mocks.loadPreferences,
  };
});

vi.mock('../services/attendance/attendanceService', async () => {
  const actual = await vi.importActual<typeof import('../services/attendance/attendanceService')>('../services/attendance/attendanceService');
  return {
    ...actual,
    getAttendanceLogs: mocks.getAttendanceLogs,
    getHrTodayKpis: mocks.getHrTodayKpis,
  };
});

vi.mock('../services/attendance/attendanceContextService', async () => {
  const actual = await vi.importActual<typeof import('../services/attendance/attendanceContextService')>('../services/attendance/attendanceContextService');
  return { ...actual, listAttendanceContext: mocks.listAttendanceContext };
});

vi.mock('../services/geofencing/geofenceService', async () => {
  const actual = await vi.importActual<typeof import('../services/geofencing/geofenceService')>('../services/geofencing/geofenceService');
  return { ...actual, getZones: mocks.getZones };
});

vi.mock('../services/riders/riderService', async () => {
  const actual = await vi.importActual<typeof import('../services/riders/riderService')>('../services/riders/riderService');
  return { ...actual, getRidersLookup: mocks.getRidersLookup };
});

vi.mock('../hooks/useRealtimeLocation', () => ({
  useRealtimeLocation: () => ({
    riders: [],
    violations: [],
    markLocalViolationRead: vi.fn(),
    markAllLocalViolationsRead: vi.fn(),
  }),
}));

vi.mock('../components/maps/LiveMonitoringMap', () => ({
  LiveMonitoringMap: () => <div />,
}));

import { NotificationProvider } from '../context/NotificationContext';
import { AdminDashboard } from './AdminDashboard';
import { Attendance } from './Attendance';
import { HRDashboard } from './HRDashboard';
import { reviewRiderAbsenceRequest } from '../services/workforce/riderAbsenceRequestService';
import { ATTENDANCE_CONTEXT_INVALIDATED } from '../services/attendance/attendanceContextInvalidation';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Admin and HR attendance Realtime refresh', () => {
  let container: HTMLDivElement;
  let root: Root;
  let attendanceHandler: ((payload: {
    commit_timestamp: string;
    eventType: 'INSERT' | 'UPDATE';
    new: { id: string; time_in: string | null; time_out: string | null };
  }) => void) | undefined;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    attendanceHandler = undefined;

    mocks.getAttendanceLogs.mockResolvedValue([]);
    mocks.listAttendanceContext.mockResolvedValue([]);
    mocks.rpc.mockResolvedValue({ data: 'request-1', error: null });
    mocks.getHrTodayKpis.mockResolvedValue({ onDuty: 0, complete: 0, absent: 0, pending: 0 });
    mocks.getNotifications.mockResolvedValue([]);
    mocks.getRidersLookup.mockResolvedValue([]);
    mocks.getZones.mockResolvedValue([]);
    mocks.loadPreferences.mockResolvedValue({
      user_id: 'admin-1',
      toast_enabled: true,
      sound_enabled: true,
      violation_alerts: true,
      attendance_alerts: true,
      payroll_updates: true,
      support_ticket_updates: true,
      system_updates: true,
      created_at: '2026-08-12T00:00:00Z',
      updated_at: '2026-08-12T00:00:00Z',
    });

    const channel = {
      on: vi.fn((_kind: string, filter: { event: string; table: string }, handler: typeof attendanceHandler) => {
        if (filter.table === 'attendance_logs') attendanceHandler = handler;
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    mocks.channel.mockReturnValue(channel);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  async function emitAttendance(eventType: 'INSERT' | 'UPDATE'): Promise<void> {
    expect(attendanceHandler).toBeDefined();
    act(() => attendanceHandler?.({
      commit_timestamp: eventType === 'INSERT' ? '2026-08-12T04:00:00Z' : '2026-08-12T12:00:00Z',
      eventType,
      new: {
        id: 'attendance-1',
        time_in: '2026-08-12T04:00:00Z',
        time_out: eventType === 'UPDATE' ? '2026-08-12T12:00:00Z' : null,
      },
    }));
    await flush();
  }

  it.each([
    ['Leave approval', 'approved'], ['Leave rejection', 'rejected'],
    ['Notice acceptance', 'approved'], ['Notice rejection', 'rejected'],
  ] as const)('refreshes mounted Attendance after local %s without private event data', async (_label, decision) => {
    act(() => root.render(<NotificationProvider><Attendance /></NotificationProvider>));
    await flush();
    const before = mocks.listAttendanceContext.mock.calls.length;
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener(ATTENDANCE_CONTEXT_INVALIDATED, listener);
    try {
      await act(async () => { await reviewRiderAbsenceRequest('private-request-id', 1, decision, 'private review note'); });
      await flush();
      expect(mocks.listAttendanceContext).toHaveBeenCalledTimes(before + 1);
      expect(events).toHaveLength(1);
      expect(events[0]).not.toHaveProperty('detail');
      expect(JSON.stringify(events[0])).not.toMatch(/private-request-id|private review note|reason|audit/);
    } finally {
      window.removeEventListener(ATTENDANCE_CONTEXT_INVALIDATED, listener);
    }
  });

  it('refetches the Admin dashboard attendance data after Rider Time In', async () => {
    act(() => root.render(
      <NotificationProvider>
        <AdminDashboard onNavigate={vi.fn()} />
      </NotificationProvider>
    ));
    await flush();
    expect(mocks.listAttendanceContext).toHaveBeenCalledTimes(1);

    await emitAttendance('INSERT');
    expect(mocks.listAttendanceContext).toHaveBeenCalledTimes(2);
  });

  it('refetches the HR dashboard attendance data and KPIs after Rider Time Out', async () => {
    act(() => root.render(
      <NotificationProvider>
        <HRDashboard onNavigate={vi.fn()} />
      </NotificationProvider>
    ));
    await flush();
    expect(mocks.listAttendanceContext).toHaveBeenCalledTimes(1);
    expect(mocks.getHrTodayKpis).not.toHaveBeenCalled();

    await emitAttendance('UPDATE');
    expect(mocks.listAttendanceContext).toHaveBeenCalledTimes(2);
    expect(mocks.getHrTodayKpis).not.toHaveBeenCalled();
  });

  it('refetches the Attendance Logs page after an attendance event', async () => {
    act(() => root.render(
      <NotificationProvider>
        <Attendance />
      </NotificationProvider>
    ));
    await flush();
    expect(mocks.getAttendanceLogs).toHaveBeenCalledTimes(1);

    await emitAttendance('INSERT');
    expect(mocks.getAttendanceLogs).toHaveBeenCalledTimes(2);
  });
});
