-- Stabilize the persisted geofence lifecycle without changing rider location history.
-- PostgreSQL remains authoritative; browser geofencing is provisional UI only.

drop trigger if exists tr_rider_status_violation on public.riders;
drop function if exists public.handle_rider_status_violation();

create or replace function public.handle_auto_notify_on_violation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_name text;
  incident_label text;
begin
  select r.name
  into rider_name
  from public.riders r
  where r.id = new.rider_id;

  incident_label := case new.type
    when 'boundary_exit' then 'Geofence Exit Breach'
    when 'idle_timeout' then 'Rider Location Timeout'
    when 'manual_flag' then 'Rider Manually Flagged'
  end;

  insert into public.notifications (
    type,
    category,
    priority,
    title,
    message,
    rider_id,
    violation_id,
    read,
    target_roles,
    action_link,
    metadata,
    created_at
  )
  select
    'violation'::public.notification_type,
    'geofence'::public.notification_category,
    case when new.type = 'boundary_exit'
      then 'high'::public.notification_priority
      else 'medium'::public.notification_priority
    end,
    incident_label,
    case new.type
      when 'boundary_exit' then 'Rider ' || coalesce(rider_name, 'Unknown Rider') ||
        ' left ' || coalesce(new.zone_name, 'the assigned zone') || '.'
      when 'idle_timeout' then 'Rider ' || coalesce(rider_name, 'Unknown Rider') ||
        ' stopped sending fresh location data.'
      when 'manual_flag' then 'Rider ' || coalesce(rider_name, 'Unknown Rider') ||
        ' has a manual violation incident.'
    end,
    new.rider_id,
    new.id,
    false,
    array['admin'::public.user_role, 'hr'::public.user_role],
    '#live',
    jsonb_build_object(
      'source', 'violation_auto_notification',
      'manual_flag', false,
      'violation_type', new.type
    ),
    new.created_at
  where not exists (
    select 1
    from public.notifications n
    where n.violation_id = new.id
  );

  return new;
end;
$$;

revoke all on function public.handle_auto_notify_on_violation() from public, anon, authenticated;

drop trigger if exists trg_auto_notify_on_violation on public.violations;
create trigger trg_auto_notify_on_violation
  after insert on public.violations
  for each row
  execute function public.handle_auto_notify_on_violation();

create or replace function public.process_rider_location_geofence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_status_before public.rider_status;
  rider_zone_id uuid;
  rider_name text;
  rider_last_ping timestamptz;
  event_business_date date;
  active_log_id uuid;
  zone_name text;
  zone_status public.zone_status;
  zone_type text;
  zone_lat double precision;
  zone_lng double precision;
  zone_radius integer;
  polygon_coordinates jsonb;
  is_inside boolean := true;
  calculated_status public.rider_status;
  is_historical boolean;
  inserted_violation_id uuid;
  resolved_count integer := 0;
