begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('rider_assignments_test'));
select no_plan();
create temporary table rider_assignment_tap_results (result text not null);
grant insert on rider_assignment_tap_results to authenticated;

insert into rider_assignment_tap_results select has_table('public', 'rider_assignments', 'controlled Rider assignment history exists');
insert into rider_assignment_tap_results select has_column('public', 'riders', 'home_hub_id', 'Riders retain a permanent Home Hub');
insert into rider_assignment_tap_results select has_column('public', 'riders', 'home_zone_id', 'Riders retain a permanent Home Zone');
insert into rider_assignment_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.rider_assignments'::regclass), 'assignment history has RLS enabled');
insert into rider_assignment_tap_results select ok(to_regprocedure('public.transfer_rider_permanently(uuid,uuid,uuid,date,text)') is not null, 'permanent transfer RPC exists');
insert into rider_assignment_tap_results select ok(to_regprocedure('public.deploy_rider_temporarily(uuid,uuid,uuid,date,date,text)') is not null, 'temporary deployment RPC exists');
insert into rider_assignment_tap_results select ok(to_regprocedure('public.extend_rider_deployment(uuid,date,text)') is not null, 'deployment extension RPC exists');
insert into rider_assignment_tap_results select ok(to_regprocedure('public.end_rider_deployment_early(uuid,text)') is not null, 'early-end RPC exists');
insert into rider_assignment_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_assignments', 'INSERT'), 'clients cannot insert assignment history directly');
insert into rider_assignment_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_assignments', 'UPDATE'), 'clients cannot update assignment history directly');

insert into public.hubs (id, name) values
  ('a3100000-0000-4000-8000-000000000001', 'Assignment Test Hub A'),
  ('a3100000-0000-4000-8000-000000000002', 'Assignment Test Hub B');

