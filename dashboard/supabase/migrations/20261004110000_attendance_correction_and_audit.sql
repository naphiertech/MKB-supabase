-- Forward-only migration: Attendance Correction & Audit History
-- Implements Phase 1 & Phase 2:
-- 1. Immutable attendance_log_audit table with full capture of old/new values, actor, reason, evidence.
-- 2. Deletion prevention trigger on attendance_logs to guarantee audit trail preservation.
-- 3. Audit capture trigger on attendance_logs with writer context propagation.
-- 4. Tagging of authoritative writers (face_scan_rpc, daily_finalizer).
-- 5. Authoritative correct_rider_attendance RPC with strict validation and hub-scoping.
-- 6. Authoritative get_attendance_log_audit_history query RPC.

-- ============================================================================
-- 1. ATTENDANCE LOG AUDIT TABLE
-- ============================================================================

create table if not exists public.attendance_log_audit (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id uuid not null references public.attendance_logs(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid references public.hubs(id) on delete restrict,
  business_date date not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'CORRECTION')),
  old_status public.attendance_status,
  new_status public.attendance_status,
  old_time_in timestamptz,
  new_time_in timestamptz,
  old_time_out timestamptz,
  new_time_out timestamptz,
  old_source public.attendance_source,
  new_source public.attendance_source,
  old_notes text,
  new_notes text,
  actor_id uuid references public.users(id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'system')),
  change_source text not null,
  correction_type text check (correction_type in ('forgot_time_in', 'forgot_time_out', 'app_device_issue', 'verified_attendance_error', 'authorized_correction', 'other')),
  reason text,
  evidence_reference text,
  recorded_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_attendance_log_audit_log_id on public.attendance_log_audit (attendance_log_id, recorded_at desc);
create index if not exists idx_attendance_log_audit_rider_date on public.attendance_log_audit (rider_id, business_date);
create index if not exists idx_attendance_log_audit_recorded_at on public.attendance_log_audit (recorded_at desc);

-- Immutability trigger: attendance_log_audit rows cannot be modified or deleted
create or replace function private.prevent_attendance_log_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE_RECORD: attendance_log_audit records cannot be updated or deleted.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_attendance_log_audit_immutable on public.attendance_log_audit;
create trigger trg_attendance_log_audit_immutable
before update or delete on public.attendance_log_audit
for each row
execute function private.prevent_attendance_log_audit_mutation();

revoke update, delete on public.attendance_log_audit from public, anon, authenticated;
grant select on public.attendance_log_audit to authenticated, service_role;

-- Row Level Security on attendance_log_audit
alter table public.attendance_log_audit enable row level security;

drop policy if exists "Authorized staff and riders can view attendance audit" on public.attendance_log_audit;
create policy "Authorized staff and riders can view attendance audit"
on public.attendance_log_audit for select to authenticated
using (private.user_can_access_rider(rider_id));

-- ============================================================================
-- 2. ATTENDANCE LOGS DELETION PREVENTION
-- ============================================================================

-- Attendance logs must never be deleted so audit history and foreign keys remain unbroken
create or replace function private.prevent_attendance_logs_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'DELETE_FORBIDDEN: Attendance logs cannot be deleted to preserve audit integrity.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_prevent_attendance_logs_delete on public.attendance_logs;
create trigger trg_prevent_attendance_logs_delete
before delete on public.attendance_logs
for each row
execute function private.prevent_attendance_logs_delete();

revoke delete on public.attendance_logs from public, anon, authenticated;

-- Direct table UPDATE on attendance_logs is blocked for client roles via RLS.
-- All modifications must flow through authoritative workflows:
-- 1. Biometric face-scan RPCs (record_my_time_in / record_my_time_out)
-- 2. Authoritative correction RPC (correct_rider_attendance)
-- 3. System cutoff finalizer (finalize_daily_attendance)
drop policy if exists "Admin and HR can update attendance" on public.attendance_logs;

-- ============================================================================
-- 3. CAPTURE TRIGGER ON ATTENDANCE_LOGS
-- ============================================================================

create or replace function private.capture_attendance_log_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context_raw text;
  v_context jsonb := '{}'::jsonb;
  v_change_source text;
  v_actor_type text;
  v_actor_id uuid;
  v_correction_type text;
  v_reason text;
  v_evidence_ref text;
  v_action text;
