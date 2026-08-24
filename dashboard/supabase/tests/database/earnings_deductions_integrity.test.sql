begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('earnings_deductions_integrity_test'));
select no_plan();

select has_table('public', 'payroll_adjustment_definitions', 'fixed payroll adjustment definition registry exists');
select has_table('public', 'payroll_adjustment_definition_audit', 'append-only definition audit exists');
select ok(to_regprocedure('public.update_payroll_adjustment_definition(text,text,boolean,text)') is not null, 'Admin definition update RPC exists');
select ok(to_regprocedure('private.legacy_fm_pickup_amount(integer)') is not null, 'legacy FM conversion helper exists');

select is(
  (select count(*) from public.payroll_adjustment_definitions),
  5::bigint,
  'exactly five baseline definitions are seeded'
);
select results_eq(
  $$select code from public.payroll_adjustment_definitions order by code$$,
  $$values ('fm_pickup'::text), ('general_deductions'::text), ('late_onhold'::text), ('late_remittance'::text), ('other_earnings'::text)$$,
  'the fixed registry contains only the five approved codes'
);
select is(
  (select count(*) from public.payroll_adjustment_definitions where input_mode = 'manual_amount'),
  5::bigint,
  'all definitions use manual amount input'
);
select is(private.legacy_fm_pickup_amount(4), 12::numeric, 'legacy FM quantity converts once at PHP 3');

select ok(has_table_privilege('authenticated', 'public.payroll_adjustment_definitions', 'SELECT'), 'authenticated staff can read definitions');
select ok(not has_table_privilege('authenticated', 'public.payroll_adjustment_definitions', 'INSERT'), 'authenticated clients cannot insert definitions');
select ok(not has_table_privilege('authenticated', 'public.payroll_adjustment_definitions', 'UPDATE'), 'authenticated clients cannot update definitions directly');
select ok(not has_table_privilege('authenticated', 'public.payroll_adjustment_definitions', 'DELETE'), 'authenticated clients cannot delete definitions');
select ok(has_function_privilege('authenticated', 'public.update_payroll_adjustment_definition(text,text,boolean,text)', 'EXECUTE'), 'authenticated callers may reach the guarded RPC');
select ok(not has_function_privilege('anon', 'public.update_payroll_adjustment_definition(text,text,boolean,text)', 'EXECUTE'), 'anonymous callers cannot update definitions');

insert into auth.users (id, email, email_confirmed_at) values
  ('ed000000-0000-4000-8000-000000000001', 'earnings-admin@example.test', clock_timestamp()),
  ('ed000000-0000-4000-8000-000000000002', 'earnings-payroll@example.test', clock_timestamp());
insert into public.users (id, full_name, email, role) values
  ('ed000000-0000-4000-8000-000000000001', 'Earnings Admin', 'earnings-admin@example.test', 'admin'),
  ('ed000000-0000-4000-8000-000000000002', 'Earnings Payroll', 'earnings-payroll@example.test', 'payroll');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.update_payroll_adjustment_definition('fm_pickup', 'FM Pick Up Manual', true, 'Rename baseline definition')$$,
  'Admin may update display name with a reason'
);
reset role;

select is((select display_name from public.payroll_adjustment_definitions where code='fm_pickup'), 'FM Pick Up Manual', 'display name is updated');
select is((select active from public.payroll_adjustment_definitions where code='fm_pickup'), true, 'active state remains available for Draft entry');
select is((select count(*) from public.payroll_adjustment_definition_audit where definition_code='fm_pickup'), 1::bigint, 'definition update writes one audit row');

select throws_ok(
  $$update public.payroll_adjustment_definitions set category='deduction' where code='fm_pickup'$$,
  'P0001', null,
  'category cannot change'
);
select throws_ok(
  $$update public.payroll_adjustment_definitions set code='forged_code' where code='fm_pickup'$$,
  'P0001', null,
  'definition code cannot change'
);
select throws_ok(
  $$update public.payroll_adjustment_definitions set input_mode='quantity_rate' where code='fm_pickup'$$,
  'P0001', null,
  'input mode cannot change'
);
select throws_ok(
  $$update public.payroll_adjustment_definitions set created_by='ed000000-0000-4000-8000-000000000001' where code='fm_pickup'$$,
  'P0001', null,
  'creator identity cannot change'
);
select throws_ok(
  $$delete from public.payroll_adjustment_definitions where code='fm_pickup'$$,
  'P0001', null,
  'fixed definitions cannot be deleted'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.update_payroll_adjustment_definition('other_earnings', 'Changed', false, 'Unauthorized')$$,
  'P0001', null,
  'Payroll remains read-only'
);
reset role;

