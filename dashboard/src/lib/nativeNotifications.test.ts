import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type PermissionStatus } from '@capacitor/local-notifications';
import {
  initNativeNotifications,
  notifyAttendanceEvent,
  notifyGeofenceWarning,
  scheduleShiftReminder,
  notifySyncComplete,
  notifyIncomingSystemAlert,
  NOTIFICATION_CHANNELS,
} from './nativeNotifications';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(),
    schedule: vi.fn(),
  },
}));

describe('nativeNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('on Web / Non-Native platform', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it('gracefully no-ops without calling native plugins', async () => {
      expect(await initNativeNotifications()).toBe(false);
      expect(await notifyAttendanceEvent({ type: 'time-in' })).toBe(false);
      expect(await notifyGeofenceWarning({ zoneName: 'Zone A' })).toBe(false);
      expect(await scheduleShiftReminder({ shiftDate: '2026-10-26', startsAt: '08:00' })).toBe(false);
      expect(await notifySyncComplete(5)).toBe(false);
      expect(await notifyIncomingSystemAlert({ title: 'Test', message: 'Hello' })).toBe(false);

      expect(LocalNotifications.schedule).not.toHaveBeenCalled();
      expect(LocalNotifications.createChannel).not.toHaveBeenCalled();
    });
  });

  describe('on Native Platform (Android / iOS)', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
      vi.mocked(LocalNotifications.checkPermissions).mockResolvedValue({ display: 'granted' } as PermissionStatus);
      vi.mocked(LocalNotifications.requestPermissions).mockResolvedValue({ display: 'granted' } as PermissionStatus);
      vi.mocked(LocalNotifications.createChannel).mockResolvedValue();
      vi.mocked(LocalNotifications.schedule).mockResolvedValue({ notifications: [] });
    });

    it('initializes channels when permission is granted', async () => {
      const result = await initNativeNotifications();
      expect(result).toBe(true);
      expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: NOTIFICATION_CHANNELS.OPERATIONAL,
          importance: 5,
        })
      );
      expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: NOTIFICATION_CHANNELS.GENERAL,
          importance: 4,
        })
      );
    });

    it('requests permission if not already granted', async () => {
      vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: 'prompt' } as PermissionStatus);
      vi.mocked(LocalNotifications.requestPermissions).mockResolvedValueOnce({ display: 'granted' } as PermissionStatus);

      const result = await initNativeNotifications();
      expect(result).toBe(true);
      expect(LocalNotifications.requestPermissions).toHaveBeenCalled();
    });

    it('returns false if user denies notification permission', async () => {
      vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: 'prompt' } as PermissionStatus);
      vi.mocked(LocalNotifications.requestPermissions).mockResolvedValueOnce({ display: 'denied' } as PermissionStatus);

      const result = await initNativeNotifications();
      expect(result).toBe(false);
    });

    it('schedules attendance confirmation for time-in', async () => {
      const ok = await notifyAttendanceEvent({ type: 'time-in', timestamp: '08:02 AM' });
      expect(ok).toBe(true);
      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            id: 1001,
            channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
            title: 'Attendance Confirmed: Time-In',
            body: expect.stringContaining('08:02 AM'),
          }),
        ],
      });
    });

    it('schedules attendance confirmation for time-out', async () => {
      const ok = await notifyAttendanceEvent({ type: 'time-out', timestamp: '05:01 PM' });
      expect(ok).toBe(true);
      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            id: 1002,
            channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
            title: 'Attendance Confirmed: Time-Out',
            body: expect.stringContaining('05:01 PM'),
          }),
        ],
      });
    });

    it('schedules geofence warning with distance and zone name', async () => {
      const ok = await notifyGeofenceWarning({ zoneName: 'Tetuan Hub', distanceMeters: 145 });
      expect(ok).toBe(true);
      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            id: 2001,
            channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
            title: 'Geofence Boundary Alert',
            body: expect.stringContaining('Tetuan Hub'),
          }),
        ],
      });
    });

    it('schedules future shift reminder 15 minutes before startsAt', async () => {
      const fakeNow = new Date('2026-10-26T07:00:00');
      const ok = await scheduleShiftReminder(
        {
          shiftDate: '2026-10-26',
          startsAt: '08:00',
          hubName: 'Downtown Hub',
        },
        fakeNow
      );
      expect(ok).toBe(true);
      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
            title: 'Upcoming Shift in 15 Minutes',
            body: expect.stringContaining('Downtown Hub'),
          }),
        ],
      });
    });

    it('ignores shift reminder if shift has already passed', async () => {
      const pastNow = new Date('2026-10-26T09:00:00');
      const ok = await scheduleShiftReminder(
        {
          shiftDate: '2026-10-26',
          startsAt: '08:00',
        },
        pastNow
      );
      expect(ok).toBe(false);
      expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    });

    it('notifies sync complete when flushedCount > 0', async () => {
      const ok = await notifySyncComplete(3);
      expect(ok).toBe(true);
      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            id: 3001,
            channelId: NOTIFICATION_CHANNELS.GENERAL,
            title: 'Offline Records Synchronized',
            body: expect.stringContaining('3 pending attendance / GPS records have been synchronized'),
          }),
        ],
      });
    });

    it('routes high priority incoming system alert to operational channel', async () => {
      const ok = await notifyIncomingSystemAlert({
        title: 'Emergency Notice',
        message: 'Severe weather advisory for Zone B',
        priority: 'urgent',
      });
      expect(ok).toBe(true);
      expect(LocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: [
          expect.objectContaining({
            channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
            title: 'Emergency Notice',
            body: 'Severe weather advisory for Zone B',
          }),
        ],
      });
    });
  });
});
