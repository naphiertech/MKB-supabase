import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getNotificationsForUser,
  archiveNotificationsBulk,
  trashNotificationsBulk,
  restoreNotificationsBulk,
  deleteNotificationsPermanentlyBulk,
  emptyTrashNotifications,
  calculateTrashDaysRemaining,
  isExpiredTrash
} from './notificationService';
import { supabase } from '../../lib/supabaseClient';

vi.mock('../../lib/supabaseClient', () => {
  const fromMock = vi.fn();
  const rpcMock = vi.fn();
  return {
    supabase: {
      from: fromMock,
      rpc: rpcMock
    }
  };
});

describe('notificationService lifecycle and retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retention math', () => {
    it('calculates remaining days accurately for trashed items', () => {
      const now = new Date();
      // Deleted 5 days ago -> 25 days remaining
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateTrashDaysRemaining(fiveDaysAgo, now)).toBe(25);

      // Deleted 29 days ago -> 1 day remaining
      const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateTrashDaysRemaining(twentyNineDaysAgo, now)).toBe(1);

      // Deleted 31 days ago -> 0 days remaining (expired)
      const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
      expect(calculateTrashDaysRemaining(thirtyOneDaysAgo, now)).toBe(0);
      expect(isExpiredTrash(thirtyOneDaysAgo, now)).toBe(true);
    });

    it('returns null/false when item is not trashed (deleted_at is null)', () => {
      expect(calculateTrashDaysRemaining(null)).toBeNull();
      expect(isExpiredTrash(null)).toBe(false);
    });
  });

  describe('tab filtering logic', () => {
    it('queries active notifications for "all" tab excluding trashed and archived items', async () => {
      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
      };
      mockQuery.contains.mockResolvedValue({ data: [], error: null });
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await getNotificationsForUser({
        userRole: 'admin',
        tab: 'all'
      });

      expect(mockQuery.is).toHaveBeenCalledWith('deleted_at', null);
      expect(mockQuery.is).toHaveBeenCalledWith('archived_at', null);
    });

    it('queries trashed notifications excluding items past 30 days', async () => {
      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
      };
      mockQuery.contains.mockResolvedValue({ data: [], error: null });
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await getNotificationsForUser({
        userRole: 'admin',
        tab: 'trash'
      });

      expect(mockQuery.not).toHaveBeenCalledWith('deleted_at', 'is', null);
      expect(mockQuery.gte).toHaveBeenCalled();
    });
  });

  describe('bulk actions', () => {
    it('soft-deletes notifications by setting deleted_at timestamp', async () => {
      const mockQuery: any = {
        update: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await trashNotificationsBulk(['notif-1', 'notif-2']);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          deleted_at: expect.any(String)
        })
      );
      expect(mockQuery.in).toHaveBeenCalledWith('id', ['notif-1', 'notif-2']);
    });

    it('restores soft-deleted notifications by clearing deleted_at', async () => {
      const mockQuery: any = {
        update: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await restoreNotificationsBulk(['notif-1']);

      expect(mockQuery.update).toHaveBeenCalledWith({ deleted_at: null });
      expect(mockQuery.in).toHaveBeenCalledWith('id', ['notif-1']);
    });

    it('archives notifications by setting archived_at timestamp', async () => {
      const mockQuery: any = {
        update: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await archiveNotificationsBulk(['notif-1'], true);

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          archived_at: expect.any(String)
        })
      );
    });

    it('permanently deletes notifications from database', async () => {
      const mockQuery: any = {
        delete: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ error: null })
      };
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await deleteNotificationsPermanentlyBulk(['notif-1', 'notif-2']);

      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.in).toHaveBeenCalledWith('id', ['notif-1', 'notif-2']);
    });

    it('empties trash by calling purge RPC or deleting items with non-null deleted_at', async () => {
      const mockQuery: any = {
        delete: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        contains: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis()
      };
      mockQuery.contains.mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue(mockQuery);

      await emptyTrashNotifications('admin');

      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.not).toHaveBeenCalledWith('deleted_at', 'is', null);
    });
  });
});
