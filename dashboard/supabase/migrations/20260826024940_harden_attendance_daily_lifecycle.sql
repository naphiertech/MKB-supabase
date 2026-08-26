-- Daily absence finalization is server-owned and uses the Manila business date.
-- The moment-aware private helper keeps the boundary deterministic for pgTAP;
-- the scheduled public entry point never accepts a historical target date.
create or replace function private.finalize_daily_attendance_for_moment(
  p_moment timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  business_date date;
  business_time time;
  inserted_count integer;
begin
  if p_moment is null then
    raise exception 'Attendance finalization moment is required.' using errcode = '22004';
  end if;

  business_date := (p_moment at time zone 'Asia/Manila')::date;
  business_time := (p_moment at time zone 'Asia/Manila')::time;

  if business_time < time '17:00:00' then
    return 0;
  end if;

  with inserted as (
    insert into public.attendance_logs (
      rider_id,
      date,
      time_in,
      time_out,
      status,
      source,
      notes
    )
    select
      rider.id,
      business_date,
      null,
      null,
      'absent'::public.attendance_status,
      'system'::public.attendance_source,
      'Auto-generated absent record by system cutoff'
    from public.riders rider
    where public.is_rider_employed_on(rider.id, business_date)
      and not exists (
        select 1
        from public.attendance_logs attendance
        where attendance.rider_id = rider.id
          and attendance.date = business_date
      )
    on conflict (rider_id, date) do nothing
    returning 1
  )
  select count(*)::integer into inserted_count from inserted;

  return inserted_count;
end;
$$;

revoke all on function private.finalize_daily_attendance_for_moment(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function private.finalize_daily_attendance_for_moment(timestamptz)
  to postgres;

create or replace function public.finalize_daily_attendance()
returns integer
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.finalize_daily_attendance_for_moment(clock_timestamp());
$$;

revoke all on function public.finalize_daily_attendance()
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_daily_attendance()
  to postgres;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'finalize-daily-attendance';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'finalize-daily-attendance',
    '*/5 * * * *',
    'select public.finalize_daily_attendance();'
  );
end;
$$;

-- Completion is independent from presence and punctuality. A previous Manila
-- work date without Time Out remains Present/Late while requiring review.
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
       a.hub_id,
       case
         when a.time_in is null then 'Absent'
         when a.time_out is not null then 'Complete'
         when a.date < (clock_timestamp() at time zone 'Asia/Manila')::date then 'Missing Time Out'
         else 'Active'
       end as completion_status
from public.attendance_logs a
left join public.riders r on r.id = a.rider_id
left join public.zones z on z.id = r.zone_id
left join lateral (
  select policy.late_threshold
  from public.attendance_policy_configurations policy
  where policy.active
    and policy.effective_from <= a.date
    and (policy.effective_until is null or policy.effective_until >= a.date)
  order by policy.effective_from desc
  limit 1
) policy on true;

grant select on public.v_attendance_summary to authenticated;
