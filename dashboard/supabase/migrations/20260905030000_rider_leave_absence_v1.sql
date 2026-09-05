-- Rider Leave & Absence Management V1
--
-- This migration records requests and their review history only. It intentionally
-- does not change attendance finalization, Rider Scheduling, payroll, payslips,
-- parcel rates, assignments, biometrics, GPS, or SyncEngine behavior.

create type public.rider_absence_request_kind as enum (
  'planned_leave',
  'absence_notice'
);

create type public.rider_absence_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'withdrawn',
  'cancelled'
);

create table public.rider_absence_requests (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  request_kind public.rider_absence_request_kind not null,
  start_date date not null,
  end_date date not null,
  -- The Hub is captured from the date-effective Scheduling/assignment context.
  -- It is historical scope, not a live riders.hub_id mirror.
  hub_id uuid not null references public.hubs(id) on delete restrict,
  reason text not null,
  submitted_by uuid not null references public.users(id) on delete restrict,
  submitted_at timestamptz not null default clock_timestamp(),
  status public.rider_absence_request_status not null default 'pending',
  revision integer not null default 1,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  withdrawn_by uuid references public.users(id) on delete restrict,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  cancelled_by uuid references public.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text,
  -- A client-generated UUID makes retries idempotent without trusting a client
  -- timestamp or allowing the client to choose the server submission time.
  request_key uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.users(id) on delete restrict,
  constraint rider_absence_request_dates_check check (start_date <= end_date),
  constraint rider_absence_notice_one_date_check check (
    request_kind <> 'absence_notice'::public.rider_absence_request_kind
    or start_date = end_date
  ),
  constraint rider_absence_request_reason_check check (nullif(btrim(reason), '') is not null),
  constraint rider_absence_request_revision_positive check (revision > 0),
  constraint rider_absence_request_review_pair_check check ((reviewed_by is null) = (reviewed_at is null)),
  constraint rider_absence_request_review_state_check check (
    (
      status in (
        'approved'::public.rider_absence_request_status,
        'rejected'::public.rider_absence_request_status,
        'cancelled'::public.rider_absence_request_status
      )
      and reviewed_by is not null
      and reviewed_at is not null
      and nullif(btrim(review_reason), '') is not null
    )
    or
    (
      status in (
        'pending'::public.rider_absence_request_status,
        'withdrawn'::public.rider_absence_request_status
      )
      and reviewed_by is null
      and reviewed_at is null
      and review_reason is null
    )
  ),
  constraint rider_absence_request_withdrawal_pair_check check ((withdrawn_by is null) = (withdrawn_at is null)),
  constraint rider_absence_request_withdrawal_state_check check (
    (
      status = 'withdrawn'::public.rider_absence_request_status
      and withdrawn_by is not null
      and withdrawn_at is not null
      and nullif(btrim(withdrawal_reason), '') is not null
    )
    or
    (
      status <> 'withdrawn'::public.rider_absence_request_status
      and withdrawn_by is null
      and withdrawn_at is null
      and withdrawal_reason is null
    )
  ),
  constraint rider_absence_request_cancellation_pair_check check ((cancelled_by is null) = (cancelled_at is null)),
  constraint rider_absence_request_cancellation_state_check check (
    (
      status = 'cancelled'::public.rider_absence_request_status
      and cancelled_by is not null
      and cancelled_at is not null
      and nullif(btrim(cancellation_reason), '') is not null
    )
    or
    (
      status <> 'cancelled'::public.rider_absence_request_status
      and cancelled_by is null
      and cancelled_at is null
      and cancellation_reason is null
    )
  )
);

comment on table public.rider_absence_requests is
  'Unified planned leave and absence notice request workflow. This is evidence and review data, not a payroll calculation input.';
comment on column public.rider_absence_requests.start_date is
  'Asia/Manila business date. Planned leave may span full dates; an absence notice uses one date.';
comment on column public.rider_absence_requests.hub_id is
  'Historical date-effective operational Hub used for staff privacy scope.';
comment on column public.rider_absence_requests.submitted_at is
  'Server-generated submission timestamp; callers cannot provide this value.';
comment on column public.rider_absence_requests.request_key is
  'Client retry key. Reusing the same key and identical payload returns the existing request.';

create index rider_absence_requests_rider_date_idx
  on public.rider_absence_requests (rider_id, start_date, end_date);
create index rider_absence_requests_hub_status_date_idx
  on public.rider_absence_requests (hub_id, status, start_date, end_date);
create index rider_absence_requests_submitted_by_idx
  on public.rider_absence_requests (submitted_by, submitted_at desc);

