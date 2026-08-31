-- Hub Attendance Geofence Configuration (Phase 1)
-- Adds physical Hub center coordinates and attendance radius columns to public.hubs.
-- Enforces coordinate validity, all-null or all-set triad constraint, and requires new hubs to have complete geofence.

alter table public.hubs
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists attendance_radius_m integer;

-- Coordinate and radius boundary checks
alter table public.hubs
  drop constraint if exists hubs_latitude_check,
  add constraint hubs_latitude_check
    check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.hubs
  drop constraint if exists hubs_longitude_check,
  add constraint hubs_longitude_check
    check (longitude is null or (longitude >= -180 and longitude <= 180));

alter table public.hubs
  drop constraint if exists hubs_attendance_radius_m_check,
  add constraint hubs_attendance_radius_m_check
    check (attendance_radius_m is null or attendance_radius_m > 0);

-- Triad check: either all three are NULL (legacy unconfigured hub) or all three are populated.
alter table public.hubs
  drop constraint if exists hubs_geofence_triad_check,
  add constraint hubs_geofence_triad_check
    check (
      (latitude is null and longitude is null and attendance_radius_m is null)
      or
      (latitude is not null and longitude is not null and attendance_radius_m is not null)
    );

-- Server-authoritative rule: newly inserted Hubs MUST include a complete geofence.
create or replace function public.enforce_hub_geofence_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.latitude is null or new.longitude is null or new.attendance_radius_m is null then
    raise exception 'New hubs require a complete attendance geofence (latitude, longitude, attendance_radius_m).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_hub_geofence_on_insert() from public, anon, authenticated;
grant execute on function public.enforce_hub_geofence_on_insert() to authenticated, service_role;

drop trigger if exists enforce_hub_geofence_on_insert on public.hubs;
create trigger enforce_hub_geofence_on_insert
before insert on public.hubs
for each row execute function public.enforce_hub_geofence_on_insert();

-- Audit trigger for Hub creation and modifications
create or replace function public.handle_audit_hub_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity_logs (
      user_id,
      hub_id,
      event_type,
      description,
      metadata
    ) values (
      actor_id,
      new.id,
      'hub_created',
      'Hub "' || new.name || '" was created with attendance radius ' || coalesce(new.attendance_radius_m::text, 'none') || 'm.',
      jsonb_build_object(
        'hub_id', new.id,
        'name', new.name,
        'new_latitude', new.latitude,
        'new_longitude', new.longitude,
        'new_attendance_radius_m', new.attendance_radius_m
      )
    );
  elsif tg_op = 'UPDATE' then
    if old.latitude is distinct from new.latitude
      or old.longitude is distinct from new.longitude
      or old.attendance_radius_m is distinct from new.attendance_radius_m
      or old.name is distinct from new.name
      or old.active is distinct from new.active
      or old.description is distinct from new.description then

      insert into public.activity_logs (
        user_id,
        hub_id,
        event_type,
        description,
        metadata
      ) values (
        actor_id,
        new.id,
        case
          when old.latitude is distinct from new.latitude
            or old.longitude is distinct from new.longitude
            or old.attendance_radius_m is distinct from new.attendance_radius_m then 'hub_geofence_updated'
          else 'hub_updated'
        end,
        'Hub "' || new.name || '" was updated.',
        jsonb_build_object(
          'hub_id', new.id,
          'old_name', old.name,
          'new_name', new.name,
          'old_active', old.active,
          'new_active', new.active,
          'old_description', old.description,
          'new_description', new.description,
          'old_latitude', old.latitude,
          'old_longitude', old.longitude,
          'old_attendance_radius_m', old.attendance_radius_m,
          'new_latitude', new.latitude,
          'new_longitude', new.longitude,
          'new_attendance_radius_m', new.attendance_radius_m
        )
      );
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_audit_hub_mutations() from public, anon, authenticated;
grant execute on function public.handle_audit_hub_mutations() to authenticated, service_role;

drop trigger if exists handle_audit_hub_mutations on public.hubs;
create trigger handle_audit_hub_mutations
after insert or update on public.hubs
for each row execute function public.handle_audit_hub_mutations();

-- Update get_hub_management_snapshot() to include geofence fields
create or replace function public.get_hub_management_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select public.get_my_role()) <> 'admin'::public.user_role then
    raise exception 'Only Admin can view Hub Management.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', hub.id,
        'name', hub.name,
        'description', hub.description,
        'active', hub.active,
        'latitude', hub.latitude,
        'longitude', hub.longitude,
        'attendance_radius_m', hub.attendance_radius_m,
        'created_at', hub.created_at,
        'updated_at', hub.updated_at,
        'zone_count', (select count(*) from public.zones zone where zone.hub_id = hub.id),
        'rider_count', (select count(*) from public.riders rider where rider.hub_id = hub.id),
        'staff_count', (select count(*) from public.user_hub_access access where access.hub_id = hub.id)
      ) order by hub.name)
      from public.hubs hub
    ), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', zone.id,
        'name', zone.name,
        'status', zone.status,
        'hub_id', zone.hub_id,
        'rider_count', (select count(*) from public.riders rider where rider.zone_id = zone.id)
      ) order by zone.name)
      from public.zones zone
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_hub_management_snapshot() from public, anon;
grant execute on function public.get_hub_management_snapshot() to authenticated, service_role;