insert into public.riders (id, name, mkb_id, email)
values ('ed100000-0000-4000-8000-000000000001', 'Adjustment Snapshot Rider', 'TEST-ADJ-001', 'adjustment-rider@example.test');

insert into public.payroll_records (
  id, rider_id, cutoff_start, cutoff_end, status, total_parcels, rate_per_parcel, gross_pay,
  other_earnings, fm_pickup_count, fm_pickup_amount, deductions, late_onhold, late_remittance
) values (
  'ed200000-0000-4000-8000-000000000001', 'ed100000-0000-4000-8000-000000000001',
  date '2026-08-01', date '2026-08-15', 'draft', 0, 0, 100,
  10, 99, 7, 4, 3, 2
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.update_payroll_adjustment_definition('fm_pickup', 'FM Pick Up Manual', false, 'Deactivate after Draft value exists');
reset role;

select throws_ok(
  $$update public.payroll_records set fm_pickup_amount=8 where id='ed200000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'inactive definition rejects a new Draft value without erasing the existing amount'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$update public.payroll_records
      set status='pending', submitted_by='ed000000-0000-4000-8000-000000000002', submitted_at=clock_timestamp()
    where id='ed200000-0000-4000-8000-000000000001'$$,
  'inactive definition does not erase an existing Draft amount during submission'
);
reset role;

select is((select adjustment_snapshot_version from public.payroll_records where id='ed200000-0000-4000-8000-000000000001'), 2, 'new submission uses manual adjustment snapshot version');
select is((select total_earnings_snapshot from public.payroll_records where id='ed200000-0000-4000-8000-000000000001'), 17::numeric, 'submission freezes gross plus manual earning adjustments');
select is((select total_deductions_snapshot from public.payroll_records where id='ed200000-0000-4000-8000-000000000001'), 9::numeric, 'submission freezes total deductions');
select is((select net_pay_snapshot from public.payroll_records where id='ed200000-0000-4000-8000-000000000001'), 8::numeric, 'submission freezes net pay');
select is(
  (select (item->>'amount')::numeric from public.payroll_records cross join lateral jsonb_array_elements(adjustment_snapshot->'items') item where id='ed200000-0000-4000-8000-000000000001' and item->>'code'='fm_pickup'),
  7::numeric,
  'new submission uses manual FM amount and ignores legacy count'
);
select is(
  (select item->>'label' from public.payroll_records cross join lateral jsonb_array_elements(adjustment_snapshot->'items') item where id='ed200000-0000-4000-8000-000000000001' and item->>'code'='fm_pickup'),
  'FM Pick Up Manual',
  'submission freezes the definition label'
);
select is(
  (select (item->>'active')::boolean from public.payroll_records cross join lateral jsonb_array_elements(adjustment_snapshot->'items') item where id='ed200000-0000-4000-8000-000000000001' and item->>'code'='fm_pickup'),
  false,
  'submission freezes inactive state without erasing the amount'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.update_payroll_adjustment_definition('fm_pickup', 'Renamed After Submission', true, 'Verify snapshot stability');
reset role;
select is(
  (select item->>'label' from public.payroll_records cross join lateral jsonb_array_elements(adjustment_snapshot->'items') item where id='ed200000-0000-4000-8000-000000000001' and item->>'code'='fm_pickup'),
  'FM Pick Up Manual',
  'later definition changes do not rewrite submitted labels'
);

select throws_ok(
  $$update public.payroll_records set fm_pickup_amount=999 where id='ed200000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'submitted manual amounts are immutable'
);
select throws_ok(
  $$update public.payroll_records set net_pay_snapshot=999 where id='ed200000-0000-4000-8000-000000000001'$$,
  'P0001', null,
  'submitted total snapshots are immutable'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.payroll_records set status='rejected', rejection_reason='Return for correction' where id='ed200000-0000-4000-8000-000000000001';
reset role;
select is((select adjustment_snapshot from public.payroll_records where id='ed200000-0000-4000-8000-000000000001'), null::jsonb, 'return to editable state clears adjustment snapshot');

update public.payroll_records set fm_pickup_amount=20 where id='ed200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ed000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.payroll_records set status='pending', submitted_by='ed000000-0000-4000-8000-000000000002', submitted_at=clock_timestamp() where id='ed200000-0000-4000-8000-000000000001';
reset role;
select is((select net_pay_snapshot from public.payroll_records where id='ed200000-0000-4000-8000-000000000001'), 21::numeric, 'resubmission rebuilds totals from updated manual amounts');

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;

rollback;