create table public.rider_absence_request_audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.rider_absence_requests(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  revision integer not null,
  action text not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  reason text not null,
  old_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now(),
  constraint rider_absence_audit_action_check check (
    action in ('submitted', 'withdrawn', 'approved', 'rejected', 'cancelled')
  ),
  constraint rider_absence_audit_revision_positive check (revision > 0),
  constraint rider_absence_audit_reason_check check (nullif(btrim(reason), '') is not null),
  constraint rider_absence_audit_one_event_per_revision unique (request_id, revision)
);

comment on table public.rider_absence_request_audit_events is
  'Immutable before/after history for Rider Leave & Absence request transitions.';
comment on column public.rider_absence_request_audit_events.hub_id is
  'Historical request Hub scope, retained even if the Rider later moves.';

create index rider_absence_audit_request_created_idx
  on public.rider_absence_request_audit_events (request_id, created_at desc);
create index rider_absence_audit_hub_created_idx
  on public.rider_absence_request_audit_events (hub_id, created_at desc);

create or replace function private.guard_rider_absence_request_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Rider Leave & Absence requests cannot be deleted; retain the evidence history.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.rider_id is distinct from old.rider_id
     or new.request_kind is distinct from old.request_kind
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.hub_id is distinct from old.hub_id
     or new.reason is distinct from old.reason
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at
     or new.request_key is distinct from old.request_key
     or new.created_at is distinct from old.created_at then
    raise exception 'Rider Leave & Absence request identity and submission evidence are immutable.'
      using errcode = '23514';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Rider Leave & Absence request revision must advance by exactly one.'
      using errcode = '40001';
  end if;

  if old.status = 'pending'::public.rider_absence_request_status
     and new.status not in (
       'pending'::public.rider_absence_request_status,
       'approved'::public.rider_absence_request_status,
       'rejected'::public.rider_absence_request_status,
       'withdrawn'::public.rider_absence_request_status
     ) then
    raise exception 'Invalid Rider Leave & Absence transition from pending.' using errcode = '23514';
  end if;

  if old.status = 'approved'::public.rider_absence_request_status
     and new.status <> 'cancelled'::public.rider_absence_request_status then
    raise exception 'Approved Rider Leave & Absence requests can only be cancelled.' using errcode = '23514';
  end if;

  if old.status in (
    'rejected'::public.rider_absence_request_status,
    'withdrawn'::public.rider_absence_request_status,
    'cancelled'::public.rider_absence_request_status
  ) then
    raise exception 'Closed Rider Leave & Absence requests are immutable.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger rider_absence_requests_lifecycle_guard
before update or delete on public.rider_absence_requests
for each row execute function private.guard_rider_absence_request_lifecycle();

create trigger rider_absence_requests_updated_at
before update on public.rider_absence_requests
for each row execute function public.handle_updated_at();

create or replace function private.prevent_rider_absence_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Rider Leave & Absence audit history is immutable.' using errcode = '42501';
end;
$$;

create trigger rider_absence_audit_immutable
before update or delete on public.rider_absence_request_audit_events
for each row execute function private.prevent_rider_absence_audit_mutation();

create or replace function private.assert_rider_absence_reviewer()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
begin
  if actor_id is null
     or actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'Only Admin and HR can manage Rider Leave & Absence requests.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.users profile
    where profile.id = actor_id
      and profile.status = 'active'::public.user_status
      and profile.employment_status = 'active'::public.employment_status
  ) then
    raise exception 'Only an active employed Admin or HR account can manage requests.' using errcode = '42501';
  end if;

  return actor_id;
end;
$$;