insert into public.zones (id, hub_id, name, lat, lng, radius, color, status) values
  ('b3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'Assignment Test Zone A', 1, 1, 100, '#111111', 'active'),
  ('b3100000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000002', 'Assignment Test Zone B', 2, 2, 100, '#222222', 'active');

insert into public.riders (id, hub_id, zone_id, name, mkb_id, email, status) values
  ('c3100000-0000-4000-8000-000000000001', 'a3100000-0000-4000-8000-000000000001', 'b3100000-0000-4000-8000-000000000001', 'Assignment Test Rider', 'TEST-ASG-1', 'assignment-rider@example.test', 'active');

insert into rider_assignment_tap_results select is(
  (select home_hub_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'new Rider Home Hub defaults to the creation assignment'
);
insert into rider_assignment_tap_results select is(
  (select home_zone_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'b3100000-0000-4000-8000-000000000001'::uuid,
  'new Rider Home Zone defaults to the creation assignment'
);

insert into auth.users (id, email, email_confirmed_at) values
  ('d3100000-0000-4000-8000-000000000001', 'assignment-admin@example.test', clock_timestamp()),
  ('d3100000-0000-4000-8000-000000000002', 'assignment-local-hr@example.test', clock_timestamp()),
  ('d3100000-0000-4000-8000-000000000003', 'assignment-global-hr@example.test', clock_timestamp()),
  ('d3100000-0000-4000-8000-000000000004', 'assignment-rider@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, rider_id, hub_access_scope) values
  ('d3100000-0000-4000-8000-000000000001', 'Assignment Admin', 'assignment-admin@example.test', 'admin', null, 'global'),
  ('d3100000-0000-4000-8000-000000000002', 'Assignment Local HR', 'assignment-local-hr@example.test', 'hr', null, 'assigned'),
  ('d3100000-0000-4000-8000-000000000003', 'Assignment Global HR', 'assignment-global-hr@example.test', 'hr', null, 'global'),
  ('d3100000-0000-4000-8000-000000000004', 'Assignment Rider User', 'assignment-rider@example.test', 'rider', 'c3100000-0000-4000-8000-000000000001', 'assigned');

insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('d3100000-0000-4000-8000-000000000002', 'a3100000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001');

insert into public.parcel_logs (id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by) values
  ('e3100000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', (clock_timestamp() at time zone 'Asia/Manila')::date - 1, 1, 0, 0, 0, 'd3100000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into rider_assignment_tap_results select throws_ok(
  $$select public.transfer_rider_permanently('c3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002','b3100000-0000-4000-8000-000000000002',(clock_timestamp() at time zone 'Asia/Manila')::date,'Self transfer')$$,
  '42501', null, 'Riders cannot transfer themselves'
);

select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_assignment_tap_results select throws_ok(
  $$select public.transfer_rider_permanently('c3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002','b3100000-0000-4000-8000-000000000002',(clock_timestamp() at time zone 'Asia/Manila')::date,'Unauthorized cross-hub transfer')$$,
  '42501', null, 'hub-specific HR cannot transfer a Rider into an unauthorized Hub'
);

select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into rider_assignment_tap_results select lives_ok(
  $$select public.transfer_rider_permanently('c3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002','b3100000-0000-4000-8000-000000000002',(clock_timestamp() at time zone 'Asia/Manila')::date,'Permanent operational transfer')$$,
  'global Admin can transfer a Rider permanently'
);
insert into rider_assignment_tap_results select is(
  (select home_hub_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000002'::uuid,
  'permanent transfer updates the Home Hub'
);
insert into rider_assignment_tap_results select is(
  (select hub_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000002'::uuid,
  'permanent transfer updates the operational Hub'
);
insert into rider_assignment_tap_results select is(
  (select hub_id from public.parcel_logs where id = 'e3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'historical parcel Hub snapshot is unchanged after transfer'
);
insert into rider_assignment_tap_results select throws_ok(
  $$update public.riders set hub_id='a3100000-0000-4000-8000-000000000001', zone_id='b3100000-0000-4000-8000-000000000001' where id='c3100000-0000-4000-8000-000000000001'$$,
  '42501', null, 'authenticated clients cannot bypass assignment RPCs with direct Rider updates'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values
  ('f3100000-0000-4000-8000-000000000001', 'c3100000-0000-4000-8000-000000000001', (clock_timestamp() at time zone 'Asia/Manila')::date, clock_timestamp(), 'present', 'system');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into rider_assignment_tap_results select throws_ok(
  $$select public.deploy_rider_temporarily('c3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'Temporary operational coverage')$$,
  'P0001', null, 'temporary deployment is blocked by an open attendance session'
);
reset role;
select set_config('request.jwt.claims', '', true);
update public.attendance_logs set time_out = clock_timestamp() where id = 'f3100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into rider_assignment_tap_results select lives_ok(
  $$select public.deploy_rider_temporarily('c3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000001',(clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'Temporary operational coverage')$$,
  'global HR can deploy a Rider to an authorized Hub and Zone'
);
insert into rider_assignment_tap_results select is(
  (select home_hub_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000002'::uuid,
  'temporary deployment keeps the Home Hub unchanged'
);
insert into rider_assignment_tap_results select is(
  (select hub_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'temporary deployment changes the operational Hub'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into public.parcel_logs (id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by) values
  ('e3100000-0000-4000-8000-000000000002', 'c3100000-0000-4000-8000-000000000001', (clock_timestamp() at time zone 'Asia/Manila')::date, 1, 0, 0, 0, 'd3100000-0000-4000-8000-000000000001');
insert into rider_assignment_tap_results select is(
  (select hub_id from public.parcel_logs where id = 'e3100000-0000-4000-8000-000000000002'),
  'a3100000-0000-4000-8000-000000000001'::uuid,
  'operational records snapshot the temporary operational Hub'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into rider_assignment_tap_results select lives_ok(
  $$select public.extend_rider_deployment((select id from public.rider_assignments where rider_id='c3100000-0000-4000-8000-000000000001' and status='active'),(clock_timestamp() at time zone 'Asia/Manila')::date + 4,'Coverage period extended')$$,
  'authorized HR can extend an active deployment'
);
insert into rider_assignment_tap_results select lives_ok(
  $$select public.end_rider_deployment_early((select id from public.rider_assignments where rider_id='c3100000-0000-4000-8000-000000000001' and status='active'),'Operational coverage completed')$$,
  'authorized HR can end an active deployment early'
);
insert into rider_assignment_tap_results select is(
  (select hub_id from public.riders where id = 'c3100000-0000-4000-8000-000000000001'),
  'a3100000-0000-4000-8000-000000000002'::uuid,
  'ending a deployment returns the Rider to the Home Hub'
);
reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_assignment_tap_results select is(
  (select count(*) from public.rider_assignments where rider_id = 'c3100000-0000-4000-8000-000000000001'),
  0::bigint,
  'hub-specific HR cannot read cross-hub assignment history by UUID'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into rider_assignment_tap_results select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'payroll_records'
      and indexdef ilike '%unique%' and indexdef ilike '%rider_id%' and indexdef ilike '%cutoff_start%'
  ),
  'one payroll record per Rider and cutoff remains enforced'
);

insert into rider_assignment_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from rider_assignment_tap_results;
rollback;
