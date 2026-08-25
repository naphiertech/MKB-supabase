begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select pg_advisory_xact_lock(hashtext('payroll_adjustment_batch_edit_test'));
select no_plan();

select ok(to_regprocedure('public.create_payroll_adjustments_batch(uuid,jsonb,text)') is not null, 'atomic batch creation RPC exists');
select ok(to_regprocedure('public.update_payroll_earning_adjustment(uuid,numeric,date,text,text)') is not null, 'guarded earning correction RPC exists');
select ok(has_function_privilege('authenticated','public.create_payroll_adjustments_batch(uuid,jsonb,text)','EXECUTE'), 'authenticated staff may reach guarded batch RPC');
select ok(not has_function_privilege('anon','public.create_payroll_adjustments_batch(uuid,jsonb,text)','EXECUTE'), 'anonymous callers cannot invoke batch RPC');

insert into public.hubs(id,name) values ('eb100000-0000-4000-8000-000000000001','Batch Adjustment Hub');
insert into public.zones(id,hub_id,name,lat,lng,radius,color,status) values
  ('eb200000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','Batch Adjustment Zone',1,1,100,'#111111','active');
insert into public.riders(id,hub_id,zone_id,name,mkb_id,email,status) values
  ('eb300000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000001','Batch Adjustment Rider','TEST-BATCH-ADJ','batch-adjustment-rider@example.test','active');
insert into auth.users(id,email,email_confirmed_at) values
  ('eb400000-0000-4000-8000-000000000001','batch-adjustment-admin@example.test',clock_timestamp()),
  ('eb400000-0000-4000-8000-000000000002','batch-adjustment-payroll@example.test',clock_timestamp()),
  ('eb400000-0000-4000-8000-000000000003','batch-adjustment-hr@example.test',clock_timestamp());
insert into public.users(id,full_name,email,role,hub_access_scope) values
  ('eb400000-0000-4000-8000-000000000001','Batch Admin','batch-adjustment-admin@example.test','admin','global'),
  ('eb400000-0000-4000-8000-000000000002','Batch Payroll','batch-adjustment-payroll@example.test','payroll','assigned'),
  ('eb400000-0000-4000-8000-000000000003','Batch HR','batch-adjustment-hr@example.test','hr','assigned');
insert into public.user_hub_access(user_id,hub_id,assigned_by) values
  ('eb400000-0000-4000-8000-000000000002','eb100000-0000-4000-8000-000000000001','eb400000-0000-4000-8000-000000000001'),
  ('eb400000-0000-4000-8000-000000000003','eb100000-0000-4000-8000-000000000001','eb400000-0000-4000-8000-000000000001');

insert into public.attendance_logs(id,rider_id,date,time_in,status,source) values
  ('eb500000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001',date '2026-08-20',timestamptz '2026-08-20 07:50:00+08','present','face-scan');
insert into public.parcel_logs(id,rider_id,date,parcels,heavy_parcels,failed_parcels,returned_parcels,rate,created_by) values
  ('eb600000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001',date '2026-08-20',20,5,0,0,0,'eb400000-0000-4000-8000-000000000002');
insert into public.payroll_records(id,rider_id,cutoff_start,cutoff_end,status,total_parcels,rate_per_parcel,gross_pay) values
  ('eb700000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001',date '2026-08-16',date '2026-08-31','draft',0,0,325);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"eb400000-0000-4000-8000-000000000002","role":"authenticated"}',true);

select lives_ok($$select public.create_payroll_adjustments_batch(
  'eb300000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('adjustment_code','general_deductions','amount',100,'adjustment_date','2026-08-20','reason','General deduction'),
    jsonb_build_object('adjustment_code','late_onhold','amount',150,'adjustment_date','2026-08-20','reason','Late onhold'),
    jsonb_build_object('adjustment_code','late_remittance','amount',500,'adjustment_date','2026-08-20','reason','Late remittance')
  ),'Record three deduction obligations')$$,'three valid deductions save atomically');
select is((select count(*) from public.payroll_deduction_obligations where rider_id='eb300000-0000-4000-8000-000000000001'),3::bigint,'all three deduction obligations are created');
select is((select count(*) from public.payroll_adjustment_audit_events where rider_id='eb300000-0000-4000-8000-000000000001' and action='batch_create'),3::bigint,'each batch deduction has an audit event');

create temp table batch_counts(before_count bigint);
grant select,insert on batch_counts to authenticated;
insert into batch_counts select count(*) from public.payroll_deduction_obligations where rider_id='eb300000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_payroll_adjustments_batch(
  'eb300000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('adjustment_code','general_deductions','amount',25,'adjustment_date','2026-08-20','reason','Would be valid'),
    jsonb_build_object('adjustment_code','late_onhold','amount',0,'adjustment_date','2026-08-20','reason','Invalid zero')
  ),'Reject entire batch')$$,'P0001',null,'one invalid item rejects the complete batch');
select is((select count(*) from public.payroll_deduction_obligations where rider_id='eb300000-0000-4000-8000-000000000001'),(select before_count from batch_counts),'failed batch creates no partial records');

