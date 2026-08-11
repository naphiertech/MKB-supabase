begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('payroll_bulk_actions_test'));
select plan(57);

select has_table('public', 'payroll_bulk_operations', 'idempotency table exists');
select ok((select relrowsecurity from pg_class where oid='public.payroll_bulk_operations'::regclass), 'idempotency table has RLS enabled');
select ok(to_regprocedure('public.bulk_approve_payroll_records(jsonb,date,date,uuid)') is not null, 'bulk approval RPC exists');
select ok(to_regprocedure('public.bulk_mark_payroll_records_paid(jsonb,date,date,uuid)') is not null, 'bulk payment RPC exists');
select ok(has_function_privilege('authenticated', 'public.bulk_approve_payroll_records(jsonb,date,date,uuid)', 'EXECUTE'), 'authenticated callers may invoke approval RPC');
select ok(has_function_privilege('authenticated', 'public.bulk_mark_payroll_records_paid(jsonb,date,date,uuid)', 'EXECUTE'), 'authenticated callers may invoke payment RPC');
select ok(not has_function_privilege('anon', 'public.bulk_approve_payroll_records(jsonb,date,date,uuid)', 'EXECUTE'), 'anonymous callers cannot invoke approval RPC');
select ok(not has_function_privilege('anon', 'public.bulk_mark_payroll_records_paid(jsonb,date,date,uuid)', 'EXECUTE'), 'anonymous callers cannot invoke payment RPC');
select ok(not has_table_privilege('authenticated', 'public.payroll_bulk_operations', 'SELECT'), 'clients cannot read idempotency rows directly');
select ok(not has_table_privilege('authenticated', 'public.payroll_bulk_operations', 'INSERT'), 'clients cannot create idempotency rows directly');

