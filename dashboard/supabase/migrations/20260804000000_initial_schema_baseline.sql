-- ============================================================
-- 20260804000000_initial_schema_baseline.sql
-- AttenRider / MKB Supabase — Historical Pre-August Baseline Schema
-- ============================================================
-- Reconstructs the complete database state that existed immediately
-- before 20260804162434_offline_sync_server_integrity.sql.
--
-- Incorporates:
-- 1. attenrider_schema.sql (extensions, core enums, initial tables, RLS)
-- 2. cache_rider_face_descriptor.sql
-- 3. create_reviews_table.sql
-- 4. update_my_last_login.sql
-- 5. payroll_workflow_security.sql
-- 6. backend_geofencing.sql
-- 7. rider-documents private Storage bucket registration
--
-- Designed for reproducible fresh local and CI database replay.
-- All operations are safe, idempotent, and non-destructive.
-- ============================================================

-- ============================================================
-- SECTION 1 — EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ============================================================
-- SECTION 2 — ENUMS
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rider_status') then
    create type public.rider_status as enum ('active', 'idle', 'violation', 'offline');
  end if;
  if not exists (select 1 from pg_type where typname = 'zone_status') then
    create type public.zone_status as enum ('active', 'inactive');
  end if;
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'hr', 'rider', 'payroll');
  end if;
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type public.user_status as enum ('active', 'suspended');
  end if;
  if not exists (select 1 from pg_type where typname = 'shift_type') then
    create type public.shift_type as enum ('Morning', 'Afternoon', 'Evening');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type public.attendance_status as enum ('present', 'late', 'absent', 'on_leave');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendance_source') then
    create type public.attendance_source as enum ('face-scan', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'violation_type') then
    create type public.violation_type as enum ('boundary_exit', 'idle_timeout', 'manual_flag');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum ('violation', 'absent', 'attendance', 'system');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_category') then
    create type public.notification_category as enum ('attendance', 'payroll', 'geofence', 'biometrics', 'account', 'system', 'announcement');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_priority') then
    create type public.notification_priority as enum ('low', 'medium', 'high', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'payroll_status') then
    create type public.payroll_status as enum ('pending', 'processed', 'flagged', 'approved', 'paid', 'rejected', 'draft');
  end if;
  if not exists (select 1 from pg_type where typname = 'device_status') then
    create type public.device_status as enum ('trusted', 'revoked');
  end if;
end;
$$;

-- ============================================================
-- SECTION 3 — CORE & SUPPORT TABLES
-- ============================================================

-- 3.1 zones
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision,
  lng double precision,
  radius integer check (radius is null or radius between 100 and 5000),
  color text not null default '#db6c00',
  status public.zone_status not null default 'active',
  zone_type text not null default 'circle',
  polygon_coordinates jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.2 riders
create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mkb_id text unique not null,
  email text unique not null,
  contact text,
  zone_id uuid references public.zones(id) on delete set null,
  shift public.shift_type,
  lat double precision,
  lng double precision,
  speed double precision default 0,
  status public.rider_status not null default 'offline',
  last_ping timestamptz,
  face_registered boolean not null default false,
  face_image_url text,
  avatar_url text,
  face_descriptor jsonb,
  face_registered_at timestamptz,
  street_address text,
  barangay text,
  city text,
  province text,
  zip_code text,
  emergency_contact_name text,
  emergency_contact_phone text,
  employment_type text,
  date_of_hire date,
  vehicle_type text,
  vehicle_plate_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.3 users (linked to Supabase Auth)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  role public.user_role not null,
  contact text,
  rider_id uuid references public.riders(id) on delete set null,
  status public.user_status not null default 'active',
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.4 user_devices
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rider_id uuid references public.riders(id) on delete cascade,
  device_uuid text not null,
  device_fingerprint_hash text not null,
  device_name text not null default 'Unknown Device',
  platform text not null default 'web',
  status public.device_status not null default 'trusted',
  user_agent text,
  ip_address text,
  registered_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create unique index if not exists idx_user_devices_active_trusted
  on public.user_devices (user_id) where status = 'trusted';

-- 3.5 attendance_logs
create table if not exists public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  date date not null,
  time_in timestamptz,
  time_out timestamptz,
  hours double precision generated always as (
    extract(epoch from (time_out - time_in)) / 3600
  ) stored,
  status public.attendance_status,
  source public.attendance_source not null default 'face-scan',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_logs_rider_date_key unique (rider_id, date)
);

