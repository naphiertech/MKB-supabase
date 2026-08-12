begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('multi_hub_foundation_test'));
select no_plan();
create temporary table multi_hub_tap_results (result text not null);
grant insert on multi_hub_tap_results to authenticated;

insert into multi_hub_tap_results select has_table('public', 'hubs', 'hubs table exists');
insert into multi_hub_tap_results select has_table('public', 'user_hub_access', 'staff hub membership table exists');
insert into multi_hub_tap_results select has_column('public', 'users', 'hub_access_scope', 'staff scope is explicit');
insert into multi_hub_tap_results select has_column('public', 'zones', 'hub_id', 'zones are hub scoped');
insert into multi_hub_tap_results select has_column('public', 'riders', 'hub_id', 'riders are hub scoped');
insert into multi_hub_tap_results select has_column('public', 'attendance_logs', 'hub_id', 'attendance is hub scoped');
insert into multi_hub_tap_results select has_column('public', 'rider_locations', 'hub_id', 'live locations are hub scoped');
insert into multi_hub_tap_results select has_column('public', 'parcel_logs', 'hub_id', 'parcels are hub scoped');
insert into multi_hub_tap_results select has_column('public', 'payroll_records', 'hub_id', 'payroll is hub scoped');
insert into multi_hub_tap_results select has_column('public', 'violations', 'hub_id', 'violations are hub scoped');
insert into multi_hub_tap_results select has_column('public', 'support_tickets', 'hub_id', 'support tickets can retain their originating hub');
insert into multi_hub_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.hubs'::regclass), 'hubs has RLS enabled');
insert into multi_hub_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.user_hub_access'::regclass), 'hub memberships have RLS enabled');
insert into multi_hub_tap_results select ok(to_regprocedure('public.admin_set_user_hub_access(uuid,text,uuid[])') is not null, 'Admin staff-scope RPC exists');
insert into multi_hub_tap_results select ok(to_regprocedure('public.admin_set_zone_hub(uuid,uuid)') is not null, 'Admin zone assignment RPC exists');
insert into multi_hub_tap_results select ok(not has_function_privilege('authenticated', 'public.transition_employee_lifecycle_authorized_internal(uuid,uuid,text,date,text,text,uuid)', 'EXECUTE'), 'unscoped lifecycle implementation is not client callable');

insert into public.hubs (id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'Test Hub Alpha'),
  ('a1000000-0000-4000-8000-000000000002', 'Test Hub Beta');

insert into public.zones (id, hub_id, name, lat, lng, radius, color, status) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Test Zone Alpha', 1, 1, 100, '#111111', 'active'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'Test Zone Beta', 2, 2, 100, '#222222', 'active');