insert into auth.users (id, email, email_confirmed_at) values
  ('a1000000-0000-4000-8000-000000000001', 'bulk-admin@example.test', clock_timestamp()),
  ('a1000000-0000-4000-8000-000000000002', 'bulk-hr@example.test', clock_timestamp()),
  ('a1000000-0000-4000-8000-000000000003', 'bulk-payroll@example.test', clock_timestamp()),
  ('a1000000-0000-4000-8000-000000000004', 'bulk-rider@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role) values
  ('a1000000-0000-4000-8000-000000000001', 'Bulk Admin', 'bulk-admin@example.test', 'admin'),
  ('a1000000-0000-4000-8000-000000000002', 'Bulk HR', 'bulk-hr@example.test', 'hr'),
  ('a1000000-0000-4000-8000-000000000003', 'Bulk Payroll', 'bulk-payroll@example.test', 'payroll'),
  ('a1000000-0000-4000-8000-000000000004', 'Bulk Rider User', 'bulk-rider@example.test', 'rider');

insert into public.riders (id, name, mkb_id, email)
select
  ('b1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Bulk Rider ' || n,
  'TEST-BULK-' || lpad(n::text, 3, '0'),
  'bulk-rider-' || n || '@example.test'
from generate_series(1, 25) n;

insert into public.payroll_records (
  id, rider_id, cutoff_start, cutoff_end, status, total_parcels,
  standard_parcels, heavy_parcels, standard_earnings, heavy_earnings,
  rate_per_parcel, gross_pay, calculation_version, snapshot_finalized_at,
  updated_at
)
select
  ('c1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('b1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 24 then date '2026-08-16' else date '2026-08-01' end,
  case when n = 24 then date '2026-08-31' else date '2026-08-15' end,
  case
    when n in (6, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21) then 'approved'::public.payroll_status
    when n = 18 then 'paid'::public.payroll_status
    when n = 22 then 'draft'::public.payroll_status
    else 'pending'::public.payroll_status
  end,
  case when n in (8, 17) then 1 else 0 end,
  case when n in (8, 17) then 1 else 0 end,
  0,
  case when n in (8, 17) then 10 else 0 end,
  0,
  case when n in (8, 17) then 10 else 0 end,
  case when n in (8, 17) then 10 else 0 end,
  2,
  case when n in (8, 17) then null else timestamptz '2026-08-09 08:00:00+08' end,
  timestamptz '2026-08-09 08:00:00+08'
from generate_series(1, 25) n;

create temp table bulk_test_payloads (name text primary key, payload jsonb not null);
grant select on bulk_test_payloads to authenticated;
insert into bulk_test_payloads (name, payload)
select groups.name, jsonb_agg(jsonb_build_object('id', pr.id, 'updated_at', pr.updated_at) order by pr.id)
from (values
  ('admin_approve', array[1,2]),
  ('hr_approve', array[3,4]),
  ('payroll_denied', array[5]),
  ('rider_denied', array[7]),
  ('mixed_approve', array[9,10]),
  ('invalid_approve', array[8,9]),
  ('stale_approve', array[23]),
  ('duplicate_approve', array[7]),
  ('admin_pay', array[11,12]),
  ('hr_pay', array[13,14]),
  ('wrong_pay', array[15,22]),
  ('already_paid', array[18]),
  ('invalid_pay', array[16,17]),
  ('duplicate_pay', array[19]),
  ('singleton_approve', array[25]),
  ('singleton_pay', array[21]),
  ('wrong_cutoff', array[24])
) as groups(name, nums)
join public.payroll_records pr
  on pr.id::text like 'c1000000-%'
 and right(pr.id::text, 12)::integer = any(groups.nums)
group by groups.name;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='admin_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000001')$$,
  'Admin can atomically approve multiple Pending Review records'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002') and status='approved'), 2::bigint, 'Admin approval changes every selected record');
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002') and approved_by='a1000000-0000-4000-8000-000000000001' and approved_at is not null), 2::bigint, 'Admin approval metadata is populated');
select is((select count(*) from public.activity_logs where metadata->>'request_id'='d1000000-0000-4000-8000-000000000001' and event_type='payroll_approve'), 2::bigint, 'Admin approval writes one audit entry per payroll');
select is((select count(*) from public.notifications where metadata->>'request_id'='d1000000-0000-4000-8000-000000000001' and category='payroll'), 2::bigint, 'Admin approval writes one notification per payroll');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='hr_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000002')$$,
  'HR can atomically approve multiple Pending Review records'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000004') and status='approved' and approved_by='a1000000-0000-4000-8000-000000000002'), 2::bigint, 'HR approval records the canonical actor');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='payroll_denied'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000003')$$,
  'P0001', null, 'Payroll Officer cannot approve payroll'
);
select is((select status::text from public.payroll_records where id='c1000000-0000-4000-8000-000000000005'), 'pending', 'unauthorized approval leaves the record unchanged');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='rider_denied'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000004')$$,
  'P0001', null, 'Rider cannot approve payroll'
);
reset role;
select is((select status::text from public.payroll_records where id='c1000000-0000-4000-8000-000000000007'), 'pending', 'Rider approval attempt leaves payroll unchanged');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='mixed_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000005')$$,
  'P0001', null, 'mixed approval statuses fail the whole operation'
);
select is((select status::text from public.payroll_records where id='c1000000-0000-4000-8000-000000000009'), 'pending', 'mixed status failure rolls back the eligible row');
select is((select count(*) from public.activity_logs where metadata->>'request_id'='d1000000-0000-4000-8000-000000000005'), 0::bigint, 'failed mixed approval writes no audit rows');

select throws_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='invalid_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000006')$$,
  'P0001', null, 'an invalid immutable snapshot fails approval'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000008','c1000000-0000-4000-8000-000000000009') and status='pending'), 2::bigint, 'invalid snapshot rolls back the complete approval batch');

update public.payroll_records set notes='Changed after selection' where id='c1000000-0000-4000-8000-000000000023';
select throws_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='stale_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000007')$$,
  'P0001', null, 'stale selected record version is rejected'
);
select is((select status::text from public.payroll_records where id='c1000000-0000-4000-8000-000000000023'), 'pending', 'stale conflict does not transition payroll');

