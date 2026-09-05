begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('rider_scheduling_v1_test'));
select no_plan();
create temporary table rider_scheduling_tap_results (result text not null);
create temporary table rider_scheduling_ids (name text primary key, id uuid not null);
grant insert on rider_scheduling_tap_results to authenticated;
grant insert on rider_scheduling_tap_results to anon;
grant insert on rider_scheduling_ids to authenticated;
grant select on rider_scheduling_ids to authenticated;

insert into rider_scheduling_tap_results select has_table('public', 'rider_schedules', 'dated Rider schedules table exists');
insert into rider_scheduling_tap_results select has_table('public', 'rider_schedule_audit_events', 'schedule audit table exists');
insert into rider_scheduling_tap_results select has_column('public', 'rider_schedules', 'hub_id', 'schedules retain a planned operational Hub');
insert into rider_scheduling_tap_results select has_column('public', 'rider_schedules', 'revision', 'schedules carry an optimistic revision');
insert into rider_scheduling_tap_results select has_column('public', 'rider_schedule_audit_events', 'old_values', 'audit stores before values');
insert into rider_scheduling_tap_results select has_column('public', 'rider_schedule_audit_events', 'new_values', 'audit stores after values');
insert into rider_scheduling_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.rider_schedules'::regclass), 'schedules have RLS enabled');
insert into rider_scheduling_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.rider_schedule_audit_events'::regclass), 'schedule audit has RLS enabled');
insert into rider_scheduling_tap_results select ok(to_regprocedure('public.create_rider_schedule(uuid,date,uuid,public.rider_schedule_day_kind,time,time,text)') is not null, 'create schedule RPC exists');
insert into rider_scheduling_tap_results select ok(to_regprocedure('public.update_rider_schedule(uuid,integer,uuid,public.rider_schedule_day_kind,time,time,text)') is not null, 'update schedule RPC exists');
insert into rider_scheduling_tap_results select ok(to_regprocedure('public.publish_rider_schedule(uuid,integer,text)') is not null, 'publish schedule RPC exists');
insert into rider_scheduling_tap_results select ok(to_regprocedure('public.cancel_rider_schedule(uuid,integer,text)') is not null, 'cancel schedule RPC exists');
insert into rider_scheduling_tap_results select ok(to_regprocedure('public.list_rider_schedules(date,date,uuid,uuid)') is not null, 'bounded schedule list RPC exists');
insert into rider_scheduling_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_schedules', 'INSERT'), 'clients cannot insert schedules directly');
insert into rider_scheduling_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_schedules', 'UPDATE'), 'clients cannot update schedules directly');
insert into rider_scheduling_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_schedule_audit_events', 'DELETE'), 'clients cannot delete schedule audit directly');

insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a5000000-0000-4000-8000-000000000001', 'Schedule Test Hub Alpha', 1, 1, 100),
  ('a5000000-0000-4000-8000-000000000002', 'Schedule Test Hub Beta', 2, 2, 100);

