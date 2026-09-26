-- Phase 4 only. Isolated database with migrations applied; all fixtures,
-- failure-injection triggers, and test writes are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select has_function('public', 'materialize_absence_financial_deduction_obligation',
  array['uuid'], 'bridge accepts only the existing consequence ID');

insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a7400000-0000-4000-8000-000000000001', 'Bridge Historical Hub', 1, 1, 100),
  ('a7400000-0000-4000-8000-000000000002', 'Bridge Current Hub', 2, 2, 100);
-- The current Rider hub deliberately differs from the first decision snapshot.
insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('c7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000002', 'Bridge Rider Alpha', 'TEST-AFB-A', 'afb-rider@example.test', 'active'),
  ('c7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000002', 'Bridge Rider Beta', 'TEST-AFB-B', 'afb-rider-b@example.test', 'active');
insert into auth.users (id, email, email_confirmed_at) values
  ('d7400000-0000-4000-8000-000000000001', 'afb-admin@example.test', clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000002', 'afb-hr@example.test', clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000003', 'afb-payroll@example.test', clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000004', 'afb-rider@example.test', clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000005', 'afb-suspended@example.test', clock_timestamp());
insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status) values
  ('d7400000-0000-4000-8000-000000000001', 'Bridge Admin', 'afb-admin@example.test', 'admin', null, 'global', 'active', 'active'),
  ('d7400000-0000-4000-8000-000000000002', 'Bridge HR', 'afb-hr@example.test', 'hr', null, 'assigned', 'active', 'active'),
  ('d7400000-0000-4000-8000-000000000003', 'Bridge Payroll', 'afb-payroll@example.test', 'payroll', null, 'global', 'active', 'active'),
  ('d7400000-0000-4000-8000-000000000004', 'Bridge Rider', 'afb-rider@example.test', 'rider', 'c7400000-0000-4000-8000-000000000001', 'assigned', 'active', 'active'),
  ('d7400000-0000-4000-8000-000000000005', 'Suspended Admin', 'afb-suspended@example.test', 'admin', null, 'global', 'suspended', 'active');
insert into public.user_hub_access (user_id, hub_id, assigned_by)
values ('d7400000-0000-4000-8000-000000000002', 'a7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001');

