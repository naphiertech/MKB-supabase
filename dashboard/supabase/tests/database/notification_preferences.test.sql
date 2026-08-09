begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('notification_preferences_test'));
select plan(19);

select has_table('public', 'user_notification_preferences', 'preference table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.user_notification_preferences'::regclass), 'preference table has RLS enabled');
select col_is_pk('public', 'user_notification_preferences', 'user_id', 'one preference row exists per user');
select ok(not has_table_privilege('anon', 'public.user_notification_preferences', 'SELECT'), 'anonymous users cannot read preferences');
select ok(not has_table_privilege('anon', 'public.user_notification_preferences', 'INSERT'), 'anonymous users cannot create preferences');
select ok(not has_table_privilege('authenticated', 'public.user_notification_preferences', 'DELETE'), 'authenticated users cannot delete preferences');
select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_notification_preferences'), 'preferences add no Realtime publication traffic');

insert into auth.users (id, email) values
  ('94000000-0000-4000-8000-000000000001', 'preference-user@example.test'),
  ('94000000-0000-4000-8000-000000000002', 'preference-other@example.test'),
  ('94000000-0000-4000-8000-000000000003', 'preference-admin@example.test');

insert into public.users (id, full_name, email, role) values
  ('94000000-0000-4000-8000-000000000001', 'Preference User', 'preference-user@example.test', 'rider'),
  ('94000000-0000-4000-8000-000000000002', 'Preference Other', 'preference-other@example.test', 'payroll'),
  ('94000000-0000-4000-8000-000000000003', 'Preference Admin', 'preference-admin@example.test', 'admin');

insert into public.notifications (id, type, category, priority, title, message, recipient_id, target_roles)
values (
  '95000000-0000-4000-8000-000000000001',
  'system',
  'system',
  'medium',
  'Persisted notification',
  'Preference changes must not remove this record.',
  '94000000-0000-4000-8000-000000000001',
  array[]::public.user_role[]
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into user_notification_preferences (user_id) values ('94000000-0000-4000-8000-000000000002')$$,
  'authenticated user can create an owned preference row'
);
select is((select user_id from user_notification_preferences), '94000000-0000-4000-8000-000000000001'::uuid, 'database forces preference ownership to authenticated user');
select ok((select toast_enabled and sound_enabled and violation_alerts and attendance_alerts and payroll_updates and support_ticket_updates and system_updates from user_notification_preferences), 'new users retain all-enabled defaults');
select is((select count(*) from user_notification_preferences), 1::bigint, 'user reads its own preference row');

select lives_ok(
  $$update user_notification_preferences set toast_enabled=false, violation_alerts=false where user_id='94000000-0000-4000-8000-000000000001'$$,
  'user can update its own preferences'
);
select ok((select not toast_enabled and not violation_alerts from user_notification_preferences), 'updated preferences persist for reload');
select ok((select updated_at >= created_at from user_notification_preferences), 'database maintains preference timestamps');

select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from user_notification_preferences), 0::bigint, 'another user cannot read the preference row');
select is_empty(
  $$update user_notification_preferences set sound_enabled=false where user_id='94000000-0000-4000-8000-000000000001' returning user_id$$,
  'another user cannot update the preference row'
);

select set_config('request.jwt.claims', '{"sub":"94000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from user_notification_preferences), 0::bigint, 'Admin cannot read another user personal preferences');
select is_empty(
  $$update user_notification_preferences set sound_enabled=false where user_id='94000000-0000-4000-8000-000000000001' returning user_id$$,
  'Admin cannot update another user personal preferences'
);

reset role;
select is((select count(*) from notifications where id='95000000-0000-4000-8000-000000000001'), 1::bigint, 'preference changes leave persisted notification history intact');

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
