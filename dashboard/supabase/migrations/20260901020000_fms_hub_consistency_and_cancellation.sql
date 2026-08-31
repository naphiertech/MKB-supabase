-- Migration: 20260901020000_fms_hub_consistency_and_cancellation.sql
-- Description: Enforce Hub consistency during FMS staging, support safe staged batch cancellation, and allow SHA reuse for cancelled batches.

-- 1. Replace unconditional unique constraint with partial unique index
alter table public.fms_import_batches
  drop constraint if exists uq_fms_import_batches_sha;

create unique index if not exists idx_fms_import_batches_active_sha
  on public.fms_import_batches (source_system, file_sha256)
  where status <> 'cancelled';

-- 2. Update stage_fms_import_batch to enforce Hub consistency on mapped riders and ignore cancelled batches
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
  v_existing_hub_name text;
  v_attempted_hub_name text;
  v_batch_id uuid;
  v_obs jsonb;
  v_parsed_time timestamptz;
  v_mapped_rider_id uuid;
  v_mapped_rider_name text;
  v_mapped_rider_mkb_id text;
  v_mapped_rider_hub_id uuid;
  v_mapped_rider_hub_name text;
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

  -- Exact-file idempotency check by source_system and file_sha256 for non-cancelled batches
  select * into v_existing_batch
  from public.fms_import_batches
  where source_system = p_source_system
    and file_sha256 = p_file_sha256
    and status <> 'cancelled';

  if v_existing_batch.id is not null then
    -- Context conflict check: same active file cannot be reused for a different date or hub
    if v_existing_batch.business_date is distinct from p_business_date
      or v_existing_batch.hub_id is distinct from p_hub_id then
      
      select name into v_existing_hub_name from public.hubs where id = v_existing_batch.hub_id;
      select name into v_attempted_hub_name from public.hubs where id = p_hub_id;

      raise exception 'FILE_ALREADY_STAGED: This delivery file was already staged for % at % (Batch ID: %). It cannot be reused for % at %.'
        , to_char(v_existing_batch.business_date, 'Mon DD, YYYY')
        , coalesce(v_existing_hub_name, v_existing_batch.hub_id::text)
        , v_existing_batch.id
        , to_char(p_business_date, 'Mon DD, YYYY')
        , coalesce(v_attempted_hub_name, p_hub_id::text)
        using errcode = '23505';
    end if;

    -- Context matches: safely return existing batch
    return jsonb_build_object(
      'success', true,
      'is_existing', true,
      'batch_id', v_existing_batch.id,
      'business_date', v_existing_batch.business_date,
      'hub_id', v_existing_batch.hub_id,
      'filename', v_existing_batch.filename,
      'source_row_count', v_existing_batch.source_row_count,
      'status', v_existing_batch.status,
      'imported_at', v_existing_batch.imported_at
    );
  end if;

  -- Preflight: Validate all automatically mapped riders belong to the target Hub
  for v_obs in select * from jsonb_array_elements(p_observations)
  loop
    select m.rider_id, r.name, r.mkb_id, r.hub_id, rh.name
    into v_mapped_rider_id, v_mapped_rider_name, v_mapped_rider_mkb_id, v_mapped_rider_hub_id, v_mapped_rider_hub_name
    from public.external_rider_mappings m
    join public.riders r on r.id = m.rider_id
    left join public.hubs rh on rh.id = r.hub_id
    where m.source_system = p_source_system
      and m.external_driver_id = (v_obs->>'external_driver_id');

    if v_mapped_rider_id is not null and v_mapped_rider_hub_id is distinct from p_hub_id then
      select name into v_attempted_hub_name from public.hubs where id = p_hub_id;

      raise exception 'FMS_RIDER_HUB_MISMATCH: Mapped Rider % (%) is assigned to % Hub, which does not match the selected Import Hub (%). Please select % Hub before staging this file.'
        , v_mapped_rider_name
        , coalesce(v_mapped_rider_mkb_id, 'No MKB ID')
        , coalesce(v_mapped_rider_hub_name, v_mapped_rider_hub_id::text)
        , coalesce(v_attempted_hub_name, p_hub_id::text)
        , coalesce(v_mapped_rider_hub_name, 'the correct')
        using errcode = '22000';
    end if;
  end loop;

  -- Create batch header
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

  -- Insert observations
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
    'hub_id', p_hub_id,
    'filename', p_filename,
    'source_row_count', p_source_row_count,
    'status', 'staged',
    'imported_at', now()
  );
end;
$$;

