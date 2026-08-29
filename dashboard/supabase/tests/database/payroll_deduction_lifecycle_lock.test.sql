begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select pg_advisory_xact_lock(hashtext('payroll_deduction_lifecycle_lock_test'));
select no_plan();

insert into public.hubs(id,name) values ('fd100000-0000-4000-8000-000000000001','Lifecycle Lock Hub');
insert into public.zones(id,hub_id,name,lat,lng,radius,color,status) values
  ('fd200000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','Lifecycle Lock Zone',1,1,100,'#111111','active');
insert into public.riders(id,hub_id,zone_id,name,mkb_id,email,status) values
  ('fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000001','Lifecycle Lock Rider','TEST-LOCK-001','lifecycle-lock-rider@example.test','active');
insert into auth.users(id,email,email_confirmed_at) values
  ('fd400000-0000-4000-8000-000000000001','lifecycle-lock-admin@example.test',clock_timestamp());
insert into public.users(id,full_name,email,role,hub_access_scope) values
  ('fd400000-0000-4000-8000-000000000001','Lifecycle Lock Admin','lifecycle-lock-admin@example.test','admin','global');

insert into public.payroll_deduction_obligations(
  id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,source,created_by,updated_by
) values
  ('fd500000-0000-4000-8000-000000000001','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','general_deductions',100,date '2026-08-01','Never allocated','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001'),
  ('fd500000-0000-4000-8000-000000000002','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','general_deductions',100,date '2026-08-02','Active Draft allocation','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001'),
  ('fd500000-0000-4000-8000-000000000003','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','general_deductions',100,date '2026-08-03','Removed Draft allocation','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001'),
  ('fd500000-0000-4000-8000-000000000004','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','late_onhold',100,date '2026-08-04','Pending history','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001'),
  ('fd500000-0000-4000-8000-000000000005','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','late_onhold',100,date '2026-08-05','Approved history','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001'),
  ('fd500000-0000-4000-8000-000000000006','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','late_remittance',100,date '2026-08-06','Paid history','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001'),
  ('fd500000-0000-4000-8000-000000000007','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001','late_remittance',100,date '2026-08-07','Former Pending history','manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001');

insert into public.payroll_records(id,rider_id,hub_id,cutoff_start,cutoff_end,status,total_parcels,rate_per_parcel,gross_pay) values
  ('fd600000-0000-4000-8000-000000000002','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-01',date '2026-08-15','draft',0,0,5000),
  ('fd600000-0000-4000-8000-000000000003','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-02',date '2026-08-15','draft',0,0,5000),
  ('fd600000-0000-4000-8000-000000000004','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-03',date '2026-08-15','draft',0,0,5000),
  ('fd600000-0000-4000-8000-000000000005','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-04',date '2026-08-15','draft',0,0,5000),
  ('fd600000-0000-4000-8000-000000000006','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-05',date '2026-08-15','draft',0,0,5000),
  ('fd600000-0000-4000-8000-000000000007','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-06',date '2026-08-15','draft',0,0,5000);

insert into public.payroll_deduction_allocations(
  id,deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by,updated_by,voided_at,voided_by,void_reason
) values
  ('fd700000-0000-4000-8000-000000000002','fd500000-0000-4000-8000-000000000002','fd600000-0000-4000-8000-000000000002','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-01',date '2026-08-15',50,'manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001',null,null,null),
  ('fd700000-0000-4000-8000-000000000003','fd500000-0000-4000-8000-000000000003','fd600000-0000-4000-8000-000000000003','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-02',date '2026-08-15',50,'manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001',clock_timestamp(),'fd400000-0000-4000-8000-000000000001','Removed before submission'),
  ('fd700000-0000-4000-8000-000000000004','fd500000-0000-4000-8000-000000000004','fd600000-0000-4000-8000-000000000004','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-03',date '2026-08-15',50,'manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001',null,null,null),
  ('fd700000-0000-4000-8000-000000000005','fd500000-0000-4000-8000-000000000005','fd600000-0000-4000-8000-000000000005','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-04',date '2026-08-15',50,'manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001',null,null,null),
  ('fd700000-0000-4000-8000-000000000006','fd500000-0000-4000-8000-000000000006','fd600000-0000-4000-8000-000000000006','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-05',date '2026-08-15',50,'manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001',null,null,null),
  ('fd700000-0000-4000-8000-000000000007','fd500000-0000-4000-8000-000000000007','fd600000-0000-4000-8000-000000000007','fd300000-0000-4000-8000-000000000001','fd100000-0000-4000-8000-000000000001',date '2026-08-06',date '2026-08-15',50,'manual','fd400000-0000-4000-8000-000000000001','fd400000-0000-4000-8000-000000000001',null,null,null);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fd400000-0000-4000-8000-000000000001","role":"authenticated"}',true);

