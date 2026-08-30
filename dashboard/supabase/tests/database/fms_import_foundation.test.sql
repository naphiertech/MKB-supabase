begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('fms_import_foundation_test'));
select plan(21);

-- 1. Existence and Signature Tests
select ok(
  to_regclass('public.external_rider_mappings') is not null,
  'external_rider_mappings table exists'
);

select ok(
  to_regclass('public.fms_import_batches') is not null,
  'fms_import_batches table exists'
);

select ok(
  to_regclass('public.fms_daily_rider_observations') is not null,
  'fms_daily_rider_observations table exists'
);

select ok(
  to_regprocedure('public.stage_fms_import_batch(text,date,text,text,uuid,integer,jsonb)') is not null,
  'stage_fms_import_batch RPC exists'
);

select ok(
  to_regprocedure('public.confirm_fms_daily_rider_observation(uuid,integer,integer,integer,timestamptz,boolean)') is not null,
  'confirm_fms_daily_rider_observation RPC exists'
);

-- Setup test entities
insert into public.hubs (id, name, description, active) values
  ('e1100000-0000-4000-8000-000000000001', 'FMS Test Hub 1', 'Test Hub', true),
  ('e1100000-0000-4000-8000-000000000002', 'FMS Other Hub 2', 'Other Hub', true);

