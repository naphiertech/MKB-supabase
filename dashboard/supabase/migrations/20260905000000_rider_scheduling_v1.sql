-- Rider Scheduling V1
-- Planning data only. This migration intentionally does not change attendance,
-- payroll, biometric, GPS, assignment, or SyncEngine behavior.

create type public.rider_schedule_day_kind as enum ('work', 'day_off');
create type public.rider_schedule_status as enum ('draft', 'published', 'cancelled');

create table public.rider_schedules (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  work_date date not null,
  -- A day-off still belongs to the operational Hub being planned. This keeps
  -- staff scope deterministic without deriving historical data from riders.hub_id.
  hub_id uuid not null references public.hubs(id) on delete restrict,
  day_kind public.rider_schedule_day_kind not null,
  starts_at time without time zone,
  ends_at time without time zone,
  status public.rider_schedule_status not null default 'draft',
  revision integer not null default 1,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  published_by uuid references public.users(id) on delete restrict,
  published_at timestamptz,
  cancelled_by uuid references public.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  constraint rider_schedules_one_per_rider_date unique (rider_id, work_date),
  constraint rider_schedules_revision_positive check (revision > 0),
  constraint rider_schedules_work_window_check check (
    (day_kind = 'work'::public.rider_schedule_day_kind
      and starts_at is not null
      and ends_at is not null
      and starts_at < ends_at)
    or
    (day_kind = 'day_off'::public.rider_schedule_day_kind
      and starts_at is null
      and ends_at is null)
  ),
  constraint rider_schedules_publication_pair_check check (
    (published_by is null) = (published_at is null)
  ),
  constraint rider_schedules_draft_unpublished_check check (
    status <> 'draft'::public.rider_schedule_status
    or (published_by is null and published_at is null)
  ),
  constraint rider_schedules_published_check check (
    status <> 'published'::public.rider_schedule_status
    or (published_by is not null and published_at is not null)
  ),
  constraint rider_schedules_cancellation_pair_check check (
    (cancelled_by is null) = (cancelled_at is null)
  ),
  constraint rider_schedules_cancellation_state_check check (
    (
      status = 'cancelled'::public.rider_schedule_status
      and cancelled_by is not null
      and cancelled_at is not null
      and nullif(btrim(cancellation_reason), '') is not null
    )
    or
    (
      status <> 'cancelled'::public.rider_schedule_status
      and cancelled_by is null
      and cancelled_at is null
      and cancellation_reason is null
    )
  )
);

comment on table public.rider_schedules is
  'One dated Rider work or day-off plan per Asia/Manila business date. Planning data only.';
comment on column public.rider_schedules.work_date is
  'Asia/Manila business date; this is a date value, not a UTC-derived timestamp.';
comment on column public.rider_schedules.hub_id is
  'Planned operational Hub for this work date; historical rows retain this value.';
comment on column public.rider_schedules.starts_at is
  'Planned local Manila time for a work day; null for a day off.';
comment on column public.rider_schedules.ends_at is
  'Planned local Manila time for a work day; null for a day off.';

create index rider_schedules_hub_date_status_idx
  on public.rider_schedules (hub_id, work_date, status);

