-- 20260830000000_weekly_payroll_and_payout_lag.sql
-- Implements Phase 2: Authoritative Monday-Sunday calendar week payroll model
-- with 1-week payout lag starting August 31, 2026.

create or replace function public.calculate_payroll_payable_date(
  p_cutoff_start date,
  p_cutoff_end date
)
returns date
language sql
immutable
as $$
  select case
    when p_cutoff_start >= '2026-08-31'::date then p_cutoff_end + 8
    else null
  end;
$$;

create or replace function public.is_payroll_payable(
  p_cutoff_start date,
  p_cutoff_end date,
  p_reference_date date default null
)
returns boolean
language plpgsql
stable
as $$
declare
  ref_date date;
  payable_d date;
begin
  if p_cutoff_start < '2026-08-31'::date then
    return true; -- Legacy records are not constrained by weekly payout lag
  end if;

  ref_date := coalesce(p_reference_date, (now() at time zone 'Asia/Manila')::date);
  payable_d := public.calculate_payroll_payable_date(p_cutoff_start, p_cutoff_end);
  if payable_d is null then
    return true;
  end if;

  return ref_date >= payable_d;
end;
$$;

create or replace function public.enforce_payroll_workflow_constraints()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  current_user_role public.user_role;
  actor_name_snapshot text;
  actor_email_snapshot text;
  transition_request_id text;
  transitioned_at timestamptz := clock_timestamp();
  workflow_event_type text;
  workflow_description text;
  rider_name text;
  current_date_manila date;
  earliest_payable date;
