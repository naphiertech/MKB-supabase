-- Phase 3 only. Run on an isolated database with migrations applied.
-- All policies, decisions, failure injection, and fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_function('public', 'confirm_rider_absence_financial_consequence',
  array['uuid', 'date', 'uuid', 'text', 'text', 'text'], 'Confirm RPC exists');
select has_function('public', 'waive_rider_absence_financial_consequence',
  array['uuid', 'date', 'uuid', 'text', 'text', 'text', 'text'], 'Waive RPC exists');
select has_column('public', 'absence_policy_rules', 'financial_penalty_amount', 'policy rule supplies amount');

insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a7300000-0000-4000-8000-000000000001', 'Decision Alpha', 1, 1, 100),
  ('a7300000-0000-4000-8000-000000000002', 'Decision Beta', 2, 2, 100);
insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('c7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', 'Decision Rider Alpha', 'TEST-AFD-A', 'afd-rider@example.test', 'active'),
  ('c7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000002', 'Decision Rider Beta', 'TEST-AFD-B', 'afd-rider-b@example.test', 'active');
insert into auth.users (id, email, email_confirmed_at) values
  ('d7300000-0000-4000-8000-000000000001', 'afd-admin@example.test', clock_timestamp()),
  ('d7300000-0000-4000-8000-000000000002', 'afd-hr@example.test', clock_timestamp()),
  ('d7300000-0000-4000-8000-000000000003', 'afd-payroll@example.test', clock_timestamp()),
  ('d7300000-0000-4000-8000-000000000004', 'afd-rider@example.test', clock_timestamp()),
  ('d7300000-0000-4000-8000-000000000005', 'afd-suspended@example.test', clock_timestamp()),
  ('d7300000-0000-4000-8000-000000000006', 'afd-archived@example.test', clock_timestamp());
insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status) values
  ('d7300000-0000-4000-8000-000000000001', 'Decision Admin', 'afd-admin@example.test', 'admin', null, 'global', 'active', 'active'),
  ('d7300000-0000-4000-8000-000000000002', 'Decision HR', 'afd-hr@example.test', 'hr', null, 'assigned', 'active', 'active'),
  ('d7300000-0000-4000-8000-000000000003', 'Decision Payroll', 'afd-payroll@example.test', 'payroll', null, 'global', 'active', 'active'),
  ('d7300000-0000-4000-8000-000000000004', 'Decision Rider', 'afd-rider@example.test', 'rider', 'c7300000-0000-4000-8000-000000000001', 'assigned', 'active', 'active'),
  ('d7300000-0000-4000-8000-000000000005', 'Suspended HR', 'afd-suspended@example.test', 'hr', null, 'global', 'suspended', 'active');
insert into public.users (
  id, full_name, email, role, hub_access_scope, status, employment_status,
  archive_effective_date, archive_reason, archived_at, archived_by
) values (
  'd7300000-0000-4000-8000-000000000006', 'Archived HR', 'afd-archived@example.test',
  'hr', 'global', 'suspended', 'archived', '2026-09-09', 'Test archive', clock_timestamp(), 'd7300000-0000-4000-8000-000000000001'
);
insert into public.user_hub_access (user_id, hub_id, assigned_by)
values ('d7300000-0000-4000-8000-000000000002', 'a7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001');

