import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/supabase';
import { getSelectedHubId } from '../../lib/hubWorkspaceState';

export type UserRole = Database['public']['Enums']['user_role'];
export type NotificationType = Database['public']['Enums']['notification_type'];
export type NotificationCategory = Database['public']['Enums']['notification_category'];
export type NotificationPriority = Database['public']['Enums']['notification_priority'];

export interface NotificationRecord {
  id: string;
  sender_id: string | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  type: NotificationType;
  title: string;
  message: string;
  recipient_id: string | null;
  rider_id: string | null;
  violation_id: string | null;
  action_link: string | null;
  metadata: Record<string, unknown> | null;
  read: boolean;
  target_roles: UserRole[];
  created_at: string;
  archived_at?: string | null;
  deleted_at?: string | null;
  hub_id?: string | null;
}

export type NotificationStatusTab = "all" | "unread" | "read" | "archived" | "trash" | "any";

export const TRASH_RETENTION_DAYS = 30;

/**
 * Calculates remaining days before a trashed item is permanently purged.
 * Returns null if the item is not trashed.
 */
export function calculateTrashDaysRemaining(deletedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!deletedAt) return null;
  const deletedTime = new Date(deletedAt).getTime();
  if (isNaN(deletedTime)) return null;
  const msElapsed = now.getTime() - deletedTime;
  const daysElapsed = msElapsed / (24 * 60 * 60 * 1000);
  const daysRemaining = Math.ceil(TRASH_RETENTION_DAYS - daysElapsed);
  return Math.max(0, daysRemaining);
}

/**
 * Checks if a trashed item is older than the retention limit (30 days).
 */
export function isExpiredTrash(deletedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!deletedAt) return false;
  const deletedTime = new Date(deletedAt).getTime();
  if (isNaN(deletedTime)) return false;
  const msElapsed = now.getTime() - deletedTime;
  return msElapsed >= TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

export interface NotificationRow {
  id: string;
  sender_id?: string | null;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  type: string;
  title: string;
  message: string;
  recipient_id?: string | null;
  rider_id: string | null;
  violation_id: string | null;
  action_link?: string | null;
  metadata?: Record<string, unknown> | null;
  read: boolean;
  target_roles: string[];
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateNotificationPayload {
  senderId?: string | null;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  type?: NotificationType;
  title: string;
  message: string;
  recipientId?: string | null;
  riderId?: string | null;
  violationId?: string | null;
  actionLink?: string | null;
  metadata?: Record<string, unknown> | null;
  targetRoles?: UserRole[];
}

/**
 * Dispatch notification to Supabase database.
 * Throws exception on database network or authorization error.
 */
export async function dispatchNotification(payload: CreateNotificationPayload): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    sender_id: payload.senderId || null,
    category: payload.category || 'system',
    priority: payload.priority || 'medium',
    type: payload.type || 'system',
    title: payload.title,
    message: payload.message,
    recipient_id: payload.recipientId || null,
    rider_id: payload.riderId || null,
    violation_id: payload.violationId || null,
    action_link: payload.actionLink || null,
    metadata: (payload.metadata as Database['public']['Tables']['notifications']['Insert']['metadata']) || null,
    read: false,
    target_roles: payload.targetRoles || (['admin', 'hr', 'payroll', 'rider'] as UserRole[])
  });

  if (error) {
    throw error;
  }
}

/**
 * Fault-isolated non-blocking notification dispatcher.
 * NEVER throws errors or blocks core business workflows (attendance, monitoring, payroll).
 */
export async function dispatchNotificationSafe(payload: CreateNotificationPayload): Promise<boolean> {
  try {
    await dispatchNotification(payload);
    return true;
  } catch (err) {
    console.warn('[NotificationService] Non-blocking dispatch notification failed:', err);
    return false;
  }
}

/**
 * Backward-compatible helper for existing HR and UI components.
 */
export const createNotificationAlert = async (input: {
  type: string;
  title: string;
  message: string;
  riderId: string | null;
  violationId: string | null;
  targetRoles: string[];
  senderId?: string | null;
  actionLink?: string | null;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown> | null;
}): Promise<boolean> => {
  return dispatchNotificationSafe({
    senderId: input.senderId,
    type: (input.type as NotificationType) || 'system',
    category: input.category || (input.type === 'violation' ? 'geofence' : 'system'),
    priority: input.priority || (input.type === 'violation' ? 'high' : 'medium'),
    title: input.title,
    message: input.message,
    riderId: input.riderId,
    violationId: input.violationId,
    actionLink: input.actionLink,
    metadata: input.metadata,
    targetRoles: input.targetRoles as UserRole[]
  });
};

/**
 * Retrieves violation IDs explicitly marked by HR/Admin for follow-up.
 * Automatic incident notifications are intentionally excluded.
 */
export const getFlaggedViolationIds = async (): Promise<Set<string>> => {
  let query = supabase
    .from('notifications')
    .select('violation_id')
    .eq('type', 'violation')
    .contains('metadata', { manual_flag: true })
    .not('violation_id', 'is', null);

  const hubId = getSelectedHubId();
  if (hubId) query = query.or(`hub_id.is.null,hub_id.eq.${hubId}`);
  const { data, error } = await query;

  if (error) throw error;
  return new Set((data ?? []).map((n: { violation_id: string | null }) => n.violation_id).filter((id): id is string => Boolean(id)));
};

