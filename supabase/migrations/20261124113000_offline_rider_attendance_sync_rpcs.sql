-- Migration: Offline-first rider attendance sync RPCs (SECURITY DEFINER)
-- Allows authenticated riders to replay offline-captured Time-In and Time-Out events
-- once connectivity returns, while strictly enforcing server-side Hub geofence distance,
-- Manila cutoff rules, 24-hour replay window, and idempotency.

CREATE OR REPLACE FUNCTION public.sync_offline_rider_time_in(
  p_latitude double precision,
  p_longitude double precision,
  p_captured_at timestamptz,
  p_accuracy double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  actor_rider_id uuid;
  v_now timestamptz := private.get_attendance_clock();
  v_work_date date;
  v_work_time time;
  v_hub_id uuid;
  v_hub_name text;
  v_hub_lat numeric(10, 7);
  v_hub_lng numeric(10, 7);
  v_hub_radius integer;
  v_distance float;
  log_id uuid;
  existing_log record;
begin
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only active Riders can sync attendance.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found for session.' using errcode = '23503';
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'INVALID_COORDINATES: Latitude must be between -90 and 90, and longitude between -180 and 180.'
      using errcode = '23514';
  end if;

  if p_captured_at is null then
    raise exception 'MISSING_GPS_TIMESTAMP: Offline capture timestamp is required.' using errcode = '23514';
  end if;

  if p_captured_at > (v_now + interval '60 seconds') then
    raise exception 'FUTURE_GPS_TIMESTAMP: Offline capture timestamp cannot be in the future.' using errcode = '23514';
  end if;

  if (v_now - p_captured_at) > interval '24 hours' then
    raise exception 'EXPIRED_OFFLINE_ATTENDANCE: Offline Time In is older than 24 hours and must be resolved by HR.'
      using errcode = '23514';
  end if;

  v_work_date := (p_captured_at at time zone 'Asia/Manila')::date;
  v_work_time := (p_captured_at at time zone 'Asia/Manila')::time;

  if v_work_time >= time '17:00:00' then
    raise exception 'ATTENDANCE_CLOSED: Attendance cutoff (17:00) had already passed when this offline Time In was captured.'
      using errcode = '23514';
  end if;

  if not public.is_rider_operational_at(actor_rider_id, p_captured_at) then
    raise exception 'RIDER_NOT_OPERATIONAL: Rider is not active or employed.' using errcode = '42501';
  end if;

  v_hub_id := private.resolve_rider_attendance_hub(actor_rider_id, v_work_date);
  if v_hub_id is null then
    raise exception 'NO_ASSIGNED_HUB: No assigned Hub was found for your account.' using errcode = '23514';
  end if;

  select h.name, h.latitude, h.longitude, h.attendance_radius_m
  into v_hub_name, v_hub_lat, v_hub_lng, v_hub_radius
  from public.hubs h
  where h.id = v_hub_id;

  if not found or v_hub_lat is null or v_hub_lng is null or v_hub_radius is null then
    raise exception 'HUB_GEOFENCE_NOT_CONFIGURED: Attendance location has not been configured for your Hub.'
      using errcode = '23514';
  end if;

  v_distance := public.calculate_distance(p_latitude, p_longitude, v_hub_lat::float, v_hub_lng::float);
  if v_distance > v_hub_radius then
    raise exception 'OUTSIDE_HUB_GEOFENCE: You were %m from %, which exceeds the %m attendance radius.',
      round(v_distance::numeric, 1), v_hub_name, v_hub_radius
      using errcode = '23514';
  end if;

  select id, time_in, time_out, source into existing_log
  from public.attendance_logs
  where rider_id = actor_rider_id and date = v_work_date;

  if existing_log.id is not null and existing_log.time_in is not null and existing_log.source <> 'system' then
    return jsonb_build_object(
      'attendance_log_id', existing_log.id,
      'rider_id', actor_rider_id,
      'hub_id', v_hub_id,
      'hub_name', v_hub_name,
      'date', v_work_date,
      'time_in', existing_log.time_in,
      'already_recorded', true,
      'status', 'present'
    );
  end if;

  perform set_config('app.attendance_writer_context', jsonb_build_object(
    'change_source', 'offline_sync_rpc',
    'actor_type', 'user',
    'actor_id', (select auth.uid()),
    'reason', 'Rider offline face scan Time In synced on reconnect'
  )::text, true);

  if existing_log.id is not null then
    log_id := existing_log.id;
    update public.attendance_logs
    set time_in = p_captured_at,
        status = 'present'::public.attendance_status,
        source = 'face-scan'::public.attendance_source,
        notes = 'Synced from offline mobile queue',
        hub_id = v_hub_id,
        updated_at = v_now
    where id = log_id;
  else
    log_id := gen_random_uuid();
    insert into public.attendance_logs (
      id, rider_id, hub_id, date, time_in, status, source, notes, created_at, updated_at
    ) values (
      log_id, actor_rider_id, v_hub_id, v_work_date, p_captured_at,
      'present'::public.attendance_status, 'face-scan'::public.attendance_source,
      'Synced from offline mobile queue', v_now, v_now
    );
  end if;

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
    v_hub_radius,
    p_captured_at,
    v_now
  )
  on conflict (attendance_log_id, event_type) do nothing;

  return jsonb_build_object(
    'attendance_log_id', log_id,
    'rider_id', actor_rider_id,
    'hub_id', v_hub_id,
    'hub_name', v_hub_name,
    'date', v_work_date,
    'time_in', p_captured_at,
    'distance_meters', round(v_distance::numeric, 1),
    'attendance_radius_m', v_hub_radius,
    'already_recorded', false,
    'status', 'present'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_offline_rider_time_out(
  p_latitude double precision,
  p_longitude double precision,
  p_captured_at timestamptz,
  p_accuracy double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  actor_rider_id uuid;
  v_now timestamptz := private.get_attendance_clock();
  v_work_date date;
  v_hub_id uuid;
  v_hub_name text;
  v_hub_lat numeric(10, 7);
  v_hub_lng numeric(10, 7);
  v_hub_radius integer;
  v_distance float;
  log_row record;
begin
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only active Riders can sync attendance.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found for session.' using errcode = '23503';
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'INVALID_COORDINATES: Latitude must be between -90 and 90, and longitude between -180 and 180.'
      using errcode = '23514';
  end if;

  if p_captured_at is null then
    raise exception 'MISSING_GPS_TIMESTAMP: Offline capture timestamp is required.' using errcode = '23514';
  end if;

  if p_captured_at > (v_now + interval '60 seconds') then
    raise exception 'FUTURE_GPS_TIMESTAMP: Offline capture timestamp cannot be in the future.' using errcode = '23514';
  end if;

  if (v_now - p_captured_at) > interval '24 hours' then
    raise exception 'EXPIRED_OFFLINE_ATTENDANCE: Offline Time Out is older than 24 hours and must be resolved by HR.'
      using errcode = '23514';
  end if;

  v_work_date := (p_captured_at at time zone 'Asia/Manila')::date;

  if not public.is_rider_operational_at(actor_rider_id, p_captured_at) then
    raise exception 'RIDER_NOT_OPERATIONAL: Rider is not active or employed.' using errcode = '42501';
  end if;

  select id, time_in, time_out, hub_id into log_row
  from public.attendance_logs
  where rider_id = actor_rider_id and date = v_work_date;

  if log_row.id is null or log_row.time_in is null then
    raise exception 'NO_ACTIVE_SHIFT: No active Time In record found for %.', v_work_date using errcode = '23514';
  end if;

  if log_row.time_out is not null then
    return jsonb_build_object(
      'attendance_log_id', log_row.id,
      'rider_id', actor_rider_id,
      'date', v_work_date,
      'time_out', log_row.time_out,
      'already_recorded', true
    );
  end if;

  if p_captured_at < log_row.time_in then
    raise exception 'INVALID_TIME_OUT: Time Out cannot precede Time In.' using errcode = '23514';
  end if;

  v_hub_id := coalesce(log_row.hub_id, private.resolve_rider_attendance_hub(actor_rider_id, v_work_date));
  select h.name, h.latitude, h.longitude, h.attendance_radius_m
  into v_hub_name, v_hub_lat, v_hub_lng, v_hub_radius
  from public.hubs h
  where h.id = v_hub_id;

  if not found or v_hub_lat is null or v_hub_lng is null or v_hub_radius is null then
    raise exception 'HUB_GEOFENCE_NOT_CONFIGURED: Attendance location has not been configured for your Hub.'
      using errcode = '23514';
  end if;

  v_distance := public.calculate_distance(p_latitude, p_longitude, v_hub_lat::float, v_hub_lng::float);
  if v_distance > v_hub_radius then
    raise exception 'OUTSIDE_HUB_GEOFENCE: You were %m from %, which exceeds the %m attendance radius.',
      round(v_distance::numeric, 1), v_hub_name, v_hub_radius
      using errcode = '23514';
  end if;

  perform set_config('app.attendance_writer_context', jsonb_build_object(
    'change_source', 'offline_sync_rpc',
    'actor_type', 'user',
    'actor_id', (select auth.uid()),
    'reason', 'Rider offline face scan Time Out synced on reconnect'
  )::text, true);

  update public.attendance_logs
  set time_out = p_captured_at,
      updated_at = v_now
  where id = log_row.id;

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
    v_hub_radius,
    p_captured_at,
    v_now
  )
  on conflict (attendance_log_id, event_type) do nothing;

  return jsonb_build_object(
    'attendance_log_id', log_row.id,
    'rider_id', actor_rider_id,
    'hub_id', v_hub_id,
    'hub_name', v_hub_name,
    'date', v_work_date,
    'time_out', p_captured_at,
    'distance_meters', round(v_distance::numeric, 1),
    'attendance_radius_m', v_hub_radius,
    'already_recorded', false
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.sync_offline_rider_time_in(double precision, double precision, timestamptz, double precision) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sync_offline_rider_time_in(double precision, double precision, timestamptz, double precision) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_offline_rider_time_out(double precision, double precision, timestamptz, double precision) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sync_offline_rider_time_out(double precision, double precision, timestamptz, double precision) TO authenticated, service_role;
