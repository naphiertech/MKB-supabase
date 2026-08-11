-- Employee Archive is an employment lifecycle, not account deletion and not a
-- rider live-status value. Historical rows remain attached to the same identities.

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'employment_status') then
    create type public.employment_status as enum ('active', 'archived');
  end if;
end;
$$;

alter table public.users
  add column employment_status public.employment_status not null default 'active',
  add column archive_effective_date date,
  add column archive_reason text,
  add column archive_remarks text,
  add column archived_at timestamptz,
  add column archived_by uuid references public.users(id) on delete restrict,
  add column restored_at timestamptz,
  add column restored_by uuid references public.users(id) on delete restrict,
  add column restore_reason text;

alter table public.users
  add constraint users_archived_account_suspended_check
    check (employment_status = 'active' or status = 'suspended'),
  add constraint users_archive_reason_check
    check (archive_reason is null or archive_reason in ('Resigned', 'Terminated', 'Contract Ended', 'Retired', 'Other')),
  add constraint users_other_archive_remarks_check
    check (archive_reason <> 'Other' or nullif(btrim(archive_remarks), '') is not null),
  add constraint users_archived_metadata_check
    check (
      employment_status = 'active'
      or (
        archive_effective_date is not null
        and archive_reason is not null
        and archived_at is not null
        and archived_by is not null
      )
    );

create unique index users_rider_id_unique_nonnull
  on public.users (rider_id)
  where rider_id is not null;
create index users_employment_status_idx on public.users (employment_status);
create index users_archive_effective_date_idx on public.users (archive_effective_date) where archive_effective_date is not null;

comment on column public.users.employment_status is
  'Employment lifecycle only. Account access remains users.status; rider live state remains riders.status.';
comment on column public.users.archive_effective_date is
  'Asia/Manila business date on which operational employment eligibility ends.';

create or replace function public.is_user_currently_employed(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.employment_status = 'active'::public.employment_status
    from public.users u
    where u.id = p_user_id
  ), false)
$$;

