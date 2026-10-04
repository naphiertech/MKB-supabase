-- Migration: 20261005000000_parcel_rate_bulky_tier_guardrails.sql
-- Description: Implement multi-tier bulky parcel rates (Early, Regular, Late) matching standard brackets,
-- authoritative rate progression guardrails (Early >= Regular >= Late), and payroll delivery snapshot compatibility.

-- 1. Extend parcel_rate_configurations with regular and late bulky rate columns
alter table public.parcel_rate_configurations
  add column if not exists regular_heavy_rate numeric(10, 2),
  add column if not exists late_heavy_rate numeric(10, 2);

-- 2. Backfill existing rate configurations:
-- Confirmed active production policy (Active, open-ended, Small 12/11/10 with bulky 17) gets 16.00 and 15.00.
-- Any historical or inactive configurations default regular/late to heavy_parcel_rate (preserving flat rate history).
update public.parcel_rate_configurations
set
  regular_heavy_rate = case
    when active
      and effective_until is null
      and early_standard_rate = 12.00
      and regular_standard_rate = 11.00
      and late_standard_rate = 10.00
      and heavy_parcel_rate = 17.00
    then 16.00
    else heavy_parcel_rate
  end,
  late_heavy_rate = case
    when active
      and effective_until is null
      and early_standard_rate = 12.00
      and regular_standard_rate = 11.00
      and late_standard_rate = 10.00
      and heavy_parcel_rate = 17.00
    then 15.00
    else heavy_parcel_rate
  end
where regular_heavy_rate is null or late_heavy_rate is null;

-- 3. Enforce not null on bulky rate columns
alter table public.parcel_rate_configurations
  alter column regular_heavy_rate set not null,
  alter column late_heavy_rate set not null;

-- 4. Default trigger for legacy/external writers omitting regular/late bulky rates
create or replace function public.handle_parcel_rate_configuration_defaults()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.regular_heavy_rate is null then
    new.regular_heavy_rate := new.heavy_parcel_rate;
  end if;
  if new.late_heavy_rate is null then
    new.late_heavy_rate := new.heavy_parcel_rate;
  end if;
  return new;
end;
$$;

create trigger trg_parcel_rate_configuration_defaults
  before insert or update on public.parcel_rate_configurations
  for each row
  execute function public.handle_parcel_rate_configuration_defaults();

-- 5. Add authoritative check constraints
alter table public.parcel_rate_configurations
  add constraint parcel_rate_configurations_heavy_rates_nonnegative_check
    check (regular_heavy_rate >= 0 and late_heavy_rate >= 0),
  add constraint parcel_rate_configurations_standard_rate_progression_check
    check (
      early_standard_rate >= regular_standard_rate
      and regular_standard_rate >= late_standard_rate
    ),
  add constraint parcel_rate_configurations_heavy_rate_progression_check
    check (
      heavy_parcel_rate >= regular_heavy_rate
      and regular_heavy_rate >= late_heavy_rate
    );

-- 6. Update rate resolution to evaluate both Small and Bulky rates against Manila Time In
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
  resolved_heavy_rate numeric(10, 2);
begin
  if tg_op = 'INSERT'
    or new.rider_id is distinct from old.rider_id
    or new.date is distinct from old.date
    or old.rate is null
    or old.rate_configuration_id is null
    or old.heavy_rate is null
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

    resolved_heavy_rate := case
      when local_time_in <= time '08:00' then rate_config.heavy_parcel_rate
      when local_time_in <= time '09:00' then coalesce(rate_config.regular_heavy_rate, rate_config.heavy_parcel_rate)
      else coalesce(rate_config.late_heavy_rate, rate_config.heavy_parcel_rate)
    end;

    new.rate := resolved_standard_rate;
    new.heavy_rate := resolved_heavy_rate;
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

      select (a.time_in at time zone 'Asia/Manila')::time
      into local_time_in
      from public.attendance_logs a
      where a.rider_id = new.rider_id
        and a.date = new.date
        and a.time_in is not null
      order by a.time_in
      limit 1;

      resolved_heavy_rate := case
        when local_time_in is not null and local_time_in <= time '08:00' then rate_config.heavy_parcel_rate
        when local_time_in is not null and local_time_in <= time '09:00' then coalesce(rate_config.regular_heavy_rate, rate_config.heavy_parcel_rate)
        else coalesce(rate_config.late_heavy_rate, rate_config.heavy_parcel_rate)
      end;

      new.heavy_rate := resolved_heavy_rate;
      new.rate_configuration_id := rate_config.id;
    end if;
  end if;

  new.standard_earnings := round(new.parcels * new.rate, 2);
  new.heavy_earnings := round(new.heavy_parcels * coalesce(new.heavy_rate, 0), 2);
  new.daily_gross := new.standard_earnings + new.heavy_earnings;

  return new;
