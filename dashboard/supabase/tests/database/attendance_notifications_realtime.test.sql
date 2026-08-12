begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_logs'),
  1,
  'attendance logs are published exactly once for Realtime'
);
select is(
  (select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'),
  1,
  'notifications are published exactly once for Realtime'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'notifications' and roles @> array['public']::name[]),
  0,
  'notification policies never execute for anonymous PUBLIC subscribers'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'notifications' and roles = array['authenticated']::name[] and cmd = 'SELECT'),
  1,
  'authenticated notification reads retain recipient and role targeting'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'notifications' and roles = array['authenticated']::name[] and cmd = 'UPDATE'),
  1,
  'authenticated notification read-state updates retain recipient and role targeting'
);
select ok(
  not has_table_privilege('anon', 'public.notifications', 'SELECT'),
  'anonymous clients cannot read notifications'
);
select ok(
  not has_table_privilege('anon', 'public.notifications', 'INSERT'),
  'anonymous clients cannot create notifications'
);
select ok(
  has_table_privilege('authenticated', 'public.notifications', 'SELECT,INSERT,UPDATE'),
  'authenticated application paths retain required notification privileges'
);
select ok(
  not has_function_privilege('anon', 'public.get_my_role()', 'EXECUTE'),
  'the role helper remains unavailable to anonymous callers'
);

select * from finish();
rollback;
