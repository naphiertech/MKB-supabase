-- ============================================================================
-- Migration: 20261004170000_parcel_audit_hardening.sql
-- Description: Parcel Audit Hardening, Immutability, Delete-Protection,
--              Atomic Draft RPC, and Atomic Locked Correction Review
-- ============================================================================

-- 1. SCHEMA ENHANCEMENT: Add change_source to parcel_log_audit if missing
alter table public.parcel_log_audit
  add column if not exists change_source text;

-- 2. AUDIT IMMUTABILITY TRIGGER
create or replace function private.prevent_parcel_log_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE_RECORD: parcel_log_audit history is append-only and cannot be updated or deleted.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_parcel_log_audit_immutable on public.parcel_log_audit;
create trigger trg_parcel_log_audit_immutable
before update or delete on public.parcel_log_audit
for each row
execute function private.prevent_parcel_log_audit_mutation();

-- 3. PARCEL LOG DELETE PROTECTION TRIGGER
create or replace function private.prevent_parcel_logs_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'DELETE_FORBIDDEN: Deletion of parcel_logs is strictly prohibited. Use corrections to adjust historical records.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_prevent_parcel_logs_delete on public.parcel_logs;
create trigger trg_prevent_parcel_logs_delete
before delete on public.parcel_logs
for each row
execute function private.prevent_parcel_logs_delete();

-- 4. DATABASE AUDIT TRIGGER ON parcel_logs
create or replace function private.capture_parcel_log_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context_raw text;
  v_context jsonb := '{}'::jsonb;
  v_action_type varchar;
  v_changed_by uuid;
  v_approved_by uuid;
  v_correction_request_id uuid;
  v_reason text;
  v_change_source text;
  v_old_del int := 0;
  v_old_hvy int := 0;
  v_old_fail int := 0;
  v_old_ret int := 0;
  v_has_changes boolean := false;
