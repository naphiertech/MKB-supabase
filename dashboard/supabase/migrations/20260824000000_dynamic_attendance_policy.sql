-- Dynamic Attendance Lateness Policy Migration
-- Enables effective-dated attendance late thresholds managed by Admin,
-- ensuring historical attendance records remain stable and are not retroactively reclassified.

create table public.attendance_policy_configurations (
  id uuid primary key default gen_random_uuid(),
  late_threshold time not null default '08:15:00',
  effective_from date not null,
  effective_until date,
  active boolean not null default true,
  change_reason text not null,
  created_by uuid references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_policy_configurations_date_order_check check (
    effective_until is null
    or effective_until >= effective_from
  ),
  constraint attendance_policy_configurations_reason_check check (
    nullif(btrim(change_reason), '') is not null
  ),
  constraint attendance_policy_configurations_no_active_overlap
    exclude using gist (
      daterange(
        effective_from,
        coalesce(effective_until, 'infinity'::date),
        '[]'
      ) with &&
    )
    where (active)
);

create index attendance_policy_configurations_effective_dates_idx
  on public.attendance_policy_configurations (effective_from, effective_until)
  where active;

create table public.attendance_policy_configuration_audit (
  id uuid primary key default gen_random_uuid(),
  policy_configuration_id uuid not null
    references public.attendance_policy_configurations(id) on delete cascade,
  action text not null check (action in ('INSERT', 'UPDATE', 'DEACTIVATE')),
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb,
  change_reason text not null
);

create index attendance_policy_configuration_audit_changed_by_idx
  on public.attendance_policy_configuration_audit (changed_by);

create index attendance_policy_configuration_audit_policy_id_idx
  on public.attendance_policy_configuration_audit (policy_configuration_id, changed_at desc);

-- Audit log trigger function
create or replace function public.record_attendance_policy_audit()
returns trigger
language plpgsql
security definer
as $$
declare
  actor_id uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.attendance_policy_configuration_audit (
      policy_configuration_id,
      action,
      changed_by,
      new_values,
      change_reason
    ) values (
      NEW.id,
      'INSERT',
      coalesce(NEW.created_by, actor_id),
      to_jsonb(NEW),
      NEW.change_reason
    );
    return NEW;
  elsif tg_op = 'UPDATE' then
    insert into public.attendance_policy_configuration_audit (
      policy_configuration_id,
      action,
      changed_by,
      old_values,
      new_values,
      change_reason
    ) values (
      NEW.id,
      case when not NEW.active and OLD.active then 'DEACTIVATE' else 'UPDATE' end,
      coalesce(NEW.updated_by, actor_id),
      to_jsonb(OLD),
      to_jsonb(NEW),
      NEW.change_reason
    );
    return NEW;
  end if;
  return null;
end;
$$;

create trigger attendance_policy_configurations_updated_at
  before update on public.attendance_policy_configurations
  for each row execute function public.handle_updated_at();

create trigger attendance_policy_configurations_audit
  after insert or update on public.attendance_policy_configurations
  for each row execute function public.record_attendance_policy_audit();

-- Historical safety: prevent modifying thresholds or effective dates of already-effective policies
create or replace function public.guard_attendance_policy_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if OLD.effective_from <= current_date then
      if NEW.late_threshold <> OLD.late_threshold or NEW.effective_from <> OLD.effective_from then
        raise exception 'Historical attendance policy cannot be modified once effective. Create a new future-dated policy instead.';
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    if OLD.effective_from <= current_date then
      raise exception 'Historical attendance policy cannot be deleted once effective.';
    end if;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger attendance_policy_immutability_guard
  before update or delete on public.attendance_policy_configurations
  for each row execute function public.guard_attendance_policy_immutability();

-- Row Level Security
alter table public.attendance_policy_configurations enable row level security;
alter table public.attendance_policy_configuration_audit enable row level security;

revoke all on table public.attendance_policy_configurations from anon;
revoke all on table public.attendance_policy_configuration_audit from anon;

grant select, insert, update on table public.attendance_policy_configurations to authenticated;
grant select on table public.attendance_policy_configuration_audit to authenticated;

create policy "Anyone authenticated can read attendance policies"
  on public.attendance_policy_configurations
  for select
  to authenticated
  using (true);

create policy "Admin can insert attendance policies"
  on public.attendance_policy_configurations
  for insert
  to authenticated
  with check ((select public.get_my_role()) = 'admin'::public.user_role);

create policy "Admin can update attendance policies"
  on public.attendance_policy_configurations
  for update
  to authenticated
  using ((select public.get_my_role()) = 'admin'::public.user_role)
  with check ((select public.get_my_role()) = 'admin'::public.user_role);

create policy "Admin can read attendance policy audit"
  on public.attendance_policy_configuration_audit
  for select
  to authenticated
  using ((select public.get_my_role()) = 'admin'::public.user_role);

-- Seed initial baseline policy covering all historical dates
insert into public.attendance_policy_configurations (
  late_threshold,
  effective_from,
  effective_until,
  active,
  change_reason,
  created_by,
  updated_by
)
select
  time '08:15:00',
  coalesce(
    (select min(date) from public.attendance_logs),
    date '1970-01-01'
  ),
  null,
  true,
  'Initial baseline attendance policy (Late after 08:15 AM)',
  null,
  null
where not exists (select 1 from public.attendance_policy_configurations);

-- Update v_attendance_summary with dynamic effective policy resolution
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
           or (a.time_in at time zone 'Asia/Manila')::time > coalesce(policy.late_threshold, time '08:15:00') then 'Late'
         when a.time_in is not null and a.time_out is not null then 'Complete'
         when a.time_in is not null then 'Incomplete'
         else 'Absent'
       end as hr_status,
       a.hub_id
from public.attendance_logs a
left join public.riders r on r.id = a.rider_id
left join public.zones z on z.id = r.zone_id
left join lateral (
  select p.late_threshold
  from public.attendance_policy_configurations p
  where p.active
    and p.effective_from <= a.date
    and (p.effective_until is null or p.effective_until >= a.date)
  order by p.effective_from desc
  limit 1
) policy on true;

grant select on public.v_attendance_summary to authenticated;

-- Update get_executive_analytics_summary() with dynamic effective policy resolution
create or replace function public.get_executive_analytics_summary(
  p_start_date date default ((current_date - '14 days'::interval))::date,
  p_end_date date default current_date,
  p_zone_id text default 'all'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
    select attendance.*,
           rider.zone_id,
           zone.name as zone_name,
           coalesce(policy.late_threshold, time '08:15:00') as late_threshold
    from public.attendance_logs attendance
    left join public.riders rider on rider.id = attendance.rider_id
    left join public.zones zone on zone.id = rider.zone_id
    left join lateral (
      select p.late_threshold
      from public.attendance_policy_configurations p
      where p.active
        and p.effective_from <= attendance.date
        and (p.effective_until is null or p.effective_until >= attendance.date)
      order by p.effective_from desc
      limit 1
    ) policy on true
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
           count(*) filter (where (time_in at time zone 'Asia/Manila')::time > late_threshold) as late_count,
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
