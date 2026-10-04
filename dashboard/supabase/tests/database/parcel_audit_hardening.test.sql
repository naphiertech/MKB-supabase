begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('parcel_audit_hardening_test'));

select plan(53);

-- Set deterministic test clock: 2026-10-04 10:00:00+08
select set_config('app.test_clock', '2026-10-04 10:00:00+08', true);

-- ============================================================================
-- FIXTURES SETUP
-- ============================================================================

-- Hubs
insert into public.hubs (id, name, active, latitude, longitude, attendance_radius_m) values
  ('d2000000-0000-4000-8000-000000000001', 'Central Hub', true, 14.5547000, 121.0244000, 500),
  ('d2000000-0000-4000-8000-000000000002', 'Remote Hub', true, 14.6500000, 121.0300000, 500);

-- Auth users
insert into auth.users (id, email) values
  ('e2000000-0000-4000-8000-000000000001', 'rider.central@example.test'),
  ('e2000000-0000-4000-8000-000000000002', 'admin.parcels@example.test'),
  ('e2000000-0000-4000-8000-000000000003', 'hr.central@example.test'),
  ('e2000000-0000-4000-8000-000000000004', 'rider.remote@example.test'),
  ('e2000000-0000-4000-8000-000000000005', 'payroll.staff@example.test');

-- Riders
insert into public.riders (id, name, mkb_id, email, hub_id, status) values
  ('f2000000-0000-4000-8000-000000000001', 'Rider Alpha', 'RDR-ALPHA-01', 'rider.central@example.test', 'd2000000-0000-4000-8000-000000000001', 'active'),
  ('f2000000-0000-4000-8000-000000000002', 'Rider Beta', 'RDR-BETA-02', 'rider.remote@example.test', 'd2000000-0000-4000-8000-000000000002', 'active');

-- Staff & Users
insert into public.users (id, full_name, email, role, status, employment_status, rider_id, hub_access_scope) values
  ('e2000000-0000-4000-8000-000000000001', 'Rider Alpha', 'rider.central@example.test', 'rider', 'active', 'active', 'f2000000-0000-4000-8000-000000000001', 'assigned'),
  ('e2000000-0000-4000-8000-000000000002', 'Admin Parcel', 'admin.parcels@example.test', 'admin', 'active', 'active', null, 'global'),
  ('e2000000-0000-4000-8000-000000000003', 'HR Central', 'hr.central@example.test', 'hr', 'active', 'active', null, 'assigned'),
  ('e2000000-0000-4000-8000-000000000004', 'Rider Beta', 'rider.remote@example.test', 'rider', 'active', 'active', 'f2000000-0000-4000-8000-000000000002', 'assigned'),
  ('e2000000-0000-4000-8000-000000000005', 'Payroll Staff', 'payroll.staff@example.test', 'payroll', 'active', 'active', null, 'global');

-- Link HR Central to Central Hub only
insert into public.user_hub_access (user_id, hub_id) values
  ('e2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001');