create or replace function public.is_rider_employed_on(p_rider_id uuid, p_business_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Unlinked legacy rider profiles are not self-service accounts. Retaining
    -- them as historically eligible preserves existing administrative history.
    when not exists (select 1 from public.users u where u.rider_id = p_rider_id) then true
    else coalesce((
      select case
        when u.archive_effective_date is null then u.employment_status = 'active'::public.employment_status
        when p_business_date < u.archive_effective_date then true
        when u.employment_status = 'archived'::public.employment_status then false
        when u.restored_at is not null
          then p_business_date >= (u.restored_at at time zone 'Asia/Manila')::date
        else false
      end
      from public.users u
      where u.rider_id = p_rider_id
    ), false)
  end
$$;

create or replace function public.is_rider_operational_at(p_rider_id uuid, p_event_time timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.users u where u.rider_id = p_rider_id) then true
    else coalesce((
      select u.employment_status = 'active'::public.employment_status
         and u.status = 'active'::public.user_status
         and public.is_rider_employed_on(p_rider_id, (p_event_time at time zone 'Asia/Manila')::date)
      from public.users u
      where u.rider_id = p_rider_id
    ), false)
  end
$$;

revoke all on function public.is_user_currently_employed(uuid) from public, anon;
revoke all on function public.is_rider_employed_on(uuid, date) from public, anon;
revoke all on function public.is_rider_operational_at(uuid, timestamptz) from public, anon;
grant execute on function public.is_user_currently_employed(uuid) to authenticated, service_role;
grant execute on function public.is_rider_employed_on(uuid, date) to authenticated, service_role;
grant execute on function public.is_rider_operational_at(uuid, timestamptz) to authenticated, service_role;

create or replace function public.get_rider_workforce_directory()
returns table (
  id uuid,
  name text,
  mkb_id text,
  zone_id uuid,
  zone_name text,
  employment_status public.employment_status,
  archive_effective_date date,
  restored_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.name, r.mkb_id, r.zone_id, z.name,
         coalesce(u.employment_status, 'active'::public.employment_status),
         u.archive_effective_date, u.restored_at
  from public.riders r
  left join public.users u on u.rider_id = r.id
  left join public.zones z on z.id = r.zone_id
  where (select public.get_my_role()) in (
    'admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role
  )
     or r.id = (select public.get_my_rider_id())
  order by r.name
$$;

create or replace function public.get_payroll_eligible_rider_ids(p_cutoff_start date, p_cutoff_end date)
returns table (rider_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.riders r
  where p_cutoff_start is not null
    and p_cutoff_end is not null
    and p_cutoff_start <= p_cutoff_end
    and (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from generate_series(p_cutoff_start, p_cutoff_end, interval '1 day') d
      where public.is_rider_employed_on(r.id, d::date)
    )
  order by r.id
$$;

revoke all on function public.get_rider_workforce_directory() from public, anon;
revoke all on function public.get_payroll_eligible_rider_ids(date, date) from public, anon;
grant execute on function public.get_rider_workforce_directory() to authenticated;
grant execute on function public.get_payroll_eligible_rider_ids(date, date) to authenticated;

create or replace function public.transition_employee_lifecycle(
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
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_resolved_boundary_count integer := 0;
  v_event_type text;
  v_existing public.activity_logs%rowtype;
begin
  if p_action not in ('archive', 'restore') or p_request_id is null then
    raise exception 'Invalid employment lifecycle request.' using errcode = '22023';
  end if;

  v_event_type := case when p_action = 'archive' then 'employee_archived' else 'employee_restored' end;
  select * into v_existing
  from public.activity_logs
  where event_type = v_event_type
    and metadata->>'request_id' = p_request_id::text
    and metadata->>'target_user_id' = p_target_user_id::text
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', p_action);
  end if;

  select * into v_actor from public.users where id = p_actor_id;
  if not found or v_actor.role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'Admin or HR access is required.' using errcode = '42501';
  end if;

  select * into v_target from public.users where id = p_target_user_id for update;
  if not found then raise exception 'Target user was not found.' using errcode = 'P0002'; end if;
  if p_actor_id = p_target_user_id then
    raise exception 'You cannot archive or restore your own employment record.' using errcode = '42501';
  end if;
  if v_actor.role = 'hr'::public.user_role and v_target.role <> 'rider'::public.user_role then
    raise exception 'HR can manage rider employment only.' using errcode = '42501';
  end if;

  if p_action = 'archive' then
    if v_target.employment_status = 'archived'::public.employment_status then
      raise exception 'This employee is already archived.' using errcode = 'P0001';
    end if;
    if p_effective_date is null or p_effective_date > (now() at time zone 'Asia/Manila')::date then
      raise exception 'Archive effective date must be today or an earlier business date.' using errcode = '22023';
    end if;
    if p_reason is null or p_reason not in ('Resigned', 'Terminated', 'Contract Ended', 'Retired', 'Other') then
      raise exception 'Select a valid archive reason.' using errcode = '22023';
    end if;
    if p_reason = 'Other' and nullif(btrim(p_remarks), '') is null then
      raise exception 'Remarks are required when the archive reason is Other.' using errcode = '22023';
    end if;
    if v_target.rider_id is not null and exists (
      select 1 from public.attendance_logs a
      where a.rider_id = v_target.rider_id and a.time_in is not null and a.time_out is null
    ) then
      raise exception 'This Rider currently has an open attendance session. Resolve the attendance record before archiving.' using errcode = 'P0001';
    end if;
    if v_target.role = 'admin'::public.user_role and (
      select count(*) from public.users
      where role = 'admin'::public.user_role and status = 'active'::public.user_status
        and employment_status = 'active'::public.employment_status
    ) <= 1 then
      raise exception 'The last active Admin cannot be archived.' using errcode = 'P0001';
    end if;

    update public.users
    set employment_status = 'archived'::public.employment_status,
        archive_effective_date = p_effective_date,
        archive_reason = p_reason,
        archive_remarks = nullif(btrim(p_remarks), ''),
        archived_at = clock_timestamp(),
        archived_by = p_actor_id,
        restored_at = null,
        restored_by = null,
        restore_reason = null,
        status = 'suspended'::public.user_status,
        updated_at = clock_timestamp()
    where id = p_target_user_id;

    if v_target.rider_id is not null then
      update public.riders set status = 'offline'::public.rider_status, updated_at = clock_timestamp()
      where id = v_target.rider_id;

      update public.violations
      set resolved = true, resolved_at = coalesce(resolved_at, clock_timestamp())
      where rider_id = v_target.rider_id and type = 'boundary_exit'::public.violation_type and not resolved;
      get diagnostics v_resolved_boundary_count = row_count;
    end if;

    insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
    values (
      p_actor_id, v_target.rider_id, v_event_type,
      v_actor.full_name || ' archived employment for "' || v_target.full_name || '".',
      jsonb_build_object(
        'request_id', p_request_id, 'target_user_id', p_target_user_id,
        'previous_employment_status', v_target.employment_status, 'new_employment_status', 'archived',
        'previous_account_status', v_target.status, 'new_account_status', 'suspended',
        'effective_date', p_effective_date, 'reason', p_reason, 'remarks', nullif(btrim(p_remarks), ''),
        'retained_zone_id', (select zone_id from public.riders where id = v_target.rider_id),
        'resolved_boundary_exit_count', v_resolved_boundary_count, 'source', 'admin-user-actions'
      )
    );

    perform realtime.send(
      jsonb_build_object('userId', p_target_user_id, 'terminateAll', true, 'reason', 'employee_archived'),
      'terminate_sessions', 'user:' || p_target_user_id::text || ':session-control', true
    );
  else
    if v_target.employment_status <> 'archived'::public.employment_status then
      raise exception 'Only archived employment can be restored.' using errcode = 'P0001';
    end if;
    if nullif(btrim(p_reason), '') is null then
      raise exception 'A restore reason is required.' using errcode = '22023';
    end if;

    update public.users
    set employment_status = 'active'::public.employment_status,
        status = 'suspended'::public.user_status,
        restored_at = clock_timestamp(),
        restored_by = p_actor_id,
        restore_reason = btrim(p_reason),
        updated_at = clock_timestamp()
    where id = p_target_user_id;

    if v_target.rider_id is not null then
      update public.riders set status = 'offline'::public.rider_status, updated_at = clock_timestamp()
      where id = v_target.rider_id;
    end if;

    insert into public.activity_logs (user_id, rider_id, event_type, description, metadata)
    values (
      p_actor_id, v_target.rider_id, v_event_type,
      v_actor.full_name || ' restored employment for "' || v_target.full_name || '". Account reactivation is still required.',
      jsonb_build_object(
        'request_id', p_request_id, 'target_user_id', p_target_user_id,
        'previous_employment_status', 'archived', 'new_employment_status', 'active',
        'previous_account_status', v_target.status, 'new_account_status', 'suspended',
        'reason', btrim(p_reason), 'source', 'admin-user-actions'
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'idempotent', false, 'status', p_action,
                            'account_status', 'suspended', 'rider_status', 'offline');
end;
$$;

revoke all on function public.transition_employee_lifecycle(uuid, uuid, text, date, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.transition_employee_lifecycle(uuid, uuid, text, date, text, text, uuid)
  to service_role;

create or replace function public.enforce_user_employment_lifecycle_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (
    old.employment_status is distinct from new.employment_status
    or old.archive_effective_date is distinct from new.archive_effective_date
    or old.archive_reason is distinct from new.archive_reason
    or old.archive_remarks is distinct from new.archive_remarks
    or old.archived_at is distinct from new.archived_at
    or old.archived_by is distinct from new.archived_by
    or old.restored_at is distinct from new.restored_at
    or old.restored_by is distinct from new.restored_by
    or old.restore_reason is distinct from new.restore_reason
  ) and coalesce((select auth.role()), '') <> 'service_role'
    and (select auth.uid()) is not null then
    raise exception 'Employment lifecycle changes require the privileged account action service.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_employment_lifecycle_boundary() from public, anon, authenticated;
create trigger enforce_user_employment_lifecycle_boundary
before update of employment_status, archive_effective_date, archive_reason, archive_remarks,
  archived_at, archived_by, restored_at, restored_by, restore_reason
on public.users
for each row execute function public.enforce_user_employment_lifecycle_boundary();

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
    raise exception 'Archived or suspended Riders cannot create or change attendance.' using errcode = '42501';
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
    raise exception 'Archived or suspended Riders cannot submit location updates.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_parcel_employment_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or old.rider_id is distinct from new.rider_id or old.date is distinct from new.date)
     and not public.is_rider_employed_on(new.rider_id, new.date) then
    raise exception 'The Rider was not employed on the parcel work date.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_attendance_employment_eligibility() from public, anon, authenticated;
revoke all on function public.enforce_rider_location_employment_eligibility() from public, anon, authenticated;
revoke all on function public.enforce_parcel_employment_eligibility() from public, anon, authenticated;

create trigger trg_a_enforce_attendance_employment
before insert or update on public.attendance_logs
for each row execute function public.enforce_attendance_employment_eligibility();
create trigger trg_a_enforce_rider_location_employment
before insert on public.rider_locations
for each row execute function public.enforce_rider_location_employment_eligibility();
create trigger trg_a_enforce_parcel_employment
before insert or update on public.parcel_logs
for each row execute function public.enforce_parcel_employment_eligibility();

-- Existing policies keep their historical read paths. Only operational writes
-- gain employment-aware checks.
drop policy if exists "Rider can insert own attendance" on public.attendance_logs;
drop policy if exists "Rider can update own attendance" on public.attendance_logs;
drop policy if exists "Admin and HR can insert attendance" on public.attendance_logs;
create policy "Rider can insert own attendance"
on public.attendance_logs for insert to authenticated
with check (
  rider_id = (select public.get_my_rider_id())
  and public.is_rider_operational_at(rider_id, coalesce(time_in, date::timestamp at time zone 'Asia/Manila'))
);
create policy "Rider can update own attendance"
on public.attendance_logs for update to authenticated
using (rider_id = (select public.get_my_rider_id()))
with check (
  rider_id = (select public.get_my_rider_id())
  and public.is_rider_operational_at(rider_id, coalesce(time_out, time_in, date::timestamp at time zone 'Asia/Manila'))
);
create policy "Admin and HR can insert attendance"
on public.attendance_logs for insert to authenticated
with check (
  (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and public.is_rider_employed_on(rider_id, date)
);

drop policy if exists "Rider can insert own locations" on public.rider_locations;
create policy "Rider can insert own locations"
on public.rider_locations for insert to authenticated
with check (
  rider_id = (select public.get_my_rider_id())
  and public.is_rider_operational_at(rider_id, recorded_at)
);

drop policy if exists "Riders can update own profile" on public.riders;
drop policy if exists "Rider can update own profile" on public.riders;
drop policy if exists "Riders can update own record" on public.riders;
create policy "Rider can update own profile while employed"
on public.riders for update to authenticated
using (
  id = (select public.get_my_rider_id())
  and public.is_user_currently_employed((select auth.uid()))
)
with check (
  id = (select public.get_my_rider_id())
  and public.is_user_currently_employed((select auth.uid()))
);

drop policy if exists "Admin and HR can insert parcel logs" on public.parcel_logs;
create policy "Admin and HR can insert parcel logs"
on public.parcel_logs for insert to authenticated
with check (
  (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  and public.is_rider_employed_on(rider_id, date)
);

grant select (employment_status, archive_effective_date, archive_reason, archive_remarks,
  archived_at, archived_by, restored_at, restored_by, restore_reason, rider_id, status, role, full_name)
on public.users to service_role;
grant update (employment_status, archive_effective_date, archive_reason, archive_remarks,
  archived_at, archived_by, restored_at, restored_by, restore_reason, status, updated_at)
on public.users to service_role;