-- Pre-existing human-decision snapshots, not Phase 3 actions. V1 is referenced
-- only as a FK fixture. No active V2 is needed by this historical bridge, and
-- the intentionally non-500 snapshot proves there is no policy recalculation.
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, currency,
  status, confirmation_key, decided_by, supervisor_name, decision_notes, waiver_reason_category,
  reversed_by, reversed_at, reversal_reason
)
select
  ('e7400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'c7400000-0000-4000-8000-000000000001',
  case when n = 22 then 'a7400000-0000-4000-8000-000000000002'::uuid else 'a7400000-0000-4000-8000-000000000001'::uuid end,
  date '2026-08-01' + n, 'no_notice', p.id,
  'absence_without_prior_notice', 725.50,
  case when n in (2, 3, 5) then 0 else 725.50 end,
  case when n = 25 then 'USD' else 'PHP' end,
  case when n = 2 then 'waived_emergency' when n = 3 then 'waived_excused'
    when n in (4, 5) then 'reversed' else 'confirmed' end,
  ('f7400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd7400000-0000-4000-8000-000000000001', 'Test Supervisor', 'PRIVATE DECISION NOTES',
  case when n = 2 then 'emergency' when n = 3 then 'excused' end,
  case when n in (4, 5) then 'd7400000-0000-4000-8000-000000000001'::uuid end,
  case when n in (4, 5) then clock_timestamp() end,
  case when n in (4, 5) then 'Reversed fixture decision' end
from generate_series(1, 26) n
cross join public.absence_policy_versions p where p.version_number = 1;

-- Existing obligations exercise matching, identity mismatch, prior use, and
-- retry behavior. No existing lifecycle guard is disabled or bypassed.
insert into public.payroll_deduction_obligations (
  id, rider_id, hub_id, adjustment_code, original_amount, adjustment_date,
  reason, reference, source, created_by, updated_by,
  voided_at, voided_by, void_reason, financially_committed_at, financially_committed_payroll_id
)
select
  ('b7400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 8 then 'c7400000-0000-4000-8000-000000000002'::uuid else 'c7400000-0000-4000-8000-000000000001'::uuid end,
  case when n = 9 then 'a7400000-0000-4000-8000-000000000002'::uuid else 'a7400000-0000-4000-8000-000000000001'::uuid end,
  case when n = 10 then 'late_onhold' else 'general_deductions' end,
  case when n = 7 then 700.00 else 725.50 end,
  date '2026-08-01' + n + case when n = 11 then 1 else 0 end,
  'Existing obligation fixture',
  case when n = 6 then 'UNRELATED:fixture'
    else 'ABS-PEN:e7400000-0000-4000-8000-' || lpad(n::text, 12, '0') end,
  'manual', 'd7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001',
  case when n = 12 then clock_timestamp() end,
  case when n = 12 then 'd7400000-0000-4000-8000-000000000001'::uuid end,
  case when n = 12 then 'Previously voided' end,
  case when n in (13, 16) then clock_timestamp() end,
  case when n in (13, 16) then 'a7400000-0000-4000-8000-000000000099'::uuid end
from unnest(array[6,7,8,9,10,11,12,13,14,15,16,20]) n;
-- Detached/voided history is still evidence of prior use and blocks relinking.
insert into public.payroll_deduction_allocations (
  deduction_obligation_id, rider_id, hub_id, cutoff_start, cutoff_end, amount,
  source, created_by, updated_by, voided_at, voided_by, void_reason
) values ('b7400000-0000-4000-8000-000000000014', 'c7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', '2026-08-10', '2026-08-16', 10,
  'manual', 'd7400000-0000-4000-8000-000000000001', 'd7400000-0000-4000-8000-000000000001', clock_timestamp(), 'd7400000-0000-4000-8000-000000000001', 'Historical removed allocation');
update public.rider_absence_financial_consequences set deduction_obligation_id = 'b7400000-0000-4000-8000-000000000006' where id = 'e7400000-0000-4000-8000-000000000006';
update public.rider_absence_financial_consequences set deduction_obligation_id = 'b7400000-0000-4000-8000-000000000016' where id = 'e7400000-0000-4000-8000-000000000016';
-- Canonical reference claims consequence 20 but another consequence owns it.
update public.rider_absence_financial_consequences set deduction_obligation_id = 'b7400000-0000-4000-8000-000000000020' where id = 'e7400000-0000-4000-8000-000000000021';

create temporary table bridge_baseline (name text primary key, value jsonb);
create temporary table bridge_results (name text primary key, id uuid);
grant select, insert on bridge_results to authenticated;
insert into bridge_baseline select 'payroll_records', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_records t;
insert into bridge_baseline select 'payroll_deduction_allocations', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_allocations t;
insert into bridge_baseline select 'payroll_earning_adjustments', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_earning_adjustments t;
insert into bridge_baseline select 'absence_policy_versions', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.absence_policy_versions t;
insert into bridge_baseline select 'absence_policy_rules', coalesce(jsonb_agg(to_jsonb(t) order by t.policy_version_id, t.rule_key), '[]'::jsonb) from public.absence_policy_rules t;
insert into bridge_baseline select 'decision_snapshots',
  jsonb_agg(to_jsonb(c) - 'deduction_obligation_id' - 'updated_at' order by c.id)
from public.rider_absence_financial_consequences c where c.rider_id = 'c7400000-0000-4000-8000-000000000001';
insert into bridge_baseline select 'preexisting_obligations', jsonb_agg(to_jsonb(o) order by o.id)
from public.payroll_deduction_obligations o where o.id::text like 'b7400000-%';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into bridge_results values ('created', public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000001'))$$, 'Admin materializes confirmed snapshot');
select is((select original_amount from public.payroll_deduction_obligations where id = (select id from bridge_results where name = 'created')), 725.50::numeric, 'amount comes from historical applied amount, not 500 or current policy');
select is((select adjustment_code from public.payroll_deduction_obligations where id = (select id from bridge_results where name = 'created')), 'general_deductions'::text, 'uses existing general deductions classification');
select is((select reference from public.payroll_deduction_obligations where id = (select id from bridge_results where name = 'created')), 'ABS-PEN:e7400000-0000-4000-8000-000000000001'::text, 'canonical ABS-PEN UUID reference is exact');
select is((select hub_id from public.payroll_deduction_obligations where id = (select id from bridge_results where name = 'created')), 'a7400000-0000-4000-8000-000000000001'::uuid, 'historical consequence hub wins over current Rider hub');
select is((select rider_id from public.payroll_deduction_obligations where id = (select id from bridge_results where name = 'created')), 'c7400000-0000-4000-8000-000000000001'::uuid, 'Rider identity comes from consequence');
select is((select adjustment_date from public.payroll_deduction_obligations where id = (select id from bridge_results where name = 'created')), date '2026-08-02', 'incident date comes from consequence');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id = 'e7400000-0000-4000-8000-000000000001'), (select id from bridge_results where name = 'created'), 'consequence stores obligation link');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000001'), 1::bigint, 'one confirmed consequence produces one obligation');
select is(public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000001'), (select id from bridge_results where name = 'created'), 'retry returns same obligation');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000001'), 1::bigint, 'retry cannot duplicate obligation');
select is((select count(*) from public.payroll_adjustment_audit_events where entity_type = 'obligation' and entity_id = (select id from bridge_results where name = 'created') and action = 'create'), 1::bigint, 'existing Payroll audit helper records one creation');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000001' and action = 'payroll_obligation_linked'), 1::bigint, 'exactly one consequence bridge event, including after retry');
select is((select new_values ->> 'deduction_obligation_id' from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000001' and action = 'payroll_obligation_linked'),
  (select id::text from bridge_results where name = 'created'), 'bridge audit records new link');
select ok((select not (new_values::text like '%PRIVATE DECISION%') from public.payroll_adjustment_audit_events where entity_type = 'obligation' and entity_id = (select id from bridge_results where name = 'created') and action = 'create'), 'Payroll audit does not expose private human decision notes');
-- Owner-level ledger assertions: this security-invoker view reads restricted
-- payroll_records. The bridge call and authorization checks stay authenticated.
reset role;
select is((select planned from public.v_payroll_deduction_balances where obligation_id = (select id from bridge_results where name = 'created')), 0::numeric, 'new obligation is unallocated');
select is((select available_to_allocate from public.v_payroll_deduction_balances where obligation_id = (select id from bridge_results where name = 'created')), 725.50::numeric, 'existing balance view sees full available amount');
set local role authenticated;
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000002')$$, '23514', null, 'emergency waiver cannot materialize an obligation');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000003')$$, '23514', null, 'excused waiver cannot materialize an obligation');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000004')$$, '23514', null, 'reversed decision cannot materialize an obligation');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000005')$$, '23514', null, 'zero applied amount cannot materialize an obligation');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000025')$$, '23514', null, 'non-PHP snapshot cannot materialize an obligation');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation(p_consequence_id => 'e7400000-0000-4000-8000-000000000001', p_amount => 1)$$, '42883', null, 'client cannot supply p_amount');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation(p_consequence_id => 'e7400000-0000-4000-8000-000000000001', p_rider_id => 'c7400000-0000-4000-8000-000000000002'::uuid)$$, '42883', null, 'client cannot supply p_rider_id');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation(p_consequence_id => 'e7400000-0000-4000-8000-000000000001', p_hub_id => 'a7400000-0000-4000-8000-000000000002'::uuid)$$, '42883', null, 'client cannot supply p_hub_id');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000006')$$, '23514', null, 'unrelated linked obligation fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000007')$$, '23514', null, 'mismatched amount fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000008')$$, '23514', null, 'mismatched Rider fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000009')$$, '23514', null, 'mismatched Hub fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000010')$$, '23514', null, 'wrong classification fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000011')$$, '23514', null, 'wrong incident date fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000012')$$, '23514', null, 'voided obligation fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000013')$$, '23514', null, 'committed unlinked obligation fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000014')$$, '23514', null, 'prior allocation history fails closed');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000020')$$, '23514', null, 'reference already linked to another consequence fails closed');
select is(public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000015'), 'b7400000-0000-4000-8000-000000000015'::uuid, 'matching never-used canonical obligation can be linked safely');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id = 'e7400000-0000-4000-8000-000000000015'), 'b7400000-0000-4000-8000-000000000015'::uuid, 'safe existing obligation is linked without recreation');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000015'), 1::bigint, 'safe adoption does not duplicate obligation');
select is(public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000016'), 'b7400000-0000-4000-8000-000000000016'::uuid, 'already-linked committed obligation is a read-only retry, not relinking');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000016'), 0::bigint, 'existing linked retry does not fabricate audit history');
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000001')$$, '42501', null, 'HR in authorized Hub denied by Admin-only contract');
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000022')$$, '42501', null, 'HR in unauthorized Hub denied by Admin-only contract');
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000022')$$, '42501', null, 'Payroll denied by Admin-only contract');
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000001')$$, '42501', null, 'Rider denied by Admin-only contract');
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000001')$$, '42501', null, 'Suspended Admin denied by Admin-only contract');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000001')$$, '42501', null, 'Anon denied');
reset role;

