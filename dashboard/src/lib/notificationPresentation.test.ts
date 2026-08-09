import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../services/notificationPreferenceService';
import type { NotificationRecord } from '../services/notificationService';
import {
  getConfigurablePreferenceKeys,
  getNotificationPresentation,
} from './notificationPresentation';

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
  target_roles: ['admin', 'hr'],
  created_at: '2026-08-09T12:00:00Z',
};

describe('notification presentation policy', () => {
  it('presents normal notifications with default preferences', () => {
    expect(getNotificationPresentation(notification, DEFAULT_NOTIFICATION_PREFERENCES)).toEqual({ showToast: true, playSound: true, mandatory: false });
  });

  it('suppresses toast and sound independently', () => {
    expect(getNotificationPresentation(notification, { ...DEFAULT_NOTIFICATION_PREFERENCES, toast_enabled: false })).toMatchObject({ showToast: false, playSound: true });
    expect(getNotificationPresentation(notification, { ...DEFAULT_NOTIFICATION_PREFERENCES, sound_enabled: false })).toMatchObject({ showToast: true, playSound: false });
  });

  it('suppresses both ephemeral presentations when the structured category is disabled', () => {
    expect(getNotificationPresentation(notification, { ...DEFAULT_NOTIFICATION_PREFERENCES, violation_alerts: false })).toMatchObject({ showToast: false, playSound: false });
  });

  it('uses support-ticket metadata instead of treating support updates as generic system updates', () => {
    const support = { ...notification, category: 'system' as const, type: 'system' as const, metadata: { source: 'support_ticket' } };
    expect(getNotificationPresentation(support, { ...DEFAULT_NOTIFICATION_PREFERENCES, support_ticket_updates: false })).toMatchObject({ showToast: false, playSound: false });
    expect(getNotificationPresentation(support, { ...DEFAULT_NOTIFICATION_PREFERENCES, system_updates: false })).toMatchObject({ showToast: true, playSound: true });
  });

  it('keeps account and critical toasts mandatory without overriding the sound preference', () => {
    const account = { ...notification, category: 'account' as const, type: 'system' as const };
    const critical = { ...notification, priority: 'critical' as const };
    const disabled = { ...DEFAULT_NOTIFICATION_PREFERENCES, toast_enabled: false, sound_enabled: false, system_updates: false };
    expect(getNotificationPresentation(account, disabled)).toEqual({ showToast: true, playSound: false, mandatory: true });
    expect(getNotificationPresentation(critical, { ...disabled, violation_alerts: false })).toEqual({ showToast: true, playSound: false, mandatory: true });
  });

  it('returns only categories relevant to each existing role', () => {
    expect(getConfigurablePreferenceKeys('admin')).toEqual(['violation_alerts', 'attendance_alerts', 'payroll_updates', 'support_ticket_updates', 'system_updates']);
    expect(getConfigurablePreferenceKeys('hr')).toEqual(['violation_alerts', 'attendance_alerts', 'support_ticket_updates', 'system_updates']);
    expect(getConfigurablePreferenceKeys('payroll')).toEqual(['payroll_updates', 'support_ticket_updates', 'system_updates']);
    expect(getConfigurablePreferenceKeys('rider')).toEqual(['support_ticket_updates', 'system_updates']);
  });
});
