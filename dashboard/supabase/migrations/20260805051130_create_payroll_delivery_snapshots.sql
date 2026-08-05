-- Phase 2.4: immutable payroll delivery snapshots. Existing financial columns
-- are never recalculated during the legacy backfill.

alter table public.payroll_records
  add column standard_parcels integer,
  add column heavy_parcels integer,
  add column standard_earnings numeric(12, 2),
  add column heavy_earnings numeric(12, 2),
  add column early_standard_rate_snapshot numeric(10, 2),
  add column regular_standard_rate_snapshot numeric(10, 2),
  add column late_standard_rate_snapshot numeric(10, 2),
  add column heavy_rate_snapshot numeric(10, 2),
  add column heavy_threshold_kg_snapshot numeric(8, 2),
  add column rate_configuration_id uuid
    references public.parcel_rate_configurations(id) on delete restrict,
  add column calculation_version integer,
  add column snapshot_finalized_at timestamptz;

-- Legacy backfill: copy only the values already stored on payroll_records.
-- Do not query attendance or parcel_logs and do not modify existing totals.
-- Existing workflow and timestamp triggers are suspended only for this
-- migration-owned backfill so paid rows can receive additive snapshot fields
-- without changing their legacy updated_at value.
alter table public.payroll_records disable trigger payroll_updated_at;
alter table public.payroll_records disable trigger trg_enforce_payroll_workflow_constraints;

update public.payroll_records
set
  standard_parcels = total_parcels,
  heavy_parcels = 0,
  standard_earnings = coalesce(gross_pay, 0),
  heavy_earnings = 0,
  calculation_version = 1,
  snapshot_finalized_at = case
    when status = 'paid'::public.payroll_status
      then coalesce(paid_at, approved_at, processed_at, updated_at)
    else null
  end
where
  standard_parcels is null
  or heavy_parcels is null
  or standard_earnings is null
  or heavy_earnings is null
  or calculation_version is null;

alter table public.payroll_records enable trigger trg_enforce_payroll_workflow_constraints;
alter table public.payroll_records enable trigger payroll_updated_at;

alter table public.payroll_records
  alter column standard_parcels set default 0,
  alter column standard_parcels set not null,
  alter column heavy_parcels set default 0,
  alter column heavy_parcels set not null,
  alter column standard_earnings set default 0,
  alter column standard_earnings set not null,
  alter column heavy_earnings set default 0,
  alter column heavy_earnings set not null,
  alter column calculation_version set default 1,
  alter column calculation_version set not null,
  add constraint payroll_records_snapshot_nonnegative_check check (
    standard_parcels >= 0
    and heavy_parcels >= 0
    and standard_earnings >= 0
    and heavy_earnings >= 0
    and calculation_version > 0
  );

create table public.payroll_delivery_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid not null
    references public.payroll_records(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete restrict,
  date date not null,
  standard_delivered integer not null default 0,
  heavy_delivered integer not null default 0,
  failed integer not null default 0,
  returned integer not null default 0,
  applied_standard_rate numeric(10, 2) not null,
  applied_heavy_rate numeric(10, 2),
  standard_earnings numeric(12, 2) not null default 0,
  heavy_earnings numeric(12, 2) not null default 0,
  gross_delivery_pay numeric(12, 2) not null default 0,
  rate_configuration_id uuid
    references public.parcel_rate_configurations(id) on delete restrict,
  calculation_version integer not null default 2,
  created_at timestamptz not null default now(),
  constraint payroll_delivery_lines_record_date_unique
    unique (payroll_record_id, date),
  constraint payroll_delivery_lines_counts_check check (
    standard_delivered >= 0
    and heavy_delivered >= 0
    and failed >= 0
    and returned >= 0
  ),
  constraint payroll_delivery_lines_amounts_check check (
    applied_standard_rate >= 0
    and coalesce(applied_heavy_rate, 0) >= 0
    and standard_earnings >= 0
    and heavy_earnings >= 0
    and gross_delivery_pay = standard_earnings + heavy_earnings
    and calculation_version > 0
  )
);

create index payroll_delivery_lines_record_idx
  on public.payroll_delivery_lines (payroll_record_id, date);
create index payroll_delivery_lines_rider_date_idx
  on public.payroll_delivery_lines (rider_id, date);
create index payroll_delivery_lines_rate_configuration_idx
  on public.payroll_delivery_lines (rate_configuration_id)
  where rate_configuration_id is not null;

alter table public.payroll_delivery_lines enable row level security;

revoke all on table public.payroll_delivery_lines from anon;
revoke all on table public.payroll_delivery_lines from authenticated;
grant select, insert, update, delete on table public.payroll_delivery_lines to authenticated;

