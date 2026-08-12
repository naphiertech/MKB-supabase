-- Multi-Hub foundation (expand-only).
-- Existing zones intentionally remain unassigned. Real hubs are created by Admin later.

create schema if not exists private;
revoke all on schema private from public, anon;

create table public.hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index hubs_name_unique_idx on public.hubs (lower(btrim(name)));
create index hubs_active_name_idx on public.hubs (active, name);

alter table public.hubs enable row level security;

alter table public.users
  add column hub_access_scope text not null default 'global'
  constraint users_hub_access_scope_check check (hub_access_scope in ('global', 'assigned'));

comment on column public.users.hub_access_scope is
  'Staff workspace reach. Admin is always global; HR/Payroll may be global or explicitly assigned. Riders derive hub access from riders.hub_id.';

create table public.user_hub_access (
  user_id uuid not null references public.users(id) on delete cascade,
  hub_id uuid not null references public.hubs(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, hub_id)
);

create index user_hub_access_hub_user_idx on public.user_hub_access (hub_id, user_id);
alter table public.user_hub_access enable row level security;

alter table public.zones add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.riders add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.attendance_logs add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.rider_locations add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.parcel_logs add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.parcel_log_audit add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.parcel_correction_requests add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.payroll_records add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.payroll_delivery_lines add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.rider_documents add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.user_devices add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.violations add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.notifications add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.activity_logs add column hub_id uuid references public.hubs(id) on delete restrict;
alter table public.support_tickets add column hub_id uuid references public.hubs(id) on delete restrict;

create index zones_hub_id_idx on public.zones (hub_id);
create index riders_hub_id_idx on public.riders (hub_id);
create index attendance_logs_hub_date_idx on public.attendance_logs (hub_id, date desc);
create index rider_locations_hub_recorded_idx on public.rider_locations (hub_id, recorded_at desc);
create index parcel_logs_hub_date_idx on public.parcel_logs (hub_id, date desc);
create index parcel_log_audit_hub_timestamp_idx on public.parcel_log_audit (hub_id, "timestamp" desc);
create index parcel_correction_requests_hub_status_idx on public.parcel_correction_requests (hub_id, status);
create index payroll_records_hub_cutoff_idx on public.payroll_records (hub_id, cutoff_start desc, cutoff_end desc);
create index payroll_delivery_lines_hub_date_idx on public.payroll_delivery_lines (hub_id, date desc);
create index rider_documents_hub_id_idx on public.rider_documents (hub_id);
create index user_devices_hub_id_idx on public.user_devices (hub_id);
create index violations_hub_created_idx on public.violations (hub_id, created_at desc);
create index notifications_hub_created_idx on public.notifications (hub_id, created_at desc);
create index activity_logs_hub_created_idx on public.activity_logs (hub_id, created_at desc);
create index support_tickets_hub_updated_idx on public.support_tickets (hub_id, updated_at desc);

-- Backfill from the rider relationship only. No hub row is synthesized.
update public.riders r
set hub_id = z.hub_id
from public.zones z
where r.zone_id = z.id and r.hub_id is null and z.hub_id is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'attendance_logs', 'rider_locations', 'parcel_logs', 'parcel_log_audit',
    'parcel_correction_requests', 'payroll_records', 'payroll_delivery_lines',
    'rider_documents', 'user_devices', 'violations', 'notifications', 'activity_logs'
  ] loop
    execute format(
      'update public.%I child set hub_id = rider.hub_id from public.riders rider where child.rider_id = rider.id and child.hub_id is null',
      table_name
    );
  end loop;
end;
$$;

update public.support_tickets ticket
set hub_id = rider.hub_id
from public.users profile
join public.riders rider on rider.id = profile.rider_id
where ticket.created_by = profile.id and ticket.hub_id is null;

create or replace function private.user_can_access_hub_for(p_user_id uuid, p_hub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when profile.role = 'admin'::public.user_role then true
      when profile.role in ('hr'::public.user_role, 'payroll'::public.user_role)
           and profile.hub_access_scope = 'global' then true
      when profile.role in ('hr'::public.user_role, 'payroll'::public.user_role) then
        p_hub_id is not null and exists (
          select 1 from public.user_hub_access access
          where access.user_id = profile.id and access.hub_id = p_hub_id
        )
      when profile.role = 'rider'::public.user_role then exists (
        select 1 from public.riders rider
        where rider.id = profile.rider_id and rider.hub_id is not distinct from p_hub_id
      )
      else false
    end
    from public.users profile
    where profile.id = p_user_id
      and profile.employment_status = 'active'::public.employment_status
  ), false)
