// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../services/notificationPreferenceService';
import type { NotificationRecord } from '../services/notificationService';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  getNotifications: vi.fn(),
  loadPreferences: vi.fn(),
  markAll: vi.fn(),
  markOne: vi.fn(),
  playSound: vi.fn(),
  pushToast: vi.fn(),
  removeChannel: vi.fn(),
  updatePreferences: vi.fn(),
  attendanceQuery: vi.fn(),
  dashboardQuery: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ session: { id: 'user-1', role: 'admin' } }),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: { channel: mocks.channel, removeChannel: mocks.removeChannel },
}));

vi.mock('../hooks/useToast', () => ({ pushToast: mocks.pushToast }));

vi.mock('../lib/notificationSound', () => ({ playNotificationSound: mocks.playSound }));

vi.mock('../services/notificationService', async () => {
  const actual = await vi.importActual<typeof import('../services/notificationService')>('../services/notificationService');
  return {
    ...actual,
    getNotificationsForUser: mocks.getNotifications,
    markNotificationAsRead: mocks.markOne,
    markAllNotificationsAsRead: mocks.markAll,
  };
});

vi.mock('../services/notificationPreferenceService', async () => {
  const actual = await vi.importActual<typeof import('../services/notificationPreferenceService')>('../services/notificationPreferenceService');
  return {
    ...actual,
    loadNotificationPreferences: mocks.loadPreferences,
    updateNotificationPreferences: mocks.updatePreferences,
  };
});

import { useAttendanceRealtimeVersion } from './attendanceRealtimeContext';
import { NotificationProvider, useNotificationContext } from './NotificationContext';

