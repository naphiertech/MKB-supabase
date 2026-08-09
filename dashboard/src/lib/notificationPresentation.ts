import type { NotificationPreferences } from '../services/notificationPreferenceService';
import type { NotificationRecord, UserRole } from '../services/notificationService';

export type ConfigurableNotificationPreference = Exclude<
  keyof NotificationPreferences,
  'toast_enabled' | 'sound_enabled'
>;

const ROLE_PREFERENCES: Record<UserRole, ConfigurableNotificationPreference[]> = {
  admin: ['violation_alerts', 'attendance_alerts', 'payroll_updates', 'support_ticket_updates', 'system_updates'],
  hr: ['violation_alerts', 'attendance_alerts', 'support_ticket_updates', 'system_updates'],
  payroll: ['payroll_updates', 'support_ticket_updates', 'system_updates'],
  rider: ['support_ticket_updates', 'system_updates'],
};

export function getConfigurablePreferenceKeys(role: UserRole): ConfigurableNotificationPreference[] {
  return [...ROLE_PREFERENCES[role]];
}

function preferenceForNotification(notification: NotificationRecord): ConfigurableNotificationPreference {
  if (notification.metadata?.source === 'support_ticket') return 'support_ticket_updates';

  switch (notification.category) {
    case 'geofence':
      return 'violation_alerts';
    case 'attendance':
      return 'attendance_alerts';
    case 'payroll':
      return 'payroll_updates';
    case 'biometrics':
    case 'announcement':
    case 'system':
    case 'account':
      return 'system_updates';
    default:
      if (notification.type === 'violation') return 'violation_alerts';
      if (notification.type === 'attendance' || notification.type === 'absent') return 'attendance_alerts';
      return 'system_updates';
  }
}

export function getNotificationPresentation(
  notification: NotificationRecord,
  preferences: NotificationPreferences,
): { showToast: boolean; playSound: boolean; mandatory: boolean } {
  const mandatory = notification.category === 'account' || notification.priority === 'critical';
  const categoryEnabled = mandatory || preferences[preferenceForNotification(notification)];
  return {
    showToast: mandatory || (preferences.toast_enabled && categoryEnabled),
    playSound: preferences.sound_enabled && categoryEnabled,
    mandatory,
  };
}
