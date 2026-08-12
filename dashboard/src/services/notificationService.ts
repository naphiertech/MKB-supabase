import { supabase } from '../lib/supabaseClient';
import type { Database } from '../types/supabase';
import { getSelectedHubId } from '../lib/hubWorkspaceState';

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
  hub_id?: string | null;
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
 * Queries notifications targeting a specific user or user role.
 */
export async function getNotificationsForUser(options: {
  userId?: string;
  userRole: UserRole;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationRecord[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(options.limit || 50);

  if (options.unreadOnly) {
    query = query.eq('read', false);
  }

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
