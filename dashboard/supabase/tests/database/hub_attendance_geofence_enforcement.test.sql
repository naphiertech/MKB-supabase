begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('hub_attendance_geofence_enforcement_test'));

select plan(30);

-- Setup test hubs
-- Hub 1: Configured (Ayala Hub, Manila center: 14.5547, 121.0244, radius 300m)
-- Hub 2: Intended to simulate legacy unconfigured hub (seeded valid, then updated to NULLs)
-- Hub 3: Other Hub (Quezon City Hub: 14.6500, 121.0300, radius 500m)
insert into public.hubs (id, name, active, latitude, longitude, attendance_radius_m) values
  ('a5000000-0000-4000-8000-000000000001', 'Ayala Central Hub', true, 14.5547000, 121.0244000, 300),
  ('a5000000-0000-4000-8000-000000000002', 'Unconfigured Hub', true, 6.9214000, 122.0790000, 300),
  ('a5000000-0000-4000-8000-000000000003', 'Quezon City Hub', true, 14.6500000, 121.0300000, 500);

-- Safely simulate legacy unconfigured hub (triad updated to all NULL, respecting hubs_geofence_triad_check)
update public.hubs
set latitude = null, longitude = null, attendance_radius_m = null
where id = 'a5000000-0000-4000-8000-000000000002';

-- Setup auth users & riders
-- Rider 1: Assigned to Ayala Central Hub
-- Rider 2: Assigned to Unconfigured Hub
-- Rider 3: No Hub Assigned
-- Staff: HR user
insert into auth.users (id, email) values
  ('u5000000-0000-4000-8000-000000000001', 'rider.ayala@example.test'),
  ('u5000000-0000-4000-8000-000000000002', 'rider.unconfigured@example.test'),
  ('u5000000-0000-4000-8000-000000000003', 'rider.nohub@example.test'),
  ('u5000000-0000-4000-8000-000000000004', 'hr.staff@example.test');

insert into public.riders (id, name, mkb_id, email, hub_id, status) values
  ('r5000000-0000-4000-8000-000000000001', 'Ayala Rider', 'TEST-AYALA-01', 'rider.ayala@example.test', 'a5000000-0000-4000-8000-000000000001', 'active'),
  ('r5000000-0000-4000-8000-000000000002', 'Unconfigured Rider', 'TEST-UNCFG-02', 'rider.unconfigured@example.test', 'a5000000-0000-4000-8000-000000000002', 'active'),
  ('r5000000-0000-4000-8000-000000000003', 'NoHub Rider', 'TEST-NOHUB-03', 'rider.nohub@example.test', null, 'active');

insert into public.users (id, full_name, email, role, status, employment_status, rider_id) values
  ('u5000000-0000-4000-8000-000000000001', 'Ayala Rider', 'rider.ayala@example.test', 'rider', 'active', 'active', 'r5000000-0000-4000-8000-000000000001'),
  ('u5000000-0000-4000-8000-000000000002', 'Unconfigured Rider', 'rider.unconfigured@example.test', 'rider', 'active', 'active', 'r5000000-0000-4000-8000-000000000002'),
  ('u5000000-0000-4000-8000-000000000003', 'NoHub Rider', 'rider.nohub@example.test', 'rider', 'active', 'active', 'r5000000-0000-4000-8000-000000000003'),
  ('u5000000-0000-4000-8000-000000000004', 'HR Staff', 'hr.staff@example.test', 'hr', 'active', 'active', null);

-- ============================================================================
-- TEST 1: FRONTEND PRE-CHECK RPC (get_my_hub_attendance_geofence)
-- ============================================================================

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select (public.get_my_hub_attendance_geofence() ->> 'is_configured')::boolean),
  true,
  'Rider 1 pre-check returns is_configured = true'
);

select is(
  (select (public.get_my_hub_attendance_geofence() ->> 'attendance_radius_m')::integer),
  300,
  'Rider 1 pre-check returns correct attendance_radius_m = 300'
);

-- Rider 2 (Unconfigured Hub)
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select public.get_my_hub_attendance_geofence() ->> 'reason'),
  'HUB_GEOFENCE_NOT_CONFIGURED',
  'Rider 2 pre-check returns reason = HUB_GEOFENCE_NOT_CONFIGURED'
);

