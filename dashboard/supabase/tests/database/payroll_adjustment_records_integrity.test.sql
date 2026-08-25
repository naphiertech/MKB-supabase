begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('payroll_adjustment_records_integrity_test'));
select no_plan();

select has_table('public', 'payroll_earning_adjustments', 'earning source table exists');
select has_table('public', 'payroll_deduction_obligations', 'deduction obligation table exists');
select has_table('public', 'payroll_deduction_allocations', 'deduction allocation table exists');
select has_table('public', 'payroll_adjustment_audit_events', 'append-only financial audit exists');
select has_view('public', 'v_payroll_deduction_balances', 'authoritative balance view exists');
select has_column('public', 'payroll_records', 'adjustment_source_version', 'payroll source version exists');
select ok(to_regtype('public.payroll_adjustment_source') is not null, 'constrained provenance type exists');
select ok(to_regprocedure('public.create_payroll_deduction_obligation(uuid,text,numeric,date,text,text)') is not null, 'deduction creation RPC exists');
select ok(to_regprocedure('public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text)') is not null, 'atomic payroll plan RPC exists');
select ok(to_regprocedure('public.void_payroll_deduction_obligation(uuid,text)') is not null, 'guarded obligation void RPC exists');

select ok(not has_table_privilege('authenticated', 'public.payroll_deduction_obligations', 'INSERT'), 'clients cannot insert obligations directly');
select ok(not has_table_privilege('authenticated', 'public.payroll_deduction_allocations', 'UPDATE'), 'clients cannot update allocations directly');
select ok(has_function_privilege('authenticated', 'public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text)', 'EXECUTE'), 'authenticated staff may reach guarded plan RPC');
select ok(not has_function_privilege('anon', 'public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text)', 'EXECUTE'), 'anonymous callers cannot reach plan RPC');

insert into public.hubs (id, name) values
  ('ea100000-0000-4000-8000-000000000001', 'Adjustment Test Hub A'),
  ('ea100000-0000-4000-8000-000000000002', 'Adjustment Test Hub B');
