begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select pg_advisory_xact_lock(hashtext('payroll_adjustment_rider_summary_test'));
select no_plan();

select ok(to_regprocedure('public.list_payroll_adjustment_rider_summaries(text,uuid,text,text,integer,integer)') is not null, 'paginated Rider summary RPC exists');
select ok(to_regprocedure('public.list_payroll_adjustment_rider_events(uuid,text,text,integer,integer)') is not null, 'paginated Rider event RPC exists');
select ok(has_function_privilege('authenticated','public.list_payroll_adjustment_rider_summaries(text,uuid,text,text,integer,integer)','EXECUTE'), 'authenticated staff may reach the guarded summary RPC');
select ok(not has_function_privilege('anon','public.list_payroll_adjustment_rider_summaries(text,uuid,text,text,integer,integer)','EXECUTE'), 'anonymous callers cannot read adjustment summaries');

insert into public.hubs(id,name) values
  ('ec100000-0000-4000-8000-000000000001','Summary Hub'),
  ('ec100000-0000-4000-8000-000000000002','Other Hub');
insert into public.zones(id,hub_id,name,lat,lng,radius,color,status) values
  ('ec200000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','Summary Zone',1,1,100,'#111111','active'),
  ('ec200000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000002','Other Zone',2,2,100,'#222222','active');
insert into public.riders(id,hub_id,zone_id,name,mkb_id,email,status) values
  ('ec300000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001','Summary Rider One','TEST-SUM-001','summary-rider-1@example.test','active'),
  ('ec300000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','ec200000-0000-4000-8000-000000000001','Summary Rider Two','TEST-SUM-002','summary-rider-2@example.test','active');
insert into auth.users(id,email,email_confirmed_at) values
  ('ec400000-0000-4000-8000-000000000001','summary-admin@example.test',clock_timestamp());
insert into public.users(id,full_name,email,role,hub_access_scope) values
  ('ec400000-0000-4000-8000-000000000001','Summary Admin','summary-admin@example.test','admin','global');

insert into public.payroll_deduction_obligations(
  id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,reference,source,created_by,updated_by,voided_at,voided_by,void_reason
) values
  ('ec500000-0000-4000-8000-000000000001','ec300000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','late_remittance',1500,date '2026-08-20','First remittance','LR-1500','manual','ec400000-0000-4000-8000-000000000001','ec400000-0000-4000-8000-000000000001',null,null,null),
  ('ec500000-0000-4000-8000-000000000002','ec300000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','late_remittance',500,date '2026-08-29','Second remittance','LR-500','manual','ec400000-0000-4000-8000-000000000001','ec400000-0000-4000-8000-000000000001',null,null,null),
  ('ec500000-0000-4000-8000-000000000003','ec300000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000001','general_deductions',300,date '2026-08-25','General deduction','GD-300','manual','ec400000-0000-4000-8000-000000000001','ec400000-0000-4000-8000-000000000001',null,null,null),
  ('ec500000-0000-4000-8000-000000000004','ec300000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','late_onhold',200,date '2026-08-28','Settled event','LO-200','manual','ec400000-0000-4000-8000-000000000001','ec400000-0000-4000-8000-000000000001',null,null,null),
  ('ec500000-0000-4000-8000-000000000005','ec300000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001','late_remittance',100,date '2026-08-27','Voided event','VOID-100','manual','ec400000-0000-4000-8000-000000000001','ec400000-0000-4000-8000-000000000001',clock_timestamp(),'ec400000-0000-4000-8000-000000000001','Invalid test event');

insert into public.payroll_records(id,rider_id,hub_id,cutoff_start,cutoff_end,status,total_parcels,rate_per_parcel,gross_pay) values
  ('ec600000-0000-4000-8000-000000000001','ec300000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001',date '2026-08-16',date '2026-08-31','paid',0,0,200);
insert into public.payroll_deduction_allocations(id,deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by,updated_by) values
  ('ec700000-0000-4000-8000-000000000001','ec500000-0000-4000-8000-000000000004','ec600000-0000-4000-8000-000000000001','ec300000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000001',date '2026-08-16',date '2026-08-31',200,'manual','ec400000-0000-4000-8000-000000000001','ec400000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ec400000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is((select count(*) from public.list_payroll_adjustment_rider_summaries(null,'ec100000-0000-4000-8000-000000000001',null,'actionable',1,25)),1::bigint,'default working summary excludes settled and voided Riders');
select is((select event_count from public.list_payroll_adjustment_rider_summaries(null,'ec100000-0000-4000-8000-000000000001',null,'actionable',1,25)),3::bigint,'Rider summary counts every independent open event');
select is((select adjustment_type_count from public.list_payroll_adjustment_rider_summaries(null,'ec100000-0000-4000-8000-000000000001',null,'actionable',1,25)),2::bigint,'Rider summary counts distinct adjustment types');
select is((select total_remaining from public.list_payroll_adjustment_rider_summaries(null,'ec100000-0000-4000-8000-000000000001',null,'actionable',1,25)),2300::numeric,'Rider summary totals remaining balances without merging events');
select is((select event_count from public.list_payroll_adjustment_rider_summaries(null,'ec100000-0000-4000-8000-000000000001','late_remittance','actionable',1,25)),2::bigint,'type filter is applied before server aggregation');
select is((select count(*) from public.list_payroll_adjustment_rider_events('ec300000-0000-4000-8000-000000000001','late_remittance','actionable',1,25)),2::bigint,'Rider event feed keeps same-type obligations independent');
select results_eq(
  $$select obligation_id from public.list_payroll_adjustment_rider_events('ec300000-0000-4000-8000-000000000001','late_remittance','actionable',1,25) order by obligation_id$$,
  $$values ('ec500000-0000-4000-8000-000000000001'::uuid),('ec500000-0000-4000-8000-000000000002'::uuid)$$,
  'Rider event feed preserves both obligation UUIDs'
);
select is((select total_count from public.list_payroll_adjustment_rider_events('ec300000-0000-4000-8000-000000000001',null,'actionable',1,1) limit 1),3::bigint,'event pagination does not alter the unpaged total');
select is((select count(*) from public.list_payroll_adjustment_rider_summaries(null,'ec100000-0000-4000-8000-000000000001',null,'history',1,25)),1::bigint,'history summary contains settled and voided records separately');

reset role;
select set_config('request.jwt.claims','',true);
select coalesce(string_agg(result,E'\n'),'ok') as test_suite from finish() result;
rollback;