-- Rider 3 (No Hub Assigned)
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select public.get_my_hub_attendance_geofence() ->> 'reason'),
  'NO_ASSIGNED_HUB',
  'Rider 3 pre-check returns reason = NO_ASSIGNED_HUB'
);

-- ============================================================================
-- TEST 2: GPS VALIDATION GUARDS (MISSING, STALE, FUTURE, OUT OF BOUNDS)
-- ============================================================================

-- Back to Rider 1 (Ayala)
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- Invalid latitude (> 90)
select throws_ok(
  $$select public.record_my_time_in(95.0, 121.0244, 10.0, clock_timestamp())$$,
  '23514',
  null,
  'Latitude > 90 is rejected'
);

-- Invalid longitude (< -180)
select throws_ok(
  $$select public.record_my_time_in(14.5547, -185.0, 10.0, clock_timestamp())$$,
  '23514',
  null,
  'Longitude < -180 is rejected'
);

-- Stale GPS (> 120 seconds old)
select throws_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 10.0, clock_timestamp() - interval '125 seconds')$$,
  '23514',
  null,
  'GPS timestamp older than 120 seconds is rejected'
);

-- Future GPS (> 5 seconds in future)
select throws_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 10.0, clock_timestamp() + interval '30 seconds')$$,
  '23514',
  null,
  'Future GPS timestamp is rejected'
);

-- ============================================================================
-- TEST 3: GEOFENCE RADIUS ENFORCEMENT — OUTSIDE HUB (TIME IN REJECTED)
-- ============================================================================

-- Manila coordinate far outside Ayala Hub (e.g. Quezon City: ~11km away)
select throws_ok(
  $$select public.record_my_time_in(14.6500, 121.0300, 5.0, clock_timestamp())$$,
  '23514',
  null,
  'Time In outside Hub attendance radius is rejected'
);

-- ============================================================================
-- TEST 4: MISSING HUB / UNCONFIGURED HUB ENFORCEMENT
-- ============================================================================

-- Rider 3 (No assigned Hub) attempts Time In inside Manila
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 5.0, clock_timestamp())$$,
  '23514',
  null,
  'Rider with no assigned Hub is rejected (NO_ASSIGNED_HUB)'
);

-- Rider 2 (Unconfigured Hub) attempts Time In
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 5.0, clock_timestamp())$$,
  '23514',
  null,
  'Rider with unconfigured Hub is rejected (HUB_GEOFENCE_NOT_CONFIGURED)'
);

-- ============================================================================
-- TEST 5: TIME IN INSIDE HUB & EVIDENCE GENERATION
-- ============================================================================

-- Rider 1 inside Ayala Hub (at exact coordinates, distance = 0m <= 300m)
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 5.0, clock_timestamp())$$,
  'Rider inside Hub attendance geofence successfully times in'
);

-- Verify attendance_logs row was created with face-scan source and correct hub_id
select is(
  (select count(*)::bigint from public.attendance_logs where rider_id = 'r5000000-0000-4000-8000-000000000001' and status = 'present' and source = 'face-scan'),
  1::bigint,
  'attendance_logs row was created with status=present and source=face-scan'
);

-- Verify immutable attendance_geofence_events evidence row
select is(
  (select count(*)::bigint from public.attendance_geofence_events where rider_id = 'r5000000-0000-4000-8000-000000000001' and event_type = 'time_in'),
  1::bigint,
  'attendance_geofence_events records time_in evidence'
);

select is(
  (select attendance_radius_m from public.attendance_geofence_events where rider_id = 'r5000000-0000-4000-8000-000000000001' and event_type = 'time_in'),
  300,
  'evidence captures exact attendance radius (300m)'
);

-- Duplicate Time In rejected
select throws_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 5.0, clock_timestamp())$$,
  '23505',
  null,
  'Duplicate Time In for today is rejected'
);

-- ============================================================================
-- TEST 6: TIME OUT REQUIRES FRESH GPS & HUB GEOFENCE
-- ============================================================================

-- Time Out with stale GPS rejected
select throws_ok(
  $$select public.record_my_time_out(14.5547, 121.0244, 5.0, clock_timestamp() - interval '130 seconds')$$,
  '23514',
  null,
  'Time Out with stale GPS is rejected'
);

-- Time Out outside Hub rejected
select throws_ok(
  $$select public.record_my_time_out(14.6500, 121.0300, 5.0, clock_timestamp())$$,
  '23514',
  null,
  'Time Out outside Hub attendance radius is rejected'
);