$$;

create or replace function private.user_can_access_hub(p_hub_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_can_access_hub_for((select auth.uid()), p_hub_id)
$$;

create or replace function private.user_can_access_rider(p_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select rider.id = (select public.get_my_rider_id())
      or private.user_can_access_hub(rider.hub_id)
    from public.riders rider
    where rider.id = p_rider_id
  ), false)
$$;

create or replace function private.user_can_access_user(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_target_user_id = (select auth.uid()) then true
    when (select public.get_my_role()) = 'admin'::public.user_role then true
    when exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.role in ('hr'::public.user_role, 'payroll'::public.user_role)
        and actor.hub_access_scope = 'global'
    ) then true
    else exists (
      select 1
      from public.users target
      left join public.riders rider on rider.id = target.rider_id
      where target.id = p_target_user_id
        and (
          (target.role = 'rider'::public.user_role and private.user_can_access_hub(rider.hub_id))
          or exists (
            select 1 from public.user_hub_access target_access
            where target_access.user_id = target.id
              and private.user_can_access_hub(target_access.hub_id)
          )
        )
    )
  end
$$;

create or replace function private.user_can_create_user(p_target_role public.user_role, p_target_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select public.get_my_role()) = 'admin'::public.user_role then true
    when (select public.get_my_role()) = 'hr'::public.user_role
      and p_target_role = 'rider'::public.user_role
      and private.user_can_access_rider(p_target_rider_id) then true
    else false
  end
$$;

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.user_can_access_hub(uuid) to authenticated, service_role;
grant execute on function private.user_can_access_rider(uuid) to authenticated, service_role;
grant execute on function private.user_can_access_user(uuid) to authenticated, service_role;
grant execute on function private.user_can_create_user(public.user_role, uuid) to authenticated, service_role;

create or replace function public.actor_can_manage_user_hub(p_actor_id uuid, p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select actor.role = 'admin'::public.user_role
      or (
        actor.role = 'hr'::public.user_role
        and target.role = 'rider'::public.user_role
        and private.user_can_access_hub_for(actor.id, rider.hub_id)
      )
    from public.users actor
    join public.users target on target.id = p_target_user_id
    left join public.riders rider on rider.id = target.rider_id
    where actor.id = p_actor_id
      and actor.status = 'active'::public.user_status
      and actor.employment_status = 'active'::public.employment_status
  ), false)
$$;

revoke all on function public.actor_can_manage_user_hub(uuid, uuid) from public, anon, authenticated;
grant execute on function public.actor_can_manage_user_hub(uuid, uuid) to service_role;

create or replace function public.enforce_hub_membership_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role public.user_role;
begin
  select role into target_role from public.users where id = new.user_id;
  if target_role not in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role) then
    raise exception 'Hub access memberships apply to staff accounts only.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_hub_membership_target() from public, anon, authenticated, service_role;
create trigger enforce_hub_membership_target
before insert or update on public.user_hub_access
for each row execute function public.enforce_hub_membership_target();

create or replace function public.protect_user_hub_access_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'rider'::public.user_role then
    new.hub_access_scope := 'assigned';
  elsif tg_op = 'UPDATE'
     and new.hub_access_scope is distinct from old.hub_access_scope
     and (select public.get_my_role()) <> 'admin'::public.user_role
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'Only Admin can change staff hub scope.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.role = 'rider'::public.user_role then
    delete from public.user_hub_access where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_user_hub_access_scope() from public, anon, authenticated, service_role;
create trigger protect_user_hub_access_scope
before insert or update on public.users
for each row execute function public.protect_user_hub_access_scope();

create or replace function public.enforce_rider_hub_zone_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_zone_hub uuid;
begin
  if new.zone_id is not null then
    select zone.hub_id into assigned_zone_hub from public.zones zone where zone.id = new.zone_id;
    if not found then raise exception 'Assigned zone was not found.' using errcode = '23503'; end if;
    if assigned_zone_hub is null then
      raise exception 'Assign the zone to a hub before assigning a Rider.' using errcode = '23514';
    end if;
    if new.hub_id is null then new.hub_id := assigned_zone_hub; end if;
    if new.hub_id is distinct from assigned_zone_hub then
      raise exception 'Rider and zone must belong to the same hub.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_rider_hub_zone_consistency() from public, anon, authenticated, service_role;
