begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('payroll_actor_identity_snapshots_test'));
select plan(35);

select has_column('public', 'payroll_records', 'returned_by', 'return actor UUID column exists');
select has_column('public', 'payroll_records', 'submitted_by_name_snapshot', 'submission name snapshot column exists');
select has_column('public', 'payroll_records', 'approved_by_email_snapshot', 'approval email snapshot column exists');
select has_column('public', 'payroll_records', 'paid_by_email_snapshot', 'payment email snapshot column exists');

insert into auth.users (id, email, email_confirmed_at) values
  ('f2000000-0000-4000-8000-000000000001', 'snapshot-admin@example.test', clock_timestamp()),
  ('f2000000-0000-4000-8000-000000000002', 'new-admin@example.test', clock_timestamp()),
  ('f2000000-0000-4000-8000-000000000003', 'payroll@example.test', clock_timestamp()),
  ('f2000000-0000-4000-8000-000000000004', 'hr@example.test', clock_timestamp()),
  ('f2000000-0000-4000-8000-000000000005', 'unconfirmed@example.test', null);

insert into public.users (id, full_name, email, role) values
  ('f2000000-0000-4000-8000-000000000001', 'Renata Cruz', 'snapshot-admin@example.test', 'admin'),
  ('f2000000-0000-4000-8000-000000000002', 'Second Admin', 'new-admin@example.test', 'admin'),
  ('f2000000-0000-4000-8000-000000000003', 'Payroll Officer', 'payroll@example.test', 'payroll'),
  ('f2000000-0000-4000-8000-000000000004', 'HR Reviewer', 'hr@example.test', 'hr'),
  ('f2000000-0000-4000-8000-000000000005', 'Unconfirmed Admin', 'unconfirmed@example.test', 'admin');

