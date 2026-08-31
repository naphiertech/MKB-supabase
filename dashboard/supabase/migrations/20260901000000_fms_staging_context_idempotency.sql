-- Migration: 20260901000000_fms_staging_context_idempotency.sql
-- Description: Enforce context-aware idempotency for FMS delivery batch staging.
-- Same SHA + same business_date + same hub_id -> reuses existing batch.
-- Same SHA + different business_date OR different hub_id -> raises explicit FILE_ALREADY_STAGED error.

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

  -- Exact-file idempotency check by source_system and file_sha256
  select * into v_existing_batch
  from public.fms_import_batches
  where source_system = p_source_system and file_sha256 = p_file_sha256;

  if v_existing_batch.id is not null then
    -- Context conflict check: same file cannot be reused for a different date or hub
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

    -- Attempt resolving existing mapping automatically scoped by source_system and external_driver_id
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
