// @vitest-environment jsdom

import { act } from 'react';
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
  let insertHandler: ((payload: { new: NotificationRecord }) => void) | undefined;
  let context: ReturnType<typeof useNotificationContext> | undefined;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
      on: vi.fn((_kind: string, filter: { event: string }, handler: (payload: { new: NotificationRecord }) => void) => {
        if (filter.event === 'INSERT') insertHandler = handler;
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

  function Consumer() {
    context = useNotificationContext();
    return <div>{context.notifications.length}</div>;
  }

  it('keeps suppressed notifications in history while using one existing Realtime channel', async () => {
    const pollingSpy = vi.spyOn(window, 'setInterval');
    act(() => root.render(<NotificationProvider><Consumer /></NotificationProvider>));
    await flush();

    act(() => insertHandler?.({ new: notification }));
    expect(context?.notifications).toContainEqual(notification);
    expect(mocks.pushToast).not.toHaveBeenCalled();
    expect(mocks.playSound).not.toHaveBeenCalled();
    expect(mocks.loadPreferences).toHaveBeenCalledTimes(1);
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.channel.mock.calls[0]?.[0]).toBe('realtime-global-notifications-user-1');
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
    act(() => insertHandler?.({ new: { ...notification, id: 'notification-2' } }));

    expect(context?.notificationPreferences).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(mocks.pushToast).toHaveBeenCalledTimes(1);
    expect(mocks.playSound).toHaveBeenCalledTimes(1);
    expect(mocks.channel).toHaveBeenCalledTimes(1);
  });
});