insert into public.zones (id, hub_id, name, lat, lng, radius, color, status) values
  ('ea200000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'Adjustment Zone A', 1, 1, 100, '#111111', 'active'),
  ('ea200000-0000-4000-8000-000000000002', 'ea100000-0000-4000-8000-000000000002', 'Adjustment Zone B', 2, 2, 100, '#222222', 'active');
insert into public.riders (id, hub_id, zone_id, name, mkb_id, email, status) values
  ('ea300000-0000-4000-8000-000000000001', 'ea100000-0000-4000-8000-000000000001', 'ea200000-0000-4000-8000-000000000001', 'Adjustment Rider A', 'TEST-ADJ-A', 'adjustment-a@example.test', 'active'),
  ('ea300000-0000-4000-8000-000000000002', 'ea100000-0000-4000-8000-000000000002', 'ea200000-0000-4000-8000-000000000002', 'Adjustment Rider B', 'TEST-ADJ-B', 'adjustment-b@example.test', 'active');

insert into auth.users (id, email, email_confirmed_at) values
  ('ea400000-0000-4000-8000-000000000001', 'adjustment-admin@example.test', clock_timestamp()),
  ('ea400000-0000-4000-8000-000000000002', 'adjustment-payroll@example.test', clock_timestamp()),
  ('ea400000-0000-4000-8000-000000000003', 'adjustment-hr@example.test', clock_timestamp()),
  ('ea400000-0000-4000-8000-000000000004', 'adjustment-rider-user@example.test', clock_timestamp()),
  ('ea400000-0000-4000-8000-000000000005', 'adjustment-other-payroll@example.test', clock_timestamp());
insert into public.users (id, full_name, email, role, rider_id, hub_access_scope) values
  ('ea400000-0000-4000-8000-000000000001', 'Adjustment Admin', 'adjustment-admin@example.test', 'admin', null, 'global'),
  ('ea400000-0000-4000-8000-000000000002', 'Adjustment Payroll', 'adjustment-payroll@example.test', 'payroll', null, 'assigned'),
  ('ea400000-0000-4000-8000-000000000003', 'Adjustment HR', 'adjustment-hr@example.test', 'hr', null, 'assigned'),
  ('ea400000-0000-4000-8000-000000000004', 'Adjustment Rider User', 'adjustment-rider-user@example.test', 'rider', 'ea300000-0000-4000-8000-000000000001', 'assigned'),
  ('ea400000-0000-4000-8000-000000000005', 'Other Hub Payroll', 'adjustment-other-payroll@example.test', 'payroll', null, 'assigned');
insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('ea400000-0000-4000-8000-000000000002', 'ea100000-0000-4000-8000-000000000001', 'ea400000-0000-4000-8000-000000000001'),
  ('ea400000-0000-4000-8000-000000000003', 'ea100000-0000-4000-8000-000000000001', 'ea400000-0000-4000-8000-000000000001'),
  ('ea400000-0000-4000-8000-000000000005', 'ea100000-0000-4000-8000-000000000002', 'ea400000-0000-4000-8000-000000000001');

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values
  ('ea500000-0000-4000-8000-000000000001', 'ea300000-0000-4000-8000-000000000001', date '2026-08-20', timestamptz '2026-08-20 07:50:00+08', 'present', 'face-scan');
insert into public.parcel_logs (id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, rate, created_by) values
  ('ea600000-0000-4000-8000-000000000001', 'ea300000-0000-4000-8000-000000000001', date '2026-08-20', 20, 5, 0, 0, 0, 'ea400000-0000-4000-8000-000000000002');

insert into public.payroll_records (id, rider_id, cutoff_start, cutoff_end, status, total_parcels, rate_per_parcel, gross_pay) values
  ('ea700000-0000-4000-8000-000000000001', 'ea300000-0000-4000-8000-000000000001', date '2026-08-16', date '2026-08-31', 'draft', 0, 0, 325),
  ('ea700000-0000-4000-8000-000000000002', 'ea300000-0000-4000-8000-000000000001', date '2026-08-01', date '2026-08-15', 'draft', 0, 0, 325);

select throws_ok(
  $$insert into public.payroll_records(id,rider_id,cutoff_start,cutoff_end,status,total_parcels,rate_per_parcel,gross_pay,other_earnings)
    values('ea700000-0000-4000-8000-000000000003','ea300000-0000-4000-8000-000000000001',date '2026-09-01',date '2026-09-15','draft',0,0,0,100)$$,
  'P0001', null, 'new traceable payroll cannot be inserted with unexplained aggregate adjustments'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ea400000-0000-4000-8000-000000000002","role":"authenticated"}', true);

create temp table adjustment_test_ids (name text primary key, id uuid not null);
grant select, insert, update on adjustment_test_ids to authenticated;
insert into adjustment_test_ids values (
  'late_remittance',
  public.create_payroll_deduction_obligation(
    'ea300000-0000-4000-8000-000000000001', 'late_remittance', 1500, date '2026-08-20', 'Late remittance', 'REM-001'
  )
);

select is((select hub_id from public.payroll_deduction_obligations where id=(select id from adjustment_test_ids where name='late_remittance')), 'ea100000-0000-4000-8000-000000000001'::uuid, 'obligation stores required immutable Hub');
select is((select source::text from public.payroll_deduction_obligations where id=(select id from adjustment_test_ids where name='late_remittance')), 'manual', 'application obligation has manual provenance');
select ok((select created_by is not null from public.payroll_deduction_obligations where id=(select id from adjustment_test_ids where name='late_remittance')), 'manual provenance stores authenticated actor');

select throws_ok(
  $$select public.save_payroll_adjustment_plan(
    'ea700000-0000-4000-8000-000000000002', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('obligation_id',(select id from adjustment_test_ids where name='late_remittance'),'amount',200)),
    'Backward allocation attempt')$$,
  'P0001', null, 'obligation cannot be allocated to cutoff ending before incident date'
);

select throws_ok(
  $$select public.save_payroll_adjustment_plan(
    'ea700000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('id',null,'adjustment_code','other_earnings','amount',100,'adjustment_date','2026-09-01','reason','Outside cutoff')),
    '[]'::jsonb, 'Outside cutoff earning attempt')$$,
  'P0001', null, 'earning adjustment date must fall inside its payroll cutoff'
);

select lives_ok(
  $$select public.save_payroll_adjustment_plan(
    'ea700000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('id',null,'adjustment_code','other_earnings','amount',300,'adjustment_date','2026-08-20','reason','Manual earning','reference','EAR-001')),
    jsonb_build_array(jsonb_build_object('obligation_id',(select id from adjustment_test_ids where name='late_remittance'),'amount',200)),
    'Apply authorized adjustments')$$,
  'Payroll can save traceable earning and allocation atomically'
);

select is((select other_earnings from public.payroll_records where id='ea700000-0000-4000-8000-000000000001'), 300::numeric, 'earning records synchronize aggregate field');
select is((select late_remittance from public.payroll_records where id='ea700000-0000-4000-8000-000000000001'), 200::numeric, 'allocation synchronizes deduction aggregate field');
select throws_ok(
  $$delete from public.payroll_records where id='ea700000-0000-4000-8000-000000000001'$$,
  '23503', null, 'financial source foreign keys restrict silent payroll deletion'
);
select results_eq(
  $$select recovered, committed, planned, available_to_allocate from public.v_payroll_deduction_balances where obligation_id=(select id from adjustment_test_ids where name='late_remittance')$$,
  $$values (0::numeric,0::numeric,200::numeric,1300::numeric)$$,
  'Draft allocation is planned and reduces available balance'
);

select throws_ok(
  $$update public.payroll_records set late_remittance=999 where id='ea700000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'traceable aggregate cannot be changed outside synchronization path'
);

select throws_ok(
  $$select public.save_payroll_adjustment_plan(
    'ea700000-0000-4000-8000-000000000001', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('obligation_id',(select id from adjustment_test_ids where name='late_remittance'),'amount',1600)),
    'Over allocation attempt')$$,
  'P0001', null, 'allocation cannot exceed available obligation balance'
);

