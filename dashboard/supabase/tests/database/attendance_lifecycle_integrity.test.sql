begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('attendance_lifecycle_integrity_test'));
select plan(15);

select ok(
  to_regprocedure('public.finalize_daily_attendance()') is not null,
  'server-owned daily attendance finalizer exists'
);
select ok(
  to_regprocedure('public.finalize_daily_attendance(timestamp with time zone)') is null,
  'automatic finalization cannot target an arbitrary historical moment'
);
select ok(
  not has_function_privilege('anon', 'public.finalize_daily_attendance()', 'EXECUTE'),
  'anonymous callers cannot execute attendance finalization'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_daily_attendance()', 'EXECUTE'),
  'authenticated browsers cannot execute attendance finalization'
);
select is(
  (select count(*)::integer from cron.job where jobname = 'finalize-daily-attendance' and active),
  1,
  'one active attendance finalization cron job exists'
);
select is(
  (select schedule from cron.job where jobname = 'finalize-daily-attendance' and active),
  '*/5 * * * *',
  'attendance finalization retries every five minutes'
);

insert into public.hubs (id, name, description, active, latitude, longitude, attendance_radius_m) values
  ('af100000-0000-4000-8000-000000000001', 'Attendance Lifecycle Hub One', 'Test', true, 6.9214, 122.0790, 100),
  ('af100000-0000-4000-8000-000000000002', 'Attendance Lifecycle Hub Two', 'Test', true, 6.9214, 122.0790, 100);

insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('af200000-0000-4000-8000-000000000001', 'af100000-0000-4000-8000-000000000001', 'Lifecycle Rider One', 'TEST-ATT-001', 'lifecycle-rider-1@example.test', 'offline'),
  ('af200000-0000-4000-8000-000000000002', 'af100000-0000-4000-8000-000000000002', 'Lifecycle Rider Two', 'TEST-ATT-002', 'lifecycle-rider-2@example.test', 'offline');

insert into auth.users (id, email, email_confirmed_at) values
  ('af300000-0000-4000-8000-000000000001', 'lifecycle-rider-1@example.test', clock_timestamp()),
  ('af300000-0000-4000-8000-000000000002', 'lifecycle-rider-2@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, rider_id, employment_status) values
  ('af300000-0000-4000-8000-000000000001', 'Lifecycle Rider One', 'lifecycle-rider-1@example.test', 'rider', 'af200000-0000-4000-8000-000000000001', 'active'),
  ('af300000-0000-4000-8000-000000000002', 'Lifecycle Rider Two', 'lifecycle-rider-2@example.test', 'rider', 'af200000-0000-4000-8000-000000000002', 'active');

select is(
  private.finalize_daily_attendance_for_moment(timestamptz '2099-01-01 16:59:59+08'),
  0,
  'no attendance is finalized before 5 PM Manila'
);
select is(
  (select count(*)::integer from public.attendance_logs where rider_id in (
    'af200000-0000-4000-8000-000000000001', 'af200000-0000-4000-8000-000000000002'
  ) and date = date '2099-01-01'),
  0,
  'pre-cutoff execution creates no absence rows'
);
select cmp_ok(
  private.finalize_daily_attendance_for_moment(timestamptz '2099-01-01 17:00:00+08'),
  '>=',
  2,
  'all-Hub employed Riders without attendance become Absent at 5 PM Manila'
);
select results_eq(
  $$select status::text || ':' || source::text from public.attendance_logs where rider_id in (
      'af200000-0000-4000-8000-000000000001', 'af200000-0000-4000-8000-000000000002'
    ) and date = date '2099-01-01' order by rider_id$$,
  array['absent:system', 'absent:system'],
  'finalized rows are system-generated absences'
);
select is(
  private.finalize_daily_attendance_for_moment(timestamptz '2099-01-01 17:05:00+08'),
  0,
  'repeated finalization is idempotent'
);

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values (
  'af400000-0000-4000-8000-000000000001',
  'af200000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date - 1,
  (((clock_timestamp() at time zone 'Asia/Manila')::date - 1)::timestamp + time '08:30') at time zone 'Asia/Manila',
  'present',
  'face-scan'
);

select is(
  (select completion_status from public.v_attendance_summary where id = 'af400000-0000-4000-8000-000000000001'),
  'Missing Time Out',
  'a past Manila-date Time In without Time Out is Missing Time Out'
);
select is(
  (select log_status::text from public.v_attendance_summary where id = 'af400000-0000-4000-8000-000000000001'),
  'present',
  'Missing Time Out preserves the attendance presence classification'
);
select ok(
  (select hr_status in ('Late', 'Incomplete') from public.v_attendance_summary where id = 'af400000-0000-4000-8000-000000000001'),
  'punctuality remains independent from completion status'
);

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values (
  'af400000-0000-4000-8000-000000000002',
  'af200000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  clock_timestamp(),
  'present',
  'face-scan'
);

select is(
  (select count(*)::integer from public.attendance_logs where rider_id = 'af200000-0000-4000-8000-000000000001' and time_in is not null and time_out is null),
  2,
  'a Rider can start the next Manila date while the prior row remains truthfully incomplete'
);

select * from finish();
rollback;
