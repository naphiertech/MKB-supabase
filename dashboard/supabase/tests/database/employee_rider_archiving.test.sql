begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('employee_rider_archiving_test'));
select plan(40);
create temporary table employee_archive_tap_results (result text not null);
grant insert on employee_archive_tap_results to authenticated;

insert into employee_archive_tap_results select has_column('public', 'users', 'employment_status', 'users has an employment lifecycle state');
insert into employee_archive_tap_results select is(
  (select column_default from information_schema.columns where table_schema='public' and table_name='users' and column_name='employment_status'),
  '''active''::employment_status',
  'employment defaults active'
);
insert into employee_archive_tap_results select ok(to_regprocedure('public.is_rider_employed_on(uuid,date)') is not null, 'date-effective employment helper exists');
insert into employee_archive_tap_results select ok(to_regprocedure('public.transition_employee_lifecycle(uuid,uuid,text,date,text,text,uuid)') is not null, 'controlled lifecycle transition exists');
insert into employee_archive_tap_results select ok(not has_function_privilege('authenticated', 'public.transition_employee_lifecycle(uuid,uuid,text,date,text,text,uuid)', 'EXECUTE'), 'clients cannot directly execute lifecycle transitions');
insert into employee_archive_tap_results select ok(has_function_privilege('service_role', 'public.transition_employee_lifecycle(uuid,uuid,text,date,text,text,uuid)', 'EXECUTE'), 'privileged account service can execute lifecycle transitions');

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'archive-admin@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'archive-hr@example.test'),
  ('e1000000-0000-4000-8000-000000000003', 'archive-payroll@example.test'),
  ('e1000000-0000-4000-8000-000000000004', 'archive-rider@example.test'),
  ('e1000000-0000-4000-8000-000000000005', 'archive-rider-two@example.test'),
  ('e1000000-0000-4000-8000-000000000006', 'archive-rider-three@example.test');

insert into public.riders (id, name, mkb_id, email, status) values
  ('e2000000-0000-4000-8000-000000000004', 'Archive Rider', 'TEST-ARCH-004', 'archive-rider@example.test', 'active'),
  ('e2000000-0000-4000-8000-000000000005', 'Blocked Rider', 'TEST-ARCH-005', 'archive-rider-two@example.test', 'active'),
  ('e2000000-0000-4000-8000-000000000006', 'Historical Rider', 'TEST-ARCH-006', 'archive-rider-three@example.test', 'active');

insert into public.users (id, full_name, email, role, rider_id, status) values
  ('e1000000-0000-4000-8000-000000000001', 'Archive Admin', 'archive-admin@example.test', 'admin', null, 'active'),
  ('e1000000-0000-4000-8000-000000000002', 'Archive HR', 'archive-hr@example.test', 'hr', null, 'active'),
  ('e1000000-0000-4000-8000-000000000003', 'Archive Payroll', 'archive-payroll@example.test', 'payroll', null, 'active'),
  ('e1000000-0000-4000-8000-000000000004', 'Archive Rider', 'archive-rider@example.test', 'rider', 'e2000000-0000-4000-8000-000000000004', 'active'),
  ('e1000000-0000-4000-8000-000000000005', 'Blocked Rider', 'archive-rider-two@example.test', 'rider', 'e2000000-0000-4000-8000-000000000005', 'active'),
  ('e1000000-0000-4000-8000-000000000006', 'Historical Rider', 'archive-rider-three@example.test', 'rider', 'e2000000-0000-4000-8000-000000000006', 'active');

insert into employee_archive_tap_results select is((select employment_status::text from public.users where id='e1000000-0000-4000-8000-000000000004'), 'active', 'new employee starts employment-active');
insert into employee_archive_tap_results select throws_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','archive',current_date,'Retired',null,'e3000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'self-archive is rejected'
);
insert into employee_archive_tap_results select throws_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','archive',current_date,'Terminated',null,'e3000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'HR cannot archive Admin'
);
insert into employee_archive_tap_results select throws_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','archive',current_date,'Resigned',null,'e3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'Payroll cannot archive'
);
insert into employee_archive_tap_results select throws_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005','archive',current_date,'Resigned',null,'e3000000-0000-4000-8000-000000000008')$$,
  '42501', null, 'Rider cannot archive another employee'
);

insert into public.attendance_logs (id, rider_id, date, time_in, status, source)
values ('e4000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000005',current_date,now(),'present','system');
insert into employee_archive_tap_results select throws_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000005','archive',current_date,'Resigned',null,'e3000000-0000-4000-8000-000000000004')$$,
  'P0001', null, 'open attendance blocks Archive'
);
update public.attendance_logs set time_out = time_in + interval '8 hours' where id='e4000000-0000-4000-8000-000000000005';

insert into public.violations (id, rider_id, type, resolved) values
  ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','boundary_exit',false),
  ('e5000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000004','manual_flag',false),
  ('e5000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000004','idle_timeout',false);

insert into employee_archive_tap_results select lives_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000004','archive',current_date,'Resigned','Relocated','e3000000-0000-4000-8000-000000000005')$$,
  'HR can archive a Rider'
);
insert into employee_archive_tap_results select is((select employment_status::text from public.users where id='e1000000-0000-4000-8000-000000000004'), 'archived', 'Archive changes employment state');
insert into employee_archive_tap_results select is((select status::text from public.users where id='e1000000-0000-4000-8000-000000000004'), 'suspended', 'Archived implies account suspended');
insert into employee_archive_tap_results select is((select status::text from public.riders where id='e2000000-0000-4000-8000-000000000004'), 'offline', 'Archived Rider becomes operationally offline');
insert into employee_archive_tap_results select ok((select resolved and resolved_at is not null from public.violations where id='e5000000-0000-4000-8000-000000000001'), 'Archive resolves open boundary_exit');
insert into employee_archive_tap_results select ok((select not resolved from public.violations where id='e5000000-0000-4000-8000-000000000002'), 'Archive preserves unresolved manual_flag');
insert into employee_archive_tap_results select ok((select not resolved from public.violations where id='e5000000-0000-4000-8000-000000000003'), 'Archive preserves unresolved idle_timeout');
insert into employee_archive_tap_results select lives_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000004','archive',current_date,'Resigned','Relocated','e3000000-0000-4000-8000-000000000005')$$,
  'Archive request retry is idempotent'
);
insert into employee_archive_tap_results select is((select count(*) from public.activity_logs where event_type='employee_archived' and metadata->>'request_id'='e3000000-0000-4000-8000-000000000005'), 1::bigint, 'Archive retry writes one audit event');

insert into employee_archive_tap_results select ok(public.is_rider_employed_on('e2000000-0000-4000-8000-000000000004', current_date - 1), 'pre-archive date remains employed');
insert into employee_archive_tap_results select ok(not public.is_rider_employed_on('e2000000-0000-4000-8000-000000000004', current_date), 'archive effective date is not employed');
insert into employee_archive_tap_results select throws_ok(
  $$insert into public.attendance_logs (rider_id,date,time_in,status,source) values ('e2000000-0000-4000-8000-000000000004',current_date,now(),'present','system')$$,
  '42501', null, 'Archived Rider attendance write is rejected'
);
insert into employee_archive_tap_results select throws_ok(
  $$insert into public.rider_locations (rider_id,lat,lng,recorded_at) values ('e2000000-0000-4000-8000-000000000004',6.92,122.08,now())$$,
  '42501', null, 'Archived Rider GPS write is rejected'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
update public.riders set status='active' where id='e2000000-0000-4000-8000-000000000004';
reset role;
select set_config('request.jwt.claims', '', true);
insert into employee_archive_tap_results select is(
  (select status::text from public.riders where id='e2000000-0000-4000-8000-000000000004'),
  'offline',
  'Archived Rider self-update cannot mutate operational state'
);

insert into employee_archive_tap_results select lives_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000004','restore',null,'Approved return',null,'e3000000-0000-4000-8000-000000000006')$$,
  'Admin can Restore Employment'
);
insert into employee_archive_tap_results select is((select employment_status::text from public.users where id='e1000000-0000-4000-8000-000000000004'), 'active', 'Restore changes employment to active');
insert into employee_archive_tap_results select is((select status::text from public.users where id='e1000000-0000-4000-8000-000000000004'), 'suspended', 'Restore does not reactivate account');
insert into employee_archive_tap_results select is((select status::text from public.riders where id='e2000000-0000-4000-8000-000000000004'), 'offline', 'Restore leaves Rider offline');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into employee_archive_tap_results select throws_ok(
  $$insert into public.attendance_logs (rider_id,date,time_in,status,source) values ('e2000000-0000-4000-8000-000000000004',current_date,now(),'present','system')$$,
  '42501', null, 'stale archive-date attendance remains invalid after Restore'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into public.rider_documents (
  id, rider_id, document_type, storage_path, original_filename, mime_type,
  file_size_bytes, uploaded_by
) values (
  'e6000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000006',
  'government_id', 'riders/e2000000-0000-4000-8000-000000000006/government_id',
  'government-id.pdf', 'application/pdf', 1000, 'e1000000-0000-4000-8000-000000000001'
);
insert into public.payroll_records (
  id, rider_id, cutoff_start, cutoff_end, status, total_parcels,
  standard_parcels, heavy_parcels, standard_earnings, heavy_earnings,
  rate_per_parcel, gross_pay, calculation_version
) values (
  'e7000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000006',
  current_date - 15, current_date - 1, 'draft', 0, 0, 0, 0, 0, 0, 0, 2
);

insert into employee_archive_tap_results select lives_ok(
  $$select public.transition_employee_lifecycle('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000006','archive',current_date,'Contract Ended',null,'e3000000-0000-4000-8000-000000000007')$$,
  'second Rider archive succeeds'
);
insert into employee_archive_tap_results select throws_ok(
  $$insert into public.parcel_logs (rider_id,date,parcels,heavy_parcels,failed_parcels,returned_parcels,created_by) values ('e2000000-0000-4000-8000-000000000006',current_date,1,0,0,0,'e1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'parcel work on or after archive effective date is rejected'
);
insert into employee_archive_tap_results select lives_ok(
  $$insert into public.parcel_logs (rider_id,date,parcels,heavy_parcels,failed_parcels,returned_parcels,created_by) values ('e2000000-0000-4000-8000-000000000006',current_date - 1,1,0,0,0,'e1000000-0000-4000-8000-000000000001')$$,
  'pre-archive parcel history remains valid'
);
insert into employee_archive_tap_results select is((select count(*) from public.parcel_logs where rider_id='e2000000-0000-4000-8000-000000000006'), 1::bigint, 'historical parcel row is preserved');
insert into employee_archive_tap_results select is((select count(*) from public.rider_documents where rider_id='e2000000-0000-4000-8000-000000000006'), 1::bigint, 'Archive preserves private document metadata');
insert into employee_archive_tap_results select is((select count(*) from public.payroll_records where rider_id='e2000000-0000-4000-8000-000000000006'), 1::bigint, 'Archive preserves existing payroll records');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into employee_archive_tap_results select is(
  (select count(*) from public.get_payroll_eligible_rider_ids(current_date + 1, current_date + 15) where rider_id='e2000000-0000-4000-8000-000000000006'),
  0::bigint,
  'future payroll eligibility excludes an archived Rider'
);
reset role;
select set_config('request.jwt.claims', '', true);
insert into employee_archive_tap_results select is((select count(*) from public.violations where rider_id='e2000000-0000-4000-8000-000000000004'), 3::bigint, 'Archive preserves violation history');
insert into employee_archive_tap_results select is((select count(*) from public.attendance_logs where rider_id='e2000000-0000-4000-8000-000000000005'), 1::bigint, 'Archive attempts preserve attendance history');

insert into employee_archive_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from employee_archive_tap_results;
rollback;
