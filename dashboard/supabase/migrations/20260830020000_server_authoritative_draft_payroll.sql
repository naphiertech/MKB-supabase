-- Migration: 20260830020000_server_authoritative_draft_payroll.sql
-- Description: Server-authoritative draft payroll calculation primitive and refresh RPCs

-- 1. Calculation primitive returning authoritative daily delivery lines
create or replace function public.calculate_payroll_delivery_lines(
  p_rider_id uuid,
  p_cutoff_start date,
  p_cutoff_end date
)
returns table (
  date date,
  standard_delivered integer,
  heavy_delivered integer,
  failed integer,
  returned integer,
  applied_standard_rate numeric(10, 2),
  applied_heavy_rate numeric(10, 2),
  standard_earnings numeric(10, 2),
  heavy_earnings numeric(10, 2),
  gross_delivery_pay numeric(10, 2),
  rate_configuration_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pl.date,
    coalesce(pl.parcels, 0)::integer as standard_delivered,
    coalesce(pl.heavy_parcels, 0)::integer as heavy_delivered,
    coalesce(pl.failed_parcels, 0)::integer as failed,
    coalesce(pl.returned_parcels, 0)::integer as returned,
    coalesce(pl.rate, 0)::numeric(10, 2) as applied_standard_rate,
    coalesce(pl.heavy_rate, 0)::numeric(10, 2) as applied_heavy_rate,
    coalesce(pl.standard_earnings, round(coalesce(pl.parcels, 0) * coalesce(pl.rate, 0), 2))::numeric(10, 2) as standard_earnings,
    coalesce(pl.heavy_earnings, round(coalesce(pl.heavy_parcels, 0) * coalesce(pl.heavy_rate, 0), 2))::numeric(10, 2) as heavy_earnings,
    coalesce(pl.daily_gross, coalesce(pl.standard_earnings, 0) + coalesce(pl.heavy_earnings, 0))::numeric(10, 2) as gross_delivery_pay,
    pl.rate_configuration_id
  from public.parcel_logs pl
  where pl.rider_id = p_rider_id
    and pl.date between p_cutoff_start and p_cutoff_end
  order by pl.date;
$$;

revoke all on function public.calculate_payroll_delivery_lines(uuid, date, date) from public, anon;
grant execute on function public.calculate_payroll_delivery_lines(uuid, date, date) to authenticated, service_role;

-- 2. Calculation summary primitive returning aggregated header metrics & active rate metadata
create or replace function public.calculate_payroll_delivery_summary(
  p_rider_id uuid,
  p_cutoff_start date,
  p_cutoff_end date
)
returns table (
  standard_parcels integer,
  heavy_parcels integer,
  total_parcels integer,
  standard_earnings numeric(10, 2),
  heavy_earnings numeric(10, 2),
  gross_pay numeric(10, 2),
  rate_per_parcel numeric(10, 2),
  rate_configuration_id uuid,
  early_standard_rate_snapshot numeric(10, 2),
  regular_standard_rate_snapshot numeric(10, 2),
  late_standard_rate_snapshot numeric(10, 2),
  heavy_rate_snapshot numeric(10, 2),
  heavy_threshold_kg_snapshot numeric(10, 2)
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  rate_config public.parcel_rate_configurations%rowtype;
begin
  select c.*
  into rate_config
  from public.parcel_rate_configurations c
  where c.active
    and c.effective_from <= p_cutoff_end
    and (c.effective_until is null or c.effective_until >= p_cutoff_end)
  order by c.effective_from desc
  limit 1;

  return query
  select
    coalesce(sum(lines.standard_delivered), 0)::integer,
    coalesce(sum(lines.heavy_delivered), 0)::integer,
    coalesce(sum(lines.standard_delivered + lines.heavy_delivered), 0)::integer,
    coalesce(sum(lines.standard_earnings), 0)::numeric(10, 2),
    coalesce(sum(lines.heavy_earnings), 0)::numeric(10, 2),
    coalesce(sum(lines.gross_delivery_pay), 0)::numeric(10, 2),
    coalesce(rate_config.regular_standard_rate, max(lines.applied_standard_rate), 10.00)::numeric(10, 2),
    rate_config.id,
    rate_config.early_standard_rate,
    rate_config.regular_standard_rate,
    rate_config.late_standard_rate,
    rate_config.heavy_parcel_rate,
    rate_config.heavy_threshold_kg
  from public.calculate_payroll_delivery_lines(p_rider_id, p_cutoff_start, p_cutoff_end) lines;
end;
$$;

revoke all on function public.calculate_payroll_delivery_summary(uuid, date, date) from public, anon;
grant execute on function public.calculate_payroll_delivery_summary(uuid, date, date) to authenticated, service_role;

-- 3. Scoped Draft Refresh RPC using FOR UPDATE locking
create or replace function public.refresh_draft_payroll_record(
  p_payroll_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
  v_payroll public.payroll_records%rowtype;
  v_summary record;
begin
  actor := private.assert_payroll_adjustment_manager();

  select *
  into v_payroll
  from public.payroll_records
  where id = p_payroll_record_id
  for update;

  if not found then
    raise exception 'PAYROLL_RECORD_NOT_FOUND: Payroll record % was not found.', p_payroll_record_id
      using errcode = 'P0002';
  end if;

  if v_payroll.hub_id is not null and not private.user_can_access_hub_for(actor, v_payroll.hub_id) then
    raise exception 'PAYROLL_UNAUTHORIZED: Payroll record is outside your authorized Hub scope.'
      using errcode = '42501';
  end if;

  -- Refresh is permitted only while record is in Draft or Rejected status.
  -- If already Pending, Approved, or Paid, safely no-op without modifying any data.
  if v_payroll.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
    return jsonb_build_object(
      'success', false,
      'id', v_payroll.id,
      'status', v_payroll.status::text,
      'skipped', true,
      'reason', 'Record is in ' || v_payroll.status::text || ' status and cannot be recalculated as draft.'
    );
  end if;

  select *
  into v_summary
  from public.calculate_payroll_delivery_summary(
    v_payroll.rider_id,
    v_payroll.cutoff_start,
    v_payroll.cutoff_end
  );

  update public.payroll_records
  set
    standard_parcels = v_summary.standard_parcels,
    heavy_parcels = v_summary.heavy_parcels,
    total_parcels = v_summary.total_parcels,
    standard_earnings = v_summary.standard_earnings,
    heavy_earnings = v_summary.heavy_earnings,
    gross_pay = v_summary.gross_pay,
    rate_per_parcel = coalesce(v_summary.rate_per_parcel, rate_per_parcel, 10.00),
    calculation_version = 2,
    updated_at = now()
  where id = v_payroll.id;

  return jsonb_build_object(
    'success', true,
    'id', v_payroll.id,
    'status', v_payroll.status::text,
    'total_parcels', v_summary.total_parcels,
    'standard_parcels', v_summary.standard_parcels,
    'heavy_parcels', v_summary.heavy_parcels,
    'standard_earnings', v_summary.standard_earnings,
    'heavy_earnings', v_summary.heavy_earnings,
    'gross_pay', v_summary.gross_pay
  );
end;
$$;

revoke all on function public.refresh_draft_payroll_record(uuid) from public, anon;
grant execute on function public.refresh_draft_payroll_record(uuid) to authenticated, service_role;

-- 4. Rider + Cutoff Helper for Scoped Operations
create or replace function public.refresh_draft_payroll_for_rider_cutoff(
  p_rider_id uuid,
  p_cutoff_start date,
  p_cutoff_end date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payroll_id uuid;
begin
  select id into v_payroll_id
  from public.payroll_records
  where rider_id = p_rider_id
    and cutoff_start = p_cutoff_start
    and status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status);

  if v_payroll_id is null then
    return jsonb_build_object('success', false, 'skipped', true, 'reason', 'No draft or rejected payroll record found.');
  end if;

  return public.refresh_draft_payroll_record(v_payroll_id);
end;
$$;

revoke all on function public.refresh_draft_payroll_for_rider_cutoff(uuid, date, date) from public, anon;
grant execute on function public.refresh_draft_payroll_for_rider_cutoff(uuid, date, date) to authenticated, service_role;

-- 5. Update build_payroll_delivery_snapshot trigger to consume calculate_payroll_delivery_lines
create or replace function public.build_payroll_delivery_snapshot()
returns trigger
language plpgsql
security invoker
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
    from public.calculate_payroll_delivery_lines(new.rider_id, new.cutoff_start, new.cutoff_end) calc
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