begin
  select r.status, r.zone_id, r.name, r.last_ping
  into rider_status_before, rider_zone_id, rider_name, rider_last_ping
  from public.riders r
  where r.id = new.rider_id
  for update;

  event_business_date := (new.recorded_at at time zone 'Asia/Manila')::date;

  select a.id
  into active_log_id
  from public.attendance_logs a
  where a.rider_id = new.rider_id
    and a.date in (event_business_date, event_business_date - 1)
    and a.time_in is not null
    and a.time_in <= new.recorded_at
    and (a.time_out is null or a.time_out >= new.recorded_at)
  order by a.time_in desc
  limit 1;

  if active_log_id is null then
    calculated_status := 'offline';
  elsif rider_zone_id is null then
    calculated_status := 'active';
  else
    select z.name, z.status, z.zone_type, z.lat, z.lng, z.radius, z.polygon_coordinates
    into zone_name, zone_status, zone_type, zone_lat, zone_lng, zone_radius, polygon_coordinates
    from public.zones z
    where z.id = rider_zone_id;

    if zone_status is distinct from 'active' then
      calculated_status := 'active';
    elsif zone_type = 'polygon' and polygon_coordinates is not null then
      is_inside := public.is_point_in_polygon(new.lat, new.lng, polygon_coordinates);
      calculated_status := case when is_inside then 'active' else 'violation' end;
    elsif zone_lat is null or zone_lng is null or zone_radius is null then
      calculated_status := 'active';
    else
      is_inside := public.calculate_distance(new.lat, new.lng, zone_lat, zone_lng) <= zone_radius;
      calculated_status := case when is_inside then 'active' else 'violation' end;
    end if;
  end if;

  new.status := calculated_status;

  is_historical :=
    (rider_last_ping is not null and new.recorded_at <= rider_last_ping)
    or new.recorded_at < clock_timestamp() - interval '2 minutes';

  if is_historical then
    return new;
  end if;

  update public.riders
  set status = calculated_status,
      lat = new.lat,
      lng = new.lng,
      speed = new.speed,
      last_ping = new.recorded_at
  where id = new.rider_id;

  if calculated_status = 'violation' then
    if not exists (
      select 1
      from public.violations v
      where v.rider_id = new.rider_id
        and v.zone_id = rider_zone_id
        and v.type = 'boundary_exit'
        and not v.resolved
    ) then
      insert into public.violations (
        rider_id, zone_id, zone_name, lat, lng, type, read, resolved, created_at
      ) values (
        new.rider_id, rider_zone_id, zone_name, new.lat, new.lng,
        'boundary_exit', false, false, new.recorded_at
      )
      returning id into inserted_violation_id;

      insert into public.activity_logs (
        user_id, rider_id, event_type, description, metadata, created_at
      ) values (
        null,
        new.rider_id,
        'geofence_exit',
        'Rider exited zone ' || coalesce(zone_name, 'Unknown Zone') || '.',
        jsonb_build_object(
          'lat', new.lat,
          'lng', new.lng,
          'zone_id', rider_zone_id,
          'zone_name', zone_name,
          'violation_id', inserted_violation_id,
          'recorded_at', new.recorded_at
        ),
        new.recorded_at
      );
    end if;
  elsif calculated_status = 'active' and rider_zone_id is not null then
    update public.violations
    set resolved = true,
        resolved_at = new.recorded_at
    where rider_id = new.rider_id
      and zone_id = rider_zone_id
      and type = 'boundary_exit'
      and not resolved;

    get diagnostics resolved_count = row_count;

    if resolved_count > 0 then
      insert into public.activity_logs (
        user_id, rider_id, event_type, description, metadata, created_at
      ) values (
        null,
        new.rider_id,
        'geofence_enter',
        'Rider returned to zone ' || coalesce(zone_name, 'Unknown Zone') || '.',
        jsonb_build_object(
          'lat', new.lat,
          'lng', new.lng,
          'zone_id', rider_zone_id,
          'zone_name', zone_name,
          'recorded_at', new.recorded_at
        ),
        new.recorded_at
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.process_rider_location_geofence() from public, anon, authenticated;

drop trigger if exists trg_process_rider_location_geofence on public.rider_locations;
create trigger trg_process_rider_location_geofence
  before insert on public.rider_locations
  for each row
  execute function public.process_rider_location_geofence();

create or replace function public.prepare_rider_zone_reassignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.zone_id is distinct from new.zone_id then
    update public.violations
    set resolved = true,
        resolved_at = clock_timestamp()
    where rider_id = old.id
      and zone_id is not distinct from old.zone_id
      and type = 'boundary_exit'
      and not resolved;

    if new.status in ('active', 'violation') then
      new.status := 'idle';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_rider_zone_reassignment() from public, anon, authenticated;

drop trigger if exists trg_prepare_rider_zone_reassignment on public.riders;
create trigger trg_prepare_rider_zone_reassignment
  before update of zone_id on public.riders
  for each row
  when (old.zone_id is distinct from new.zone_id)
  execute function public.prepare_rider_zone_reassignment();

create or replace function public.refresh_stale_rider_statuses(
  stale_after interval default interval '2 minutes'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
  business_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if stale_after <= interval '0 seconds' then
    raise exception 'stale_after must be greater than zero';
  end if;

  update public.riders r
  set status = 'idle'
  where r.status in ('active', 'violation')
    and (r.last_ping is null or r.last_ping < clock_timestamp() - stale_after)
    and exists (
      select 1
      from public.attendance_logs a
      where a.rider_id = r.id
        and a.date in (business_date, business_date - 1)
        and a.time_in is not null
        and a.time_in <= clock_timestamp()
        and a.time_out is null
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.refresh_stale_rider_statuses(interval) from public, anon, authenticated;
grant execute on function public.refresh_stale_rider_statuses(interval) to postgres;

alter table public.violations enable row level security;

drop policy if exists "Admin and HR can view violations" on public.violations;
drop policy if exists "Admin and HR can update violations" on public.violations;
drop policy if exists "Riders can view own violations" on public.violations;
drop policy if exists "System can insert violations" on public.violations;
drop policy if exists violations_admin_hr_select on public.violations;
drop policy if exists violations_admin_hr_insert on public.violations;
drop policy if exists violations_admin_hr_update on public.violations;
drop policy if exists violations_rider_select_own on public.violations;

create policy violations_admin_hr_select
on public.violations
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.role in ('admin', 'hr')
  )
);

create policy violations_admin_hr_insert
on public.violations
for insert
to authenticated
with check (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.role in ('admin', 'hr')
  )
);

create policy violations_admin_hr_update
on public.violations
for update
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.role in ('admin', 'hr')
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.role in ('admin', 'hr')
  )
);

create policy violations_rider_select_own
on public.violations
for select
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.role = 'rider'
      and u.rider_id = violations.rider_id
  )
);

revoke all on table public.violations from anon;
revoke all on table public.violations from authenticated;
grant select, insert, update on table public.violations to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'riders'
  ) then
    alter publication supabase_realtime add table public.riders;
  end if;
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'refresh-stale-rider-statuses';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'refresh-stale-rider-statuses',
    '* * * * *',
    'select public.refresh_stale_rider_statuses(interval ''2 minutes'');'
  );
end;
$$;
