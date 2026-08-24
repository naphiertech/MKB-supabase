-- Harden dynamic Attendance Policy integrity without rewriting the applied foundation migration.

create or replace function private.attendance_policy_business_date(
  p_moment timestamptz default now()
)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (p_moment at time zone 'Asia/Manila')::date;
$$;

revoke all on function private.attendance_policy_business_date(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.attendance_policy_business_date(timestamptz)
  to service_role;

-- Refuse to harden a history that already contains a missing or overlapping day.
do $$
declare
  first_policy_date date;
  business_date date := private.attendance_policy_business_date();
begin
  select min(policy.effective_from)
  into first_policy_date
  from public.attendance_policy_configurations policy
  where policy.active;

  if first_policy_date is null then
    raise exception 'Attendance Policy integrity failure: no active baseline policy exists.';
  end if;

  if exists (
    select 1
    from generate_series(first_policy_date, business_date, interval '1 day') covered_day
    where (
      select count(*)
      from public.attendance_policy_configurations policy
      where policy.active
        and policy.effective_from <= covered_day::date
        and (policy.effective_until is null or policy.effective_until >= covered_day::date)
    ) <> 1
  ) then
    raise exception 'Attendance Policy integrity failure: historical coverage contains a gap or overlap.';
  end if;
end;
$$;

create or replace function public.guard_attendance_policy_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  business_date date := private.attendance_policy_business_date();
begin
  if OLD.effective_from <= business_date then
    if tg_op = 'DELETE' then
      raise exception 'Historical attendance policy cannot be deleted once effective.';
    end if;

    if NEW.late_threshold is distinct from OLD.late_threshold then
      raise exception 'Historical attendance policy threshold cannot change once effective.';
    end if;

    if NEW.effective_from is distinct from OLD.effective_from then
      raise exception 'Historical attendance policy start date cannot change once effective.';
    end if;

    if NEW.active is distinct from OLD.active then
      raise exception 'Historical attendance policy activation cannot change once effective.';
    end if;

    if OLD.effective_until < business_date
       and NEW.effective_until is distinct from OLD.effective_until then
      raise exception 'Completed historical attendance policy coverage cannot change.';
    end if;

    if NEW.effective_until is not null and NEW.effective_until < business_date then
      raise exception 'Historical attendance policy coverage cannot exclude an already-governed date.';
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

alter function public.record_attendance_policy_audit() set search_path = '';
revoke all on function public.record_attendance_policy_audit()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_attendance_policy_immutability()
  from public, anon, authenticated, service_role;

create or replace function public.schedule_attendance_policy(
  p_late_threshold time,
  p_effective_from date,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  business_date date := private.attendance_policy_business_date();
  predecessor public.attendance_policy_configurations%rowtype;
  successor public.attendance_policy_configurations%rowtype;
  scheduled_id uuid;
begin
  if actor_id is null
     or (select public.get_my_role()) <> 'admin'::public.user_role then
    raise exception 'Only Admin can schedule attendance policies.' using errcode = '42501';
  end if;

  if p_late_threshold is null
     or p_effective_from is null
     or nullif(btrim(p_change_reason), '') is null then
    raise exception 'Late threshold, future effective date, and change reason are required.' using errcode = '22023';
  end if;

  if p_effective_from <= business_date then
    raise exception 'Effective date must be after the current Manila attendance date.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('attendance_policy_configuration_transition'));
  perform 1
  from public.attendance_policy_configurations policy
  where policy.active
  for update;

  if exists (
    select 1
    from public.attendance_policy_configurations policy
    where policy.active and policy.effective_from = p_effective_from
  ) then
    raise exception 'An active attendance policy already starts on that date.' using errcode = '23505';
  end if;

  select policy.*
  into predecessor
  from public.attendance_policy_configurations policy
  where policy.active and policy.effective_from < p_effective_from
  order by policy.effective_from desc
  limit 1
  for update;

  if not found then
    raise exception 'Attendance Policy integrity failure: predecessor policy was not found.';
  end if;

  if predecessor.effective_until is not null
     and predecessor.effective_until < p_effective_from - 1 then
    raise exception 'Attendance Policy integrity failure: scheduling would preserve an existing coverage gap.';
  end if;

  select policy.*
  into successor
  from public.attendance_policy_configurations policy
  where policy.active and policy.effective_from > p_effective_from
  order by policy.effective_from
  limit 1
  for update;

  update public.attendance_policy_configurations
  set effective_until = p_effective_from - 1,
      change_reason = format(
        'Replaced by future policy effective %s. %s',
        p_effective_from,
        btrim(p_change_reason)
      ),
      updated_by = actor_id
  where id = predecessor.id;

  insert into public.attendance_policy_configurations (
    late_threshold,
    effective_from,
    effective_until,
    active,
    change_reason,
    created_by,
    updated_by
  ) values (
    p_late_threshold,
    p_effective_from,
    case when successor.id is null then null else successor.effective_from - 1 end,
    true,
    btrim(p_change_reason),
    actor_id,
    actor_id
  )
  returning id into scheduled_id;

  return scheduled_id;
end;
$$;

create or replace function public.cancel_future_attendance_policy(
  p_policy_id uuid,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  business_date date := private.attendance_policy_business_date();
  target public.attendance_policy_configurations%rowtype;
  predecessor public.attendance_policy_configurations%rowtype;
  successor public.attendance_policy_configurations%rowtype;
begin
  if actor_id is null
     or (select public.get_my_role()) <> 'admin'::public.user_role then
    raise exception 'Only Admin can cancel attendance policies.' using errcode = '42501';
  end if;

  if p_policy_id is null or nullif(btrim(p_change_reason), '') is null then
    raise exception 'Policy and cancellation reason are required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('attendance_policy_configuration_transition'));
  perform 1
  from public.attendance_policy_configurations policy
  where policy.active
  for update;

  select policy.*
  into target
  from public.attendance_policy_configurations policy
  where policy.id = p_policy_id and policy.active
  for update;

  if not found then
    raise exception 'Active attendance policy was not found.' using errcode = 'P0002';
  end if;

  if target.effective_from <= business_date then
    raise exception 'Policies that have already taken effect cannot be canceled.';
  end if;

  select policy.*
  into predecessor
  from public.attendance_policy_configurations policy
  where policy.active
    and policy.id <> target.id
    and policy.effective_from < target.effective_from
  order by policy.effective_from desc
  limit 1
  for update;

  if not found then
    raise exception 'Attendance Policy integrity failure: predecessor policy was not found.';
  end if;

  select policy.*
  into successor
  from public.attendance_policy_configurations policy
  where policy.active
    and policy.id <> target.id
    and policy.effective_from > target.effective_from
  order by policy.effective_from
  limit 1
  for update;

  if predecessor.effective_until is distinct from target.effective_from - 1 then
    raise exception 'Attendance Policy integrity failure: predecessor boundary is not contiguous.';
  end if;

  if target.effective_until is distinct from
     (case when successor.id is null then null else successor.effective_from - 1 end) then
    raise exception 'Attendance Policy integrity failure: successor boundary is not contiguous.';
  end if;

  update public.attendance_policy_configurations
  set active = false,
      change_reason = btrim(p_change_reason),
      updated_by = actor_id
  where id = target.id;

  update public.attendance_policy_configurations
  set effective_until = case when successor.id is null then null else successor.effective_from - 1 end,
      change_reason = format(
        'Restored boundary after cancellation of %s policy. %s',
        target.effective_from,
        btrim(p_change_reason)
      ),
      updated_by = actor_id
  where id = predecessor.id;

  return target.id;
end;
$$;

revoke all on function public.schedule_attendance_policy(time, date, text)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_future_attendance_policy(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.schedule_attendance_policy(time, date, text)
  to authenticated;
grant execute on function public.cancel_future_attendance_policy(uuid, text)
  to authenticated;

-- Policy history remains readable, but all client writes now pass through the atomic RPCs.
revoke insert, update, delete on table public.attendance_policy_configurations
  from authenticated;
