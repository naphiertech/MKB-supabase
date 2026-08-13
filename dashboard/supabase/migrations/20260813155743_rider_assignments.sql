-- Controlled Rider home and operational assignment lifecycle.
-- riders.home_* is permanent; riders.hub_id/zone_id remains the current operational pair
-- used by the existing geofence, attendance, parcel, GPS, RLS, and realtime paths.

alter table public.riders
  add column home_hub_id uuid references public.hubs(id) on delete restrict,
  add column home_zone_id uuid references public.zones(id) on delete restrict;

update public.riders
set home_hub_id = hub_id,
    home_zone_id = zone_id;

comment on column public.riders.home_hub_id is
  'Permanent Home Hub. riders.hub_id is the current operational hub and may differ during a temporary deployment.';
comment on column public.riders.home_zone_id is
  'Permanent Home Zone. riders.zone_id is the current operational zone and may differ during a temporary deployment.';

create index riders_home_hub_id_idx on public.riders (home_hub_id);
create index riders_home_zone_id_idx on public.riders (home_zone_id);

create table public.rider_assignments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  assignment_type text not null check (assignment_type in ('permanent_transfer', 'temporary_deployment')),
  from_hub_id uuid references public.hubs(id) on delete restrict,
  from_zone_id uuid references public.zones(id) on delete restrict,
  target_hub_id uuid not null references public.hubs(id) on delete restrict,
  target_zone_id uuid not null references public.zones(id) on delete restrict,
  start_date date not null,
  end_date date,
  status text not null check (status in ('active', 'completed', 'ended_early', 'expired')),
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_by uuid references public.users(id) on delete restrict,
  ended_at timestamptz,
  end_reason text,
  constraint rider_assignments_dates_valid check (
    (assignment_type = 'permanent_transfer' and end_date is null and status = 'completed')
    or
    (assignment_type = 'temporary_deployment' and end_date is not null and end_date >= start_date)
  ),
  constraint rider_assignments_end_audit_valid check (
    (status <> 'ended_early' and ended_by is null and ended_at is null and end_reason is null)
    or
    (status = 'ended_early' and ended_by is not null and ended_at is not null and length(btrim(end_reason)) >= 3)
  )
);

comment on table public.rider_assignments is
  'Controlled history of permanent Rider transfers and temporary operational deployments. Historical operational rows retain their own snapshots.';

create index rider_assignments_rider_created_idx on public.rider_assignments (rider_id, created_at desc);
create index rider_assignments_target_hub_status_idx on public.rider_assignments (target_hub_id, status, end_date);
create unique index rider_assignments_one_active_deployment_idx
  on public.rider_assignments (rider_id)
  where assignment_type = 'temporary_deployment' and status = 'active';

alter table public.rider_assignments enable row level security;

create or replace function public.enforce_rider_assignment_history_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_zone_hub uuid;
  target_zone_hub uuid;
begin
  if new.from_zone_id is not null then
    select zone.hub_id into source_zone_hub from public.zones zone where zone.id = new.from_zone_id;
    if not found or source_zone_hub is distinct from new.from_hub_id then
      raise exception 'Source Hub and Source Zone must belong together.' using errcode = '23514';
    end if;
  elsif new.from_hub_id is not null then
    raise exception 'A Source Zone is required when a Source Hub is recorded.' using errcode = '23514';
  end if;

  select zone.hub_id into target_zone_hub from public.zones zone where zone.id = new.target_zone_id;
  if not found or target_zone_hub is distinct from new.target_hub_id then
    raise exception 'Target Hub and Target Zone must belong together.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_rider_assignment_history_consistency() from public, anon, authenticated, service_role;
create trigger trg_00_enforce_rider_assignment_history_consistency
before insert or update of from_hub_id, from_zone_id, target_hub_id, target_zone_id on public.rider_assignments
for each row execute function public.enforce_rider_assignment_history_consistency();