insert into public.riders (id, name, mkb_id, email)
select
  ('f3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Snapshot Rider ' || n,
  'TEST-SNAPSHOT-' || lpad(n::text, 3, '0'),
  'snapshot-rider-' || n || '@example.test'
from generate_series(1, 13) n;

-- Simulate pre-migration legacy fixture rows without invoking the new insert
-- sanitizer. Production history is never rewritten by the migration itself.
set local session_replication_role = replica;
insert into public.payroll_records (
  id,
  rider_id,
  cutoff_start,
  cutoff_end,
  status,
  total_parcels,
  standard_parcels,
  heavy_parcels,
  standard_earnings,
  heavy_earnings,
  rate_per_parcel,
  gross_pay,
  calculation_version,
  snapshot_finalized_at,
  submitted_by,
  submitted_at,
  approved_by,
  approved_at,
  paid_by,
  paid_at,
  updated_at
)
select
  ('f4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('f3000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  date '2026-08-01',
  date '2026-08-15',
  case
    when n = 5 then 'approved'::public.payroll_status
    when n in (6, 11) then 'draft'::public.payroll_status
    when n = 12 then 'paid'::public.payroll_status
    else 'pending'::public.payroll_status
  end,
  0, 0, 0, 0, 0, 0, 0,
  case when n in (6, 11) then 1 else 2 end,
  case when n in (6, 11) then null else timestamptz '2026-08-11 08:00:00+08' end,
  case when n in (6, 11) then null else 'f2000000-0000-4000-8000-000000000003'::uuid end,
  case when n in (6, 11) then null else timestamptz '2026-08-11 07:00:00+08' end,
  case when n = 12 then 'f2000000-0000-4000-8000-000000000001'::uuid end,
  case when n = 12 then timestamptz '2026-08-11 07:30:00+08' end,
  case when n = 12 then 'f2000000-0000-4000-8000-000000000001'::uuid end,
  case when n = 12 then timestamptz '2026-08-11 08:00:00+08' end,
  timestamptz '2026-08-11 08:00:00+08'
from generate_series(1, 12) n;

-- The migration backfills immutable adjustment snapshots for legacy submitted
-- rows. Reproduce that post-migration state for these legacy identity fixtures.
update public.payroll_records
set adjustment_snapshot = private.build_payroll_adjustment_snapshot(
      other_earnings, fm_pickup_amount, deductions, late_onhold, late_remittance, 1, fm_pickup_count
    ),
    adjustment_snapshot_version = 1,
    total_earnings_snapshot = coalesce(gross_pay, 0) + coalesce(other_earnings, 0) + coalesce(fm_pickup_amount, 0),
    total_deductions_snapshot = coalesce(deductions, 0) + coalesce(late_onhold, 0) + coalesce(late_remittance, 0),
    net_pay_snapshot = coalesce(gross_pay, 0) + coalesce(other_earnings, 0) + coalesce(fm_pickup_amount, 0)
      - coalesce(deductions, 0) - coalesce(late_onhold, 0) - coalesce(late_remittance, 0)
where id::text like 'f4000000-%'
  and status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status);
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.bulk_approve_payroll_records(
    jsonb_build_array(jsonb_build_object('id', 'f4000000-0000-4000-8000-000000000001', 'updated_at', timestamptz '2026-08-11 08:00:00+08')),
    '2026-08-01', '2026-08-15', 'f5000000-0000-4000-8000-000000000001'
  )$$,
  'Admin approval succeeds with a confirmed identity'
);
select is((select approved_by from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000001'), 'f2000000-0000-4000-8000-000000000001'::uuid, 'approval stores the authoritative actor UUID');
select is((select approved_by_name_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000001'), 'Renata Cruz', 'approval stores the actor name snapshot');
select is((select approved_by_email_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000001'), 'snapshot-admin@example.test', 'approval stores the confirmed email snapshot');
select is((select metadata->>'actor_email_snapshot' from public.activity_logs where metadata->>'request_id' = 'f5000000-0000-4000-8000-000000000001'), 'snapshot-admin@example.test', 'approval audit metadata stores the same email snapshot');

reset role;
update auth.users
set email = 'snapshot-confirmed@example.test', email_confirmed_at = clock_timestamp()
where id = 'f2000000-0000-4000-8000-000000000001';
update public.users set full_name = 'Renata Cruz Updated' where id = 'f2000000-0000-4000-8000-000000000001';
select is((select approved_by_email_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000001'), 'snapshot-admin@example.test', 'later profile/Auth email changes do not rewrite approval history');
select is((select approved_by from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000001'), 'f2000000-0000-4000-8000-000000000001'::uuid, 'later identity changes do not rewrite the actor UUID');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$select public.bulk_approve_payroll_records(
    jsonb_build_array(jsonb_build_object('id', 'f4000000-0000-4000-8000-000000000002', 'updated_at', timestamptz '2026-08-11 08:00:00+08')),
    '2026-08-01', '2026-08-15', 'f5000000-0000-4000-8000-000000000002'
  )$$,
  'a new Admin can approve a new payroll'
);
select is((select approved_by from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000002'), 'f2000000-0000-4000-8000-000000000002'::uuid, 'new approval is attributed to the new Admin UUID');

reset role;
update auth.users set email_change = 'pending-admin@example.test' where id = 'f2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.bulk_approve_payroll_records(
    jsonb_build_array(
      jsonb_build_object('id', 'f4000000-0000-4000-8000-000000000003', 'updated_at', timestamptz '2026-08-11 08:00:00+08'),
      jsonb_build_object('id', 'f4000000-0000-4000-8000-000000000004', 'updated_at', timestamptz '2026-08-11 08:00:00+08')
    ),
    '2026-08-01', '2026-08-15', 'f5000000-0000-4000-8000-000000000003'
  )$$,
  'bulk approval captures one trusted actor snapshot for the atomic batch'
);
select is((select count(*) from public.payroll_records where id in ('f4000000-0000-4000-8000-000000000003', 'f4000000-0000-4000-8000-000000000004') and approved_by = 'f2000000-0000-4000-8000-000000000001' and approved_by_name_snapshot = 'Renata Cruz Updated' and approved_by_email_snapshot = 'snapshot-confirmed@example.test'), 2::bigint, 'every bulk-approved row receives the same current confirmed identity and ignores pending email_change');

select lives_ok(
  $$select public.bulk_mark_payroll_records_paid(
    jsonb_build_array(jsonb_build_object('id', 'f4000000-0000-4000-8000-000000000005', 'updated_at', timestamptz '2026-08-11 08:00:00+08')),
    '2026-08-01', '2026-08-15', 'f5000000-0000-4000-8000-000000000004'
  )$$,
  'payment captures the confirmed actor identity'
);
select is((select paid_by from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000005'), 'f2000000-0000-4000-8000-000000000001'::uuid, 'payment stores the authoritative actor UUID');
select is((select paid_by_email_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000005'), 'snapshot-confirmed@example.test', 'payment stores the current confirmed email, not pending email_change');

reset role;
update auth.users set email = 'renata-later@example.test', email_confirmed_at = clock_timestamp() where id = 'f2000000-0000-4000-8000-000000000001';
select is((select paid_by_email_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000005'), 'snapshot-confirmed@example.test', 'later Auth changes do not rewrite the payment snapshot');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$update public.payroll_records
    set status = 'pending', submitted_by = 'f2000000-0000-4000-8000-000000000002'
    where id = 'f4000000-0000-4000-8000-000000000006'$$,
  'Payroll can submit and client-supplied actor attribution is overwritten'
);
select is((select submitted_by from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000006'), 'f2000000-0000-4000-8000-000000000003'::uuid, 'submission stores auth.uid instead of the client-supplied UUID');
select is((select submitted_by_email_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000006'), 'payroll@example.test', 'submission stores the Payroll actor confirmed email');
select is((select metadata->>'actor_user_id' from public.activity_logs where metadata->>'record_id' = 'f4000000-0000-4000-8000-000000000006' and event_type = 'payroll_submit'), 'f2000000-0000-4000-8000-000000000003', 'submission audit entry uses the same authoritative actor UUID');
select lives_ok(
  $$insert into public.payroll_records (
      id, rider_id, cutoff_start, cutoff_end, status,
      submitted_by, submitted_at,
      submitted_by_name_snapshot, submitted_by_email_snapshot
    ) values (
      'f4000000-0000-4000-8000-000000000013',
      'f3000000-0000-4000-8000-000000000013',
      date '2026-08-01', date '2026-08-15', 'draft',
      'f2000000-0000-4000-8000-000000000002', clock_timestamp(),
      'Forged Admin', 'forged@example.test'
    )$$,
  'draft creation ignores client-supplied actor attribution'
);
select ok((select submitted_by is null and submitted_at is null and submitted_by_name_snapshot is null and submitted_by_email_snapshot is null from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000013'), 'insert sanitizer removes forged actor UUID, timestamp, name, and email');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select lives_ok($$update public.payroll_records set status = 'rejected', rejection_reason = 'Needs correction' where id = 'f4000000-0000-4000-8000-000000000007'$$, 'HR can reject with a trusted snapshot');
select is((select rejected_by_email_snapshot from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000007'), 'hr@example.test', 'rejection stores the HR confirmed email snapshot');
select lives_ok($$update public.payroll_records set status = 'draft' where id = 'f4000000-0000-4000-8000-000000000008'$$, 'HR can return payroll for revision with a trusted snapshot');
select is((select jsonb_build_array(returned_by, returned_by_name_snapshot, returned_by_email_snapshot, returned_at is not null) from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000008'), jsonb_build_array('f2000000-0000-4000-8000-000000000004'::uuid, 'HR Reviewer', 'hr@example.test', true), 'return stores UUID, name, email, and timestamp');

select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$select public.bulk_approve_payroll_records(
    jsonb_build_array(jsonb_build_object('id', 'f4000000-0000-4000-8000-000000000009', 'updated_at', timestamptz '2026-08-11 08:00:00+08')),
    '2026-08-01', '2026-08-15', 'f5000000-0000-4000-8000-000000000005'
  )$$,
  'P0001', null, 'an unconfirmed actor email cannot be snapshotted'
);
select is((select status::text from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000009'), 'pending', 'failed unconfirmed-email approval leaves payroll unchanged');

reset role;
select is((select approved_by from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000012'), 'f2000000-0000-4000-8000-000000000001'::uuid, 'legacy payroll keeps its existing actor UUID');
select ok((select approved_by_name_snapshot is null and approved_by_email_snapshot is null and paid_by_name_snapshot is null and paid_by_email_snapshot is null from public.payroll_records where id = 'f4000000-0000-4000-8000-000000000012'), 'legacy payroll receives no fabricated snapshot backfill');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$update public.payroll_records set approved_by_email_snapshot = 'forged@example.test' where id = 'f4000000-0000-4000-8000-000000000013'$$, 'P0001', 'Payroll actor attribution can only be changed by a workflow transition.', 'clients cannot forge stored actor snapshots');
select throws_ok($$update public.payroll_records set paid_by_email_snapshot = 'forged@example.test' where id = 'f4000000-0000-4000-8000-000000000005'$$, 'P0001', 'Paid payroll records are immutable.', 'Paid payroll identity snapshots remain immutable');

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