-- Non-eligible source facts and one denied request.
insert into public.attendance_logs (rider_id, hub_id, date, time_in, status)
values ('c7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', '2026-09-12', '2026-09-12 00:00:00+00', 'present');
insert into public.rider_schedules (
  rider_id, work_date, hub_id, day_kind, status, created_by, updated_by, published_by, published_at
) values ('c7300000-0000-4000-8000-000000000001', '2026-09-13', 'a7300000-0000-4000-8000-000000000001', 'day_off', 'published', 'd7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', 'd7300000-0000-4000-8000-000000000001', '2026-09-09 00:00:00+00');
insert into public.rider_absence_requests (
  rider_id, hub_id, request_kind, start_date, end_date, reason, submitted_by,
  submitted_at, status, reviewed_by, reviewed_at, review_reason, updated_by
)
select 'c7300000-0000-4000-8000-000000000001', 'a7300000-0000-4000-8000-000000000001', f.kind::public.rider_absence_request_kind, f.work_date::date, f.work_date::date,
  'Private fixture evidence', 'd7300000-0000-4000-8000-000000000001', '2026-09-09 00:00:00+00', f.status::public.rider_absence_request_status,
  case when f.status <> 'pending' then 'd7300000-0000-4000-8000-000000000001'::uuid end,
  case when f.status <> 'pending' then '2026-09-09 01:00:00+00'::timestamptz end,
  case when f.status <> 'pending' then 'Private review' end, 'd7300000-0000-4000-8000-000000000001'
from (values
  ('planned_leave', '2026-09-10', 'approved'),
  ('absence_notice', '2026-09-11', 'approved'),
  ('planned_leave', '2026-09-14', 'pending'),
  ('absence_notice', '2026-09-20', 'rejected'),
  ('planned_leave', '2026-09-21', 'rejected')
) f(kind, work_date, status);

create temporary table decision_baseline (name text primary key, value jsonb);
create temporary table decision_results (name text primary key, id uuid);
create temporary table decision_clock (started_at timestamptz);
insert into decision_clock values (clock_timestamp());
grant select, insert on decision_results to authenticated;
grant select on decision_clock to authenticated;
insert into decision_baseline select 'payroll_deduction_obligations', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_obligations t;
insert into decision_baseline select 'payroll_deduction_allocations', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_allocations t;
insert into decision_baseline select 'payroll_records', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_records t;
insert into decision_baseline select 'payroll_earning_adjustments', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_earning_adjustments t;
insert into decision_baseline select 'v1_version', to_jsonb(v) from public.absence_policy_versions v where version_number = 1;
insert into decision_baseline select 'v1_rules', jsonb_agg(to_jsonb(r) order by r.rule_key)
from public.absence_policy_rules r join public.absence_policy_versions v on v.id = r.policy_version_id where v.version_number = 1;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human confirmation')$$, '55000', null, 'Confirm fails without active official V2');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-17', 'f7300000-0000-4000-8000-000000000003', 'Test Supervisor', 'Human waiver', 'emergency')$$, '55000', null, 'Waive fails without active official V2');
reset role;

-- Policy fixture is created as draft, rules inserted while mutable, then
-- published. Existing published V1 is never changed or its guards disabled.
insert into public.absence_policy_versions (
  id, version_number, policy_name, policy_type, lifecycle, effective_from, created_by
) values ('b7300000-0000-4000-8000-000000000002', 2, 'Transaction-local official V2', 'official', 'draft', '2026-09-10', 'd7300000-0000-4000-8000-000000000001');
insert into public.absence_policy_rules (
  policy_version_id, rule_key, assessment_status, reason_code, priority, financial_penalty_amount
)
select 'b7300000-0000-4000-8000-000000000002', r.rule_key, r.assessment_status, r.reason_code, r.priority,
  -- Leave one eligible rule unconfigured to exercise the fail-closed amount gate.
  case when r.rule_key in ('no_notice', 'leave_rejected') then 500.00::numeric end
