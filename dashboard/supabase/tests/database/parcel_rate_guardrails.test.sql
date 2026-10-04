begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('parcel_rate_guardrails_test'));
select plan(31);

-- 1. Verify existing active configuration was migrated/backfilled to 12/11/10 and 17/16/15
select is(
  (
    select jsonb_build_array(
      early_standard_rate,
      regular_standard_rate,
      late_standard_rate,
      heavy_parcel_rate,
      regular_heavy_rate,
      late_heavy_rate,
      heavy_threshold_kg
    )
    from public.parcel_rate_configurations
    where active and effective_from = date '2026-01-01'
  ),
  jsonb_build_array(12.00, 11.00, 10.00, 17.00, 16.00, 15.00, 4.00),
  'Test 1: seeded parcel rates backfilled to 12/11/10 Small and 17/16/15 Bulky'
);

-- 2. Valid independent progression passes (15 -> 12 -> 9 Small, 20 -> 16 -> 12 Bulky)
select lives_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (15, 12, 9, 20, 16, 12, 5, date '2027-01-01', false, 'Independent steep progression test')$$,
  'Test 2: Valid independent steep progression (15 -> 12 -> 9 and 20 -> 16 -> 12) is accepted'
);

-- 3. Flat progression passes (12 -> 12 -> 12 Small, 17 -> 17 -> 17 Bulky)
select lives_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (12, 12, 12, 17, 17, 17, 4, date '2027-02-01', false, 'Flat rate test')$$,
  'Test 3: Flat progression (12 -> 12 -> 12 and 17 -> 17 -> 17) is accepted'
);

-- 4. Valid equal-adjacent progression passes (12 -> 12 -> 10 Small, 17 -> 17 -> 15 Bulky)
select lives_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (12, 12, 10, 17, 17, 15, 4, date '2027-02-15', false, 'Equal adjacent rate test')$$,
  'Test 4: Equal adjacent progression (12 -> 12 -> 10 and 17 -> 17 -> 15) is accepted'
);

-- 5. Invalid Small Regular > Early (12 -> 13 -> 10) is blocked
select throws_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (12, 13, 10, 17, 16, 15, 4, date '2027-03-01', false, 'Invalid small regular test')$$,
  '23514',
  null,
  'Test 5: Invalid Small Regular > Early (12 -> 13 -> 10) is blocked by check constraint'
);

-- 6. Invalid Small Late > Regular (12 -> 11 -> 15) is blocked
select throws_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (12, 11, 15, 17, 16, 15, 4, date '2027-04-01', false, 'Invalid small late test')$$,
  '23514',
  null,
  'Test 6: Invalid Small Late > Regular (12 -> 11 -> 15) is blocked by check constraint'
);

-- 7. Invalid Bulky Regular > Early (17 -> 18 -> 15) is blocked
select throws_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (12, 11, 10, 17, 18, 15, 4, date '2027-05-01', false, 'Invalid bulky regular test')$$,
  '23514',
  null,
  'Test 7: Invalid Bulky Regular > Early (17 -> 18 -> 15) is blocked by check constraint'
);

-- 8. Invalid Bulky Late > Regular (17 -> 16 -> 19) is blocked
select throws_ok(
  $$insert into public.parcel_rate_configurations (
      early_standard_rate, regular_standard_rate, late_standard_rate,
      heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
      heavy_threshold_kg, effective_from, active, change_reason
    ) values (12, 11, 10, 17, 16, 19, 4, date '2027-06-01', false, 'Invalid bulky late test')$$,
  '23514',
  null,
  'Test 8: Invalid Bulky Late > Regular (17 -> 16 -> 19) is blocked by check constraint'
);

-- 9. Legacy insert omitting bulky tiers defaults regular and late bulky rates to heavy_parcel_rate
insert into public.parcel_rate_configurations (
  early_standard_rate, regular_standard_rate, late_standard_rate,
  heavy_parcel_rate, heavy_threshold_kg, effective_from, active, change_reason
) values (
  12, 11, 10,
  17, 4, date '2027-07-01', false, 'Legacy writer test'
);

