-- Migration: 20260830060000_fms_daily_import_foundation.sql
-- Description: Foundation schema, RLS, and server-authoritative RPCs for FMS Daily Import

-- 1. External Rider Mappings
create table if not exists public.external_rider_mappings (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'spx_fms' check (source_system in ('spx_fms')),
  external_driver_id text not null,
  external_display_name text,
  rider_id uuid not null references public.riders(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_external_rider_mappings unique (source_system, external_driver_id)
);

create index if not exists idx_external_rider_mappings_rider_id
  on public.external_rider_mappings (rider_id);

alter table public.external_rider_mappings enable row level security;

revoke all on table public.external_rider_mappings from anon, public;
grant select, insert, update on table public.external_rider_mappings to authenticated;

drop policy if exists "Admin and HR can manage external rider mappings" on public.external_rider_mappings;
create policy "Admin and HR can manage external rider mappings"
  on public.external_rider_mappings
  for all
  to authenticated
  using ((select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role))
  with check ((select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role));

drop policy if exists "Payroll can read external rider mappings" on public.external_rider_mappings;
create policy "Payroll can read external rider mappings"
  on public.external_rider_mappings
  for select
  to authenticated
  using ((select public.get_my_role()) = 'payroll'::public.user_role);

-- 2. FMS Import Batches
create table if not exists public.fms_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'spx_fms' check (source_system in ('spx_fms')),
  business_date date not null,
  filename text not null,
  file_sha256 text not null,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  imported_by uuid references public.users(id) on delete restrict,
  imported_at timestamptz not null default now(),
  source_row_count integer not null check (source_row_count >= 0),
  status text not null default 'staged' check (status in ('staged', 'partially_confirmed', 'confirmed', 'cancelled')),
  parser_version text not null default 'fms_delivery_v3.0',
  created_at timestamptz not null default now(),
  constraint uq_fms_import_batches_sha unique (source_system, file_sha256)
);

create index if not exists idx_fms_import_batches_hub_date
  on public.fms_import_batches (hub_id, business_date);

alter table public.fms_import_batches enable row level security;

revoke all on table public.fms_import_batches from anon, public;
grant select, insert, update on table public.fms_import_batches to authenticated;

drop policy if exists "Admin and HR can manage fms import batches" on public.fms_import_batches;
create policy "Admin and HR can manage fms import batches"
  on public.fms_import_batches
  for all
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and private.user_can_access_hub(hub_id)
  )
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and private.user_can_access_hub(hub_id)
  );

drop policy if exists "Payroll can read fms import batches" on public.fms_import_batches;
create policy "Payroll can read fms import batches"
  on public.fms_import_batches
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'payroll'::public.user_role
    and private.user_can_access_hub(hub_id)
  );

-- 3. FMS Daily Rider Observations
create table if not exists public.fms_daily_rider_observations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.fms_import_batches(id) on delete restrict,
  external_driver_id text not null,
  external_driver_name text,
  rider_id uuid references public.riders(id) on delete restrict,
  zone_id text,
  contract_type text,
  vehicle_type text,
  assigned integer not null default 0 check (assigned >= 0),
  assigned_target integer not null default 0 check (assigned_target >= 0),
  handed_over integer not null default 0 check (handed_over >= 0),
  delivered integer not null default 0 check (delivered >= 0),
  delivering integer not null default 0 check (delivering >= 0),
  failed_delivery integer not null default 0 check (failed_delivery >= 0),
  stuck_at_delivering integer not null default 0 check (stuck_at_delivering >= 0),
  on_hold integer not null default 0 check (on_hold >= 0),
  first_delivering_time timestamptz,
  first_delivering_time_raw text,
  time_since_last_delivery text,
  confirmation_status text not null default 'staged' check (confirmation_status in ('staged', 'confirmed', 'skipped')),
  confirmed_at timestamptz,
  confirmed_by uuid references public.users(id) on delete restrict,
  confirmed_standard_delivered integer,
  confirmed_heavy_delivered integer,
  confirmed_failed integer,
  confirmed_returned integer,
  parcel_log_id uuid references public.parcel_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_fms_daily_rider_obs_batch_driver unique (batch_id, external_driver_id)
);

