-- The dashboard consumes Postgres Changes for both notification refresh and
-- Admin/HR attendance invalidation. Add each table once without replacing any
-- other publication membership.
do $migration$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Required Realtime publication supabase_realtime is missing.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance_logs'
  ) then
    alter publication supabase_realtime add table public.attendance_logs;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$migration$;
