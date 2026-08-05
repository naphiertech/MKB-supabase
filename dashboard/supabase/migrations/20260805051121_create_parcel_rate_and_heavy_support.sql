-- Phase 2.3: effective-dated parcel compensation and additive heavy-parcel
-- operational fields. Existing parcel values are preserved.

create table public.parcel_rate_configurations (
  id uuid primary key default gen_random_uuid(),
  early_standard_rate numeric(10, 2) not null,
  regular_standard_rate numeric(10, 2) not null,
  late_standard_rate numeric(10, 2) not null,
  heavy_parcel_rate numeric(10, 2) not null,
  heavy_threshold_kg numeric(8, 2) not null,
  effective_from date not null,
  effective_until date,
  active boolean not null default true,
  change_reason text not null,
  created_by uuid references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parcel_rate_configurations_positive_rates_check check (
    early_standard_rate >= 0
    and regular_standard_rate >= 0
    and late_standard_rate >= 0
    and heavy_parcel_rate >= 0
    and heavy_threshold_kg > 0
  ),
  constraint parcel_rate_configurations_date_order_check check (
    effective_until is null
    or effective_until >= effective_from
  ),
  constraint parcel_rate_configurations_reason_check check (
    nullif(btrim(change_reason), '') is not null
  ),
  constraint parcel_rate_configurations_no_active_overlap
    exclude using gist (
      daterange(
        effective_from,
        coalesce(effective_until, 'infinity'::date),
        '[]'
      ) with &&
    )
    where (active)
);

create index parcel_rate_configurations_effective_dates_idx
  on public.parcel_rate_configurations (effective_from, effective_until)
  where active;

create table public.parcel_rate_configuration_audit (
  id uuid primary key default gen_random_uuid(),
  rate_configuration_id uuid not null
    references public.parcel_rate_configurations(id) on delete restrict,
  action text not null,
  previous_values jsonb,
  new_values jsonb not null,
  effective_date date not null,
  changed_by uuid references public.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  reason text not null,
  constraint parcel_rate_configuration_audit_action_check check (
    action in ('created', 'updated', 'deactivated', 'reactivated')
  ),
  constraint parcel_rate_configuration_audit_reason_check check (
    nullif(btrim(reason), '') is not null
  )
);

create index parcel_rate_configuration_audit_config_idx
  on public.parcel_rate_configuration_audit (rate_configuration_id, changed_at desc);

create or replace function public.audit_parcel_rate_configuration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_action text;
begin
  if tg_op = 'INSERT' then
    audit_action := 'created';
  elsif old.active and not new.active then
    audit_action := 'deactivated';
  elsif not old.active and new.active then
    audit_action := 'reactivated';
  else
    audit_action := 'updated';
  end if;

  insert into public.parcel_rate_configuration_audit (
    rate_configuration_id,
    action,
    previous_values,
    new_values,
    effective_date,
    changed_by,
    changed_at,
    reason
  )
  values (
    new.id,
    audit_action,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new),
    new.effective_from,
    coalesce(new.updated_by, new.created_by, (select auth.uid())),
    now(),
    new.change_reason
  );

  return new;
end;
$$;

revoke all on function public.audit_parcel_rate_configuration()
  from public, anon, authenticated;

create trigger parcel_rate_configurations_updated_at
  before update on public.parcel_rate_configurations
  for each row
  execute function public.handle_updated_at();

create trigger parcel_rate_configurations_audit
  after insert or update on public.parcel_rate_configurations
  for each row
  execute function public.audit_parcel_rate_configuration();

alter table public.parcel_rate_configurations enable row level security;
alter table public.parcel_rate_configuration_audit enable row level security;

revoke all on table public.parcel_rate_configurations from anon;
revoke all on table public.parcel_rate_configuration_audit from anon;
revoke all on table public.parcel_rate_configurations from authenticated;
revoke all on table public.parcel_rate_configuration_audit from authenticated;

grant select, insert, update on table public.parcel_rate_configurations to authenticated;
grant select on table public.parcel_rate_configuration_audit to authenticated;

create policy "Admin HR and Payroll can read parcel rates"
  on public.parcel_rate_configurations
  for select
  to authenticated
  using (
    (select public.get_my_role()) in (
      'admin'::public.user_role,
      'hr'::public.user_role,
      'payroll'::public.user_role
    )
  );

create policy "Admin can create parcel rates"
  on public.parcel_rate_configurations
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) = 'admin'::public.user_role
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );

create policy "Admin can update parcel rates"
  on public.parcel_rate_configurations
  for update
  to authenticated
  using ((select public.get_my_role()) = 'admin'::public.user_role)
  with check (
    (select public.get_my_role()) = 'admin'::public.user_role
    and updated_by = (select auth.uid())
  );

create policy "Admin can read parcel rate audit"
  on public.parcel_rate_configuration_audit
  for select
  to authenticated
  using ((select public.get_my_role()) = 'admin'::public.user_role);

insert into public.parcel_rate_configurations (
  early_standard_rate,
  regular_standard_rate,
  late_standard_rate,
  heavy_parcel_rate,
  heavy_threshold_kg,
  effective_from,
  effective_until,
  active,
  change_reason,
  created_by,
  updated_by
)
select
  12.00,
  11.00,
  10.00,
  17.00,
  4.00,
  date '2026-01-01',
  null,
  true,
  'Initial confirmed MKB parcel compensation configuration',
  null,
  null
where not exists (
  select 1
  from public.parcel_rate_configurations
);

alter table public.parcel_logs
  add column heavy_parcels integer,
  add column rate_configuration_id uuid
    references public.parcel_rate_configurations(id) on delete restrict,
  add column heavy_rate numeric(10, 2),
  add column standard_earnings numeric(12, 2),
  add column heavy_earnings numeric(12, 2);

update public.parcel_logs
set
  heavy_parcels = 0,
  standard_earnings = coalesce(daily_gross, 0),
  heavy_earnings = 0
where
  heavy_parcels is null
  or standard_earnings is null
  or heavy_earnings is null;

alter table public.parcel_logs
  alter column heavy_parcels set default 0,
  alter column heavy_parcels set not null,
  alter column standard_earnings set default 0,
  alter column standard_earnings set not null,
  alter column heavy_earnings set default 0,
  alter column heavy_earnings set not null;

alter table public.parcel_logs
  add constraint parcel_logs_nonnegative_counts_check
  check (
    parcels >= 0
    and coalesce(assigned_parcels, 0) >= 0
    and coalesce(failed_parcels, 0) >= 0
    and coalesce(returned_parcels, 0) >= 0
    and heavy_parcels >= 0
  ) not valid;
alter table public.parcel_logs
  validate constraint parcel_logs_nonnegative_counts_check;

alter table public.parcel_correction_requests
  add column previous_heavy integer,
  add column requested_heavy integer;

update public.parcel_correction_requests
set
  previous_heavy = 0,
  requested_heavy = 0
where previous_heavy is null or requested_heavy is null;

alter table public.parcel_correction_requests
  alter column previous_heavy set default 0,
  alter column previous_heavy set not null,
  alter column requested_heavy set default 0,
  alter column requested_heavy set not null,
  add constraint parcel_correction_requests_heavy_nonnegative_check
    check (previous_heavy >= 0 and requested_heavy >= 0);

create or replace function public.enforce_parcel_correction_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'Parcel correction requests can only be reviewed once.';
  end if;

  if new.parcel_log_id is distinct from old.parcel_log_id
    or new.rider_id is distinct from old.rider_id
    or new.date is distinct from old.date
    or new.previous_delivered is distinct from old.previous_delivered
    or new.previous_failed is distinct from old.previous_failed
    or new.previous_returned is distinct from old.previous_returned
    or new.previous_heavy is distinct from old.previous_heavy
    or new.requested_delivered is distinct from old.requested_delivered
    or new.requested_failed is distinct from old.requested_failed
    or new.requested_returned is distinct from old.requested_returned
    or new.requested_heavy is distinct from old.requested_heavy
    or new.reason is distinct from old.reason
    or new.requested_by is distinct from old.requested_by
    or new.requested_at is distinct from old.requested_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Parcel correction request details are immutable after submission.';
  end if;

  return new;
end;
$$;

alter table public.parcel_log_audit
  add column old_heavy integer,
  add column new_heavy integer;

update public.parcel_log_audit
set
  old_heavy = 0,
  new_heavy = 0
where old_heavy is null or new_heavy is null;

alter table public.parcel_log_audit
  alter column old_heavy set default 0,
  alter column old_heavy set not null,
  alter column new_heavy set default 0,
  alter column new_heavy set not null,
  add constraint parcel_log_audit_heavy_nonnegative_check
    check (old_heavy >= 0 and new_heavy >= 0);

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
$$;

create trigger parcel_logs_apply_rate_configuration
  before insert or update of rider_id, date, parcels, heavy_parcels, rate, heavy_rate
  on public.parcel_logs
  for each row
  execute function public.apply_parcel_rate_configuration();