begin
  -- Retrieve transaction-local writer context if set
  v_context_raw := current_setting('app.parcel_writer_context', true);
  if v_context_raw is not null and btrim(v_context_raw) <> '' then
    begin
      v_context := v_context_raw::jsonb;
    exception when others then
      v_context := '{}'::jsonb;
    end;
  end if;

  if TG_OP = 'INSERT' then
    v_has_changes := true;
    v_action_type := coalesce(nullif(v_context->>'action_type', ''), 'created');
    v_reason := coalesce(nullif(btrim(v_context->>'reason'), ''), 'Initial parcel count entry');
  elsif TG_OP = 'UPDATE' then
    v_old_del := coalesce(OLD.parcels, 0);
    v_old_hvy := coalesce(OLD.heavy_parcels, 0);
    v_old_fail := coalesce(OLD.failed_parcels, 0);
    v_old_ret := coalesce(OLD.returned_parcels, 0);

    if OLD.parcels is distinct from NEW.parcels
       or OLD.heavy_parcels is distinct from NEW.heavy_parcels
       or OLD.failed_parcels is distinct from NEW.failed_parcels
       or OLD.returned_parcels is distinct from NEW.returned_parcels
       or OLD.assigned_parcels is distinct from NEW.assigned_parcels
       or OLD.notes is distinct from NEW.notes
       or OLD.hub_id is distinct from NEW.hub_id
       or OLD.rate is distinct from NEW.rate
       or OLD.heavy_rate is distinct from NEW.heavy_rate
    then
      v_has_changes := true;
    end if;

    v_action_type := coalesce(nullif(v_context->>'action_type', ''), 'updated');
    v_reason := coalesce(nullif(btrim(v_context->>'reason'), ''), 'Direct operational edit');
  end if;

  if v_has_changes then
    -- Resolve actor: prefer context actor_id, then auth.uid(), then NEW.created_by
    if v_context ? 'actor_id' and (v_context->>'actor_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_changed_by := (v_context->>'actor_id')::uuid;
    else
      v_changed_by := coalesce(auth.uid(), NEW.created_by);
    end if;

    -- Resolve approver
    if v_context ? 'approved_by' and (v_context->>'approved_by') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_approved_by := (v_context->>'approved_by')::uuid;
    end if;

    -- Resolve correction request id
    if v_context ? 'correction_request_id' and (v_context->>'correction_request_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_correction_request_id := (v_context->>'correction_request_id')::uuid;
    end if;

    -- Resolve change source
    v_change_source := nullif(btrim(v_context->>'source'), '');

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
      correction_request_id,
      reason,
      changed_by,
      approved_by,
      hub_id,
      change_source,
      timestamp
    ) values (
      NEW.id,
      NEW.rider_id,
      NEW.date,
      v_old_del,
      v_old_hvy,
      v_old_fail,
      v_old_ret,
      coalesce(NEW.parcels, 0),
      coalesce(NEW.heavy_parcels, 0),
      coalesce(NEW.failed_parcels, 0),
      coalesce(NEW.returned_parcels, 0),
      v_action_type,
      v_correction_request_id,
      v_reason,
      v_changed_by,
      v_approved_by,
      coalesce(NEW.hub_id, OLD.hub_id),
      v_change_source,
      clock_timestamp()
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_capture_parcel_log_audit on public.parcel_logs;
create trigger trg_capture_parcel_log_audit
after insert or update on public.parcel_logs
for each row
execute function private.capture_parcel_log_audit();

-- 5. ATOMIC DRAFT / BATCH PARCEL ENTRY RPC
create or replace function public.save_daily_parcel_entries(
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.user_role := (select public.get_my_role());
  v_entry jsonb;
  v_rider_id uuid;
  v_date date;
  v_parcels int;
  v_heavy int;
  v_assigned int;
  v_failed int;
  v_returned int;
  v_notes text;
  v_reason text;
  v_existing record;
  v_counts_changed boolean;
  v_saved record;
  v_results jsonb := '[]'::jsonb;
begin
  -- Authorization check: Admin or HR only
  if v_actor_id is null or v_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can record or edit daily parcel entries.'
      using errcode = '42501';
  end if;

  if p_entries is null or jsonb_array_length(p_entries) = 0 then
    return '[]'::jsonb;
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_rider_id := (v_entry->>'riderId')::uuid;
    if v_rider_id is null and v_entry ? 'rider_id' then
      v_rider_id := (v_entry->>'rider_id')::uuid;
    end if;

    if v_rider_id is null then
      raise exception 'INVALID_PAYLOAD: riderId is required.' using errcode = '22004';
    end if;

    v_date := (v_entry->>'date')::date;
    if v_date is null then
      raise exception 'INVALID_PAYLOAD: date is required.' using errcode = '22004';
    end if;

    -- Hub scoping check
    if not private.user_can_access_rider(v_rider_id) then
      raise exception 'FORBIDDEN_HUB_SCOPE: You do not have permission to manage parcels for this rider.'
        using errcode = '42501';
    end if;

    -- Employment check
    if not public.is_rider_employed_on(v_rider_id, v_date) then
      raise exception 'RIDER_NOT_EMPLOYED: Rider was not actively employed on %.', v_date
        using errcode = '23514';
    end if;

    -- Values validation
    v_parcels := coalesce((v_entry->>'parcels')::int, 0);
    v_heavy := coalesce((v_entry->>'heavyParcels')::int, (v_entry->>'heavy_parcels')::int, 0);
    v_assigned := coalesce((v_entry->>'assignedParcels')::int, (v_entry->>'assigned_parcels')::int, 0);
    v_failed := coalesce((v_entry->>'failedDeliveries')::int, (v_entry->>'failed_parcels')::int, 0);
    v_returned := coalesce((v_entry->>'returnedParcels')::int, (v_entry->>'returned_parcels')::int, 0);
    v_notes := nullif(btrim(coalesce(v_entry->>'notes', '')), '');
    v_reason := btrim(coalesce(v_entry->>'reason', ''));

    if v_parcels < 0 or v_heavy < 0 or v_assigned < 0 or v_failed < 0 or v_returned < 0 then
      raise exception 'INVALID_PARCEL_COUNT: Parcel counts cannot be negative.' using errcode = '23514';
    end if;

    if v_heavy > v_parcels then
      raise exception 'INVALID_PARCEL_COUNT: Heavy parcels (%) cannot exceed standard delivered parcels (%).',
        v_heavy, v_parcels using errcode = '23514';
    end if;

    -- Cutoff lock check
    if exists (
      select 1
      from public.payroll_records pr
      where pr.rider_id = v_rider_id
        and v_date between pr.cutoff_start and pr.cutoff_end
        and pr.status in ('pending', 'approved', 'paid', 'flagged')
    ) then
      raise exception 'PAYROLL_PERIOD_LOCKED: Shift date % belongs to a payroll cutoff that is already locked.', v_date
        using errcode = '55P03';
    end if;

    -- Lock and check existing record
    select * into v_existing
    from public.parcel_logs
    where rider_id = v_rider_id and date = v_date
    for update;

    if v_existing.id is not null then
      -- Modifying existing record
      v_counts_changed := (
        v_existing.parcels <> v_parcels
        or v_existing.heavy_parcels <> v_heavy
        or coalesce(v_existing.failed_parcels, 0) <> v_failed
        or coalesce(v_existing.returned_parcels, 0) <> v_returned
        or coalesce(v_existing.assigned_parcels, 0) <> v_assigned
      );

      if v_counts_changed and v_reason = '' then
        raise exception 'MISSING_EDIT_REASON: A specific reason is required when modifying existing parcel counts.'
          using errcode = '23514';
      end if;

      perform set_config('app.parcel_writer_context', jsonb_build_object(
        'action_type', 'updated',
        'actor_id', v_actor_id,
        'reason', case when v_reason <> '' then v_reason else 'Direct operational edit in draft status' end,
        'source', 'draft_edit'
      )::text, true);

      update public.parcel_logs
      set parcels = v_parcels,
          heavy_parcels = v_heavy,
          assigned_parcels = v_assigned,
          failed_parcels = v_failed,
          returned_parcels = v_returned,
          notes = v_notes,
          updated_at = clock_timestamp()
      where id = v_existing.id
      returning * into v_saved;

    else
      -- Initial entry
      perform set_config('app.parcel_writer_context', jsonb_build_object(
        'action_type', 'created',
        'actor_id', v_actor_id,
        'reason', case when v_reason <> '' then v_reason else 'Initial parcel count entry' end,
        'source', 'initial_entry'
      )::text, true);

      insert into public.parcel_logs (
        rider_id,
        date,
        parcels,
        heavy_parcels,
        assigned_parcels,
        failed_parcels,
        returned_parcels,
        notes,
        created_by,
        created_at,
        updated_at
      ) values (
        v_rider_id,
        v_date,
        v_parcels,
        v_heavy,
        v_assigned,
        v_failed,
        v_returned,
        v_notes,
        v_actor_id,
        clock_timestamp(),
        clock_timestamp()
      ) returning * into v_saved;
    end if;

    v_results := v_results || jsonb_build_object(
      'id', v_saved.id,
      'rider_id', v_saved.rider_id,
      'date', v_saved.date,
      'parcels', v_saved.parcels,
      'heavy_parcels', v_saved.heavy_parcels,
      'assigned_parcels', v_saved.assigned_parcels,
      'failed_parcels', v_saved.failed_parcels,
      'returned_parcels', v_saved.returned_parcels,
      'notes', v_saved.notes,
      'rate', v_saved.rate,
      'heavy_rate', v_saved.heavy_rate,
      'standard_earnings', v_saved.standard_earnings,
      'heavy_earnings', v_saved.heavy_earnings,
      'daily_gross', v_saved.daily_gross,
      'rate_configuration_id', v_saved.rate_configuration_id,
      'hub_id', v_saved.hub_id
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.save_daily_parcel_entries(jsonb) from public, anon;
grant execute on function public.save_daily_parcel_entries(jsonb) to authenticated, service_role;

-- 6. ATOMIC LOCKED CORRECTION REVIEW RPC
create or replace function public.review_parcel_correction_request(
  p_request_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.user_role := (select public.get_my_role());
  v_request record;
  v_clean_decision varchar;
  v_clean_notes text;
  v_now timestamptz := clock_timestamp();
begin
  -- 1. Authorization: Admin only
  if v_actor_id is null or v_role <> 'admin'::public.user_role then
    raise exception 'UNAUTHORIZED: Only Admin can review parcel correction requests.'
      using errcode = '42501';
  end if;

  v_clean_decision := lower(btrim(coalesce(p_decision, '')));
  if v_clean_decision not in ('approved', 'rejected') then
    raise exception 'INVALID_DECISION: Decision must be approved or rejected.'
      using errcode = '22000';
  end if;

  v_clean_notes := nullif(btrim(coalesce(p_review_notes, '')), '');

  -- 2. Select and lock request
  select * into v_request
  from public.parcel_correction_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'CORRECTION_REQUEST_NOT_FOUND: Correction request % not found.', p_request_id
      using errcode = '23503';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'REQUEST_ALREADY_REVIEWED: Correction request % has already been %.',
      p_request_id, v_request.status using errcode = '55P03';
  end if;

  -- 3. Execute decision
  if v_clean_decision = 'approved' then
    -- Set writer context for parcel_logs audit trigger
    perform set_config('app.parcel_writer_context', jsonb_build_object(
      'action_type', 'correction_approved',
      'actor_id', v_request.requested_by,
      'approved_by', v_actor_id,
      'correction_request_id', v_request.id,
      'reason', v_request.reason,
      'source', 'locked_correction'
    )::text, true);

    -- Atomic update on parcel_logs (triggers private.capture_parcel_log_audit)
    update public.parcel_logs
    set parcels = v_request.requested_delivered,
        heavy_parcels = v_request.requested_heavy,
        failed_parcels = v_request.requested_failed,
        returned_parcels = v_request.requested_returned,
        updated_at = v_now
    where id = v_request.parcel_log_id;

    if not found then
      raise exception 'PARCEL_LOG_NOT_FOUND: Associated parcel log % does not exist.', v_request.parcel_log_id
        using errcode = '23503';
    end if;

    -- Update request status
    update public.parcel_correction_requests
    set status = 'approved',
        reviewed_by = v_actor_id,
        reviewed_at = v_now,
        review_notes = v_clean_notes,
        updated_at = v_now
    where id = v_request.id;

  else
    -- Rejected: No parcel_logs mutation.
    -- Append lifecycle audit entry for rejection.
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
      correction_request_id,
      reason,
      changed_by,
      approved_by,
      hub_id,
      change_source,
      timestamp
    ) values (
      v_request.parcel_log_id,
      v_request.rider_id,
      v_request.date,
      v_request.previous_delivered,
      v_request.previous_heavy,
      v_request.previous_failed,
      v_request.previous_returned,
      v_request.requested_delivered,
      v_request.requested_heavy,
      v_request.requested_failed,
      v_request.requested_returned,
      'correction_rejected',
      v_request.id,
      coalesce(v_clean_notes, v_request.reason),
      v_request.requested_by,
      v_actor_id,
      v_request.hub_id,
      'locked_correction',
      v_now
    );

    -- Update request status
    update public.parcel_correction_requests
    set status = 'rejected',
        reviewed_by = v_actor_id,
        reviewed_at = v_now,
        review_notes = v_clean_notes,
        updated_at = v_now
    where id = v_request.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'request_id', v_request.id,
    'status', v_clean_decision,
    'reviewed_by', v_actor_id,
    'reviewed_at', v_now,
    'parcel_log_id', v_request.parcel_log_id
  );
end;
$$;

revoke all on function public.review_parcel_correction_request(uuid, text, text) from public, anon;
grant execute on function public.review_parcel_correction_request(uuid, text, text) to authenticated, service_role;

-- 6b. ATOMIC LOCKED CORRECTION SUBMISSION RPC
create or replace function public.submit_parcel_correction_request(
  p_parcel_log_id uuid,
  p_requested_delivered integer,
  p_requested_heavy integer,
  p_requested_failed integer,
  p_requested_returned integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.user_role := (select public.get_my_role());
  v_log record;
  v_clean_reason text;
  v_request_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  -- 1. Authorization: Admin or HR only
  if v_actor_id is null or v_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can submit parcel correction requests.'
      using errcode = '42501';
  end if;

  -- 2. Validate reason
  v_clean_reason := btrim(coalesce(p_reason, ''));
  if v_clean_reason = '' then
    raise exception 'MISSING_CORRECTION_REASON: Reason is mandatory when submitting a parcel correction request.'
      using errcode = '23514';
  end if;

  -- 3. Validate requested counts
  if coalesce(p_requested_delivered, 0) < 0
     or coalesce(p_requested_heavy, 0) < 0
     or coalesce(p_requested_failed, 0) < 0
     or coalesce(p_requested_returned, 0) < 0
  then
    raise exception 'INVALID_PARCEL_COUNT: Parcel counts cannot be negative.'
      using errcode = '23514';
  end if;

  if coalesce(p_requested_heavy, 0) > coalesce(p_requested_delivered, 0) then
    raise exception 'INVALID_PARCEL_COUNT: Heavy parcels (%) cannot exceed standard delivered parcels (%).',
      p_requested_heavy, p_requested_delivered using errcode = '23514';
  end if;

  -- 4. Select and lock parcel log
  select * into v_log
  from public.parcel_logs
  where id = p_parcel_log_id
  for update;

  if v_log.id is null then
    raise exception 'PARCEL_LOG_NOT_FOUND: Parcel log % does not exist.', p_parcel_log_id
      using errcode = '23503';
  end if;

  -- 5. Hub scoping
  if not private.user_can_access_rider(v_log.rider_id) then
    raise exception 'FORBIDDEN_HUB_SCOPE: You do not have permission to manage parcels for this rider.'
      using errcode = '42501';
  end if;

  -- 6. Check for existing pending request
  if exists (
    select 1
    from public.parcel_correction_requests
    where parcel_log_id = p_parcel_log_id
      and status = 'pending'
  ) then
    raise exception 'PENDING_CORRECTION_EXISTS: A correction request is already pending for this parcel record.'
      using errcode = '23505';
  end if;

  -- 7. Insert correction request
  insert into public.parcel_correction_requests (
    parcel_log_id,
    rider_id,
    date,
    hub_id,
    previous_delivered,
    previous_heavy,
    previous_failed,
    previous_returned,
    requested_delivered,
    requested_heavy,
    requested_failed,
    requested_returned,
    reason,
    requested_by,
    requested_at,
    status
  ) values (
    v_log.id,
    v_log.rider_id,
    v_log.date,
    v_log.hub_id,
    coalesce(v_log.parcels, 0),
    coalesce(v_log.heavy_parcels, 0),
    coalesce(v_log.failed_parcels, 0),
    coalesce(v_log.returned_parcels, 0),
    p_requested_delivered,
    p_requested_heavy,
    p_requested_failed,
    p_requested_returned,
    v_clean_reason,
    v_actor_id,
    v_now,
    'pending'
  ) returning id into v_request_id;

  -- 8. Append correction_requested lifecycle audit entry in same atomic transaction
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
    correction_request_id,
    reason,
    changed_by,
    hub_id,
    change_source,
    timestamp
  ) values (
    v_log.id,
    v_log.rider_id,
    v_log.date,
    coalesce(v_log.parcels, 0),
    coalesce(v_log.heavy_parcels, 0),
    coalesce(v_log.failed_parcels, 0),
    coalesce(v_log.returned_parcels, 0),
    p_requested_delivered,
    p_requested_heavy,
    p_requested_failed,
    p_requested_returned,
    'correction_requested',
    v_request_id,
    v_clean_reason,
    v_actor_id,
    v_log.hub_id,
    'correction_request',
    v_now
  );

  return jsonb_build_object(
    'success', true,
    'request_id', v_request_id,
    'parcel_log_id', v_log.id,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.submit_parcel_correction_request(uuid, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.submit_parcel_correction_request(uuid, integer, integer, integer, integer, text) to authenticated, service_role;


-- 7. FMS WRITER COORDINATION (Eliminate duplicate audit inserts)
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

    -- Set transaction-local writer context before parcel_logs update
    perform set_config('app.parcel_writer_context', jsonb_build_object(
      'action_type', 'updated',
      'actor_id', actor,
      'reason', format('Confirmed from FMS Import Observation %s (Driver ID: %s)', p_observation_id, v_obs.external_driver_id),
      'source', 'fms_import'
    )::text, true);

    -- Update existing parcel_logs row (trigger captures audit)
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

  else
    if v_existing_log.id is not null then
      raise exception 'PARCEL_LOG_CONFLICT: A parcel log for % on % was created by another transaction since review.'
        , v_rider.name, v_obs.business_date
        using errcode = '40001';
    end if;

    v_returned := coalesce(p_returned, 0);

    -- Set transaction-local writer context before parcel_logs insert
    perform set_config('app.parcel_writer_context', jsonb_build_object(
      'action_type', 'created',
      'actor_id', actor,
      'reason', format('Created from FMS Import Observation %s (Driver ID: %s)', p_observation_id, v_obs.external_driver_id),
      'source', 'fms_import'
    )::text, true);

    -- Insert new parcel_logs row (trigger captures audit)
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