from public.absence_policy_rules r
join public.absence_policy_versions v on v.id = r.policy_version_id
where v.version_number = 1;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human confirmation')$$, '55000', null, 'Draft V2 cannot authorize a decision');
reset role;
select throws_ok($$update public.absence_policy_rules set financial_penalty_amount = 0 where policy_version_id = 'b7300000-0000-4000-8000-000000000002' and rule_key = 'no_notice'$$, '23514', null, 'zero policy amount rejected');
select throws_ok($$update public.absence_policy_rules set financial_penalty_amount = 'NaN' where policy_version_id = 'b7300000-0000-4000-8000-000000000002' and rule_key = 'no_notice'$$, '23514', null, 'NaN policy amount rejected');
update public.absence_policy_versions
set lifecycle = 'published', published_at = clock_timestamp()
where id = 'b7300000-0000-4000-8000-000000000002';
select throws_ok($$update public.absence_policy_rules set financial_penalty_amount = 750 where policy_version_id = 'b7300000-0000-4000-8000-000000000002' and rule_key = 'no_notice'$$,
  '55000', null, 'published amount inherits existing immutability guard');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-09', 'f7300000-0000-4000-8000-000000000090', 'Test Supervisor', 'Human confirmation')$$, '55000', null, 'dates before V2 effective date cannot be decided');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-20', 'f7300000-0000-4000-8000-000000000092', 'Test Supervisor', 'Human confirmation')$$,
  '55000', 'POLICY_AMOUNT_REQUIRED: The active V2 rule has no configured penalty amount.', 'Confirm cannot invent a missing policy amount');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-20', 'f7300000-0000-4000-8000-000000000093', 'Test Supervisor', 'Human waiver', 'emergency')$$,
  '55000', 'POLICY_AMOUNT_REQUIRED: The active V2 rule has no configured penalty amount.', 'Waive also requires a configured original policy amount');
select lives_ok($$insert into decision_results values ('confirm', public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human confirmation'))$$, 'Admin confirms eligible no-notice absence');
select is((select policy_version_id from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'b7300000-0000-4000-8000-000000000002'::uuid, 'snapshots applicable official V2');
select is((select policy_penalty_amount from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 500.00::numeric, 'snapshots configured PHP 500 policy amount');
select is((select applied_amount from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 500.00::numeric, 'Confirm applies full snapshot amount');
select is((select currency from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'PHP'::text, 'currency is server supplied');
select is((select status from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'confirmed'::text, 'confirmed status persisted');
select is((select financial_eligibility_reason from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'absence_without_prior_notice'::text, 'eligibility reason comes from evaluator');
select is((select hub_id from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'a7300000-0000-4000-8000-000000000001'::uuid, 'Hub comes from date context');
select is((select decided_by from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'd7300000-0000-4000-8000-000000000001'::uuid, 'actor comes from authenticated identity');
select ok((select decided_at between (select started_at from decision_clock) and clock_timestamp()
  from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'decision time is generated by server');
select is((select count(*) from public.rider_absence_financial_consequences where rider_id = 'c7300000-0000-4000-8000-000000000001' and business_date = '2026-09-15'), 1::bigint, 'first Confirm creates one consequence');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'confirm')), 1::bigint, 'first Confirm creates one audit event');
select is((select new_values from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'confirm')),
  (select to_jsonb(c) from public.rider_absence_financial_consequences c where confirmation_key = 'f7300000-0000-4000-8000-000000000001'), 'audit snapshots the created row');
select is((select actor_id from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'confirm')), 'd7300000-0000-4000-8000-000000000001'::uuid, 'audit actor is authenticated user');
select ok((select old_values is null from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'confirm')), 'creation audit has null before values');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_policy_penalty_amount => 1)$$, '42883', null, 'client cannot supply p_policy_penalty_amount');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_applied_amount => 1)$$, '42883', null, 'client cannot supply p_applied_amount');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_hub_id => 'a7300000-0000-4000-8000-000000000002'::uuid)$$, '42883', null, 'client cannot supply p_hub_id');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_policy_version_id => 'b7300000-0000-4000-8000-000000000002'::uuid)$$, '42883', null, 'client cannot supply p_policy_version_id');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_financial_eligibility_reason => 'approved_leave')$$, '42883', null, 'client cannot supply p_financial_eligibility_reason');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_attendance_context_code => 'no_notice')$$, '42883', null, 'client cannot supply p_attendance_context_code');
select throws_ok($$select public.confirm_rider_absence_financial_consequence(p_rider_id => 'c7300000-0000-4000-8000-000000000001', p_business_date => '2026-09-19',
  p_confirmation_key => 'f7300000-0000-4000-8000-000000000080', p_supervisor_name => 'Test Supervisor', p_decision_notes => 'Human confirmation',
  p_decided_by => 'd7300000-0000-4000-8000-000000000002'::uuid)$$, '42883', null, 'client cannot supply p_decided_by');