select is(
  (
    select jsonb_build_array(regular_heavy_rate, late_heavy_rate)
    from public.parcel_rate_configurations
    where effective_from = date '2027-07-01'
  ),
  jsonb_build_array(17.00, 17.00),
  'Test 9: Legacy insert omitting regular/late bulky rates defaults them to heavy_parcel_rate (17.00)'
);

-- 10. Audit table captures new bulky tier columns in new_values
select is(
  (
    select jsonb_build_array(
      (new_values->>'heavy_parcel_rate')::numeric,
      (new_values->>'regular_heavy_rate')::numeric,
      (new_values->>'late_heavy_rate')::numeric
    )
    from public.parcel_rate_configuration_audit
    where rate_configuration_id = (select id from public.parcel_rate_configurations where effective_from = date '2027-01-01')
    order by changed_at desc
    limit 1
  ),
  jsonb_build_array(20.00, 16.00, 12.00),
  'Test 10: Audit table records bulky tier progression in new_values jsonb'
);

-- Set up test data for attendance vs rate bracket resolution
insert into auth.users (id, email, email_confirmed_at) values
  ('d2000000-0000-4000-8000-000000000001', 'rate-admin@example.test', clock_timestamp());

insert into public.riders (id, name, mkb_id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'Rate Test Rider', 'TEST-RATE-001', 'rate-test@example.test');

insert into public.users (id, full_name, email, role) values
  ('d2000000-0000-4000-8000-000000000001', 'Rate Test Admin', 'rate-admin@example.test', 'admin');

-- EXACT SECOND BOUNDARY TESTS:
-- 07:59:59 -> Early Small (12) and Early Bulky (17)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000011',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-06',
  timestamptz '2026-10-06 07:59:59+08',
  'present',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000011',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-06',
  5, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000011'),
  12.00,
  'Test 11: 07:59:59 Time In resolves Small Early rate (12.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000011'),
  17.00,
  'Test 12: 07:59:59 Time In resolves Bulky Early rate (17.00)'
);

-- 08:00:00 -> Early Small (12) and Early Bulky (17)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000012',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-07',
  timestamptz '2026-10-07 08:00:00+08',
  'present',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000012',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-07',
  5, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000012'),
  12.00,
  'Test 13: 08:00:00 Time In resolves Small Early rate (12.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000012'),
  17.00,
  'Test 14: 08:00:00 Time In resolves Bulky Early rate (17.00)'
);

-- 08:00:01 -> Regular Small (11) and Regular Bulky (16)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000013',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-08',
  timestamptz '2026-10-08 08:00:01+08',
  'present',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000013',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-08',
  5, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000013'),
  11.00,
  'Test 15: 08:00:01 Time In resolves Small Regular rate (11.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000013'),
  16.00,
  'Test 16: 08:00:01 Time In resolves Bulky Regular rate (16.00)'
);

-- 08:59:59 -> Regular Small (11) and Regular Bulky (16)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000014',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-09',
  timestamptz '2026-10-09 08:59:59+08',
  'present',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000014',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-09',
  5, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000014'),
  11.00,
  'Test 17: 08:59:59 Time In resolves Small Regular rate (11.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000014'),
  16.00,
  'Test 18: 08:59:59 Time In resolves Bulky Regular rate (16.00)'
);

-- 09:00:00 -> Regular Small (11) and Regular Bulky (16)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000015',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-10',
  timestamptz '2026-10-10 09:00:00+08',
  'late',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000015',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-10',
  5, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000015'),
  11.00,
  'Test 19: 09:00:00 Time In resolves Small Regular rate (11.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000015'),
  16.00,
  'Test 20: 09:00:00 Time In resolves Bulky Regular rate (16.00)'
);

-- 09:00:01 -> Late Small (10) and Late Bulky (15)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000016',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-11',
  timestamptz '2026-10-11 09:00:01+08',
  'late',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000016',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-11',
  5, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000016'),
  10.00,
  'Test 21: 09:00:01 Time In resolves Small Late rate (10.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000016'),
  15.00,
  'Test 22: 09:00:01 Time In resolves Bulky Late rate (15.00)'
);

