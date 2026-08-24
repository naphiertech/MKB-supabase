import { useMemo, useCallback } from 'react';
import { useNotificationContext } from '../context/NotificationContext';
import type { NotificationRecord } from '../services/notifications/notificationService';

export type NotificationType = 'violation' | 'absent' | 'attendance' | 'system';

export interface Notification {
  id: string | number;
  type: NotificationType;
  message: string;
  time: string;
  read: boolean;
  actionLink?: string | null;
  priority?: string;
  category?: string;
}

// Timestamp formatter
function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return 'just now';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const mapNotification = (record: NotificationRecord): Notification => ({
  id: record.id,
  type: (record.type as NotificationType) || 'system',
  message: record.title ? `${record.title} · ${record.message}` : record.message,
  time: formatTimeAgo(record.created_at),
  read: record.read,
  actionLink: record.action_link,
  priority: record.priority,
  category: record.category
});

export function useNotifications(allowedTypes?: NotificationType[]) {
  const { notifications: rawRecords, markAsRead: ctxMarkAsRead, markAllAsRead: ctxMarkAllAsRead } = useNotificationContext();

  const mapped = useMemo(
    () => rawRecords.map(mapNotification),
    [rawRecords]
  );

  const visible = useMemo(
    () =>
      allowedTypes
        ? mapped.filter((n) => allowedTypes.includes(n.type))
        : mapped,
    [mapped, allowedTypes]
  );

  const unreadCount = useMemo(
    () => visible.filter((n) => !n.read).length,
    [visible]
  );

  const markAsRead = useCallback(
    async (id: Notification['id']) => {
      await ctxMarkAsRead(String(id));
    },
    [ctxMarkAsRead]
  );

  const markAllAsRead = useCallback(
    async () => {
      await ctxMarkAllAsRead();
    },
    [ctxMarkAllAsRead]
  );

  return {
    notifications: visible,
    unreadCount,
    markAsRead,
    markAllAsRead
  };
}