select lives_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='duplicate_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000008')$$,
  'first approval request succeeds'
);
select lives_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='duplicate_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000008')$$,
  'duplicate approval request safely replays'
);
select is((select count(*) from public.activity_logs where metadata->>'request_id'='d1000000-0000-4000-8000-000000000008'), 1::bigint, 'duplicate approval writes one audit event');
select is((select count(*) from public.notifications where metadata->>'request_id'='d1000000-0000-4000-8000-000000000008'), 1::bigint, 'duplicate approval writes one notification');
reset role;
select is((select count(*) from public.payroll_bulk_operations where request_id='d1000000-0000-4000-8000-000000000008'), 1::bigint, 'duplicate approval keeps one operation record');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='admin_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000009')$$,
  'Admin can atomically mark multiple Approved payroll records Paid'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000012') and status='paid'), 2::bigint, 'Admin payment changes every selected record');
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000012') and paid_by='a1000000-0000-4000-8000-000000000001' and paid_at is not null and processed_at is not null), 2::bigint, 'payment metadata is populated consistently');
select is((select count(*) from public.activity_logs where metadata->>'request_id'='d1000000-0000-4000-8000-000000000009' and event_type='payroll_pay'), 2::bigint, 'payment writes one audit entry per payroll');
select is((select count(*) from public.notifications where metadata->>'request_id'='d1000000-0000-4000-8000-000000000009' and category='payroll'), 2::bigint, 'payment writes one notification per payroll');

select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='hr_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000010')$$,
  'HR can atomically mark multiple Approved payroll records Paid'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000013','c1000000-0000-4000-8000-000000000014') and status='paid' and paid_by='a1000000-0000-4000-8000-000000000002'), 2::bigint, 'HR payment records the canonical actor');

select throws_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='wrong_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000011')$$,
  'P0001', null, 'Draft and Pending Review payroll cannot become Paid'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000015','c1000000-0000-4000-8000-000000000022') and status in ('approved','draft')), 2::bigint, 'invalid payment rolls back every selected record');

select throws_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='already_paid'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000012')$$,
  'P0001', null, 'already Paid payroll cannot be processed again'
);
select is((select status::text from public.payroll_records where id='c1000000-0000-4000-8000-000000000018'), 'paid', 'retry with a new request cannot rewrite Paid payroll');

select throws_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='invalid_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000013')$$,
  'P0001', null, 'invalid immutable snapshot fails payment'
);
select is((select count(*) from public.payroll_records where id in ('c1000000-0000-4000-8000-000000000016','c1000000-0000-4000-8000-000000000017') and status='approved'), 2::bigint, 'invalid snapshot rolls back the complete payment batch');

select lives_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='duplicate_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000014')$$,
  'first payment request succeeds'
);
select lives_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='duplicate_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000014')$$,
  'duplicate payment request safely replays'
);
reset role;
select is((select count(*) from public.activity_logs where metadata->>'request_id'='d1000000-0000-4000-8000-000000000014'), 1::bigint, 'duplicate payment writes one audit event');
select is((select count(*) from public.notifications where metadata->>'request_id'='d1000000-0000-4000-8000-000000000014'), 1::bigint, 'duplicate payment writes one notification');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='singleton_approve'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000015')$$,
  'singleton RPC preserves individual approval behavior'
);
select lives_ok(
  $$select public.bulk_mark_payroll_records_paid((select payload from bulk_test_payloads where name='singleton_pay'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000016')$$,
  'singleton RPC preserves individual Mark as Paid behavior'
);

select throws_ok(
  $$select public.bulk_approve_payroll_records((select payload from bulk_test_payloads where name='wrong_cutoff'), '2026-08-01', '2026-08-15', 'd1000000-0000-4000-8000-000000000017')$$,
  'P0001', null, 'selected payroll must belong to the intended cutoff'
);
select is((select status::text from public.payroll_records where id='c1000000-0000-4000-8000-000000000024'), 'pending', 'cutoff conflict leaves payroll unchanged');

select set_config('app.payroll_transition_request_id', '', true);
select throws_ok(
  $$update public.payroll_records set status='approved' where id='c1000000-0000-4000-8000-000000000005'$$,
  'P0001', null, 'direct approval updates cannot bypass the authoritative RPC'
);

select throws_ok(
  $$update public.payroll_records set gross_pay=999 where id='c1000000-0000-4000-8000-000000000019'$$,
  'P0001', null, 'Paid payroll remains immutable after bulk payment'
);

reset role;
select is((select gross_pay from public.payroll_records where id='c1000000-0000-4000-8000-000000000019'), 0::numeric, 'bulk payment preserves immutable snapshot values');

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