-- Time Out inside Hub succeeds
select lives_ok(
  $$select public.record_my_time_out(14.5547, 121.0244, 5.0, clock_timestamp())$$,
  'Time Out inside Hub attendance radius succeeds'
);

-- Verify attendance_logs time_out is now set
select is(
  (select (time_out is not null) from public.attendance_logs where rider_id = 'r5000000-0000-4000-8000-000000000001'),
  true,
  'attendance_logs time_out is populated'
);

-- Verify time_out evidence in attendance_geofence_events
select is(
  (select count(*)::bigint from public.attendance_geofence_events where rider_id = 'r5000000-0000-4000-8000-000000000001' and event_type = 'time_out'),
  1::bigint,
  'attendance_geofence_events records time_out evidence'
);

-- ============================================================================
-- TEST 7: BYPASS PROTECTION (DIRECT TABLE INSERT / UPDATE BLOCKED)
-- ============================================================================

-- Direct table INSERT on attendance_logs by Rider is rejected by RLS
select throws_ok(
  $$insert into public.attendance_logs (rider_id, hub_id, date, time_in, status, source)
    values ('r5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', (clock_timestamp() at time zone 'Asia/Manila')::date + 1, clock_timestamp(), 'present', 'face-scan')$$,
  '42501',
  null,
  'Rider direct attendance_logs INSERT is blocked by RLS'
);

-- Direct table UPDATE on attendance_logs by Rider is rejected by RLS
select throws_ok(
  $$update public.attendance_logs set status = 'late' where rider_id = 'r5000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'Rider direct attendance_logs UPDATE is blocked by RLS'
);

-- ============================================================================
-- TEST 8: EVIDENCE IMMUTABILITY
-- ============================================================================

-- Attempt to update evidence table is blocked
select throws_ok(
  $$update public.attendance_geofence_events set distance_meters = 0 where rider_id = 'r5000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'attendance_geofence_events rows cannot be updated'
);

-- Attempt to delete evidence table is blocked
select throws_ok(
  $$delete from public.attendance_geofence_events where rider_id = 'r5000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'attendance_geofence_events rows cannot be deleted'
);

-- ============================================================================
-- TEST 9: EVIDENCE SNAPSHOT PRESERVATION ON HUB MODIFICATION
-- ============================================================================

reset role;
select set_config('request.jwt.claims', '', true);

-- Admin modifies Hub radius from 300m to 1000m
update public.hubs
set attendance_radius_m = 1000
where id = 'a5000000-0000-4000-8000-000000000001';

-- Historical evidence snapshot STILL retains original radius 300m
select is(
  (select attendance_radius_m from public.attendance_geofence_events where rider_id = 'r5000000-0000-4000-8000-000000000001' and event_type = 'time_in'),
  300,
  'Hub radius alteration does NOT rewrite historical attendance geofence evidence'
);

-- ============================================================================
-- TEST 10: STAFF WORKFLOW PRESERVATION
-- ============================================================================

-- HR user can directly insert attendance (e.g. manual DTR correction)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"u5000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.attendance_logs (id, rider_id, hub_id, date, time_in, time_out, status, source)
    values (
      '35000000-0000-4000-8000-000000000002',
      'r5000000-0000-4000-8000-000000000002',
      'a5000000-0000-4000-8000-000000000002',
      (clock_timestamp() at time zone 'Asia/Manila')::date - 1,
      clock_timestamp() - interval '1 day',
      clock_timestamp() - interval '16 hours',
      'present',
      'manual'
    )$$,
  'HR staff can directly insert attendance corrections'
);

-- HR staff can select all attendance_geofence_events
select is(
  (select count(*)::bigint from public.attendance_geofence_events),
  2::bigint,
  'HR staff can read all attendance_geofence_events'
);

-- ============================================================================
-- TEST 11: ANONYMOUS ACCESS REJECTION
-- ============================================================================

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

select throws_ok(
  $$select public.record_my_time_in(14.5547, 121.0244, 5.0, clock_timestamp())$$,
  '42501',
  null,
  'Anonymous callers are denied record_my_time_in'
);

select throws_ok(
  $$select * from public.attendance_geofence_events$$,
  '42501',
  null,
  'Anonymous callers are denied reading attendance_geofence_events'
);

select string_agg(result, E'\n') as test_suite
from finish() as result;
rollback;