create or replace function private.assert_rider_absence_manager(p_hub_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
begin
  actor_id := private.assert_rider_absence_reviewer();

  if p_hub_id is null or not private.user_can_access_hub(p_hub_id) then
    raise exception 'You are not authorized to manage this Leave & Absence request.' using errcode = '42501';
  end if;

  return actor_id;
end;
$$;

-- Resolve every date in the request through the already-deployed Scheduling V1
-- assignment resolver. This couples the stored scope to Scheduling without
-- changing Scheduling or making leave a schedule mutation.
create or replace function private.resolve_rider_absence_hub(
  p_rider_id uuid,
  p_start_date date,
  p_end_date date,
  p_require_employed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  work_date date;
  day_hub_id uuid;
  resolved_hub_id uuid;
begin
  if p_rider_id is null or not exists (
    select 1 from public.riders rider where rider.id = p_rider_id
  ) then
    raise exception 'Rider was not found.' using errcode = '23503';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid ordered Rider Leave & Absence date range is required.' using errcode = '22023';
  end if;

  for work_date in
    select series::date
    from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') as series
  loop
    if p_require_employed and not public.is_rider_employed_on(p_rider_id, work_date) then
      raise exception 'The Rider was not employed on every requested business date.' using errcode = '42501';
    end if;

    day_hub_id := private.resolve_rider_schedule_hub(p_rider_id, work_date);
    if day_hub_id is null then
      raise exception 'The Rider has no date-effective operational Hub for a requested business date.'
        using errcode = '23514';
    end if;

    if resolved_hub_id is null then
      resolved_hub_id := day_hub_id;
    elsif resolved_hub_id is distinct from day_hub_id then
      raise exception 'REQUEST_HUB_BOUNDARY: A single request cannot cross date-effective operational Hubs.'
        using errcode = '23514';
    end if;
  end loop;

  return resolved_hub_id;
end;
$$;

create or replace function private.notify_rider_absence_staff(
  p_request public.rider_absence_requests,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_label text;
begin
  request_label := case p_request.request_kind
    when 'planned_leave'::public.rider_absence_request_kind then 'planned leave request'
    when 'absence_notice'::public.rider_absence_request_kind then 'Absence Notice'
  end;

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
    case when p_event in ('submitted', 'approved', 'rejected')
      then 'medium'::public.notification_priority
      else 'low'::public.notification_priority
    end,
    case p_event
      when 'submitted' then 'New Leave & Absence request'
      when 'withdrawn' then 'Leave & Absence request withdrawn'
      when 'cancelled' then 'Approved Leave & Absence request cancelled'
      else 'Leave & Absence request updated'
    end,
    case p_event
      when 'submitted' then 'A Rider submitted a ' || request_label || ' for review.'
      when 'withdrawn' then 'A Rider withdrew a ' || request_label || '.'
      when 'cancelled' then 'An approved ' || request_label || ' was cancelled.'
      else 'A ' || request_label || ' changed state.'
    end,
    null,
    null,
    p_request.hub_id,
    '/leave_absence',
    jsonb_build_object(
      'event', p_event,
      'request_id', p_request.id,
      'request_kind', p_request.request_kind,
      'revision', p_request.revision,
      'start_date', p_request.start_date,
      'end_date', p_request.end_date
    ),
    false,
    array['admin'::public.user_role, 'hr'::public.user_role]
  );
end;
$$;

create or replace function private.notify_rider_absence_rider(
  p_request public.rider_absence_requests,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  request_label text;
begin
  select profile.id into recipient_id
  from public.users profile
  where profile.rider_id = p_request.rider_id
    and profile.role = 'rider'::public.user_role
  order by profile.created_at
  limit 1;

  if recipient_id is null then
    return;
  end if;

  request_label := case p_request.request_kind
    when 'planned_leave'::public.rider_absence_request_kind then 'planned leave request'
    when 'absence_notice'::public.rider_absence_request_kind then 'Absence Notice'
  end;

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
    case p_event
      when 'approved' then 'Leave & Absence request approved'
      when 'rejected' then 'Leave & Absence request rejected'
      when 'cancelled' then 'Approved Leave & Absence request cancelled'
      else 'Leave & Absence request updated'
    end,
    case p_event
      when 'approved' then 'Your ' || request_label || ' was approved.'
      when 'rejected' then 'Your ' || request_label || ' was rejected.'
      when 'cancelled' then 'Your approved ' || request_label || ' was cancelled.'
      else 'Your ' || request_label || ' changed state.'
    end,
    recipient_id,
    null,
    null,
    '/rider/leave_absence',
    jsonb_build_object(
      'event', p_event,
      'request_id', p_request.id,
      'request_kind', p_request.request_kind,
      'revision', p_request.revision,
      'start_date', p_request.start_date,
      'end_date', p_request.end_date
    ),
    false,
    array['rider'::public.user_role]
  );
end;
$$;

create or replace function public.submit_rider_absence_request(
  p_request_kind public.rider_absence_request_kind,
  p_start_date date,
  p_end_date date,
  p_reason text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_rider_id uuid := (select public.get_my_rider_id());
  actor_role public.user_role := (select public.get_my_role());
  actor_status public.user_status;
  actor_employment public.employment_status;
  existing_request public.rider_absence_requests%rowtype;
  request_row public.rider_absence_requests%rowtype;
  resolved_hub_id uuid;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null
     or actor_role <> 'rider'::public.user_role
     or actor_rider_id is null then
    raise exception 'Only a linked Rider account can submit a Leave & Absence request.' using errcode = '42501';
  end if;

  select profile.status, profile.employment_status
  into actor_status, actor_employment
  from public.users profile
  where profile.id = actor_id;

  if actor_status <> 'active'::public.user_status
     or actor_employment <> 'active'::public.employment_status then
    raise exception 'Only an active employed Rider can submit a Leave & Absence request.' using errcode = '42501';
  end if;

  if p_request_key is null then
    raise exception 'A request retry key is required.' using errcode = '22023';
  end if;
  if p_request_kind is null or p_start_date is null or p_end_date is null then
    raise exception 'Request kind and business dates are required.' using errcode = '22023';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The request start date cannot be after the end date.' using errcode = '22023';
  end if;
  if p_request_kind = 'absence_notice'::public.rider_absence_request_kind
     and p_start_date is distinct from p_end_date then
    raise exception 'An Absence Notice must use one business date.' using errcode = '22023';
  end if;
  if length(trimmed_reason) < 3 then
    raise exception 'A reason of at least three characters is required.' using errcode = '22023';
  end if;

  -- Serialize all requests for one Rider. This closes the race where two
  -- online clients could otherwise both pass the active-overlap checks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rider_absence_requests:' || actor_rider_id::text, 0)
  );

  select request.* into existing_request
  from public.rider_absence_requests request
  where request.request_key = p_request_key
  for update;

  if found then
    if existing_request.submitted_by = actor_id
       and existing_request.rider_id = actor_rider_id
       and existing_request.request_kind = p_request_kind
       and existing_request.start_date = p_start_date
       and existing_request.end_date = p_end_date
       and existing_request.reason = trimmed_reason then
      return existing_request.id;
    end if;

    raise exception 'REQUEST_KEY_CONFLICT: The retry key is already bound to a different request.'
      using errcode = '23505';
  end if;

  resolved_hub_id := private.resolve_rider_absence_hub(
    actor_rider_id,
    p_start_date,
    p_end_date,
    true
  );

  if p_request_kind = 'absence_notice'::public.rider_absence_request_kind
     and exists (
       select 1
       from public.rider_absence_requests request
       where request.rider_id = actor_rider_id
         and request.request_kind = 'absence_notice'::public.rider_absence_request_kind
         and request.start_date = p_start_date
         and request.status in (
           'pending'::public.rider_absence_request_status,
           'approved'::public.rider_absence_request_status
         )
     ) then
    raise exception 'An active Absence Notice already exists for this Rider and business date.'
      using errcode = '23505';
  end if;

  if p_request_kind = 'planned_leave'::public.rider_absence_request_kind
     and exists (
       select 1
       from public.rider_absence_requests request
       where request.rider_id = actor_rider_id
         and request.request_kind = 'planned_leave'::public.rider_absence_request_kind
         and request.status in (
           'pending'::public.rider_absence_request_status,
           'approved'::public.rider_absence_request_status
         )
         and request.start_date <= p_end_date
         and request.end_date >= p_start_date
     ) then
    raise exception 'An active planned leave request overlaps the requested business dates.'
      using errcode = '23505';
  end if;

  insert into public.rider_absence_requests (
    rider_id,
    request_kind,
    start_date,
    end_date,
    hub_id,
    reason,
    submitted_by,
    status,
    revision,
    request_key,
    updated_by
  ) values (
    actor_rider_id,
    p_request_kind,
    p_start_date,
    p_end_date,
    resolved_hub_id,
    trimmed_reason,
    actor_id,
    'pending'::public.rider_absence_request_status,
    1,
    p_request_key,
    actor_id
  ) returning * into request_row;

  insert into public.rider_absence_request_audit_events (
    request_id, rider_id, hub_id, revision, action, actor_id, reason, old_values, new_values
  ) values (
    request_row.id, request_row.rider_id, request_row.hub_id, request_row.revision,
    'submitted', actor_id, trimmed_reason, null, to_jsonb(request_row)
  );

  perform private.notify_rider_absence_staff(request_row, 'submitted');
  return request_row.id;
exception
  when unique_violation then
    raise exception 'REQUEST_ALREADY_EXISTS: An equivalent active Leave & Absence request already exists.'
      using errcode = '23505';
end;
$$;

create or replace function public.withdraw_rider_absence_request(
  p_request_id uuid,
  p_expected_revision integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_rider_id uuid := (select public.get_my_rider_id());
  actor_role public.user_role := (select public.get_my_role());
  target_rider_id uuid;
  request_row public.rider_absence_requests%rowtype;
  withdrawn_row public.rider_absence_requests%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null or actor_role <> 'rider'::public.user_role or actor_rider_id is null then
    raise exception 'Only a Rider can withdraw a Leave & Absence request.' using errcode = '42501';
  end if;
  if length(trimmed_reason) < 3 then
    raise exception 'A withdrawal reason of at least three characters is required.' using errcode = '22023';
  end if;

  select request.rider_id into target_rider_id
  from public.rider_absence_requests request
  where request.id = p_request_id;

  if not found then
    raise exception 'Leave & Absence request was not found.' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rider_absence_requests:' || target_rider_id::text, 0)
  );
  select request.* into request_row
  from public.rider_absence_requests request
  where request.id = p_request_id
  for update;

  if request_row.submitted_by is distinct from actor_id
     or request_row.rider_id is distinct from actor_rider_id then
    raise exception 'Riders can only withdraw their own requests.' using errcode = '42501';
  end if;
  if p_expected_revision is distinct from request_row.revision then
    raise exception 'REQUEST_REVISION_CONFLICT: The request changed in another session. Reload before withdrawing.'
      using errcode = '40001';
  end if;
  if request_row.status <> 'pending'::public.rider_absence_request_status then
    raise exception 'Only pending Leave & Absence requests can be withdrawn.' using errcode = '23514';
  end if;

  update public.rider_absence_requests
  set status = 'withdrawn'::public.rider_absence_request_status,
      revision = request_row.revision + 1,
      withdrawn_by = actor_id,
      withdrawn_at = clock_timestamp(),
      withdrawal_reason = trimmed_reason,
      updated_by = actor_id,
      updated_at = clock_timestamp()
  where id = request_row.id
  returning * into withdrawn_row;

  insert into public.rider_absence_request_audit_events (
    request_id, rider_id, hub_id, revision, action, actor_id, reason, old_values, new_values
  ) values (
    withdrawn_row.id, withdrawn_row.rider_id, withdrawn_row.hub_id, withdrawn_row.revision,
    'withdrawn', actor_id, trimmed_reason, to_jsonb(request_row), to_jsonb(withdrawn_row)
  );

  perform private.notify_rider_absence_staff(withdrawn_row, 'withdrawn');
  return withdrawn_row.id;
end;
$$;

create or replace function public.review_rider_absence_request(
  p_request_id uuid,
  p_expected_revision integer,
  p_decision text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  target_rider_id uuid;
  request_row public.rider_absence_requests%rowtype;
  reviewed_row public.rider_absence_requests%rowtype;
  current_hub_id uuid;
  trimmed_decision text := lower(btrim(coalesce(p_decision, '')));
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  actor_id := private.assert_rider_absence_reviewer();

  select request.rider_id into target_rider_id
  from public.rider_absence_requests request
  where request.id = p_request_id;

  if not found then
    if (select public.get_my_role()) = 'admin'::public.user_role then
      raise exception 'Leave & Absence request was not found.' using errcode = 'P0002';
    end if;
    raise exception 'You are not authorized to manage this Leave & Absence request.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rider_absence_requests:' || target_rider_id::text, 0)
  );
  select request.* into request_row
  from public.rider_absence_requests request
  where request.id = p_request_id
  for update;

  perform private.assert_rider_absence_manager(request_row.hub_id);
  if p_expected_revision is distinct from request_row.revision then
    raise exception 'REQUEST_REVISION_CONFLICT: The request changed in another session. Reload before reviewing.'
      using errcode = '40001';
  end if;
  if request_row.status <> 'pending'::public.rider_absence_request_status then
    raise exception 'Only pending Leave & Absence requests can be reviewed.' using errcode = '23514';
  end if;
  if trimmed_decision not in ('approved', 'rejected') then
    raise exception 'Review decision must be approved or rejected.' using errcode = '22023';
  end if;
  if length(trimmed_reason) < 3 then
    raise exception 'A review reason of at least three characters is required.' using errcode = '22023';
  end if;

  if trimmed_decision = 'approved' then
    -- Approval is the only decision that grants workflow entitlement, so it
    -- must still match the current date-effective assignment context.
    current_hub_id := private.resolve_rider_absence_hub(
      request_row.rider_id,
      request_row.start_date,
      request_row.end_date,
      true
    );
    if current_hub_id is distinct from request_row.hub_id then
      raise exception 'REQUEST_HUB_BOUNDARY: The request no longer matches one date-effective operational Hub.'
        using errcode = '23514';
    end if;
  end if;

  update public.rider_absence_requests
  set status = trimmed_decision::public.rider_absence_request_status,
      revision = request_row.revision + 1,
      reviewed_by = actor_id,
      reviewed_at = clock_timestamp(),
      review_reason = trimmed_reason,
      updated_by = actor_id,
      updated_at = clock_timestamp()
  where id = request_row.id
  returning * into reviewed_row;

  insert into public.rider_absence_request_audit_events (
    request_id, rider_id, hub_id, revision, action, actor_id, reason, old_values, new_values
  ) values (
    reviewed_row.id, reviewed_row.rider_id, reviewed_row.hub_id, reviewed_row.revision,
    trimmed_decision, actor_id, trimmed_reason, to_jsonb(request_row), to_jsonb(reviewed_row)
  );

  perform private.notify_rider_absence_rider(reviewed_row, trimmed_decision);
  return reviewed_row.id;
end;
$$;

create or replace function public.cancel_approved_rider_absence_request(
  p_request_id uuid,
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
  target_rider_id uuid;
  request_row public.rider_absence_requests%rowtype;
  cancelled_row public.rider_absence_requests%rowtype;
  trimmed_reason text := btrim(coalesce(p_reason, ''));
begin
  actor_id := private.assert_rider_absence_reviewer();

  select request.rider_id into target_rider_id
  from public.rider_absence_requests request
  where request.id = p_request_id;

  if not found then
    if (select public.get_my_role()) = 'admin'::public.user_role then
      raise exception 'Leave & Absence request was not found.' using errcode = 'P0002';
    end if;
    raise exception 'You are not authorized to manage this Leave & Absence request.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rider_absence_requests:' || target_rider_id::text, 0)
  );
  select request.* into request_row
  from public.rider_absence_requests request
  where request.id = p_request_id
  for update;

  perform private.assert_rider_absence_manager(request_row.hub_id);
  -- An authorized caller gets a stable state error even when it still holds
  -- the revision from before the terminal transition.
  if request_row.status = 'cancelled'::public.rider_absence_request_status then
    raise exception 'Cancelled Leave & Absence requests cannot be cancelled again.' using errcode = '23514';
  end if;
  if p_expected_revision is distinct from request_row.revision then
    raise exception 'REQUEST_REVISION_CONFLICT: The request changed in another session. Reload before cancelling.'
      using errcode = '40001';
  end if;
  if request_row.status <> 'approved'::public.rider_absence_request_status then
    raise exception 'Only approved Leave & Absence requests can be cancelled.' using errcode = '23514';
  end if;
  if length(trimmed_reason) < 3 then
    raise exception 'A cancellation reason of at least three characters is required.' using errcode = '22023';
  end if;

  update public.rider_absence_requests
  set status = 'cancelled'::public.rider_absence_request_status,
      revision = request_row.revision + 1,
      cancelled_by = actor_id,
      cancelled_at = clock_timestamp(),
      cancellation_reason = trimmed_reason,
      updated_by = actor_id,
      updated_at = clock_timestamp()
  where id = request_row.id
  returning * into cancelled_row;

  insert into public.rider_absence_request_audit_events (
    request_id, rider_id, hub_id, revision, action, actor_id, reason, old_values, new_values
  ) values (
    cancelled_row.id, cancelled_row.rider_id, cancelled_row.hub_id, cancelled_row.revision,
    'cancelled', actor_id, trimmed_reason, to_jsonb(request_row), to_jsonb(cancelled_row)
  );

  perform private.notify_rider_absence_rider(cancelled_row, 'cancelled');
  perform private.notify_rider_absence_staff(cancelled_row, 'cancelled');
  return cancelled_row.id;
