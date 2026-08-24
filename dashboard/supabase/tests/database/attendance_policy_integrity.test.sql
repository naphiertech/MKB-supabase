begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('attendance_policy_integrity_test'));
select no_plan();

select ok(
  to_regprocedure('public.schedule_attendance_policy(time,date,text)') is not null,
  'atomic attendance-policy scheduling RPC exists'
);
select ok(
  to_regprocedure('public.cancel_future_attendance_policy(uuid,text)') is not null,
  'atomic attendance-policy cancellation RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.schedule_attendance_policy(time,date,text)', 'EXECUTE'),
  'authenticated callers may execute scheduling RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.cancel_future_attendance_policy(uuid,text)', 'EXECUTE'),
  'authenticated callers may execute cancellation RPC'
);
select ok(
  not has_function_privilege('anon', 'public.schedule_attendance_policy(time,date,text)', 'EXECUTE'),
  'anonymous callers cannot execute scheduling RPC'
);
select ok(
  not has_function_privilege('anon', 'public.cancel_future_attendance_policy(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot execute cancellation RPC'
);
select ok(
  has_table_privilege('authenticated', 'public.attendance_policy_configurations', 'SELECT'),
  'authenticated policy reads remain available'
);
select ok(
  not has_table_privilege('authenticated', 'public.attendance_policy_configurations', 'INSERT'),
  'authenticated clients cannot insert policy rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.attendance_policy_configurations', 'UPDATE'),
  'authenticated clients cannot update policy rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.attendance_policy_configurations', 'DELETE'),
  'authenticated clients cannot delete policy rows directly'
);

select is(
  private.attendance_policy_business_date(timestamptz '2026-08-31 15:59:59+00'),
  date '2026-08-31',
  'Manila business date remains August before 16:00 UTC'
);
select is(
  private.attendance_policy_business_date(timestamptz '2026-08-31 16:00:00+00'),
  date '2026-09-01',
  'Manila business date rolls to September at 16:00 UTC'
);

create temporary table attendance_policy_test_dates (today date not null);
insert into attendance_policy_test_dates values (private.attendance_policy_business_date());
grant select on attendance_policy_test_dates to authenticated;

insert into auth.users (id, email, email_confirmed_at)
values ('ae000000-0000-4000-8000-000000000001', 'attendance-policy-admin@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role)
values ('ae000000-0000-4000-8000-000000000001', 'Attendance Policy Admin', 'attendance-policy-admin@example.test', 'admin');

truncate table public.attendance_policy_configuration_audit, public.attendance_policy_configurations;

insert into public.attendance_policy_configurations (
  id, late_threshold, effective_from, effective_until, active, change_reason, created_by, updated_by
)
values (
  'ae100000-0000-4000-8000-000000000001',
  time '08:15:00',
  private.attendance_policy_business_date() - 30,
  null,
  true,
  'Integrity test baseline',
  'ae000000-0000-4000-8000-000000000001',
  'ae000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$update public.attendance_policy_configurations
      set late_threshold = time '08:30:00'
    where id = 'ae100000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'historical threshold cannot change'
);
select throws_ok(
  $$update public.attendance_policy_configurations
      set effective_from = effective_from - 1
    where id = 'ae100000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'historical start date cannot change'
);
select throws_ok(
  $$update public.attendance_policy_configurations
      set active = false
    where id = 'ae100000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'historical policy cannot be deactivated'
);
select throws_ok(
  $$update public.attendance_policy_configurations
      set effective_until = private.attendance_policy_business_date() - 1
    where id = 'ae100000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'historical coverage cannot be shortened away from an already-governed date'
);
select lives_ok(
  $$update public.attendance_policy_configurations
      set effective_until = private.attendance_policy_business_date()
    where id = 'ae100000-0000-4000-8000-000000000001'$$,
  'current policy may safely close at the day before a future policy starts'
);
update public.attendance_policy_configurations
set effective_until = null
where id = 'ae100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$select public.schedule_attendance_policy(
      time '08:30:00',
      (select today + 10 from attendance_policy_test_dates),
      'First future threshold'
    )$$,
  'Admin can atomically schedule a future policy'
);

reset role;
select is(
  (select effective_until
   from public.attendance_policy_configurations
   where id = 'ae100000-0000-4000-8000-000000000001'),
  private.attendance_policy_business_date() + 9,
  'scheduling safely closes the predecessor future boundary'
);

create or replace function public.reject_attendance_policy_test_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.late_threshold = time '23:59:00' then
    raise exception 'forced attendance policy insert failure';
  end if;
  return NEW;
end;
$$;
create trigger reject_attendance_policy_test_insert
before insert on public.attendance_policy_configurations
for each row execute function public.reject_attendance_policy_test_insert();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.schedule_attendance_policy(
      time '23:59:00',
      (select today + 20 from attendance_policy_test_dates),
      'Force rollback after predecessor close'
    )$$,
  'P0001', null,
  'failed scheduling rolls back the complete transition'
);
reset role;

select is(
  (select effective_until
   from public.attendance_policy_configurations
   where effective_from = private.attendance_policy_business_date() + 10),
  null::date,
  'failed scheduling leaves predecessor coverage unchanged'
);
select is(
  (select count(*)
   from public.attendance_policy_configurations
   where effective_from = private.attendance_policy_business_date() + 20),
  0::bigint,
  'failed scheduling inserts no partial future policy'
);

