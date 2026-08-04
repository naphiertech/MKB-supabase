-- Align the live attendance source enum with the application. This restores
-- persisted system-generated absence rows without changing existing values.
alter type public.attendance_source add value if not exists 'system';

-- Existing production data was audited before validation: no rider/day
-- duplicates, orphan records, invalid coordinates, date mismatches, or
-- time-out-before-time-in rows were present.
alter table public.attendance_logs
  add constraint attendance_logs_event_order_check
  check (time_out is null or (time_in is not null and time_out >= time_in))
  not valid;

alter table public.attendance_logs
  add constraint attendance_logs_time_in_date_check
  check (time_in is null or date = (time_in at time zone 'Asia/Manila')::date)
  not valid;

alter table public.rider_locations
  add constraint rider_locations_latitude_check
  check (lat between -90 and 90)
  not valid;

alter table public.rider_locations
  add constraint rider_locations_longitude_check
  check (lng between -180 and 180)
  not valid;

alter table public.attendance_logs validate constraint attendance_logs_event_order_check;
alter table public.attendance_logs validate constraint attendance_logs_time_in_date_check;
alter table public.rider_locations validate constraint rider_locations_latitude_check;
alter table public.rider_locations validate constraint rider_locations_longitude_check;

-- RLS helpers are security-definer functions because they read public.users
-- from policies on related tables. Pin the search path and limit invocation to
-- authenticated sessions.
create or replace function public.get_my_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = (select auth.uid())
$$;

create or replace function public.get_my_rider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rider_id from public.users where id = (select auth.uid())
$$;

revoke all on function public.get_my_role() from public, anon;
revoke all on function public.get_my_rider_id() from public, anon;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_my_rider_id() to authenticated;

-- Data API privileges: unauthenticated clients have no attendance/location
-- access. Authenticated operations remain further restricted by RLS below.
revoke all on table public.attendance_logs from anon, authenticated;
revoke all on table public.rider_locations from anon, authenticated;
grant select, insert, update on table public.attendance_logs to authenticated;
grant select, insert on table public.rider_locations to authenticated;

drop policy if exists "Admin and HR can read all attendance" on public.attendance_logs;
drop policy if exists "Admin and HR can update any attendance" on public.attendance_logs;
drop policy if exists "Rider can insert own attendance" on public.attendance_logs;
drop policy if exists "Rider can read own attendance" on public.attendance_logs;
drop policy if exists "Rider can update own attendance" on public.attendance_logs;

create policy "Admin HR and payroll can read attendance"
on public.attendance_logs for select
to authenticated
using ((select public.get_my_role()) = any (array['admin'::public.user_role, 'hr'::public.user_role, 'payroll'::public.user_role]));

create policy "Admin and HR can update attendance"
on public.attendance_logs for update
to authenticated
using ((select public.get_my_role()) = any (array['admin'::public.user_role, 'hr'::public.user_role]))
with check ((select public.get_my_role()) = any (array['admin'::public.user_role, 'hr'::public.user_role]));

create policy "Rider can read own attendance"
on public.attendance_logs for select
to authenticated
using (rider_id = (select public.get_my_rider_id()));

create policy "Rider can insert own attendance"
on public.attendance_logs for insert
to authenticated
with check (rider_id = (select public.get_my_rider_id()));

create policy "Rider can update own attendance"
on public.attendance_logs for update
to authenticated
using (rider_id = (select public.get_my_rider_id()))
with check (rider_id = (select public.get_my_rider_id()));

drop policy if exists "Admin and HR can read all locations" on public.rider_locations;
drop policy if exists "Rider can insert own locations" on public.rider_locations;
drop policy if exists "Rider can read own locations" on public.rider_locations;

create policy "Admin and HR can read locations"
on public.rider_locations for select
to authenticated
using ((select public.get_my_role()) = any (array['admin'::public.user_role, 'hr'::public.user_role]));

create policy "Rider can read own locations"
on public.rider_locations for select
to authenticated
using (rider_id = (select public.get_my_rider_id()));

create policy "Rider can insert own locations"
on public.rider_locations for insert
to authenticated
with check (rider_id = (select public.get_my_rider_id()));