revoke all on function public.stage_fms_import_batch(text, date, text, text, uuid, integer, jsonb) from anon, public;
grant execute on function public.stage_fms_import_batch(text, date, text, text, uuid, integer, jsonb) to authenticated, service_role;

-- 3. Add cancel_fms_import_batch RPC
create or replace function public.cancel_fms_import_batch(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  actor_role public.user_role;
  v_batch public.fms_import_batches%rowtype;
  v_confirmed_count integer;
begin
  if actor is null then
    raise exception 'AUTH_REQUIRED: Authentication required.' using errcode = '42501';
  end if;

  actor_role := (select public.get_my_role());
  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can cancel FMS import batches.' using errcode = '42501';
  end if;

  select * into v_batch
  from public.fms_import_batches
  where id = p_batch_id;

  if v_batch.id is null then
    raise exception 'BATCH_NOT_FOUND: FMS Import batch % does not exist.', p_batch_id using errcode = 'P0002';
  end if;

  if not private.user_can_access_hub_for(actor, v_batch.hub_id) then
    raise exception 'HUB_UNAUTHORIZED: Hub % is outside your authorized Hub scope.', v_batch.hub_id using errcode = '42501';
  end if;

  if v_batch.status <> 'staged' then
    raise exception 'INVALID_BATCH_STATUS: Only staged batches can be cancelled (current status: %).', v_batch.status using errcode = '22000';
  end if;

  -- Ensure zero observations have been confirmed or linked to parcel_logs
  select count(*) into v_confirmed_count
  from public.fms_daily_rider_observations
  where batch_id = p_batch_id
    and (confirmation_status <> 'staged' or parcel_log_id is not null);

  if v_confirmed_count > 0 then
    raise exception 'BATCH_CANNOT_BE_CANCELLED: % observation(s) have already been confirmed. Confirmed batches cannot be cancelled.', v_confirmed_count using errcode = '22000';
  end if;

  -- Update batch status to cancelled (retaining historical observations and provenance)
  update public.fms_import_batches
  set status = 'cancelled'
  where id = p_batch_id;

  return jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'cancelled',
    'cancelled_at', now(),
    'cancelled_by', actor
  );
end;
$$;

revoke all on function public.cancel_fms_import_batch(uuid) from anon, public;
grant execute on function public.cancel_fms_import_batch(uuid) to authenticated, service_role;

