-- Migration: 20260830210000_parcel_attendance_rate_integrity.sql
-- Description: Enforce official attendance Time In requirement on public.parcel_logs,
-- eliminating the NULL attendance late-rate fallback and raising PARCEL_ATTENDANCE_REQUIRED.

create or replace function public.apply_parcel_rate_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as 
declare
  rate_config public.parcel_rate_configurations%rowtype;
  local_time_in time;
  resolved_standard_rate numeric(10, 2);
begin
  if tg_op = 'INSERT'
    or new.rider_id is distinct from old.rider_id
    or new.date is distinct from old.date
    or old.rate is null
    or old.rate_configuration_id is null
  then
    select c.*
    into rate_config
    from public.parcel_rate_configurations c
    where c.active
      and c.effective_from <= new.date
      and (c.effective_until is null or c.effective_until >= new.date)
    order by c.effective_from desc
    limit 1;

    if rate_config.id is null then
      raise exception 'No active parcel rate configuration exists for %.', new.date;
    end if;

    select (a.time_in at time zone 'Asia/Manila')::time
    into local_time_in
    from public.attendance_logs a
    where a.rider_id = new.rider_id
      and a.date = new.date
      and a.time_in is not null
    order by a.time_in
    limit 1;

    if local_time_in is null then
      raise exception 'PARCEL_ATTENDANCE_REQUIRED: Rider % has no attendance Time In for %. Official attendance is required before recording parcel earnings.', new.rider_id, new.date using errcode = '22000';
    end if;

    resolved_standard_rate := case
      when local_time_in <= time '08:00' then rate_config.early_standard_rate
      when local_time_in <= time '09:00' then rate_config.regular_standard_rate
      else rate_config.late_standard_rate
    end;

    new.rate := resolved_standard_rate;
    new.heavy_rate := rate_config.heavy_parcel_rate;
    new.rate_configuration_id := rate_config.id;
  else
    new.rate := old.rate;
    new.heavy_rate := old.heavy_rate;
    new.rate_configuration_id := old.rate_configuration_id;

    if old.rate_configuration_id is null
      and new.heavy_parcels > 0
      and new.heavy_parcels is distinct from old.heavy_parcels
    then
      select c.*
      into rate_config
      from public.parcel_rate_configurations c
      where c.active
        and c.effective_from <= new.date
        and (c.effective_until is null or c.effective_until >= new.date)
      order by c.effective_from desc
      limit 1;

      if rate_config.id is null then
        raise exception 'No active heavy parcel rate configuration exists for %.', new.date;
      end if;

      new.heavy_rate := rate_config.heavy_parcel_rate;
      new.rate_configuration_id := rate_config.id;
    end if;
  end if;

  new.standard_earnings := round(new.parcels * new.rate, 2);
  new.heavy_earnings := round(new.heavy_parcels * coalesce(new.heavy_rate, 0), 2);
  new.daily_gross := new.standard_earnings + new.heavy_earnings;

  return new;
end;
;
