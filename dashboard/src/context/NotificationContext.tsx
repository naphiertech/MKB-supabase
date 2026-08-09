import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { pushToast, type ToastTone } from '../hooks/useToast';
import { getNotificationPresentation } from '../lib/notificationPresentation';
import { playNotificationSound } from '../lib/notificationSound';
import {
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type NotificationRecord,
  type UserRole,
  type NotificationPriority
} from '../services/notificationService';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  updateNotificationPreferences as persistNotificationPreferences,
  type NotificationPreferences,
} from '../services/notificationPreferenceService';

interface NotificationContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  loading: boolean;
  notificationPreferences: NotificationPreferences;
  notificationPreferencesLoading: boolean;
  notificationPreferencesError: string | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  saveNotificationPreferences: (preferences: NotificationPreferences) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

/**
 * Maps notification priority to visual toast tone and duration.
 */
function getPriorityToastConfig(priority?: NotificationPriority): { tone: ToastTone; duration: number } {
  switch (priority) {
    case 'critical':
      return { tone: 'error', duration: 10000 };
    case 'high':
      return { tone: 'warning', duration: 6000 };
    case 'medium':
      return { tone: 'info', duration: 4000 };
    case 'low':
      return { tone: 'default', duration: 2500 };
    default:
      return { tone: 'info', duration: 4000 };
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(true);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState<string | null>(null);
  const { session } = useAuth();

  const userRole = (session?.role as UserRole) || null;
  const userId = session?.id || null;

  // Refs for subscription lifecycle & toast duplicate suppression
  const isInitialLoadRef = useRef<boolean>(true);
  const seenToastIdsRef = useRef<Set<string>>(new Set());
  const notificationPreferencesRef = useRef<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const notificationPreferencesReadyRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      notificationPreferencesRef.current = DEFAULT_NOTIFICATION_PREFERENCES;
      notificationPreferencesReadyRef.current = false;
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      setNotificationPreferencesLoading(false);
      setNotificationPreferencesError(null);
      return;
    }

    let isMounted = true;
    notificationPreferencesReadyRef.current = false;
    setNotificationPreferencesLoading(true);
    setNotificationPreferencesError(null);

    void loadNotificationPreferences(
      userId,
      typeof window !== 'undefined' ? window.localStorage : undefined,
    ).then((record) => {
      if (!isMounted) return;
      const loaded: NotificationPreferences = {
        toast_enabled: record.toast_enabled,
        sound_enabled: record.sound_enabled,
        violation_alerts: record.violation_alerts,
        attendance_alerts: record.attendance_alerts,
        payroll_updates: record.payroll_updates,
        support_ticket_updates: record.support_ticket_updates,
        system_updates: record.system_updates,
      };
      notificationPreferencesRef.current = loaded;
      setNotificationPreferences(loaded);
    }).catch((error: unknown) => {
      if (!isMounted) return;
      notificationPreferencesRef.current = DEFAULT_NOTIFICATION_PREFERENCES;
      setNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      setNotificationPreferencesError(error instanceof Error ? error.message : 'Unable to load notification preferences.');
    }).finally(() => {
      if (!isMounted) return;
      notificationPreferencesReadyRef.current = true;
      setNotificationPreferencesLoading(false);
    });

    return () => { isMounted = false; };
  }, [userId]);

  // Refresh notifications list from Supabase
  const refreshNotifications = useCallback(async () => {
    if (!userRole) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const data = await getNotificationsForUser({
        userId: userId || undefined,
        userRole,
        limit: 100
      });
      setNotifications(data);
    } catch (err) {
      console.warn('[NotificationContext] Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userId]);

  // Initial load & Single Supabase Realtime channel subscription
  useEffect(() => {
    if (!userRole) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    isInitialLoadRef.current = true;

    // Load initial 100 notifications
    async function initLoad() {
      try {
        const data = await getNotificationsForUser({
          userId: userId || undefined,
          userRole,
          limit: 100
        });
        if (isMounted) {
          setNotifications(data);
          // Mark initial items as seen to suppress toasts
          data.forEach(item => seenToastIdsRef.current.add(item.id));
        }
      } catch (err) {
        console.warn('[NotificationContext] Initial load failed:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    }

    initLoad();

    // Initialize SINGLE Realtime channel subscription for the application lifetime
    const channelName = `realtime-global-notifications-${userId || userRole}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newRow = payload.new as NotificationRecord;

          // Check if payload targets current user directly OR matches user role
          const isDirectTarget = userId && newRow.recipient_id === userId;
          const isRoleTarget = !newRow.recipient_id && newRow.target_roles?.includes(userRole);

          if (isDirectTarget || isRoleTarget) {
            setNotifications(prev => {
              if (prev.some(n => n.id === newRow.id)) return prev;
              return [newRow, ...prev].slice(0, 100);
            });

            // Presentation preferences never remove the persisted Notification Center row.
            if (!isInitialLoadRef.current && !seenToastIdsRef.current.has(newRow.id)) {
              seenToastIdsRef.current.add(newRow.id);
              if (notificationPreferencesReadyRef.current) {
                const presentation = getNotificationPresentation(newRow, notificationPreferencesRef.current);
                if (presentation.showToast) {
                  const toastConfig = getPriorityToastConfig(newRow.priority);
                  pushToast({
                    title: newRow.title || 'System Alert',
                    description: newRow.message,
                    tone: toastConfig.tone,
                    duration: toastConfig.duration
                  });
                }
                if (presentation.playSound) void playNotificationSound();
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          const updatedRow = payload.new as NotificationRecord;
          const isDirectTarget = userId && updatedRow.recipient_id === userId;
          const isRoleTarget = !updatedRow.recipient_id && updatedRow.target_roles?.includes(userRole);

          if (isDirectTarget || isRoleTarget) {
            setNotifications(prev =>
              prev.map(n => (n.id === updatedRow.id ? { ...n, ...updatedRow } : n))
            );
          }
        }
      )
      .subscribe();

    // Clean up channel subscription on unmount or user switch
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userRole, userId]);

  // Mark single notification read
  const handleMarkAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
    try {
      await markNotificationAsRead(id);
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark read:', err);
    }
  }, []);

  // Mark all notifications read
  const handleMarkAllAsRead = useCallback(async () => {
    if (!userRole) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await markAllNotificationsAsRead(userRole, userId || undefined);
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark all read:', err);
    }
  }, [userRole, userId]);

  const saveNotificationPreferences = useCallback(async (preferences: NotificationPreferences) => {
    if (!userId) throw new Error('Sign in to save notification preferences.');
    const record = await persistNotificationPreferences(userId, preferences);
    const saved: NotificationPreferences = {
      toast_enabled: record.toast_enabled,
      sound_enabled: record.sound_enabled,
      violation_alerts: record.violation_alerts,
      attendance_alerts: record.attendance_alerts,
      payroll_updates: record.payroll_updates,
      support_ticket_updates: record.support_ticket_updates,
      system_updates: record.system_updates,
    };
    notificationPreferencesRef.current = saved;
    notificationPreferencesReadyRef.current = true;
    setNotificationPreferences(saved);
    setNotificationPreferencesError(null);
  }, [userId]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      notificationPreferences,
      notificationPreferencesLoading,
      notificationPreferencesError,
      markAsRead: handleMarkAsRead,
      markAllAsRead: handleMarkAllAsRead,
      refreshNotifications,
      saveNotificationPreferences,
    }),
    [notifications, unreadCount, loading, notificationPreferences, notificationPreferencesLoading, notificationPreferencesError, handleMarkAsRead, handleMarkAllAsRead, refreshNotifications, saveNotificationPreferences]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotificationContext(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}
