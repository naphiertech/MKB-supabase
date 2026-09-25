-- Isolated V2 reversal tests. No production connection or disabled guards.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select has_function('public', 'reverse_rider_absence_financial_consequence',
  array['uuid','text','text'], 'reversal accepts only ID, reason, and optional evidence');
insert into public.hubs (id,name,latitude,longitude,attendance_radius_m)
values ('a7500000-0000-4000-8000-000000000001','Reversal Hub',1,1,100);
insert into public.riders (id,hub_id,name,mkb_id,email,status)
select ('c7500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'a7500000-0000-4000-8000-000000000001', 'Reversal Rider ' || n, 'TEST-REV-' || n, 'rev-rider-' || n || '@example.test', 'active'
from generate_series(1,3) n;
insert into auth.users(id,email,email_confirmed_at)
select ('d7500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'rev-user-' || n || '@example.test', clock_timestamp() from generate_series(1,5) n;
insert into public.users(id,full_name,email,role,rider_id,status,employment_status,hub_access_scope)
select ('d7500000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'Reversal User ' || n, 'rev-user-' || n || '@example.test',
  (case n when 2 then 'hr' when 3 then 'payroll' when 4 then 'rider' else 'admin' end)::public.user_role,
  case when n=4 then 'c7500000-0000-4000-8000-000000000001'::uuid end,
  (case when n=5 then 'suspended' else 'active' end)::public.user_status,
  'active', case when n=4 then 'assigned' else 'global' end
from generate_series(1,5) n;
select set_config('request.jwt.claims','{"sub":"d7500000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Historical snapshots only; the reversal must not resolve current policies.
insert into public.rider_absence_financial_consequences (
  id,rider_id,hub_id,business_date,attendance_context_code,policy_version_id,
  financial_eligibility_reason,policy_penalty_amount,applied_amount,status,
  confirmation_key,decided_by,supervisor_name,decision_notes,waiver_reason_category,evidence_reference
)
select ('e7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=16 then 'c7500000-0000-4000-8000-000000000002'::uuid when n=17 then 'c7500000-0000-4000-8000-000000000003'::uuid else 'c7500000-0000-4000-8000-000000000001'::uuid end,
  'a7500000-0000-4000-8000-000000000001', date '2026-06-01'+n, 'no_notice', p.id,
  'absence_without_prior_notice',650,case when n=13 then 0 else 650 end,
  case when n=13 then 'waived_emergency' else 'confirmed' end,
  ('f7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'd7500000-0000-4000-8000-000000000001','Supervisor','Original decision',case when n=13 then 'emergency' end,'Original evidence'
from generate_series(1,20) n cross join public.absence_policy_versions p where p.version_number=1;

insert into public.payroll_deduction_obligations(
  id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,reference,source,created_by,
  financially_committed_at,financially_committed_payroll_id
)
select ('b7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,c.rider_id,c.hub_id,'general_deductions',
  case when n=14 then 600 else c.applied_amount end,c.business_date,'Historical absence obligation','ABS-PEN:'||c.id::text,'manual','d7500000-0000-4000-8000-000000000001',
  case when n=6 then clock_timestamp() end,
  case when n=6 then 'a7500000-0000-4000-8000-000000000099'::uuid end
from generate_series(2,20) n join public.rider_absence_financial_consequences c
  on c.id=('e7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid where n<>13;
update public.rider_absence_financial_consequences c
set deduction_obligation_id=o.id from public.payroll_deduction_obligations o
where o.reference='ABS-PEN:'||c.id::text and c.id::text like 'e7500000-%';

-- Seed stored historical states directly as owner without disabling triggers.
-- Paid totals are immutable after fixture setup; editable totals are sourced
-- through the same aggregate synchronizer used by adjustment-plan saves.
insert into public.payroll_records(
  id,rider_id,hub_id,cutoff_start,cutoff_end,status,gross_pay,deductions,adjustment_source_version
)
select ('a7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=16 then 'c7500000-0000-4000-8000-000000000002'::uuid when n=17 then 'c7500000-0000-4000-8000-000000000003'::uuid else 'c7500000-0000-4000-8000-000000000001'::uuid end,
  'a7500000-0000-4000-8000-000000000001', date '2026-07-01'+n,date '2026-07-07'+n,
  (case when n in (3,6,10) then 'draft' when n=18 then 'rejected'
    when n=4 then 'pending' when n=5 then 'approved' else 'paid' end)::public.payroll_status,
  3000,case when n in (8,19) then 325 when n in (3,6,10,18) then 0 else 650 end,
  case when n in (3,6,10,18) then 2 else 1 end
from unnest(array[3,4,5,6,7,8,10,11,12,15,16,17,18,19]) n;
insert into public.payroll_deduction_allocations(
  id,deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by
)
select ('f7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('b7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,p.id,p.rider_id,p.hub_id,
  p.cutoff_start,p.cutoff_end,case when n in (8,19) then 325 else 650 end,'manual','d7500000-0000-4000-8000-000000000001'
from unnest(array[3,4,5,6,7,8,10,11,12,15,16,17,18,19]) n
join public.payroll_records p on p.id=('a7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;

-- Case 8 is mixed paid/draft; case 19 is partially paid with no active plan.
insert into public.payroll_records(id,rider_id,hub_id,cutoff_start,cutoff_end,status,gross_pay)
values ('a7500000-0000-4000-8000-000000000108','c7500000-0000-4000-8000-000000000001',
  'a7500000-0000-4000-8000-000000000001','2026-07-30','2026-08-05','draft',3000);
insert into public.payroll_deduction_allocations(id,deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by)
values ('f7500000-0000-4000-8000-000000000108','b7500000-0000-4000-8000-000000000008',
  'a7500000-0000-4000-8000-000000000108','c7500000-0000-4000-8000-000000000001',
  'a7500000-0000-4000-8000-000000000001','2026-07-30','2026-08-05',325,'manual','d7500000-0000-4000-8000-000000000001');

-- A separate existing obligation/earning on the draft must remain untouched.
insert into public.payroll_deduction_obligations(id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,source,created_by)
values('b7500000-0000-4000-8000-000000000031','c7500000-0000-4000-8000-000000000001','a7500000-0000-4000-8000-000000000001','general_deductions',75,'2026-06-01','Unrelated debt','manual','d7500000-0000-4000-8000-000000000001');
insert into public.payroll_deduction_allocations(id,deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by)
select 'f7500000-0000-4000-8000-000000000031','b7500000-0000-4000-8000-000000000031',id,rider_id,hub_id,cutoff_start,cutoff_end,75,'manual','d7500000-0000-4000-8000-000000000001' from public.payroll_records where id='a7500000-0000-4000-8000-000000000003';
insert into public.payroll_earning_adjustments(id,rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,source,created_by)
select 'b7500000-0000-4000-8000-000000000032',rider_id,hub_id,id,cutoff_start,cutoff_end,'other_earnings',50,cutoff_start,'Unrelated earning','manual','d7500000-0000-4000-8000-000000000001'
from public.payroll_records where id='a7500000-0000-4000-8000-000000000003';
select private.sync_traceable_payroll_aggregates(id,gen_random_uuid())
from public.payroll_records where id in ('a7500000-0000-4000-8000-000000000003','a7500000-0000-4000-8000-000000000006','a7500000-0000-4000-8000-000000000010','a7500000-0000-4000-8000-000000000018');

-- One current/future editable target for Rider 1; none for Rider 2; two for Rider 3.
insert into public.payroll_records(id,rider_id,hub_id,cutoff_start,cutoff_end,status,gross_pay)
select ('a7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=101 then 'c7500000-0000-4000-8000-000000000001'::uuid else 'c7500000-0000-4000-8000-000000000003'::uuid end, 'a7500000-0000-4000-8000-000000000001',
  date_trunc('week',clock_timestamp() at time zone 'Asia/Manila')::date + case when n=103 then 7 else 0 end,
  date_trunc('week',clock_timestamp() at time zone 'Asia/Manila')::date + case when n=103 then 13 else 6 end,
  'draft',0 from unnest(array[101,102,103]) n;

insert into public.payroll_earning_adjustments(id,rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,reference,source,created_by)
select 'b7500000-0000-4000-8000-000000000040',rider_id,hub_id,id,cutoff_start,cutoff_end,'other_earnings',1,cutoff_start,
  'Mismatched compensation','ABS-REV:e7500000-0000-4000-8000-000000000015','manual','d7500000-0000-4000-8000-000000000001'
from public.payroll_records where id='a7500000-0000-4000-8000-000000000101';
select private.sync_traceable_payroll_aggregates('a7500000-0000-4000-8000-000000000101',gen_random_uuid());

create temporary table reversal_baseline(name text primary key,value jsonb);
create temporary table reversal_ids(name text primary key,id uuid);
grant select,insert on reversal_ids to authenticated;
insert into reversal_baseline select 'absence_policy_versions',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.absence_policy_versions t;
insert into reversal_baseline select 'absence_policy_rules',coalesce(jsonb_agg(to_jsonb(t) order by t.policy_version_id,t.rule_key),'[]'::jsonb) from public.absence_policy_rules t;
insert into reversal_baseline select 'payroll_deduction_obligations',coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.payroll_deduction_obligations t;
insert into reversal_baseline select 'paid_payroll',jsonb_agg(to_jsonb(p) order by p.id) from public.payroll_records p where p.status='paid';
insert into reversal_baseline select 'all_payroll_before_A',jsonb_agg(to_jsonb(p) order by p.id) from public.payroll_records p;
insert into reversal_baseline select 'paid_allocations',jsonb_agg(to_jsonb(a) order by a.id) from public.payroll_deduction_allocations a join public.payroll_records p on p.id=a.payroll_record_id where p.status='paid';
insert into reversal_baseline select 'paid_obligations',jsonb_agg(to_jsonb(o) order by o.id) from public.payroll_deduction_obligations o where exists(select 1 from public.payroll_deduction_allocations a join public.payroll_records p on p.id=a.payroll_record_id where a.deduction_obligation_id=o.id and p.status='paid');
insert into reversal_baseline select 'locked_payroll',jsonb_agg(to_jsonb(p) order by p.id) from public.payroll_records p where p.id in ('a7500000-0000-4000-8000-000000000004','a7500000-0000-4000-8000-000000000005','a7500000-0000-4000-8000-000000000006');
insert into reversal_baseline select 'locked_allocations',jsonb_agg(to_jsonb(a) order by a.id) from public.payroll_deduction_allocations a where a.payroll_record_id in ('a7500000-0000-4000-8000-000000000004','a7500000-0000-4000-8000-000000000005','a7500000-0000-4000-8000-000000000006');
insert into reversal_baseline select 'unrelated_earning',to_jsonb(e) from public.payroll_earning_adjustments e where id='b7500000-0000-4000-8000-000000000032';
insert into reversal_baseline select 'unrelated_allocation',to_jsonb(a) from public.payroll_deduction_allocations a where id='f7500000-0000-4000-8000-000000000031';
insert into reversal_baseline select 'historical_decisions',jsonb_agg(
  to_jsonb(c)-array['status','reversed_by','reversed_at','reversal_reason','reversal_evidence_reference','reversal_earning_id','updated_at'] order by c.id)
from public.rider_absence_financial_consequences c where c.id::text like 'e7500000-%';

-- General and State A.
set local role authenticated;
select lives_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000001','Attendance correction','Evidence A')$$,'confirmed but unmaterialized decision can be reversed');
select lives_ok($$insert into reversal_ids values('A',public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000002','Timely notice verified','Evidence A'))$$,'Admin reverses unallocated obligation');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),'reversed'::text,'A marks consequence reversed');
select is((select applied_amount from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),650::numeric,'historical applied amount is preserved');
select is((select reversed_by from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),'d7500000-0000-4000-8000-000000000001'::uuid,'reversal actor comes from auth');
select ok((select reversed_at between transaction_timestamp() and clock_timestamp() from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),'reversal time is server controlled');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),'b7500000-0000-4000-8000-000000000002'::uuid,'historical obligation link is retained');
select ok((select voided_at is not null from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000002'),'A voids rather than deletes obligation');
select is((select count(*) from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000002'),1::bigint,'voided obligation history retained');
select is((select reversal_earning_id from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),null::uuid,'A creates no compensation');
select is(public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000002','Timely notice verified','Evidence A'),(select id from reversal_ids where name='A'),'A retry returns original result');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000002' and action='reversed'),1::bigint,'A retry adds no reversal audit');
select is((select count(*) from public.payroll_adjustment_audit_events where entity_id='b7500000-0000-4000-8000-000000000002' and action='void'),1::bigint,'A retry adds no void audit');
select is((select evidence_reference from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),'Original evidence'::text,'original confirmation evidence retained');
select is((select reversal_evidence_reference from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000002'),'Evidence A'::text,'reversal evidence stored separately');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000002','Different reason','Evidence A')$$,'23505',null,'conflicting retry reason rejected');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000013','Correction')$$,'23514',null,'waiver cannot be reversed as a deduction');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000020',' ')$$,'22023',null,'meaningful reversal reason required');
reset role;
select is((select jsonb_agg(to_jsonb(p) order by p.id) from public.payroll_records p),
  (select value from reversal_baseline where name='all_payroll_before_A'),'State A never mutates any payroll record');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d7500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000020','Correction')$$,'42501',null,'HR cannot reverse');
select set_config('request.jwt.claims','{"sub":"d7500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000020','Correction')$$,'42501',null,'Payroll cannot reverse');
select set_config('request.jwt.claims','{"sub":"d7500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000020','Correction')$$,'42501',null,'Rider cannot reverse');
select set_config('request.jwt.claims','{"sub":"d7500000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000020','Correction')$$,'42501',null,'Suspended Admin cannot reverse');
reset role;
set local role anon;
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000020','Correction')$$,'42501',null,'Anon cannot reverse');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d7500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.reverse_rider_absence_financial_consequence(p_consequence_id=>'e7500000-0000-4000-8000-000000000020',p_reversal_reason=>'Correction',p_applied_amount=>0)$$,'42883',null,'client cannot supply p_applied_amount');
select throws_ok($$select public.reverse_rider_absence_financial_consequence(p_consequence_id=>'e7500000-0000-4000-8000-000000000020',p_reversal_reason=>'Correction',p_payroll_id=>'a7500000-0000-4000-8000-000000000101'::uuid)$$,'42883',null,'client cannot supply p_payroll_id');
select throws_ok($$select public.reverse_rider_absence_financial_consequence(p_consequence_id=>'e7500000-0000-4000-8000-000000000020',p_reversal_reason=>'Correction',p_reversed_by=>'d7500000-0000-4000-8000-000000000002'::uuid)$$,'42883',null,'client cannot supply p_reversed_by');
select throws_ok($$select public.reverse_rider_absence_financial_consequence(p_consequence_id=>'e7500000-0000-4000-8000-000000000020',p_reversal_reason=>'Correction',p_earning_amount=>999)$$,'42883',null,'client cannot supply p_earning_amount');
select throws_ok($$select public.reverse_rider_absence_financial_consequence(p_consequence_id=>'e7500000-0000-4000-8000-000000000020',p_reversal_reason=>'Correction',p_obligation_id=>'b7500000-0000-4000-8000-000000000031'::uuid)$$,'42883',null,'client cannot supply p_obligation_id');
-- State B uses guarded aggregate synchronization after targeted deallocation.
select lives_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000003','Draft deduction error')$$,'draft allocation can be reversed');
select ok((select voided_at is not null from public.payroll_deduction_allocations where id='f7500000-0000-4000-8000-000000000003'),'draft allocation is voided, not deleted');
select is((select payroll_record_id from public.payroll_deduction_allocations where id='f7500000-0000-4000-8000-000000000003'),'a7500000-0000-4000-8000-000000000003'::uuid,'allocation retains historical payroll parent');
-- This ledger comparison reads restricted payroll_records through the
-- security-invoker balance view, so perform only these assertions as owner.
reset role;
select is((select deductions from public.payroll_records where id='a7500000-0000-4000-8000-000000000003'),75::numeric,'canonical synchronizer retains only unrelated draft deduction');
select is((select other_earnings from public.payroll_records where id='a7500000-0000-4000-8000-000000000003'),50::numeric,'unrelated earning total preserved');
set local role authenticated;
select ok((select voided_at is not null from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000003'),'B voids remaining obligation');
select is((select reversal_earning_id from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000003'),null::uuid,'B creates no compensation');
select lives_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000018','Rejected draft correction')$$,'uncommitted Rejected payroll is editable');

-- State C includes permanent commitment even after return to Draft.
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000004','Locked correction')$$,'55000','ABSENCE_REVERSAL_PAYROLL_LOCKED','Pending fails closed');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000004'),'confirmed'::text,'Pending leaves decision confirmed');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000004' and action='reversed'),0::bigint,'Pending creates no reversal audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000005','Locked correction')$$,'55000','ABSENCE_REVERSAL_PAYROLL_LOCKED','Approved fails closed');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000005'),'confirmed'::text,'Approved leaves decision confirmed');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000005' and action='reversed'),0::bigint,'Approved creates no reversal audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000006','Locked correction')$$,'55000','ABSENCE_REVERSAL_PAYROLL_LOCKED','formerly committed Draft fails closed');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000006'),'confirmed'::text,'formerly committed Draft leaves decision confirmed');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000006' and action='reversed'),0::bigint,'formerly committed Draft creates no reversal audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000014','Identity mismatch')$$,'23514',null,'mismatched obligation cannot be reversed');

-- Paid-state assertions follow the fail-closed target/partial-payment contract.
select lives_ok($$insert into reversal_ids values('D',public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000007','Paid deduction error','Evidence D'))$$,'fully paid deduction creates future compensation');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000007'),'reversed'::text,'D marks decision reversed');
select is((select e.adjustment_code from public.payroll_earning_adjustments e join public.rider_absence_financial_consequences c on c.reversal_earning_id=e.id where c.id='e7500000-0000-4000-8000-000000000007'),'other_earnings'::text,'compensation uses existing other_earnings');
select is((select e.amount from public.payroll_earning_adjustments e join public.rider_absence_financial_consequences c on c.reversal_earning_id=e.id where c.id='e7500000-0000-4000-8000-000000000007'),650::numeric,'refund equals historical applied amount');
select is((select e.reference from public.payroll_earning_adjustments e join public.rider_absence_financial_consequences c on c.reversal_earning_id=e.id where c.id='e7500000-0000-4000-8000-000000000007'),'ABS-REV:e7500000-0000-4000-8000-000000000007'::text,'ABS-REV reference is exact');
select is((select e.payroll_record_id from public.payroll_earning_adjustments e join public.rider_absence_financial_consequences c on c.reversal_earning_id=e.id where c.id='e7500000-0000-4000-8000-000000000007'),'a7500000-0000-4000-8000-000000000101'::uuid,'server selects unique future editable target');
select is(public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000007','Paid deduction error','Evidence D'),(select id from reversal_ids where name='D'),'paid reversal retry is idempotent');
select is((select count(*) from public.payroll_earning_adjustments where reference='ABS-REV:e7500000-0000-4000-8000-000000000007'),1::bigint,'paid retry creates no duplicate compensation');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000007' and action='reversed'),1::bigint,'paid retry creates no duplicate audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000008','Mixed recovery')$$,'55000','ABSENCE_REVERSAL_PAYROLL_LOCKED','mixed paid and draft debt cannot receive a full refund');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000019','Partial recovery')$$,'55000','ABSENCE_REVERSAL_PAYROLL_LOCKED','partially paid debt cannot receive a full refund');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000015','Wrong existing refund')$$,'23514',null,'mismatched ABS-REV fails closed');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000016','No future cutoff')$$,'55000','ABSENCE_REVERSAL_COMPENSATION_TARGET_REQUIRED','no editable target fails closed');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000017','Ambiguous future cutoff')$$,'55000','ABSENCE_REVERSAL_COMPENSATION_TARGET_REQUIRED','multiple targets fail closed');
reset role;

-- DB metadata enforcement also applies to privileged direct writes.
insert into reversal_baseline select 'future_payroll_after_D',to_jsonb(p)
from public.payroll_records p where id='a7500000-0000-4000-8000-000000000101';
select throws_ok($$insert into public.payroll_earning_adjustments(
  rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,reference,source,created_by
) select rider_id,hub_id,id,cutoff_start,cutoff_end,'other_earnings',650,cutoff_start,
  'Duplicate attempt','ABS-REV:e7500000-0000-4000-8000-000000000007','manual','d7500000-0000-4000-8000-000000000001'
from public.payroll_records where id='a7500000-0000-4000-8000-000000000101'$$,
  '23505',null,'unique ABS-REV reference prevents duplicate compensation at DB level');
select throws_ok($$update public.rider_absence_financial_consequences set status='reversed' where id='e7500000-0000-4000-8000-000000000020'$$,'23514',null,'reversed state requires complete metadata');
select throws_ok($$update public.rider_absence_financial_consequences set reversal_reason=' ' where id='e7500000-0000-4000-8000-000000000002'$$,'23514',null,'reversal reason cannot be blank');
select throws_ok($$update public.rider_absence_financial_consequences set reversed_by=null where id='e7500000-0000-4000-8000-000000000002'$$,'23514',null,'reversed_by cannot be removed');
select throws_ok($$update public.rider_absence_financial_consequences set reversed_at=null where id='e7500000-0000-4000-8000-000000000002'$$,'23514',null,'reversed_at cannot be removed');

create function pg_temp.reject_reversal_audit()
returns trigger language plpgsql as $$
begin
  if new.action='reversed' and new.consequence_id in ('e7500000-0000-4000-8000-000000000009','e7500000-0000-4000-8000-000000000010','e7500000-0000-4000-8000-000000000012') then
    raise exception 'Injected reversal audit failure' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger test_reversal_audit before insert on public.rider_absence_financial_consequence_audit_events
for each row execute function pg_temp.reject_reversal_audit();
create function pg_temp.reject_reversal_earning()
returns trigger language plpgsql as $$
begin
  if new.reference='ABS-REV:e7500000-0000-4000-8000-000000000011' then
    raise exception 'Injected earning failure' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger test_reversal_earning before insert on public.payroll_earning_adjustments
for each row execute function pg_temp.reject_reversal_earning();
set local role authenticated;
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000009','Atomic correction')$$,'P0001','Injected reversal audit failure','failure in case 9 aborts reversal');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000009'),'confirmed'::text,'failure 9 leaves consequence confirmed');
select ok((select voided_at is null from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000009'),'failure 9 leaves obligation unchanged');
select is((select count(*) from public.payroll_earning_adjustments where reference='ABS-REV:e7500000-0000-4000-8000-000000000009'),0::bigint,'failure 9 leaves compensation absent');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000009' and action='reversed'),0::bigint,'failure 9 leaves no reversal audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000010','Atomic correction')$$,'P0001','Injected reversal audit failure','failure in case 10 aborts reversal');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000010'),'confirmed'::text,'failure 10 leaves consequence confirmed');
select ok((select voided_at is null from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000010'),'failure 10 leaves obligation unchanged');
select is((select count(*) from public.payroll_earning_adjustments where reference='ABS-REV:e7500000-0000-4000-8000-000000000010'),0::bigint,'failure 10 leaves compensation absent');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000010' and action='reversed'),0::bigint,'failure 10 leaves no reversal audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000011','Atomic correction')$$,'P0001','Injected earning failure','failure in case 11 aborts reversal');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000011'),'confirmed'::text,'failure 11 leaves consequence confirmed');
select ok((select voided_at is null from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000011'),'failure 11 leaves obligation unchanged');
select is((select count(*) from public.payroll_earning_adjustments where reference='ABS-REV:e7500000-0000-4000-8000-000000000011'),0::bigint,'failure 11 leaves compensation absent');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000011' and action='reversed'),0::bigint,'failure 11 leaves no reversal audit');
select throws_ok($$select public.reverse_rider_absence_financial_consequence('e7500000-0000-4000-8000-000000000012','Atomic correction')$$,'P0001','Injected reversal audit failure','failure in case 12 aborts reversal');
select is((select status from public.rider_absence_financial_consequences where id='e7500000-0000-4000-8000-000000000012'),'confirmed'::text,'failure 12 leaves consequence confirmed');
select ok((select voided_at is null from public.payroll_deduction_obligations where id='b7500000-0000-4000-8000-000000000012'),'failure 12 leaves obligation unchanged');
select is((select count(*) from public.payroll_earning_adjustments where reference='ABS-REV:e7500000-0000-4000-8000-000000000012'),0::bigint,'failure 12 leaves compensation absent');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id='e7500000-0000-4000-8000-000000000012' and action='reversed'),0::bigint,'failure 12 leaves no reversal audit');
select ok((select voided_at is null from public.payroll_deduction_allocations where id='f7500000-0000-4000-8000-000000000010'),'B failure rolls back deallocation');
select is((select deductions from public.payroll_records where id='a7500000-0000-4000-8000-000000000010'),650::numeric,'B failure rolls back synchronized totals');
reset role;
select is((select to_jsonb(p) from public.payroll_records p where id='a7500000-0000-4000-8000-000000000101'),
  (select value from reversal_baseline where name='future_payroll_after_D'),'failed paid reversals roll back future Payroll aggregates');
select is((select jsonb_agg(to_jsonb(p) order by p.id) from public.payroll_records p where p.status='paid'),(select value from reversal_baseline where name='paid_payroll'),'paid_payroll unchanged');
select is((select jsonb_agg(to_jsonb(a) order by a.id) from public.payroll_deduction_allocations a join public.payroll_records p on p.id=a.payroll_record_id where p.status='paid'),(select value from reversal_baseline where name='paid_allocations'),'paid_allocations unchanged');
select is((select jsonb_agg(to_jsonb(o) order by o.id) from public.payroll_deduction_obligations o where exists(select 1 from public.payroll_deduction_allocations a join public.payroll_records p on p.id=a.payroll_record_id where a.deduction_obligation_id=o.id and p.status='paid')),(select value from reversal_baseline where name='paid_obligations'),'paid_obligations unchanged');
select is((select jsonb_agg(to_jsonb(p) order by p.id) from public.payroll_records p where p.id in ('a7500000-0000-4000-8000-000000000004','a7500000-0000-4000-8000-000000000005','a7500000-0000-4000-8000-000000000006')),(select value from reversal_baseline where name='locked_payroll'),'locked_payroll unchanged');
select is((select jsonb_agg(to_jsonb(a) order by a.id) from public.payroll_deduction_allocations a where a.payroll_record_id in ('a7500000-0000-4000-8000-000000000004','a7500000-0000-4000-8000-000000000005','a7500000-0000-4000-8000-000000000006')),(select value from reversal_baseline where name='locked_allocations'),'locked_allocations unchanged');
select is((select to_jsonb(e) from public.payroll_earning_adjustments e where id='b7500000-0000-4000-8000-000000000032'),(select value from reversal_baseline where name='unrelated_earning'),'unrelated_earning unchanged');
select is((select to_jsonb(a) from public.payroll_deduction_allocations a where id='f7500000-0000-4000-8000-000000000031'),(select value from reversal_baseline where name='unrelated_allocation'),'unrelated_allocation unchanged');
select is((select jsonb_agg(to_jsonb(c)-array['status','reversed_by','reversed_at','reversal_reason','reversal_evidence_reference','reversal_earning_id','updated_at'] order by c.id) from public.rider_absence_financial_consequences c where c.id::text like 'e7500000-%'),(select value from reversal_baseline where name='historical_decisions'),'historical_decisions unchanged');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.absence_policy_versions t),(select value from reversal_baseline where name='absence_policy_versions'),'absence_policy_versions unchanged');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.policy_version_id,t.rule_key),'[]'::jsonb) from public.absence_policy_rules t),(select value from reversal_baseline where name='absence_policy_rules'),'absence_policy_rules unchanged');
select is((select count(*) from public.payroll_deduction_obligations),
  (select jsonb_array_length(value)::bigint from reversal_baseline where name='payroll_deduction_obligations'),'reversal creates no new deduction obligations');
select * from finish();
rollback;
