-- Rider Attendance Context V1
--
-- Attendance logs remain raw clock and system-absence evidence. This migration
-- derives the effective Attendance interpretation from that evidence, Leave &
-- Absence request state, and the narrow published Day Off rule.
--
-- It intentionally does not rewrite attendance_logs, change the finalizer,
-- alter Leave/Scheduling lifecycle behavior, or expose private request text to
-- Attendance consumers.

create or replace function private.resolve_rider_attendance_context(
  p_rider_id uuid,
  p_business_date date,
  p_moment timestamptz default pg_catalog.clock_timestamp()
)
returns table (
  rider_id uuid,
  business_date date,
  attendance_log_id uuid,
  raw_status public.attendance_status,
  time_in timestamptz,
  time_out timestamptz,
  hours double precision,
  attendance_source public.attendance_source,
  effective_status text,
  completion_state text,
  punctuality_state text,
  is_finalized boolean,
  expected_to_work boolean,
  expected_work_basis text,
  planned_leave_state public.rider_absence_request_status,
  planned_leave_effective boolean,
  planned_leave_request_id uuid,
  planned_leave_request_revision integer,
  absence_notice_state public.rider_absence_request_status,
  absence_notice_effective boolean,
  absence_notice_request_id uuid,
  absence_notice_request_revision integer,
  excusal_state text,
  context_code text,
  context_request_id uuid,
  context_request_kind public.rider_absence_request_kind,
  context_request_revision integer,
  hub_id uuid,
  schedule_id uuid,
  schedule_day_kind public.rider_schedule_day_kind
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  attendance_row public.attendance_logs%rowtype;
  schedule_row public.rider_schedules%rowtype;
  planned_request public.rider_absence_requests%rowtype;
  notice_request public.rider_absence_requests%rowtype;
  date_effective_hub_id uuid;
  late_threshold time;
  local_date date;
  local_time time;
  actual_clock boolean := false;
begin
  if p_rider_id is null or p_business_date is null or p_moment is null then
    raise exception 'Rider attendance context requires a Rider, business date, and server moment.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.riders rider where rider.id = p_rider_id
  ) then
    raise exception 'Rider was not found.' using errcode = '23503';
  end if;

  local_date := (p_moment at time zone 'Asia/Manila')::date;
  local_time := (p_moment at time zone 'Asia/Manila')::time;

  select attendance.*
  into attendance_row
  from public.attendance_logs attendance
  where attendance.rider_id = p_rider_id
    and attendance.date = p_business_date;

  select schedule.*
  into schedule_row
  from public.rider_schedules schedule
  where schedule.rider_id = p_rider_id
    and schedule.work_date = p_business_date;

  date_effective_hub_id := private.resolve_rider_schedule_hub(p_rider_id, p_business_date);

  -- Within each request kind, an applicable approved request wins, followed by
  -- a pending request, followed by the latest terminal evidence. A cancelled
  -- approved request remains applicable through its cancellation Manila date.
  select candidate.*
  into planned_request
  from (
    select request.*
    from public.rider_absence_requests request
    where request.rider_id = p_rider_id
      and request.request_kind = 'planned_leave'::public.rider_absence_request_kind
      and request.start_date <= p_business_date
      and request.end_date >= p_business_date
    order by
      case
        when request.status = 'approved'::public.rider_absence_request_status then 0
        when request.status = 'cancelled'::public.rider_absence_request_status
             and p_business_date <= (request.cancelled_at at time zone 'Asia/Manila')::date then 0
        when request.status = 'pending'::public.rider_absence_request_status then 1
        else 2
      end,
      request.submitted_at desc,
      request.id desc
    limit 1
  ) candidate;

  select candidate.*
  into notice_request
  from (
    select request.*
    from public.rider_absence_requests request
    where request.rider_id = p_rider_id
      and request.request_kind = 'absence_notice'::public.rider_absence_request_kind
      and request.start_date = p_business_date
    order by
      case
        when request.status = 'approved'::public.rider_absence_request_status then 0
        when request.status = 'cancelled'::public.rider_absence_request_status
             and p_business_date <= (request.cancelled_at at time zone 'Asia/Manila')::date then 0
        when request.status = 'pending'::public.rider_absence_request_status then 1
        else 2
      end,
      request.submitted_at desc,
      request.id desc
    limit 1
  ) candidate;

  rider_id := p_rider_id;
  business_date := p_business_date;
  attendance_log_id := attendance_row.id;
  raw_status := attendance_row.status;
  time_in := attendance_row.time_in;
  time_out := attendance_row.time_out;
  hours := attendance_row.hours;
  attendance_source := attendance_row.source;
  planned_leave_state := planned_request.status;
  planned_leave_request_id := planned_request.id;
  planned_leave_request_revision := planned_request.revision;
  absence_notice_state := notice_request.status;
  absence_notice_request_id := notice_request.id;
  absence_notice_request_revision := notice_request.revision;
  if schedule_row.status = 'published'::public.rider_schedule_status then
    schedule_id := schedule_row.id;
    schedule_day_kind := schedule_row.day_kind;
  end if;

  planned_leave_effective := planned_request.id is not null
    and (
      planned_request.status = 'approved'::public.rider_absence_request_status
      or (
        planned_request.status = 'cancelled'::public.rider_absence_request_status
        and p_business_date <= (planned_request.cancelled_at at time zone 'Asia/Manila')::date
      )
    );
  absence_notice_effective := notice_request.id is not null
    and (
      notice_request.status = 'approved'::public.rider_absence_request_status
      or (
        notice_request.status = 'cancelled'::public.rider_absence_request_status
        and p_business_date <= (notice_request.cancelled_at at time zone 'Asia/Manila')::date
      )
    );

  is_finalized := p_business_date < local_date
    or (p_business_date = local_date and local_time >= time '17:00:00');

  if not public.is_rider_employed_on(p_rider_id, p_business_date) then
    expected_to_work := false;
    expected_work_basis := 'not_employed';
  elsif schedule_row.id is not null
        and schedule_row.status = 'published'::public.rider_schedule_status
        and schedule_row.day_kind = 'day_off'::public.rider_schedule_day_kind then
    expected_to_work := false;
    expected_work_basis := 'published_day_off';
  elsif schedule_row.id is not null
        and schedule_row.status = 'published'::public.rider_schedule_status
        and schedule_row.day_kind = 'work'::public.rider_schedule_day_kind then
    expected_to_work := true;
    expected_work_basis := 'published_work';
  else
    expected_to_work := true;
    expected_work_basis := 'employed_rider_fallback';
  end if;

  -- Request ownership and draft schedules must not change Attendance scope.
  hub_id := coalesce(attendance_row.hub_id, date_effective_hub_id);

  select policy.late_threshold
  into late_threshold
  from public.attendance_policy_configurations policy
  where policy.active
    and policy.effective_from <= p_business_date
    and (policy.effective_until is null or policy.effective_until >= p_business_date)
  order by policy.effective_from desc
  limit 1;
  late_threshold := coalesce(late_threshold, time '08:15:00');

  actual_clock := attendance_row.time_in is not null;

  -- Effective status is derived in the approved order. Raw manual status is
  -- retained only as compatibility evidence when no actual clock exists.
  if actual_clock then
    if attendance_row.status = 'late'::public.attendance_status
       or (attendance_row.time_in at time zone 'Asia/Manila')::time > late_threshold then
      effective_status := 'late';
    else
      effective_status := 'present';
    end if;
  elsif not expected_to_work then
    effective_status := 'day_off';
  elsif planned_leave_effective then
    effective_status := 'on_leave';
  elsif attendance_row.status = 'on_leave'::public.attendance_status then
    effective_status := 'on_leave';
  elsif not is_finalized then
    effective_status := 'not_finalized';
  else
    effective_status := 'absent';
  end if;

  if actual_clock then
    punctuality_state := case when effective_status = 'late' then 'late' else 'on_time' end;
  else
    punctuality_state := 'none';
  end if;

  if attendance_row.time_in is null then
    if not expected_to_work then
      completion_state := 'not_expected';
    elsif not is_finalized then
      completion_state := 'not_finalized';
    else
      completion_state := 'absent';
    end if;
  elsif attendance_row.time_out is not null then
    completion_state := 'complete';
  elsif p_business_date < local_date then
    completion_state := 'missing_time_out';
  else
    completion_state := 'active';
  end if;

  -- Context is independent from effective presence. The selected request
  -- provenance is safe metadata only; reasons and review fields never leave
  -- the private request workflow.
  if actual_clock and planned_leave_effective then
    context_code := 'worked_during_approved_leave';
    context_request_id := planned_request.id;
    context_request_kind := planned_request.request_kind;
    context_request_revision := planned_request.revision;
  elsif actual_clock and absence_notice_effective then
    context_code := 'worked_despite_accepted_notice';
    context_request_id := notice_request.id;
    context_request_kind := notice_request.request_kind;
    context_request_revision := notice_request.revision;
  elsif planned_leave_effective then
    context_code := 'approved_leave';
    context_request_id := planned_request.id;
    context_request_kind := planned_request.request_kind;
    context_request_revision := planned_request.revision;
  elsif absence_notice_effective then
    context_code := 'accepted_notice';
    context_request_id := notice_request.id;
    context_request_kind := notice_request.request_kind;
    context_request_revision := notice_request.revision;
  elsif planned_request.id is not null then
    context_code := case planned_request.status
      when 'pending'::public.rider_absence_request_status then 'leave_pending'
      when 'rejected'::public.rider_absence_request_status then 'leave_rejected'
      when 'withdrawn'::public.rider_absence_request_status then 'leave_withdrawn'
      when 'cancelled'::public.rider_absence_request_status then 'leave_cancelled'
      else null
    end;
    context_request_id := planned_request.id;
    context_request_kind := planned_request.request_kind;
    context_request_revision := planned_request.revision;
  elsif notice_request.id is not null then
    context_code := case notice_request.status
      when 'pending'::public.rider_absence_request_status then 'notice_pending'
      when 'rejected'::public.rider_absence_request_status then 'notice_rejected'
      when 'withdrawn'::public.rider_absence_request_status then 'notice_withdrawn'
      when 'cancelled'::public.rider_absence_request_status then 'notice_cancelled'
      else null
    end;
    context_request_id := notice_request.id;
    context_request_kind := notice_request.request_kind;
    context_request_revision := notice_request.revision;
  elsif not actual_clock
        and expected_to_work
        and attendance_row.status = 'on_leave'::public.attendance_status then
    context_code := 'manual_legacy_on_leave';
  elsif not actual_clock and not expected_to_work then
    context_code := 'published_day_off';
  elsif not actual_clock and is_finalized and expected_to_work then
    context_code := 'no_notice';
  end if;

  if expected_to_work
     and (planned_leave_effective or absence_notice_effective)
     and effective_status in ('on_leave', 'absent') then
    excusal_state := 'excused';
  elsif expected_to_work and effective_status = 'absent' and is_finalized then
    excusal_state := 'not_excused';
  else
    excusal_state := 'not_applicable';
  end if;

  return next;
