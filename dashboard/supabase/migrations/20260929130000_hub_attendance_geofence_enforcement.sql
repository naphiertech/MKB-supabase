-- Hub Attendance Geofence Enforcement (Forward-only Migration)
-- Authoritative server-side geofence validation for Rider Time In and Time Out.
--
-- Invariants:
-- 1. Rider must physically be inside their assigned Hub attendance geofence (distance_m <= attendance_radius_m).
-- 2. Time Out requires fresh GPS (<= 120s) with the same security model as Time In.
-- 3. Dedicated immutable evidence table `public.attendance_geofence_events` records location proof per event.
-- 4. Authoritative RPCs `public.record_my_time_in` and `public.record_my_time_out` are SECURITY DEFINER.
-- 5. Direct table INSERT and UPDATE by Riders on `public.attendance_logs` are revoked via RLS.
-- 6. Admin / HR / System attendance workflows remain unaffected.
-- 7. Policy V2 remains strictly INACTIVE; no financial penalties or consequences created.

-- ============================================================================
-- 1. ATTENDANCE GEOFENCE EVIDENCE TABLE
-- ============================================================================

create table if not exists public.attendance_geofence_events (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id uuid not null references public.attendance_logs(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  event_type text not null check (event_type in ('time_in', 'time_out')),
  latitude double precision not null check (latitude >= -90 and latitude <= 90),
  longitude double precision not null check (longitude >= -180 and longitude <= 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  distance_meters double precision not null check (distance_meters >= 0),
  attendance_radius_m integer not null check (attendance_radius_m > 0),
  position_timestamp timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint attendance_geofence_events_log_event_unique unique (attendance_log_id, event_type)
);

create index if not exists idx_attendance_geofence_events_rider_id
  on public.attendance_geofence_events(rider_id);

create index if not exists idx_attendance_geofence_events_hub_id
  on public.attendance_geofence_events(hub_id);

create index if not exists idx_attendance_geofence_events_recorded_at
  on public.attendance_geofence_events(recorded_at desc);

-- Immutability enforcement trigger: evidence rows can NEVER be updated or deleted
create or replace function public.prevent_attendance_geofence_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Attendance geofence events are immutable.' using errcode = '23514';
end;
$$;

revoke all on function public.prevent_attendance_geofence_event_mutation() from public, anon, authenticated;
grant execute on function public.prevent_attendance_geofence_event_mutation() to service_role;

drop trigger if exists trg_attendance_geofence_events_immutable on public.attendance_geofence_events;
create trigger trg_attendance_geofence_events_immutable
before update or delete on public.attendance_geofence_events
for each row execute function public.prevent_attendance_geofence_event_mutation();

-- RLS on attendance_geofence_events
alter table public.attendance_geofence_events enable row level security;

drop policy if exists attendance_geofence_events_rider_select on public.attendance_geofence_events;
create policy attendance_geofence_events_rider_select on public.attendance_geofence_events
for select to authenticated
using (rider_id = (select public.get_my_rider_id()));

drop policy if exists attendance_geofence_events_staff_select on public.attendance_geofence_events;
create policy attendance_geofence_events_staff_select on public.attendance_geofence_events
for select to authenticated
using ((select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role));

revoke all on table public.attendance_geofence_events from public, anon;
grant select on table public.attendance_geofence_events to authenticated;
grant all on table public.attendance_geofence_events to service_role;

-- ============================================================================
-- 2. AUTHORITATIVE HUB RESOLUTION HELPER
-- ============================================================================

create or replace function private.resolve_rider_attendance_hub(
  p_rider_id uuid,
  p_work_date date default (clock_timestamp() at time zone 'Asia/Manila')::date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.resolve_rider_schedule_hub(p_rider_id, p_work_date),
    (select rider.hub_id from public.riders rider where rider.id = p_rider_id)
  );
$$;

revoke all on function private.resolve_rider_attendance_hub(uuid, date) from public, anon, authenticated;
grant execute on function private.resolve_rider_attendance_hub(uuid, date) to service_role;

-- ============================================================================
-- 3. SERVER-SIDE GEOFENCE VALIDATION HELPER
-- ============================================================================

create or replace function private.validate_rider_hub_geofence(
  p_rider_id uuid,
  p_latitude float,
  p_longitude float,
  p_position_timestamp timestamptz,
  p_action text,
  p_work_date date default (clock_timestamp() at time zone 'Asia/Manila')::date
)
returns table (
  hub_id uuid,
  hub_name text,
  distance_m float,
  radius_m integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hub_id uuid;
  v_hub_name text;
  v_hub_lat numeric(10, 7);
  v_hub_lng numeric(10, 7);
  v_hub_radius integer;
  v_distance float;
  v_now timestamptz := clock_timestamp();
begin
  -- 1. Validate coordinates presence and numerical limits
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'INVALID_COORDINATES: Latitude must be between -90 and 90, and longitude between -180 and 180.'
      using errcode = '23514';
  end if;

  -- 2. Validate position timestamp freshness and future skew
  if p_position_timestamp is null then
    raise exception 'MISSING_GPS_TIMESTAMP: GPS position timestamp is required.'
      using errcode = '23514';
  end if;

  if p_position_timestamp > (v_now + interval '5 seconds') then
    raise exception 'FUTURE_GPS_TIMESTAMP: GPS position timestamp cannot be in the future.'
      using errcode = '23514';
  end if;

  if (v_now - p_position_timestamp) > interval '120 seconds' then
    raise exception 'STALE_GPS_POSITION: GPS position is older than 120 seconds. Please acquire a fresh location.'
      using errcode = '23514';
  end if;

  -- 3. Resolve Rider's assigned Hub
  v_hub_id := private.resolve_rider_attendance_hub(p_rider_id, p_work_date);
  if v_hub_id is null then
    raise exception 'NO_ASSIGNED_HUB: No assigned Hub was found for your account. Please contact your administrator.'
      using errcode = '23514';
  end if;

  -- 4. Load Hub geofence configuration
  select h.name, h.latitude, h.longitude, h.attendance_radius_m
  into v_hub_name, v_hub_lat, v_hub_lng, v_hub_radius
  from public.hubs h
  where h.id = v_hub_id;

  if not found then
    raise exception 'NO_ASSIGNED_HUB: Assigned Hub was not found. Please contact your administrator.'
      using errcode = '23503';
  end if;

  if v_hub_lat is null or v_hub_lng is null or v_hub_radius is null then
    raise exception 'HUB_GEOFENCE_NOT_CONFIGURED: Attendance location has not been configured for your Hub. Please contact your administrator.'
      using errcode = '23514';
  end if;

  -- 5. Calculate Haversine distance
  v_distance := public.calculate_distance(p_latitude, p_longitude, v_hub_lat::float, v_hub_lng::float);

  -- 6. Enforce inclusive boundary: distance <= radius is allowed; distance > radius is rejected
  if v_distance > v_hub_radius then
    raise exception 'OUTSIDE_HUB_GEOFENCE: You are %m from %, which exceeds the %m attendance radius.',
      round(v_distance::numeric, 1), v_hub_name, v_hub_radius
      using errcode = '23514';
  end if;

  return query select v_hub_id, v_hub_name, v_distance, v_hub_radius;
end;
$$;

revoke all on function private.validate_rider_hub_geofence(uuid, float, float, timestamptz, text, date) from public, anon, authenticated;
grant execute on function private.validate_rider_hub_geofence(uuid, float, float, timestamptz, text, date) to service_role;

-- ============================================================================
-- 4. FRONTEND PRE-CHECK QUERY RPC
-- ============================================================================

create or replace function public.get_my_hub_attendance_geofence()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_rider_id uuid;
  assigned_hub_id uuid;
  hub_record record;
  work_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only Riders can query Hub attendance geofence.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found.' using errcode = '23503';
  end if;

  assigned_hub_id := private.resolve_rider_attendance_hub(actor_rider_id, work_date);
  if assigned_hub_id is null then
    return jsonb_build_object(
      'hub_id', null,
      'hub_name', null,
      'latitude', null,
      'longitude', null,
      'attendance_radius_m', null,
      'is_configured', false,
      'reason', 'NO_ASSIGNED_HUB',
      'message', 'No assigned Hub was found for your account. Please contact your administrator.'
    );
  end if;

  select h.id, h.name, h.latitude, h.longitude, h.attendance_radius_m
  into hub_record
  from public.hubs h
  where h.id = assigned_hub_id;

  if not found or hub_record.latitude is null or hub_record.longitude is null or hub_record.attendance_radius_m is null then
    return jsonb_build_object(
      'hub_id', assigned_hub_id,
      'hub_name', coalesce(hub_record.name, 'Assigned Hub'),
      'latitude', null,
      'longitude', null,
      'attendance_radius_m', null,
      'is_configured', false,
      'reason', 'HUB_GEOFENCE_NOT_CONFIGURED',
      'message', 'Attendance location has not been configured for this Hub.'
    );
  end if;

  return jsonb_build_object(
    'hub_id', hub_record.id,
    'hub_name', hub_record.name,
    'latitude', hub_record.latitude,
    'longitude', hub_record.longitude,
    'attendance_radius_m', hub_record.attendance_radius_m,
    'is_configured', true,
    'reason', null,
    'message', null
  );
end;
$$;

revoke all on function public.get_my_hub_attendance_geofence() from public, anon;
grant execute on function public.get_my_hub_attendance_geofence() to authenticated, service_role;

-- ============================================================================
-- 5. AUTHORITATIVE TIME IN RPC
-- ============================================================================

create or replace function public.record_my_time_in(
  p_latitude float,
  p_longitude float,
  p_accuracy float default null,
  p_position_timestamp timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_rider_id uuid;
  manila_now timestamptz := clock_timestamp();
  today_date date := (manila_now at time zone 'Asia/Manila')::date;
  today_time time := (manila_now at time zone 'Asia/Manila')::time;
  pos_ts timestamptz;
  v_hub_id uuid;
  v_hub_name text;
  v_distance float;
  v_radius integer;
  log_id uuid;
  existing_log record;
begin
  -- 1. Ensure authenticated caller is an active employed Rider
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only active Riders can record attendance.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found for session.' using errcode = '23503';
  end if;

  if not public.is_rider_operational_at(actor_rider_id, manila_now) then
    raise exception 'RIDER_NOT_OPERATIONAL: Rider is not active or employed.' using errcode = '42501';
  end if;

  -- 2. Strictly enforce cutoff finalization rule (17:00 Manila cutoff)
  if today_time >= time '17:00:00' then
    raise exception 'ATTENDANCE_CLOSED: Today''s attendance has already been finalized.' using errcode = '23514';
  end if;

  -- 3. Position timestamp resolution
  pos_ts := coalesce(p_position_timestamp, manila_now);

  -- 4. Server-Side Geofence Validation
  select v.hub_id, v.hub_name, v.distance_m, v.radius_m
  into v_hub_id, v_hub_name, v_distance, v_radius
  from private.validate_rider_hub_geofence(
    actor_rider_id,
    p_latitude,
    p_longitude,
    pos_ts,
    'time_in',
    today_date
  ) v;

  -- 5. Atomic Attendance Log Upsert
  select id, time_in, time_out, source into existing_log
  from public.attendance_logs
  where rider_id = actor_rider_id and date = today_date;

  if existing_log.id is not null then
    if existing_log.time_in is not null and existing_log.source <> 'system' then
      raise exception 'DUPLICATE_TIME_IN: Time In has already been recorded for today.' using errcode = '23505';
    end if;
    log_id := existing_log.id;
    update public.attendance_logs
    set time_in = manila_now,
        status = 'present'::public.attendance_status,
        source = 'face-scan'::public.attendance_source,
        notes = null,
        hub_id = v_hub_id,
        updated_at = manila_now
    where id = log_id;
  else
    log_id := gen_random_uuid();
    insert into public.attendance_logs (
      id, rider_id, hub_id, date, time_in, status, source, notes, created_at, updated_at
    ) values (
      log_id, actor_rider_id, v_hub_id, today_date, manila_now,
      'present'::public.attendance_status, 'face-scan'::public.attendance_source, null,
      manila_now, manila_now
    );
  end if;

  -- 6. Insert Immutable Location Evidence
  insert into public.attendance_geofence_events (
    attendance_log_id,
    rider_id,
    hub_id,
    event_type,
    latitude,
    longitude,
    accuracy_meters,
    distance_meters,
    attendance_radius_m,
    position_timestamp,
    recorded_at
  ) values (
    log_id,
    actor_rider_id,
    v_hub_id,
    'time_in',
    p_latitude,
    p_longitude,
    p_accuracy,
    v_distance,
    v_radius,
    pos_ts,
    manila_now
  )
  on conflict (attendance_log_id, event_type) do nothing;

  return jsonb_build_object(
    'attendance_log_id', log_id,
    'rider_id', actor_rider_id,
    'hub_id', v_hub_id,
    'hub_name', v_hub_name,
    'date', today_date,
    'time_in', manila_now,
    'distance_meters', round(v_distance::numeric, 1),
    'attendance_radius_m', v_radius,
    'status', 'present'
  );
end;
$$;

revoke all on function public.record_my_time_in(float, float, float, timestamptz) from public, anon;
grant execute on function public.record_my_time_in(float, float, float, timestamptz) to authenticated, service_role;

-- ============================================================================
-- 6. AUTHORITATIVE TIME OUT RPC
-- ============================================================================

create or replace function public.record_my_time_out(
  p_latitude float,
  p_longitude float,
  p_accuracy float default null,
  p_position_timestamp timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_rider_id uuid;
  manila_now timestamptz := clock_timestamp();
  today_date date := (manila_now at time zone 'Asia/Manila')::date;
  pos_ts timestamptz;
  v_hub_id uuid;
  v_hub_name text;
  v_distance float;
  v_radius integer;
  log_row record;
begin
  -- 1. Ensure authenticated caller is an active employed Rider
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only active Riders can record attendance.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found for session.' using errcode = '23503';
  end if;

  if not public.is_rider_operational_at(actor_rider_id, manila_now) then
    raise exception 'RIDER_NOT_OPERATIONAL: Rider is not active or employed.' using errcode = '42501';
  end if;

  -- 2. Find open attendance log for today
  select id, time_in, time_out, hub_id into log_row
  from public.attendance_logs
  where rider_id = actor_rider_id and date = today_date;

  if log_row.id is null or log_row.time_in is null then
    raise exception 'NO_ACTIVE_SHIFT: No active Time In record found for today.' using errcode = '23514';
  end if;

  if log_row.time_out is not null then
    raise exception 'ALREADY_TIMED_OUT: Time Out has already been recorded for today.' using errcode = '23514';
  end if;

  -- 3. Position timestamp resolution
  pos_ts := coalesce(p_position_timestamp, manila_now);

  -- 4. Server-Side Geofence Validation for Time Out
  select v.hub_id, v.hub_name, v.distance_m, v.radius_m
  into v_hub_id, v_hub_name, v_distance, v_radius
  from private.validate_rider_hub_geofence(
    actor_rider_id,
    p_latitude,
    p_longitude,
    pos_ts,
    'time_out',
    today_date
  ) v;

  -- 5. Update Attendance Log with time_out
  update public.attendance_logs
  set time_out = manila_now,
      updated_at = manila_now
  where id = log_row.id;

  -- 6. Insert Immutable Location Evidence for Time Out
  insert into public.attendance_geofence_events (
    attendance_log_id,
    rider_id,
    hub_id,
    event_type,
    latitude,
    longitude,
    accuracy_meters,
    distance_meters,
    attendance_radius_m,
    position_timestamp,
    recorded_at
  ) values (
    log_row.id,
    actor_rider_id,
    v_hub_id,
    'time_out',
    p_latitude,
    p_longitude,
    p_accuracy,
    v_distance,
    v_radius,
    pos_ts,
    manila_now
  )
  on conflict (attendance_log_id, event_type) do nothing;

  return jsonb_build_object(
    'attendance_log_id', log_row.id,
    'rider_id', actor_rider_id,
    'hub_id', v_hub_id,
    'hub_name', v_hub_name,
    'date', today_date,
    'time_out', manila_now,
    'distance_meters', round(v_distance::numeric, 1),
    'attendance_radius_m', v_radius
  );
end;
$$;

revoke all on function public.record_my_time_out(float, float, float, timestamptz) from public, anon;
grant execute on function public.record_my_time_out(float, float, float, timestamptz) to authenticated, service_role;

-- ============================================================================
-- 7. BYPASS PROTECTION ON ATTENDANCE_LOGS
-- ============================================================================

-- Drop direct INSERT and UPDATE policies for Riders on public.attendance_logs.
-- Riders MUST use authoritative record_my_time_in and record_my_time_out RPCs.
-- Admin and HR policies ("Admin and HR can insert attendance", "Admin and HR can update any attendance")
-- and system finalizer operations remain intact.
drop policy if exists "Rider can insert own attendance" on public.attendance_logs;
drop policy if exists "Rider can update own attendance" on public.attendance_logs;