select is(public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human confirmation'), (select id from decision_results where name = 'confirm'), 'same confirmation key and payload returns original ID');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'confirm')), 1::bigint, 'retry adds no audit');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000091', 'Test Supervisor', 'Human confirmation')$$, '23505', null, 'different key cannot overwrite decided Rider date');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human confirmation')$$, '23505', null, 'same key cannot be rebound to another date');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Other Supervisor', 'Human confirmation')$$, '23505', null, 'same key with different payload conflicts');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human waiver', 'emergency')$$, '23505', null, 'Confirm key cannot become Waive');

select lives_ok($$insert into decision_results values ('waive_emergency', public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-17', 'f7300000-0000-4000-8000-000000000003', 'Test Supervisor', 'Human waiver', 'emergency'))$$, 'Admin waives eligible absence');
select is((select status from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000003'), 'waived_emergency'::text, 'emergency category derives status');
select is((select applied_amount from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000003'), 0.00::numeric, 'emergency waiver applies zero');
select is((select policy_penalty_amount from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000003'), 500.00::numeric, 'waiver retains original policy amount');
select is((select waiver_reason_category from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000003'), 'emergency'::text, 'waiver category is persisted');
select is((select count(*) from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000003'), 1::bigint, 'first waiver creates one consequence');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'waive_emergency')), 1::bigint, 'first waiver creates one audit');
select is((select action from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'waive_emergency')), 'waived_emergency'::text, 'waiver audit action matches status');
select is(public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-17', 'f7300000-0000-4000-8000-000000000003', 'Test Supervisor', 'Human waiver', 'emergency'), (select id from decision_results where name = 'waive_emergency'), 'waiver retry is idempotent');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = (select id from decision_results where name = 'waive_emergency')), 1::bigint, 'waiver retry adds no audit');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000081', 'Test Supervisor', 'Human waiver', '')$$, '22023', null, 'invalid waiver category rejected: empty');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000081', 'Test Supervisor', 'Human waiver', ' ')$$, '22023', null, 'invalid waiver category rejected:  ');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000081', 'Test Supervisor', 'Human waiver', 'unknown')$$, '22023', null, 'invalid waiver category rejected: unknown');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000081', 'Test Supervisor', 'Human waiver', null)$$, '22023', null, 'null waiver category rejected');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-10', 'f7300000-0000-4000-8000-000000000110', 'Test Supervisor', 'Human confirmation')$$, '23514', null, 'approved leave cannot be confirmed');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-10', 'f7300000-0000-4000-8000-000000000210', 'Test Supervisor', 'Human waiver', 'emergency')$$, '23514', null, 'approved leave cannot be waived');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-11', 'f7300000-0000-4000-8000-000000000111', 'Test Supervisor', 'Human confirmation')$$, '23514', null, 'accepted notice cannot be confirmed');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-11', 'f7300000-0000-4000-8000-000000000211', 'Test Supervisor', 'Human waiver', 'emergency')$$, '23514', null, 'accepted notice cannot be waived');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-12', 'f7300000-0000-4000-8000-000000000112', 'Test Supervisor', 'Human confirmation')$$, '23514', null, 'actual attendance cannot be confirmed');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-12', 'f7300000-0000-4000-8000-000000000212', 'Test Supervisor', 'Human waiver', 'emergency')$$, '23514', null, 'actual attendance cannot be waived');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-13', 'f7300000-0000-4000-8000-000000000113', 'Test Supervisor', 'Human confirmation')$$, '23514', null, 'published day off cannot be confirmed');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-13', 'f7300000-0000-4000-8000-000000000213', 'Test Supervisor', 'Human waiver', 'emergency')$$, '23514', null, 'published day off cannot be waived');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-14', 'f7300000-0000-4000-8000-000000000114', 'Test Supervisor', 'Human confirmation')$$, '23514', null, 'pending request cannot be confirmed');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-14', 'f7300000-0000-4000-8000-000000000214', 'Test Supervisor', 'Human waiver', 'emergency')$$, '23514', null, 'pending request cannot be waived');
select lives_ok($$insert into decision_results values ('denied', public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-21', 'f7300000-0000-4000-8000-000000000005', 'Test Supervisor', 'Human confirmation'))$$, 'denied request can be confirmed');
select is((select financial_eligibility_reason from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000005'), 'denied_unauthorized_absence'::text, 'denied eligibility snapshots correct reason');
select is((select absence_request_id from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000005'),
  (select id from public.rider_absence_requests where rider_id = 'c7300000-0000-4000-8000-000000000001' and start_date = '2026-09-21'), 'selected request provenance is snapshotted');

select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$insert into decision_results values ('hr_confirm', public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-16', 'f7300000-0000-4000-8000-000000000002', 'Test Supervisor', 'Human confirmation'))$$, 'HR confirms in authorized Hub');
select is((select decided_by from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000002'), 'd7300000-0000-4000-8000-000000000002'::uuid, 'HR actor snapshot is correct');
select lives_ok($$insert into decision_results values ('waive_excused', public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-18', 'f7300000-0000-4000-8000-000000000004', 'Test Supervisor', 'Human waiver', 'excused'))$$, 'HR waives in authorized Hub');
select is((select status from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000004'), 'waived_excused'::text, 'excused category derives status');
select is((select applied_amount from public.rider_absence_financial_consequences where confirmation_key = 'f7300000-0000-4000-8000-000000000004'), 0.00::numeric, 'excused waiver applies zero');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000002', '2026-09-19', 'f7300000-0000-4000-8000-000000000082', 'Test Supervisor', 'Human confirmation')$$, '42501', null, 'HR cannot confirm another Hub');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000002', '2026-09-19', 'f7300000-0000-4000-8000-000000000083', 'Test Supervisor', 'Human waiver', 'emergency')$$, '42501', null, 'HR cannot waive another Hub');
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-15', 'f7300000-0000-4000-8000-000000000001', 'Test Supervisor', 'Human confirmation')$$, '23505', null, 'another actor cannot replay someone else decision key');
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000084', 'Test Supervisor', 'Human confirmation')$$, '42501', null, 'Payroll cannot confirm');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000085', 'Test Supervisor', 'Human waiver', 'emergency')$$, '42501', null, 'Payroll cannot waive');
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000084', 'Test Supervisor', 'Human confirmation')$$, '42501', null, 'Rider cannot confirm');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000085', 'Test Supervisor', 'Human waiver', 'emergency')$$, '42501', null, 'Rider cannot waive');
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000084', 'Test Supervisor', 'Human confirmation')$$, '42501', null, 'Suspended HR cannot confirm');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000085', 'Test Supervisor', 'Human waiver', 'emergency')$$, '42501', null, 'Suspended HR cannot waive');
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000084', 'Test Supervisor', 'Human confirmation')$$, '42501', null, 'Archived HR cannot confirm');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000085', 'Test Supervisor', 'Human waiver', 'emergency')$$, '42501', null, 'Archived HR cannot waive');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000086', 'Test Supervisor', 'Human confirmation')$$, '42501', null, 'Anon cannot confirm');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-19', 'f7300000-0000-4000-8000-000000000087', 'Test Supervisor', 'Human waiver', 'emergency')$$, '42501', null, 'Anon cannot waive');
reset role;