-- The database uniqueness guard backs up per-consequence row locking.
select throws_ok($$insert into public.payroll_deduction_obligations
  (rider_id, hub_id, adjustment_code, original_amount, adjustment_date, reason, reference, source, created_by)
  values ('c7400000-0000-4000-8000-000000000001', 'a7400000-0000-4000-8000-000000000001', 'general_deductions', 725.50, '2026-08-02', 'Duplicate attempt', 'ABS-PEN:e7400000-0000-4000-8000-000000000001', 'manual', 'd7400000-0000-4000-8000-000000000001')$$,
  '23505', null, 'canonical reference uniqueness rejects a second obligation');
select throws_ok($$update public.rider_absence_financial_consequences
  set deduction_obligation_id = 'b7400000-0000-4000-8000-000000000015' where id = 'e7400000-0000-4000-8000-000000000023'$$,
  '23505', null, 'one obligation cannot be linked to two consequences');
select ok(position('for update' in lower(pg_get_functiondef(
  'public.materialize_absence_financial_deduction_obligation(uuid)'::regprocedure))) > 0, 'bridge takes row locks for concurrent retries');
select ok(not has_table_privilege('authenticated', 'public.payroll_deduction_obligations', 'INSERT'), 'clients retain no direct obligation INSERT grant');