insert into public.riders (id, hub_id, zone_id, name, mkb_id, email, status) values
  ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Test Rider Alpha', 'TEST-HUB-A', 'rider-a@example.test', 'active'),
  ('c1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'Test Rider Beta', 'TEST-HUB-B', 'rider-b@example.test', 'active');

insert into auth.users (id, email, email_confirmed_at) values
  ('d1000000-0000-4000-8000-000000000001', 'hub-admin@example.test', clock_timestamp()),
  ('d1000000-0000-4000-8000-000000000002', 'hub-global-hr@example.test', clock_timestamp()),
  ('d1000000-0000-4000-8000-000000000003', 'hub-local-payroll@example.test', clock_timestamp()),
  ('d1000000-0000-4000-8000-000000000004', 'hub-local-hr@example.test', clock_timestamp()),
  ('d1000000-0000-4000-8000-000000000005', 'hub-rider-a@example.test', clock_timestamp()),
  ('d1000000-0000-4000-8000-000000000006', 'hub-rider-b@example.test', clock_timestamp()),
  ('d1000000-0000-4000-8000-000000000007', 'hub-global-payroll@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, rider_id, hub_access_scope) values
  ('d1000000-0000-4000-8000-000000000001', 'Hub Admin', 'hub-admin@example.test', 'admin', null, 'global'),
  ('d1000000-0000-4000-8000-000000000002', 'Global HR', 'hub-global-hr@example.test', 'hr', null, 'global'),
  ('d1000000-0000-4000-8000-000000000003', 'Local Payroll', 'hub-local-payroll@example.test', 'payroll', null, 'assigned'),
  ('d1000000-0000-4000-8000-000000000004', 'Local HR', 'hub-local-hr@example.test', 'hr', null, 'assigned'),
  ('d1000000-0000-4000-8000-000000000005', 'Hub Rider Alpha', 'hub-rider-a@example.test', 'rider', 'c1000000-0000-4000-8000-000000000001', 'assigned'),
  ('d1000000-0000-4000-8000-000000000006', 'Hub Rider Beta', 'hub-rider-b@example.test', 'rider', 'c1000000-0000-4000-8000-000000000002', 'assigned'),
  ('d1000000-0000-4000-8000-000000000007', 'Global Payroll', 'hub-global-payroll@example.test', 'payroll', null, 'global');

insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('d1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001');

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values
  ('e1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', current_date, now(), 'present', 'system'),
  ('e1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', current_date, now(), 'present', 'system');

insert into multi_hub_tap_results select is((select hub_id from public.attendance_logs where id = 'e1000000-0000-4000-8000-000000000001'), 'a1000000-0000-4000-8000-000000000001'::uuid, 'attendance snapshots the Rider hub');
insert into multi_hub_tap_results select throws_ok(
  $$insert into public.attendance_logs (rider_id, hub_id, date, time_in, status, source) values ('c1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',current_date,now(),'present','system')$$,
  '23514', null, 'a forged operational hub is rejected'
);

insert into public.notifications (id, type, title, message, rider_id) values (
  'e2000000-0000-4000-8000-000000000001', 'attendance', 'Test notification',
  'Test notification hub snapshot', 'c1000000-0000-4000-8000-000000000001'
);
insert into multi_hub_tap_results select is(
  (select hub_id from public.notifications where id='e2000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'notification snapshots the related Rider hub'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into public.support_tickets (id, created_by, subject, category, description) values (
  'e3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005',
  'Test support ticket', 'technical_issue', 'Test support ticket hub snapshot.'
);
reset role;
select set_config('request.jwt.claims', '', true);
insert into multi_hub_tap_results select is(
  (select hub_id from public.support_tickets where id='e3000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'support ticket snapshots the Rider creator hub'
);
insert into multi_hub_tap_results select throws_ok(
  $$update public.riders set hub_id='a1000000-0000-4000-8000-000000000002' where id='c1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Rider and zone cannot be split across hubs'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into multi_hub_tap_results select is((select count(*) from public.hubs where id::text like 'a1000000-%'), 2::bigint, 'global Admin can view all hubs');
insert into multi_hub_tap_results select lives_ok($$update public.hubs set active=false where id='a1000000-0000-4000-8000-000000000002'$$, 'Admin can deactivate a hub');
insert into multi_hub_tap_results select lives_ok($$update public.hubs set active=true, description='Updated' where id='a1000000-0000-4000-8000-000000000002'$$, 'Admin can edit and reactivate a hub');

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into multi_hub_tap_results select is((select count(*) from public.hubs where id::text like 'a1000000-%'), 2::bigint, 'global HR can view every authorized hub');
insert into multi_hub_tap_results select throws_ok($$insert into public.hubs(name) values ('Forbidden HR Hub')$$, '42501', null, 'HR cannot create hubs');

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
insert into multi_hub_tap_results select is((select count(*) from public.hubs where id::text like 'a1000000-%'), 2::bigint, 'global Payroll can view every authorized hub');

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into multi_hub_tap_results select is((select count(*) from public.hubs where id::text like 'a1000000-%'), 1::bigint, 'local Payroll sees only an assigned hub');
insert into multi_hub_tap_results select is((select count(*) from public.zones where id='b1000000-0000-4000-8000-000000000002'), 0::bigint, 'local Payroll cannot query another hub by UUID');
insert into multi_hub_tap_results select is((select count(*) from public.attendance_logs where id::text like 'e1000000-%'), 1::bigint, 'local Payroll receives only assigned-hub data');
update public.hubs set name='Forbidden' where id='a1000000-0000-4000-8000-000000000001';
insert into multi_hub_tap_results select is((select name from public.hubs where id='a1000000-0000-4000-8000-000000000001'), 'Test Hub Alpha', 'Payroll cannot edit hubs');

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into multi_hub_tap_results select is((select count(*) from public.riders where id='c1000000-0000-4000-8000-000000000001'), 1::bigint, 'Rider can see the own assigned Rider record');
insert into multi_hub_tap_results select is((select count(*) from public.riders where id='c1000000-0000-4000-8000-000000000002'), 0::bigint, 'Rider cannot query another hub Rider by UUID');
insert into multi_hub_tap_results select throws_ok($$insert into public.hubs(name) values ('Forbidden Rider Hub')$$, '42501', null, 'Rider cannot create hubs');
reset role;
select set_config('request.jwt.claims', '', true);

insert into multi_hub_tap_results select throws_ok(
  $$select public.transition_employee_lifecycle('d1000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000006','archive',current_date,'Resigned',null,'f1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'local HR lifecycle RPC cannot cross hub boundaries'
);
insert into multi_hub_tap_results select ok(public.actor_can_manage_user_hub('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000006'), 'global Admin retains cross-hub lifecycle authority');

insert into multi_hub_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from multi_hub_tap_results;
rollback;
