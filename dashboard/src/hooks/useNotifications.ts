import { useCallback, useMemo, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './useAuth';

export type NotificationType = 'violation' | 'absent' | 'attendance' | 'system';

export interface Notification {
  id: string | number;
  type: NotificationType;
  message: string;
  time: string;
  read: boolean;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string | null;
  message: string;
  created_at: string;
  read: boolean;
  target_roles: string[];
}

// Friendly timestamp formatter for real-time notifications
function formatTimeAgo(dateStr: string): string {
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

const mapNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  type: row.type as NotificationType,
  message: row.title ? `${row.title} · ${row.message}` : row.message,
  time: formatTimeAgo(row.created_at),
  read: row.read
});

export function useNotifications(allowedTypes?: NotificationType[]) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { session } = useAuth();
  const userRole = session?.role;

  useEffect(() => {
    if (!userRole) {
      setNotifications([]);
      return;
    }

    let active = true;

    // Load initial notifications filtered by target_roles matching current user's role
    async function loadNotifications() {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .contains('target_roles', [userRole])
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) {
          console.error('Error fetching notifications:', error);
          return;
        }

        if (active && data) {
          setNotifications(data.map(mapNotification));
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    }

    loadNotifications();

    // Subscribe to new notifications pushed via Supabase Realtime
    const channel = supabase
      .channel('realtime-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const targetRoles = payload.new.target_roles || [];
          if (targetRoles.includes(userRole)) {
            const mapped = mapNotification(payload.new as unknown as NotificationRow);
            setNotifications((prev) => {
              // Avoid duplicates
              if (prev.some((n) => n.id === mapped.id)) return prev;
              return [mapped, ...prev].slice(0, 100);
            });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userRole]);

  const visible = useMemo(
    () =>
      allowedTypes ?
        notifications.filter((n) => allowedTypes.includes(n.type)) :
        notifications,
    [notifications, allowedTypes]
  );

  const unreadCount = useMemo(
    () => visible.filter((n) => !n.read).length,
    [visible]
  );

  const markAsRead = useCallback(async (id: Notification['id']) => {
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, read: true } : n)
    );

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    if (error) {
      console.error('Error marking notification read in Supabase:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userRole) return;

    setNotifications((prev) =>
      prev.map((n) =>
        allowedTypes && !allowedTypes.includes(n.type) ? n : { ...n, read: true }
      )
    );

    let query = supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false)
      .contains('target_roles', [userRole]);

    if (allowedTypes && allowedTypes.length > 0) {
      query = query.in('type', allowedTypes);
    }

    const { error } = await query;
    if (error) {
      console.error('Error marking all notifications read in Supabase:', error);
    }
  }, [userRole, allowedTypes]);

  return {
    notifications: visible,
    unreadCount,
    markAsRead,
    markAllAsRead
  };
}