create index if not exists idx_fms_daily_rider_obs_batch_id
  on public.fms_daily_rider_observations (batch_id);
create index if not exists idx_fms_daily_rider_obs_driver_id
  on public.fms_daily_rider_observations (external_driver_id);
create index if not exists idx_fms_daily_rider_obs_rider_id
  on public.fms_daily_rider_observations (rider_id);

alter table public.fms_daily_rider_observations enable row level security;

revoke all on table public.fms_daily_rider_observations from anon, public;
grant select, insert, update on table public.fms_daily_rider_observations to authenticated;

drop policy if exists "Admin and HR can manage fms daily rider observations" on public.fms_daily_rider_observations;
create policy "Admin and HR can manage fms daily rider observations"
  on public.fms_daily_rider_observations
  for all
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and exists (
      select 1 from public.fms_import_batches b
      where b.id = batch_id and private.user_can_access_hub(b.hub_id)
    )
  )
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and exists (
      select 1 from public.fms_import_batches b
      where b.id = batch_id and private.user_can_access_hub(b.hub_id)
    )
  );

drop policy if exists "Payroll can read fms daily rider observations" on public.fms_daily_rider_observations;
create policy "Payroll can read fms daily rider observations"
  on public.fms_daily_rider_observations
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'payroll'::public.user_role
    and exists (
      select 1 from public.fms_import_batches b
      where b.id = batch_id and private.user_can_access_hub(b.hub_id)
    )
  );