-- ATTENDANCE SEPARATION TEST:
-- Time In = 08:10 -> Attendance status: 'present' (under 08:15 policy)
-- Resolves Regular Small (11) and Regular Bulky (16)
insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-12',
  timestamptz '2026-10-12 08:10:00+08',
  'present',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-12',
  10, 2, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000002'),
  11.00,
  'Test 23: 08:10 Time In resolves Small Regular rate (11.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000002'),
  16.00,
  'Test 24: 08:10 Time In resolves Bulky Regular rate (16.00)'
);

select is(
  (select status from public.attendance_logs where id = 'd3000000-0000-4000-8000-000000000002'),
  'present',
  'Test 25: 08:10 Time In remains Attendance Present under 08:15 lateness policy'
);

select is(
  (select daily_gross from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000002'),
  142.00, -- 10 * 11 + 2 * 16 = 110 + 32 = 142
  'Test 26: 08:10 daily gross calculates standard (110) + heavy (32) = 142'
);

-- Historical parcel log rate is not altered by subsequent updates
update public.parcel_logs
set notes = 'Updated notes only'
where id = 'd4000000-0000-4000-8000-000000000011';

select is(
  (select jsonb_build_array(rate, heavy_rate, daily_gross) from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000011'),
  jsonb_build_array(12.00, 17.00, 77.00),
  'Test 27: Historical parcel log rates are preserved and not recalculated on unrelated updates'
);

-- Future effective-dated configuration resolution
update public.parcel_rate_configurations
set effective_until = date '2026-10-31'
where active and effective_until is null and effective_from < date '2026-11-01';

insert into public.parcel_rate_configurations (
  early_standard_rate, regular_standard_rate, late_standard_rate,
  heavy_parcel_rate, regular_heavy_rate, late_heavy_rate,
  heavy_threshold_kg, effective_from, active, change_reason
) values (
  14.00, 13.00, 12.00,
  19.00, 18.00, 17.00,
  4.00, date '2026-11-01', true, 'November rate increase'
);

insert into public.attendance_logs (
  id, rider_id, date, time_in, status, source
) values (
  'd3000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-11-05',
  timestamptz '2026-11-05 08:00:00+08',
  'present',
  'face-scan'
);

insert into public.parcel_logs (
  id, rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by
) values (
  'd4000000-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-11-05',
  10, 1, 0, 0,
  'd2000000-0000-4000-8000-000000000001'
);

select is(
  (select rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000004'),
  14.00,
  'Test 28: Work date 2026-11-05 resolves new effective configuration early rate (14.00)'
);

select is(
  (select heavy_rate from public.parcel_logs where id = 'd4000000-0000-4000-8000-000000000004'),
  19.00,
  'Test 29: Work date 2026-11-05 resolves new effective configuration bulky early rate (19.00)'
);

-- Payroll delivery snapshot captures regular and late bulky rates
insert into public.payroll_records (
  id, rider_id, cutoff_start, cutoff_end, status
) values (
  'd5000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  date '2026-10-05',
  date '2026-10-11',
  'draft'
);

set local role authenticated;
set local "request.jwt.claim.sub" = 'd2000000-0000-4000-8000-000000000001';

update public.payroll_records
set status = 'pending'
where id = 'd5000000-0000-4000-8000-000000000001';

select is(
  (select jsonb_build_array(
    heavy_rate_snapshot,
    regular_heavy_rate_snapshot,
    late_heavy_rate_snapshot
  ) from public.payroll_records where id = 'd5000000-0000-4000-8000-000000000001'),
  jsonb_build_array(17.00, 16.00, 15.00),
  'Test 30: Payroll record snapshot captures early (17), regular (16), and late (15) bulky rates'
);

-- Immutability: finalized payroll delivery lines cannot be modified even by database admin
reset role;

select throws_ok(
  $$update public.payroll_delivery_lines
    set applied_heavy_rate = 99.00
    where payroll_record_id = 'd5000000-0000-4000-8000-000000000001'$$,
  'Finalized payroll delivery lines are immutable.',
  'Test 31: Finalized payroll delivery lines are immutable and reject rate mutations'
);

rollback;
