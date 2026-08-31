begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('fms_import_foundation_test'));
select plan(41);

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

select ok(
  to_regprocedure('public.cancel_fms_import_batch(uuid)') is not null,
  'cancel_fms_import_batch RPC exists'
);

-- 1b. Verify Function Definition contains no stale column references
select is(
  (
    select count(*)
    from information_schema.routines
    where specific_schema = 'public'
      and routine_name = 'stage_fms_import_batch'
      and (
        routine_definition like '%total_delivered%'
        or routine_definition like '%returned_parcels%'
        or routine_definition like '%raw_payload%'
      )
  )::integer,
  0,
  'stage_fms_import_batch contains no references to total_delivered, returned_parcels, or raw_payload'
);

-- Setup test entities
insert into public.hubs (id, name, description, active, latitude, longitude, attendance_radius_m) values
  ('e1100000-0000-4000-8000-000000000001', 'FMS Test Hub 1', 'Test Hub', true, 6.9214000, 122.0790000, 150),
  ('e1100000-0000-4000-8000-000000000002', 'FMS Other Hub 2', 'Other Hub', true, 6.9215000, 122.0791000, 150);

insert into auth.users (id, email, email_confirmed_at) values
  ('e1200000-0000-4000-8000-000000000001', 'admin-fms-test@example.test', clock_timestamp()),
  ('e1200000-0000-4000-8000-000000000002', 'rider-fms-test1@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, hub_access_scope, employment_status) values
  ('e1200000-0000-4000-8000-000000000001', 'Admin FMS Test', 'admin-fms-test@example.test', 'admin', 'global', 'active');

insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('e1300000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', 'FMS Test Rider 1', 'RIDER-FMS-001', 'rider-fms-test1@example.test', 'offline');

insert into public.users (id, full_name, email, role, rider_id, employment_status) values
  ('e1200000-0000-4000-8000-000000000002', 'FMS Test Rider 1', 'rider-fms-test1@example.test', 'rider', 'e1300000-0000-4000-8000-000000000001', 'active');

insert into public.attendance_logs (rider_id, hub_id, date, status, time_in, source) values
  ('e1300000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', '2026-09-01', 'present', '2026-09-01 07:45:00+08', 'system'),
  ('e1300000-0000-4000-8000-000000000001', 'e1100000-0000-4000-8000-000000000001', '2026-09-02', 'present', '2026-09-02 07:45:00+08', 'system');

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

-- 2b. Field-level Observation Persisted Verification
select is(
  (select delivered from public.fms_daily_rider_observations where external_driver_id = '410740'),
  86,
  'observation.delivered is correctly persisted as 86'
);

select is(
  (select assigned from public.fms_daily_rider_observations where external_driver_id = '410740'),
  100,
  'observation.assigned is correctly persisted as 100'
);

select is(
  (select handed_over from public.fms_daily_rider_observations where external_driver_id = '410740'),
  100,
  'observation.handed_over is correctly persisted as 100'
);

select is(
  (select delivering from public.fms_daily_rider_observations where external_driver_id = '410740'),
  10,
  'observation.delivering is correctly persisted as 10'
);

select is(
  (select failed_delivery from public.fms_daily_rider_observations where external_driver_id = '410740'),
  4,
  'observation.failed_delivery is correctly persisted as 4'
);

select is(
  (select confirmation_status from public.fms_daily_rider_observations where external_driver_id = '410740'),
  'staged',
  'observation initial confirmation_status is staged'
);

-- 3. Exact-File Same Context Idempotency Test
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
  'Re-staging identical SHA-256 with same date and hub returns existing batch'
);

-- 3b. Context Conflict Tests (Same SHA + Different Date)
select throws_ok(
  $$select public.stage_fms_import_batch(
    'spx_fms',
    '2026-09-02'::date,
    'Fleet_Overview_20260902.xlsx',
    'sha256_hash_test_1234567890abcdef',
    'e1100000-0000-4000-8000-000000000001'::uuid,
    1,
    '[]'::jsonb
  )$$,
  '23505',
  null,
  'Re-staging identical SHA-256 with different date raises FILE_ALREADY_STAGED'
);