insert into public.zones (id, hub_id, name, lat, lng, radius, color, status) values
  ('b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'Schedule Zone Alpha', 1, 1, 100, '#111111', 'active'),
  ('b5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002', 'Schedule Zone Beta', 2, 2, 100, '#222222', 'active');

insert into public.riders (id, hub_id, zone_id, home_hub_id, home_zone_id, name, mkb_id, email, status) values
  ('c5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'Schedule Rider Alpha', 'TEST-SCH-A', 'schedule-rider-a@example.test', 'active'),
  ('c5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000002', 'Schedule Rider Beta', 'TEST-SCH-B', 'schedule-rider-b@example.test', 'active'),
  ('c5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'Schedule Rider Archived', 'TEST-SCH-C', 'schedule-rider-c@example.test', 'offline');

insert into auth.users (id, email, email_confirmed_at) values
  ('d5000000-0000-4000-8000-000000000001', 'schedule-admin@example.test', clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000002', 'schedule-hr-alpha@example.test', clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000003', 'schedule-hr-beta@example.test', clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000004', 'schedule-payroll@example.test', clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000005', 'schedule-rider-a@example.test', clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000006', 'schedule-rider-b@example.test', clock_timestamp()),
  ('d5000000-0000-4000-8000-000000000007', 'schedule-rider-c@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status, archive_effective_date) values
  ('d5000000-0000-4000-8000-000000000001', 'Schedule Admin', 'schedule-admin@example.test', 'admin', null, 'global', 'active', 'active', null),
  ('d5000000-0000-4000-8000-000000000002', 'Schedule HR Alpha', 'schedule-hr-alpha@example.test', 'hr', null, 'assigned', 'active', 'active', null),
  ('d5000000-0000-4000-8000-000000000003', 'Schedule HR Beta', 'schedule-hr-beta@example.test', 'hr', null, 'assigned', 'active', 'active', null),
  ('d5000000-0000-4000-8000-000000000004', 'Schedule Payroll', 'schedule-payroll@example.test', 'payroll', null, 'global', 'active', 'active', null),
  ('d5000000-0000-4000-8000-000000000005', 'Schedule Rider Alpha', 'schedule-rider-a@example.test', 'rider', 'c5000000-0000-4000-8000-000000000001', 'assigned', 'active', 'active', null),
  ('d5000000-0000-4000-8000-000000000006', 'Schedule Rider Beta', 'schedule-rider-b@example.test', 'rider', 'c5000000-0000-4000-8000-000000000002', 'assigned', 'active', 'active', null);

insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status, archive_effective_date, archive_reason, archive_remarks, archived_at, archived_by) values
  ('d5000000-0000-4000-8000-000000000007', 'Schedule Rider Archived', 'schedule-rider-c@example.test', 'rider', 'c5000000-0000-4000-8000-000000000003', 'assigned', 'suspended', 'archived', (clock_timestamp() at time zone 'Asia/Manila')::date, 'Resigned', null, clock_timestamp(), 'd5000000-0000-4000-8000-000000000001');

insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('d5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
  ('d5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001');

-- Admin creates and publishes a valid work schedule.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into rider_scheduling_ids
select 'published_work', public.create_rider_schedule(
  'c5000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  'a5000000-0000-4000-8000-000000000001',
  'work', time '08:00', time '17:00', 'Initial coverage plan'
);
insert into rider_scheduling_tap_results select is(
  (select status from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'published_work')),
  'draft'::public.rider_schedule_status,
  'Admin creates a draft schedule'
);
insert into rider_scheduling_tap_results select is(
  (select revision from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'published_work')),
  1,
  'new schedule starts at revision one'
);
select public.publish_rider_schedule((select id from rider_scheduling_ids where name = 'published_work'), 1, 'Coverage approved');
insert into rider_scheduling_tap_results select is(
  (select status from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'published_work')),
  'published'::public.rider_schedule_status,
  'draft can be published'
);
insert into rider_scheduling_tap_results select is(
  (select revision from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'published_work')),
  2,
  'publication advances the revision'
);
select public.update_rider_schedule(
  (select id from rider_scheduling_ids where name = 'published_work'),
  2,
  'a5000000-0000-4000-8000-000000000001',
  'work', time '08:30', time '17:00', 'Published coverage adjustment'
);
insert into rider_scheduling_tap_results select is(
  (select revision from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'published_work')),
  3,
  'published material changes advance the revision'
);
insert into rider_scheduling_tap_results select is(
  (select count(*) from public.rider_schedule_audit_events where schedule_id = (select id from rider_scheduling_ids where name = 'published_work')),
  3::bigint,
  'create, publish, and update each write immutable audit events'
);
insert into rider_scheduling_tap_results select ok(
  (select old_values is not null and new_values is not null
   from public.rider_schedule_audit_events
   where schedule_id = (select id from rider_scheduling_ids where name = 'published_work')
     and action = 'published'),
  'publication audit retains before and after values'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.publish_rider_schedule((select id from rider_scheduling_ids where name = 'published_work'), 1, 'Retry stale publish')$$,
  '40001', null, 'stale publication revision is rejected'
);