end;
$$;

-- 7. Add bulky tier snapshot fields to payroll_records for future payroll proof
alter table public.payroll_records
  add column if not exists regular_heavy_rate_snapshot numeric(10, 2),
  add column if not exists late_heavy_rate_snapshot numeric(10, 2);

-- 8. Update payroll delivery snapshot trigger to capture regular and late bulky rates
create or replace function public.build_payroll_delivery_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rate_config public.parcel_rate_configurations%rowtype;
begin
  if old.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    and new.status = 'pending'::public.payroll_status
  then
    delete from public.payroll_delivery_lines
    where payroll_record_id = new.id;

    insert into public.payroll_delivery_lines (
      payroll_record_id,
      rider_id,
      date,
      standard_delivered,
      heavy_delivered,
      failed,
      returned,
      applied_standard_rate,
      applied_heavy_rate,
      standard_earnings,
      heavy_earnings,
      gross_delivery_pay,
      rate_configuration_id,
      calculation_version
    )
    select
      new.id,
      new.rider_id,
      calc.date,
      calc.standard_delivered,
      calc.heavy_delivered,
      calc.failed,
      calc.returned,
      calc.applied_standard_rate,
      calc.applied_heavy_rate,
      calc.standard_earnings,
      calc.heavy_earnings,
      calc.gross_delivery_pay,
      calc.rate_configuration_id,
      2
    from public.calculate_payroll_delivery_lines(
      new.rider_id,
      new.cutoff_start,
      new.cutoff_end
    ) calc
    order by calc.date;

    select
      coalesce(sum(pdl.standard_delivered), 0)::integer,
      coalesce(sum(pdl.heavy_delivered), 0)::integer,
      coalesce(sum(pdl.standard_earnings), 0),
      coalesce(sum(pdl.heavy_earnings), 0),
      coalesce(sum(pdl.gross_delivery_pay), 0)
    into
      new.standard_parcels,
      new.heavy_parcels,
      new.standard_earnings,
      new.heavy_earnings,
      new.gross_pay
    from public.payroll_delivery_lines pdl
    where pdl.payroll_record_id = new.id;

    new.total_parcels := new.standard_parcels + new.heavy_parcels;
    new.calculation_version := 2;
    new.snapshot_finalized_at := now();

    select c.*
    into rate_config
    from public.parcel_rate_configurations c
    where c.active
      and c.effective_from <= new.cutoff_end
      and (c.effective_until is null or c.effective_until >= new.cutoff_end)
    order by c.effective_from desc
    limit 1;

    if rate_config.id is not null then
      new.rate_configuration_id := rate_config.id;
      new.early_standard_rate_snapshot := rate_config.early_standard_rate;
      new.regular_standard_rate_snapshot := rate_config.regular_standard_rate;
      new.late_standard_rate_snapshot := rate_config.late_standard_rate;
      new.heavy_rate_snapshot := rate_config.heavy_parcel_rate;
      new.regular_heavy_rate_snapshot := rate_config.regular_heavy_rate;
      new.late_heavy_rate_snapshot := rate_config.late_heavy_rate;
      new.heavy_threshold_kg_snapshot := rate_config.heavy_threshold_kg;
      new.rate_per_parcel := coalesce(rate_config.regular_standard_rate, new.rate_per_parcel, 10.00);
    end if;
  elsif old.status = 'pending'::public.payroll_status
    and new.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
  then
    new.snapshot_finalized_at := null;
  end if;

  return new;
end;
$$;