end;
$$;

create or replace function public.list_rider_absence_requests(
  p_from_date date,
  p_to_date date,
  p_hub_id uuid default null,
  p_rider_id uuid default null,
  p_status public.rider_absence_request_status default null,
  p_request_kind public.rider_absence_request_kind default null
)
returns table (
  id uuid,
  rider_id uuid,
  rider_name text,
  rider_mkb_id text,
  request_kind public.rider_absence_request_kind,
  start_date date,
  end_date date,
  hub_id uuid,
  hub_name text,
  reason text,
  submitted_by uuid,
  submitted_by_name text,
  submitted_at timestamptz,
  status public.rider_absence_request_status,
  revision integer,
  reviewed_by uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  review_reason text,
  withdrawn_by uuid,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
  actor_rider_id uuid := (select public.get_my_rider_id());
begin
  if actor_id is null or actor_role is null then
    raise exception 'Authentication is required to read Leave & Absence requests.' using errcode = '42501';
  end if;
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid Leave & Absence date range is required.' using errcode = '22023';
  end if;
  if p_to_date - p_from_date > 92 then
    raise exception 'Leave & Absence reads are limited to 93 calendar days.' using errcode = '22023';
  end if;

  if actor_role = 'rider'::public.user_role then
    if p_rider_id is not null and p_rider_id is distinct from actor_rider_id then
      raise exception 'Riders can only read their own Leave & Absence requests.' using errcode = '42501';
    end if;
  elsif actor_role in ('admin'::public.user_role, 'hr'::public.user_role) then
    if p_hub_id is not null and not private.user_can_access_hub(p_hub_id) then
      raise exception 'You are not authorized to read requests for the requested Hub.' using errcode = '42501';
    end if;
  else
    raise exception 'This account has no access to Rider Leave & Absence requests.' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.rider_id,
    rider.name,
    rider.mkb_id,
    request.request_kind,
    request.start_date,
    request.end_date,
    request.hub_id,
    hub.name,
    request.reason,
    request.submitted_by,
    submitter.full_name,
    request.submitted_at,
    request.status,
    request.revision,
    request.reviewed_by,
    reviewer.full_name,
    request.reviewed_at,
    request.review_reason,
    request.withdrawn_by,
    request.withdrawn_at,
    request.withdrawal_reason,
    request.cancelled_by,
    request.cancelled_at,
    request.cancellation_reason,
    request.created_at,
    request.updated_at,
    request.updated_by
  from public.rider_absence_requests request
  join public.riders rider on rider.id = request.rider_id
  join public.hubs hub on hub.id = request.hub_id
  left join public.users submitter on submitter.id = request.submitted_by
  left join public.users reviewer on reviewer.id = request.reviewed_by
  where request.start_date <= p_to_date
    and request.end_date >= p_from_date
    and (p_hub_id is null or request.hub_id = p_hub_id)
    and (p_rider_id is null or request.rider_id = p_rider_id)
    and (p_status is null or request.status = p_status)
    and (p_request_kind is null or request.request_kind = p_request_kind)
    and (
      actor_role = 'admin'::public.user_role
      or (
        actor_role = 'hr'::public.user_role
        and private.user_can_access_hub(request.hub_id)
      )
      or (
        actor_role = 'rider'::public.user_role
        and request.rider_id = actor_rider_id
        and request.submitted_by = actor_id
      )
    )
  order by request.start_date, request.submitted_at desc, request.updated_at desc;
end;
$$;

create or replace function public.get_rider_absence_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
  actor_rider_id uuid := (select public.get_my_rider_id());
  request_row public.rider_absence_requests%rowtype;
  audit_rows jsonb;
begin
  if actor_id is null
     or actor_role not in (
       'admin'::public.user_role,
       'hr'::public.user_role,
       'rider'::public.user_role
     )
     or (actor_role = 'rider'::public.user_role and actor_rider_id is null) then
    raise exception 'You are not authorized to read this Leave & Absence request.' using errcode = '42501';
  end if;

  select request.* into request_row
  from public.rider_absence_requests request
  where request.id = p_request_id;

  if not found then
    if actor_role = 'admin'::public.user_role then
      raise exception 'Leave & Absence request was not found.' using errcode = 'P0002';
    end if;
    raise exception 'You are not authorized to read this Leave & Absence request.' using errcode = '42501';
  end if;

  if actor_role = 'admin'::public.user_role then
    null;
  elsif actor_role = 'hr'::public.user_role and private.user_can_access_hub(request_row.hub_id) then
    null;
  elsif actor_role = 'rider'::public.user_role
        and request_row.rider_id = actor_rider_id
        and request_row.submitted_by = actor_id then
    null;
  else
    raise exception 'You are not authorized to read this Leave & Absence request.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', audit.id,
        'request_id', audit.request_id,
        'rider_id', audit.rider_id,
        'hub_id', audit.hub_id,
        'revision', audit.revision,
        'action', audit.action,
        'actor_id', audit.actor_id,
        'actor_name', actor.full_name,
        'reason', audit.reason,
        'old_values', audit.old_values,
        'new_values', audit.new_values,
        'created_at', audit.created_at
      ) order by audit.revision
    ),
    '[]'::jsonb
  ) into audit_rows
  from public.rider_absence_request_audit_events audit
  left join public.users actor on actor.id = audit.actor_id
  where audit.request_id = request_row.id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', request_row.id,
      'rider_id', request_row.rider_id,
      'request_kind', request_row.request_kind,
      'start_date', request_row.start_date,
      'end_date', request_row.end_date,
      'hub_id', request_row.hub_id,
      'reason', request_row.reason,
      'submitted_by', request_row.submitted_by,
      'submitted_at', request_row.submitted_at,
      'status', request_row.status,
      'revision', request_row.revision,
      'reviewed_by', request_row.reviewed_by,
      'reviewed_at', request_row.reviewed_at,
      'review_reason', request_row.review_reason,
      'withdrawn_by', request_row.withdrawn_by,
      'withdrawn_at', request_row.withdrawn_at,
      'withdrawal_reason', request_row.withdrawal_reason,
      'cancelled_by', request_row.cancelled_by,
      'cancelled_at', request_row.cancelled_at,
      'cancellation_reason', request_row.cancellation_reason,
      'created_at', request_row.created_at,
      'updated_at', request_row.updated_at,
      'updated_by', request_row.updated_by
    ),
    'audit', audit_rows
  );