-- 3.6 violations
create table if not exists public.violations (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  zone_name text,
  lat double precision,
  lng double precision,
  type public.violation_type not null default 'boundary_exit',
  read boolean not null default false,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_violations_unique_unresolved
  on public.violations (rider_id, zone_id)
  where (resolved = false and type = 'boundary_exit');

-- 3.7 rider_locations
create table if not exists public.rider_locations (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed double precision default 0,
  status public.rider_status not null default 'active',
  recorded_at timestamptz not null default now()
);

-- 3.8 notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.users(id) on delete set null,
  category public.notification_category not null default 'system',
  priority public.notification_priority not null default 'medium',
  type public.notification_type not null default 'system',
  title text not null,
  message text not null,
  recipient_id uuid references public.users(id) on delete cascade,
  rider_id uuid references public.riders(id) on delete set null,
  violation_id uuid references public.violations(id) on delete set null,
  action_link text,
  metadata jsonb default '{}'::jsonb,
  read boolean not null default false,
  target_roles public.user_role[] not null default array['admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role, 'rider'::public.user_role],
  created_at timestamptz not null default now()
);

-- 3.9 activity_logs
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  rider_id uuid references public.riders(id) on delete set null,
  event_type text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- 3.10 payroll_records
create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  cutoff_start date not null,
  cutoff_end date not null,
  days_present integer not null default 0,
  total_hours double precision not null default 0,
  daily_rate numeric(10, 2) not null default 500.00,
  total_parcels integer not null default 0,
  rate_per_parcel numeric(10, 2) not null default 50.00,
  gross_pay numeric(12, 2),
  other_earnings numeric(12, 2) default 0.00,
  fm_pickup_count integer default 0,
  deductions numeric(12, 2) default 0.00,
  late_onhold numeric(12, 2) default 0.00,
  late_remittance numeric(12, 2) default 0.00,
  submitted_by uuid references public.users(id),
  submitted_at timestamptz,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  rejected_by uuid references public.users(id),
  rejected_at timestamptz,
  rejection_reason text,
  paid_by uuid references public.users(id),
  paid_at timestamptz,
  status public.payroll_status not null default 'pending',
  notes text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_records_rider_cutoff_key unique (rider_id, cutoff_start, cutoff_end)
);

-- 3.11 parcel_logs
create table if not exists public.parcel_logs (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  date date not null,
  parcels integer not null default 0,
  assigned_parcels integer default 0,
  failed_parcels integer default 0,
  returned_parcels integer default 0,
  rate numeric(10, 2) not null default 50.00,
  daily_gross numeric(12, 2),
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parcel_logs_rider_date_key unique (rider_id, date)
);

