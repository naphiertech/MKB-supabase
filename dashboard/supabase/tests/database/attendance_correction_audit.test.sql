begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('attendance_correction_audit_test'));

select plan(24);

-- Set deterministic test clock: 2026-10-04 09:00:00+08
select set_config('app.test_clock', '2026-10-04 09:00:00+08', true);

-- ============================================================================
-- FIXTURES SETUP
-- ============================================================================

-- Hubs
insert into public.hubs (id, name, active, latitude, longitude, attendance_radius_m) values
  ('d1000000-0000-4000-8000-000000000001', 'Central Hub', true, 14.5547000, 121.0244000, 500),
  ('d1000000-0000-4000-8000-000000000002', 'Remote Hub', true, 14.6500000, 121.0300000, 500);

-- Auth users
insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'rider1@example.test'),
  ('e1000000-0000-4000-8000-000000000002', 'admin@example.test'),
  ('e1000000-0000-4000-8000-000000000003', 'hr.central@example.test'),
  ('e1000000-0000-4000-8000-000000000004', 'rider.remote@example.test');

-- Riders
insert into public.riders (id, name, mkb_id, email, hub_id, status) values
  ('f1000000-0000-4000-8000-000000000001', 'Rider Central', 'RDR-CENTRAL-01', 'rider1@example.test', 'd1000000-0000-4000-8000-000000000001', 'active'),
  ('f1000000-0000-4000-8000-000000000002', 'Rider Remote', 'RDR-REMOTE-02', 'rider.remote@example.test', 'd1000000-0000-4000-8000-000000000002', 'active');

-- Staff & Users
insert into public.users (id, full_name, email, role, status, employment_status, rider_id, hub_access_scope) values
  ('e1000000-0000-4000-8000-000000000001', 'Rider Central', 'rider1@example.test', 'rider', 'active', 'active', 'f1000000-0000-4000-8000-000000000001', 'assigned'),
  ('e1000000-0000-4000-8000-000000000002', 'System Admin', 'admin@example.test', 'admin', 'active', 'active', null, 'global'),
  ('e1000000-0000-4000-8000-000000000003', 'HR Central', 'hr.central@example.test', 'hr', 'active', 'active', null, 'assigned'),
  ('e1000000-0000-4000-8000-000000000004', 'Rider Remote', 'rider.remote@example.test', 'rider', 'active', 'active', 'f1000000-0000-4000-8000-000000000002', 'assigned');

-- Link HR Central to Central Hub only
insert into public.user_hub_access (user_id, hub_id) values
  ('e1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001');

-- Base attendance log
insert into public.attendance_logs (id, rider_id, hub_id, date, time_in, status, source) values
  ('a1100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', '2026-10-04', '2026-10-04 08:00:00+08', 'present', 'face-scan');

-- ============================================================================
-- TEST 1: Table & Schema Presence
-- ============================================================================

select has_table('public', 'attendance_log_audit', 'attendance_log_audit table exists');
select has_column('public', 'attendance_log_audit', 'correction_type', 'attendance_log_audit has correction_type column');
select has_column('public', 'attendance_log_audit', 'change_source', 'attendance_log_audit has change_source column');

-- ============================================================================
-- TEST 2: Initial Insert Captured By Trigger
-- ============================================================================

select is(
  (select count(*)::bigint from public.attendance_log_audit where attendance_log_id = 'a1100000-0000-4000-8000-000000000001'),
  1::bigint,
  'Initial attendance_logs insert captured by audit trigger'
);

-- ============================================================================
-- TEST 3: Immutability of attendance_log_audit (UPDATE and DELETE prohibited)
-- ============================================================================

select throws_matching(
  $$update public.attendance_log_audit set reason = 'tampered' where attendance_log_id = 'a1100000-0000-4000-8000-000000000001'$$,
  'IMMUTABLE_RECORD',
  'Updating attendance_log_audit is blocked'
);

select throws_matching(
  $$delete from public.attendance_log_audit where attendance_log_id = 'a1100000-0000-4000-8000-000000000001'$$,
  'IMMUTABLE_RECORD',
  'Deleting from attendance_log_audit is blocked'
);

-- ============================================================================
-- TEST 4: Attendance Log Delete Protection
-- ============================================================================

select throws_matching(
  $$delete from public.attendance_logs where id = 'a1100000-0000-4000-8000-000000000001'$$,
  'DELETE_FORBIDDEN',
  'Deleting attendance_logs is blocked to preserve audit integrity'
);

-- Direct UPDATE on attendance_logs by authenticated Admin cannot alter rows (blocked by RLS)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.attendance_logs set notes = 'tampered directly' where id = 'a1100000-0000-4000-8000-000000000001';
select is(
  (select notes from public.attendance_logs where id = 'a1100000-0000-4000-8000-000000000001'),
  null,
  'Direct UPDATE on attendance_logs by authenticated Admin cannot alter rows'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================================
-- TEST 5: Unauthorized role cannot call correct_rider_attendance
-- ============================================================================

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'forgot_time_out',
    'Rider self correction attempt',
    null,
    '2026-10-04 17:00:00+08'::timestamptz
  )$$,
  'UNAUTHORIZED',
  'Rider role is blocked from calling correct_rider_attendance'
);

-- ============================================================================
-- TEST 6: HR scoped to Central Hub cannot correct Remote Rider
-- ============================================================================

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000002'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'forgot_time_out',
    'HR out-of-scope attempt',
    null,
    '2026-10-04 17:00:00+08'::timestamptz
  )$$,
  'FORBIDDEN_HUB_SCOPE',
  'HR cannot correct attendance for rider in unassigned Hub'
);