-- Invalid work/day-off payloads and duplicate dates are rejected server-side.
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'a5000000-0000-4000-8000-000000000001','work',time '17:00',time '08:00','Invalid overnight plan')$$,
  '22023', null, 'overnight work schedules are rejected'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'a5000000-0000-4000-8000-000000000001','day_off',time '08:00',null,'Invalid day off')$$,
  '22023', null, 'day off cannot contain a start time'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,'a5000000-0000-4000-8000-000000000001','work',time '09:00',time '17:00','Duplicate date')$$,
  '23505', null, 'one schedule per Rider and business date is enforced'
);

-- Rider access is read-only and remains independent of the Rider current Hub.
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_scheduling_tap_results select is(
  (select count(*) from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'published_work')),
  1::bigint,
  'Rider can read the own published schedule'
);
insert into rider_scheduling_tap_results select is(
  (select count(*) from public.rider_schedules where rider_id = 'c5000000-0000-4000-8000-000000000002'),
  0::bigint,
  'Rider cannot read another Rider schedule'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000002',(clock_timestamp() at time zone 'Asia/Manila')::date + 3,'a5000000-0000-4000-8000-000000000002','work',time '08:00',time '17:00','Rider attempt')$$,
  '42501', null, 'Rider cannot create schedules'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$insert into public.rider_schedules (rider_id,work_date,hub_id,day_kind,starts_at,ends_at,created_by,updated_by) values ('c5000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date + 3,'a5000000-0000-4000-8000-000000000001','work',time '08:00',time '17:00','d5000000-0000-4000-8000-000000000005','d5000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'Rider cannot insert schedules directly'
);

-- HR scope is based on the stored planned Hub. Payroll is denied even with global scope.
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_scheduling_tap_results select is(
  (select count(*) from public.rider_schedules where hub_id = 'a5000000-0000-4000-8000-000000000001'),
  1::bigint,
  'local HR can read schedules in the assigned Hub'
);
insert into rider_scheduling_tap_results select is(
  (select count(*) from public.rider_schedules where hub_id = 'a5000000-0000-4000-8000-000000000002'),
  0::bigint,
  'local HR cannot read another Hub schedule'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.list_rider_schedules((clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 7,'a5000000-0000-4000-8000-000000000002',null)$$,
  '42501', null, 'local HR cannot request another Hub schedule range'
);
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.list_rider_schedules((clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 7,null,null)$$,
  '42501', null, 'Payroll has no scheduling access by default'
);

select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_scheduling_ids
select 'hr_created', public.create_rider_schedule(
  'c5000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 5,
  'a5000000-0000-4000-8000-000000000001',
  'day_off', null, null, 'HR rest-day plan'
);
insert into rider_scheduling_tap_results select is(
  (select status from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'hr_created')),
  'draft'::public.rider_schedule_status,
  'authorized HR can create a schedule in the assigned Hub'
);

-- A temporary deployment overlays the Home Hub only for its effective dates.
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000002',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,'a5000000-0000-4000-8000-000000000001','work',time '08:00',time '17:00','Before deployment')$$,
  '23514', null, 'a schedule cannot use a Hub before the deployment context exists'
);
select public.deploy_rider_temporarily(
  'c5000000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  'Temporary schedule context test'
);
insert into rider_scheduling_ids
select 'temporary_work', public.create_rider_schedule(
  'c5000000-0000-4000-8000-000000000002',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  'a5000000-0000-4000-8000-000000000001',
  'work', time '08:00', time '17:00', 'Deployment coverage'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000002',(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'a5000000-0000-4000-8000-000000000001','work',time '08:00',time '17:00','After deployment')$$,
  '23514', null, 'a schedule cannot use a temporary Hub after its end date'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.list_rider_schedules((clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 7,null,null)$$,
  '42501', null, 'Anonymous users cannot read schedules'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Historical Hub preservation and date-effective permanent transfer validation.
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into rider_scheduling_ids
select 'historical_work', public.create_rider_schedule(
  'c5000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date - 1,
  'a5000000-0000-4000-8000-000000000001',
  'work', time '08:00', time '17:00', 'Historical plan'
);
select public.publish_rider_schedule((select id from rider_scheduling_ids where name = 'historical_work'), 1, 'Historical plan approved');
select public.transfer_rider_permanently(
  'c5000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000002',
  'b5000000-0000-4000-8000-000000000002',
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  'Historical schedule transfer test'
);
insert into rider_scheduling_tap_results select is(
  (select hub_id from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'historical_work')),
  'a5000000-0000-4000-8000-000000000001'::uuid,
  'permanent transfer does not rewrite historical schedule Hub'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date + 3,'a5000000-0000-4000-8000-000000000001','work',time '08:00',time '17:00','Wrong post-transfer Hub')$$,
  '23514', null, 'post-transfer schedule must use the date-effective Hub'
);
insert into rider_scheduling_ids
select 'post_transfer_work', public.create_rider_schedule(
  'c5000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 3,
  'a5000000-0000-4000-8000-000000000002',
  'work', time '08:00', time '17:00', 'Post-transfer plan'
);