-- 3.12 parcel_correction_requests
create table if not exists public.parcel_correction_requests (
  id uuid primary key default gen_random_uuid(),
  parcel_log_id uuid not null references public.parcel_logs(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  date date not null,
  previous_delivered integer not null default 0,
  previous_failed integer not null default 0,
  previous_returned integer not null default 0,
  requested_delivered integer not null default 0,
  requested_failed integer not null default 0,
  requested_returned integer not null default 0,
  reason text not null,
  requested_by uuid references public.users(id),
  requested_at timestamptz not null default now(),
  status character varying not null default 'pending',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.13 parcel_log_audit
create table if not exists public.parcel_log_audit (
  id uuid primary key default gen_random_uuid(),
  parcel_log_id uuid not null references public.parcel_logs(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  date date not null,
  old_delivered integer not null default 0,
  old_failed integer not null default 0,
  old_returned integer not null default 0,
  new_delivered integer not null default 0,
  new_failed integer not null default 0,
  new_returned integer not null default 0,
  action_type character varying not null,
  correction_request_id uuid references public.parcel_correction_requests(id),
  reason text,
  changed_by uuid references public.users(id),
  approved_by uuid references public.users(id),
  timestamp timestamptz not null default now()
);

-- 3.14 reviews
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role_title text,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- SECTION 4 — STORAGE BUCKETS
-- ============================================================

insert into storage.buckets (id, name, public)
values ('rider-documents', 'rider-documents', false)
on conflict (id) do nothing;

-- ============================================================
-- SECTION 5 — INDEXES
-- ============================================================

create index if not exists idx_riders_zone_id on public.riders(zone_id);
create index if not exists idx_riders_status on public.riders(status);

create index if not exists idx_attendance_rider_id on public.attendance_logs(rider_id);
create index if not exists idx_attendance_date on public.attendance_logs(date);
create index if not exists idx_attendance_status on public.attendance_logs(status);

create index if not exists idx_violations_rider_id on public.violations(rider_id);
create index if not exists idx_violations_created_at on public.violations(created_at desc);
create index if not exists idx_violations_read on public.violations(read);

create index if not exists idx_rider_locations_rider_id on public.rider_locations(rider_id);
create index if not exists idx_rider_locations_recorded_at on public.rider_locations(recorded_at desc);
create index if not exists idx_rider_locations_rider_date on public.rider_locations(rider_id, recorded_at);

create index if not exists idx_notifications_read on public.notifications(read);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

create index if not exists idx_payroll_rider_id on public.payroll_records(rider_id);
create index if not exists idx_payroll_cutoff on public.payroll_records(cutoff_start, cutoff_end);

create index if not exists idx_activity_logs_user_id on public.activity_logs(user_id);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);

create index if not exists idx_parcel_logs_rider_date on public.parcel_logs(rider_id, date);
create index if not exists idx_parcel_correction_rider on public.parcel_correction_requests(rider_id);
create index if not exists idx_parcel_audit_log_id on public.parcel_log_audit(parcel_log_id);

-- ============================================================
-- SECTION 6 — FUNCTIONS & TRIGGERS
-- ============================================================

-- 6.1 Timestamp update handler
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists zones_updated_at on public.zones;
create trigger zones_updated_at
  before update on public.zones
  for each row execute function public.handle_updated_at();

drop trigger if exists riders_updated_at on public.riders;
create trigger riders_updated_at
  before update on public.riders
  for each row execute function public.handle_updated_at();

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

drop trigger if exists attendance_updated_at on public.attendance_logs;
create trigger attendance_updated_at
  before update on public.attendance_logs
  for each row execute function public.handle_updated_at();

drop trigger if exists payroll_updated_at on public.payroll_records;
create trigger payroll_updated_at
  before update on public.payroll_records
  for each row execute function public.handle_updated_at();

drop trigger if exists parcel_logs_updated_at on public.parcel_logs;
create trigger parcel_logs_updated_at
  before update on public.parcel_logs
  for each row execute function public.handle_updated_at();

drop trigger if exists parcel_correction_requests_updated_at on public.parcel_correction_requests;
create trigger parcel_correction_requests_updated_at
  before update on public.parcel_correction_requests
  for each row execute function public.handle_updated_at();

-- 6.2 Role & Rider ID helpers
create or replace function public.get_my_role()
returns public.user_role as $$
  select role from public.users where id = auth.uid()
$$ language sql security definer stable;

create or replace function public.get_my_rider_id()
returns uuid as $$
  select rider_id from public.users where id = auth.uid()
$$ language sql security definer stable;

-- 6.3 update_my_last_login
create or replace function public.update_my_last_login()
returns void as $$
begin
  update public.users
  set last_login = now()
  where id = auth.uid();
end;
$$ language plpgsql security definer;

-- 6.4 cache_rider_face_descriptor
create or replace function public.cache_rider_face_descriptor(
  p_rider_id uuid,
  p_descriptor jsonb
) returns void security definer as $$
begin
  if (
    public.get_my_role() = 'admin'::public.user_role 
    or public.get_my_role() = 'hr'::public.user_role 
    or p_rider_id = public.get_my_rider_id()
  ) then
    update public.riders
    set face_descriptor = p_descriptor,
        face_registered_at = now()
    where id = p_rider_id and face_descriptor is null;
  else
    raise exception 'Unauthorized: Cannot cache face descriptor for this rider profile.';
  end if;
end;
$$ language plpgsql;

-- 6.5 validate_and_register_device
create or replace function public.validate_and_register_device(
  p_device_uuid text,
  p_fingerprint_hash text,
  p_device_name text,
  p_platform text,
  p_user_agent text,
  p_ip text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_user_role public.user_role;
  v_rider_id uuid;
  v_existing_device public.user_devices%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized: No active authentication session.';
  end if;

  select role, rider_id into v_user_role, v_rider_id
  from public.users
  where id = v_user_id;

  if v_user_role != 'rider'::public.user_role then
    return jsonb_build_object('allowed', true, 'reason', 'bypassed_non_rider');
  end if;

  select * into v_existing_device
  from public.user_devices
  where user_id = v_user_id and status = 'trusted';

  if v_existing_device.id is null then
    insert into public.user_devices (
      user_id, rider_id, device_uuid, device_fingerprint_hash, device_name, platform, status, user_agent, ip_address
    ) values (
      v_user_id, v_rider_id, p_device_uuid, p_fingerprint_hash, coalesce(p_device_name, 'Unknown Device'), coalesce(p_platform, 'web'), 'trusted', p_user_agent, p_ip
    );

    return jsonb_build_object('allowed', true, 'reason', 'registered_first_device');
  end if;

  if v_existing_device.device_uuid = p_device_uuid or v_existing_device.device_fingerprint_hash = p_fingerprint_hash then
    update public.user_devices
    set last_used_at = now(),
        device_uuid = p_device_uuid,
        ip_address = coalesce(p_ip, ip_address),
        user_agent = coalesce(p_user_agent, user_agent)
    where id = v_existing_device.id;

    return jsonb_build_object('allowed', true, 'reason', 'trusted_device_match');
  end if;

  return jsonb_build_object(
    'allowed', false,
    'reason', 'device_mismatch',
    'registered_device_name', v_existing_device.device_name,
    'registered_at', v_existing_device.registered_at
  );
end;
$$;

-- 6.6 Geofencing calculation helpers
create or replace function public.calculate_distance(
  lat1 float,
  lng1 float,
  lat2 float,
  lng2 float
)
returns float as $$
declare
  r float := 6371000;
  dlat float;
  dlng float;
  a float;
  c float;
begin
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat/2) * sin(dlat/2) + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng/2) * sin(dlng/2);
  c := 2 * asin(sqrt(a));
  return r * c;
end;
$$ language plpgsql stable;

create or replace function public.is_point_in_polygon(
  p_lat float,
  p_lng float,
  polygon_coords jsonb
)
returns boolean as $$
declare
  inside boolean := false;
  num_vertices int;
  i int;
  j int;
  lat_i float;
  lng_i float;
  lat_j float;
  lng_j float;
  is_intersect boolean;
begin
  num_vertices := jsonb_array_length(polygon_coords);
  if num_vertices < 3 then
    return false;
  end if;

  j := num_vertices - 1;
  for i in 0 .. num_vertices - 1 loop
    lat_i := (polygon_coords->i->>0)::float;
    lng_i := (polygon_coords->i->>1)::float;
    lat_j := (polygon_coords->j->>0)::float;
    lng_j := (polygon_coords->j->>1)::float;

    is_intersect := ((lng_i > p_lng) != (lng_j > p_lng))
      and (p_lat < (lat_j - lat_i) * (p_lng - lng_i) / (lng_j - lng_i) + lat_i);
    
    if is_intersect then
      inside := not inside;
    end if;
    j := i;
  end loop;
  return inside;
end;
$$ language plpgsql stable;

-- 6.7 Geofence evaluation trigger on rider_locations
create or replace function public.process_rider_location_geofence()
returns trigger as $$
declare
  r_status public.rider_status;
  r_zone_id uuid;
  r_name text;
  active_log_id uuid;
  z_name text;
  z_status public.zone_status;
  z_type text;
  z_lat float;
  z_lng float;
  z_radius int;
  z_poly_coords jsonb;
  is_inside boolean := true;
  calculated_status public.rider_status;
  v_id uuid;
begin
  select status, zone_id, name into r_status, r_zone_id, r_name 
  from public.riders where id = new.rider_id for update;
  
  select id into active_log_id 
  from public.attendance_logs 
  where rider_id = new.rider_id 
    and date = current_date 
    and time_in is not null 
    and time_out is null;
    
  if active_log_id is null then
    new.status := 'offline';
    if r_status != 'offline' then
      update public.riders 
      set status = 'offline', 
          lat = new.lat, 
          lng = new.lng, 
          last_ping = new.recorded_at 
      where id = new.rider_id;
    end if;
    return new;
  end if;
  
  if r_zone_id is null then
    calculated_status := 'active';
  else
    select name, status, zone_type, lat, lng, radius, polygon_coordinates 
    into z_name, z_status, z_type, z_lat, z_lng, z_radius, z_poly_coords 
    from public.zones where id = r_zone_id;
    
    if z_status is distinct from 'active' then
      calculated_status := 'active';
    else
      if z_type = 'polygon' and z_poly_coords is not null then
        is_inside := public.is_point_in_polygon(new.lat, new.lng, z_poly_coords);
      else
        is_inside := public.calculate_distance(new.lat, new.lng, z_lat, z_lng) <= z_radius;
      end if;
      
      if is_inside then
        calculated_status := 'active';
      else
        calculated_status := 'violation';
      end if;
    end if;
  end if;

  new.status := calculated_status;
  
  update public.riders 
  set status = calculated_status, 
      lat = new.lat, 
      lng = new.lng, 
      last_ping = new.recorded_at 
  where id = new.rider_id;
  
  if calculated_status = 'violation' and r_status is distinct from 'violation' then
    if not exists (
      select 1 from public.violations 
      where rider_id = new.rider_id 
        and zone_id = r_zone_id 
        and resolved = false 
        and type = 'boundary_exit'
    ) then
      insert into public.violations (rider_id, zone_id, zone_name, lat, lng, type, read, resolved)
      values (new.rider_id, r_zone_id, z_name, new.lat, new.lng, 'boundary_exit', false, false)
      returning id into v_id;
      
      insert into public.notifications (type, title, message, rider_id, violation_id, read, target_roles)
      values (
        'violation',
        'Geofence Exit Breach',
        'Rider ' || r_name || ' has breached the boundary of zone ' || z_name,
        new.rider_id,
        v_id,
        false,
        array['admin'::public.user_role, 'hr'::public.user_role]
      );
      
      insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
      values (
        null,
        new.rider_id,
        'geofence_exit',
        'Rider exited zone ' || z_name || '.',
        jsonb_build_object('lat', new.lat, 'lng', new.lng, 'zone_id', r_zone_id, 'zone_name', z_name)
      );
    end if;
  end if;
  
  if calculated_status = 'active' and r_status = 'violation' then
    update public.violations 
    set resolved = true 
    where rider_id = new.rider_id 
      and zone_id = r_zone_id 
      and resolved = false;
      
    insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
    values (
      null,
      new.rider_id,
      'geofence_enter',
      'Rider returned to zone ' || z_name || '.',
      jsonb_build_object('lat', new.lat, 'lng', new.lng, 'zone_id', r_zone_id, 'zone_name', z_name)
    );
  end if;
  
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_process_rider_location_geofence on public.rider_locations;
create trigger trg_process_rider_location_geofence
  before insert on public.rider_locations
  for each row
  execute function public.process_rider_location_geofence();

-- 6.8 Payroll workflow constraints
create or replace function public.enforce_payroll_workflow_constraints()
returns trigger as $$
declare
  current_user_role public.user_role;
begin
  current_user_role := public.get_my_role();

  if old.status is distinct from new.status then
    if new.status = 'approved'::public.payroll_status and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can approve payroll.';
    end if;

    if new.status = 'rejected'::public.payroll_status and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can reject payroll.';
    end if;

    if new.status = 'draft'::public.payroll_status and old.status = 'pending'::public.payroll_status and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can return payroll for revision.';
    end if;

    if new.status = 'paid'::public.payroll_status and current_user_role != 'admin'::public.user_role then
      raise exception 'Only Admin can mark payroll as Paid.';
    end if;

    if new.status = 'pending'::public.payroll_status and current_user_role not in ('admin'::public.user_role, 'payroll'::public.user_role) then
      raise exception 'Only Payroll Officer or Admin can submit payroll for approval.';
    end if;
  end if;

  if current_user_role = 'hr'::public.user_role and (old.status = 'draft'::public.payroll_status or old.status = 'rejected'::public.payroll_status) then
    raise exception 'HR cannot edit payroll records in Draft or Rejected status.';
  end if;

  if current_user_role = 'payroll'::public.user_role and old.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
    raise exception 'Payroll Officer can only edit payroll records in Draft or Rejected status.';
  end if;

  if old.status = 'approved'::public.payroll_status and new.status != 'paid'::public.payroll_status then
    raise exception 'Payroll records in Approved status cannot be modified.';
  end if;

  if old.status = 'paid'::public.payroll_status then
    raise exception 'Payroll records in Paid status cannot be modified.';
  end if;

  if current_user_role = 'hr'::public.user_role then
    if new.total_parcels is distinct from old.total_parcels or
       new.rate_per_parcel is distinct from old.rate_per_parcel or
       new.gross_pay is distinct from old.gross_pay or
       new.other_earnings is distinct from old.other_earnings or
       new.fm_pickup_count is distinct from old.fm_pickup_count or
       new.deductions is distinct from old.deductions or
       new.late_onhold is distinct from old.late_onhold or
       new.late_remittance is distinct from old.late_remittance or
       new.rider_id is distinct from old.rider_id or
       new.cutoff_start is distinct from old.cutoff_start or
       new.cutoff_end is distinct from old.cutoff_end 
    then
      raise exception 'HR cannot modify payroll computations or adjustments.';
    end if;
  end if;

  if old.status is distinct from new.status then
    if not (
      (old.status = 'draft'::public.payroll_status and new.status = 'pending'::public.payroll_status) or
      (old.status = 'rejected'::public.payroll_status and new.status = 'pending'::public.payroll_status) or
      (old.status = 'pending'::public.payroll_status and new.status = 'approved'::public.payroll_status) or
      (old.status = 'pending'::public.payroll_status and new.status = 'rejected'::public.payroll_status) or
      (old.status = 'pending'::public.payroll_status and new.status = 'draft'::public.payroll_status) or
      (old.status = 'approved'::public.payroll_status and new.status = 'paid'::public.payroll_status)
    ) then
      raise exception 'Invalid status transition: % → %.', initcap(old.status::text), initcap(new.status::text);
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_payroll_workflow_constraints on public.payroll_records;
create trigger trg_enforce_payroll_workflow_constraints
  before update on public.payroll_records
  for each row
  execute function public.enforce_payroll_workflow_constraints();

-- ============================================================
-- SECTION 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.zones enable row level security;
alter table public.riders enable row level security;
alter table public.users enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.violations enable row level security;
alter table public.rider_locations enable row level security;
alter table public.notifications enable row level security;
alter table public.user_devices enable row level security;
alter table public.payroll_records enable row level security;
alter table public.activity_logs enable row level security;
alter table public.parcel_logs enable row level security;
alter table public.parcel_correction_requests enable row level security;
alter table public.parcel_log_audit enable row level security;
alter table public.reviews enable row level security;

-- zones policies
drop policy if exists "All authenticated users can read zones" on public.zones;
create policy "All authenticated users can read zones"
  on public.zones for select
  using (auth.role() = 'authenticated');

drop policy if exists "Only admin can insert zones" on public.zones;
create policy "Only admin can insert zones"
  on public.zones for insert
  with check (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "Only admin can update zones" on public.zones;
create policy "Only admin can update zones"
  on public.zones for update
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "Only admin can delete zones" on public.zones;
create policy "Only admin can delete zones"
  on public.zones for delete
  using (public.get_my_role() = 'admin'::public.user_role);

-- riders policies
drop policy if exists "Admin and HR can read all riders" on public.riders;
create policy "Admin and HR can read all riders"
  on public.riders for select
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "Rider can read own record" on public.riders;
create policy "Rider can read own record"
  on public.riders for select
  using (id = public.get_my_rider_id());

drop policy if exists "Only admin can insert riders" on public.riders;
create policy "Only admin can insert riders"
  on public.riders for insert
  with check (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "HR can insert riders on profile" on public.riders;
create policy "HR can insert riders on profile"
  on public.riders for insert
  with check (public.get_my_role() = 'hr'::public.user_role);

drop policy if exists "Only admin can update riders" on public.riders;
create policy "Only admin can update riders"
  on public.riders for update
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "HR can update riders on profile" on public.riders;
create policy "HR can update riders on profile"
  on public.riders for update
  using (public.get_my_role() = 'hr'::public.user_role);

drop policy if exists "Only admin can delete riders" on public.riders;
create policy "Only admin can delete riders"
  on public.riders for delete
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "HR can delete riders on profile" on public.riders;
create policy "HR can delete riders on profile"
  on public.riders for delete
  using (public.get_my_role() = 'hr'::public.user_role);

drop policy if exists "Riders can update own record" on public.riders;
create policy "Riders can update own record"
  on public.riders for update
  using (id = public.get_my_rider_id());

-- users policies
drop policy if exists "Users can read own record" on public.users;
create policy "Users can read own record"
  on public.users for select
  using (id = auth.uid());

drop policy if exists "Admin and HR can read all users" on public.users;
create policy "Admin and HR can read all users"
  on public.users for select
  using (public.get_my_role() = any (array['admin'::public.user_role, 'hr'::public.user_role]));

drop policy if exists "Admin can insert users" on public.users;
create policy "Admin can insert users"
  on public.users for insert
  with check (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "HR can insert riders" on public.users;
create policy "HR can insert riders"
  on public.users for insert
  with check (public.get_my_role() = 'hr'::public.user_role and role = 'rider'::public.user_role);

drop policy if exists "Admin can update users" on public.users;
create policy "Admin can update users"
  on public.users for update
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "HR can update riders" on public.users;
create policy "HR can update riders"
  on public.users for update
  using (public.get_my_role() = 'hr'::public.user_role and role = 'rider'::public.user_role);

drop policy if exists "Admin can delete users" on public.users;
create policy "Admin can delete users"
  on public.users for delete
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "Users can update own record" on public.users;
create policy "Users can update own record"
  on public.users for update
  using (id = auth.uid());

-- attendance_logs policies (initial historical policies)
drop policy if exists "Admin and HR can read all attendance" on public.attendance_logs;
create policy "Admin and HR can read all attendance"
  on public.attendance_logs for select
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "Rider can read own attendance" on public.attendance_logs;
create policy "Rider can read own attendance"
  on public.attendance_logs for select
  using (rider_id = public.get_my_rider_id());

drop policy if exists "Rider can insert own attendance" on public.attendance_logs;
create policy "Rider can insert own attendance"
  on public.attendance_logs for insert
  with check (rider_id = public.get_my_rider_id());

drop policy if exists "Rider can update own attendance" on public.attendance_logs;
create policy "Rider can update own attendance"
  on public.attendance_logs for update
  using (rider_id = public.get_my_rider_id());

drop policy if exists "Admin and HR can update any attendance" on public.attendance_logs;
create policy "Admin and HR can update any attendance"
  on public.attendance_logs for update
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role));

-- violations policies
drop policy if exists "Admin and HR can read all violations" on public.violations;
create policy "Admin and HR can read all violations"
  on public.violations for select
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role));

