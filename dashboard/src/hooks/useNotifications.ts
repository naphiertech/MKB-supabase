import { useCallback, useMemo, useState } from 'react';

export type NotificationType = 'violation' | 'absent' | 'attendance' | 'system';

export interface Notification {
  id: number;
  type: NotificationType;
  message: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
{
  id: 1,
  type: 'violation',
  message: 'Andres Bonifacio exited Tumaga geofence',
  time: 'just now',
  read: false
},
{
  id: 2,
  type: 'violation',
  message: 'Rosa Villanueva exited Calarian geofence',
  time: '3 min ago',
  read: false
},
{
  id: 3,
  type: 'absent',
  message: '10 riders have no time-in recorded today',
  time: '6:00 AM',
  read: true
},
{
  id: 4,
  type: 'attendance',
  message: 'Juan dela Cruz timed in at 07:02 AM',
  time: '07:02 AM',
  read: true
},
{
  id: 5,
  type: 'system',
  message: 'Geofence system online · 1.8s tick active',
  time: 'yesterday',
  read: true
}];


export function useNotifications(allowedTypes?: NotificationType[]) {
  const [notifications, setNotifications] = useState<Notification[]>(
    INITIAL_NOTIFICATIONS
  );

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

  const markAsRead = useCallback((id: number) => {
    setNotifications((prev) =>
    prev.map((n) => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
    prev.map((n) =>
    allowedTypes && !allowedTypes.includes(n.type) ?
    n :
    { ...n, read: true }
    )
    );
  }, [allowedTypes]);

  return {
    notifications: visible,
    unreadCount,
    markAsRead,
    markAllAsRead
  };
}