end;
$$;

alter table public.rider_absence_requests enable row level security;
alter table public.rider_absence_request_audit_events enable row level security;

revoke all on table public.rider_absence_requests from public, anon, authenticated;
grant select on table public.rider_absence_requests to authenticated;

revoke all on table public.rider_absence_request_audit_events from public, anon, authenticated;
grant select on table public.rider_absence_request_audit_events to authenticated;

create policy rider_absence_requests_rider_select
on public.rider_absence_requests
for select to authenticated
using (
  (select public.get_my_role()) = 'rider'::public.user_role
  and
  submitted_by = (select auth.uid())
  and rider_id = (select public.get_my_rider_id())
);

create policy rider_absence_requests_admin_select
on public.rider_absence_requests
for select to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role);

create policy rider_absence_requests_hr_select
on public.rider_absence_requests
for select to authenticated
using (
  (select public.get_my_role()) = 'hr'::public.user_role
  and private.user_can_access_hub(hub_id)
);

create policy rider_absence_audit_rider_select
on public.rider_absence_request_audit_events
for select to authenticated
using (
  (select public.get_my_role()) = 'rider'::public.user_role
  and
  rider_id = (select public.get_my_rider_id())
  and exists (
    select 1
    from public.rider_absence_requests request
    where request.id = request_id
      and request.submitted_by = (select auth.uid())
  )
);