-- 4. Atomic Batch Staging RPC
create or replace function public.stage_fms_import_batch(
  p_source_system text,
  p_business_date date,
  p_filename text,
  p_file_sha256 text,
  p_hub_id uuid,
  p_source_row_count integer,
  p_observations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.user_role;
  v_existing_batch public.fms_import_batches%rowtype;
  v_batch_id uuid;
  v_obs jsonb;
  v_parsed_time timestamptz;
  v_mapped_rider_id uuid;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: Authentication required.' using errcode = '42501';
  end if;

  actor_role := (select public.get_my_role());
  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can stage FMS import batches.' using errcode = '42501';
  end if;

  if not private.user_can_access_hub_for(actor, p_hub_id) then
    raise exception 'HUB_UNAUTHORIZED: Hub % is outside your authorized Hub scope.', p_hub_id using errcode = '42501';
  end if;

  -- Exact-file idempotency: check if identical SHA-256 batch exists
  select * into v_existing_batch
  from public.fms_import_batches
  where source_system = p_source_system and file_sha256 = p_file_sha256;

  if v_existing_batch.id is not null then
    return jsonb_build_object(
      'success', true,
      'is_existing', true,
      'batch_id', v_existing_batch.id,
      'business_date', v_existing_batch.business_date,
      'filename', v_existing_batch.filename,
      'source_row_count', v_existing_batch.source_row_count,
      'status', v_existing_batch.status,
      'imported_at', v_existing_batch.imported_at
    );
  end if;

  insert into public.fms_import_batches (
    source_system,
    business_date,
    filename,
    file_sha256,
    hub_id,
    imported_by,
    source_row_count,
    status,
    parser_version
  )
  values (
    p_source_system,
    p_business_date,
    p_filename,
    p_file_sha256,
    p_hub_id,
    actor,
    p_source_row_count,
    'staged',
    'fms_delivery_v3.0'
  )
  returning id into v_batch_id;

  for v_obs in select * from jsonb_array_elements(p_observations)
  loop
    v_parsed_time := null;
    if nullif(trim(v_obs->>'first_delivering_time'), '') is not null then
      begin
        v_parsed_time := (v_obs->>'first_delivering_time')::timestamptz;
      exception when others then
        v_parsed_time := null;
      end;
    end if;

    -- Attempt resolving existing mapping automatically
    select rider_id into v_mapped_rider_id
    from public.external_rider_mappings
    where source_system = p_source_system
      and external_driver_id = (v_obs->>'external_driver_id');

    insert into public.fms_daily_rider_observations (
      batch_id,
      external_driver_id,
      external_driver_name,
      rider_id,
      zone_id,
      contract_type,
      vehicle_type,
      assigned,
      assigned_target,
      handed_over,
      delivered,
      delivering,
      failed_delivery,
      stuck_at_delivering,
      on_hold,
      first_delivering_time,
      first_delivering_time_raw,
      time_since_last_delivery,
      confirmation_status
    )
    values (
      v_batch_id,
      v_obs->>'external_driver_id',
      v_obs->>'external_driver_name',
      v_mapped_rider_id,
      v_obs->>'zone_id',
      v_obs->>'contract_type',
      v_obs->>'vehicle_type',
      coalesce((v_obs->>'assigned')::integer, 0),
      coalesce((v_obs->>'assigned_target')::integer, 0),
      coalesce((v_obs->>'handed_over')::integer, 0),
      coalesce((v_obs->>'delivered')::integer, 0),
      coalesce((v_obs->>'delivering')::integer, 0),
      coalesce((v_obs->>'failed_delivery')::integer, 0),
      coalesce((v_obs->>'stuck_at_delivering')::integer, 0),
      coalesce((v_obs->>'on_hold')::integer, 0),
      v_parsed_time,
      v_obs->>'first_delivering_time_raw',
      v_obs->>'time_since_last_delivery',
      'staged'
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'is_existing', false,
    'batch_id', v_batch_id,
    'business_date', p_business_date,
    'filename', p_filename,
    'source_row_count', p_source_row_count,
    'status', 'staged'
  );
end;
$$;

revoke all on function public.stage_fms_import_batch(text, date, text, text, uuid, integer, jsonb) from anon, public;
grant execute on function public.stage_fms_import_batch(text, date, text, text, uuid, integer, jsonb) to authenticated;

-- 5. Atomic Confirmation RPC with Strict OCC
create or replace function public.confirm_fms_daily_rider_observation(
  p_observation_id uuid,
  p_heavy_delivered integer,
  p_failed integer default null,
  p_returned integer default null,
  p_expected_log_updated_at timestamptz default null,
  p_is_existing_record boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.user_role;
  v_obs record;
  v_rider_id uuid;
  v_rider public.riders%rowtype;
  v_cutoff_start date;
  v_cutoff_end date;
  v_payroll_status public.payroll_status;
  v_standard_delivered integer;
  v_failed integer;
  v_returned integer;
  v_existing_log public.parcel_logs%rowtype;
  v_parcel_log_id uuid;
  v_confirmed_count integer;
  v_total_count integer;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: Authentication required.' using errcode = '42501';
  end if;

  actor_role := (select public.get_my_role());
  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can confirm parcel observations.' using errcode = '42501';
  end if;

  -- 1. Lock observation FOR UPDATE
  select obs.*, b.business_date, b.hub_id, b.status as batch_status
  into v_obs
  from public.fms_daily_rider_observations obs
  join public.fms_import_batches b on b.id = obs.batch_id
  where obs.id = p_observation_id
  for update of obs;

  if not found then
    raise exception 'OBSERVATION_NOT_FOUND: Observation % was not found.', p_observation_id using errcode = 'P0002';
  end if;

  if v_obs.confirmation_status = 'confirmed' then
    raise exception 'OBSERVATION_ALREADY_CONFIRMED: Observation % is already confirmed.', p_observation_id using errcode = '23505';
  end if;

  if v_obs.batch_status = 'cancelled' then
    raise exception 'BATCH_CANCELLED: Observation belongs to a cancelled import batch.' using errcode = '22000';
  end if;

  if not private.user_can_access_hub_for(actor, v_obs.hub_id) then
    raise exception 'HUB_UNAUTHORIZED: Hub % is outside your authorized Hub scope.', v_obs.hub_id using errcode = '42501';
  end if;

  -- 2. Resolve mapped Rider
  v_rider_id := v_obs.rider_id;
  if v_rider_id is null then
    select rider_id into v_rider_id
    from public.external_rider_mappings
    where source_system = 'spx_fms' and external_driver_id = v_obs.external_driver_id;
  end if;

  if v_rider_id is null then
    raise exception 'RIDER_UNMAPPED: FMS Driver % is not mapped to any MKBRiderTrack Rider.', v_obs.external_driver_id using errcode = 'P0002';
  end if;

  select * into v_rider from public.riders where id = v_rider_id;
  if not found then
    raise exception 'RIDER_NOT_FOUND: Rider % was not found.', v_rider_id using errcode = 'P0002';
  end if;

  if not private.user_can_access_hub_for(actor, v_rider.hub_id) then
    raise exception 'RIDER_HUB_UNAUTHORIZED: Rider % is outside your authorized Hub scope.', v_rider.name using errcode = '42501';
  end if;

  -- 3. Cutoff Period Lock Check
  if v_obs.business_date >= '2026-08-31'::date then
    v_cutoff_start := date_trunc('week', v_obs.business_date)::date;
    v_cutoff_end := (date_trunc('week', v_obs.business_date) + interval '6 days')::date;
  else
    if extract(day from v_obs.business_date) <= 15 then
      v_cutoff_start := date_trunc('month', v_obs.business_date)::date;
      v_cutoff_end := (date_trunc('month', v_obs.business_date) + interval '14 days')::date;
    else
      v_cutoff_start := (date_trunc('month', v_obs.business_date) + interval '15 days')::date;
      v_cutoff_end := (date_trunc('month', v_obs.business_date) + interval '1 month - 1 day')::date;
    end if;
  end if;

  select status into v_payroll_status
  from public.payroll_records
  where rider_id = v_rider_id and cutoff_start = v_cutoff_start;

  if v_payroll_status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status) then
    raise exception 'PAYROLL_PERIOD_LOCKED: Shift date % belongs to a % payroll period. Direct parcel updates are locked. Use Parcel Correction workflow.', v_obs.business_date, v_payroll_status::text using errcode = '55P03';
  end if;

  -- 4. Validate Classification: Standard + Heavy = Delivered
  if p_heavy_delivered < 0 or p_heavy_delivered > v_obs.delivered then
    raise exception 'INVALID_CLASSIFICATION: Heavy delivered (%) must be between 0 and total delivered (%).', p_heavy_delivered, v_obs.delivered using errcode = '22003';
  end if;

  v_standard_delivered := v_obs.delivered - p_heavy_delivered;
  v_failed := coalesce(p_failed, v_obs.failed_delivery, 0);
  if v_failed < 0 then
    raise exception 'INVALID_COUNT: Failed parcels cannot be negative.' using errcode = '22003';
  end if;

  -- 5. Mandatory OCC Enforcement on parcel_logs
  select * into v_existing_log
  from public.parcel_logs
  where rider_id = v_rider_id and date = v_obs.business_date
  for update;

  if p_is_existing_record then
    if v_existing_log.id is null then
      raise exception 'PARCEL_LOG_CONFLICT: The parcel record was deleted since it was reviewed. Refresh diff to review.' using errcode = '40001';
    end if;
    if p_expected_log_updated_at is null or v_existing_log.updated_at is distinct from p_expected_log_updated_at then
      raise exception 'PARCEL_LOG_CONFLICT: The parcel record was modified since it was reviewed (expected %, found %). Refresh diff to review.', p_expected_log_updated_at, v_existing_log.updated_at using errcode = '40001';
    end if;
    v_returned := coalesce(p_returned, v_existing_log.returned_parcels, 0);
  else
    if v_existing_log.id is not null then
      raise exception 'PARCEL_LOG_CONFLICT: A parcel record was created by another user since it was reviewed. Refresh diff to review.' using errcode = '40001';
    end if;
    v_returned := coalesce(p_returned, 0);
  end if;

  if v_returned < 0 then
    raise exception 'INVALID_COUNT: Returned parcels cannot be negative.' using errcode = '22003';
  end if;

  -- 6. Insert / Update parcel_logs with unique race protection
  begin
    if v_existing_log.id is not null then
      update public.parcel_logs
      set
        parcels = v_standard_delivered,
        heavy_parcels = p_heavy_delivered,
        failed_parcels = v_failed,
        returned_parcels = v_returned,
        assigned_parcels = coalesce(v_obs.assigned, assigned_parcels, 0),
        notes = case when notes is null or notes = '' then 'FMS Confirmed: ' || v_obs.external_driver_id else notes end,
        updated_at = now()
      where id = v_existing_log.id
      returning id into v_parcel_log_id;
    else
      insert into public.parcel_logs (
        rider_id,
        date,
        parcels,
        heavy_parcels,
        failed_parcels,
        returned_parcels,
        assigned_parcels,
        notes,
        created_by,
        updated_at
      )
      values (
        v_rider_id,
        v_obs.business_date,
        v_standard_delivered,
        p_heavy_delivered,
        v_failed,
        v_returned,
        v_obs.assigned,
        'FMS Confirmed: ' || v_obs.external_driver_id,
        actor,
        now()
      )
      returning id into v_parcel_log_id;
    end if;
  exception
    when unique_violation then
      raise exception 'PARCEL_LOG_CONFLICT: Concurrent parcel record creation detected for Rider % on %. Refresh diff to review.', v_rider.name, v_obs.business_date using errcode = '40001';
  end;

  -- 7. Structured Audit Append
  insert into public.parcel_log_audit (
    parcel_log_id,
    rider_id,
    date,
    old_delivered,
    old_heavy,
    old_failed,
    old_returned,
    new_delivered,
    new_heavy,
    new_failed,
    new_returned,
    action_type,
    reason,
    changed_by,
    timestamp
  )
  values (
    v_parcel_log_id,
    v_rider_id,
    v_obs.business_date,
    coalesce(v_existing_log.parcels, 0),
    coalesce(v_existing_log.heavy_parcels, 0),
    coalesce(v_existing_log.failed_parcels, 0),
    coalesce(v_existing_log.returned_parcels, 0),
    v_standard_delivered,
    p_heavy_delivered,
    v_failed,
    v_returned,
    case when v_existing_log.id is not null then 'updated' else 'created' end,
    'FMS Daily Import confirmed (Batch: ' || v_obs.batch_id::text || ', Driver: ' || v_obs.external_driver_id || ')',
    actor,
    now()
  );

  -- 8. Mark Observation Confirmed
  update public.fms_daily_rider_observations
  set
    rider_id = v_rider_id,
    confirmation_status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = actor,
    confirmed_standard_delivered = v_standard_delivered,
    confirmed_heavy_delivered = p_heavy_delivered,
    confirmed_failed = v_failed,
    confirmed_returned = v_returned,
    parcel_log_id = v_parcel_log_id
  where id = p_observation_id;

  -- 9. Update Batch Status
  select
    count(*) filter (where confirmation_status = 'confirmed'),
    count(*)
  into v_confirmed_count, v_total_count
  from public.fms_daily_rider_observations
  where batch_id = v_obs.batch_id;

  update public.fms_import_batches
  set status = case
    when v_confirmed_count = v_total_count then 'confirmed'
    when v_confirmed_count > 0 then 'partially_confirmed'
    else 'staged'
  end
  where id = v_obs.batch_id;

  -- 10. Refresh Server-Authoritative Weekly Payroll
  perform public.refresh_draft_payroll_for_rider_cutoff(
    v_rider_id,
    v_cutoff_start,
    v_cutoff_end
  );

  return jsonb_build_object(
    'success', true,
    'observation_id', p_observation_id,
    'parcel_log_id', v_parcel_log_id,
    'rider_id', v_rider_id,
    'business_date', v_obs.business_date,
    'standard_delivered', v_standard_delivered,
    'heavy_delivered', p_heavy_delivered,
    'failed', v_failed,
    'returned', v_returned
  );
end;
$$;

revoke all on function public.confirm_fms_daily_rider_observation(uuid, integer, integer, integer, timestamptz, boolean) from anon, public;
grant execute on function public.confirm_fms_daily_rider_observation(uuid, integer, integer, integer, timestamptz, boolean) to authenticated;