select lives_ok($$select public.create_payroll_adjustments_batch(
  'eb300000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object('adjustment_code','other_earnings','amount',300,'adjustment_date','2026-08-20','reason','Other earning','payroll_record_id','eb700000-0000-4000-8000-000000000001'),
    jsonb_build_object('adjustment_code','fm_pickup','amount',100,'adjustment_date','2026-08-20','reason','FM pickup','payroll_record_id','eb700000-0000-4000-8000-000000000001'),
    jsonb_build_object('adjustment_code','late_remittance','amount',75,'adjustment_date','2026-08-20','reason','Separate obligation')
  ),'Record mixed earnings and deduction')$$,'earnings and deductions save atomically in their separate lifecycles');
select is((select count(*) from public.payroll_earning_adjustments where payroll_record_id='eb700000-0000-4000-8000-000000000001' and voided_at is null),2::bigint,'mixed batch creates two earning records');
select is((select other_earnings from public.payroll_records where id='eb700000-0000-4000-8000-000000000001'),300::numeric,'Other Earnings aggregate synchronizes');
select is((select fm_pickup_amount from public.payroll_records where id='eb700000-0000-4000-8000-000000000001'),100::numeric,'FM Pick Up aggregate synchronizes');

create temp table edit_ids(name text primary key,id uuid not null);
grant select,insert on edit_ids to authenticated;
insert into edit_ids select 'unused',id from public.payroll_deduction_obligations where rider_id='eb300000-0000-4000-8000-000000000001' and adjustment_code='general_deductions' order by created_at limit 1;
insert into edit_ids select 'used',id from public.payroll_deduction_obligations where rider_id='eb300000-0000-4000-8000-000000000001' and adjustment_code='late_onhold' order by created_at limit 1;
select lives_ok($$select public.update_payroll_deduction_obligation((select id from edit_ids where name='unused'),120,date '2026-08-21','Corrected unused deduction','GEN-120')$$,'unused deduction amount/date/reason/reference can be corrected');
select is((select original_amount from public.payroll_deduction_obligations where id=(select id from edit_ids where name='unused')),120::numeric,'unused deduction correction is stored');

select public.save_payroll_adjustment_plan(
  'eb700000-0000-4000-8000-000000000001',
  (select jsonb_agg(jsonb_build_object('id',id,'adjustment_code',adjustment_code,'amount',amount,'adjustment_date',adjustment_date,'reason',reason,'reference',reference)) from public.payroll_earning_adjustments where payroll_record_id='eb700000-0000-4000-8000-000000000001' and voided_at is null),
  jsonb_build_array(jsonb_build_object('obligation_id',(select id from edit_ids where name='used'),'amount',100)),
  'Allocate used deduction');
select throws_ok($$select public.update_payroll_deduction_obligation((select id from edit_ids where name='used'),50,date '2026-08-20','Too small',null)$$,'P0001',null,'original amount cannot fall below allocated amount');

create temp table earning_id(id uuid not null);
grant select,insert on earning_id to authenticated;
insert into earning_id select id from public.payroll_earning_adjustments where payroll_record_id='eb700000-0000-4000-8000-000000000001' and adjustment_code='other_earnings' and voided_at is null limit 1;
select lives_ok($$select public.update_payroll_earning_adjustment((select id from earning_id),350,date '2026-08-21','Corrected editable earning','EARN-350')$$,'earning linked to Draft payroll is editable');
select is((select other_earnings from public.payroll_records where id='eb700000-0000-4000-8000-000000000001'),350::numeric,'earning correction resynchronizes payroll aggregate');

update public.payroll_records set status='pending' where id='eb700000-0000-4000-8000-000000000001';
select throws_ok($$select public.update_payroll_earning_adjustment((select id from earning_id),400,date '2026-08-21','Historical rewrite',null)$$,'P0001',null,'earning linked to submitted payroll is locked');
select throws_ok($$select public.update_payroll_deduction_obligation((select id from edit_ids where name='used'),200,date '2026-08-21','Historical amount rewrite',null)$$,'P0001',null,'historically used deduction amount/date are locked');

create temp table audit_before(value bigint);
grant select,insert on audit_before to authenticated;
insert into audit_before select count(*) from public.payroll_adjustment_audit_events where entity_id=(select id from edit_ids where name='used');
select lives_ok($$select public.update_payroll_deduction_obligation((select id from edit_ids where name='used'),150,date '2026-08-20','Corrected reason only','USED-REF')$$,'reason/reference correction remains allowed after submitted use');
select is((select count(*) from public.payroll_adjustment_audit_events where entity_id=(select id from edit_ids where name='used')),(select value+1 from audit_before),'permitted historical reason/reference correction is audited');

select set_config('request.jwt.claims','{"sub":"eb400000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.create_payroll_adjustments_batch('eb300000-0000-4000-8000-000000000001','[]'::jsonb,'HR attempt')$$,'P0001',null,'HR remains read-only for batch mutations');

reset role;
select set_config('request.jwt.claims','',true);
select coalesce(string_agg(result,E'\n'),'ok') as test_suite from finish() result;
rollback;