-- 4. Update confirm_fms_daily_rider_observation with Hub consistency check
create or replace function public.confirm_fms_daily_rider_observation(
  p_observation_id uuid,
  p_heavy_delivered integer default 0,
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
  v_rider_hub_name text;
  v_batch_hub_name text;
  v_total_delivered integer;
  v_standard_delivered integer;
  v_failed integer;
  v_returned integer;
  v_existing_log public.parcel_logs%rowtype;
  v_new_log_id uuid;
  v_cutoff_start date;
  v_cutoff_end date;
  v_cutoff_locked boolean;
  v_unconfirmed_obs_count integer;
begin
  -- 1. Authorization
  if actor is null then
    raise exception 'AUTH_REQUIRED: Authentication required.' using errcode = '42501';
  end if;

  actor_role := (select public.get_my_role());
  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can confirm FMS observations.' using errcode = '42501';
  end if;

  -- Load Observation and Batch Context
  select
    o.id,
    o.batch_id,
    o.external_driver_id,
    o.external_driver_name,
    o.rider_id,
    o.assigned,
    o.delivered,
    o.failed_delivery,
    o.confirmation_status,
    o.parcel_log_id,
    b.business_date,
    b.hub_id
  into v_obs
  from public.fms_daily_rider_observations o
  join public.fms_import_batches b on b.id = o.batch_id
  where o.id = p_observation_id;

  if v_obs.id is null then
    raise exception 'OBSERVATION_NOT_FOUND: Observation % was not found.', p_observation_id using errcode = 'P0002';
  end if;

  if v_obs.confirmation_status = 'confirmed' then
    raise exception 'OBSERVATION_ALREADY_CONFIRMED: Observation % is already confirmed.', p_observation_id using errcode = '23505';
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

  -- Enforce Hub consistency between Rider and Batch
  if v_rider.hub_id is distinct from v_obs.hub_id then
    select name into v_rider_hub_name from public.hubs where id = v_rider.hub_id;
    select name into v_batch_hub_name from public.hubs where id = v_obs.hub_id;
    raise exception 'FMS_RIDER_HUB_MISMATCH: Rider % (%) is assigned to % Hub, but batch is staged for % Hub.',
      v_rider.name, coalesce(v_rider.mkb_id, 'No MKB ID'), coalesce(v_rider_hub_name, v_rider.hub_id::text), coalesce(v_batch_hub_name, v_obs.hub_id::text)
      using errcode = '22000';
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

  select exists (
    select 1
    from public.payroll_records pr
    where pr.rider_id = v_rider_id
      and pr.cutoff_start = v_cutoff_start
      and pr.cutoff_end = v_cutoff_end
      and pr.status in ('pending', 'approved', 'paid')
  ) into v_cutoff_locked;

  if v_cutoff_locked then
    raise exception 'PAYROLL_PERIOD_LOCKED: Shift date % belongs to a payroll cutoff (% to %) that is already in progress or finalized.',
      v_obs.business_date, v_cutoff_start, v_cutoff_end
      using errcode = '55P03';
  end if;

  -- 4. Calculate Standard vs Heavy Parcels
  v_total_delivered := coalesce(v_obs.delivered, 0);
  if p_heavy_delivered < 0 or p_heavy_delivered > v_total_delivered then
    raise exception 'INVALID_CLASSIFICATION: Heavy delivered (%) cannot be negative or exceed total delivered (%).',
      p_heavy_delivered, v_total_delivered
      using errcode = '22003';
  end if;

  v_standard_delivered := v_total_delivered - p_heavy_delivered;
  v_failed := coalesce(p_failed, v_obs.failed_delivery, 0);

  -- 5. Optimistic Concurrency Control (OCC) Check
  select * into v_existing_log
  from public.parcel_logs
  where rider_id = v_rider_id and date = v_obs.business_date;

  if p_is_existing_record then
    if v_existing_log.id is null then
      raise exception 'PARCEL_LOG_CONFLICT: Expected an existing parcel log to update, but none was found.'
        using errcode = '40001';
    end if;

    if p_expected_log_updated_at is not null and v_existing_log.updated_at is distinct from p_expected_log_updated_at then
      raise exception 'PARCEL_LOG_CONFLICT: The parcel record for % was modified by another transaction since it was reviewed (expected %, current %).'
        , v_rider.name, p_expected_log_updated_at, v_existing_log.updated_at
        using errcode = '40001';
    end if;

    v_returned := coalesce(p_returned, v_existing_log.returned_parcels, 0);

    -- Update existing parcel_logs row
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
    returning id into v_new_log_id;

    -- Record audit append
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
      v_new_log_id,
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
      'updated',
      format('Confirmed from FMS Import Observation %s (Driver ID: %s)', p_observation_id, v_obs.external_driver_id),
      actor,
      now()
    );

  else
    if v_existing_log.id is not null then
      raise exception 'PARCEL_LOG_CONFLICT: A parcel log for % on % was created by another transaction since review.'
        , v_rider.name, v_obs.business_date
        using errcode = '40001';
    end if;

    v_returned := coalesce(p_returned, 0);

    -- Insert new parcel_logs row
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
      created_at,
      updated_at
    )
    values (
      v_rider_id,
      v_obs.business_date,
      v_standard_delivered,
      p_heavy_delivered,
      v_failed,
      v_returned,
      coalesce(v_obs.assigned, 0),
      'FMS Confirmed: ' || v_obs.external_driver_id,
      actor,
      now(),
      now()
    )
    returning id into v_new_log_id;

    -- Record audit append
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
      v_new_log_id,
      v_rider_id,
      v_obs.business_date,
      0,
      0,
      0,
      0,
      v_standard_delivered,
      p_heavy_delivered,
      v_failed,
      v_returned,
      'created',
      format('Created from FMS Import Observation %s (Driver ID: %s)', p_observation_id, v_obs.external_driver_id),
      actor,
      now()
    );
  end if;

  -- 6. Mark Observation as Confirmed
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
    parcel_log_id = v_new_log_id
  where id = p_observation_id;

  -- 7. Update Batch Status
  select count(*) into v_unconfirmed_obs_count
  from public.fms_daily_rider_observations
  where batch_id = v_obs.batch_id and confirmation_status <> 'confirmed';

  if v_unconfirmed_obs_count = 0 then
    update public.fms_import_batches set status = 'confirmed' where id = v_obs.batch_id;
  else
    update public.fms_import_batches set status = 'partially_confirmed' where id = v_obs.batch_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'observation_id', p_observation_id,
    'parcel_log_id', v_new_log_id,
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
grant execute on function public.confirm_fms_daily_rider_observation(uuid, integer, integer, integer, timestamptz, boolean) to authenticated, service_role;
