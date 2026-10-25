import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const NOTIFICATION_CHANNELS = {
  OPERATIONAL: 'operational-alerts',
  GENERAL: 'general-updates',
} as const;

export interface ShiftReminderPayload {
  shiftId?: string;
  shiftDate: string;
  startsAt: string;
  hubName?: string;
}

export interface GeofenceWarningPayload {
  zoneName: string;
  distanceMeters?: number;
}

export interface AttendanceNotificationPayload {
  type: 'time-in' | 'time-out';
  timestamp?: string;
}

export interface SystemAlertPayload {
  title: string;
  message: string;
  priority?: string;
}

let channelsInitialized = false;

function isNative(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Ensures notification channels and permissions are registered on the native Android/iOS device.
 */
export async function initNativeNotifications(): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') {
        return false;
      }
    }

    if (!channelsInitialized) {
      await Promise.all([
        LocalNotifications.createChannel({
          id: NOTIFICATION_CHANNELS.OPERATIONAL,
          name: 'Operational Alerts',
          description: 'Attendance clock-ins, shift reminders, and geofence boundary warnings.',
          importance: 5, // High: heads-up banner + sound + vibration
          visibility: 1,
          vibration: true,
        }),
        LocalNotifications.createChannel({
          id: NOTIFICATION_CHANNELS.GENERAL,
          name: 'General Updates',
          description: 'Sync status, payroll payouts, and system notices.',
          importance: 4, // Default: sound + notification drawer
          visibility: 1,
          vibration: true,
        }),
      ]);
      channelsInitialized = true;
    }

    return true;
  } catch (err) {
    console.warn('[NativeNotifications] Initialization failed:', err);
    return false;
  }
}

/**
 * Triggers a phone notification when rider records Time-In or Time-Out.
 */
export async function notifyAttendanceEvent({
  type,
  timestamp,
}: AttendanceNotificationPayload): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const isTimeIn = type === 'time-in';
    const timeLabel = timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: isTimeIn ? 1001 : 1002,
          channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
          title: isTimeIn ? 'Attendance Confirmed: Time-In' : 'Attendance Confirmed: Time-Out',
          body: isTimeIn
            ? `Your Time-In was logged at ${timeLabel}. Have a safe delivery run!`
            : `Your Time-Out was logged at ${timeLabel}. Rest well!`,
          smallIcon: 'ic_stat_icon',
          iconColor: '#b85a00',
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[NativeNotifications] Failed to trigger attendance notification:', err);
    return false;
  }
}

/**
 * Triggers an immediate heads-up phone alert when a rider leaves their designated hub/zone during active shift.
 */
export async function notifyGeofenceWarning({
  zoneName,
  distanceMeters,
}: GeofenceWarningPayload): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const distanceSuffix = distanceMeters && distanceMeters > 0 ? ` by ${Math.round(distanceMeters)}m` : '';
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 2001,
          channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
          title: 'Geofence Boundary Alert',
          body: `You are outside your assigned zone (${zoneName})${distanceSuffix}. Please return to your operational boundary.`,
          smallIcon: 'ic_stat_icon',
          iconColor: '#b85a00',
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[NativeNotifications] Failed to trigger geofence warning:', err);
    return false;
  }
}

/**
 * Schedules a notification 15 minutes prior to shift start, or triggers immediately if shift is imminent.
 */
export async function scheduleShiftReminder(
  payload: ShiftReminderPayload,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const shiftStartTime = new Date(`${payload.shiftDate}T${payload.startsAt}:00`);
    if (isNaN(shiftStartTime.getTime())) return false;

    const reminderTime = new Date(shiftStartTime.getTime() - 15 * 60 * 1000);

    // If shift is already past, don't schedule
    if (shiftStartTime.getTime() <= now.getTime()) {
      return false;
    }

    const scheduledAt = reminderTime.getTime() > now.getTime() ? reminderTime : new Date(now.getTime() + 1000);
    const notificationId = Math.abs(
      (payload.shiftDate + payload.startsAt).split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    ) % 1000000 + 10000;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId,
          channelId: NOTIFICATION_CHANNELS.OPERATIONAL,
          title: 'Upcoming Shift in 15 Minutes',
          body: `Shift starts at ${payload.startsAt}${payload.hubName ? ` (${payload.hubName})` : ''}. Head to your hub geofence to Time-In.`,
          schedule: { at: scheduledAt },
          smallIcon: 'ic_stat_icon',
          iconColor: '#b85a00',
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[NativeNotifications] Failed to schedule shift reminder:', err);
    return false;
  }
}

/**
 * Triggers a phone notification when offline queue flushes records to the server.
 */
export async function notifySyncComplete(flushedCount: number): Promise<boolean> {
  if (!isNative() || flushedCount <= 0) return false;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 3001,
          channelId: NOTIFICATION_CHANNELS.GENERAL,
          title: 'Offline Records Synchronized',
          body: `${flushedCount} pending attendance / GPS record${flushedCount > 1 ? 's have' : ' has'} been synchronized to the cloud.`,
          smallIcon: 'ic_stat_icon',
          iconColor: '#b85a00',
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[NativeNotifications] Failed to notify sync complete:', err);
    return false;
  }
}

/**
 * Triggers a phone notification for incoming realtime alerts (payouts, admin messages, announcements).
 */
export async function notifyIncomingSystemAlert({
  title,
  message,
  priority,
}: SystemAlertPayload): Promise<boolean> {
  if (!isNative()) return false;

  try {
    const isHigh = priority === 'urgent' || priority === 'high';
    const alertId = Math.floor(Math.random() * 900000) + 100000;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: alertId,
          channelId: isHigh ? NOTIFICATION_CHANNELS.OPERATIONAL : NOTIFICATION_CHANNELS.GENERAL,
          title: title || 'MKB Alert',
          body: message,
          smallIcon: 'ic_stat_icon',
          iconColor: '#b85a00',
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[NativeNotifications] Failed to trigger incoming system alert:', err);
    return false;
  }
}