create trigger trg_00_enforce_rider_hub_zone
before insert or update of hub_id, zone_id on public.riders
for each row execute function public.enforce_rider_hub_zone_consistency();

create or replace function public.enforce_zone_hub_reassignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hub_id is distinct from old.hub_id and exists (
    select 1 from public.riders rider
    where rider.zone_id = new.id and rider.hub_id is distinct from new.hub_id
  ) then
    raise exception 'Move assigned Riders before changing this zone hub.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_zone_hub_reassignment() from public, anon, authenticated, service_role;
create trigger trg_00_enforce_zone_hub_reassignment
before update of hub_id on public.zones
for each row execute function public.enforce_zone_hub_reassignment();

create or replace function public.set_hub_snapshot_from_rider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_hub uuid;
begin
  if tg_op = 'UPDATE' and new.rider_id is not distinct from old.rider_id then
    if new.hub_id is distinct from old.hub_id then
      raise exception 'Historical hub assignment is immutable.' using errcode = '23514';
    end if;
    return new;
  end if;
  select rider.hub_id into rider_hub from public.riders rider where rider.id = new.rider_id;
  if not found then raise exception 'Rider was not found.' using errcode = '23503'; end if;
  if new.hub_id is not null and new.hub_id is distinct from rider_hub then
    raise exception 'Row hub must match the Rider hub.' using errcode = '23514';
  end if;
  new.hub_id := rider_hub;
  return new;
end;
$$;

revoke execute on function public.set_hub_snapshot_from_rider() from public, anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'attendance_logs', 'rider_locations', 'parcel_logs', 'parcel_log_audit',
    'parcel_correction_requests', 'payroll_records', 'payroll_delivery_lines',
    'rider_documents', 'user_devices', 'violations'
  ] loop
    execute format(
      'create trigger trg_00_set_hub_snapshot before insert or update of rider_id, hub_id on public.%I for each row execute function public.set_hub_snapshot_from_rider()',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.set_optional_hub_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_rider_id uuid;
  rider_hub uuid;
begin
  if tg_table_name = 'support_tickets' then
    select profile.rider_id into related_rider_id
    from public.users profile where profile.id = new.created_by;
  else
    related_rider_id := new.rider_id;
  end if;
  if related_rider_id is null and tg_table_name = 'activity_logs' and new.user_id is not null then
    select profile.rider_id into related_rider_id from public.users profile where profile.id = new.user_id;
  end if;
  if related_rider_id is null then return new; end if;
  select rider.hub_id into rider_hub from public.riders rider where rider.id = related_rider_id;
  if new.hub_id is not null and new.hub_id is distinct from rider_hub then
    raise exception 'Row hub must match the Rider hub.' using errcode = '23514';
  end if;
  new.hub_id := rider_hub;
  return new;
end;
$$;

revoke execute on function public.set_optional_hub_snapshot() from public, anon, authenticated, service_role;
create trigger trg_00_set_optional_hub_snapshot
before insert or update of rider_id, hub_id on public.notifications
for each row execute function public.set_optional_hub_snapshot();
create trigger trg_00_set_optional_hub_snapshot
before insert or update of rider_id, user_id, hub_id on public.activity_logs
for each row execute function public.set_optional_hub_snapshot();
create trigger trg_00_set_optional_hub_snapshot
before insert or update of created_by, hub_id on public.support_tickets
for each row execute function public.set_optional_hub_snapshot();

create or replace function public.set_hub_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then new.created_by := (select auth.uid()); end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_hub_audit_fields() from public, anon, authenticated, service_role;
create trigger hubs_audit_fields before insert or update on public.hubs
for each row execute function public.set_hub_audit_fields();

-- Hub directory and membership policies.
create policy hubs_select_authorized on public.hubs for select to authenticated
using (private.user_can_access_hub(id));
create policy hubs_admin_insert on public.hubs for insert to authenticated
with check ((select public.get_my_role()) = 'admin'::public.user_role);
create policy hubs_admin_update on public.hubs for update to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role)
with check ((select public.get_my_role()) = 'admin'::public.user_role);