create or replace function public.enforce_rider_home_assignment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  home_zone_hub uuid;
begin
  if tg_op = 'INSERT' then
    new.home_hub_id := coalesce(new.home_hub_id, new.hub_id);
    new.home_zone_id := coalesce(new.home_zone_id, new.zone_id);
  end if;

  if new.home_zone_id is not null then
    select zone.hub_id into home_zone_hub
    from public.zones zone where zone.id = new.home_zone_id;
    if not found then
      raise exception 'Home Zone was not found.' using errcode = '23503';
    end if;
    if home_zone_hub is null or new.home_hub_id is distinct from home_zone_hub then
      raise exception 'Home Hub and Home Zone must belong together.' using errcode = '23514';
    end if;
  elsif new.home_hub_id is not null then
    raise exception 'A Home Zone is required when a Home Hub is assigned.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_rider_home_assignment_consistency() from public, anon, authenticated, service_role;
create trigger trg_01_enforce_rider_home_assignment
before insert or update of home_hub_id, home_zone_id on public.riders
for each row execute function public.enforce_rider_home_assignment_consistency();

create or replace function public.protect_rider_assignment_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role') and (
    new.hub_id is distinct from old.hub_id
    or new.zone_id is distinct from old.zone_id
    or new.home_hub_id is distinct from old.home_hub_id
    or new.home_zone_id is distinct from old.home_zone_id
  ) then
    raise exception 'Use Rider Assignments to change a Rider hub or zone.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_rider_assignment_columns() from public, anon, authenticated, service_role;
create trigger trg_02_protect_rider_assignment_columns
before update of hub_id, zone_id, home_hub_id, home_zone_id on public.riders
for each row execute function public.protect_rider_assignment_columns();

create or replace function private.actor_can_manage_rider_assignment(
  p_actor_id uuid,
  p_rider_id uuid,
  p_target_hub_id uuid
)
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
        and private.user_can_access_hub_for(actor.id, coalesce(rider.home_hub_id, rider.hub_id))
        and private.user_can_access_hub_for(actor.id, rider.hub_id)
        and private.user_can_access_hub_for(actor.id, p_target_hub_id)
      )
    from public.users actor
    join public.riders rider on rider.id = p_rider_id
    where actor.id = p_actor_id
      and actor.status = 'active'::public.user_status
      and actor.employment_status = 'active'::public.employment_status
  ), false)
$$;

