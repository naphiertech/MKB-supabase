begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'),
  'public.users status changes are published to Realtime'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and cmd = 'SELECT'),
  'users retains explicit read policies'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and cmd = 'UPDATE'),
  'users retains explicit update policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'violations' and cmd = 'INSERT'),
  1,
  'manual flags use the single authenticated Admin/HR insert path'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and cmd = 'INSERT'),
  'account and manual-flag actions retain an audit insert path'
);
select ok(
  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'violation_type' and e.enumlabel = 'manual_flag'),
  'manual_flag remains a supported persisted violation type'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'enforce_user_status_server_boundary' and not tgisinternal),
  'public account status changes are protected by a server-boundary trigger'
);
select ok(has_column_privilege('service_role', 'public.users', 'status', 'UPDATE'), 'service role can synchronize only the public account status');
select ok(has_column_privilege('service_role', 'public.users', 'id', 'SELECT'), 'service role can resolve account-action targets');
select ok(has_column_privilege('service_role', 'public.activity_logs', 'event_type', 'INSERT'), 'service role can append the required account-action audit');

create temporary table account_action_business_counts as
select
  (select count(*) from public.attendance_logs) as attendance_count,
  (select count(*) from public.parcel_logs) as parcel_count,
  (select count(*) from public.payroll_records) as payroll_count,
  (select count(*) from public.violations) as violation_count;

update public.users
set status = (case when status = 'active' then 'suspended' else 'active' end)::public.user_status
where id = (select id from public.users order by created_at limit 1);

select is((select count(*) from public.attendance_logs), (select attendance_count from account_action_business_counts), 'account status changes preserve attendance history');
select is((select count(*) from public.parcel_logs), (select parcel_count from account_action_business_counts), 'account status changes preserve parcel history');
select is((select count(*) from public.payroll_records), (select payroll_count from account_action_business_counts), 'account status changes preserve payroll history');
select is((select count(*) from public.violations), (select violation_count from account_action_business_counts), 'account status changes preserve violation history');

select * from finish();
rollback;