create policy user_hub_access_select on public.user_hub_access for select to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role or user_id = (select auth.uid()));
create policy user_hub_access_admin_insert on public.user_hub_access for insert to authenticated
with check ((select public.get_my_role()) = 'admin'::public.user_role);
create policy user_hub_access_admin_update on public.user_hub_access for update to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role)
with check ((select public.get_my_role()) = 'admin'::public.user_role);
create policy user_hub_access_admin_delete on public.user_hub_access for delete to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role);

grant select, insert, update on public.hubs to authenticated;
grant select, insert, update, delete on public.user_hub_access to authenticated;
grant all on public.hubs, public.user_hub_access to service_role;

-- Restrictive hub guards compose with the existing role/workflow policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'zones', 'riders', 'attendance_logs', 'rider_locations', 'parcel_logs',
    'parcel_log_audit', 'parcel_correction_requests', 'payroll_records',
    'payroll_delivery_lines', 'rider_documents', 'user_devices', 'violations',
    'activity_logs'
  ] loop
    execute format(
      'create policy hub_scope_guard on public.%I as restrictive for all to authenticated using (private.user_can_access_hub(hub_id)) with check (private.user_can_access_hub(hub_id))',
      table_name
    );
  end loop;
end;
$$;

create policy notifications_hub_scope_guard on public.notifications
as restrictive for all to authenticated
using (hub_id is null or private.user_can_access_hub(hub_id))
with check (hub_id is null or private.user_can_access_hub(hub_id));

create policy support_tickets_hub_scope_guard on public.support_tickets
as restrictive for all to authenticated
using (hub_id is null or private.user_can_access_hub(hub_id))
with check (hub_id is null or private.user_can_access_hub(hub_id));

create policy users_hub_select_guard on public.users as restrictive for select to authenticated
using (private.user_can_access_user(id));
create policy users_hub_insert_guard on public.users as restrictive for insert to authenticated
with check (private.user_can_create_user(role, rider_id));
create policy users_hub_update_guard on public.users as restrictive for update to authenticated
using (private.user_can_access_user(id))
with check (private.user_can_access_user(id));
create policy users_hub_delete_guard on public.users as restrictive for delete to authenticated
using (private.user_can_access_user(id));

-- Attendance view now obeys base-table RLS and exposes the workspace key.
create or replace view public.v_attendance_summary
with (security_invoker = true)
as
select a.id,
       a.rider_id,
       r.name as rider_name,
       coalesce(nullif(r.face_image_url, ''), nullif(r.avatar_url, ''), '') as rider_avatar,
       coalesce(r.mkb_id, '') as rider_code,
       r.zone_id,
       coalesce(z.name, 'Unassigned') as zone_name,
       a.date,
       to_char(a.time_in at time zone 'Asia/Manila', 'HH24:MI') as time_in,
       to_char(a.time_out at time zone 'Asia/Manila', 'HH24:MI') as time_out,
       a.time_in as raw_time_in,
       a.time_out as raw_time_out,
       a.hours,
       a.notes,
       a.source,
       a.status as log_status,
       r.lat,
       r.lng,
       case
         when a.status = 'late'::public.attendance_status
           or (a.time_in at time zone 'Asia/Manila')::time > time '08:15' then 'Late'
         when a.time_in is not null and a.time_out is not null then 'Complete'
         when a.time_in is not null then 'Incomplete'
         else 'Absent'
       end as hr_status,
       a.hub_id
from public.attendance_logs a
left join public.riders r on r.id = a.rider_id
left join public.zones z on z.id = r.zone_id;

grant select on public.v_attendance_summary to authenticated;

