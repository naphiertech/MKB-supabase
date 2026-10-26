-- Enforce employment start date and post-17:00 Manila onboarding boundary in public.is_rider_employed_on,
-- and filter executive analytics and attendance_logs RLS by employment start date.

CREATE OR REPLACE FUNCTION public.is_rider_employed_on(p_rider_id uuid, p_business_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p_rider_id is null or p_business_date is null then false
    when exists (
      select 1
      from public.attendance_logs al
      where al.rider_id = p_rider_id
        and al.date = p_business_date
        and al.time_in is not null
    ) or exists (
      select 1
      from public.parcel_logs pl
      where pl.rider_id = p_rider_id
        and pl.date = p_business_date
    ) then true
    when not exists (select 1 from public.users u where u.rider_id = p_rider_id) then coalesce((
      select
        p_business_date >= greatest(
          coalesce(r.date_of_hire, (r.created_at at time zone 'Asia/Manila')::date),
          (r.created_at at time zone 'Asia/Manila')::date
        )
        and not (
          p_business_date = (r.created_at at time zone 'Asia/Manila')::date
          and (r.created_at at time zone 'Asia/Manila')::time >= time '17:00:00'
        )
      from public.riders r
      where r.id = p_rider_id
    ), false)
    else coalesce((
      select case
        when p_business_date < greatest(
          coalesce(
            r.date_of_hire,
            u.date_of_hire,
            (r.created_at at time zone 'Asia/Manila')::date,
            (u.created_at at time zone 'Asia/Manila')::date
          ),
          coalesce(
            (r.created_at at time zone 'Asia/Manila')::date,
            (u.created_at at time zone 'Asia/Manila')::date
          )
        ) then false
        when p_business_date = coalesce(
            (r.created_at at time zone 'Asia/Manila')::date,
            (u.created_at at time zone 'Asia/Manila')::date
          )
          and coalesce(
            (r.created_at at time zone 'Asia/Manila')::time,
            (u.created_at at time zone 'Asia/Manila')::time
          ) >= time '17:00:00' then false
        when u.archive_effective_date is null then u.employment_status = 'active'::public.employment_status
        when p_business_date < u.archive_effective_date then true
        when u.employment_status = 'archived'::public.employment_status then false
        when u.restored_at is not null
          then p_business_date >= (u.restored_at at time zone 'Asia/Manila')::date
        else false
      end
      from public.users u
      left join public.riders r on r.id = u.rider_id
      where u.rider_id = p_rider_id
    ), false)
  end
$function$;

CREATE OR REPLACE FUNCTION public.get_executive_analytics_summary(p_start_date date DEFAULT ((CURRENT_DATE - '14 days'::interval))::date, p_end_date date DEFAULT CURRENT_DATE, p_zone_id text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and public.is_rider_employed_on(attendance.rider_id, attendance.date)
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
$function$;

ALTER POLICY "Admin HR and payroll can read attendance"
  ON public.attendance_logs
  USING (
    ((SELECT public.get_my_role() AS get_my_role) = ANY (ARRAY['admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role]))
    AND public.is_rider_employed_on(rider_id, date)
  );

ALTER POLICY "Rider can read own attendance"
  ON public.attendance_logs
  USING (
    (rider_id = (SELECT public.get_my_rider_id() AS get_my_rider_id))
    AND public.is_rider_employed_on(rider_id, date)
  );