create policy rider_absence_audit_admin_select
on public.rider_absence_request_audit_events
for select to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role);

create policy rider_absence_audit_hr_select
on public.rider_absence_request_audit_events
for select to authenticated
using (
  (select public.get_my_role()) = 'hr'::public.user_role
  and private.user_can_access_hub(hub_id)
);

revoke all on function private.guard_rider_absence_request_lifecycle() from public, anon, authenticated, service_role;
revoke all on function private.prevent_rider_absence_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function private.assert_rider_absence_reviewer() from public, anon, authenticated, service_role;
revoke all on function private.assert_rider_absence_manager(uuid) from public, anon, authenticated, service_role;
revoke all on function private.resolve_rider_absence_hub(uuid, date, date, boolean) from public, anon, authenticated, service_role;
revoke all on function private.notify_rider_absence_staff(public.rider_absence_requests, text) from public, anon, authenticated, service_role;
revoke all on function private.notify_rider_absence_rider(public.rider_absence_requests, text) from public, anon, authenticated, service_role;

revoke all on function public.submit_rider_absence_request(public.rider_absence_request_kind, date, date, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_rider_absence_request(public.rider_absence_request_kind, date, date, text, uuid)
  to authenticated;

revoke all on function public.withdraw_rider_absence_request(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.withdraw_rider_absence_request(uuid, integer, text)
  to authenticated;

revoke all on function public.review_rider_absence_request(uuid, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_rider_absence_request(uuid, integer, text, text)
  to authenticated;

revoke all on function public.cancel_approved_rider_absence_request(uuid, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_approved_rider_absence_request(uuid, integer, text)
  to authenticated;

revoke all on function public.list_rider_absence_requests(date, date, uuid, uuid, public.rider_absence_request_status, public.rider_absence_request_kind)
  from public, anon, authenticated, service_role;
grant execute on function public.list_rider_absence_requests(date, date, uuid, uuid, public.rider_absence_request_status, public.rider_absence_request_kind)
  to authenticated;

revoke all on function public.get_rider_absence_request_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_rider_absence_request_detail(uuid)
  to authenticated;