select throws_ok(
  $$select public.save_payroll_adjustment_plan(
    'ea700000-0000-4000-8000-000000000001', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('obligation_id',(select id from adjustment_test_ids where name='late_remittance'),'amount',400)),
    'Negative net attempt')$$,
  'P0001', null, 'combined allocation cannot make projected net pay negative'
);

update public.payroll_records set status='pending' where id='ea700000-0000-4000-8000-000000000001';
select is((select adjustment_source_version from public.payroll_records where id='ea700000-0000-4000-8000-000000000001'), 2::smallint, 'new traceable payroll uses source version 2');
select is((select adjustment_snapshot_version from public.payroll_records where id='ea700000-0000-4000-8000-000000000001'), 3, 'submission builds source-detail snapshot version 3');
select is((select adjustment_snapshot->>'version' from public.payroll_records where id='ea700000-0000-4000-8000-000000000001'), '3', 'snapshot JSON records version 3');
select results_eq(
  $$select recovered, committed, planned, available_to_allocate from public.v_payroll_deduction_balances where obligation_id=(select id from adjustment_test_ids where name='late_remittance')$$,
  $$values (0::numeric,200::numeric,0::numeric,1300::numeric)$$,
  'Pending allocation is committed and not freely available'
);

select throws_ok(
  $$select public.void_payroll_deduction_obligation((select id from adjustment_test_ids where name='late_remittance'),'Invalid')$$,
  'P0001', null, 'obligation with committed history cannot be voided'
);

select throws_ok(
  $$update public.payroll_deduction_allocations set amount=1 where payroll_record_id='ea700000-0000-4000-8000-000000000001'$$,
  '42501', null, 'direct allocation mutation remains unavailable'
);

reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$insert into public.payroll_adjustment_audit_events(entity_type,entity_id,rider_id,hub_id,payroll_record_id,action,previous_values,new_values,reason,actor_id,source)
    values ('obligation',gen_random_uuid(),'ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001',null,'legacy_import',null,'{}','Legacy migration provenance',null,'legacy_migration')$$,
  'legacy migration audit permits null actor with explicit provenance'
);
select throws_ok(
  $$insert into public.payroll_adjustment_audit_events(entity_type,entity_id,rider_id,hub_id,payroll_record_id,action,previous_values,new_values,reason,actor_id,source)
    values ('obligation',gen_random_uuid(),'ea300000-0000-4000-8000-000000000001','ea100000-0000-4000-8000-000000000001',null,'create',null,'{}','Missing actor',null,'manual')$$,
  '23514', null, 'manual audit provenance requires actor'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ea400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.payroll_deduction_obligations where rider_id='ea300000-0000-4000-8000-000000000001'), 1::bigint, 'HR can read in-scope obligations');
select throws_ok(
  $$select public.create_payroll_deduction_obligation('ea300000-0000-4000-8000-000000000001','general_deductions',100,date '2026-08-20','HR attempt',null)$$,
  'P0001', null, 'HR cannot create obligations'
);

select set_config('request.jwt.claims', '{"sub":"ea400000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.payroll_deduction_obligations where rider_id='ea300000-0000-4000-8000-000000000001'), 0::bigint, 'assigned Payroll cannot read another Hub obligations');

select set_config('request.jwt.claims', '{"sub":"ea400000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.payroll_deduction_obligations), 0::bigint, 'Rider cannot read management obligations');

reset role;
select set_config('request.jwt.claims', '', true);
select coalesce(string_agg(result, E'\n'), 'ok') as test_suite from finish() as result;
rollback;
