begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('hub_attendance_geofence_test'));
select no_plan();

create temporary table hub_geofence_tap_results (result text not null);
grant insert on hub_geofence_tap_results to authenticated;

insert into hub_geofence_tap_results select has_column('public', 'hubs', 'latitude', 'hubs table has latitude column');
insert into hub_geofence_tap_results select has_column('public', 'hubs', 'longitude', 'hubs table has longitude column');
insert into hub_geofence_tap_results select has_column('public', 'hubs', 'attendance_radius_m', 'hubs table has attendance_radius_m column');

-- 1. Legacy hub with all three NULL can exist (e.g. initial backfill or direct update of metadata)
insert into public.hubs (id, name, description, latitude, longitude, attendance_radius_m)
values ('fa000000-0000-4000-8000-000000000001', 'Legacy Test Hub', 'Legacy unconfigured hub', 6.9250000, 122.0780000, 100);

-- Update legacy hub to have nulls for geofence (simulating legacy data state)
update public.hubs
set latitude = null, longitude = null, attendance_radius_m = null
where id = 'fa000000-0000-4000-8000-000000000001';

insert into hub_geofence_tap_results select is(
  (select count(*)::int from public.hubs where id = 'fa000000-0000-4000-8000-000000000001' and latitude is null and longitude is null and attendance_radius_m is null),
  1,
  'legacy unconfigured hub with NULL geofence remains valid'
);

-- 2. New Hub without complete geofence is rejected by server trigger
insert into hub_geofence_tap_results select throws_ok(
  $$insert into public.hubs (id, name, description) values ('fa000000-0000-4000-8000-000000000002', 'Incomplete New Hub', 'No geofence')$$,
  '23514',
  null,
  'new hub without geofence is rejected on insert'
);

-- 3. New Hub with valid pin + radius succeeds
insert into public.hubs (id, name, description, latitude, longitude, attendance_radius_m)
values ('fa000000-0000-4000-8000-000000000003', 'Configured New Hub', 'Full geofence', 6.9214500, 122.0790100, 150);

insert into hub_geofence_tap_results select is(
  (select attendance_radius_m from public.hubs where id = 'fa000000-0000-4000-8000-000000000003'),
  150,
  'new hub with valid pin and radius is created successfully'
);

-- 4. Partial coordinate triad is rejected by check constraint
insert into hub_geofence_tap_results select throws_ok(
  $$update public.hubs set latitude = 6.9200000, longitude = null, attendance_radius_m = 100 where id = 'fa000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'partial coordinate triad (missing longitude) is rejected'
);

-- 5. Invalid latitude is rejected
insert into hub_geofence_tap_results select throws_ok(
  $$update public.hubs set latitude = 95.0000000, longitude = 122.0000000, attendance_radius_m = 100 where id = 'fa000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'invalid latitude > 90 is rejected'
);

-- 6. Invalid longitude is rejected
insert into hub_geofence_tap_results select throws_ok(
  $$update public.hubs set latitude = 6.9200000, longitude = 195.0000000, attendance_radius_m = 100 where id = 'fa000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'invalid longitude > 180 is rejected'
);

-- 7. Zero or negative radius is rejected
insert into hub_geofence_tap_results select throws_ok(
  $$update public.hubs set latitude = 6.9200000, longitude = 122.0000000, attendance_radius_m = 0 where id = 'fa000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'zero radius is rejected'
);

insert into hub_geofence_tap_results select throws_ok(
  $$update public.hubs set latitude = 6.9200000, longitude = 122.0000000, attendance_radius_m = -50 where id = 'fa000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'negative radius is rejected'
);

-- 8. Activity logs receive audit entry on hub creation and geofence updates
insert into hub_geofence_tap_results select is(
  (select count(*)::int from public.activity_logs where hub_id = 'fa000000-0000-4000-8000-000000000003' and event_type = 'hub_created'),
  1,
  'activity log records hub_created event'
);

update public.hubs
set latitude = 6.9300000, longitude = 122.0800000, attendance_radius_m = 200
where id = 'fa000000-0000-4000-8000-000000000003';

insert into hub_geofence_tap_results select is(
  (select count(*)::int from public.activity_logs where hub_id = 'fa000000-0000-4000-8000-000000000003' and event_type = 'hub_geofence_updated'),
  1,
  'activity log records hub_geofence_updated event'
);

select * from finish();
rollback;