begin
  -- Validate period shape for new weekly payroll model on/after 2026-08-31
  if new.cutoff_start >= '2026-08-31'::date then
    if extract(isodow from new.cutoff_start) <> 1 or new.cutoff_end <> (new.cutoff_start + 6) then
      raise exception 'PAYROLL_INVALID_PERIOD: Weekly payroll cutoff must start on a Monday and end on Sunday (7 calendar days). Received % to %.', new.cutoff_start, new.cutoff_end;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.submitted_by := null;
    new.submitted_at := null;
    new.submitted_by_name_snapshot := null;
    new.submitted_by_email_snapshot := null;
    new.approved_by := null;
    new.approved_at := null;
    new.approved_by_name_snapshot := null;
    new.approved_by_email_snapshot := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejected_by_name_snapshot := null;
    new.rejected_by_email_snapshot := null;
    new.returned_by := null;
    new.returned_at := null;
    new.returned_by_name_snapshot := null;
    new.returned_by_email_snapshot := null;
    new.paid_by := null;
    new.paid_at := null;
    new.paid_by_name_snapshot := null;
    new.paid_by_email_snapshot := null;
    return new;
  end if;

  transition_request_id := nullif(current_setting('app.payroll_transition_request_id', true), '');

  select
    profile.role,
    nullif(btrim(profile.full_name), '')
  into current_user_role, actor_name_snapshot
  from public.users profile
  where profile.id = actor_id
    and profile.status = 'active'::public.user_status;

  select lower(nullif(btrim(auth_user.email), ''))
  into actor_email_snapshot
  from auth.users auth_user
  where auth_user.id = actor_id
    and auth_user.email_confirmed_at is not null;

  if old.status is distinct from new.status then
    if actor_id is null or current_user_role is null then
      raise exception 'A signed-in active user with a confirmed email is required for payroll workflow actions.';
    end if;

    if actor_name_snapshot is null or actor_email_snapshot is null then
      raise exception 'A confirmed actor name and email are required for payroll workflow actions.';
    end if;

    if new.status = 'approved'::public.payroll_status
      and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can approve payroll.';
    end if;

    if new.status = 'rejected'::public.payroll_status
      and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can reject payroll.';
    end if;

    if new.status = 'draft'::public.payroll_status
      and old.status = 'pending'::public.payroll_status
      and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can return payroll for revision.';
    end if;

    if new.status = 'paid'::public.payroll_status
      and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
      raise exception 'Only HR or Admin can mark payroll as Paid.';
    end if;

    if new.status = 'pending'::public.payroll_status
      and current_user_role not in ('admin'::public.user_role, 'payroll'::public.user_role) then
      raise exception 'Only Payroll Officer or Admin can submit payroll for approval.';
    end if;

    if new.status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
      and transition_request_id is null then
      raise exception 'PAYROLL_BULK_REQUEST: Approval and payment must use the authoritative payroll transition function.';
    end if;

    -- Enforce 1-week payout lag for weekly payrolls on transition to Paid
    if new.status = 'paid'::public.payroll_status and new.cutoff_start >= '2026-08-31'::date then
      current_date_manila := (now() at time zone 'Asia/Manila')::date;
      earliest_payable := public.calculate_payroll_payable_date(new.cutoff_start, new.cutoff_end);
      if current_date_manila < earliest_payable then
        raise exception 'PAYROLL_PREMATURE_PAYOUT: Weekly payroll (% to %) cannot be marked as Paid before earliest payable date % (Asia/Manila).', new.cutoff_start, new.cutoff_end, earliest_payable;
      end if;
    end if;
  end if;

  if current_user_role = 'hr'::public.user_role
    and old.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
    raise exception 'HR cannot edit payroll records in Draft or Rejected status.';
  end if;

  if current_user_role = 'payroll'::public.user_role
    and old.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
    raise exception 'Payroll Officer can only edit payroll records in Draft or Rejected status.';
  end if;

  if old.status = 'approved'::public.payroll_status and new.status <> 'paid'::public.payroll_status then
    raise exception 'Payroll records in Approved status cannot be modified.';
  end if;

  if old.status = 'paid'::public.payroll_status then
    raise exception 'Paid payroll records are immutable.';
  end if;

  if current_user_role = 'hr'::public.user_role and (
    new.total_parcels is distinct from old.total_parcels
    or new.rate_per_parcel is distinct from old.rate_per_parcel
    or new.gross_pay is distinct from old.gross_pay
    or new.other_earnings is distinct from old.other_earnings
    or new.fm_pickup_count is distinct from old.fm_pickup_count
    or new.deductions is distinct from old.deductions
    or new.late_onhold is distinct from old.late_onhold
    or new.late_remittance is distinct from old.late_remittance
    or new.rider_id is distinct from old.rider_id
    or new.cutoff_start is distinct from old.cutoff_start
    or new.cutoff_end is distinct from old.cutoff_end
  ) then
    raise exception 'HR cannot modify payroll computations or adjustments.';
  end if;

  if old.status is distinct from new.status and not (
    (old.status = 'draft'::public.payroll_status and new.status = 'pending'::public.payroll_status)
    or (old.status = 'rejected'::public.payroll_status and new.status = 'pending'::public.payroll_status)
    or (old.status = 'pending'::public.payroll_status and new.status = 'approved'::public.payroll_status)
    or (old.status = 'pending'::public.payroll_status and new.status = 'rejected'::public.payroll_status)
    or (old.status = 'pending'::public.payroll_status and new.status = 'draft'::public.payroll_status)
    or (old.status = 'approved'::public.payroll_status and new.status = 'paid'::public.payroll_status)
  ) then
    raise exception 'Invalid status transition: % -> %.', initcap(old.status::text), initcap(new.status::text);
  end if;

  if old.status is not distinct from new.status and (
    new.submitted_by is distinct from old.submitted_by
    or new.submitted_at is distinct from old.submitted_at
    or new.submitted_by_name_snapshot is distinct from old.submitted_by_name_snapshot
    or new.submitted_by_email_snapshot is distinct from old.submitted_by_email_snapshot
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.approved_by_name_snapshot is distinct from old.approved_by_name_snapshot
    or new.approved_by_email_snapshot is distinct from old.approved_by_email_snapshot
    or new.rejected_by is distinct from old.rejected_by
    or new.rejected_at is distinct from old.rejected_at
    or new.rejected_by_name_snapshot is distinct from old.rejected_by_name_snapshot
    or new.rejected_by_email_snapshot is distinct from old.rejected_by_email_snapshot
    or new.returned_by is distinct from old.returned_by
    or new.returned_at is distinct from old.returned_at
    or new.returned_by_name_snapshot is distinct from old.returned_by_name_snapshot
    or new.returned_by_email_snapshot is distinct from old.returned_by_email_snapshot
    or new.paid_by is distinct from old.paid_by
    or new.paid_at is distinct from old.paid_at
    or new.paid_by_name_snapshot is distinct from old.paid_by_name_snapshot
    or new.paid_by_email_snapshot is distinct from old.paid_by_email_snapshot
  ) then
    raise exception 'Payroll actor attribution can only be changed by a workflow transition.';
  end if;

  if old.status is distinct from new.status then
    select coalesce(rider.name, 'Rider')
    into rider_name
    from public.riders rider
    where rider.id = new.rider_id;

    rider_name := coalesce(rider_name, 'Rider');

    if new.status = 'pending'::public.payroll_status then
      new.submitted_by := actor_id;
      new.submitted_by_name_snapshot := actor_name_snapshot;
      new.submitted_by_email_snapshot := actor_email_snapshot;
      new.submitted_at := transitioned_at;
      workflow_event_type := 'payroll_submit';
      workflow_description := format(
        'Submitted payroll for %s (%s to %s) for approval - Net Pay: ₱%s (Status: Pending Review)',
        rider_name,
        new.cutoff_start,
        new.cutoff_end,
        to_char(coalesce(new.gross_pay, 0), 'FM999999999990.00')
      );
    elsif new.status = 'approved'::public.payroll_status then
      new.approved_by := actor_id;
      new.approved_by_name_snapshot := actor_name_snapshot;
      new.approved_by_email_snapshot := actor_email_snapshot;
      new.approved_at := coalesce(new.approved_at, transitioned_at);
    elsif new.status = 'rejected'::public.payroll_status then
      new.rejected_by := actor_id;
      new.rejected_by_name_snapshot := actor_name_snapshot;
      new.rejected_by_email_snapshot := actor_email_snapshot;
      new.rejected_at := transitioned_at;
      workflow_event_type := 'payroll_reject';
      workflow_description := format(
        'Rejected payroll for %s (%s to %s).%s (Status: Rejected)',
        rider_name,
        new.cutoff_start,
        new.cutoff_end,
        case when nullif(btrim(new.rejection_reason), '') is null
          then ''
          else ' Reason: "' || new.rejection_reason || '"'
        end
      );
    elsif new.status = 'draft'::public.payroll_status and old.status = 'pending'::public.payroll_status then
      new.returned_by := actor_id;
      new.returned_by_name_snapshot := actor_name_snapshot;
      new.returned_by_email_snapshot := actor_email_snapshot;
      new.returned_at := transitioned_at;
      workflow_event_type := 'payroll_return';
      workflow_description := format(
        'Returned payroll for %s (%s to %s) for revision (Status: Draft)',
        rider_name,
        new.cutoff_start,
        new.cutoff_end
      );
    elsif new.status = 'paid'::public.payroll_status then
      new.paid_by := actor_id;
      new.paid_by_name_snapshot := actor_name_snapshot;
      new.paid_by_email_snapshot := actor_email_snapshot;
      new.paid_at := coalesce(new.paid_at, transitioned_at);
    end if;
  end if;

  if workflow_event_type is not null then
    insert into public.activity_logs (
      user_id,
      rider_id,
      event_type,
      description,
      metadata,
      created_at
    ) values (
      actor_id,
      new.rider_id,
      workflow_event_type,
      workflow_description,
      jsonb_strip_nulls(jsonb_build_object(
        'record_id', new.id,
        'previous_status', old.status,
        'status', new.status,
        'rejection_reason', case when new.status = 'rejected'::public.payroll_status then new.rejection_reason end,
        'actor_user_id', actor_id,
        'actor_name_snapshot', actor_name_snapshot,
        'actor_email_snapshot', actor_email_snapshot
      )),
      transitioned_at
    );
  end if;

  return new;