revoke all on function private.actor_can_manage_rider_assignment(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create policy rider_assignments_staff_select
on public.rider_assignments for select to authenticated
using (
  (select public.get_my_role()) = 'admin'::public.user_role
  or (
    (select public.get_my_role()) = 'hr'::public.user_role
    and private.user_can_access_hub(from_hub_id)
    and private.user_can_access_hub(target_hub_id)
  )
);

grant select on public.rider_assignments to authenticated;
grant all on public.rider_assignments to service_role;
revoke insert, update, delete on public.rider_assignments from authenticated;

create or replace function public.refresh_rider_assignment_statuses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row public.rider_assignments%rowtype;
  refreshed integer := 0;
  business_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  for assignment_row in
    select assignment.*
    from public.rider_assignments assignment
    where assignment.assignment_type = 'temporary_deployment'
      and assignment.status = 'active'
      and assignment.end_date < business_date
    order by assignment.end_date, assignment.created_at
    for update
  loop
    update public.rider_assignments
    set status = 'expired', updated_at = clock_timestamp()
    where id = assignment_row.id;

    update public.riders rider
    set hub_id = rider.home_hub_id,
        zone_id = rider.home_zone_id
    where rider.id = assignment_row.rider_id
      and rider.hub_id is not distinct from assignment_row.target_hub_id
      and rider.zone_id is not distinct from assignment_row.target_zone_id;

    insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
    values (
      null,
      assignment_row.rider_id,
      'rider_deployment_expired',
      'Temporary deployment expired and the Rider operational assignment returned Home.',
      jsonb_build_object('assignment_id', assignment_row.id, 'scheduled_end_date', assignment_row.end_date)
    );

    refreshed := refreshed + 1;
  end loop;
  return refreshed;
end;
$$;

revoke all on function public.refresh_rider_assignment_statuses() from public, anon, authenticated, service_role;
grant execute on function public.refresh_rider_assignment_statuses() to postgres;

create or replace function private.assert_rider_assignment_request(
  p_rider_id uuid,
  p_target_hub_id uuid,
  p_target_zone_id uuid
)
returns public.riders
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_row public.riders%rowtype;
  zone_hub_id uuid;
  hub_active boolean;
  zone_active boolean;
begin
  perform public.refresh_rider_assignment_statuses();

  select rider.* into rider_row
  from public.riders rider where rider.id = p_rider_id for update;
  if not found then raise exception 'Rider was not found.' using errcode = 'P0002'; end if;

  if not private.actor_can_manage_rider_assignment((select auth.uid()), p_rider_id, p_target_hub_id) then
    raise exception 'You are not authorized to manage this Rider assignment or target hub.' using errcode = '42501';
  end if;

  select hub.active into hub_active from public.hubs hub where hub.id = p_target_hub_id;
  if not found then raise exception 'Target Hub was not found.' using errcode = '23503'; end if;
  if not hub_active then raise exception 'Target Hub must be active.' using errcode = '23514'; end if;

  select zone.hub_id, zone.status = 'active'::public.zone_status
  into zone_hub_id, zone_active
  from public.zones zone where zone.id = p_target_zone_id;
  if not found then raise exception 'Target Zone was not found.' using errcode = '23503'; end if;
  if zone_hub_id is distinct from p_target_hub_id then
    raise exception 'Target Zone must belong to the Target Hub.' using errcode = '23514';
  end if;
  if not zone_active then raise exception 'Target Zone must be active.' using errcode = '23514'; end if;

  if exists (
    select 1 from public.attendance_logs attendance
    where attendance.rider_id = p_rider_id
      and attendance.time_in is not null
      and attendance.time_out is null
  ) then
    raise exception 'Resolve the Rider open attendance session before changing assignments.' using errcode = 'P0001';
  end if;

  return rider_row;
end;
$$;

revoke all on function private.assert_rider_assignment_request(uuid, uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.transfer_rider_permanently(
  p_rider_id uuid,
  p_target_hub_id uuid,
  p_target_zone_id uuid,
  p_effective_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_row public.riders%rowtype;
  assignment_id uuid;
  business_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if p_effective_date is distinct from business_date then
    raise exception 'Permanent transfers must use today as the effective date.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A transfer reason is required.' using errcode = '22023';
  end if;

  rider_row := private.assert_rider_assignment_request(p_rider_id, p_target_hub_id, p_target_zone_id);
  if exists (
    select 1 from public.rider_assignments assignment
    where assignment.rider_id = p_rider_id
      and assignment.assignment_type = 'temporary_deployment'
      and assignment.status = 'active'
  ) then
    raise exception 'End the active temporary deployment before transferring this Rider permanently.' using errcode = '23514';
  end if;
  if rider_row.home_hub_id is not distinct from p_target_hub_id
     and rider_row.home_zone_id is not distinct from p_target_zone_id then
    raise exception 'The Rider is already assigned to this Home Hub and Home Zone.' using errcode = '23514';
  end if;

  insert into public.rider_assignments (
    rider_id, assignment_type, from_hub_id, from_zone_id, target_hub_id, target_zone_id,
    start_date, status, reason, created_by
  ) values (
    p_rider_id, 'permanent_transfer', coalesce(rider_row.home_hub_id, rider_row.hub_id),
    coalesce(rider_row.home_zone_id, rider_row.zone_id), p_target_hub_id, p_target_zone_id,
    p_effective_date, 'completed', btrim(p_reason), (select auth.uid())
  ) returning id into assignment_id;

  update public.riders
  set home_hub_id = p_target_hub_id,
      home_zone_id = p_target_zone_id,
      hub_id = p_target_hub_id,
      zone_id = p_target_zone_id
  where id = p_rider_id;

  insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
  values (
    (select auth.uid()), p_rider_id, 'rider_permanent_transfer',
    'Rider permanent Home Hub and Home Zone assignment changed.',
    jsonb_build_object('assignment_id', assignment_id, 'from_hub_id', rider_row.home_hub_id,
      'from_zone_id', rider_row.home_zone_id, 'target_hub_id', p_target_hub_id,
      'target_zone_id', p_target_zone_id, 'effective_date', p_effective_date, 'reason', btrim(p_reason))
  );
  return assignment_id;
end;
$$;

revoke all on function public.transfer_rider_permanently(uuid, uuid, uuid, date, text) from public, anon;
grant execute on function public.transfer_rider_permanently(uuid, uuid, uuid, date, text) to authenticated, service_role;

create or replace function public.deploy_rider_temporarily(
  p_rider_id uuid,
  p_target_hub_id uuid,
  p_target_zone_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rider_row public.riders%rowtype;
  assignment_id uuid;
  business_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if p_start_date is distinct from business_date then
    raise exception 'Temporary deployments must start today.' using errcode = '22023';
  end if;
  if p_end_date is null or p_end_date < p_start_date then
    raise exception 'Deployment End Date must be on or after Start Date.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A deployment reason is required.' using errcode = '22023';
  end if;

  rider_row := private.assert_rider_assignment_request(p_rider_id, p_target_hub_id, p_target_zone_id);
  if rider_row.home_hub_id is null or rider_row.home_zone_id is null then
    raise exception 'Assign a permanent Home Hub and Home Zone before deploying this Rider.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.rider_assignments assignment
    where assignment.rider_id = p_rider_id
      and assignment.assignment_type = 'temporary_deployment'
      and assignment.status = 'active'
  ) then
    raise exception 'This Rider already has an active temporary deployment.' using errcode = '23505';
  end if;
  if rider_row.home_hub_id is not distinct from p_target_hub_id
     and rider_row.home_zone_id is not distinct from p_target_zone_id then
    raise exception 'Temporary deployment must differ from the Home Hub or Home Zone.' using errcode = '23514';
  end if;

  insert into public.rider_assignments (
    rider_id, assignment_type, from_hub_id, from_zone_id, target_hub_id, target_zone_id,
    start_date, end_date, status, reason, created_by
  ) values (
    p_rider_id, 'temporary_deployment', rider_row.home_hub_id, rider_row.home_zone_id,
    p_target_hub_id, p_target_zone_id, p_start_date, p_end_date, 'active', btrim(p_reason), (select auth.uid())
  ) returning id into assignment_id;

  update public.riders
  set hub_id = p_target_hub_id, zone_id = p_target_zone_id
  where id = p_rider_id;

  insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
  values (
    (select auth.uid()), p_rider_id, 'rider_temporary_deployment',
    'Rider temporarily deployed to an operational Hub and Zone.',
    jsonb_build_object('assignment_id', assignment_id, 'home_hub_id', rider_row.home_hub_id,
      'home_zone_id', rider_row.home_zone_id, 'target_hub_id', p_target_hub_id,
      'target_zone_id', p_target_zone_id, 'start_date', p_start_date,
      'end_date', p_end_date, 'reason', btrim(p_reason))
  );
  return assignment_id;
end;
$$;

revoke all on function public.deploy_rider_temporarily(uuid, uuid, uuid, date, date, text) from public, anon;
grant execute on function public.deploy_rider_temporarily(uuid, uuid, uuid, date, date, text) to authenticated, service_role;

create or replace function public.extend_rider_deployment(
  p_assignment_id uuid,
  p_new_end_date date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row public.rider_assignments%rowtype;
begin
  perform public.refresh_rider_assignment_statuses();
  select assignment.* into assignment_row
  from public.rider_assignments assignment
  where assignment.id = p_assignment_id for update;
  if not found then raise exception 'Deployment was not found.' using errcode = 'P0002'; end if;
  if assignment_row.assignment_type <> 'temporary_deployment' or assignment_row.status <> 'active' then
    raise exception 'Only an active temporary deployment can be extended.' using errcode = '23514';
  end if;
  if not private.actor_can_manage_rider_assignment((select auth.uid()), assignment_row.rider_id, assignment_row.target_hub_id) then
    raise exception 'You are not authorized to extend this deployment.' using errcode = '42501';
  end if;
  if p_new_end_date <= assignment_row.end_date then
    raise exception 'New End Date must be later than the current End Date.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'An extension reason is required.' using errcode = '22023'; end if;

  update public.rider_assignments
  set end_date = p_new_end_date, updated_at = clock_timestamp()
  where id = p_assignment_id;

  insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
  values ((select auth.uid()), assignment_row.rider_id, 'rider_deployment_extended',
    'Rider temporary deployment extended.',
    jsonb_build_object('assignment_id', p_assignment_id, 'previous_end_date', assignment_row.end_date,
      'new_end_date', p_new_end_date, 'reason', btrim(p_reason)));
end;
$$;

revoke all on function public.extend_rider_deployment(uuid, date, text) from public, anon;
grant execute on function public.extend_rider_deployment(uuid, date, text) to authenticated, service_role;

create or replace function public.end_rider_deployment_early(
  p_assignment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_row public.rider_assignments%rowtype;
begin
  perform public.refresh_rider_assignment_statuses();
  select assignment.* into assignment_row
  from public.rider_assignments assignment
  where assignment.id = p_assignment_id for update;
  if not found then raise exception 'Deployment was not found.' using errcode = 'P0002'; end if;
  if assignment_row.assignment_type <> 'temporary_deployment' or assignment_row.status <> 'active' then
    raise exception 'Only an active temporary deployment can be ended early.' using errcode = '23514';
  end if;
  if not private.actor_can_manage_rider_assignment((select auth.uid()), assignment_row.rider_id, assignment_row.target_hub_id) then
    raise exception 'You are not authorized to end this deployment.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'An early-end reason is required.' using errcode = '22023'; end if;
  if exists (
    select 1 from public.attendance_logs attendance
    where attendance.rider_id = assignment_row.rider_id
      and attendance.time_in is not null and attendance.time_out is null
  ) then
    raise exception 'Resolve the Rider open attendance session before ending this deployment.' using errcode = 'P0001';
  end if;

  update public.rider_assignments
  set status = 'ended_early', ended_by = (select auth.uid()), ended_at = clock_timestamp(),
      end_reason = btrim(p_reason), updated_at = clock_timestamp()
  where id = p_assignment_id;

  update public.riders rider
  set hub_id = rider.home_hub_id, zone_id = rider.home_zone_id
  where rider.id = assignment_row.rider_id;

  insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
  values ((select auth.uid()), assignment_row.rider_id, 'rider_deployment_ended_early',
    'Rider temporary deployment ended early and operational assignment returned Home.',
    jsonb_build_object('assignment_id', p_assignment_id, 'reason', btrim(p_reason)));
end;
$$;

revoke all on function public.end_rider_deployment_early(uuid, text) from public, anon;
grant execute on function public.end_rider_deployment_early(uuid, text) to authenticated, service_role;

create or replace function public.get_rider_assignment_workspace(
  p_hub_id uuid default null,
  p_rider_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  actor_role public.user_role := (select public.get_my_role());
begin
  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'Only Admin and HR can view Rider Assignments.' using errcode = '42501';
  end if;
  if p_hub_id is not null and not private.user_can_access_hub(p_hub_id) then
    raise exception 'You are not authorized to view the requested Hub.' using errcode = '42501';
  end if;
  perform public.refresh_rider_assignment_statuses();

  with visible_riders as (
    select rider.*
    from public.riders rider
    left join public.users profile on profile.rider_id = rider.id
    where coalesce(profile.employment_status, 'active'::public.employment_status) = 'active'::public.employment_status
      and (p_rider_id is null or rider.id = p_rider_id)
      and (
        actor_role = 'admin'::public.user_role
        or private.user_can_access_hub(rider.home_hub_id)
        or private.user_can_access_hub(rider.hub_id)
      )
      and (p_hub_id is null or p_hub_id in (rider.home_hub_id, rider.hub_id))
  ), current_deployments as (
    select distinct on (assignment.rider_id) assignment.*
    from public.rider_assignments assignment
    join visible_riders rider on rider.id = assignment.rider_id
    where assignment.assignment_type = 'temporary_deployment' and assignment.status = 'active'
    order by assignment.rider_id, assignment.created_at desc
  ), latest_transfers as (
    select distinct on (assignment.rider_id) assignment.*
    from public.rider_assignments assignment
    join visible_riders rider on rider.id = assignment.rider_id
    where assignment.assignment_type = 'permanent_transfer'
    order by assignment.rider_id, assignment.start_date desc, assignment.created_at desc
  )
  select jsonb_build_object(
    'riders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id', rider.id, 'rider_name', rider.name, 'rider_code', rider.mkb_id,
        'rider_avatar', coalesce(nullif(rider.face_image_url, ''), nullif(rider.avatar_url, '')),
        'home_hub_id', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.home_hub_id) then rider.home_hub_id end,
        'home_hub_name', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.home_hub_id) then home_hub.name end,
        'operational_hub_id', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.hub_id) then rider.hub_id end,
        'operational_hub_name', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.hub_id) then operational_hub.name end,
        'home_zone_id', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.home_hub_id) then rider.home_zone_id end,
        'home_zone_name', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.home_hub_id) then home_zone.name end,
        'operational_zone_id', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.hub_id) then rider.zone_id end,
        'operational_zone_name', case when actor_role = 'admin'::public.user_role or private.user_can_access_hub(rider.hub_id) then operational_zone.name end,
        'assignment_id', deployment.id,
        'assignment_type', case
          when rider.home_hub_id is null or rider.home_zone_id is null then 'unassigned'
          when deployment.id is not null then 'temporary_deployment'
          when transfer.id is not null then 'permanent_transfer'
          else 'home_assignment' end,
        'start_date', coalesce(deployment.start_date, transfer.start_date),
        'end_date', deployment.end_date,
        'status', case
          when rider.home_hub_id is null or rider.home_zone_id is null then 'unassigned'
          when deployment.id is not null then deployment.status
          when transfer.id is not null then transfer.status
          else 'active' end
      ) order by rider.name)
      from visible_riders rider
      left join public.hubs home_hub on home_hub.id = rider.home_hub_id
      left join public.hubs operational_hub on operational_hub.id = rider.hub_id
      left join public.zones home_zone on home_zone.id = rider.home_zone_id
      left join public.zones operational_zone on operational_zone.id = rider.zone_id
      left join current_deployments deployment on deployment.rider_id = rider.id
      left join latest_transfers transfer on transfer.rider_id = rider.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id, 'rider_id', assignment.rider_id,
        'assignment_type', assignment.assignment_type,
        'from_hub_name', from_hub.name, 'from_zone_name', from_zone.name,
        'target_hub_name', target_hub.name, 'target_zone_name', target_zone.name,
        'start_date', assignment.start_date, 'end_date', assignment.end_date,
        'status', assignment.status, 'reason', assignment.reason,
        'created_by_name', creator.full_name, 'created_at', assignment.created_at,
        'ended_at', assignment.ended_at, 'end_reason', assignment.end_reason
      ) order by assignment.created_at desc)
      from public.rider_assignments assignment
      join visible_riders rider on rider.id = assignment.rider_id
      left join public.hubs from_hub on from_hub.id = assignment.from_hub_id
      left join public.zones from_zone on from_zone.id = assignment.from_zone_id
      join public.hubs target_hub on target_hub.id = assignment.target_hub_id
      join public.zones target_zone on target_zone.id = assignment.target_zone_id
      left join public.users creator on creator.id = assignment.created_by
      where actor_role = 'admin'::public.user_role
        or (
          private.user_can_access_hub(assignment.from_hub_id)
          and private.user_can_access_hub(assignment.target_hub_id)
        )
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_rider_assignment_workspace(uuid, uuid) from public, anon;
grant execute on function public.get_rider_assignment_workspace(uuid, uuid) to authenticated, service_role;

-- New public tables are not automatically exposed on current Supabase projects.
grant select on public.rider_assignments to authenticated;
grant all on public.rider_assignments to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'refresh-rider-assignment-statuses';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'refresh-rider-assignment-statuses',
    '* * * * *',
    'select public.refresh_rider_assignment_statuses();'
  );
end;
$$;