create table public.rider_schedule_audit_events (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.rider_schedules(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  revision integer not null,
  action text not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  reason text not null,
  old_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now(),
  constraint rider_schedule_audit_action_check check (
    action in ('created', 'updated', 'published', 'cancelled')
  ),
  constraint rider_schedule_audit_revision_positive check (revision > 0),
  constraint rider_schedule_audit_reason_check check (nullif(btrim(reason), '') is not null),
  constraint rider_schedule_audit_one_event_per_revision unique (schedule_id, revision)
);

comment on table public.rider_schedule_audit_events is
  'Immutable before/after history for Rider Scheduling transitions.';

create index rider_schedule_audit_schedule_created_idx
  on public.rider_schedule_audit_events (schedule_id, created_at desc);
create index rider_schedule_audit_hub_created_idx
  on public.rider_schedule_audit_events (hub_id, created_at desc);

create or replace function private.guard_rider_schedule_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rider schedules cannot be deleted; cancel the schedule instead.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.rider_id is distinct from old.rider_id
     or new.work_date is distinct from old.work_date
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Rider schedule identity and creation history are immutable.'
      using errcode = '23514';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Rider schedule revision must advance by exactly one.'
      using errcode = '40001';
  end if;

  if old.status = 'cancelled'::public.rider_schedule_status then
    raise exception 'Cancelled Rider schedules are immutable.'
      using errcode = '23514';
  end if;

  if old.status = 'draft'::public.rider_schedule_status
     and new.status not in (
       'draft'::public.rider_schedule_status,
       'published'::public.rider_schedule_status,
       'cancelled'::public.rider_schedule_status
     ) then
    raise exception 'Invalid Rider schedule lifecycle transition from draft.'
      using errcode = '23514';
  end if;

  if old.status = 'published'::public.rider_schedule_status
     and new.status not in (
       'published'::public.rider_schedule_status,
       'cancelled'::public.rider_schedule_status
     ) then
    raise exception 'Invalid Rider schedule lifecycle transition from published.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger rider_schedules_lifecycle_guard
before update or delete on public.rider_schedules
for each row execute function private.guard_rider_schedule_lifecycle();

create trigger rider_schedules_updated_at
before update on public.rider_schedules
for each row execute function public.handle_updated_at();

create or replace function private.prevent_rider_schedule_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Rider schedule audit history is immutable.' using errcode = '42501';
end;
$$;

create trigger rider_schedule_audit_immutable
before update or delete on public.rider_schedule_audit_events
for each row execute function private.prevent_rider_schedule_audit_mutation();

create or replace function private.assert_rider_schedule_manager(p_hub_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
begin
  if actor_id is null or actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'Only Admin and HR can manage Rider schedules.' using errcode = '42501';
  end if;

  if p_hub_id is null or not private.user_can_access_hub(p_hub_id) then
    raise exception 'You are not authorized to manage schedules for this Hub.' using errcode = '42501';
  end if;

  return actor_id;
end;
$$;

create or replace function private.assert_rider_schedule_fields(
  p_day_kind public.rider_schedule_day_kind,
  p_starts_at time,
  p_ends_at time
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_day_kind = 'work'::public.rider_schedule_day_kind then
    if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
      raise exception 'Work schedules require a same-day start time before the end time.'
        using errcode = '22023';
    end if;
  elsif p_day_kind = 'day_off'::public.rider_schedule_day_kind then
    if p_starts_at is not null or p_ends_at is not null then
      raise exception 'Day-off schedules cannot contain a working interval.'
        using errcode = '22023';
    end if;
  else
    raise exception 'Unsupported Rider schedule day kind.' using errcode = '22023';
  end if;
end;
$$;

-- Assignment history is date-effective even though riders.hub_id is the live
-- operational value. Permanent transfers provide the base hub; a temporary
-- deployment overlays that base only for its effective date range.
create or replace function private.resolve_rider_schedule_hub(
  p_rider_id uuid,
  p_work_date date
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with rider_base as (
    select
      rider.id,
      coalesce(
        (
          select assignment.target_hub_id
          from public.rider_assignments assignment
          where assignment.rider_id = rider.id
            and assignment.assignment_type = 'permanent_transfer'
            and assignment.start_date <= p_work_date
          order by assignment.start_date desc, assignment.created_at desc
          limit 1
        ),
        (
          select assignment.from_hub_id
          from public.rider_assignments assignment
          where assignment.rider_id = rider.id
            and assignment.assignment_type = 'permanent_transfer'
            and assignment.from_hub_id is not null
          order by assignment.start_date, assignment.created_at
          limit 1
        ),
        rider.home_hub_id,
        rider.hub_id
      ) as base_hub_id
    from public.riders rider
    where rider.id = p_rider_id
  ),
  temporary_hub as (
    select assignment.target_hub_id
    from public.rider_assignments assignment
    where assignment.rider_id = p_rider_id
      and assignment.assignment_type = 'temporary_deployment'
      and assignment.status in ('active', 'completed', 'expired', 'ended_early')
      and assignment.start_date <= p_work_date
      and p_work_date <= coalesce(
        case
          when assignment.status = 'ended_early'::text and assignment.ended_at is not null
            then (assignment.ended_at at time zone 'Asia/Manila')::date
          else null
        end,
        assignment.end_date
      )
    order by assignment.start_date desc, assignment.created_at desc
    limit 1
  )
  select coalesce(temporary_hub.target_hub_id, rider_base.base_hub_id)
  from rider_base
  left join temporary_hub on true;
$$;

create or replace function private.assert_rider_schedule_context(
  p_rider_id uuid,
  p_hub_id uuid,
  p_work_date date,
  p_require_employed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_hub_id uuid;
  business_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  hub_is_active boolean;
begin
  if p_work_date is null then
    raise exception 'A schedule business date is required.' using errcode = '22023';
  end if;

  if p_rider_id is null or not exists (
    select 1 from public.riders rider where rider.id = p_rider_id
  ) then
    raise exception 'Rider was not found.' using errcode = '23503';
  end if;

  if p_hub_id is null or not exists (
    select 1 from public.hubs hub where hub.id = p_hub_id
  ) then
    raise exception 'Hub was not found.' using errcode = '23503';
  end if;

  if p_require_employed and not public.is_rider_employed_on(p_rider_id, p_work_date) then
    raise exception 'The Rider was not employed on the requested business date.'
      using errcode = '23514';
  end if;

  select hub.active into hub_is_active
  from public.hubs hub
  where hub.id = p_hub_id;

  if p_work_date >= business_date and not hub_is_active then
    raise exception 'A current or future schedule requires an active Hub.'
      using errcode = '23514';
  end if;

  expected_hub_id := private.resolve_rider_schedule_hub(p_rider_id, p_work_date);
  if expected_hub_id is null then
    raise exception 'The Rider has no date-effective operational Hub for the requested business date.'
      using errcode = '23514';
  end if;

  if expected_hub_id is distinct from p_hub_id then
    raise exception 'SCHEDULE_HUB_MISMATCH: The planned Hub does not match the Rider assignment context for this business date.'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function private.notify_rider_schedule(
  p_schedule public.rider_schedules,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  notification_title text;
  notification_message text;
begin
  select profile.id into recipient_id
  from public.users profile
  where profile.rider_id = p_schedule.rider_id
    and profile.role = 'rider'::public.user_role
  order by profile.created_at
  limit 1;

  if recipient_id is null then
    return;
  end if;

  notification_title := case p_event
    when 'published' then 'Schedule published'
    when 'updated' then 'Schedule updated'
    when 'cancelled' then 'Schedule cancelled'
    else 'Schedule changed'
  end;

  notification_message := case p_event
    when 'published' then 'Your Rider schedule is now published.'
    when 'updated' then 'Your published Rider schedule has changed.'
    when 'cancelled' then 'Your Rider schedule has been cancelled.'
    else 'Your Rider schedule has changed.'
  end;

  -- Keep rider_id and hub_id null here. Existing notification snapshot logic
  -- derives hub_id from the Rider's current assignment, which is not the
  -- historical planned Hub stored on this schedule. Direct recipient access
  -- keeps this notification private without rewriting its historical scope.
  insert into public.notifications (
    sender_id,
    type,
    category,
    priority,
    title,
    message,
    recipient_id,
    rider_id,
    hub_id,
    action_link,
    metadata,
    read,
    target_roles
  ) values (
    (select auth.uid()),
    'system'::public.notification_type,
    'system'::public.notification_category,
    'medium'::public.notification_priority,
    notification_title,
    notification_message,
    recipient_id,
    null,
    null,
    '/rider/schedule',
    jsonb_build_object(
      'event', p_event,
      'schedule_id', p_schedule.id,
      'revision', p_schedule.revision,
      'work_date', p_schedule.work_date,
      'day_kind', p_schedule.day_kind
    ),
    false,
    array['rider'::public.user_role]
  );
end;
$$;

create or replace function public.create_rider_schedule(
  p_rider_id uuid,
  p_work_date date,
  p_hub_id uuid,
  p_day_kind public.rider_schedule_day_kind,
  p_starts_at time,
  p_ends_at time,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  schedule_row public.rider_schedules%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  actor_id := private.assert_rider_schedule_manager(p_hub_id);
  perform private.assert_rider_schedule_fields(p_day_kind, p_starts_at, p_ends_at);
  if length(trimmed_reason) < 3 then
    raise exception 'A schedule reason of at least three characters is required.' using errcode = '22023';
  end if;
  perform private.assert_rider_schedule_context(p_rider_id, p_hub_id, p_work_date, true);

  insert into public.rider_schedules (
    rider_id, work_date, hub_id, day_kind, starts_at, ends_at,
    status, revision, created_by, updated_by
  ) values (
    p_rider_id, p_work_date, p_hub_id, p_day_kind, p_starts_at, p_ends_at,
    'draft'::public.rider_schedule_status, 1, actor_id, actor_id
  ) returning * into schedule_row;

  insert into public.rider_schedule_audit_events (
    schedule_id, rider_id, hub_id, revision, action, actor_id, reason,
    old_values, new_values
  ) values (
    schedule_row.id, schedule_row.rider_id, schedule_row.hub_id, schedule_row.revision,
    'created', actor_id, trimmed_reason, null, to_jsonb(schedule_row)
  );

  return schedule_row.id;
exception
  when unique_violation then
    raise exception 'SCHEDULE_ALREADY_EXISTS: This Rider already has a schedule for the requested business date.'
      using errcode = '23505';
end;
$$;

create or replace function public.update_rider_schedule(
  p_schedule_id uuid,
  p_expected_revision integer,
  p_hub_id uuid,
  p_day_kind public.rider_schedule_day_kind,
  p_starts_at time,
  p_ends_at time,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  schedule_row public.rider_schedules%rowtype;
  updated_row public.rider_schedules%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  select schedule.* into schedule_row
  from public.rider_schedules schedule
  where schedule.id = p_schedule_id
  for update;

  if not found then
    raise exception 'Rider schedule was not found.' using errcode = 'P0002';
  end if;

  actor_id := private.assert_rider_schedule_manager(schedule_row.hub_id);
  if schedule_row.hub_id is distinct from p_hub_id then
    perform private.assert_rider_schedule_manager(p_hub_id);
  end if;
  if p_expected_revision is distinct from schedule_row.revision then
    raise exception 'SCHEDULE_REVISION_CONFLICT: The schedule changed in another session. Reload before saving.'
      using errcode = '40001';
  end if;
  if schedule_row.status = 'cancelled'::public.rider_schedule_status then
    raise exception 'Cancelled Rider schedules cannot be edited.' using errcode = '23514';
  end if;

  perform private.assert_rider_schedule_fields(p_day_kind, p_starts_at, p_ends_at);
  if length(trimmed_reason) < 3 then
    raise exception 'A schedule reason of at least three characters is required.' using errcode = '22023';
  end if;
  perform private.assert_rider_schedule_context(schedule_row.rider_id, p_hub_id, schedule_row.work_date, true);

  if schedule_row.hub_id is not distinct from p_hub_id
     and schedule_row.day_kind is not distinct from p_day_kind
     and schedule_row.starts_at is not distinct from p_starts_at
     and schedule_row.ends_at is not distinct from p_ends_at then
    raise exception 'The schedule has no material changes.' using errcode = '22023';
  end if;

  update public.rider_schedules
  set hub_id = p_hub_id,
      day_kind = p_day_kind,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      revision = schedule_row.revision + 1,
      updated_by = actor_id,
      updated_at = clock_timestamp()
  where id = schedule_row.id
  returning * into updated_row;

  insert into public.rider_schedule_audit_events (
    schedule_id, rider_id, hub_id, revision, action, actor_id, reason,
    old_values, new_values
  ) values (
    updated_row.id, updated_row.rider_id, updated_row.hub_id, updated_row.revision,
    'updated', actor_id, trimmed_reason, to_jsonb(schedule_row), to_jsonb(updated_row)
  );

  if schedule_row.status = 'published'::public.rider_schedule_status then
    perform private.notify_rider_schedule(updated_row, 'updated');
  end if;

  return updated_row.id;
end;
$$;

create or replace function public.publish_rider_schedule(
  p_schedule_id uuid,
  p_expected_revision integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  schedule_row public.rider_schedules%rowtype;
  published_row public.rider_schedules%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  select schedule.* into schedule_row
  from public.rider_schedules schedule
  where schedule.id = p_schedule_id
  for update;

  if not found then
    raise exception 'Rider schedule was not found.' using errcode = 'P0002';
  end if;

  actor_id := private.assert_rider_schedule_manager(schedule_row.hub_id);
  if p_expected_revision is distinct from schedule_row.revision then
    raise exception 'SCHEDULE_REVISION_CONFLICT: The schedule changed in another session. Reload before publishing.'
      using errcode = '40001';
  end if;
  if schedule_row.status <> 'draft'::public.rider_schedule_status then
    raise exception 'Only draft Rider schedules can be published.' using errcode = '23514';
  end if;
  if length(trimmed_reason) < 3 then
    raise exception 'A schedule reason of at least three characters is required.' using errcode = '22023';
  end if;

  perform private.assert_rider_schedule_fields(schedule_row.day_kind, schedule_row.starts_at, schedule_row.ends_at);
  perform private.assert_rider_schedule_context(schedule_row.rider_id, schedule_row.hub_id, schedule_row.work_date, true);

  update public.rider_schedules
  set status = 'published'::public.rider_schedule_status,
      revision = schedule_row.revision + 1,
      updated_by = actor_id,
      updated_at = clock_timestamp(),
      published_by = actor_id,
      published_at = clock_timestamp()
  where id = schedule_row.id
  returning * into published_row;

  insert into public.rider_schedule_audit_events (
    schedule_id, rider_id, hub_id, revision, action, actor_id, reason,
    old_values, new_values
  ) values (
    published_row.id, published_row.rider_id, published_row.hub_id, published_row.revision,
    'published', actor_id, trimmed_reason, to_jsonb(schedule_row), to_jsonb(published_row)
  );

  perform private.notify_rider_schedule(published_row, 'published');
  return published_row.id;
end;
$$;

create or replace function public.cancel_rider_schedule(
  p_schedule_id uuid,
  p_expected_revision integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  schedule_row public.rider_schedules%rowtype;
  cancelled_row public.rider_schedules%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  select schedule.* into schedule_row
  from public.rider_schedules schedule
  where schedule.id = p_schedule_id
  for update;

  if not found then
    raise exception 'Rider schedule was not found.' using errcode = 'P0002';
  end if;

  actor_id := private.assert_rider_schedule_manager(schedule_row.hub_id);
  if p_expected_revision is distinct from schedule_row.revision then
    raise exception 'SCHEDULE_REVISION_CONFLICT: The schedule changed in another session. Reload before cancelling.'
      using errcode = '40001';
  end if;
  if schedule_row.status = 'cancelled'::public.rider_schedule_status then
    raise exception 'The Rider schedule is already cancelled.' using errcode = '23514';
  end if;
  if length(trimmed_reason) < 3 then
    raise exception 'A cancellation reason of at least three characters is required.' using errcode = '22023';
  end if;

  -- Cancellation removes a planning expectation and is also the cleanup path
  -- for a schedule made stale by a later archive or assignment change. It
  -- still requires the schedule's stored Hub scope and an existing FK-backed
  -- Rider, but does not recreate or validate a work assignment.
  update public.rider_schedules
  set status = 'cancelled'::public.rider_schedule_status,
      revision = schedule_row.revision + 1,
      updated_by = actor_id,
      updated_at = clock_timestamp(),
      cancelled_by = actor_id,
      cancelled_at = clock_timestamp(),
      cancellation_reason = trimmed_reason
  where id = schedule_row.id
  returning * into cancelled_row;

  insert into public.rider_schedule_audit_events (
    schedule_id, rider_id, hub_id, revision, action, actor_id, reason,
    old_values, new_values
  ) values (
    cancelled_row.id, cancelled_row.rider_id, cancelled_row.hub_id, cancelled_row.revision,
    'cancelled', actor_id, trimmed_reason, to_jsonb(schedule_row), to_jsonb(cancelled_row)
  );

  perform private.notify_rider_schedule(cancelled_row, 'cancelled');
  return cancelled_row.id;
end;
$$;

create or replace function public.list_rider_schedules(
  p_from_date date,
  p_to_date date,
  p_hub_id uuid default null,
  p_rider_id uuid default null
)
returns table (
  id uuid,
  rider_id uuid,
  rider_name text,
  rider_mkb_id text,
  work_date date,
  hub_id uuid,
  hub_name text,
  day_kind public.rider_schedule_day_kind,
  starts_at time,
  ends_at time,
  status public.rider_schedule_status,
  revision integer,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role := (select public.get_my_role());
  actor_rider_id uuid := (select public.get_my_rider_id());
begin
  if (select auth.uid()) is null or actor_role is null then
    raise exception 'Authentication is required to read Rider schedules.' using errcode = '42501';
  end if;
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid schedule date range is required.' using errcode = '22023';
  end if;
  if p_to_date - p_from_date > 31 then
    raise exception 'Schedule reads are limited to 32 calendar days.' using errcode = '22023';
  end if;

  if actor_role = 'rider'::public.user_role then
    if p_rider_id is not null and p_rider_id is distinct from actor_rider_id then
      raise exception 'Riders can only read their own schedules.' using errcode = '42501';
    end if;

    return query
    select
      schedule.id,
      schedule.rider_id,
      rider.name,
      rider.mkb_id,
      schedule.work_date,
      schedule.hub_id,
      hub.name,
      schedule.day_kind,
      schedule.starts_at,
      schedule.ends_at,
      schedule.status,
      schedule.revision,
      schedule.created_at,
      schedule.updated_at,
      schedule.published_at,
      schedule.cancelled_at,
      schedule.cancellation_reason
    from public.rider_schedules schedule
    join public.riders rider on rider.id = schedule.rider_id
    join public.hubs hub on hub.id = schedule.hub_id
    where schedule.rider_id = actor_rider_id
      and schedule.work_date between p_from_date and p_to_date
      and schedule.status in (
        'published'::public.rider_schedule_status,
        'cancelled'::public.rider_schedule_status
      )
    order by schedule.work_date, schedule.starts_at nulls first, schedule.updated_at desc;
    return;
  end if;

  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'This account has no access to Rider schedules.' using errcode = '42501';
  end if;

  if p_hub_id is not null and not private.user_can_access_hub(p_hub_id) then
    raise exception 'You are not authorized to read schedules for the requested Hub.' using errcode = '42501';
  end if;

  return query
  select
    schedule.id,
    schedule.rider_id,
    rider.name,
    rider.mkb_id,
    schedule.work_date,
    schedule.hub_id,
    hub.name,
    schedule.day_kind,
    schedule.starts_at,
    schedule.ends_at,
    schedule.status,
    schedule.revision,
    schedule.created_at,
    schedule.updated_at,
    schedule.published_at,
    schedule.cancelled_at,
    schedule.cancellation_reason
  from public.rider_schedules schedule
  join public.riders rider on rider.id = schedule.rider_id
  join public.hubs hub on hub.id = schedule.hub_id
  where schedule.work_date between p_from_date and p_to_date
    and (p_hub_id is null or schedule.hub_id = p_hub_id)
    and (p_rider_id is null or schedule.rider_id = p_rider_id)
    and (
      actor_role = 'admin'::public.user_role
      or private.user_can_access_hub(schedule.hub_id)
    )
  order by schedule.work_date, rider.name, schedule.starts_at nulls first, schedule.updated_at desc;
end;
$$;

alter table public.rider_schedules enable row level security;
alter table public.rider_schedule_audit_events enable row level security;

revoke all on table public.rider_schedules from public, anon, authenticated;
grant select on table public.rider_schedules to authenticated;

revoke all on table public.rider_schedule_audit_events from public, anon, authenticated;
grant select on table public.rider_schedule_audit_events to authenticated;

create policy rider_schedules_rider_select
on public.rider_schedules
for select
to authenticated
using (
  rider_id = (select public.get_my_rider_id())
  and status in (
    'published'::public.rider_schedule_status,
    'cancelled'::public.rider_schedule_status
  )
);

create policy rider_schedules_admin_select
on public.rider_schedules
for select
to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role);

create policy rider_schedules_hr_select
on public.rider_schedules
for select
to authenticated
using (
  (select public.get_my_role()) = 'hr'::public.user_role
  and private.user_can_access_hub(hub_id)
);

create policy rider_schedule_audit_admin_select
on public.rider_schedule_audit_events
for select
to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role);

create policy rider_schedule_audit_hr_select
on public.rider_schedule_audit_events
for select
to authenticated
using (
  (select public.get_my_role()) = 'hr'::public.user_role
  and private.user_can_access_hub(hub_id)
);

revoke all on function private.assert_rider_schedule_manager(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.assert_rider_schedule_fields(public.rider_schedule_day_kind, time, time)
  from public, anon, authenticated, service_role;
revoke all on function private.resolve_rider_schedule_hub(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function private.assert_rider_schedule_context(uuid, uuid, date, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.notify_rider_schedule(public.rider_schedules, text)
  from public, anon, authenticated, service_role;

revoke all on function public.create_rider_schedule(uuid, date, uuid, public.rider_schedule_day_kind, time, time, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_rider_schedule(uuid, date, uuid, public.rider_schedule_day_kind, time, time, text)
  to authenticated;

revoke all on function public.update_rider_schedule(uuid, integer, uuid, public.rider_schedule_day_kind, time, time, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_rider_schedule(uuid, integer, uuid, public.rider_schedule_day_kind, time, time, text)
  to authenticated;

revoke all on function public.publish_rider_schedule(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_rider_schedule(uuid, integer, text)
  to authenticated;

revoke all on function public.cancel_rider_schedule(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_rider_schedule(uuid, integer, text)
  to authenticated;

revoke all on function public.list_rider_schedules(date, date, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_rider_schedules(date, date, uuid, uuid)
  to authenticated;