-- 3c. Context Conflict Tests (Same SHA + Different Hub)
select throws_ok(
  $$select public.stage_fms_import_batch(
    'spx_fms',
    '2026-09-01'::date,
    'Fleet_Overview_20260901.xlsx',
    'sha256_hash_test_1234567890abcdef',
    'e1100000-0000-4000-8000-000000000002'::uuid,
    1,
    '[]'::jsonb
  )$$,
  '23505',
  null,
  'Re-staging identical SHA-256 with different hub raises FILE_ALREADY_STAGED'
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

-- 4b. Auto Mapping on Staging Test: new batch with pre-existing mapping auto-resolves rider_id
select ok(
  (
    select (stage_res->>'success')::boolean
    from (
      select public.stage_fms_import_batch(
        'spx_fms',
        '2026-09-05'::date,
        'Fleet_Overview_20260905.xlsx',
        'sha256_hash_test_mapped_rider_auto',
        'e1100000-0000-4000-8000-000000000001'::uuid,
        1,
        jsonb_build_array(
          jsonb_build_object(
            'external_driver_id', '410740',
            'external_driver_name', 'Shamera Habibun Asali',
            'zone_id', 'Z-01',
            'assigned', 90,
            'delivered', 80,
            'delivering', 5,
            'failed_delivery', 5,
            'handed_over', 90
          )
        )
      ) as stage_res
    ) q
  ),
  'Staging batch with mapped driver succeeds'
);

select is(
  (
    select rider_id
    from public.fms_daily_rider_observations
    where batch_id = (select id from public.fms_import_batches where file_sha256 = 'sha256_hash_test_mapped_rider_auto')
  ),
  'e1300000-0000-4000-8000-000000000001'::uuid,
  'Observation correctly auto-resolves mapped rider_id'
);

-- Set observation to a known ID for subsequent tests
update public.fms_daily_rider_observations
set id = 'e1500000-0000-4000-8000-000000000001'
where batch_id = (select id from public.fms_import_batches where file_sha256 = 'sha256_hash_test_1234567890abcdef');

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

-- 15. Atomicity Test: Failed observation staging leaves no orphan batch row
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "e1200000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select throws_ok(
  $$select public.stage_fms_import_batch(
    'spx_fms',
    '2026-09-04'::date,
    'Bad_File.xlsx',
    'sha256_hash_test_failing_batch',
    'e1100000-0000-4000-8000-000000000001'::uuid,
    1,
    jsonb_build_array(
      jsonb_build_object(
        'external_driver_id', null,
        'external_driver_name', 'Bad Driver'
      )
    )
  )$$,
  '23502',
  null,
  'Staging with null external_driver_id throws not_null_violation'
);

-- 16. Hub Consistency Test: Mapped Rider belonging to Hub 1 rejects staging under Hub 2
select throws_ok(
  $$select public.stage_fms_import_batch(
    'spx_fms',
    '2026-09-06'::date,
    'Hub2_Attempt.xlsx',
    'sha256_hash_test_cross_hub_rejection',
    'e1100000-0000-4000-8000-000000000002'::uuid, -- Hub 2
    1,
    jsonb_build_array(
      jsonb_build_object(
        'external_driver_id', '410740', -- Mapped to Hub 1 Rider
        'external_driver_name', 'Shamera Habibun Asali',
        'delivered', 50
      )
    )
  )$$,
  '22000',
  null,
  'Staging batch under Hub 2 with driver mapped to Hub 1 rider throws FMS_RIDER_HUB_MISMATCH'
);

select is(
  (select count(*) from public.fms_import_batches where file_sha256 = 'sha256_hash_test_cross_hub_rejection')::integer,
  0,
  'Cross-hub staging rejection creates 0 batches'
);

-- 17. Safe Staged Batch Cancellation Test
select ok(
  (
    select (cancel_res->>'success')::boolean
    from (
      select public.cancel_fms_import_batch(
        (select id from public.fms_import_batches where file_sha256 = 'sha256_hash_test_mapped_rider_auto')
      ) as cancel_res
    ) q
  ),
  'cancel_fms_import_batch succeeds for staged batch with 0 confirmed records'
);

select is(
  (select status from public.fms_import_batches where file_sha256 = 'sha256_hash_test_mapped_rider_auto'),
  'cancelled',
  'Batch status is updated to cancelled in database'
);

select ok(
  exists(
    select 1 from public.fms_daily_rider_observations
    where batch_id = (select id from public.fms_import_batches where file_sha256 = 'sha256_hash_test_mapped_rider_auto')
  ),
  'Historical observations are preserved after cancellation'
);

-- 18. Reject Cancellation When Observations Already Confirmed
select throws_ok(
  $$select public.cancel_fms_import_batch(
    (select id from public.fms_import_batches where file_sha256 = 'sha256_hash_test_1234567890abcdef')
  )$$,
  '22000',
  null,
  'Cancellation is rejected when batch has confirmed observations'
);

-- 19. Re-staging Same SHA after Cancellation Succeeds
select ok(
  (
    select (stage_res->>'success')::boolean
    from (
      select public.stage_fms_import_batch(
        'spx_fms',
        '2026-09-05'::date,
        'Fleet_Overview_20260905_restaged.xlsx',
        'sha256_hash_test_mapped_rider_auto',
        'e1100000-0000-4000-8000-000000000001'::uuid,
        1,
        jsonb_build_array(
          jsonb_build_object(
            'external_driver_id', '410740',
            'external_driver_name', 'Shamera Habibun Asali',
            'delivered', 80
          )
        )
      ) as stage_res
    ) q
  ),
  'Re-staging identical SHA after cancellation succeeds and creates new active batch'
);

select * from finish();
rollback;