const notification: NotificationRecord = {
  id: 'notification-1',
  sender_id: null,
  category: 'geofence',
  priority: 'high',
  type: 'violation',
  title: 'Boundary exit',
  message: 'A rider exited the zone.',
  recipient_id: null,
  rider_id: null,
  violation_id: null,
  action_link: null,
  metadata: null,
  read: false,
  target_roles: ['admin'],
  created_at: '2026-08-09T12:00:00Z',
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('NotificationProvider preferences', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handlers: Map<string, (payload: RealtimeTestPayload) => void>;
  let subscribeStatusHandler: ((status: string) => void) | undefined;
  let context: ReturnType<typeof useNotificationContext> | undefined;

  interface RealtimeTestPayload {
    commit_timestamp?: string;
    eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
    new: NotificationRecord | { id: string; time_in?: string | null; time_out?: string | null };
    old?: { id?: string };
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    handlers = new Map();
    subscribeStatusHandler = undefined;
    mocks.getNotifications.mockResolvedValue([]);
    mocks.loadPreferences.mockResolvedValue({
      user_id: 'user-1',
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      toast_enabled: false,
      sound_enabled: false,
      violation_alerts: false,
      created_at: '2026-08-09T11:00:00Z',
      updated_at: '2026-08-09T11:00:00Z',
    });
    const channel = {
      on: vi.fn((_kind: string, filter: { event: string; table: string }, handler: (payload: RealtimeTestPayload) => void) => {
        handlers.set(`${filter.table}:${filter.event}`, handler);
        return channel;
      }),
      subscribe: vi.fn((handler?: (status: string) => void) => {
        subscribeStatusHandler = handler;
        return channel;
      }),
    };
    mocks.channel.mockReturnValue(channel);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  function Consumer() {
    context = useNotificationContext();
    return <div>{context.notifications.length}</div>;
  }

  function AuthoritativeQueryConsumers() {
    const attendanceInvalidationVersion = useAttendanceRealtimeVersion();

    useEffect(() => {
      mocks.attendanceQuery();
      mocks.dashboardQuery();
    }, [attendanceInvalidationVersion]);

    return null;
  }

  it('keeps suppressed notifications in history while using one existing Realtime channel', async () => {
    mocks.getNotifications
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([notification]);
    const pollingSpy = vi.spyOn(window, 'setInterval');
    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();

    act(() => handlers.get('notifications:INSERT')?.({ new: notification }));
    await flush();
    expect(context?.notifications).toContainEqual(notification);
    expect(mocks.pushToast).not.toHaveBeenCalled();
    expect(mocks.playSound).not.toHaveBeenCalled();
    expect(mocks.loadPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.channel.mock.calls[0]?.[0]).toBe('realtime-authoritative-sync-user-1');
    expect(pollingSpy).not.toHaveBeenCalled();
    pollingSpy.mockRestore();
  });

  it('updates the cached preference immediately after a successful save without another subscription', async () => {
    const enabledRecord = {
      user_id: 'user-1',
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      created_at: '2026-08-09T11:00:00Z',
      updated_at: '2026-08-09T12:00:00Z',
    };
    mocks.updatePreferences.mockResolvedValue(enabledRecord);
    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();

    await act(async () => { await context?.saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES); });
    act(() => handlers.get('notifications:INSERT')?.({ new: { ...notification, id: 'notification-2' } }));
    await flush();

    expect(context?.notificationPreferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mocks.pushToast).toHaveBeenCalledTimes(1);
    expect(mocks.playSound).toHaveBeenCalledTimes(1);
    expect(mocks.channel).toHaveBeenCalledTimes(1);
  });

  it('invalidates authoritative attendance and dashboard queries for Time In and Time Out exactly once', async () => {
    act(() => root.render(
      <NotificationProvider>
        <Consumer />
        <AuthoritativeQueryConsumers />
      </NotificationProvider>
    ));
    await flush();

    const attendanceHandler = handlers.get('attendance_logs:*');
    expect(attendanceHandler).toBeDefined();
    expect(mocks.attendanceQuery).toHaveBeenCalledTimes(1);
    expect(mocks.dashboardQuery).toHaveBeenCalledTimes(1);

    const timeInPayload: RealtimeTestPayload = {
      commit_timestamp: '2026-08-12T04:00:00Z',
      eventType: 'INSERT',
      new: { id: 'attendance-1', time_in: '2026-08-12T04:00:00Z', time_out: null },
    };
    act(() => attendanceHandler?.(timeInPayload));
    await flush();
    expect(mocks.attendanceQuery).toHaveBeenCalledTimes(2);
    expect(mocks.dashboardQuery).toHaveBeenCalledTimes(2);

    act(() => attendanceHandler?.(timeInPayload));
    await flush();
    expect(mocks.attendanceQuery).toHaveBeenCalledTimes(2);
    expect(mocks.dashboardQuery).toHaveBeenCalledTimes(2);

    act(() => attendanceHandler?.({
      commit_timestamp: '2026-08-12T12:00:00Z',
      eventType: 'UPDATE',
      new: { id: 'attendance-1', time_in: '2026-08-12T04:00:00Z', time_out: '2026-08-12T12:00:00Z' },
    }));
    await flush();
    expect(mocks.attendanceQuery).toHaveBeenCalledTimes(3);
    expect(mocks.dashboardQuery).toHaveBeenCalledTimes(3);
  });

  it('refetches the authoritative notification list for the badge and list without duplicate handling', async () => {
    mocks.getNotifications
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([notification]);

    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();

    const payload: RealtimeTestPayload = {
      commit_timestamp: notification.created_at,
      eventType: 'INSERT',
      new: notification,
    };
    act(() => handlers.get('notifications:INSERT')?.(payload));
    await flush();

    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
    expect(context?.notifications).toEqual([notification]);

    act(() => handlers.get('notifications:INSERT')?.(payload));
    await flush();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
  });

  it('does not let a slower initial notification query overwrite a newer Realtime refetch', async () => {
    let resolveInitial: (records: NotificationRecord[]) => void = () => undefined;
    let resolveRealtime: (records: NotificationRecord[]) => void = () => undefined;
    mocks.getNotifications
      .mockReturnValueOnce(new Promise(resolve => { resolveInitial = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { resolveRealtime = resolve; }));

    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();

    act(() => handlers.get('notifications:INSERT')?.({
      commit_timestamp: notification.created_at,
      eventType: 'INSERT',
      new: notification,
    }));
    await act(async () => { resolveRealtime([notification]); });
    expect(context?.notifications).toEqual([notification]);

    await act(async () => { resolveInitial([]); });
    expect(context?.notifications).toEqual([notification]);
  });

  it('resynchronizes authoritative data after a temporary Realtime disconnect', async () => {
    act(() => root.render(
      <NotificationProvider>
        <Consumer />
        <AuthoritativeQueryConsumers />
      </NotificationProvider>
    ));
    await flush();

    expect(subscribeStatusHandler).toBeDefined();
    act(() => subscribeStatusHandler?.('SUBSCRIBED'));
    await flush();
    expect(mocks.getNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.attendanceQuery).toHaveBeenCalledTimes(1);

    act(() => subscribeStatusHandler?.('CHANNEL_ERROR'));
    act(() => subscribeStatusHandler?.('SUBSCRIBED'));
    await flush();

    expect(mocks.getNotifications).toHaveBeenCalledTimes(2);
    expect(mocks.attendanceQuery).toHaveBeenCalledTimes(2);
    expect(mocks.dashboardQuery).toHaveBeenCalledTimes(2);
  });

  it('cleans up one channel and creates only one replacement on remount', async () => {
    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();
    expect(mocks.channel).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);

    root = createRoot(container);
    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();
    expect(mocks.channel).toHaveBeenCalledTimes(2);
  });
});
