-- Migration: Add archived_at and deleted_at to notifications with 30-day auto-purge support
-- Timestamp: 20261025130000

-- 1. Add columns to notifications table if they do not exist
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Indexes for efficient status filtering and soft-delete/auto-purge queries
CREATE INDEX IF NOT EXISTS idx_notifications_deleted_at
ON public.notifications (deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_archived_at
ON public.notifications (archived_at)
WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_active_feed
ON public.notifications (created_at DESC)
WHERE deleted_at IS NULL;

-- 3. Stored Procedure / RPC for 30-day permanent trash auto-purge
CREATE OR REPLACE FUNCTION public.purge_expired_trash_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM public.notifications
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- Grant execution to authenticated service and staff roles
GRANT EXECUTE ON FUNCTION public.purge_expired_trash_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_trash_notifications() TO service_role;

-- 4. Enable pg_cron job if pg_cron extension is available
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'purge-expired-trash-notifications',
      '0 3 * * *', -- Run daily at 03:00 UTC
      'SELECT public.purge_expired_trash_notifications();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not enabled or permission denied; relying on on-demand purge RPC.';
END $$;