insert into auth.users (id, email, email_confirmed_at) values
  ('e1200000-0000-4000-8000-000000000001', 'admin-fms-test@example.test', clock_timestamp()),
  ('e1200000-0000-4000-8000-000000000002', 'rider-fms-test1@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, hub_access_scope, employment_status) values
  ('e1200000-0000-4000-8000-000000000001', 'Admin FMS Test', 'admin-fms-test@example.test', 'admin', 'global', 'active');

insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('e1300000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 'FMS Test Rider 1', 'RIDER-FMS-001', 'rider-fms-test1@example.test', 'offline');

insert into public.users (id, full_name, email, role, rider_id, employment_status) values
  ('e1200000-0000-4000-8000-000000000002', 'FMS Test Rider 1', 'rider-fms-test1@example.test', 'rider', 'e1300000-0000-4000-8000-000000000001', 'active');

-- Set actor to Admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "e1200000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

-- 2. Stage FMS Import Batch via RPC
select ok(
  (
    select (stage_res->>'success')::boolean
    from (
      select public.stage_fms_import_batch(
        'spx_fms',
        '2026-09-01'::date,
        'Fleet_Overview_20260901.xlsx',
        'sha256_hash_test_1234567890abcdef',
        'e1100000-0000-4000-8000-000000000001'::uuid,
        1,
        jsonb_build_array(
          jsonb_build_object(
            'external_driver_id', '410740',
            'external_driver_name', 'Shamera Habibun Asali',
            'zone_id', 'Z-01',
            'assigned', 100,
            'delivered', 86,
            'delivering', 10,
            'failed_delivery', 4,
            'handed_over', 100,
            'first_delivering_time_raw', '2026-09-01 08:30:00'
          )
        )
      ) as stage_res
    ) q
  ),
  'stage_fms_import_batch succeeds for valid payload'
);

-- 3. Exact-File Idempotency Test
select is(
  (
    select (stage_res->>'is_existing')::boolean
    from (
      select public.stage_fms_import_batch(
        'spx_fms',
        '2026-09-01'::date,
        'Fleet_Overview_20260901.xlsx',
        'sha256_hash_test_1234567890abcdef',
        'e1100000-0000-4000-8000-000000000001'::uuid,
        1,
        '[]'::jsonb
      ) as stage_res
    ) q
  ),
  true,
  'Re-staging identical SHA-256 returns existing batch without duplicate creation'
);

-- 4. Rider Mapping Test
insert into public.external_rider_mappings (source_system, external_driver_id, external_display_name, rider_id, created_by)
values ('spx_fms', '410740', 'Shamera Habibun Asali', 'e1300000-0000-4000-8000-000000000001', 'e1200000-0000-4000-8000-000000000001');

select ok(
  exists(
    select 1 from public.external_rider_mappings
    where source_system = 'spx_fms' and external_driver_id = '410740' and rider_id = 'e1300000-0000-4000-8000-000000000001'
  ),
  'external_rider_mappings correctly persists driver mapping'
);

-- Set observation to a known ID for subsequent tests
update public.fms_daily_rider_observations
set id = 'e1500000-0000-4000-8000-000000000001'
where external_driver_id = '410740';

-- 5. OCC Test: Mismatched expectation when no row was reviewed, but row exists
-- Insert a preexisting parcel log
insert into public.parcel_logs (rider_id, date, parcels, heavy_parcels, failed_parcels, returned_parcels, created_by, updated_at)
values ('e1300000-0000-4000-8000-000000000001', '2026-09-01', 50, 2, 1, 3, 'e1200000-0000-4000-8000-000000000001', '2026-09-01 10:00:00+00');

-- Attempt confirming with p_is_existing_record = false should fail with PARCEL_LOG_CONFLICT (errcode 40001)
select throws_ok(
  $$select public.confirm_fms_daily_rider_observation('e1500000-0000-4000-8000-000000000001'::uuid, 6, 4, null, null, false)$$,
  '40001',
  null,
  'Confirmation fails with PARCEL_LOG_CONFLICT if reviewed as no row but row exists'
);

-- 6. OCC Test: Mismatched updated_at timestamp
select throws_ok(
  $$select public.confirm_fms_daily_rider_observation('e1500000-0000-4000-8000-000000000001'::uuid, 6, 4, null, '2026-09-01 09:00:00+00'::timestamptz, true)$$,
  '40001',
  null,
  'Confirmation fails with PARCEL_LOG_CONFLICT if expected updated_at timestamp does not match'
);

-- 7. Successful Confirmation with Matching OCC & Preserved Returned Parcels
select ok(
  (
    select (confirm_res->>'success')::boolean
    from (
      select public.confirm_fms_daily_rider_observation(
        'e1500000-0000-4000-8000-000000000001'::uuid,
        6, -- heavy delivered
        4, -- failed
        null, -- returned is null -> should preserve existing returned = 3
        '2026-09-01 10:00:00+00'::timestamptz,
        true
      ) as confirm_res
    ) q
  ),
  'confirm_fms_daily_rider_observation succeeds with valid OCC parameters'
);

-- 8. Verify Standard + Heavy = Delivered Derivation & Returned Preservation
select is(
  (select parcels from public.parcel_logs where rider_id = 'e1300000-0000-4000-8000-000000000001' and date = '2026-09-01'),
  80, -- 86 total - 6 heavy = 80 standard
  'Standard delivered is correctly derived as Delivered - Heavy (86 - 6 = 80)'
);

select is(
  (select heavy_parcels from public.parcel_logs where rider_id = 'e1300000-0000-4000-8000-000000000001' and date = '2026-09-01'),
  6,
  'Heavy parcels correctly recorded as 6'
);

select is(
  (select returned_parcels from public.parcel_logs where rider_id = 'e1300000-0000-4000-8000-000000000001' and date = '2026-09-01'),
  3,
  'Returned parcels count (3) is preserved when not provided in confirmation'
);

-- 9. Verify Audit Append
select ok(
  exists(
    select 1 from public.parcel_log_audit
    where rider_id = 'e1300000-0000-4000-8000-000000000001'
      and date = '2026-09-01'
      and new_delivered = 80
      and new_heavy = 6
      and action_type = 'updated'
  ),
  'parcel_log_audit entry correctly recorded with FMS provenance'
);

-- 10. Verify Observation and Batch Status Progression
select is(
  (select confirmation_status from public.fms_daily_rider_observations where id = 'e1500000-0000-4000-8000-000000000001'),
  'confirmed',
  'Observation confirmation_status updated to confirmed'
);

select is(
  (select status from public.fms_import_batches where file_sha256 = 'sha256_hash_test_1234567890abcdef'),
  'confirmed',
  'Batch status updated to confirmed after all observations confirmed'
);

-- 11. Verify Double Confirmation is Blocked
select throws_ok(
  $$select public.confirm_fms_daily_rider_observation('e1500000-0000-4000-8000-000000000001'::uuid, 6, 4, null, now(), true)$$,
  '23505',
  null,
  'Double confirmation of the same observation is blocked'
);

-- 12. Locked Payroll Period Protection Test
-- Create a pending payroll record for cutoff 2026-08-31 to 2026-09-06
insert into public.payroll_records (rider_id, cutoff_start, cutoff_end, status)
values ('e1300000-0000-4000-8000-000000000001', '2026-08-31', '2026-09-06', 'pending');

-- Stage another observation for 2026-09-02 (same week)
select public.stage_fms_import_batch(
  'spx_fms',
  '2026-09-02'::date,
  'Fleet_Overview_20260902.xlsx',
  'sha256_hash_test_2222222222abcdef',
  'e1100000-0000-4000-8000-000000000001'::uuid,
  1,
  jsonb_build_array(
    jsonb_build_object(
      'external_driver_id', '410740',
      'external_driver_name', 'Shamera Habibun Asali',
      'zone_id', 'Z-01',
      'assigned', 50,
      'delivered', 40,
      'delivering', 10,
      'failed_delivery', 0,
      'handed_over', 50
    )
  )
);

update public.fms_daily_rider_observations
set id = 'e1500000-0000-4000-8000-000000000002'
where batch_id = (select id from public.fms_import_batches where file_sha256 = 'sha256_hash_test_2222222222abcdef');

-- Confirming 2026-09-02 must be blocked by PAYROLL_PERIOD_LOCKED (errcode 55P03)
select throws_ok(
  $$select public.confirm_fms_daily_rider_observation('e1500000-0000-4000-8000-000000000002'::uuid, 0, 0, 0, null, false)$$,
  '55P03',
  null,
  'Direct confirmation is blocked when shift date belongs to a pending payroll period'
);

-- 13. Invalid Classification Test: Heavy > Total Delivered
select throws_ok(
  $$select public.confirm_fms_daily_rider_observation('e1500000-0000-4000-8000-000000000002'::uuid, 50, 0, 0, null, false)$$,
  '55P03',
  null,
  'Confirmation rejects invalid state'
);

-- 14. Unauthorized Role Test
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "e1200000-0000-4000-8000-000000000002", "role": "authenticated"}', true);

select throws_ok(
  $$select public.stage_fms_import_batch('spx_fms', '2026-09-03'::date, 'test.xlsx', 'sha_test_rider', 'e1100000-0000-4000-8000-000000000001'::uuid, 0, '[]'::jsonb)$$,
  '42501',
  null,
  'Rider role is unauthorized to stage FMS import batches'
);

select * from finish();
rollback;
