-- Run only against an isolated database with repository migrations applied.
-- Fixtures and assertions roll back; this test never recreates production DDL.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'rider_absence_financial_consequences', 'consequence table exists');
select has_table('public', 'rider_absence_financial_consequence_audit_events', 'audit table exists');
select has_column('public', 'rider_absence_financial_consequences', 'id', 'id exists');
select has_column('public', 'rider_absence_financial_consequences', 'rider_id', 'rider_id exists');
select has_column('public', 'rider_absence_financial_consequences', 'hub_id', 'hub_id exists');
select has_column('public', 'rider_absence_financial_consequences', 'business_date', 'business_date exists');
select has_column('public', 'rider_absence_financial_consequences', 'absence_request_id', 'absence_request_id exists');
select has_column('public', 'rider_absence_financial_consequences', 'attendance_context_code', 'attendance_context_code exists');
select has_column('public', 'rider_absence_financial_consequences', 'policy_version_id', 'policy_version_id exists');
select has_column('public', 'rider_absence_financial_consequences', 'financial_eligibility_reason', 'financial_eligibility_reason exists');
select has_column('public', 'rider_absence_financial_consequences', 'policy_penalty_amount', 'policy_penalty_amount exists');
select has_column('public', 'rider_absence_financial_consequences', 'applied_amount', 'applied_amount exists');
select has_column('public', 'rider_absence_financial_consequences', 'currency', 'currency exists');
select has_column('public', 'rider_absence_financial_consequences', 'status', 'status exists');
select has_column('public', 'rider_absence_financial_consequences', 'confirmation_key', 'confirmation_key exists');
select has_column('public', 'rider_absence_financial_consequences', 'decided_by', 'decided_by exists');
select has_column('public', 'rider_absence_financial_consequences', 'decided_at', 'decided_at exists');
select has_column('public', 'rider_absence_financial_consequences', 'supervisor_name', 'supervisor_name exists');
select has_column('public', 'rider_absence_financial_consequences', 'decision_notes', 'decision_notes exists');
select has_column('public', 'rider_absence_financial_consequences', 'waiver_reason_category', 'waiver_reason_category exists');
select has_column('public', 'rider_absence_financial_consequences', 'evidence_reference', 'evidence_reference exists');
select has_column('public', 'rider_absence_financial_consequences', 'deduction_obligation_id', 'deduction_obligation_id exists');
select has_column('public', 'rider_absence_financial_consequences', 'reversed_by', 'reversed_by exists');
select has_column('public', 'rider_absence_financial_consequences', 'reversed_at', 'reversed_at exists');
select has_column('public', 'rider_absence_financial_consequences', 'reversal_reason', 'reversal_reason exists');
select has_column('public', 'rider_absence_financial_consequences', 'reversal_earning_id', 'reversal_earning_id exists');
select has_column('public', 'rider_absence_financial_consequences', 'created_at', 'created_at exists');
select has_column('public', 'rider_absence_financial_consequences', 'updated_at', 'updated_at exists');

select col_is_unique('public', 'rider_absence_financial_consequences', array['rider_id', 'business_date'], 'one decision per Rider business date');
select col_is_unique('public', 'rider_absence_financial_consequences', 'confirmation_key', 'confirmation key is unique');

insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a7100000-0000-4000-8000-000000000001', 'Financial Foundation Alpha', 1, 1, 100),
  ('a7100000-0000-4000-8000-000000000002', 'Financial Foundation Beta', 2, 2, 100);
insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('c7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001', 'Foundation Rider Alpha', 'TEST-AFF-A', 'aff-rider-a@example.test', 'active'),
  ('c7100000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000002', 'Foundation Rider Beta', 'TEST-AFF-B', 'aff-rider-b@example.test', 'active');
insert into auth.users (id, email, email_confirmed_at) values
  ('d7100000-0000-4000-8000-000000000001', 'aff-admin@example.test', clock_timestamp()),
  ('d7100000-0000-4000-8000-000000000002', 'aff-hr@example.test', clock_timestamp()),
  ('d7100000-0000-4000-8000-000000000003', 'aff-payroll@example.test', clock_timestamp()),
  ('d7100000-0000-4000-8000-000000000004', 'aff-rider-a@example.test', clock_timestamp());
insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status) values
  ('d7100000-0000-4000-8000-000000000001', 'Foundation Admin', 'aff-admin@example.test', 'admin', null, 'global', 'active', 'active'),
  ('d7100000-0000-4000-8000-000000000002', 'Foundation HR', 'aff-hr@example.test', 'hr', null, 'assigned', 'active', 'active'),
  ('d7100000-0000-4000-8000-000000000003', 'Foundation Payroll', 'aff-payroll@example.test', 'payroll', null, 'global', 'active', 'active'),
  ('d7100000-0000-4000-8000-000000000004', 'Foundation Rider', 'aff-rider-a@example.test', 'rider', 'c7100000-0000-4000-8000-000000000001', 'assigned', 'active', 'active');
insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('d7100000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001');

-- Existing V1 is referenced only as a FK fixture; no policy is created or changed.
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, status,
  confirmation_key, decided_by, supervisor_name, decision_notes
)
select
  ('e7100000-0000-4000-8000-00000000000' || n)::uuid,
  ('c7100000-0000-4000-8000-00000000000' || n)::uuid,
  ('a7100000-0000-4000-8000-00000000000' || n)::uuid,
  date '2026-09-24', 'no_notice', policy.id,
  'absence_without_prior_notice', 750, 750, 'confirmed',
  ('f7100000-0000-4000-8000-00000000000' || n)::uuid,
  'd7100000-0000-4000-8000-000000000001', 'Test Supervisor', 'Explicit test decision'
from generate_series(1, 2) n
cross join public.absence_policy_versions policy
where policy.version_number = 1;
select is((select count(*) from public.rider_absence_financial_consequences
  where id in ('e7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002')),
  2::bigint, 'valid confirmed decisions accept a policy amount other than 500');
select throws_ok($$update public.rider_absence_financial_consequences set policy_penalty_amount = 0, applied_amount = 0 where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'zero policy penalty rejected');
select throws_ok($$update public.rider_absence_financial_consequences set policy_penalty_amount = -1, applied_amount = 0 where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'negative policy penalty rejected');
select throws_ok($$update public.rider_absence_financial_consequences set policy_penalty_amount = 'NaN', applied_amount = 'NaN' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'NaN cannot bypass monetary checks');
select throws_ok($$update public.rider_absence_financial_consequences set applied_amount = -1 where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'negative applied amount rejected');
select throws_ok($$update public.rider_absence_financial_consequences set applied_amount = 751 where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'amount above policy rejected');
select throws_ok($$update public.rider_absence_financial_consequences set applied_amount = 749 where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'partial confirmed amount rejected');
select throws_ok($$update public.rider_absence_financial_consequences set status = 'waived_emergency' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'emergency waiver with nonzero amount rejected');
select throws_ok($$update public.rider_absence_financial_consequences set status = 'waived_excused' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'excused waiver with nonzero amount rejected');
select throws_ok($$update public.rider_absence_financial_consequences set status = 'pending_confirmation' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'derived pending state cannot be stored');
select throws_ok($$update public.rider_absence_financial_consequences set status = 'invalid' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'unknown status rejected');
select throws_ok($$update public.rider_absence_financial_consequences set financial_eligibility_reason = 'approved_leave' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'approved leave is not financial eligibility');
select throws_ok($$update public.rider_absence_financial_consequences set supervisor_name = ' ' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'blank supervisor rejected');
select throws_ok($$update public.rider_absence_financial_consequences set decision_notes = ' ' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'blank decision notes rejected');
select throws_ok($$update public.rider_absence_financial_consequences set supervisor_name = repeat('x', 121) where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'oversized supervisor rejected');
select throws_ok($$update public.rider_absence_financial_consequences set decision_notes = repeat('x', 501) where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'oversized decision notes rejected');
select throws_ok($$update public.rider_absence_financial_consequences set evidence_reference = repeat('x', 201) where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'oversized reference rejected');
select throws_ok($$update public.rider_absence_financial_consequences set reversal_reason = repeat('x', 501) where id = 'e7100000-0000-4000-8000-000000000001'$$, '23514', null, 'oversized reversal reason rejected');
select throws_ok($$update public.rider_absence_financial_consequences set rider_id = 'c7100000-0000-4000-8000-000000000002' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23505', null, 'duplicate Rider date rejected');
select throws_ok($$update public.rider_absence_financial_consequences set confirmation_key = 'f7100000-0000-4000-8000-000000000002' where id = 'e7100000-0000-4000-8000-000000000001'$$, '23505', null, 'duplicate confirmation key rejected');
select lives_ok($$update public.rider_absence_financial_consequences set status = 'waived_emergency', applied_amount = 0, waiver_reason_category = 'emergency' where id = 'e7100000-0000-4000-8000-000000000001'$$, 'waived_emergency accepts zero');
select lives_ok($$update public.rider_absence_financial_consequences set status = 'waived_excused', applied_amount = 0, waiver_reason_category = 'excused' where id = 'e7100000-0000-4000-8000-000000000001'$$, 'waived_excused accepts zero');
update public.rider_absence_financial_consequences set status = 'confirmed', applied_amount = 750 where id = 'e7100000-0000-4000-8000-000000000001';
select throws_ok($$update public.rider_absence_financial_consequences set status = 'reversed', applied_amount = 0 where id = 'e7100000-0000-4000-8000-000000000001'$$,
  '23514', null, 'reversal cannot erase historical applied amount');
select lives_ok($$update public.rider_absence_financial_consequences set status = 'reversed', reversed_by = 'd7100000-0000-4000-8000-000000000001', reversed_at = clock_timestamp(), reversal_reason = 'Corrected test decision' where id = 'e7100000-0000-4000-8000-000000000001'$$, 'reversal preserves original amount');
select is((select applied_amount from public.rider_absence_financial_consequences where id = 'e7100000-0000-4000-8000-000000000001'), 750.00::numeric, 'reversed amount remains historical');
select throws_ok($$update public.rider_absence_financial_consequences set applied_amount = 0 where id = 'e7100000-0000-4000-8000-000000000001'$$,
  '23514', null, 'later updates cannot erase a reversed amount');
select lives_ok($$update public.rider_absence_financial_consequences set financial_eligibility_reason = 'denied_unauthorized_absence' where id = 'e7100000-0000-4000-8000-000000000002'$$,
  'denied unauthorized absence is an allowed eligibility reason');

insert into public.rider_absence_financial_consequence_audit_events
  (consequence_id, action, actor_id, old_values, new_values)
select id, status, decided_by, null, to_jsonb(c)
from public.rider_absence_financial_consequences c
where id in ('e7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002');
-- Owner-level attempts prove trigger protection independently of client grants/RLS.
select throws_ok($$update public.rider_absence_financial_consequence_audit_events set action = 'reversed'$$,
  '42501', null, 'audit UPDATE rejected even for table owner');
select throws_ok($$delete from public.rider_absence_financial_consequence_audit_events$$,
  '42501', null, 'audit DELETE rejected even for table owner');
select ok((select relrowsecurity from pg_class where oid = 'public.rider_absence_financial_consequences'::regclass), 'public.rider_absence_financial_consequences has RLS');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'INSERT'), 'clients have no INSERT on public.rider_absence_financial_consequences');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'UPDATE'), 'clients have no UPDATE on public.rider_absence_financial_consequences');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'DELETE'), 'clients have no DELETE on public.rider_absence_financial_consequences');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequences', 'TRUNCATE'), 'clients have no TRUNCATE on public.rider_absence_financial_consequences');
select ok((select relrowsecurity from pg_class where oid = 'public.rider_absence_financial_consequence_audit_events'::regclass), 'public.rider_absence_financial_consequence_audit_events has RLS');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequence_audit_events', 'INSERT'), 'clients have no INSERT on public.rider_absence_financial_consequence_audit_events');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequence_audit_events', 'UPDATE'), 'clients have no UPDATE on public.rider_absence_financial_consequence_audit_events');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequence_audit_events', 'DELETE'), 'clients have no DELETE on public.rider_absence_financial_consequence_audit_events');
select ok(not has_table_privilege('authenticated', 'public.rider_absence_financial_consequence_audit_events', 'TRUNCATE'), 'clients have no TRUNCATE on public.rider_absence_financial_consequence_audit_events');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.rider_absence_financial_consequences where business_date = date '2026-09-24'
  and rider_id in ('c7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002')),
  2::bigint, 'Admin reads both hubs');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events
  where consequence_id in ('e7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002')),
  2::bigint, 'Admin reads both hubs for audit rows');