-- Archived employment cannot receive a new schedule.
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.create_rider_schedule('c5000000-0000-4000-8000-000000000003',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,'a5000000-0000-4000-8000-000000000001','work',time '08:00',time '17:00','Archived rider attempt')$$,
  '23514', null, 'archived Rider cannot receive a new schedule'
);

-- Cancellation is terminal, audited, and does not expose private details through the notification target.
insert into rider_scheduling_ids
select 'cancelled_work', public.create_rider_schedule(
  'c5000000-0000-4000-8000-000000000002',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 4,
  'a5000000-0000-4000-8000-000000000002',
  'work', time '08:00', time '17:00', 'Cancellation test'
);
select public.cancel_rider_schedule((select id from rider_scheduling_ids where name = 'cancelled_work'), 1, 'Coverage no longer required');
insert into rider_scheduling_tap_results select is(
  (select status from public.rider_schedules where id = (select id from rider_scheduling_ids where name = 'cancelled_work')),
  'cancelled'::public.rider_schedule_status,
  'draft schedule can be cancelled'
);
insert into rider_scheduling_tap_results select throws_ok(
  $$select public.cancel_rider_schedule((select id from rider_scheduling_ids where name = 'cancelled_work'), 2, 'Duplicate cancellation')$$,
  '23514', null, 'cancelled schedules cannot be mutated again'
);
reset role;
select set_config('request.jwt.claims', '', true);
insert into rider_scheduling_tap_results select ok(
  (select exists(
    select 1 from public.notifications
    where recipient_id = 'd5000000-0000-4000-8000-000000000005'
      and action_link = '/rider/schedule'
      and metadata ->> 'event' = 'updated')),
  'published schedule changes notify the affected Rider'
);
insert into rider_scheduling_tap_results select ok(
  (select rider_id is null and hub_id is null and action_link = '/rider/schedule'
   from public.notifications
   where recipient_id = 'd5000000-0000-4000-8000-000000000006'
     and action_link = '/rider/schedule'
     and metadata ->> 'event' = 'cancelled'
   order by created_at desc limit 1),
  'schedule notification remains a private direct-recipient notification'
);

insert into rider_scheduling_tap_results select throws_ok(
  $$update public.rider_schedule_audit_events set reason = 'tampered' where schedule_id = (select id from rider_scheduling_ids where name = 'published_work')$$,
  '42501', null, 'schedule audit history cannot be updated'
);

insert into rider_scheduling_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from rider_scheduling_tap_results;
rollback;
