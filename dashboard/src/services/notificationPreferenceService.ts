import { supabase } from '../lib/supabaseClient';
import type { Database } from '../types/supabase';

export type NotificationPreferenceRecord = Database['public']['Tables']['user_notification_preferences']['Row'];
export type NotificationPreferences = Pick<
  NotificationPreferenceRecord,
  | 'toast_enabled'
  | 'sound_enabled'
  | 'violation_alerts'
  | 'attendance_alerts'
  | 'payroll_updates'
  | 'support_ticket_updates'
  | 'system_updates'
>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  toast_enabled: true,
  sound_enabled: true,
  violation_alerts: true,
  attendance_alerts: true,
  payroll_updates: true,
  support_ticket_updates: true,
  system_updates: true,
};

export const LEGACY_NOTIFICATION_PREFERENCE_KEYS = [
  'notif_boundary',
  'notif_attendance',
  'notif_reports',
  'notif_sound',
  'notif_push',
] as const;

export interface NotificationPreferenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

function storedBoolean(storage: NotificationPreferenceStorage, key: string): boolean | undefined {
  const value = storage.getItem(key);
  if (value === null) return undefined;
  return value !== 'false';
}

export function readLegacyNotificationPreferences(
  userId: string,
  storage: NotificationPreferenceStorage,
): Partial<NotificationPreferences> {
  const migrated: Partial<NotificationPreferences> = {};
  const violationAlerts = storedBoolean(storage, `notif_boundary_${userId}`);
  const attendanceAlerts = storedBoolean(storage, `notif_attendance_${userId}`);
  const soundEnabled = storedBoolean(storage, `notif_sound_${userId}`);
  const toastEnabled = storedBoolean(storage, `notif_push_${userId}`);

  if (violationAlerts !== undefined) migrated.violation_alerts = violationAlerts;
  if (attendanceAlerts !== undefined) migrated.attendance_alerts = attendanceAlerts;
  if (soundEnabled !== undefined) migrated.sound_enabled = soundEnabled;
  if (toastEnabled !== undefined) migrated.toast_enabled = toastEnabled;
  return migrated;
}

function clearLegacyNotificationPreferences(
  userId: string,
  storage?: NotificationPreferenceStorage,
): void {
  if (!storage) return;
  LEGACY_NOTIFICATION_PREFERENCE_KEYS.forEach((key) => storage.removeItem(`${key}_${userId}`));
}

async function selectNotificationPreferences(userId: string): Promise<NotificationPreferenceRecord | null> {
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadNotificationPreferences(
  userId: string,
  storage?: NotificationPreferenceStorage,
): Promise<NotificationPreferenceRecord> {
  const existing = await selectNotificationPreferences(userId);
  if (existing) {
    clearLegacyNotificationPreferences(userId, storage);
    return existing;
  }

  const legacy = storage ? readLegacyNotificationPreferences(userId, storage) : {};
  const payload = { user_id: userId, ...DEFAULT_NOTIFICATION_PREFERENCES, ...legacy };
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .insert(payload)
    .select('*')
    .single();

  if (!error) {
    clearLegacyNotificationPreferences(userId, storage);
    return data;
  }
  if (error.code !== '23505') throw error;

  const recovered = await selectNotificationPreferences(userId);
  if (!recovered) throw error;
  clearLegacyNotificationPreferences(userId, storage);
  return recovered;
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferenceRecord> {
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .upsert({ user_id: userId, ...preferences }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