-- ============================================================================
-- TEST 7: Cannot manually set on_leave via attendance correction
-- ============================================================================

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'on_leave'::public.attendance_status,
    'authorized_correction',
    'Attempting on_leave shortcut'
  )$$,
  'INVALID_CORRECTION_STATUS',
  'Attendance correction cannot set status to on_leave'
);

-- ============================================================================
-- TEST 8: Missing Reason validation
-- ============================================================================

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'forgot_time_out',
    '   ',
    null,
    '2026-10-04 17:00:00+08'::timestamptz
  )$$,
  'MISSING_CORRECTION_REASON',
  'Attendance correction requires non-empty reason'
);

-- ============================================================================
-- TEST 9: forgot_time_out requires time_out
-- ============================================================================

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'forgot_time_out',
    'Missing time out parameter',
    null,
    null
  )$$,
  'MISSING_TIME_OUT',
  'forgot_time_out requires corrected Time Out'
);

-- ============================================================================
-- TEST 10: forgot_time_in requires time_in
-- ============================================================================

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'forgot_time_in',
    'Missing time in parameter',
    null,
    '2026-10-04 17:00:00+08'::timestamptz
  )$$,
  'MISSING_TIME_IN',
  'forgot_time_in requires corrected Time In'
);

-- ============================================================================
-- TEST 11: Absent status rejects timestamps
-- ============================================================================

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'absent'::public.attendance_status,
    'verified_attendance_error',
    'Should have been absent',
    '2026-10-04 08:00:00+08'::timestamptz,
    null
  )$$,
  'INVALID_ATTENDANCE_TIMESTAMPS',
  'Absent records cannot have timestamps'
);

-- ============================================================================
-- TEST 12: Timestamp sequence: Time Out cannot precede Time In
-- ============================================================================

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'app_device_issue',
    'Device glitch inverted clocks',
    '2026-10-04 17:00:00+08'::timestamptz,
    '2026-10-04 08:00:00+08'::timestamptz
  )$$,
  'INVALID_TIMESTAMP_ORDER',
  'Time Out cannot be earlier than Time In'
);

-- ============================================================================
-- TEST 13: Protection of approved/paid payroll history
-- ============================================================================

-- Seed an approved payroll record covering 2026-09-15
insert into public.payroll_records (
  id, rider_id, hub_id, cutoff_start, cutoff_end, status, gross_pay, deductions
) values (
  'b2200000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  '2026-09-07',
  '2026-09-13',
  'approved',
  10000,
  0
);

select throws_matching(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-09-10'::date,
    'present'::public.attendance_status,
    'forgot_time_out',
    'Historical payroll adjustment attempt',
    '2026-09-10 08:00:00+08'::timestamptz,
    '2026-09-10 17:00:00+08'::timestamptz
  )$$,
  'PAYROLL_COMMITTED',
  'Attendance correction blocked when cutoff payroll is approved/paid'
);

-- ============================================================================
-- TEST 14: Valid Attendance Correction Execution
-- ============================================================================

select lives_ok(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'present'::public.attendance_status,
    'forgot_time_out',
    'Rider forgot to clock out before leaving hub',
    null,
    '2026-10-04 17:30:00+08'::timestamptz,
    'TICKET-12345'
  )$$,
  'Admin successfully applies attendance correction'
);

-- Verify attendance_logs row state
select is(
  (select source::text from public.attendance_logs where id = 'a1100000-0000-4000-8000-000000000001'),
  'manual',
  'Corrected attendance_logs source updated to manual'
);

select is(
  (select time_out from public.attendance_logs where id = 'a1100000-0000-4000-8000-000000000001'),
  '2026-10-04 17:30:00+08'::timestamptz,
  'Corrected attendance_logs time_out updated'
);

-- Verify audit record created with correction context
select is(
  (select count(*)::bigint from public.attendance_log_audit
   where attendance_log_id = 'a1100000-0000-4000-8000-000000000001'
     and action = 'CORRECTION'
     and change_source = 'attendance_correction'
     and correction_type = 'forgot_time_out'
     and actor_id = 'e1000000-0000-4000-8000-000000000002'
     and evidence_reference = 'TICKET-12345'),
  1::bigint,
  'Audit record created with action=CORRECTION, change_source=attendance_correction, actor and evidence'
);

-- ============================================================================
-- TEST 15: get_attendance_log_audit_history Query RPC
-- ============================================================================

select is(
  (select count(*)::bigint from public.get_attendance_log_audit_history('a1100000-0000-4000-8000-000000000001'::uuid)),
  2::bigint,
  'get_attendance_log_audit_history returns initial insert + correction records'
);

select is(
  (select correction_type from public.get_attendance_log_audit_history('a1100000-0000-4000-8000-000000000001'::uuid) limit 1),
  'forgot_time_out',
  'Latest audit history entry reflects correction_type'
);

-- ============================================================================
-- TEST 16: HR can also correct attendance within assigned hub
-- ============================================================================

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select lives_ok(
  $$select public.correct_rider_attendance(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    '2026-10-04'::date,
    'late'::public.attendance_status,
    'authorized_correction',
    'HR adjusted status to late after manual review',
    '2026-10-04 08:30:00+08'::timestamptz,
    '2026-10-04 17:30:00+08'::timestamptz,
    'HR-REF-999'
  )$$,
  'HR can correct attendance within assigned Central Hub'
);

select finish();
rollback;