update public.payroll_records set status='pending' where id in (
  'fd600000-0000-4000-8000-000000000003',
  'fd600000-0000-4000-8000-000000000004',
  'fd600000-0000-4000-8000-000000000005',
  'fd600000-0000-4000-8000-000000000006',
  'fd600000-0000-4000-8000-000000000007'
);
select public.bulk_approve_payroll_records(
  (select jsonb_build_array(jsonb_build_object('id',id,'updated_at',updated_at)) from public.payroll_records where id='fd600000-0000-4000-8000-000000000005'),
  date '2026-08-04',date '2026-08-15','fd800000-0000-4000-8000-000000000005'
);
select public.bulk_approve_payroll_records(
  (select jsonb_build_array(jsonb_build_object('id',id,'updated_at',updated_at)) from public.payroll_records where id='fd600000-0000-4000-8000-000000000006'),
  date '2026-08-05',date '2026-08-15','fd800000-0000-4000-8000-000000000006'
);
select public.bulk_mark_payroll_records_paid(
  (select jsonb_build_array(jsonb_build_object('id',id,'updated_at',updated_at)) from public.payroll_records where id='fd600000-0000-4000-8000-000000000006'),
  date '2026-08-05',date '2026-08-15','fd900000-0000-4000-8000-000000000006'
);
update public.payroll_records set status='draft' where id='fd600000-0000-4000-8000-000000000007';
select public.delete_draft_payroll_record('fd600000-0000-4000-8000-000000000007','Detach after return for lifecycle test');

select lives_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000001',125,date '2026-08-02','Correct never-allocated event','NEVER-1')$$,
  'never-allocated obligation remains correctable'
);
select throws_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000002',125,date '2026-08-03','Attempt active Draft correction',null)$$,
  'P0001',null,'active Draft allocation locks amount and incident date'
);
select lives_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000003',125,date '2026-08-04','Correct removed Draft allocation','REMOVED-1')$$,
  'removed Draft allocation restores audited correction eligibility'
);
select throws_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000004',125,date '2026-08-05','Attempt Pending correction',null)$$,
  'P0001',null,'Pending participation permanently locks amount and incident date'
);
select throws_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000005',125,date '2026-08-06','Attempt Approved correction',null)$$,
  'P0001',null,'Approved participation permanently locks amount and incident date'
);
select throws_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000006',125,date '2026-08-07','Attempt Paid correction',null)$$,
  'P0001',null,'Paid participation permanently locks amount and incident date'
);
select throws_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000007',125,date '2026-08-08','Attempt detached historical correction',null)$$,
  'P0001',null,'previously Pending then detached allocation remains permanently locked'
);
select lives_ok(
  $$select public.update_payroll_deduction_obligation('fd500000-0000-4000-8000-000000000004',100,date '2026-08-04','Correct metadata only','PENDING-META')$$,
  'permanently locked obligation still permits audited reason and reference correction'
);

reset role;
select set_config('request.jwt.claims','',true);
select coalesce(string_agg(result,E'\n'),'ok') as test_suite from finish() result;
rollback;