begin
  v_context_raw := nullif(current_setting('app.attendance_writer_context', true), '');
  if v_context_raw is not null then
    begin
      v_context := v_context_raw::jsonb;
    exception when others then
      v_context := '{}'::jsonb;
    end;
  end if;

  v_change_source := coalesce(v_context ->> 'change_source', 'unclassified_write');
  v_actor_type := coalesce(
    v_context ->> 'actor_type',
    case when auth.uid() is not null then 'user' else 'system' end
  );
  v_actor_id := nullif(v_context ->> 'actor_id', '')::uuid;
  if v_actor_id is null and v_actor_type = 'user' then
    v_actor_id := auth.uid();
  end if;
  v_correction_type := v_context ->> 'correction_type';
  v_reason := coalesce(
    v_context ->> 'reason',
    case when TG_OP = 'INSERT' then 'Attendance log created' else 'Attendance log updated' end
  );
  v_evidence_ref := v_context ->> 'evidence_reference';

  if v_change_source = 'attendance_correction' then
    v_action := 'CORRECTION';
  else
    v_action := TG_OP;
  end if;

  if TG_OP = 'INSERT' then
    insert into public.attendance_log_audit (
      attendance_log_id,
      rider_id,
      hub_id,
      business_date,
      action,
      old_status,
      new_status,
      old_time_in,
      new_time_in,
      old_time_out,
      new_time_out,
      old_source,
      new_source,
      old_notes,
      new_notes,
      actor_id,
      actor_type,
      change_source,
      correction_type,
      reason,
      evidence_reference,
      recorded_at
    ) values (
      NEW.id,
      NEW.rider_id,
      NEW.hub_id,
      NEW.date,
      v_action,
      null,
      NEW.status,
      null,
      NEW.time_in,
      null,
      NEW.time_out,
      null,
      NEW.source,
      null,
      NEW.notes,
      v_actor_id,
      v_actor_type,
      v_change_source,
      v_correction_type,
      v_reason,
      v_evidence_ref,
      clock_timestamp()
    );
  elsif TG_OP = 'UPDATE' then
    if v_action = 'CORRECTION'
       or OLD.status is distinct from NEW.status
       or OLD.time_in is distinct from NEW.time_in
       or OLD.time_out is distinct from NEW.time_out
       or OLD.source is distinct from NEW.source
       or OLD.notes is distinct from NEW.notes
       or OLD.hub_id is distinct from NEW.hub_id
    then
      insert into public.attendance_log_audit (
        attendance_log_id,
        rider_id,
        hub_id,
        business_date,
        action,
        old_status,
        new_status,
        old_time_in,
        new_time_in,
        old_time_out,
        new_time_out,
        old_source,
        new_source,
        old_notes,
        new_notes,
        actor_id,
        actor_type,
        change_source,
        correction_type,
        reason,
        evidence_reference,
        recorded_at
      ) values (
        NEW.id,
        NEW.rider_id,
        coalesce(NEW.hub_id, OLD.hub_id),
        NEW.date,
        v_action,
        OLD.status,
        NEW.status,
        OLD.time_in,
        NEW.time_in,
        OLD.time_out,
        NEW.time_out,
        OLD.source,
        NEW.source,
        OLD.notes,
        NEW.notes,
        v_actor_id,
        v_actor_type,
        v_change_source,
        v_correction_type,
        v_reason,
        v_evidence_ref,
        clock_timestamp()
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_capture_attendance_log_audit on public.attendance_logs;
create trigger trg_capture_attendance_log_audit
after insert or update on public.attendance_logs
for each row
execute function private.capture_attendance_log_audit();

-- ============================================================================
-- 4. TAGGING KNOWN AUTHORITATIVE WRITERS
-- ============================================================================

-- Tag 1: private.finalize_daily_attendance_for_moment (daily_finalizer)
create or replace function private.finalize_daily_attendance_for_moment(
  p_moment timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  business_date date;
  business_time time;
  inserted_count integer;
begin
  if p_moment is null then
    raise exception 'Attendance finalization moment is required.' using errcode = '22004';
  end if;

  business_date := (p_moment at time zone 'Asia/Manila')::date;
  business_time := (p_moment at time zone 'Asia/Manila')::time;

  if business_time < time '17:00:00' then
    return 0;
  end if;

  perform set_config('app.attendance_writer_context', jsonb_build_object(
    'change_source', 'daily_finalizer',
    'actor_type', 'system',
    'actor_id', null,
    'reason', 'Auto-generated absent record by system cutoff'
  )::text, true);

  with inserted as (
    insert into public.attendance_logs (
      rider_id,
      date,
      time_in,
      time_out,
      status,
      source,
      notes
    )
    select
      rider.id,
      business_date,
      null,
      null,
      'absent'::public.attendance_status,
      'system'::public.attendance_source,
      'Auto-generated absent record by system cutoff'
    from public.riders rider
    where public.is_rider_employed_on(rider.id, business_date)
      and not exists (
        select 1
        from public.attendance_logs attendance
        where attendance.rider_id = rider.id
          and attendance.date = business_date
      )
    on conflict (rider_id, date) do nothing
    returning 1
  )
  select count(*)::integer into inserted_count from inserted;

  return inserted_count;
end;
$$;

-- Tag 2: public.record_my_time_in (face_scan_rpc)
create or replace function public.record_my_time_in(
  p_latitude float,
  p_longitude float,
  p_accuracy float default null,
  p_position_timestamp timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_rider_id uuid;
  manila_now timestamptz := private.get_attendance_clock();
  today_date date := (manila_now at time zone 'Asia/Manila')::date;
  today_time time := (manila_now at time zone 'Asia/Manila')::time;
  pos_ts timestamptz;
  v_hub_id uuid;
  v_hub_name text;
  v_distance float;
  v_radius integer;
  log_id uuid;
  existing_log record;
begin
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only active Riders can record attendance.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found for session.' using errcode = '23503';
  end if;

  if not public.is_rider_operational_at(actor_rider_id, manila_now) then
    raise exception 'RIDER_NOT_OPERATIONAL: Rider is not active or employed.' using errcode = '42501';
  end if;

  if today_time >= time '17:00:00' then
    raise exception 'ATTENDANCE_CLOSED: Today''s attendance has already been finalized.' using errcode = '23514';
  end if;

  pos_ts := coalesce(p_position_timestamp, manila_now);

  select v.hub_id, v.hub_name, v.distance_m, v.radius_m
  into v_hub_id, v_hub_name, v_distance, v_radius
  from private.validate_rider_hub_geofence(
    actor_rider_id,
    p_latitude,
    p_longitude,
    pos_ts,
    'time_in',
    today_date
  ) v;

  select id, time_in, time_out, source into existing_log
  from public.attendance_logs
  where rider_id = actor_rider_id and date = today_date;

  perform set_config('app.attendance_writer_context', jsonb_build_object(
    'change_source', 'face_scan_rpc',
    'actor_type', 'user',
    'actor_id', (select auth.uid()),
    'reason', 'Rider face scan Time In'
  )::text, true);

  if existing_log.id is not null then
    if existing_log.time_in is not null and existing_log.source <> 'system' then
      raise exception 'DUPLICATE_TIME_IN: Time In has already been recorded for today.' using errcode = '23505';
    end if;
    log_id := existing_log.id;
    update public.attendance_logs
    set time_in = manila_now,
        status = 'present'::public.attendance_status,
        source = 'face-scan'::public.attendance_source,
        notes = null,
        hub_id = v_hub_id,
        updated_at = manila_now
    where id = log_id;
  else
    log_id := gen_random_uuid();
    insert into public.attendance_logs (
      id, rider_id, hub_id, date, time_in, status, source, notes, created_at, updated_at
    ) values (
      log_id, actor_rider_id, v_hub_id, today_date, manila_now,
      'present'::public.attendance_status, 'face-scan'::public.attendance_source, null,
      manila_now, manila_now
    );
  end if;

  insert into public.attendance_geofence_events (
    attendance_log_id,
    rider_id,
    hub_id,
    event_type,
    latitude,
    longitude,
    accuracy_meters,
    distance_meters,
    attendance_radius_m,
    position_timestamp,
    recorded_at
  ) values (
    log_id,
    actor_rider_id,
    v_hub_id,
    'time_in',
    p_latitude,
    p_longitude,
    p_accuracy,
    v_distance,
    v_radius,
    pos_ts,
    manila_now
  )
  on conflict (attendance_log_id, event_type) do nothing;

  return jsonb_build_object(
    'attendance_log_id', log_id,
    'rider_id', actor_rider_id,
    'hub_id', v_hub_id,
    'hub_name', v_hub_name,
    'date', today_date,
    'time_in', manila_now,
    'distance_meters', round(v_distance::numeric, 1),
    'attendance_radius_m', v_radius,
    'status', 'present'
  );
end;
$$;

-- Tag 3: public.record_my_time_out (face_scan_rpc)
create or replace function public.record_my_time_out(
  p_latitude float,
  p_longitude float,
  p_accuracy float default null,
  p_position_timestamp timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_rider_id uuid;
  manila_now timestamptz := private.get_attendance_clock();
  today_date date := (manila_now at time zone 'Asia/Manila')::date;
  pos_ts timestamptz;
  v_hub_id uuid;
  v_hub_name text;
  v_distance float;
  v_radius integer;
  log_row record;
begin
  if (select public.get_my_role()) <> 'rider'::public.user_role then
    raise exception 'UNAUTHORIZED: Only active Riders can record attendance.' using errcode = '42501';
  end if;

  actor_rider_id := public.get_my_rider_id();
  if actor_rider_id is null then
    raise exception 'RIDER_PROFILE_NOT_FOUND: No linked Rider profile found for session.' using errcode = '23503';
  end if;

  if not public.is_rider_operational_at(actor_rider_id, manila_now) then
    raise exception 'RIDER_NOT_OPERATIONAL: Rider is not active or employed.' using errcode = '42501';
  end if;

  select id, time_in, time_out, hub_id into log_row
  from public.attendance_logs
  where rider_id = actor_rider_id and date = today_date;

  if log_row.id is null or log_row.time_in is null then
    raise exception 'NO_ACTIVE_SHIFT: No active Time In record found for today.' using errcode = '23514';
  end if;

  if log_row.time_out is not null then
    raise exception 'ALREADY_TIMED_OUT: Time Out has already been recorded for today.' using errcode = '23514';
  end if;

  pos_ts := coalesce(p_position_timestamp, manila_now);

  select v.hub_id, v.hub_name, v.distance_m, v.radius_m
  into v_hub_id, v_hub_name, v_distance, v_radius
  from private.validate_rider_hub_geofence(
    actor_rider_id,
    p_latitude,
    p_longitude,
    pos_ts,
    'time_out',
    today_date
  ) v;

  perform set_config('app.attendance_writer_context', jsonb_build_object(
    'change_source', 'face_scan_rpc',
    'actor_type', 'user',
    'actor_id', (select auth.uid()),
    'reason', 'Rider face scan Time Out'
  )::text, true);

  update public.attendance_logs
  set time_out = manila_now,
      updated_at = manila_now
  where id = log_row.id;

  insert into public.attendance_geofence_events (
    attendance_log_id,
    rider_id,
    hub_id,
    event_type,
    latitude,
    longitude,
    accuracy_meters,
    distance_meters,
    attendance_radius_m,
    position_timestamp,
    recorded_at
  ) values (
    log_row.id,
    actor_rider_id,
    v_hub_id,
    'time_out',
    p_latitude,
    p_longitude,
    p_accuracy,
    v_distance,
    v_radius,
    pos_ts,
    manila_now
  )
  on conflict (attendance_log_id, event_type) do nothing;

  return jsonb_build_object(
    'attendance_log_id', log_row.id,
    'rider_id', actor_rider_id,
    'hub_id', v_hub_id,
    'hub_name', v_hub_name,
    'date', today_date,
    'time_out', manila_now,
    'distance_meters', round(v_distance::numeric, 1),
    'attendance_radius_m', v_radius
  );
end;
$$;

-- ============================================================================
-- 5. AUTHORITATIVE ATTENDANCE CORRECTION RPC
-- ============================================================================

create or replace function public.correct_rider_attendance(
  p_rider_id uuid,
  p_date date,
  p_status public.attendance_status,
  p_correction_type text,
  p_reason text,
  p_time_in timestamptz default null,
  p_time_out timestamptz default null,
  p_evidence_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.user_role := (select public.get_my_role());
  v_rider record;
  v_existing_log record;
  v_hub_id uuid;
  v_final_time_in timestamptz;
  v_final_time_out timestamptz;
  v_log_id uuid;
  v_clean_reason text;
  v_clean_evidence text;
begin
  -- 1. Authorization check: Admin or HR only
  if actor_id is null or actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'UNAUTHORIZED: Only Admin and HR can correct attendance.' using errcode = '42501';
  end if;

  -- 2. Hub-scoping check for HR
  if not private.user_can_access_rider(p_rider_id) then
    raise exception 'FORBIDDEN_HUB_SCOPE: You do not have permission to correct attendance for this rider.' using errcode = '42501';
  end if;

  -- 3. Validate rider existence and employment on date
  select id, name, hub_id into v_rider
  from public.riders
  where id = p_rider_id;

  if v_rider.id is null then
    raise exception 'RIDER_NOT_FOUND: Rider does not exist.' using errcode = '23503';
  end if;

  if not public.is_rider_employed_on(p_rider_id, p_date) then
    raise exception 'RIDER_NOT_EMPLOYED: Rider was not actively employed on %.', p_date using errcode = '23514';
  end if;

  -- 4. Disallow manual manufacture of on_leave (approved leave remains authoritative via Leave & Absence workflow)
  if p_status = 'on_leave'::public.attendance_status then
    raise exception 'INVALID_CORRECTION_STATUS: Attendance correction cannot set status to on_leave. Leave must be approved through the Leave & Absence workflow.'
      using errcode = '23514';
  end if;

  -- 5. Validate correction type
  if p_correction_type not in ('forgot_time_in', 'forgot_time_out', 'app_device_issue', 'verified_attendance_error', 'authorized_correction', 'other') then
    raise exception 'INVALID_CORRECTION_TYPE: % is not an allowed correction type.', p_correction_type using errcode = '23514';
  end if;

  -- 6. Validate reason
  v_clean_reason := btrim(coalesce(p_reason, ''));
  if v_clean_reason = '' then
    raise exception 'MISSING_CORRECTION_REASON: A specific correction reason is required.' using errcode = '23514';
  end if;
  v_clean_evidence := nullif(btrim(coalesce(p_evidence_reference, '')), '');

  -- 7. Protect approved/paid payroll history
  if exists (
    select 1
    from public.payroll_records pr
    where pr.rider_id = p_rider_id
      and p_date between pr.cutoff_start and pr.cutoff_end
      and pr.status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
  ) then
    raise exception 'PAYROLL_COMMITTED: Attendance for % cannot be corrected because payroll has already been approved or paid for this cutoff.', p_date
      using errcode = '23514';
  end if;

  -- 8. Fetch existing attendance log if any
  select * into v_existing_log
  from public.attendance_logs
  where rider_id = p_rider_id and date = p_date;

  -- 9. Determine resolved timestamps based on status and correction type
  if p_status = 'absent'::public.attendance_status then
    if p_time_in is not null or p_time_out is not null then
      raise exception 'INVALID_ATTENDANCE_TIMESTAMPS: Absent records cannot have time_in or time_out.' using errcode = '23514';
    end if;
    v_final_time_in := null;
    v_final_time_out := null;
  else
    -- Status is present or late
    if p_correction_type = 'forgot_time_in' then
      if p_time_in is null then
        raise exception 'MISSING_TIME_IN: Corrected Time In is required for forgot_time_in correction.' using errcode = '23514';
      end if;
      v_final_time_in := p_time_in;
      v_final_time_out := coalesce(p_time_out, v_existing_log.time_out);
    elsif p_correction_type = 'forgot_time_out' then
      if p_time_out is null then
        raise exception 'MISSING_TIME_OUT: Corrected Time Out is required for forgot_time_out correction.' using errcode = '23514';
      end if;
      v_final_time_in := coalesce(p_time_in, v_existing_log.time_in);
      if v_final_time_in is null then
        raise exception 'MISSING_TIME_IN: Cannot record Time Out without an existing or provided Time In.' using errcode = '23514';
      end if;
      v_final_time_out := p_time_out;
    else
      -- Other types: app_device_issue, verified_attendance_error, authorized_correction, other
      v_final_time_in := coalesce(p_time_in, v_existing_log.time_in);
      v_final_time_out := coalesce(p_time_out, v_existing_log.time_out);
      if v_final_time_in is null then
        raise exception 'MISSING_TIME_IN: At least Time In is required for present or late attendance.' using errcode = '23514';
      end if;
    end if;
  end if;

  -- 10. Timestamp integrity checks
  if v_final_time_in is not null then
    if (v_final_time_in at time zone 'Asia/Manila')::date <> p_date then
      raise exception 'DATE_MISMATCH: Time In date (%) must match attendance date (%).',
        (v_final_time_in at time zone 'Asia/Manila')::date, p_date using errcode = '23514';
    end if;
  end if;

  if v_final_time_in is not null and v_final_time_out is not null and v_final_time_out < v_final_time_in then
    raise exception 'INVALID_TIMESTAMP_ORDER: Time Out cannot be earlier than Time In.' using errcode = '23514';
  end if;

  -- 11. Resolve hub assignment
  v_hub_id := coalesce(
    v_existing_log.hub_id,
    private.resolve_rider_attendance_hub(p_rider_id, p_date),
    v_rider.hub_id
  );

  -- 12. Set transaction-local writer context
  perform set_config('app.attendance_writer_context', jsonb_build_object(
    'change_source', 'attendance_correction',
    'actor_type', 'user',
    'actor_id', actor_id,
    'correction_type', p_correction_type,
    'reason', v_clean_reason,
    'evidence_reference', v_clean_evidence
  )::text, true);

  -- 13. Upsert attendance_logs row with manual source
  if v_existing_log.id is null then
    insert into public.attendance_logs (
      rider_id,
      hub_id,
      date,
      time_in,
      time_out,
      status,
      source,
      notes,
      created_at,
      updated_at
    ) values (
      p_rider_id,
      v_hub_id,
      p_date,
      v_final_time_in,
      v_final_time_out,
      p_status,
      'manual'::public.attendance_source,
      v_clean_reason,
      clock_timestamp(),
      clock_timestamp()
    ) returning id into v_log_id;
  else
    update public.attendance_logs
    set hub_id = v_hub_id,
        time_in = v_final_time_in,
        time_out = v_final_time_out,
        status = p_status,
        source = 'manual'::public.attendance_source,
        notes = v_clean_reason,
        updated_at = clock_timestamp()
    where id = v_existing_log.id
    returning id into v_log_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'attendance_log_id', v_log_id,
    'rider_id', p_rider_id,
    'rider_name', v_rider.name,
    'date', p_date,
    'status', p_status,
    'time_in', v_final_time_in,
    'time_out', v_final_time_out,
    'source', 'manual',
    'correction_type', p_correction_type,
    'reason', v_clean_reason,
    'evidence_reference', v_clean_evidence
  );
end;
$$;

revoke all on function public.correct_rider_attendance(uuid, date, public.attendance_status, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.correct_rider_attendance(uuid, date, public.attendance_status, text, text, timestamptz, timestamptz, text) to authenticated, service_role;

-- ============================================================================
-- 6. AUDIT HISTORY QUERY RPC
-- ============================================================================

create or replace function public.get_attendance_log_audit_history(
  p_attendance_log_id uuid default null,
  p_rider_id uuid default null,
  p_date date default null
)
returns table (
  id uuid,
  attendance_log_id uuid,
  rider_id uuid,
  rider_name text,
  hub_id uuid,
  hub_name text,
  business_date date,
  action text,
  old_status public.attendance_status,
  new_status public.attendance_status,
  old_time_in timestamptz,
  new_time_in timestamptz,
  old_time_out timestamptz,
  new_time_out timestamptz,
  old_source public.attendance_source,
  new_source public.attendance_source,
  old_notes text,
  new_notes text,
  actor_id uuid,
  actor_name text,
  actor_type text,
  change_source text,
  correction_type text,
  reason text,
  evidence_reference text,
  recorded_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'UNAUTHORIZED: Authentication required.' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.attendance_log_id,
    a.rider_id,
    r.name as rider_name,
    a.hub_id,
    h.name as hub_name,
    a.business_date,
    a.action,
    a.old_status,
    a.new_status,
    a.old_time_in,
    a.new_time_in,
    a.old_time_out,
    a.new_time_out,
    a.old_source,
    a.new_source,
    a.old_notes,
    a.new_notes,
    a.actor_id,
    coalesce(u.full_name, u.email, 'System') as actor_name,
    a.actor_type,
    a.change_source,
    a.correction_type,
    a.reason,
    a.evidence_reference,
    a.recorded_at
  from public.attendance_log_audit a
  left join public.riders r on r.id = a.rider_id
  left join public.hubs h on h.id = a.hub_id
  left join public.users u on u.id = a.actor_id
  where (p_attendance_log_id is null or a.attendance_log_id = p_attendance_log_id)
    and (p_rider_id is null or a.rider_id = p_rider_id)
    and (p_date is null or a.business_date = p_date)
    and private.user_can_access_rider(a.rider_id)
  order by a.recorded_at desc;
end;
$$;

revoke all on function public.get_attendance_log_audit_history(uuid, uuid, date) from public, anon;
grant execute on function public.get_attendance_log_audit_history(uuid, uuid, date) to authenticated, service_role;

-- ============================================================================
-- 7. EXPLICIT CORE TABLE GRANTS FOR AUTHENTICATED
-- ============================================================================

-- Ensure explicit least-privilege table grants on public.zones for authenticated users.
-- RLS policies remain strictly authoritative for all row-level access.
revoke all on table public.zones from anon, public;
grant select, insert, update, delete on table public.zones to authenticated;
