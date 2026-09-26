-- Phase 6 isolated pgTAP: schema/data fixtures and all reads roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select has_function('public','list_rider_absence_financial_consequences_for_payroll',
  array['date','date','uuid','uuid','text','integer','integer'],'Payroll sanitized API exists');
select has_function('public','list_my_absence_financial_consequences',
  array['date','date','text','integer','integer'],'Rider-own API exists');

insert into public.hubs(id,name,latitude,longitude,attendance_radius_m) values
  ('a7600000-0000-4000-8000-000000000001','Read Alpha',1,1,100),('a7600000-0000-4000-8000-000000000002','Read Beta',2,2,100);
insert into public.riders(id,hub_id,name,mkb_id,email,status) values
  ('c7600000-0000-4000-8000-000000000001','a7600000-0000-4000-8000-000000000001','Read Rider Alpha','TEST-READ-A','read-rider-a@example.test','active'),
  ('c7600000-0000-4000-8000-000000000002','a7600000-0000-4000-8000-000000000002','Read Rider Beta','TEST-READ-B','read-rider-b@example.test','active');
insert into auth.users(id,email,email_confirmed_at)
select ('d7600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'read-user-'||n||'@example.test',clock_timestamp()
from generate_series(1,8) n;
insert into public.users(id,full_name,email,role,rider_id,hub_access_scope,status,employment_status)
select ('d7600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Read User '||n,'read-user-'||n||'@example.test',
  (case when n=1 then 'admin' when n=3 then 'hr' when n in (4,5,8) then 'rider' else 'payroll' end)::public.user_role,
  case when n=4 then 'c7600000-0000-4000-8000-000000000001'::uuid when n=5 then 'c7600000-0000-4000-8000-000000000002'::uuid end,
  case when n in (2,4,5,8) then 'assigned' else 'global' end,
  (case when n in (7,8) then 'suspended' else 'active' end)::public.user_status,'active'
from generate_series(1,8) n;
insert into public.user_hub_access(user_id,hub_id,assigned_by)
values('d7600000-0000-4000-8000-000000000002','a7600000-0000-4000-8000-000000000001','d7600000-0000-4000-8000-000000000001');

insert into public.rider_absence_financial_consequences(
  id,rider_id,hub_id,business_date,attendance_context_code,policy_version_id,
  financial_eligibility_reason,policy_penalty_amount,applied_amount,currency,status,confirmation_key,
  decided_by,supervisor_name,decision_notes,evidence_reference,waiver_reason_category,
  reversed_by,reversed_at,reversal_reason,reversal_evidence_reference
)
select ('e7600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n in (5,6) then 'c7600000-0000-4000-8000-000000000002'::uuid else 'c7600000-0000-4000-8000-000000000001'::uuid end,
  case when n<=4 then 'a7600000-0000-4000-8000-000000000001'::uuid else 'a7600000-0000-4000-8000-000000000002'::uuid end,
  case n when 1 then date '2026-09-10' when 2 then date '2026-09-11'
    when 3 then date '2026-09-12' when 4 then date '2026-09-13'
    when 5 then date '2026-09-10' when 6 then date '2026-09-12' else date '2026-09-14' end,
  'no_notice',p.id,'absence_without_prior_notice',725.50,case when n in (3,6) then 0 else 725.50 end,'PHP',
  case when n=3 then 'waived_emergency' when n=6 then 'waived_excused' when n=4 then 'reversed' else 'confirmed' end,
  ('f7600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'd7600000-0000-4000-8000-000000000001','PRIVATE SUPERVISOR','PRIVATE DECISION','PRIVATE EVIDENCE',
  case when n=3 then 'emergency' when n=6 then 'excused' end,
  case when n=4 then 'd7600000-0000-4000-8000-000000000001'::uuid end,case when n=4 then clock_timestamp() end,
  case when n=4 then 'PRIVATE REVERSAL REASON' end,case when n=4 then 'PRIVATE REVERSAL EVIDENCE' end
from generate_series(1,7) n cross join public.absence_policy_versions p where p.version_number=1;

insert into public.payroll_deduction_obligations(id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,reference,source,created_by)
values('b7600000-0000-4000-8000-000000000002','c7600000-0000-4000-8000-000000000001','a7600000-0000-4000-8000-000000000001','general_deductions',725.50,'2026-09-11',
  'PRIVATE OBLIGATION NOTE','ABS-PEN:e7600000-0000-4000-8000-000000000002','manual','d7600000-0000-4000-8000-000000000001'),
  ('b7600000-0000-4000-8000-000000000004','c7600000-0000-4000-8000-000000000001','a7600000-0000-4000-8000-000000000001','general_deductions',725.50,'2026-09-13',
  'PRIVATE PAID OBLIGATION NOTE','ABS-PEN:e7600000-0000-4000-8000-000000000004','manual','d7600000-0000-4000-8000-000000000001');
update public.rider_absence_financial_consequences set deduction_obligation_id='b7600000-0000-4000-8000-000000000002' where id='e7600000-0000-4000-8000-000000000002';
update public.rider_absence_financial_consequences set deduction_obligation_id='b7600000-0000-4000-8000-000000000004' where id='e7600000-0000-4000-8000-000000000004';
insert into public.payroll_records(id,rider_id,hub_id,cutoff_start,cutoff_end,status,gross_pay,deductions,adjustment_source_version)
values('a7600000-0000-4000-8000-000000000011','c7600000-0000-4000-8000-000000000001',
  'a7600000-0000-4000-8000-000000000001','2026-09-07','2026-09-13','paid',1000,725.50,1);
insert into public.payroll_deduction_allocations(deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by)
values('b7600000-0000-4000-8000-000000000004','a7600000-0000-4000-8000-000000000011',
  'c7600000-0000-4000-8000-000000000001','a7600000-0000-4000-8000-000000000001',
  '2026-09-07','2026-09-13',725.50,'manual','d7600000-0000-4000-8000-000000000001');

-- Compensation can belong to a later Hub: its identity must not leak across
-- Payroll hub authorization even when the historical consequence is readable.
-- Build the Alpha Payroll history while the Rider belongs to Alpha, then move
-- the fixture Rider as owner before inserting the later Beta Payroll. Existing
-- historical snapshots stay unchanged and all Hub integrity triggers remain on.
update public.riders
set hub_id='a7600000-0000-4000-8000-000000000002',
    home_hub_id='a7600000-0000-4000-8000-000000000002'
where id='c7600000-0000-4000-8000-000000000001';
insert into public.payroll_records(id,rider_id,hub_id,cutoff_start,cutoff_end,status,gross_pay)
values('a7600000-0000-4000-8000-000000000010','c7600000-0000-4000-8000-000000000001','a7600000-0000-4000-8000-000000000002','2026-09-21','2026-09-27','draft',0);
insert into public.payroll_earning_adjustments(id,rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,reference,source,created_by)
values('b7600000-0000-4000-8000-000000000004','c7600000-0000-4000-8000-000000000001','a7600000-0000-4000-8000-000000000002','a7600000-0000-4000-8000-000000000010','2026-09-21','2026-09-27',
  'other_earnings',725.50,'2026-09-21','PRIVATE EARNING NOTE','ABS-REV:e7600000-0000-4000-8000-000000000004','manual','d7600000-0000-4000-8000-000000000001');
update public.rider_absence_financial_consequences set reversal_earning_id='b7600000-0000-4000-8000-000000000004' where id='e7600000-0000-4000-8000-000000000004';
insert into public.rider_absence_financial_consequence_audit_events(consequence_id,action,actor_id,new_values)
values('e7600000-0000-4000-8000-000000000004','reversed','d7600000-0000-4000-8000-000000000001','{"private_audit":"PRIVATE AUDIT"}');

create temporary table read_baseline(name text primary key,value jsonb);
create temporary table payroll_read_rows(row_json jsonb);
create temporary table rider_read_rows(row_json jsonb);
grant select,insert on payroll_read_rows,rider_read_rows to authenticated;
insert into read_baseline select 'rider_absence_financial_consequences',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.rider_absence_financial_consequences t;
insert into read_baseline select 'rider_absence_financial_consequence_audit_events',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.rider_absence_financial_consequence_audit_events t;
insert into read_baseline select 'payroll_deduction_obligations',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_deduction_obligations t;
insert into read_baseline select 'payroll_deduction_allocations',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_deduction_allocations t;
insert into read_baseline select 'payroll_earning_adjustments',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_earning_adjustments t;
insert into read_baseline select 'payroll_records',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_records t;
insert into read_baseline select 'payroll_adjustment_audit_events',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_adjustment_audit_events t;
insert into read_baseline select 'absence_policy_versions',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.absence_policy_versions t;
insert into read_baseline select 'absence_policy_rules',coalesce(jsonb_agg(to_jsonb(t) order by t.policy_version_id,t.rule_key),'[]'::jsonb) from public.absence_policy_rules t;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into payroll_read_rows
select to_jsonb(p) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14') p
where p.rider_id in ('c7600000-0000-4000-8000-000000000001','c7600000-0000-4000-8000-000000000002');
select is((select count(*) from payroll_read_rows),7::bigint,'Admin reads both historical hubs');
select is((select row_json->>'rider_name' from payroll_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000001'),'Read Rider Alpha'::text,'Payroll gets safe Rider display name');
select is((select (row_json->>'policy_penalty_amount')::numeric from payroll_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000001'),725.50::numeric,'Payroll sees historical policy amount');
select is((select (row_json->>'applied_amount')::numeric from payroll_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000003'),0::numeric,'Payroll sees waived applied amount truthfully');
select is((select row_json->>'obligation_status' from payroll_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000002'),'open'::text,'obligation status comes from existing balance view');
select is((select (row_json->>'obligation_available_to_allocate')::numeric from payroll_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000002'),725.50::numeric,'unallocated balance is reported without claiming payment');
select is((select row_json->>'reversal_earning_id' from payroll_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000004'),'b7600000-0000-4000-8000-000000000004'::text,'Admin can see compensation identity across hubs');
select is(array(select key from jsonb_object_keys((select row_json from payroll_read_rows limit 1)) key order by key),
  array['applied_amount','business_date','consequence_id','currency','decided_at','deduction_obligation_id','has_compensation','hub_id','hub_name','is_reversed','obligation_available_to_allocate','obligation_outstanding','obligation_status','policy_penalty_amount','reversal_earning_id','rider_code','rider_id','rider_name','status' ]::text[],'Payroll return shape is an explicit safe-field allowlist');
select ok((select bool_and(not (row_json ? 'supervisor_name')) from payroll_read_rows),'Payroll never exposes supervisor_name');
select ok((select bool_and(not (row_json ? 'decision_notes')) from payroll_read_rows),'Payroll never exposes decision_notes');
select ok((select bool_and(not (row_json ? 'evidence_reference')) from payroll_read_rows),'Payroll never exposes evidence_reference');
select ok((select bool_and(not (row_json ? 'reversal_evidence_reference')) from payroll_read_rows),'Payroll never exposes reversal_evidence_reference');
select ok((select bool_and(not (row_json ? 'old_values')) from payroll_read_rows),'Payroll never exposes old_values');
select ok((select bool_and(not (row_json ? 'new_values')) from payroll_read_rows),'Payroll never exposes new_values');
select ok((select bool_and(not (row_json ? 'reason')) from payroll_read_rows),'Payroll never exposes reason');
select ok((select bool_and(not (row_json ? 'review_reason')) from payroll_read_rows),'Payroll never exposes review_reason');
select ok((select bool_and(not (row_json ? 'reversal_reason')) from payroll_read_rows),'Payroll never exposes reversal_reason');
select ok((select bool_and(not (row_json ? 'decided_by')) from payroll_read_rows),'Payroll never exposes decided_by');
select ok((select bool_and(not (row_json ? 'reversed_by')) from payroll_read_rows),'Payroll never exposes reversed_by');
select ok((select bool_and(not (row_json ? 'confirmation_key')) from payroll_read_rows),'Payroll never exposes confirmation_key');
select ok((select bool_and(not (row_json ? 'policy_version_id')) from payroll_read_rows),'Payroll never exposes policy_version_id');
select ok((select bool_and(row_json::text not like '%PRIVATE%') from payroll_read_rows),'Payroll output contains no seeded private text');
select is((select count(*) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-11','2026-09-11',null,'c7600000-0000-4000-8000-000000000001')),1::bigint,'date and Rider filters work');
select is((select count(*) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14','a7600000-0000-4000-8000-000000000001')),4::bigint,'Admin hub filter works');
select is((select count(*) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,'c7600000-0000-4000-8000-000000000001','reversed')),1::bigint,'status filter uses exact stored status');
select is((select consequence_id from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,'c7600000-0000-4000-8000-000000000001',null,1,1)),'e7600000-0000-4000-8000-000000000004'::uuid,'pagination uses stable descending business dates');

select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14')
  where rider_id in ('c7600000-0000-4000-8000-000000000001','c7600000-0000-4000-8000-000000000002')),4::bigint,'assigned Payroll sees only historical authorized Hub');
select is((select count(*) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,'c7600000-0000-4000-8000-000000000002')),0::bigint,'Rider filter cannot expose another Hub');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14','a7600000-0000-4000-8000-000000000002')$$,'42501',null,'explicit unauthorized Hub rejected');
select is((select reversal_earning_id from public.list_rider_absence_financial_consequences_for_payroll('2026-09-13','2026-09-13')),null::uuid,'compensation identity in another Hub is withheld');
select ok((select has_compensation from public.list_rider_absence_financial_consequences_for_payroll('2026-09-13','2026-09-13')),'high-level compensation presence remains factual');
select is((select count(*) from public.rider_absence_financial_consequences where rider_id='c7600000-0000-4000-8000-000000000001'),0::bigint,'Payroll still cannot read base consequences');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7600000-0000-4000-8000-000000000004'),0::bigint,'Payroll still cannot read base audit');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((select count(*) from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14')
  where rider_id in ('c7600000-0000-4000-8000-000000000001','c7600000-0000-4000-8000-000000000002')),7::bigint,'globally scoped Payroll follows existing Hub helper');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14')$$,'42501',null,'HR denied Payroll projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14')$$,'42501',null,'Rider denied Payroll projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14')$$,'42501',null,'Suspended Payroll denied Payroll projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select isnt(auth.uid(),public.get_my_rider_id(),'test account UUID intentionally differs from Rider UUID');
insert into rider_read_rows select to_jsonb(r) from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14') r;
select is((select count(*) from rider_read_rows),5::bigint,'Rider sees own rows across historical hubs only');
select is((select count(*) from rider_read_rows where row_json->>'consequence_id' in ('e7600000-0000-4000-8000-000000000005','e7600000-0000-4000-8000-000000000006')),0::bigint,'other Rider rows absent');
select is(array(select key from jsonb_object_keys((select row_json from rider_read_rows limit 1)) key order by key),
  array['applied_amount','business_date','consequence_id','currency','decided_at','has_compensation','has_obligation','is_reversed','policy_penalty_amount','status','status_label' ]::text[],'Rider return shape is an explicit safe-field allowlist');
select is((select row_json->>'status' from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000001'),'confirmed'::text,'Rider sees exact status');
select is((select row_json->>'status_label' from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000001'),'Financial penalty confirmed'::text,'confirmed label does not claim deduction');
select is((select (row_json->>'policy_penalty_amount')::numeric from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000001'),725.50::numeric,'Rider sees policy amount');
select is((select (row_json->>'applied_amount')::numeric from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000003'),0::numeric,'Rider sees zero waiver amount');
select is((select row_json->>'currency' from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000001'),'PHP'::text,'Rider sees currency');
select is((select row_json->>'status_label' from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000003'),'Penalty waived'::text,'emergency waiver label is safe');
select is((select row_json->>'status_label' from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000004'),'Financial penalty reversed'::text,'reversed label does not claim refund paid');
select ok((select (row_json->>'is_reversed')::boolean from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000004'),'Rider sees reversed flag');
select ok((select (row_json->>'has_compensation')::boolean from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000004'),'Rider sees compensation presence without identifiers');
select ok((select (row_json->>'has_obligation')::boolean from rider_read_rows where row_json->>'consequence_id'='e7600000-0000-4000-8000-000000000002'),'Rider sees obligation presence without claiming payment');
select ok((select bool_and(not (row_json ? 'supervisor_name')) from rider_read_rows),'Rider never exposes supervisor_name');
select ok((select bool_and(not (row_json ? 'decision_notes')) from rider_read_rows),'Rider never exposes decision_notes');
select ok((select bool_and(not (row_json ? 'evidence_reference')) from rider_read_rows),'Rider never exposes evidence_reference');
select ok((select bool_and(not (row_json ? 'reversal_evidence_reference')) from rider_read_rows),'Rider never exposes reversal_evidence_reference');
select ok((select bool_and(not (row_json ? 'old_values')) from rider_read_rows),'Rider never exposes old_values');
select ok((select bool_and(not (row_json ? 'new_values')) from rider_read_rows),'Rider never exposes new_values');
select ok((select bool_and(not (row_json ? 'reason')) from rider_read_rows),'Rider never exposes reason');
select ok((select bool_and(not (row_json ? 'review_reason')) from rider_read_rows),'Rider never exposes review_reason');
select ok((select bool_and(not (row_json ? 'reversal_reason')) from rider_read_rows),'Rider never exposes reversal_reason');
select ok((select bool_and(not (row_json ? 'decided_by')) from rider_read_rows),'Rider never exposes decided_by');
select ok((select bool_and(not (row_json ? 'reversed_by')) from rider_read_rows),'Rider never exposes reversed_by');
select ok((select bool_and(not (row_json ? 'confirmation_key')) from rider_read_rows),'Rider never exposes confirmation_key');
select ok((select bool_and(not (row_json ? 'policy_version_id')) from rider_read_rows),'Rider never exposes policy_version_id');
select ok((select bool_and(not (row_json ? 'rider_id')) from rider_read_rows),'Rider never exposes rider_id');
select ok((select bool_and(not (row_json ? 'hub_id')) from rider_read_rows),'Rider never exposes hub_id');
select ok((select bool_and(not (row_json ? 'deduction_obligation_id')) from rider_read_rows),'Rider never exposes deduction_obligation_id');
select ok((select bool_and(not (row_json ? 'reversal_earning_id')) from rider_read_rows),'Rider never exposes reversal_earning_id');
select ok((select bool_and(row_json::text not like '%PRIVATE%') from rider_read_rows),'Rider output contains no private text');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14',p_rider_id=>'c7600000-0000-4000-8000-000000000002')$$,'42883',null,'Rider cannot supply another Rider ID');
select is((select count(*) from public.rider_absence_financial_consequences where rider_id='c7600000-0000-4000-8000-000000000001'),0::bigint,'Rider still cannot read own base consequences');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7600000-0000-4000-8000-000000000004'),0::bigint,'Rider still cannot read own audit');
select is((select count(*) from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14','confirmed')),3::bigint,'Rider status filter works');
select is((select consequence_id from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14',null,1,1)),'e7600000-0000-4000-8000-000000000004'::uuid,'Rider pagination is deterministic');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*) from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14')),2::bigint,'second Rider sees only their own rows');
select is((select status_label from public.list_my_absence_financial_consequences('2026-09-12','2026-09-12')),'Penalty waived'::text,'excused waiver shares safe label');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14')$$,'42501',null,'Admin cannot impersonate Rider-own projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14')$$,'42501',null,'Payroll cannot impersonate Rider-own projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14')$$,'42501',null,'HR cannot impersonate Rider-own projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14')$$,'42501',null,'Suspended/unlinked Rider cannot impersonate Rider-own projection');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll(null,'2026-09-14')$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects missing date');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-14','2026-09-10')$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects reversed range');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-01','2026-10-03')$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects excessive date range');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,null,'pending_confirmation')$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects derived status filter');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,null,null,501)$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects oversized page');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,null,null,0)$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects zero page');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,null,null,500,-1)$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects negative offset');
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14',null,null,null,500,100001)$$,'22023',null,'list_rider_absence_financial_consequences_for_payroll rejects excessive offset');
select set_config('request.jwt.claims','{"sub":"d7600000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select * from public.list_my_absence_financial_consequences(null,'2026-09-14')$$,'22023',null,'list_my_absence_financial_consequences rejects missing date');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-14','2026-09-10')$$,'22023',null,'list_my_absence_financial_consequences rejects reversed range');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-01','2026-10-03')$$,'22023',null,'list_my_absence_financial_consequences rejects excessive date range');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14','pending_confirmation')$$,'22023',null,'list_my_absence_financial_consequences rejects derived status filter');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14',null,501)$$,'22023',null,'list_my_absence_financial_consequences rejects oversized page');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14',null,0)$$,'22023',null,'list_my_absence_financial_consequences rejects zero page');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14',null,500,-1)$$,'22023',null,'list_my_absence_financial_consequences rejects negative offset');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14',null,500,100001)$$,'22023',null,'list_my_absence_financial_consequences rejects excessive offset');
reset role;
set local role anon;
select throws_ok($$select * from public.list_rider_absence_financial_consequences_for_payroll('2026-09-10','2026-09-14')$$,'42501',null,'Anon denied Payroll RPC');
select throws_ok($$select * from public.list_my_absence_financial_consequences('2026-09-10','2026-09-14')$$,'42501',null,'Anon denied Rider RPC');
reset role;
select is((select provolatile::text from pg_proc where oid='public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer)'::regprocedure),'s'::text,'list_rider_absence_financial_consequences_for_payroll is STABLE');
select ok((select prosecdef from pg_proc where oid='public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer)'::regprocedure),'list_rider_absence_financial_consequences_for_payroll uses definer with explicit authorization');
select ok(not has_function_privilege('anon','public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer)','EXECUTE'),'Anon has no execution grant');
select ok(not has_function_privilege('service_role','public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer)','EXECUTE'),'service role has no direct API execution grant');
select is((select provolatile::text from pg_proc where oid='public.list_my_absence_financial_consequences(date,date,text,integer,integer)'::regprocedure),'s'::text,'list_my_absence_financial_consequences is STABLE');
select ok((select prosecdef from pg_proc where oid='public.list_my_absence_financial_consequences(date,date,text,integer,integer)'::regprocedure),'list_my_absence_financial_consequences uses definer with explicit authorization');
select ok(not has_function_privilege('anon','public.list_my_absence_financial_consequences(date,date,text,integer,integer)','EXECUTE'),'Anon has no execution grant');
select ok(not has_function_privilege('service_role','public.list_my_absence_financial_consequences(date,date,text,integer,integer)','EXECUTE'),'service role has no direct API execution grant');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.rider_absence_financial_consequences t),
  (select value from read_baseline where name='rider_absence_financial_consequences'),'rider_absence_financial_consequences unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.rider_absence_financial_consequence_audit_events t),
  (select value from read_baseline where name='rider_absence_financial_consequence_audit_events'),'rider_absence_financial_consequence_audit_events unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_deduction_obligations t),
  (select value from read_baseline where name='payroll_deduction_obligations'),'payroll_deduction_obligations unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_deduction_allocations t),
  (select value from read_baseline where name='payroll_deduction_allocations'),'payroll_deduction_allocations unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_earning_adjustments t),
  (select value from read_baseline where name='payroll_earning_adjustments'),'payroll_earning_adjustments unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_records t),
  (select value from read_baseline where name='payroll_records'),'payroll_records unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_adjustment_audit_events t),
  (select value from read_baseline where name='payroll_adjustment_audit_events'),'payroll_adjustment_audit_events unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.absence_policy_versions t),
  (select value from read_baseline where name='absence_policy_versions'),'absence_policy_versions unchanged by both APIs');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.policy_version_id,t.rule_key),'[]'::jsonb) from public.absence_policy_rules t),
  (select value from read_baseline where name='absence_policy_rules'),'absence_policy_rules unchanged by both APIs');
select is((select count(*) from public.absence_policy_versions where version_number=2 and lifecycle='published'),
  (select count(*) from jsonb_array_elements((select value from read_baseline where name='absence_policy_versions')) v
    where v->>'version_number'='2' and v->>'lifecycle'='published'),'reads do not activate V2');
select * from finish();
rollback;