select set_config('request.jwt.claims', '{"sub":"d7100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.rider_absence_financial_consequences where business_date = date '2026-09-24'
  and rider_id in ('c7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002')),
  1::bigint, 'HR reads authorized hub');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events
  where consequence_id in ('e7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002')),
  1::bigint, 'HR reads authorized hub for audit rows');
select is((select count(*) from public.rider_absence_financial_consequences where hub_id = 'a7100000-0000-4000-8000-000000000002'), 0::bigint, 'HR cannot read unauthorized hub');
select set_config('request.jwt.claims', '{"sub":"d7100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.rider_absence_financial_consequences where business_date = date '2026-09-24'
  and rider_id in ('c7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002')),
  0::bigint, 'Payroll cannot read base rows');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events
  where consequence_id in ('e7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002')),
  0::bigint, 'Payroll cannot read base rows for audit rows');
select set_config('request.jwt.claims', '{"sub":"d7100000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from public.rider_absence_financial_consequences where business_date = date '2026-09-24'
  and rider_id in ('c7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002')),
  0::bigint, 'Rider cannot read own base row');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events
  where consequence_id in ('e7100000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000002')),
  0::bigint, 'Rider cannot read own base row for audit rows');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.rider_absence_financial_consequences$$, '42501', null, 'Anon cannot read consequences');
select throws_ok($$select * from public.rider_absence_financial_consequence_audit_events$$, '42501', null, 'Anon cannot read audit');
reset role;
select * from finish();
rollback;