drop policy if exists "Rider can read own violations" on public.violations;
create policy "Rider can read own violations"
  on public.violations for select
  using (rider_id = public.get_my_rider_id());

drop policy if exists "System can insert violations" on public.violations;
create policy "System can insert violations"
  on public.violations for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Admin and HR can update violations" on public.violations;
create policy "Admin and HR can update violations"
  on public.violations for update
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role));

-- rider_locations policies
drop policy if exists "Admin and HR can read all locations" on public.rider_locations;
create policy "Admin and HR can read all locations"
  on public.rider_locations for select
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role));

drop policy if exists "Rider can read own locations" on public.rider_locations;
create policy "Rider can read own locations"
  on public.rider_locations for select
  using (rider_id = public.get_my_rider_id());

drop policy if exists "Rider can insert own locations" on public.rider_locations;
create policy "Rider can insert own locations"
  on public.rider_locations for insert
  with check (rider_id = public.get_my_rider_id());

-- notifications policies
drop policy if exists "Users can read assigned or targeted notifications" on public.notifications;
create policy "Users can read assigned or targeted notifications"
  on public.notifications for select
  using (
    recipient_id = auth.uid()
    or (
      recipient_id is null
      and public.get_my_role() = any(target_roles)
    )
  );

drop policy if exists "System can insert notifications" on public.notifications;
create policy "System can insert notifications"
  on public.notifications for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Users can update assigned or targeted notifications" on public.notifications;