drop trigger reject_attendance_policy_test_insert on public.attendance_policy_configurations;
drop function public.reject_attendance_policy_test_insert();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.schedule_attendance_policy(
      time '08:10:00',
      (select today + 20 from attendance_policy_test_dates),
      'Second future threshold'
    )$$,
  'a second future policy schedules without a gap or overlap'
);
reset role;

select is(
  (
    select count(*)
    from generate_series(
      private.attendance_policy_business_date() - 30,
      private.attendance_policy_business_date() + 30,
      interval '1 day'
    ) day
    where (
      select count(*)
      from public.attendance_policy_configurations policy
      where policy.active
        and policy.effective_from <= day::date
        and (policy.effective_until is null or policy.effective_until >= day::date)
    ) <> 1
  ),
  0::bigint,
  'valid scheduled history has exactly one active policy for every covered date'
);

create or replace function public.reject_attendance_policy_test_restore()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.effective_from = private.attendance_policy_business_date() + 10
     and OLD.effective_until is not null
     and NEW.effective_until is null then
    raise exception 'forced attendance policy restoration failure';
  end if;
  return NEW;
end;
$$;
create trigger reject_attendance_policy_test_restore
before update on public.attendance_policy_configurations
for each row execute function public.reject_attendance_policy_test_restore();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.cancel_future_attendance_policy(
      (select id from public.attendance_policy_configurations
       where effective_from = (select today + 20 from attendance_policy_test_dates)),
      'Force cancellation rollback'
    )$$,
  'P0001', null,
  'failed predecessor restoration rolls back future cancellation'
);
reset role;

select is(
  (select active
   from public.attendance_policy_configurations
   where effective_from = private.attendance_policy_business_date() + 20),
  true,
  'failed cancellation leaves the future policy active'
);
select is(
  (select effective_until
   from public.attendance_policy_configurations
   where effective_from = private.attendance_policy_business_date() + 10),
  private.attendance_policy_business_date() + 19,
  'failed cancellation leaves predecessor coverage unchanged'
);

drop trigger reject_attendance_policy_test_restore on public.attendance_policy_configurations;
drop function public.reject_attendance_policy_test_restore();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"ae000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select lives_ok(
  $$select public.cancel_future_attendance_policy(
      (select id from public.attendance_policy_configurations
       where effective_from = (select today + 20 from attendance_policy_test_dates)),
      'Second future threshold withdrawn'
    )$$,
  'future cancellation and predecessor restoration succeed atomically'
);
reset role;

select is(
  (select active
   from public.attendance_policy_configurations
   where effective_from = private.attendance_policy_business_date() + 20),
  false,
  'canceled future policy remains as an inactive audit-bearing row'
);
select is(
  (select effective_until
   from public.attendance_policy_configurations
   where effective_from = private.attendance_policy_business_date() + 10),
  null::date,
  'cancellation restores open-ended predecessor coverage'
);
select is(
  (select count(*)
   from public.attendance_policy_configurations
   where effective_from <= private.attendance_policy_business_date()
     and not active),
  0::bigint,
  'historical policy rows remain active'
);

truncate table public.attendance_policy_configuration_audit, public.attendance_policy_configurations;
insert into public.attendance_policy_configurations (
  late_threshold, effective_from, effective_until, active, change_reason
) values
  (time '08:15:00', date '2026-08-01', date '2026-08-31', true, 'August baseline'),
  (time '08:30:00', date '2026-09-01', date '2026-09-30', true, 'September threshold'),
  (time '08:10:00', date '2026-10-01', null, true, 'October threshold');

insert into public.riders (id, name, mkb_id, email)
values ('ae200000-0000-4000-8000-000000000001', 'Policy History Rider', 'TEST-POLICY-001', 'policy-history-rider@example.test');

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values
  ('ae300000-0000-4000-8000-000000000001', 'ae200000-0000-4000-8000-000000000001', date '2026-08-20', timestamptz '2026-08-20 08:20:00+08', 'present', 'face-scan'),
  ('ae300000-0000-4000-8000-000000000002', 'ae200000-0000-4000-8000-000000000001', date '2026-09-20', timestamptz '2026-09-20 08:20:00+08', 'present', 'face-scan'),
  ('ae300000-0000-4000-8000-000000000003', 'ae200000-0000-4000-8000-000000000001', date '2026-10-20', timestamptz '2026-10-20 08:20:00+08', 'present', 'face-scan');

select is(
  (select hr_status from public.v_attendance_summary where date = date '2026-08-20' and rider_id = 'ae200000-0000-4000-8000-000000000001'),
  'Late',
  'August attendance keeps the August 08:15 classification basis'
);
select is(
  (select hr_status from public.v_attendance_summary where date = date '2026-09-20' and rider_id = 'ae200000-0000-4000-8000-000000000001'),
  'Incomplete',
  'September attendance uses the September 08:30 classification basis'
);
select is(
  (select hr_status from public.v_attendance_summary where date = date '2026-10-20' and rider_id = 'ae200000-0000-4000-8000-000000000001'),
  'Late',
  'October attendance uses the October 08:10 classification basis'
);
select is(
  (
    select count(*)
    from public.attendance_logs attendance
    left join lateral (
      select policy.id
      from public.attendance_policy_configurations policy
      where policy.active
        and policy.effective_from <= attendance.date
        and (policy.effective_until is null or policy.effective_until >= attendance.date)
      order by policy.effective_from desc
      limit 1
    ) policy on true
    where attendance.rider_id = 'ae200000-0000-4000-8000-000000000001'
      and policy.id is null
  ),
  0::bigint,
  'valid attendance history never depends on the 08:15 fallback'
);

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