-- SECURITY DEFINER read helpers must enforce the same hub boundary because they bypass table RLS.
drop function public.get_rider_workforce_directory();
create function public.get_rider_workforce_directory()
returns table(
  id uuid,
  name text,
  mkb_id text,
  zone_id uuid,
  zone_name text,
  hub_id uuid,
  employment_status public.employment_status,
  archive_effective_date date,
  restored_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select rider.id,
         rider.name,
         rider.mkb_id,
         rider.zone_id,
         zone.name,
         rider.hub_id,
         coalesce(profile.employment_status, 'active'::public.employment_status),
         profile.archive_effective_date,
         profile.restored_at
  from public.riders rider
  left join public.users profile on profile.rider_id = rider.id
  left join public.zones zone on zone.id = rider.zone_id
  where private.user_can_access_rider(rider.id)
  order by rider.name
$$;

revoke all on function public.get_rider_workforce_directory() from public, anon;
grant execute on function public.get_rider_workforce_directory() to authenticated, service_role;

create or replace function public.get_payroll_eligible_rider_ids(p_cutoff_start date, p_cutoff_end date)
returns table(rider_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select rider.id
  from public.riders rider
  where p_cutoff_start is not null
    and p_cutoff_end is not null
    and p_cutoff_start <= p_cutoff_end
    and (select public.get_my_role()) in (
      'admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role
    )
    and private.user_can_access_hub(rider.hub_id)
    and exists (
      select 1
      from generate_series(p_cutoff_start, p_cutoff_end, interval '1 day') business_day
      where public.is_rider_employed_on(rider.id, business_day::date)
    )
  order by rider.id
$$;

create or replace function public.bulk_approve_payroll_records(
  p_records jsonb,
  p_cutoff_start date,
  p_cutoff_end date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_to_recordset(p_records) selected(id uuid, updated_at timestamptz)
    join public.payroll_records payroll on payroll.id = selected.id
    where not private.user_can_access_hub(payroll.hub_id)
  ) then
    raise exception 'PAYROLL_BULK_UNAUTHORIZED: Selected payroll contains an unauthorized hub.' using errcode = '42501';
  end if;
  return public.execute_payroll_bulk_transition(
    'approve', p_records, p_cutoff_start, p_cutoff_end, p_request_id
  );
end;
$$;

create or replace function public.bulk_mark_payroll_records_paid(
  p_records jsonb,
  p_cutoff_start date,
  p_cutoff_end date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_to_recordset(p_records) selected(id uuid, updated_at timestamptz)
    join public.payroll_records payroll on payroll.id = selected.id
    where not private.user_can_access_hub(payroll.hub_id)
  ) then
    raise exception 'PAYROLL_BULK_UNAUTHORIZED: Selected payroll contains an unauthorized hub.' using errcode = '42501';
  end if;
  return public.execute_payroll_bulk_transition(
    'pay', p_records, p_cutoff_start, p_cutoff_end, p_request_id
  );
end;
$$;

create or replace function public.get_rider_route_summary(p_rider_id uuid, p_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.user_can_access_rider(p_rider_id) then
    raise exception 'You are not authorized to view this Rider route.' using errcode = '42501';
  end if;

  with points as (
    select location.lat,
           location.lng,
           location.speed,
           location.recorded_at,
           lag(location.lat) over (order by location.recorded_at) as prev_lat,
           lag(location.lng) over (order by location.recorded_at) as prev_lng
    from public.rider_locations location
    where location.rider_id = p_rider_id
      and (location.recorded_at at time zone 'Asia/Manila')::date = p_date
    order by location.recorded_at
  ),
  distances as (
    select points.*,
           case when prev_lat is not null then
             6371000 * 2 * asin(sqrt(
               power(sin(radians(lat - prev_lat) / 2), 2)
               + cos(radians(prev_lat)) * cos(radians(lat))
               * power(sin(radians(lng - prev_lng) / 2), 2)
             ))
           else 0 end as dist_meters
    from points
  ),
  summary as (
    select count(*) as point_count,
           round((sum(dist_meters) / 1000.0)::numeric, 2) as total_distance_km,
           round(coalesce(avg(speed), 0)::numeric, 1) as avg_speed_kph,
           min(recorded_at) as start_time,
           max(recorded_at) as end_time,
           round(greatest(1, extract(epoch from (max(recorded_at) - min(recorded_at))) / 60.0)::numeric, 0) as duration_minutes
    from distances
  )
  select row_to_json(summary)::jsonb into result from summary;
  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_rider_route_summary(uuid, date) from public, anon;
grant execute on function public.get_rider_route_summary(uuid, date) to authenticated, service_role;

create or replace function public.get_executive_analytics_summary(
  p_start_date date default (current_date - interval '14 days')::date,
  p_end_date date default current_date,
  p_zone_id text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select public.get_my_role()) not in (
    'admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role
  ) then
    raise exception 'Staff access is required.' using errcode = '42501';
  end if;

  with filtered_logs as (
    select attendance.*, rider.zone_id, zone.name as zone_name
    from public.attendance_logs attendance
    left join public.riders rider on rider.id = attendance.rider_id
    left join public.zones zone on zone.id = rider.zone_id
    where attendance.date between p_start_date and p_end_date
      and private.user_can_access_hub(attendance.hub_id)
      and (p_zone_id = 'all' or rider.zone_id = nullif(p_zone_id, 'all')::uuid)
  ),
  daily_rates as (
    select date,
           count(*) as total_records,
           count(*) filter (where time_in is not null) as present_records,
           round((count(*) filter (where time_in is not null))::numeric / greatest(count(*), 1) * 100, 1) as attendance_rate
    from filtered_logs
    group by date
    order by date
  ),
  zone_hours as (
    select coalesce(zone_name, 'Unassigned') as zone_name,
           round(sum(coalesce(hours, 0))::numeric, 1) as total_hours
    from filtered_logs
    group by coalesce(zone_name, 'Unassigned')
    order by total_hours desc
  ),
  status_counts as (
    select count(*) filter (where time_in is not null and time_out is not null) as present_count,
           count(*) filter (where (time_in at time zone 'Asia/Manila')::time > time '08:15') as late_count,
           count(*) filter (where time_in is null) as absent_count,
           count(*) filter (where notes ilike '%leave%') as leave_count
    from filtered_logs
  )
  select jsonb_build_object(
    'daily_rates', coalesce(jsonb_agg(daily_rates), '[]'::jsonb),
    'zone_hours', (select coalesce(jsonb_agg(zone_hours), '[]'::jsonb) from zone_hours),
    'status_summary', (select row_to_json(status_counts)::jsonb from status_counts)
  ) into result
  from daily_rates;
  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_executive_analytics_summary(date, date, text) from public, anon;
grant execute on function public.get_executive_analytics_summary(date, date, text) to authenticated, service_role;

create or replace function public.cache_rider_face_descriptor(p_rider_id uuid, p_descriptor jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
     and private.user_can_access_rider(p_rider_id) then
    update public.riders
    set face_descriptor = p_descriptor, face_registered_at = now()
    where id = p_rider_id and face_descriptor is null;
  elsif p_rider_id = (select public.get_my_rider_id())
    and public.is_rider_account_operational((select auth.uid())) then
    update public.riders
    set face_descriptor = p_descriptor, face_registered_at = now()
    where id = p_rider_id and face_descriptor is null;
  else
    raise exception 'Restricted, archived, or unauthorized Riders cannot change workforce profile data.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.storage_rider_path_is_authorized(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_parts text[] := storage.foldername(p_name);
begin
  if path_parts[1] <> 'riders'
     or path_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.user_can_access_rider(path_parts[2]::uuid);
end;
$$;

revoke all on function private.storage_rider_path_is_authorized(text) from public, anon;
grant execute on function private.storage_rider_path_is_authorized(text) to authenticated, service_role;

drop policy if exists "Admin and HR can read rider document files" on storage.objects;
drop policy if exists "Admin and HR can upload rider document files" on storage.objects;
drop policy if exists "Admin and HR can replace rider document files" on storage.objects;
drop policy if exists "Admin and HR can delete rider document files" on storage.objects;

create policy "Admin and HR can read rider document files"
on storage.objects for select to authenticated
using (
  bucket_id = 'rider-documents'
  and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and private.storage_rider_path_is_authorized(name)
);

create policy "Admin and HR can upload rider document files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'rider-documents'
  and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and private.storage_rider_path_is_authorized(name)
  and (
    (array_length(storage.foldername(name), 1) = 2 and storage.filename(name) in (
      'drivers_license', 'government_id', 'vehicle_registration', 'insurance',
      'nbi_or_police_clearance', 'employment_contract', 'medical_certificate'
    ))
    or (
      array_length(storage.foldername(name), 1) = 3
      and (storage.foldername(name))[3] = 'other'
      and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  )
);

create policy "Admin and HR can replace rider document files"
on storage.objects for update to authenticated
using (
  bucket_id = 'rider-documents'
  and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and private.storage_rider_path_is_authorized(name)
)
with check (
  bucket_id = 'rider-documents'
  and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and private.storage_rider_path_is_authorized(name)
  and (
    (array_length(storage.foldername(name), 1) = 2 and storage.filename(name) in (
      'drivers_license', 'government_id', 'vehicle_registration', 'insurance',
      'nbi_or_police_clearance', 'employment_contract', 'medical_certificate'
    ))
    or (
      array_length(storage.foldername(name), 1) = 3
      and (storage.foldername(name))[3] = 'other'
      and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  )
);

create policy "Admin and HR can delete rider document files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'rider-documents'
  and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and private.storage_rider_path_is_authorized(name)
);

create or replace function public.admin_set_user_hub_access(
  p_user_id uuid,
  p_scope text,
  p_hub_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_role public.user_role;
begin
  if (select public.get_my_role()) <> 'admin'::public.user_role then
    raise exception 'Only Admin can manage staff hub access.' using errcode = '42501';
  end if;
  if p_scope not in ('global', 'assigned') then
    raise exception 'Hub access scope must be global or assigned.' using errcode = '22023';
  end if;

  select role into target_role from public.users where id = p_user_id;
  if not found then raise exception 'User was not found.' using errcode = 'P0002'; end if;
  if target_role = 'rider'::public.user_role then
    raise exception 'Rider hub access comes from the Rider assignment.' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_hub_ids, '{}'::uuid[])) requested(hub_id)
    left join public.hubs hub on hub.id = requested.hub_id
    where hub.id is null
  ) then
    raise exception 'One or more selected hubs do not exist.' using errcode = '23503';
  end if;

  update public.users set hub_access_scope = p_scope where id = p_user_id;
  delete from public.user_hub_access where user_id = p_user_id;
  if p_scope = 'assigned' then
    insert into public.user_hub_access (user_id, hub_id, assigned_by)
    select p_user_id, requested.hub_id, (select auth.uid())
    from (select distinct unnest(coalesce(p_hub_ids, '{}'::uuid[])) as hub_id) requested;
  end if;
end;
$$;

revoke all on function public.admin_set_user_hub_access(uuid, text, uuid[]) from public, anon;
grant execute on function public.admin_set_user_hub_access(uuid, text, uuid[]) to authenticated, service_role;

create or replace function public.admin_set_zone_hub(p_zone_id uuid, p_hub_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select public.get_my_role()) <> 'admin'::public.user_role then
    raise exception 'Only Admin can manage zone hub assignments.' using errcode = '42501';
  end if;
  update public.zones set hub_id = p_hub_id where id = p_zone_id;
  if not found then raise exception 'Zone was not found.' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.admin_set_zone_hub(uuid, uuid) from public, anon;
grant execute on function public.admin_set_zone_hub(uuid, uuid) to authenticated, service_role;

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

-- Privileged lifecycle entry points keep every existing archive/restriction rule,
-- but now reject an actor outside the target Rider's hub before any mutation.
alter function public.transition_employee_lifecycle(uuid, uuid, text, date, text, text, uuid)
  rename to transition_employee_lifecycle_authorized_internal;
revoke all on function public.transition_employee_lifecycle_authorized_internal(uuid, uuid, text, date, text, text, uuid)
  from public, anon, authenticated, service_role;

create function public.transition_employee_lifecycle(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_effective_date date,
  p_reason text,
  p_remarks text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.actor_can_manage_user_hub(p_actor_id, p_target_user_id) then
    raise exception 'You are not authorized to manage users in this hub.' using errcode = '42501';
  end if;
  return public.transition_employee_lifecycle_authorized_internal(
    p_actor_id, p_target_user_id, p_action, p_effective_date, p_reason, p_remarks, p_request_id
  );
end;
$$;

revoke all on function public.transition_employee_lifecycle(uuid, uuid, text, date, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_employee_lifecycle(uuid, uuid, text, date, text, text, uuid)
  to service_role;

alter function public.transition_rider_account_access(uuid, uuid, text, uuid)
  rename to transition_rider_account_access_authorized_internal;
revoke all on function public.transition_rider_account_access_authorized_internal(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

create function public.transition_rider_account_access(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.actor_can_manage_user_hub(p_actor_id, p_target_user_id) then
    raise exception 'You are not authorized to manage users in this hub.' using errcode = '42501';
  end if;
  return public.transition_rider_account_access_authorized_internal(
    p_actor_id, p_target_user_id, p_action, p_request_id
  );
end;
$$;

revoke all on function public.transition_rider_account_access(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_rider_account_access(uuid, uuid, text, uuid)
  to service_role;
