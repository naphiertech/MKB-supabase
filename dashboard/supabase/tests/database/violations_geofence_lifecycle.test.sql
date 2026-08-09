begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('violations_geofence_lifecycle_test'));

select plan(27);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'violations'),
  4,
  'violations has one explicit policy for each supported access path'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'violations' and roles = array['authenticated']::name[]),
  4,
  'all violations policies target authenticated users explicitly'
);
select is(has_table_privilege('anon', 'public.violations', 'select'), false, 'anon has no violations table access');

insert into public.zones (
  id, name, zone_type, lat, lng, radius, polygon_coordinates, status
) values
  (
    '91000000-0000-4000-8000-000000000001', 'Geofence Circle Test', 'circle',
    6.9214, 122.0790, 500, null, 'active'
  ),
  (
    '91000000-0000-4000-8000-000000000002', 'Geofence Polygon Test', 'polygon',
    null, null, null,
    '[[6.9200,122.0780],[6.9230,122.0780],[6.9230,122.0810],[6.9200,122.0810]]'::jsonb,
    'active'
  );

insert into public.riders (id, name, mkb_id, email, zone_id, status) values
  ('92000000-0000-4000-8000-000000000001', 'Circle Rider', 'TEST-GEO-001', 'geo-circle@example.test', '91000000-0000-4000-8000-000000000001', 'idle'),
  ('92000000-0000-4000-8000-000000000002', 'Polygon Rider', 'TEST-GEO-002', 'geo-polygon@example.test', '91000000-0000-4000-8000-000000000002', 'idle'),
  ('92000000-0000-4000-8000-000000000003', 'No Zone Rider', 'TEST-GEO-003', 'geo-no-zone@example.test', null, 'idle'),
  ('92000000-0000-4000-8000-000000000004', 'No Attendance Rider', 'TEST-GEO-004', 'geo-no-attendance@example.test', '91000000-0000-4000-8000-000000000001', 'offline'),
  ('92000000-0000-4000-8000-000000000005', 'Replay Rider', 'TEST-GEO-005', 'geo-replay@example.test', '91000000-0000-4000-8000-000000000001', 'idle'),
  ('92000000-0000-4000-8000-000000000006', 'Overnight Rider', 'TEST-GEO-006', 'geo-overnight@example.test', '91000000-0000-4000-8000-000000000001', 'idle'),
  ('92000000-0000-4000-8000-000000000007', 'Stale Rider', 'TEST-GEO-007', 'geo-stale@example.test', '91000000-0000-4000-8000-000000000001', 'active');

insert into public.attendance_logs (id, rider_id, date, time_in, status, source) values
  ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', (now() at time zone 'Asia/Manila')::date, now() - interval '30 minutes', 'present', 'system'),
  ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', (now() at time zone 'Asia/Manila')::date, now() - interval '30 minutes', 'present', 'system'),
  ('93000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000003', (now() at time zone 'Asia/Manila')::date, now() - interval '30 minutes', 'present', 'system'),
  ('93000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000005', (now() at time zone 'Asia/Manila')::date, now() - interval '30 minutes', 'present', 'system'),
  ('93000000-0000-4000-8000-000000000007', '92000000-0000-4000-8000-000000000007', (now() at time zone 'Asia/Manila')::date, now() - interval '30 minutes', 'present', 'system');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 6.9214, 122.0790, clock_timestamp());

select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000001'), 'active', 'inside circle makes an on-duty rider active');
select is((select count(*)::integer from public.violations where rider_id = '92000000-0000-4000-8000-000000000001'), 0, 'inside circle creates no violation');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 6.9400, 122.1000, clock_timestamp() + interval '1 second');

select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000001'), 'violation', 'outside circle makes an on-duty rider violation');
select is((select count(*)::integer from public.violations where rider_id = '92000000-0000-4000-8000-000000000001' and type = 'boundary_exit' and not resolved), 1, 'outside circle creates one open boundary exit');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000001', 6.9410, 122.1010, clock_timestamp() + interval '2 seconds');

select is((select count(*)::integer from public.violations where rider_id = '92000000-0000-4000-8000-000000000001' and type = 'boundary_exit' and not resolved), 1, 'repeated outside pings do not duplicate the open incident');

insert into public.violations (id, rider_id, zone_id, zone_name, type, lat, lng) values
  ('95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Geofence Circle Test', 'manual_flag', 6.9400, 122.1000),
  ('95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Geofence Circle Test', 'idle_timeout', 6.9400, 122.1000);

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000004', '92000000-0000-4000-8000-000000000001', 6.9214, 122.0790, clock_timestamp() + interval '3 seconds');