create policy "Users can update assigned or targeted notifications"
  on public.notifications for update
  using (
    recipient_id = auth.uid()
    or (
      recipient_id is null
      and public.get_my_role() = any(target_roles)
    )
  );

-- user_devices policies
drop policy if exists "Users can read own devices" on public.user_devices;
create policy "Users can read own devices"
  on public.user_devices for select
  using (user_id = auth.uid());

drop policy if exists "Admin and HR can manage all user devices" on public.user_devices;
create policy "Admin and HR can manage all user devices"
  on public.user_devices for all
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role))
  with check (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role));

-- payroll_records policies (from payroll_workflow_security.sql)
drop policy if exists "Payroll and Admin can read all payroll" on public.payroll_records;
create policy "Payroll and Admin can read all payroll"
  on public.payroll_records for select
  using (public.get_my_role() in ('admin'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "HR can read payroll records" on public.payroll_records;
create policy "HR can read payroll records"
  on public.payroll_records for select
  using (public.get_my_role() = 'hr'::public.user_role);

drop policy if exists "Payroll and Admin can insert payroll" on public.payroll_records;
create policy "Payroll and Admin can insert payroll"
  on public.payroll_records for insert
  with check (public.get_my_role() in ('admin'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "Admin update policy" on public.payroll_records;
create policy "Admin update policy"
  on public.payroll_records for update
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "Payroll update policy" on public.payroll_records;
create policy "Payroll update policy"
  on public.payroll_records for update
  using (public.get_my_role() = 'payroll'::public.user_role);

drop policy if exists "HR update policy" on public.payroll_records;
create policy "HR update policy"
  on public.payroll_records for update
  using (public.get_my_role() = 'hr'::public.user_role);

drop policy if exists "Riders can read own approved or paid payroll" on public.payroll_records;
create policy "Riders can read own approved or paid payroll"
  on public.payroll_records for select
  using (
    public.get_my_role() = 'rider'::public.user_role 
    and rider_id = (select rider_id from public.users where id = auth.uid())
    and status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
  );

-- activity_logs policies
drop policy if exists "Admin can read all activity logs" on public.activity_logs;
create policy "Admin can read all activity logs"
  on public.activity_logs for select
  using (public.get_my_role() = 'admin'::public.user_role);

drop policy if exists "HR can read activity logs" on public.activity_logs;
create policy "HR can read activity logs"
  on public.activity_logs for select
  using (public.get_my_role() = 'hr'::public.user_role);

drop policy if exists "All authenticated users can insert activity logs" on public.activity_logs;
create policy "All authenticated users can insert activity logs"
  on public.activity_logs for insert
  with check (auth.role() = 'authenticated');

-- parcel_logs policies
drop policy if exists "Operations, HR, Payroll and Admin can insert parcel logs" on public.parcel_logs;
create policy "Operations, HR, Payroll and Admin can insert parcel logs"
  on public.parcel_logs for insert
  with check (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "Operations, HR, Payroll and Admin can update parcel logs" on public.parcel_logs;
create policy "Operations, HR, Payroll and Admin can update parcel logs"
  on public.parcel_logs for update
  using (public.get_my_role() in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "Payroll and Admin can delete parcel logs" on public.parcel_logs;
create policy "Payroll and Admin can delete parcel logs"
  on public.parcel_logs for delete
  using (public.get_my_role() in ('admin'::public.user_role, 'payroll'::public.user_role));

drop policy if exists "Payroll and Admin can read all parcel logs" on public.parcel_logs;
create policy "Payroll and Admin can read all parcel logs"
  on public.parcel_logs for select
  using (public.get_my_role() in ('admin'::public.user_role, 'payroll'::public.user_role));

-- reviews policies (from create_reviews_table.sql)
drop policy if exists "Allow anonymous review insertion" on public.reviews;
create policy "Allow anonymous review insertion"
  on public.reviews for insert
  to anon, authenticated
  with check (status = 'pending');

drop policy if exists "Allow public to view approved reviews" on public.reviews;
create policy "Allow public to view approved reviews"
  on public.reviews for select
  to anon, authenticated
  using (status = 'approved' or (status = 'pending' and created_at >= now() - interval '30 seconds'));

drop policy if exists "Allow Admin and HR full control" on public.reviews;
create policy "Allow Admin and HR full control"
  on public.reviews for all
  to authenticated
  using (
    public.get_my_role() = 'admin'::public.user_role 
    or public.get_my_role() = 'hr'::public.user_role
  )
  with check (
    public.get_my_role() = 'admin'::public.user_role 
    or public.get_my_role() = 'hr'::public.user_role
  );
