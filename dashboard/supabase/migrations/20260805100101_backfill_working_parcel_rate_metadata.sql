-- Repair the additive heavy-rate metadata for editable legacy parcel rows.
-- Existing standard counts, rates, earnings, and finalized payroll are preserved.

create or replace function public.apply_parcel_rate_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rate_config public.parcel_rate_configurations%rowtype;
  local_time_in time;
  resolved_standard_rate numeric(10, 2);
begin
  if tg_op = 'INSERT'
    or new.rider_id is distinct from old.rider_id
    or new.date is distinct from old.date
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

    resolved_standard_rate := case
      when local_time_in is not null and local_time_in <= time '08:00' then rate_config.early_standard_rate
      when local_time_in is not null and local_time_in <= time '09:00' then rate_config.regular_standard_rate
      else rate_config.late_standard_rate
    end;

    new.rate := resolved_standard_rate;
    new.heavy_rate := rate_config.heavy_parcel_rate;
    new.rate_configuration_id := rate_config.id;
  else
    new.rate := old.rate;

    if old.rate_configuration_id is null or old.heavy_rate is null then
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

      new.heavy_rate := coalesce(old.heavy_rate, rate_config.heavy_parcel_rate);
      new.rate_configuration_id := coalesce(old.rate_configuration_id, rate_config.id);
    else
      new.heavy_rate := old.heavy_rate;
      new.rate_configuration_id := old.rate_configuration_id;
    end if;
  end if;

  new.standard_earnings := round(new.parcels * new.rate, 2);
  new.heavy_earnings := round(new.heavy_parcels * coalesce(new.heavy_rate, 0), 2);
  new.daily_gross := new.standard_earnings + new.heavy_earnings;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.parcel_logs pl
    where (pl.heavy_rate is null or pl.rate_configuration_id is null)
      and not exists (
        select 1
        from public.payroll_records pr
        where pr.rider_id = pl.rider_id
          and pl.date between pr.cutoff_start and pr.cutoff_end
          and pr.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
      )
      and (
        pl.heavy_parcels <> 0
        or pl.standard_earnings is distinct from round(pl.parcels * pl.rate, 2)
        or pl.heavy_earnings is distinct from 0::numeric
        or pl.daily_gross is distinct from pl.standard_earnings
      )
  ) then
    raise exception 'Editable legacy parcel rows require manual review before rate metadata backfill.';
  end if;
end;
$$;

with eligible_rows as (
  select pl.id
  from public.parcel_logs pl
  where (pl.heavy_rate is null or pl.rate_configuration_id is null)
    and not exists (
      select 1
      from public.payroll_records pr
      where pr.rider_id = pl.rider_id
        and pl.date between pr.cutoff_start and pr.cutoff_end
        and pr.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
)
update public.parcel_logs pl
set heavy_rate = pl.heavy_rate
from eligible_rows eligible
where pl.id = eligible.id;

do $$
begin
  if exists (
    select 1
    from public.parcel_logs pl
    where (pl.heavy_rate is null or pl.rate_configuration_id is null)
      and not exists (
        select 1
        from public.payroll_records pr
        where pr.rider_id = pl.rider_id
          and pl.date between pr.cutoff_start and pr.cutoff_end
          and pr.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
      )
  ) then
    raise exception 'Editable parcel rate metadata backfill did not complete.';
  end if;
end;
$$;