end;
$$;

create or replace function public.execute_payroll_bulk_transition(
  p_operation text,
  p_records jsonb,
  p_cutoff_start date,
  p_cutoff_end date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
  actor_name_snapshot text;
  actor_email_snapshot text;
  operation_id uuid;
  existing_operation public.payroll_bulk_operations%rowtype;
  canonical_payload jsonb;
  record_ids uuid[];
  input_count integer;
  distinct_count integer;
  found_count integer := 0;
  wrong_status_count integer := 0;
  wrong_cutoff_count integer := 0;
  stale_count integer := 0;
  invalid_snapshot_count integer := 0;
  expected_status public.payroll_status;
  new_status public.payroll_status;
  expected_updated_at timestamptz;
  snapshot_error text;
  transitioned_at timestamptz := clock_timestamp();
  operation_result jsonb;
  payroll_row public.payroll_records%rowtype;
  earliest_payable date;
  current_date_manila date;
begin
  if actor_id is null then
    raise exception 'PAYROLL_BULK_UNAUTHORIZED: Sign in to manage payroll.';
  end if;

  select
    profile.role,
    nullif(btrim(profile.full_name), ''),
    lower(nullif(btrim(auth_user.email), ''))
  into actor_role, actor_name_snapshot, actor_email_snapshot
  from public.users profile
  join auth.users auth_user on auth_user.id = profile.id
  where profile.id = actor_id
    and profile.status = 'active'::public.user_status
    and auth_user.email_confirmed_at is not null;

  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'PAYROLL_BULK_UNAUTHORIZED: Only Admin or HR can perform this payroll action.';
  end if;

  if actor_name_snapshot is null or actor_email_snapshot is null then
    raise exception 'PAYROLL_BULK_IDENTITY: A confirmed actor name and email are required.';
  end if;

  if p_operation = 'approve' then
    expected_status := 'pending'::public.payroll_status;
    new_status := 'approved'::public.payroll_status;
  elsif p_operation = 'pay' then
    expected_status := 'approved'::public.payroll_status;
    new_status := 'paid'::public.payroll_status;

    -- Validate payout eligibility for weekly cutoffs
    if p_cutoff_start >= '2026-08-31'::date then
      current_date_manila := (now() at time zone 'Asia/Manila')::date;
      earliest_payable := public.calculate_payroll_payable_date(p_cutoff_start, p_cutoff_end);
      if current_date_manila < earliest_payable then
        raise exception 'PAYROLL_PREMATURE_PAYOUT: Weekly payroll (% to %) cannot be marked as Paid before earliest payable date % (Asia/Manila).', p_cutoff_start, p_cutoff_end, earliest_payable;
      end if;
    end if;
  else
    raise exception 'PAYROLL_BULK_REQUEST: Unknown payroll bulk operation.';
  end if;

  if p_request_id is null then
    raise exception 'PAYROLL_BULK_REQUEST: A request identifier is required.';
  end if;

  if p_cutoff_start is null or p_cutoff_end is null or p_cutoff_start > p_cutoff_end then
    raise exception 'PAYROLL_BULK_REQUEST: Select a valid payroll cutoff.';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'PAYROLL_BULK_REQUEST: Select at least one payroll record.';
  end if;

  begin
    select
      count(*)::integer,
      count(distinct parsed.id)::integer,
      array_agg(parsed.id order by parsed.id),
      jsonb_agg(
        jsonb_build_object('id', parsed.id, 'updated_at', parsed.updated_at)
        order by parsed.id
      )
    into input_count, distinct_count, record_ids, canonical_payload
    from jsonb_to_recordset(p_records) as parsed(id uuid, updated_at timestamptz);
  exception when others then
    raise exception 'PAYROLL_BULK_REQUEST: Selected payroll data is invalid.';
  end;

  if input_count <> jsonb_array_length(p_records)
    or input_count <> distinct_count
    or array_position(record_ids, null) is not null
    or exists (
      select 1
      from jsonb_to_recordset(p_records) as parsed(id uuid, updated_at timestamptz)
      where parsed.updated_at is null
    )
  then
    raise exception 'PAYROLL_BULK_REQUEST: Selected payroll records must be unique and include their current versions.';
  end if;

  insert into public.payroll_bulk_operations (
    request_id,
    requested_by,
    operation,
    cutoff_start,
    cutoff_end,
    request_payload
  ) values (
    p_request_id,
    actor_id,
    p_operation,
    p_cutoff_start,
    p_cutoff_end,
    canonical_payload
  )
  on conflict (requested_by, request_id) do nothing
  returning id into operation_id;

  if operation_id is null then
    select * into existing_operation
    from public.payroll_bulk_operations
    where requested_by = actor_id
      and request_id = p_request_id;

    if existing_operation.operation <> p_operation
      or existing_operation.cutoff_start <> p_cutoff_start
      or existing_operation.cutoff_end <> p_cutoff_end
      or existing_operation.request_payload <> canonical_payload
    then
      raise exception 'PAYROLL_BULK_REQUEST: This request identifier was already used for different payroll data.';
    end if;

    if existing_operation.status = 'completed' and existing_operation.result is not null then
      return existing_operation.result || jsonb_build_object('replayed', true);
    end if;

    raise exception 'PAYROLL_BULK_CONFLICT: This payroll operation is already processing.';
  end if;

  for payroll_row in
    select pr.*
    from public.payroll_records pr
    where pr.id = any(record_ids)
    order by pr.id
    for update
  loop
    found_count := found_count + 1;

    select parsed.updated_at into expected_updated_at
    from jsonb_to_recordset(canonical_payload) as parsed(id uuid, updated_at timestamptz)
    where parsed.id = payroll_row.id;

    if payroll_row.status <> expected_status then
      wrong_status_count := wrong_status_count + 1;
    elsif payroll_row.cutoff_start <> p_cutoff_start or payroll_row.cutoff_end <> p_cutoff_end then
      wrong_cutoff_count := wrong_cutoff_count + 1;
    elsif payroll_row.updated_at <> expected_updated_at then
      stale_count := stale_count + 1;
    else
      snapshot_error := public.validate_finalized_payroll_snapshot(payroll_row.id);
      if snapshot_error is not null then
        invalid_snapshot_count := invalid_snapshot_count + 1;
      end if;
    end if;
  end loop;

  if found_count <> input_count then
    raise exception 'PAYROLL_BULK_CONFLICT: % selected payroll record(s) no longer exist.', input_count - found_count;
  end if;

  if wrong_status_count > 0 then
    if expected_status = 'pending'::public.payroll_status then
      raise exception 'PAYROLL_BULK_CONFLICT: % selected payroll record(s) are no longer Pending Review.', wrong_status_count;
    end if;
    raise exception 'PAYROLL_BULK_CONFLICT: % selected payroll record(s) are no longer Approved.', wrong_status_count;
  end if;

  if wrong_cutoff_count > 0 then
    raise exception 'PAYROLL_BULK_CONFLICT: % selected payroll record(s) do not belong to this cutoff.', wrong_cutoff_count;
  end if;

  if stale_count > 0 then
    raise exception 'PAYROLL_BULK_CONFLICT: % selected payroll record(s) changed after selection. Refresh and review them again.', stale_count;
  end if;

  if invalid_snapshot_count > 0 then
    raise exception 'PAYROLL_BULK_SNAPSHOT: % selected payroll record(s) have an invalid or missing immutable snapshot.', invalid_snapshot_count;
  end if;

  perform set_config('app.payroll_transition_request_id', p_request_id::text, true);

  if p_operation = 'approve' then
    update public.payroll_records
    set status = new_status,
        approved_by = actor_id,
        approved_by_name_snapshot = actor_name_snapshot,
        approved_by_email_snapshot = actor_email_snapshot,
        approved_at = transitioned_at,
        updated_at = transitioned_at
    where id = any(record_ids);
  else
    update public.payroll_records
    set status = new_status,
        paid_by = actor_id,
        paid_by_name_snapshot = actor_name_snapshot,
        paid_by_email_snapshot = actor_email_snapshot,
        paid_at = transitioned_at,
        processed_at = transitioned_at,
        updated_at = transitioned_at
    where id = any(record_ids);
  end if;

  insert into public.activity_logs (user_id, rider_id, event_type, description, metadata, created_at)
  select
    actor_id,
    pr.rider_id,
    case when p_operation = 'approve' then 'payroll_approve' else 'payroll_pay' end,
    case
      when p_operation = 'approve' then
        'Approved payroll for ' || coalesce(r.name, 'Rider') || ' (' || pr.cutoff_start || ' to ' || pr.cutoff_end || ') (Status: Approved)'
      else
        'Disbursed & Paid payroll for ' || coalesce(r.name, 'Rider') || ' (' || pr.cutoff_start || ' to ' || pr.cutoff_end || ') (Status: Paid)'
    end,
    jsonb_build_object(
      'record_id', pr.id,
      'previous_status', expected_status,
      'status', new_status,
      'request_id', p_request_id,
      'operation_id', operation_id,
      'bulk', input_count > 1,
      'actor_user_id', actor_id,
      'actor_name_snapshot', actor_name_snapshot,
      'actor_email_snapshot', actor_email_snapshot
    ),
    transitioned_at
  from public.payroll_records pr
  left join public.riders r on r.id = pr.rider_id
  where pr.id = any(record_ids);

  insert into public.notifications (
    sender_id,
    category,
    priority,
    type,
    title,
    message,
    recipient_id,
    rider_id,
    action_link,
    metadata,
    read,
    target_roles,
    created_at
  )
  select
    actor_id,
    'payroll'::public.notification_category,
    'high'::public.notification_priority,
    'system'::public.notification_type,
    case when p_operation = 'approve' then 'Payroll Approved' else 'Payroll Disbursed & Paid' end,
    case
      when p_operation = 'approve' then
        'Payroll for ' || coalesce(r.name, 'Rider') || ' (' || pr.cutoff_start || ' to ' || pr.cutoff_end || ') has been approved'
      else
        'Payroll for ' || coalesce(r.name, 'Rider') || ' (' || pr.cutoff_start || ' to ' || pr.cutoff_end || ') has been paid'
    end,
    null,
    null,
    '/payroll',
    jsonb_build_object(
      'source', 'payroll_transition',
      'record_id', pr.id,
      'previous_status', expected_status,
      'status', new_status,
      'request_id', p_request_id,
      'operation_id', operation_id,
      'event_key', p_operation || ':' || pr.id || ':' || p_request_id,
      'actor_user_id', actor_id,
      'actor_name_snapshot', actor_name_snapshot,
      'actor_email_snapshot', actor_email_snapshot
    ),
    false,
    array['payroll'::public.user_role, 'admin'::public.user_role],
    transitioned_at
  from public.payroll_records pr
  left join public.riders r on r.id = pr.rider_id
  where pr.id = any(record_ids);

  operation_result := jsonb_build_object(
    'operation_id', operation_id,
    'request_id', p_request_id,
    'operation', p_operation,
    'processed_count', input_count,
    'record_ids', to_jsonb(record_ids),
    'replayed', false
  );

  update public.payroll_bulk_operations
  set status = 'completed',
      result = operation_result,
      completed_at = transitioned_at
  where id = operation_id;

  return operation_result;
end;
$$;