select ok((select resolved from public.violations where rider_id = '92000000-0000-4000-8000-000000000001' and type = 'boundary_exit'), 're-entry resolves the boundary exit');
select ok((select resolved_at is not null from public.violations where rider_id = '92000000-0000-4000-8000-000000000001' and type = 'boundary_exit'), 're-entry populates resolved_at');
select is((select resolved from public.violations where id = '95000000-0000-4000-8000-000000000001'), false, 're-entry does not resolve manual flags');
select is((select resolved from public.violations where id = '95000000-0000-4000-8000-000000000002'), false, 're-entry does not resolve idle timeouts');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000005', '92000000-0000-4000-8000-000000000002', 6.9215, 122.0795, clock_timestamp());
select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000002'), 'active', 'polygon containment is evaluated by PostgreSQL');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000006', '92000000-0000-4000-8000-000000000003', 6.9400, 122.1000, clock_timestamp());
select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000003'), 'active', 'an on-duty rider without an assigned zone remains active');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000007', '92000000-0000-4000-8000-000000000004', 6.9400, 122.1000, clock_timestamp());
select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000004'), 'offline', 'a rider without active attendance remains offline');

insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000008', '92000000-0000-4000-8000-000000000005', 6.9400, 122.1000, clock_timestamp());
insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values ('94000000-0000-4000-8000-000000000009', '92000000-0000-4000-8000-000000000005', 6.9214, 122.0790, clock_timestamp() - interval '1 hour');

select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000005'), 'violation', 'older replay does not regress newer rider status');
select is((select lat from public.riders where id = '92000000-0000-4000-8000-000000000005'), 6.9400::double precision, 'older replay does not overwrite newer rider coordinates');
select is((select count(*)::integer from public.violations where rider_id = '92000000-0000-4000-8000-000000000005' and type = 'boundary_exit' and not resolved), 1, 'older replay does not resolve the current boundary exit');

insert into public.attendance_logs (id, rider_id, date, time_in, status, source)
values (
  '93000000-0000-4000-8000-000000000006',
  '92000000-0000-4000-8000-000000000006',
  ((now() at time zone 'Asia/Manila')::date - 1),
  (((now() at time zone 'Asia/Manila')::date - 1)::timestamp + time '23:50') at time zone 'Asia/Manila',
  'present',
  'system'
);
insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
values (
  '94000000-0000-4000-8000-000000000010',
  '92000000-0000-4000-8000-000000000006',
  6.9400,
  122.1000,
  ((now() at time zone 'Asia/Manila')::date::timestamp + time '00:05') at time zone 'Asia/Manila'
);
select is((select status::text from public.rider_locations where id = '94000000-0000-4000-8000-000000000010'), 'violation', 'cross-midnight replay uses event-time attendance');
select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000006'), 'idle', 'historical cross-midnight replay does not become current state');

select throws_ok(
  $$insert into public.rider_locations (id, rider_id, lat, lng, recorded_at)
    values ('94000000-0000-4000-8000-000000000008', '92000000-0000-4000-8000-000000000005', 6.9400, 122.1000, clock_timestamp())$$,
  '23505', null, 'duplicate location operation IDs remain idempotent'
);

update public.riders
set zone_id = '91000000-0000-4000-8000-000000000002'
where id = '92000000-0000-4000-8000-000000000005';
select ok((select resolved from public.violations where rider_id = '92000000-0000-4000-8000-000000000005' and type = 'boundary_exit'), 'zone reassignment resolves the old-zone boundary exit');
select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000005'), 'idle', 'zone reassignment awaits a fresh authoritative ping');

update public.riders
set status = 'active', last_ping = now() - interval '10 minutes'
where id = '92000000-0000-4000-8000-000000000007';
select lives_ok($$select public.refresh_stale_rider_statuses(interval '2 minutes')$$, 'stale-location refresh executes');
select is((select status::text from public.riders where id = '92000000-0000-4000-8000-000000000007'), 'idle', 'stale on-duty GPS transitions to idle');

select is((select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'riders'), 1, 'authoritative rider status changes are published to Realtime');
select is((select count(*)::integer from public.notifications where violation_id = (select id from public.violations where rider_id = '92000000-0000-4000-8000-000000000001' and type = 'boundary_exit')), 1, 'one automatic notification is linked to the boundary incident');

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;

rollback;