-- Owner-level constraint tests prove that the RPC is not the only guard.
select throws_ok($$update public.rider_absence_financial_consequences set waiver_reason_category = null where confirmation_key = 'f7300000-0000-4000-8000-000000000003'$$,
  '23514', null, 'emergency waiver requires non-null category at DB level');
select throws_ok($$update public.rider_absence_financial_consequences set waiver_reason_category = ' ' where confirmation_key = 'f7300000-0000-4000-8000-000000000004'$$,
  '23514', null, 'excused waiver requires nonblank category at DB level');
select is((select count(*) from public.rider_absence_financial_consequences where rider_id in ('c7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002')),
  5::bigint, 'only five explicit successful decisions persisted');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events a
  join public.rider_absence_financial_consequences c on c.id = a.consequence_id where c.rider_id in ('c7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002')),
  5::bigint, 'failed decision operations leave no extra audit events');

-- Transaction-local failure injection: do not disable any existing protections.
create function pg_temp.reject_decision_audit_for_test()
returns trigger language plpgsql as $$
begin
  if new.new_values ->> 'confirmation_key' in ('f7300000-0000-4000-8000-000000000088', 'f7300000-0000-4000-8000-000000000089') then
    raise exception 'Injected audit failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_reject_decision_audit
before insert on public.rider_absence_financial_consequence_audit_events
for each row execute function pg_temp.reject_decision_audit_for_test();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.confirm_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-22', 'f7300000-0000-4000-8000-000000000088', 'Test Supervisor', 'Human confirmation')$$, 'P0001', 'Injected audit failure', 'audit failure aborts Confirm');
select throws_ok($$select public.waive_rider_absence_financial_consequence('c7300000-0000-4000-8000-000000000001', '2026-09-23', 'f7300000-0000-4000-8000-000000000089', 'Test Supervisor', 'Human waiver', 'emergency')$$, 'P0001', 'Injected audit failure', 'audit failure aborts Waive');
select is((select count(*) from public.rider_absence_financial_consequences where confirmation_key in ('f7300000-0000-4000-8000-000000000088', 'f7300000-0000-4000-8000-000000000089')), 0::bigint, 'audit failures roll back both consequence inserts');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where new_values ->> 'confirmation_key' in ('f7300000-0000-4000-8000-000000000088', 'f7300000-0000-4000-8000-000000000089')), 0::bigint, 'audit failures leave no events');
reset role;