/**
 * Queries notifications targeting a specific user or user role with tab and retention awareness.
 */
export async function getNotificationsForUser(options: {
  userId?: string;
  userRole: UserRole;
  limit?: number;
  unreadOnly?: boolean;
  tab?: NotificationStatusTab;
}): Promise<NotificationRecord[]> {
  let query = supabase
    .from('notifications')
    .select('*');

  const tab = options.tab || (options.unreadOnly ? 'unread' : 'all');
  const thirtyDaysAgoIso = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  switch (tab) {
    case 'trash':
      query = query
        .not('deleted_at', 'is', null)
        .gte('deleted_at', thirtyDaysAgoIso)
        .order('deleted_at', { ascending: false });
      break;

    case 'archived':
      query = query
        .is('deleted_at', null)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });
      break;

    case 'unread':
      query = query
        .is('deleted_at', null)
        .is('archived_at', null)
        .eq('read', false)
        .order('created_at', { ascending: false });
      break;

    case 'read':
      query = query
        .is('deleted_at', null)
        .is('archived_at', null)
        .eq('read', true)
        .order('created_at', { ascending: false });
      break;

    case 'any':
      // Fetches all notifications (active, archived, and unexpired trash) for Notification Center full views
      query = query
        .or(`deleted_at.is.null,deleted_at.gte.${thirtyDaysAgoIso}`)
      break;

    case 'all':
    default:
      query = query
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      break;
  }

  query = query.limit(options.limit || 100);

  // Target either direct recipient OR user's role broadcast
  if (options.userId) {
    query = query.or(`recipient_id.eq.${options.userId},and(recipient_id.is.null,target_roles.cs.{${options.userRole}})`);
  } else {
    query = query.contains('target_roles', [options.userRole]);
  }

  const hubId = getSelectedHubId();
  if (hubId) query = query.or(`hub_id.is.null,hub_id.eq.${hubId}`);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []) as NotificationRecord[];
}

/**
 * Marks multiple notifications as read or unread in bulk.
 */
export async function markNotificationsAsReadBulk(ids: string[], read = true): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read })
    .in('id', ids);

  if (error) throw error;
}

/**
 * Archives or unarchives notifications in bulk.
 */
export async function archiveNotificationsBulk(ids: string[], archive = true): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .in('id', ids);

  if (error) throw error;
}

/**
 * Soft-deletes notifications to Trash in bulk (recoverable for 30 days).
 */
export async function trashNotificationsBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids);

  if (error) throw error;
}

/**
 * Restores soft-deleted notifications from Trash back to active feed.
 */
export async function restoreNotificationsBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .update({ deleted_at: null })
    .in('id', ids);

  if (error) throw error;
}

/**
 * Permanently deletes notifications from database.
 */
export async function deleteNotificationsPermanentlyBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .in('id', ids);

  if (error) throw error;
}

/**
 * Empties all soft-deleted notifications for the current scope / user.
 */
export async function emptyTrashNotifications(userRole: UserRole, userId?: string): Promise<void> {
  try {
    const { error: rpcError } = await supabase.rpc('purge_expired_trash_notifications');
    if (!rpcError) {
      // Continue to delete remaining active trash items
    }
  } catch {
    // Fall back to direct delete if RPC is unavailable
  }

  let query = supabase
    .from('notifications')
    .delete()
    .not('deleted_at', 'is', null);

  if (userId) {
    query = query.or(`recipient_id.eq.${userId},and(recipient_id.is.null,target_roles.cs.{${userRole}})`);
  } else {
    query = query.contains('target_roles', [userRole]);
  }

  const hubId = getSelectedHubId();
  if (hubId) query = query.or(`hub_id.is.null,hub_id.eq.${hubId}`);

  const { error } = await query;
  if (error) throw error;
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Marks all notifications matching user or role as read.
 */
export async function markAllNotificationsAsRead(userRole: UserRole, userId?: string): Promise<void> {
  let query = supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false);

  if (userId) {
    query = query.or(`recipient_id.eq.${userId},and(recipient_id.is.null,target_roles.cs.{${userRole}})`);
  } else {
    query = query.contains('target_roles', [userRole]);
  }

  const hubId = getSelectedHubId();
  if (hubId) query = query.or(`hub_id.is.null,hub_id.eq.${hubId}`);

  const { error } = await query;
  if (error) throw error;
}

/**
 * Broadcasts or targets a system announcement notification.
 */
export async function sendAnnouncement(input: {
  senderId?: string | null;
  title: string;
  message: string;
  targetRoles?: UserRole[];
  recipientId?: string | null;
  actionLink?: string | null;
  priority?: NotificationPriority;
}): Promise<boolean> {
  return dispatchNotificationSafe({
    senderId: input.senderId,
    category: 'announcement',
    priority: input.priority || 'medium',
    type: 'system',
    title: input.title,
    message: input.message,
    targetRoles: input.targetRoles || (['admin', 'hr', 'payroll', 'rider'] as UserRole[]),
    recipientId: input.recipientId,
    actionLink: input.actionLink || '/dashboard'
  });
}
