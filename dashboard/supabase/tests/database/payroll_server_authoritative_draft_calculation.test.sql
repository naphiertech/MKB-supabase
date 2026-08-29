begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('payroll_server_authoritative_draft_calculation_test'));
select plan(16);

-- 1. Existence and signature tests
select ok(
  to_regprocedure('public.calculate_payroll_delivery_lines(uuid,date,date)') is not null,
  'calculate_payroll_delivery_lines function exists'
);

select ok(
  to_regprocedure('public.calculate_payroll_delivery_summary(uuid,date,date)') is not null,
  'calculate_payroll_delivery_summary function exists'
);

select ok(
  to_regprocedure('public.refresh_draft_payroll_record(uuid)') is not null,
  'refresh_draft_payroll_record RPC exists'
);

select ok(
  to_regprocedure('public.refresh_draft_payroll_for_rider_cutoff(uuid,date,date)') is not null,
  'refresh_draft_payroll_for_rider_cutoff RPC exists'
);

-- Setup test entities
insert into public.hubs (id, name, description, active) values
  ('d1100000-0000-4000-8000-000000000001', 'Draft Calc Hub 1', 'Test', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('d1200000-0000-4000-8000-000000000001', 'payroll-officer-calc@example.test', clock_timestamp()),
  ('d1200000-0000-4000-8000-000000000002', 'draft-rider-calc1@example.test', clock_timestamp()),
  ('d1200000-0000-4000-8000-000000000003', 'draft-rider-calc2@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, hub_access_scope, employment_status) values
  ('d1200000-0000-4000-8000-000000000001', 'Admin Officer Calc', 'payroll-officer-calc@example.test', 'admin', 'global', 'active');

insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('d1300000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'Draft Calc Rider 1', 'RIDER-CALC-001', 'draft-rider-calc1@example.test', 'offline'),
  ('d1300000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000001', 'Draft Calc Rider 2', 'RIDER-CALC-002', 'draft-rider-calc2@example.test', 'offline');

insert into public.users (id, full_name, email, role, rider_id, employment_status) values
  ('d1200000-0000-4000-8000-000000000002', 'Draft Calc Rider 1', 'draft-rider-calc1@example.test', 'rider', 'd1300000-0000-4000-8000-000000000001', 'active'),
  ('d1200000-0000-4000-8000-000000000003', 'Draft Calc Rider 2', 'draft-rider-calc2@example.test', 'rider', 'd1300000-0000-4000-8000-000000000002', 'active');

-- Active parcel rate config already exists (effective from 2026-01-01)
-- Early: 12.00, Regular: 11.00, Late: 10.00, Heavy: 17.00

-- Insert parcel logs for Rider 1 in weekly period: 2026-08-31 (Mon) to 2026-09-06 (Sun)
-- Plus boundary records on 2026-08-30 (Sun before) and 2026-09-07 (Mon after)
insert into public.parcel_logs (rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by) values
  -- Outside boundary before:
  ('d1300000-0000-4000-8000-000000000001', '2026-08-30', 50, 5, 0, 0, 'd1200000-0000-4000-8000-000000000001'),
  -- Inside week 2026-08-31 -> 2026-09-06:
  ('d1300000-0000-4000-8000-000000000001', '2026-08-31', 20, 2, 1, 0, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000001', '2026-09-01', 30, 0, 0, 1, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000001', '2026-09-02', 25, 4, 0, 0, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000001', '2026-09-06', 15, 1, 0, 0, 'd1200000-0000-4000-8000-000000000001'),
  -- Outside boundary after:
  ('d1300000-0000-4000-8000-000000000001', '2026-09-07', 40, 0, 0, 0, 'd1200000-0000-4000-8000-000000000001');

-- Rider 2 parcel logs (for isolation testing)
insert into public.parcel_logs (rider_id, date, parcels, heavy_parcels, created_by) values
  ('d1300000-0000-4000-8000-000000000002', '2026-08-31', 10, 0, 'd1200000-0000-4000-8000-000000000001');

-- Mock authenticated session as Payroll Officer
set local role authenticated;
set local "request.jwt.claim.sub" = 'd1200000-0000-4000-8000-000000000001';

-- Create Draft payroll records
insert into public.payroll_records (
  id, rider_id, hub_id, cutoff_start, cutoff_end, total_parcels, standard_parcels, heavy_parcels,
  standard_earnings, heavy_earnings, gross_pay, rate_per_parcel, status
) values
  ('d1500000-0000-4000-8000-000000000001', 'd1300000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001',
   '2026-08-31', '2026-09-06', 0, 0, 0, 0, 0, 0, 10.00, 'draft'),
  ('d1500000-0000-4000-8000-000000000002', 'd1300000-0000-4000-8000-000000000002', 'd1100000-0000-4000-8000-000000000001',
   '2026-08-31', '2026-09-06', 0, 0, 0, 0, 0, 0, 10.00, 'draft');

-- Test 5: Boundary filtering in calculate_payroll_delivery_lines
select is(
  (select count(*)::integer from public.calculate_payroll_delivery_lines('d1300000-0000-4000-8000-000000000001', '2026-08-31', '2026-09-06')),
  4,
  'only the 4 dates inside 2026-08-31 to 2026-09-06 are returned (Aug 30 and Sep 7 excluded)'
);

-- Test 6: Summary calculations
-- Standard parcels: 20 + 30 + 25 + 15 = 90
-- Heavy parcels: 2 + 0 + 4 + 1 = 7
-- Total: 97
-- Standard earnings (late rate 8.00 without attendance time_in): 90 * 8 = 720.00
-- Heavy earnings: 7 * 25 = 175.00
-- Gross: 895.00
select is(
  (select total_parcels from public.calculate_payroll_delivery_summary('d1300000-0000-4000-8000-000000000001', '2026-08-31', '2026-09-06')),
  97,
  'calculate_payroll_delivery_summary derives exact 97 total parcels'
);

-- Test 7: refresh_draft_payroll_record RPC updates Draft header values
select is(
  (public.refresh_draft_payroll_record('d1500000-0000-4000-8000-000000000001')->>'success')::boolean,
  true,
  'refresh_draft_payroll_record returns success'
);

select is(
  (select total_parcels from public.payroll_records where id = 'd1500000-0000-4000-8000-000000000001'),
  97,
  'payroll_records.total_parcels is updated to 97 on draft'
);

select is(
  (select status from public.payroll_records where id = 'd1500000-0000-4000-8000-000000000001'),
  'draft'::public.payroll_status,
  'refresh_draft_payroll_record does not alter draft status'
);

-- Test 8: Isolation - Rider 2 record remains unmutated
select is(
  (select total_parcels from public.payroll_records where id = 'd1500000-0000-4000-8000-000000000002'),
  0,
  'refreshing Rider 1 did not mutate Rider 2 draft payroll'
);

-- Test 9: Draft / Pending Parity
-- Transition Rider 1 to pending; trigger builds immutable delivery lines
update public.payroll_records
set status = 'pending'::public.payroll_status, submitted_by = 'd1200000-0000-4000-8000-000000000001'
where id = 'd1500000-0000-4000-8000-000000000001';

select is(
  (select coalesce(sum(standard_delivered + heavy_delivered), 0)::integer from public.payroll_delivery_lines where payroll_record_id = 'd1500000-0000-4000-8000-000000000001'),
  (select total_parcels from public.payroll_records where id = 'd1500000-0000-4000-8000-000000000001'),
  'Pending immutable delivery lines sum matches Draft header total parcels exactly'
);

select is(
  (select coalesce(sum(gross_delivery_pay), 0)::numeric(10,2) from public.payroll_delivery_lines where payroll_record_id = 'd1500000-0000-4000-8000-000000000001'),
  (select gross_pay from public.payroll_records where id = 'd1500000-0000-4000-8000-000000000001'),
  'Pending immutable delivery lines gross matches Draft header gross_pay exactly'
);

-- Test 10: Concurrency / Stale-write safety - Refreshing a pending record safely no-ops
select is(
  (public.refresh_draft_payroll_record('d1500000-0000-4000-8000-000000000001')->>'skipped')::boolean,
  true,
  'refresh_draft_payroll_record on a pending record safely skips and no-ops'
);

select is(
  (select status from public.payroll_records where id = 'd1500000-0000-4000-8000-000000000001'),
  'pending'::public.payroll_status,
  'pending status is not reverted to draft by stale refresh'
);

-- Test 11: Cross-month period (2026-09-28 Mon -> 2026-10-04 Sun)
insert into public.parcel_logs (rider_id, date, parcels, created_by) values
  ('d1300000-0000-4000-8000-000000000001', '2026-09-28', 12, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000001', '2026-09-30', 18, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000001', '2026-10-01', 22, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000001', '2026-10-04', 10, 'd1200000-0000-4000-8000-000000000001');

select is(
  (select total_parcels from public.calculate_payroll_delivery_summary('d1300000-0000-4000-8000-000000000001', '2026-09-28', '2026-10-04')),
  62,
  'Cross-month weekly period (Sep 28 to Oct 4) sums exactly 62 parcels'
);

-- Test 12: High volume dataset (1,000 parcels in single week)
insert into public.parcel_logs (rider_id, date, parcels, heavy_parcels, created_by) values
  ('d1300000-0000-4000-8000-000000000002', '2026-09-28', 150, 10, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000002', '2026-09-29', 150, 10, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000002', '2026-09-30', 150, 10, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000002', '2026-10-01', 150, 10, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000002', '2026-10-02', 150, 10, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000002', '2026-10-03', 150, 10, 'd1200000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000002', '2026-10-04', 100, 40, 'd1200000-0000-4000-8000-000000000001');

select is(
  (select total_parcels from public.calculate_payroll_delivery_summary('d1300000-0000-4000-8000-000000000002', '2026-09-28', '2026-10-04')),
  1100,
  'Server calculation handles 1,000+ parcels without client pagination or truncation limitations'
);

rollback;