select ok(not has_function_privilege('authenticated',
  'private.record_rider_absence_financial_decision(uuid,date,uuid,text,text,text,text,text)', 'EXECUTE'), 'clients cannot call shared private writer');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'INSERT'), 'no direct client INSERT grant');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'UPDATE'), 'no direct client UPDATE grant');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'DELETE'), 'no direct client DELETE grant');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_obligations t),
  (select value from decision_baseline where name = 'payroll_deduction_obligations'), 'payroll_deduction_obligations unchanged by Confirm and Waive');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_allocations t),
  (select value from decision_baseline where name = 'payroll_deduction_allocations'), 'payroll_deduction_allocations unchanged by Confirm and Waive');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_records t),
  (select value from decision_baseline where name = 'payroll_records'), 'payroll_records unchanged by Confirm and Waive');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_earning_adjustments t),
  (select value from decision_baseline where name = 'payroll_earning_adjustments'), 'payroll_earning_adjustments unchanged by Confirm and Waive');
select is((select to_jsonb(v) from public.absence_policy_versions v where version_number = 1),
  (select value from decision_baseline where name = 'v1_version'), 'published V1 version untouched');
select is((select jsonb_agg(to_jsonb(r) order by r.rule_key) from public.absence_policy_rules r
  join public.absence_policy_versions v on v.id = r.policy_version_id where v.version_number = 1),
  (select value from decision_baseline where name = 'v1_rules'), 'published V1 rules untouched');
select ok(not exists (select 1 from public.rider_absence_financial_consequences
  where rider_id in ('c7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002') and (deduction_obligation_id is not null or reversal_earning_id is not null)),
  'decisions have no Payroll links');
select * from finish();
rollback;