create policy "Admin HR and Payroll can read payroll delivery lines"
  on public.payroll_delivery_lines
  for select
  to authenticated
  using (
    (select public.get_my_role()) in (
      'admin'::public.user_role,
      'hr'::public.user_role,
      'payroll'::public.user_role
    )
  );

create policy "Riders can read own finalized payroll delivery lines"
  on public.payroll_delivery_lines
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'rider'::public.user_role
    and rider_id = (select public.get_my_rider_id())
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_record_id
        and pr.status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
    )
  );

create policy "Admin and Payroll can create draft payroll delivery lines"
  on public.payroll_delivery_lines
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_record_id
        and pr.rider_id = rider_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  );

create policy "Admin and Payroll can update draft payroll delivery lines"
  on public.payroll_delivery_lines
  for update
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_record_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  )
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_record_id
        and pr.rider_id = rider_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  );

create policy "Admin and Payroll can delete draft payroll delivery lines"
  on public.payroll_delivery_lines
  for delete
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'payroll'::public.user_role)
    and exists (
      select 1
      from public.payroll_records pr
      where pr.id = payroll_record_id
        and pr.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    )
  );

create or replace function public.enforce_payroll_delivery_line_mutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_status public.payroll_status;
  target_record_id uuid;
begin
  target_record_id := case when tg_op = 'DELETE' then old.payroll_record_id else new.payroll_record_id end;

  select pr.status
  into parent_status
  from public.payroll_records pr
  where pr.id = target_record_id;

  if parent_status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
    raise exception 'Finalized payroll delivery lines are immutable.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger payroll_delivery_lines_immutable_after_finalize
  before insert or update or delete on public.payroll_delivery_lines
  for each row
  execute function public.enforce_payroll_delivery_line_mutability();

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
      pl.date,
      pl.parcels,
      pl.heavy_parcels,
      coalesce(pl.failed_parcels, 0),
      coalesce(pl.returned_parcels, 0),
      pl.rate,
      pl.heavy_rate,
      pl.standard_earnings,
      pl.heavy_earnings,
      pl.standard_earnings + pl.heavy_earnings,
      pl.rate_configuration_id,
      2
    from public.parcel_logs pl
    where pl.rider_id = new.rider_id
      and pl.date between new.cutoff_start and new.cutoff_end
    order by pl.date;

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
    end if;
  elsif old.status = 'pending'::public.payroll_status
    and new.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
  then
    new.snapshot_finalized_at := null;
  end if;

  return new;
end;
$$;

create trigger trg_build_payroll_delivery_snapshot
  before update of status on public.payroll_records
  for each row
  when (old.status is distinct from new.status)
  execute function public.build_payroll_delivery_snapshot();

create or replace function public.protect_payroll_snapshot_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
      raise exception 'Finalized payroll records cannot be deleted.';
    end if;
    return old;
  end if;

  if old.status = 'paid'::public.payroll_status then
    raise exception 'Paid payroll records are immutable.';
  end if;

  if old.snapshot_finalized_at is not null
    and new.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    and (
      new.rider_id is distinct from old.rider_id
      or new.cutoff_start is distinct from old.cutoff_start
      or new.cutoff_end is distinct from old.cutoff_end
      or new.total_parcels is distinct from old.total_parcels
      or new.rate_per_parcel is distinct from old.rate_per_parcel
      or new.gross_pay is distinct from old.gross_pay
      or new.standard_parcels is distinct from old.standard_parcels
      or new.heavy_parcels is distinct from old.heavy_parcels
      or new.standard_earnings is distinct from old.standard_earnings
      or new.heavy_earnings is distinct from old.heavy_earnings
      or new.early_standard_rate_snapshot is distinct from old.early_standard_rate_snapshot
      or new.regular_standard_rate_snapshot is distinct from old.regular_standard_rate_snapshot
      or new.late_standard_rate_snapshot is distinct from old.late_standard_rate_snapshot
      or new.heavy_rate_snapshot is distinct from old.heavy_rate_snapshot
      or new.heavy_threshold_kg_snapshot is distinct from old.heavy_threshold_kg_snapshot
      or new.rate_configuration_id is distinct from old.rate_configuration_id
      or new.calculation_version is distinct from old.calculation_version
      or new.snapshot_finalized_at is distinct from old.snapshot_finalized_at
    )
  then
    raise exception 'Finalized payroll calculation snapshots are immutable.';
  end if;

  return new;
end;
$$;

create trigger trg_a_protect_payroll_snapshot_immutability
  before update or delete on public.payroll_records
  for each row
  execute function public.protect_payroll_snapshot_immutability();
