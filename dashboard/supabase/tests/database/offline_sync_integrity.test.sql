begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('offline_sync_integrity_test'));

select plan(10);

select results_eq(
  $$select count(*)::bigint from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'attendance_source' and e.enumlabel = 'system'$$,
  array[1::bigint],
  'system-generated attendance is supported by the database enum'
);

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000011', 'offline-sync-rider-one@example.test'),
  ('10000000-0000-4000-8000-000000000012', 'offline-sync-rider-two@example.test');

insert into public.riders (id, name, mkb_id, email) values
  ('20000000-0000-4000-8000-000000000011', 'Offline Sync Rider One', 'TEST-SYNC-001', 'offline-sync-rider-one@example.test'),
  ('20000000-0000-4000-8000-000000000012', 'Offline Sync Rider Two', 'TEST-SYNC-002', 'offline-sync-rider-two@example.test');

insert into public.users (id, full_name, email, role, rider_id) values
  ('10000000-0000-4000-8000-000000000011', 'Offline Sync Rider One', 'offline-sync-rider-one@example.test', 'rider', '20000000-0000-4000-8000-000000000011'),
  ('10000000-0000-4000-8000-000000000012', 'Offline Sync Rider Two', 'offline-sync-rider-two@example.test', 'rider', '20000000-0000-4000-8000-000000000012');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into public.attendance_logs (id, rider_id, date, time_in, status, source)
    values (
      '30000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000011',
      date '2026-08-05',
      timestamptz '2026-08-05 08:00:00+08',
      'present',
      'face-scan'
    )$$,
  'a rider can create their own attendance row'
);

select throws_ok(
  $$insert into public.attendance_logs (id, rider_id, date, time_in, status, source)
    values (
      '30000000-0000-4000-8000-000000000012',
      '20000000-0000-4000-8000-000000000011',
      date '2026-08-05',
      timestamptz '2026-08-05 08:01:00+08',
      'present',
      'face-scan'
    )$$,
  '23505',
  null,
  'duplicate rider/day attendance is rejected'
);

select throws_ok(
  $$insert into public.attendance_logs (id, rider_id, date, time_in, status, source)
    values (
      '30000000-0000-4000-8000-000000000013',
      '20000000-0000-4000-8000-000000000012',
      date '2026-08-05',
      timestamptz '2026-08-05 08:00:00+08',
      'present',
      'face-scan'
    )$$,
  '42501',
  null,
  'a rider cannot create attendance for another rider'
);

select throws_ok(
  $$insert into public.attendance_logs (id, rider_id, date, time_in, status, source)
    values (
      '30000000-0000-4000-8000-000000000014',
      '20000000-0000-4000-8000-000000000011',
      date '2026-08-06',
      timestamptz '2026-08-05 08:00:00+08',
      'present',
      'face-scan'
    )$$,
  '23514',
  null,
  'attendance date must match the original Manila event date'
);

select throws_ok(
  $$update public.attendance_logs
    set time_out = timestamptz '2026-08-05 07:59:00+08'
    where id = '30000000-0000-4000-8000-000000000011'$$,
  '23514',
  null,
  'Time Out cannot occur before Time In'
);

select lives_ok(
  $$insert into public.rider_locations (id, rider_id, lat, lng, status, recorded_at)
    values (
      '40000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000011',
      6.9214,
      122.0790,
      'active',
      timestamptz '2026-08-05 08:05:00+08'
    )$$,
  'a rider can create their own location row'
);

select throws_ok(
  $$insert into public.rider_locations (id, rider_id, lat, lng, status, recorded_at)
    values (
      '40000000-0000-4000-8000-000000000012',
      '20000000-0000-4000-8000-000000000012',
      6.9214,
      122.0790,
      'active',
      timestamptz '2026-08-05 08:05:00+08'
    )$$,
  '42501',
  null,
  'a rider cannot create a location for another rider'
);

select throws_ok(
  $$insert into public.rider_locations (id, rider_id, lat, lng, status, recorded_at)
    values (
      '40000000-0000-4000-8000-000000000013',
      '20000000-0000-4000-8000-000000000011',
      91,
      122.0790,
      'active',
      timestamptz '2026-08-05 08:06:00+08'
    )$$,
  '23514',
  null,
  'invalid latitude is rejected'
);

select results_eq(
  $$select count(*)::bigint from public.attendance_logs where rider_id = '20000000-0000-4000-8000-000000000012'$$,
  array[0::bigint],
  'cross-rider attendance remains invisible'
);

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