-- Controlled insert/link/audit errors verify the entire operation rolls back.
create function pg_temp.fail_bridge_obligation_insert()
returns trigger language plpgsql as $$
begin
  if new.reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000017' then
    raise exception 'Injected obligation failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_bridge_obligation_insert before insert on public.payroll_deduction_obligations
for each row execute function pg_temp.fail_bridge_obligation_insert();

create function pg_temp.fail_bridge_consequence_link()
returns trigger language plpgsql as $$
begin
  if new.id = 'e7400000-0000-4000-8000-000000000018' and new.deduction_obligation_id is not null then
    raise exception 'Injected link failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_bridge_consequence_link before update on public.rider_absence_financial_consequences
for each row execute function pg_temp.fail_bridge_consequence_link();

create function pg_temp.fail_bridge_consequence_audit()
returns trigger language plpgsql as $$
begin
  if new.consequence_id = 'e7400000-0000-4000-8000-000000000019' then
    raise exception 'Injected bridge audit failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_bridge_consequence_audit before insert on public.rider_absence_financial_consequence_audit_events
for each row execute function pg_temp.fail_bridge_consequence_audit();

create function pg_temp.fail_bridge_payroll_audit()
returns trigger language plpgsql as $$
begin
  if new.new_values ->> 'reference' = 'ABS-PEN:e7400000-0000-4000-8000-000000000026' then
    raise exception 'Injected Payroll audit failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger test_bridge_payroll_audit before insert on public.payroll_adjustment_audit_events
