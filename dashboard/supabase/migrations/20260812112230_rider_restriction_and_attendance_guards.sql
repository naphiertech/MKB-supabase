-- Rider account restriction is represented by users.status = suspended only
-- while employment_status remains active. Archived employment remains the
-- stronger state: suspended in public.users and banned in Supabase Auth.
-- No existing account or historical operational row is rewritten here.

create or replace function public.is_rider_account_operational(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.role = 'rider'::public.user_role
       and u.status = 'active'::public.user_status
       and u.employment_status = 'active'::public.employment_status
    from public.users u
    where u.id = p_user_id
  ), false)
$$;

revoke all on function public.is_rider_account_operational(uuid) from public, anon;
grant execute on function public.is_rider_account_operational(uuid) to authenticated, service_role;

create or replace function public.transition_rider_account_access(
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
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_event_type text;
  v_existing public.activity_logs%rowtype;
  v_resolved_boundary_count integer := 0;
begin
  if p_action not in ('restrict', 'restore_access') or p_request_id is null then
    raise exception 'Invalid Rider account access request.' using errcode = '22023';
  end if;

  v_event_type := case
    when p_action = 'restrict' then 'rider_account_restricted'
    else 'rider_full_access_restored'
  end;

  select * into v_existing
  from public.activity_logs
  where event_type = v_event_type
    and metadata->>'request_id' = p_request_id::text
    and metadata->>'target_user_id' = p_target_user_id::text
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'action', p_action);
  end if;

  select * into v_actor from public.users where id = p_actor_id;
  if not found or v_actor.role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'Admin or HR access is required.' using errcode = '42501';
  end if;

  select * into v_target from public.users where id = p_target_user_id for update;
  if not found then
    raise exception 'Target user was not found.' using errcode = 'P0002';
  end if;
  if p_actor_id = p_target_user_id then
    raise exception 'You cannot change your own Rider access.' using errcode = '42501';
  end if;
  if v_target.role <> 'rider'::public.user_role then
    raise exception 'Restricted access applies to Rider accounts only.' using errcode = '42501';
  end if;
  if v_target.employment_status <> 'active'::public.employment_status then
    raise exception 'Restore employment before changing Rider account access.' using errcode = '42501';
  end if;

  if p_action = 'restrict' then
    if v_target.status = 'suspended'::public.user_status then
      raise exception 'This Rider account is already restricted.' using errcode = 'P0001';
    end if;

    update public.users
    set status = 'suspended'::public.user_status,
        updated_at = clock_timestamp()
    where id = p_target_user_id;

    if v_target.rider_id is not null then
      update public.riders
      set status = 'offline'::public.rider_status,
          updated_at = clock_timestamp()
      where id = v_target.rider_id;

      update public.violations
      set resolved = true,
          resolved_at = coalesce(resolved_at, clock_timestamp())
      where rider_id = v_target.rider_id
        and type = 'boundary_exit'::public.violation_type
        and not resolved;
      get diagnostics v_resolved_boundary_count = row_count;
    end if;
  else
    if v_target.status <> 'suspended'::public.user_status then
      raise exception 'This Rider account already has full access.' using errcode = 'P0001';
    end if;

    update public.users
    set status = 'active'::public.user_status,
        updated_at = clock_timestamp()
    where id = p_target_user_id;
  end if;

  insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
  values (
    p_actor_id,
    v_target.rider_id,
    v_event_type,
    case
      when p_action = 'restrict'
        then v_actor.full_name || ' restricted account access for "' || v_target.full_name || '".'
      else v_actor.full_name || ' restored full account access for "' || v_target.full_name || '".'
    end,
    jsonb_build_object(
      'request_id', p_request_id,
      'target_user_id', p_target_user_id,
      'target_rider_id', v_target.rider_id,
      'previous_status', v_target.status,
      'new_status', case when p_action = 'restrict' then 'suspended' else 'active' end,
      'resolved_boundary_exit_count', v_resolved_boundary_count,
      'auth_login_changed', p_action = 'restore_access',
      'source', 'admin-user-actions'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'action', p_action,
    'account_status', case when p_action = 'restrict' then 'suspended' else 'active' end,
    'rider_status', case when p_action = 'restrict' then 'offline' else null end
  );
end;
$$;

revoke all on function public.transition_rider_account_access(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_rider_account_access(uuid, uuid, text, uuid)
  to service_role;

-- Direct Rider profile/workforce writes require full operational access.
drop policy if exists "Rider can update own profile while employed" on public.riders;
create policy "Rider can update own profile with full access"
on public.riders for update to authenticated
using (
  id = (select public.get_my_rider_id())
  and public.is_rider_account_operational((select auth.uid()))
)
with check (
  id = (select public.get_my_rider_id())
  and public.is_rider_account_operational((select auth.uid()))
);

drop policy if exists "Users can update own record" on public.users;
create policy "Users can update own record with Rider access guard"
on public.users for update to authenticated
using (
  id = (select auth.uid())
  and (
    role <> 'rider'::public.user_role
    or public.is_rider_account_operational((select auth.uid()))
  )
)
with check (
  id = (select auth.uid())
  and (
    role <> 'rider'::public.user_role
    or public.is_rider_account_operational((select auth.uid()))
  )
);

create or replace function public.cache_rider_face_descriptor(
  p_rider_id uuid,
  p_descriptor jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role) then
    update public.riders
    set face_descriptor = p_descriptor,
        face_registered_at = now()
    where id = p_rider_id and face_descriptor is null;
  elsif p_rider_id = (select public.get_my_rider_id())
    and public.is_rider_account_operational((select auth.uid())) then
    update public.riders
    set face_descriptor = p_descriptor,
        face_registered_at = now()
    where id = p_rider_id and face_descriptor is null;
  else
    raise exception 'Restricted or archived Riders cannot change workforce profile data.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.cache_rider_face_descriptor(uuid, jsonb) from public, anon;
grant execute on function public.cache_rider_face_descriptor(uuid, jsonb) to authenticated, service_role;

-- Payroll files are generated client-side from these protected records. A
-- restricted Rider therefore loses the server-side source data required to
-- generate or export a payslip; staff access is unchanged.
drop policy if exists "Riders can read own approved or paid payroll" on public.payroll_records;
create policy "Riders with full access can read own approved or paid payroll"
on public.payroll_records for select to authenticated
using (
  (select public.get_my_role()) = 'rider'::public.user_role
  and public.is_rider_account_operational((select auth.uid()))
  and rider_id = (select public.get_my_rider_id())
  and status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
);

drop policy if exists "Riders can read own finalized payroll delivery lines" on public.payroll_delivery_lines;
create policy "Riders with full access can read own finalized payroll delivery lines"
on public.payroll_delivery_lines for select to authenticated
using (
  (select public.get_my_role()) = 'rider'::public.user_role
  and public.is_rider_account_operational((select auth.uid()))
  and rider_id = (select public.get_my_rider_id())
  and exists (
    select 1
    from public.payroll_records pr
    where pr.id = payroll_delivery_lines.payroll_record_id
      and pr.rider_id = payroll_delivery_lines.rider_id
      and pr.status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
  )
);

-- Keep the operational trigger messages aligned with the Restricted UI. These
-- triggers remain the authoritative guard for online and offline replay paths.
create or replace function public.enforce_attendance_employment_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or old.rider_id is distinct from new.rider_id or old.date is distinct from new.date)
     and not public.is_rider_employed_on(new.rider_id, new.date) then
    raise exception 'The Rider was not employed on the attendance business date.' using errcode = '42501';
  end if;
  if (select public.get_my_role()) = 'rider'::public.user_role
     and not public.is_rider_operational_at(
       new.rider_id,
       coalesce(new.time_out, new.time_in, new.date::timestamp at time zone 'Asia/Manila')
     ) then
    raise exception 'Restricted or archived Riders cannot create or change attendance.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_rider_location_employment_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_rider_operational_at(new.rider_id, new.recorded_at) then
    raise exception 'Restricted or archived Riders cannot submit location updates.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_attendance_employment_eligibility() from public, anon, authenticated;
revoke all on function public.enforce_rider_location_employment_eligibility() from public, anon, authenticated;