end;
$$;

create or replace function public.list_rider_attendance_context(
  p_from_date date,
  p_to_date date,
  p_hub_id uuid default null,
  p_rider_id uuid default null,
  p_page_size integer default 500,
  p_page_offset integer default 0
)
returns table (
  rider_id uuid,
  rider_name text,
  rider_mkb_id text,
  rider_avatar text,
  rider_lat double precision,
  rider_lng double precision,
  zone_id uuid,
  zone_name text,
  business_date date,
  attendance_log_id uuid,
  raw_status public.attendance_status,
  time_in timestamptz,
  time_out timestamptz,
  hours double precision,
  attendance_source public.attendance_source,
  effective_status text,
  completion_state text,
  punctuality_state text,
  is_finalized boolean,
  expected_to_work boolean,
  expected_work_basis text,
  planned_leave_state public.rider_absence_request_status,
  planned_leave_effective boolean,
  planned_leave_request_id uuid,
  planned_leave_request_revision integer,
  absence_notice_state public.rider_absence_request_status,
  absence_notice_effective boolean,
  absence_notice_request_id uuid,
  absence_notice_request_revision integer,
  excusal_state text,
  context_code text,
  context_request_id uuid,
  context_request_kind public.rider_absence_request_kind,
  context_request_revision integer,
  hub_id uuid,
  schedule_id uuid,
  schedule_day_kind public.rider_schedule_day_kind
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
    raise exception 'Authentication is required to read Attendance context.' using errcode = '42501';
  end if;

  if actor_role not in (
    'admin'::public.user_role,
    'hr'::public.user_role,
    'rider'::public.user_role
  ) then
    raise exception 'This account has no access to Attendance context.' using errcode = '42501';
  end if;

  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'A valid Attendance context date range is required.' using errcode = '22023';
  end if;
  if p_to_date - p_from_date > 31 then
    raise exception 'Attendance context reads are limited to 32 calendar days.' using errcode = '22023';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 500 then
    raise exception 'Attendance context page size must be between 1 and 500.' using errcode = '22023';
  end if;
  if p_page_offset is null or p_page_offset < 0 or p_page_offset > 100000 then
    raise exception 'Attendance context page offset must be between 0 and 100000.' using errcode = '22023';
  end if;

  if actor_role = 'rider'::public.user_role then
    if actor_rider_id is null
       or (p_rider_id is not null and p_rider_id is distinct from actor_rider_id) then
      raise exception 'Riders can only read their own Attendance context.' using errcode = '42501';
    end if;
    if p_hub_id is not null and not private.user_can_access_hub(p_hub_id) then
      raise exception 'You are not authorized to read Attendance context for the requested Hub.' using errcode = '42501';
    end if;
  elsif actor_role = 'hr'::public.user_role
        and p_hub_id is not null
        and not private.user_can_access_hub(p_hub_id) then
    raise exception 'You are not authorized to read Attendance context for the requested Hub.' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      rider.id as candidate_rider_id,
      rider.name as candidate_rider_name,
      rider.mkb_id as candidate_rider_mkb_id,
      coalesce(nullif(rider.face_image_url, ''), nullif(rider.avatar_url, ''), '') as candidate_rider_avatar,
      rider.lat as candidate_rider_lat,
      rider.lng as candidate_rider_lng,
      rider.zone_id as candidate_zone_id,
      zone.name as candidate_zone_name,
      series::date as candidate_date
    from public.riders rider
    left join public.zones zone on zone.id = rider.zone_id
    cross join lateral generate_series(
      p_from_date::timestamp,
      p_to_date::timestamp,
      interval '1 day'
    ) series
    where (p_rider_id is null or rider.id = p_rider_id)
      and public.is_rider_employed_on(rider.id, series::date)
  ), resolved as (
    select
      candidate.*,
      context.*
    from candidates candidate
    cross join lateral private.resolve_rider_attendance_context(
      candidate.candidate_rider_id,
      candidate.candidate_date,
      pg_catalog.clock_timestamp()
    ) context
  )
  select
    resolved.candidate_rider_id,
    resolved.candidate_rider_name,
    resolved.candidate_rider_mkb_id,
    resolved.candidate_rider_avatar,
    case when resolved.attendance_log_id is not null then resolved.candidate_rider_lat end,
    case when resolved.attendance_log_id is not null then resolved.candidate_rider_lng end,
    resolved.candidate_zone_id,
    resolved.candidate_zone_name,
    resolved.business_date,
    resolved.attendance_log_id,
    resolved.raw_status,
    resolved.time_in,
    resolved.time_out,
    resolved.hours,
    resolved.attendance_source,
    resolved.effective_status,
    resolved.completion_state,
    resolved.punctuality_state,
    resolved.is_finalized,
    resolved.expected_to_work,
    resolved.expected_work_basis,
    resolved.planned_leave_state,
    resolved.planned_leave_effective,
    planned_provenance.id,
    planned_provenance.revision,
    resolved.absence_notice_state,
    resolved.absence_notice_effective,
    notice_provenance.id,
    notice_provenance.revision,
    resolved.excusal_state,
    resolved.context_code,
    context_provenance.id,
    context_provenance.request_kind,
    context_provenance.revision,
    resolved.hub_id,
    resolved.schedule_id,
    resolved.schedule_day_kind
  from resolved
  -- Classification is server-authoritative even when the request's stored Hub
  -- is hidden. Its identity/revision remain within the Leave workflow scope.
  left join public.rider_absence_requests planned_provenance
    on planned_provenance.id = resolved.planned_leave_request_id
    and (actor_role <> 'hr'::public.user_role or private.user_can_access_hub(planned_provenance.hub_id))
  left join public.rider_absence_requests notice_provenance
    on notice_provenance.id = resolved.absence_notice_request_id
    and (actor_role <> 'hr'::public.user_role or private.user_can_access_hub(notice_provenance.hub_id))
  left join public.rider_absence_requests context_provenance
    on context_provenance.id = resolved.context_request_id
    and (actor_role <> 'hr'::public.user_role or private.user_can_access_hub(context_provenance.hub_id))
  where (
    actor_role = 'admin'::public.user_role
    or (
      actor_role = 'hr'::public.user_role
      and resolved.hub_id is not null
      and private.user_can_access_hub(resolved.hub_id)
    )
    or (
      actor_role = 'rider'::public.user_role
      and resolved.candidate_rider_id = actor_rider_id
    )
  )
    and (p_hub_id is null or resolved.hub_id = p_hub_id)
  order by resolved.business_date, resolved.candidate_rider_name, resolved.candidate_rider_id
  offset p_page_offset
  limit p_page_size;
end;
$$;

comment on function private.resolve_rider_attendance_context(uuid, date, timestamptz) is
  'Server-derived effective Attendance context for one Rider and Asia/Manila business date. Raw attendance remains evidence.';
comment on function public.list_rider_attendance_context(date, date, uuid, uuid, integer, integer) is
  'Bounded authorized Attendance context read. Returns safe status/context metadata without Leave reasons or review details.';

revoke all on function private.resolve_rider_attendance_context(uuid, date, timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.list_rider_attendance_context(date, date, uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_rider_attendance_context(date, date, uuid, uuid, integer, integer)
  to authenticated;