for each row execute function pg_temp.fail_bridge_payroll_audit();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7400000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000017')$$, 'P0001', 'Injected obligation failure', 'obligation failure aborts bridge');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id = 'e7400000-0000-4000-8000-000000000017'), null::uuid, 'obligation failure leaves no consequence link');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000017'), 0::bigint, 'obligation failure leaves no orphan obligation');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000017'), 0::bigint, 'obligation failure leaves no consequence audit');
select is((select count(*) from public.payroll_adjustment_audit_events where new_values ->> 'reference' = 'ABS-PEN:e7400000-0000-4000-8000-000000000017'), 0::bigint, 'obligation failure leaves no Payroll audit');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000018')$$, 'P0001', 'Injected link failure', 'link failure aborts bridge');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id = 'e7400000-0000-4000-8000-000000000018'), null::uuid, 'link failure leaves no consequence link');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000018'), 0::bigint, 'link failure leaves no orphan obligation');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000018'), 0::bigint, 'link failure leaves no consequence audit');
select is((select count(*) from public.payroll_adjustment_audit_events where new_values ->> 'reference' = 'ABS-PEN:e7400000-0000-4000-8000-000000000018'), 0::bigint, 'link failure leaves no Payroll audit');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000019')$$, 'P0001', 'Injected bridge audit failure', 'bridge audit failure aborts bridge');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id = 'e7400000-0000-4000-8000-000000000019'), null::uuid, 'bridge audit failure leaves no consequence link');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000019'), 0::bigint, 'bridge audit failure leaves no orphan obligation');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000019'), 0::bigint, 'bridge audit failure leaves no consequence audit');
select is((select count(*) from public.payroll_adjustment_audit_events where new_values ->> 'reference' = 'ABS-PEN:e7400000-0000-4000-8000-000000000019'), 0::bigint, 'bridge audit failure leaves no Payroll audit');
select throws_ok($$select public.materialize_absence_financial_deduction_obligation('e7400000-0000-4000-8000-000000000026')$$, 'P0001', 'Injected Payroll audit failure', 'Payroll audit failure aborts bridge');
select is((select deduction_obligation_id from public.rider_absence_financial_consequences where id = 'e7400000-0000-4000-8000-000000000026'), null::uuid, 'Payroll audit failure leaves no consequence link');
select is((select count(*) from public.payroll_deduction_obligations where reference = 'ABS-PEN:e7400000-0000-4000-8000-000000000026'), 0::bigint, 'Payroll audit failure leaves no orphan obligation');
select is((select count(*) from public.rider_absence_financial_consequence_audit_events where consequence_id = 'e7400000-0000-4000-8000-000000000026'), 0::bigint, 'Payroll audit failure leaves no consequence audit');
select is((select count(*) from public.payroll_adjustment_audit_events where new_values ->> 'reference' = 'ABS-PEN:e7400000-0000-4000-8000-000000000026'), 0::bigint, 'Payroll audit failure leaves no Payroll audit');
reset role;
select is((select count(*) from public.payroll_deduction_obligations where reference in ('ABS-PEN:e7400000-0000-4000-8000-000000000002', 'ABS-PEN:e7400000-0000-4000-8000-000000000003', 'ABS-PEN:e7400000-0000-4000-8000-000000000004', 'ABS-PEN:e7400000-0000-4000-8000-000000000005')), 0::bigint, 'waived and reversed decisions created no obligations');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_records t),
  (select value from bridge_baseline where name = 'payroll_records'), 'payroll_records unchanged by every bridge call');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_allocations t),
  (select value from bridge_baseline where name = 'payroll_deduction_allocations'), 'payroll_deduction_allocations unchanged by every bridge call');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_earning_adjustments t),
  (select value from bridge_baseline where name = 'payroll_earning_adjustments'), 'payroll_earning_adjustments unchanged by every bridge call');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.absence_policy_versions t),
  (select value from bridge_baseline where name = 'absence_policy_versions'), 'absence_policy_versions unchanged by every bridge call');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.policy_version_id, t.rule_key), '[]'::jsonb) from public.absence_policy_rules t),
  (select value from bridge_baseline where name = 'absence_policy_rules'), 'absence_policy_rules unchanged by every bridge call');
select is((select jsonb_agg(to_jsonb(c) - 'deduction_obligation_id' - 'updated_at' order by c.id)
  from public.rider_absence_financial_consequences c where c.rider_id = 'c7400000-0000-4000-8000-000000000001'),
  (select value from bridge_baseline where name = 'decision_snapshots'), 'all historical consequence snapshots unchanged');
select is((select jsonb_agg(to_jsonb(o) order by o.id) from public.payroll_deduction_obligations o where o.id::text like 'b7400000-%'),
  (select value from bridge_baseline where name = 'preexisting_obligations'), 'no pre-existing obligation was overwritten or lifecycle reset');
select * from finish();
rollback;