-- Required attendance record for Rider Alpha on 2026-10-04 (system invariant)
insert into public.attendance_logs (id, rider_id, hub_id, date, time_in, status, source) values
  ('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '2026-10-04', '2026-10-04 08:00:00+08', 'present', 'face-scan');

-- Required attendance record for Rider Beta on 2026-10-04 (system invariant)
insert into public.attendance_logs (id, rider_id, hub_id, date, time_in, status, source) values
  ('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', '2026-10-04', '2026-10-04 08:00:00+08', 'present', 'face-scan');

-- ============================================================================
-- TEST 1: Audit Immutability as superuser/postgres (Trigger Level)
-- ============================================================================

-- Create a sample parcel row for Rider Beta (trigger automatically inserts audit row)
insert into public.parcel_logs (
  id, rider_id, hub_id, date, parcels
) values (
  'b2000000-0000-4000-8000-000000000002',
  'f2000000-0000-4000-8000-000000000002',
  'd2000000-0000-4000-8000-000000000002',
  '2026-10-04',
  10
);

select throws_matching(
  $$update public.parcel_log_audit set reason = 'tampered' where parcel_log_id = 'b2000000-0000-4000-8000-000000000002'$$,
  'IMMUTABLE_RECORD',
  'Audit UPDATE blocked with 42501 IMMUTABLE_RECORD'
);

select throws_matching(
  $$delete from public.parcel_log_audit where parcel_log_id = 'b2000000-0000-4000-8000-000000000002'$$,
  'IMMUTABLE_RECORD',
  'Audit DELETE blocked with 42501 IMMUTABLE_RECORD'
);

-- ============================================================================
-- SWITCH TO AUTHENTICATED ADMIN
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- ============================================================================
-- TEST 2: Initial Creation via save_daily_parcel_entries without custom reason
-- ============================================================================

select lives_ok(
  $$select public.save_daily_parcel_entries(jsonb_build_array(
    jsonb_build_object(
      'riderId', 'f2000000-0000-4000-8000-000000000001',
      'date', '2026-10-04',
      'parcels', 17,
      'heavyParcels', 2,
      'failedDeliveries', 1,
      'returnedParcels', 0
    )
  ))$$,
  'Initial parcel creation succeeds without explicit custom reason'
);

-- Exactly one audit record created with action_type = created and fallback reason
select is(
  (select count(*)::bigint from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  1::bigint,
  'INSERT parcel log creates exactly one audit record'
);

select is(
  (select new_delivered from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  17,
  'Initial audit record snapshots new_delivered = 17'
);

select is(
  (select action_type::text from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  'created',
  'Initial audit record has action_type = created'
);

-- ============================================================================
-- TEST 3: Existing Record Edit with Blank Reason Rejected
-- ============================================================================

select throws_matching(
  $$select public.save_daily_parcel_entries(jsonb_build_array(
    jsonb_build_object(
      'riderId', 'f2000000-0000-4000-8000-000000000001',
      'date', '2026-10-04',
      'parcels', 19,
      'heavyParcels', 2,
      'failedDeliveries', 1,
      'returnedParcels', 0,
      'reason', '   '
    )
  ))$$,
  'MISSING_EDIT_REASON',
  'Existing record edit with blank reason is rejected'
);

-- Confirm counts unchanged after rejected edit
select is(
  (select parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  17,
  'Parcel log parcels unchanged at 17 after rejected edit'
);

-- ============================================================================
-- TEST 4: Existing Record Edit: 17 -> 19 with Valid Reason (Atomic Audit)
-- ============================================================================

select lives_ok(
  $$select public.save_daily_parcel_entries(jsonb_build_array(
    jsonb_build_object(
      'riderId', 'f2000000-0000-4000-8000-000000000001',
      'date', '2026-10-04',
      'parcels', 19,
      'heavyParcels', 3,
      'failedDeliveries', 1,
      'returnedParcels', 0,
      'reason', '2 delivered and 1 heavy missing from initial manifest'
    )
  ))$$,
  'Draft edit with valid reason succeeds'
);

-- Total audit rows is now exactly 2 for this parcel log (initial insert + draft edit)
select is(
  (select count(*)::bigint from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  2::bigint,
  'UPDATE 17 -> 19 creates exactly one new audit row'
);

-- Verify old_delivered = 17, new_delivered = 19, exact reason and actor
select is(
  (select old_delivered from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04' order by timestamp desc limit 1),
  17,
  'Draft edit audit row has old_delivered = 17'
);

select is(
  (select new_delivered from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04' order by timestamp desc limit 1),
  19,
  'Draft edit audit row has new_delivered = 19'
);

select is(
  (select reason from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04' order by timestamp desc limit 1),
  '2 delivered and 1 heavy missing from initial manifest',
  'Draft edit captures exact submitted reason'
);

select is(
  (select changed_by from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04' order by timestamp desc limit 1),
  'e2000000-0000-4000-8000-000000000002'::uuid,
  'Draft RPC captures actor auth.uid()'
);

-- ============================================================================
-- TEST 5: Parcel Log Delete Protection
-- ============================================================================

select throws_matching(
  $$delete from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'$$,
  'DELETE_FORBIDDEN',
  'parcel_logs DELETE blocked with 42501 DELETE_FORBIDDEN'
);

-- ============================================================================
-- TEST 6: Direct/Legacy Update Still Audited by Trigger
-- ============================================================================

-- Simulate direct table update bypassing RPC
update public.parcel_logs
set notes = 'Direct operational note update'
where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04';

select is(
  (select count(*)::bigint from public.parcel_log_audit where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  3::bigint,
  'Direct/legacy mutation cannot change parcel data without trigger audit'
);

-- ============================================================================
-- TEST 7: Locked Correction Workflow — Atomic Approval
-- ============================================================================

-- Insert a correction request as Admin (requested_by = auth.uid())
insert into public.parcel_correction_requests (
  id, parcel_log_id, rider_id, date,
  previous_delivered, previous_heavy, previous_failed, previous_returned,
  requested_delivered, requested_heavy, requested_failed, requested_returned,
  reason, requested_by, status
) values (
  'c2000000-0000-4000-8000-000000000001',
  (select id from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  'f2000000-0000-4000-8000-000000000001',
  '2026-10-04',
  19, 3, 1, 0,
  25, 4, 1, 0,
  'Supervisor re-tally found 6 missing packages',
  'e2000000-0000-4000-8000-000000000002',
  'pending'
);

-- Approve correction via atomic RPC
select lives_ok(
  $$select public.review_parcel_correction_request('c2000000-0000-4000-8000-000000000001', 'approved', 'Approved after manifest audit')$$,
  'Locked correction approval executes cleanly'
);

-- Check parcel_logs was updated to 25
select is(
  (select parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  25,
  'Correction approval updates delivered parcels to 25'
);

-- Check request status is approved with reviewer recorded
select is(
  (select status::text from public.parcel_correction_requests where id = 'c2000000-0000-4000-8000-000000000001'),
  'approved',
  'Correction request status marked approved'
);

select is(
  (select reviewed_by from public.parcel_correction_requests where id = 'c2000000-0000-4000-8000-000000000001'),
  'e2000000-0000-4000-8000-000000000002'::uuid,
  'Correction request reviewer recorded'
);

-- Check exactly one approved audit row was created
select is(
  (select count(*)::bigint from public.parcel_log_audit where correction_request_id = 'c2000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Exactly one approved parcel mutation audit created'
);

select is(
  (select action_type::text from public.parcel_log_audit where correction_request_id = 'c2000000-0000-4000-8000-000000000001'),
  'correction_approved',
  'Audit row has action_type = correction_approved'
);

-- ============================================================================
-- TEST 8: Locked Correction Workflow — Rejection
-- ============================================================================

-- Insert second correction request
insert into public.parcel_correction_requests (
  id, parcel_log_id, rider_id, date,
  previous_delivered, previous_heavy, previous_failed, previous_returned,
  requested_delivered, requested_heavy, requested_failed, requested_returned,
  reason, requested_by, status
) values (
  'c2000000-0000-4000-8000-000000000002',
  (select id from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  'f2000000-0000-4000-8000-000000000001',
  '2026-10-04',
  25, 4, 1, 0,
  30, 4, 1, 0,
  'Disputed count by courier',
  'e2000000-0000-4000-8000-000000000002',
  'pending'
);

select lives_ok(
  $$select public.review_parcel_correction_request('c2000000-0000-4000-8000-000000000002', 'rejected', 'Waybill discrepancy not confirmed')$$,
  'Locked correction rejection executes cleanly'
);

-- Parcel counts unchanged (still 25)
select is(
  (select parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  25,
  'On rejection parcel counts remain unchanged at 25'
);

-- Rejection audit lifecycle preserved
select is(
  (select action_type::text from public.parcel_log_audit where correction_request_id = 'c2000000-0000-4000-8000-000000000002'),
  'correction_rejected',
  'Rejection creates lifecycle audit entry correction_rejected'
);

-- ============================================================================
-- TEST 9: Role Restrictions (Rider and Payroll cannot mutate)
-- ============================================================================

-- Switch to Rider
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_matching(
  $$select public.save_daily_parcel_entries(jsonb_build_array(
    jsonb_build_object(
      'riderId', 'f2000000-0000-4000-8000-000000000001',
      'date', '2026-10-04',
      'parcels', 99
    )
  ))$$,
  'UNAUTHORIZED',
  'Rider role cannot save parcel entries via RPC'
);

-- Switch to Payroll
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select throws_matching(
  $$select public.save_daily_parcel_entries(jsonb_build_array(
    jsonb_build_object(
      'riderId', 'f2000000-0000-4000-8000-000000000001',
      'date', '2026-10-04',
      'parcels', 99
    )
  ))$$,
  'UNAUTHORIZED',
  'Payroll role cannot save parcel entries via RPC'
);

-- ============================================================================
-- TEST 10: HR Hub Scope Restrictions
-- ============================================================================

-- Switch to HR Central (assigned to Central Hub only)
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

-- Attempt to save parcel for Rider Beta (Remote Hub) -> Forbidden
select throws_matching(
  $$select public.save_daily_parcel_entries(jsonb_build_array(
    jsonb_build_object(
      'riderId', 'f2000000-0000-4000-8000-000000000002',
      'date', '2026-10-04',
      'parcels', 10
    )
  ))$$,
  'FORBIDDEN_HUB_SCOPE',
  'HR cannot save parcel entries for riders outside assigned hub scope'
);

-- ============================================================================
-- TEST 11: submit_parcel_correction_request Atomic Submission & Lifecycle Audit
-- ============================================================================

-- Switch to HR Central (assigned to Central Hub)
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

-- Rider Alpha parcel log ID
-- We submit a correction request for Rider Alpha (25 standard, 4 heavy) -> requested 28 standard, 5 heavy
select lives_ok(
  $$select public.submit_parcel_correction_request(
    (select id from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
    28,
    5,
    1,
    0,
    'Client requested re-audit on 3 returned items'
  )$$,
  'HR can submit parcel correction request for rider in assigned hub'
);

-- Assert request row created with status 'pending'
select is(
  (select status::text from public.parcel_correction_requests
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04' and status = 'pending'),
  'pending',
  'Correction request is pending after submission'
);

-- Assert previous values snapshot accurately
select is(
  (select previous_delivered from public.parcel_correction_requests
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04' and status = 'pending'),
  25,
  'Correction request captured existing delivered parcels (25)'
);

-- Assert correction_requested audit row was created in the SAME atomic transaction
select is(
  (select count(*)::bigint from public.parcel_log_audit
   where action_type = 'correction_requested' and rider_id = 'f2000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Exactly one correction_requested audit row created on submission'
);

select is(
  (select change_source from public.parcel_log_audit
   where action_type = 'correction_requested' and rider_id = 'f2000000-0000-4000-8000-000000000001'),
  'correction_request',
  'Audit row has change_source = correction_request'
);

select is(
  (select reason from public.parcel_log_audit
   where action_type = 'correction_requested' and rider_id = 'f2000000-0000-4000-8000-000000000001'),
  'Client requested re-audit on 3 returned items',
  'Audit row captures exact submitted reason'
);

select is(
  (select changed_by from public.parcel_log_audit
   where action_type = 'correction_requested' and rider_id = 'f2000000-0000-4000-8000-000000000001'),
  'e2000000-0000-4000-8000-000000000003'::uuid,
  'Audit row captures HR submitter actor ID'
);

-- Assert parcel_logs itself is UNCHANGED (still 25)
select is(
  (select parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  25,
  'parcel_logs delivered count remains unchanged at 25 while request is pending'
);

-- Blank reason rejected
select throws_matching(
  $$select public.submit_parcel_correction_request(
    (select id from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
    28, 5, 1, 0, '   '
  )$$,
  'MISSING_CORRECTION_REASON',
  'Submission with blank reason is rejected'
);

-- HR cannot submit for rider in Remote Hub (outside scope)
select throws_matching(
  $$select public.submit_parcel_correction_request(
    'b2000000-0000-4000-8000-000000000002'::uuid,
    12, 0, 0, 0, 'Valid reason but unauthorized hub'
  )$$,
  'FORBIDDEN_HUB_SCOPE',
  'HR cannot submit correction request for rider outside assigned hub'
);

-- Rider cannot submit
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_matching(
  $$select public.submit_parcel_correction_request(
    (select id from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
    30, 0, 0, 0, 'Rider self-correction'
  )$$,
  'UNAUTHORIZED',
  'Rider role cannot submit parcel correction requests'
);

-- Payroll cannot submit
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_matching(
  $$select public.submit_parcel_correction_request(
    (select id from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
    30, 0, 0, 0, 'Payroll attempt'
  )$$,
  'UNAUTHORIZED',
  'Payroll role cannot submit parcel correction requests'
);

-- ============================================================================
-- TEST 12: Locked Approval Rollback Proof on Error
-- ============================================================================

-- Switch to Admin
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- Attempt invalid decision on the pending request
select throws_matching(
  $$select public.review_parcel_correction_request(
    (select id from public.parcel_correction_requests where rider_id = 'f2000000-0000-4000-8000-000000000001' and status = 'pending'),
    'maybe_approved',
    'Invalid decision'
  )$$,
  'INVALID_DECISION',
  'Review with invalid decision raises INVALID_DECISION'
);

-- Attempt review on already reviewed request
select throws_matching(
  $$select public.review_parcel_correction_request(
    'c2000000-0000-4000-8000-000000000001',
    'approved',
    'Duplicate review attempt'
  )$$,
  'REQUEST_ALREADY_REVIEWED',
  'Review on already approved request raises REQUEST_ALREADY_REVIEWED'
);

-- Assert all tables remain UNCHANGED after failed review attempts
select is(
  (select parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-04'),
  25,
  'parcel_logs parcels unchanged after aborted review transaction'
);

select is(
  (select status::text from public.parcel_correction_requests
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and status = 'pending'),
  'pending',
  'Correction request status remains pending after aborted review'
);

select is(
  (select count(*)::bigint from public.parcel_log_audit
   where action_type in ('correction_approved', 'correction_rejected')
     and rider_id = 'f2000000-0000-4000-8000-000000000001'
     and correction_request_id = (select id from public.parcel_correction_requests where rider_id = 'f2000000-0000-4000-8000-000000000001' and status = 'pending')),
  0::bigint,
  'Zero partial audit records created on failed review'
);

-- ============================================================================
-- TEST 13: FMS Observation Confirmation Test
-- ============================================================================

-- Setup attendance on 2026-10-05 for Rider Alpha
insert into public.attendance_logs (id, rider_id, hub_id, date, time_in, status, source) values
  ('a2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '2026-10-05', '2026-10-05 08:00:00+08', 'present', 'face-scan');

-- Mapping for Rider Alpha
insert into public.external_rider_mappings (rider_id, source_system, external_driver_id) values
  ('f2000000-0000-4000-8000-000000000001', 'spx_fms', 'DRV-FMS-001')
on conflict do nothing;

-- Stage FMS import batch and observation
insert into public.fms_import_batches (id, source_system, business_date, filename, file_sha256, hub_id, source_row_count, status, imported_by) values
  ('e1400000-0000-4000-8000-000000000099', 'spx_fms', '2026-10-05', 'FMS_Test_20261005.xlsx', 'sha_test_99999', 'd2000000-0000-4000-8000-000000000001', 1, 'staged', 'e2000000-0000-4000-8000-000000000002');

insert into public.fms_daily_rider_observations (id, batch_id, external_driver_id, external_driver_name, rider_id, assigned, delivered, failed_delivery, confirmation_status) values
  ('e1500000-0000-4000-8000-000000000099', 'e1400000-0000-4000-8000-000000000099', 'DRV-FMS-001', 'Rider Alpha', 'f2000000-0000-4000-8000-000000000001', 35, 30, 2, 'staged');

-- Confirm observation as Admin
select ok(
  (
    select (confirm_res->>'success')::boolean
    from (
      select public.confirm_fms_daily_rider_observation(
        'e1500000-0000-4000-8000-000000000099'::uuid,
        5,    -- heavy delivered
        2,    -- failed
        null, -- returned
        null,
        false
      ) as confirm_res
    ) q
  ),
  'confirm_fms_daily_rider_observation executes successfully'
);

-- Assert parcel_logs created with derived counts (30 total - 5 heavy = 25 standard)
select is(
  (select parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  25,
  'FMS confirmed parcel log created with standard delivered = 25'
);

select is(
  (select heavy_parcels from public.parcel_logs where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  5,
  'FMS confirmed parcel log created with heavy parcels = 5'
);

-- Assert EXACTLY ONE audit row exists for this parcel log
select is(
  (select count(*)::bigint from public.parcel_log_audit
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  1::bigint,
  'FMS confirmation creates exactly ONE audit row (no duplicates)'
);

select is(
  (select action_type::text from public.parcel_log_audit
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  'created',
  'FMS audit row has action_type = created'
);

select is(
  (select change_source from public.parcel_log_audit
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  'fms_import',
  'FMS audit row has change_source = fms_import'
);

select is(
  (select changed_by from public.parcel_log_audit
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  'e2000000-0000-4000-8000-000000000002'::uuid,
  'FMS audit row records confirming Admin as changed_by'
);

select ok(
  (select reason like '%DRV-FMS-001%' from public.parcel_log_audit
   where rider_id = 'f2000000-0000-4000-8000-000000000001' and date = '2026-10-05'),
  'FMS audit row reason contains driver ID'
);

select * from finish();
rollback;
