-- Atomic and idempotent Admin/HR payroll approval and payment operations.
-- Finalized calculation data remains protected by the existing snapshot triggers.

create table public.payroll_bulk_operations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  requested_by uuid not null references public.users(id) on delete restrict,
  operation text not null check (operation in ('approve', 'pay')),
  cutoff_start date not null,
  cutoff_end date not null,
  request_payload jsonb not null,
  status text not null default 'processing' check (status in ('processing', 'completed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payroll_bulk_operations_request_unique unique (requested_by, request_id)
);

alter table public.payroll_bulk_operations enable row level security;
revoke all on table public.payroll_bulk_operations from anon, authenticated;

create index payroll_bulk_operations_created_at_idx
  on public.payroll_bulk_operations (created_at desc);

create or replace function public.validate_finalized_payroll_snapshot(p_record_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  header public.payroll_records%rowtype;
  line_count integer;
  standard_count integer;
  heavy_count integer;
  standard_total numeric;
  heavy_total numeric;
  gross_total numeric;
  lines_valid boolean;
begin
  select * into header
  from public.payroll_records
  where id = p_record_id;

  if not found then
    return 'Payroll record does not exist.';
  end if;

  if header.snapshot_finalized_at is null or header.calculation_version < 2 then
    return 'Selected payroll contains an invalid or missing immutable snapshot.';
  end if;

  if header.total_parcels < 0
    or header.standard_parcels < 0
    or header.heavy_parcels < 0
    or header.standard_earnings < 0
    or header.heavy_earnings < 0
    or header.gross_pay is null
    or header.gross_pay < 0
    or coalesce(header.other_earnings, 0) < 0
    or coalesce(header.fm_pickup_count, 0) < 0
    or coalesce(header.deductions, 0) < 0
    or coalesce(header.late_onhold, 0) < 0
    or coalesce(header.late_remittance, 0) < 0
    or header.total_parcels <> header.standard_parcels + header.heavy_parcels
  then
    return 'Selected payroll contains invalid finalized totals.';
  end if;

  select
    count(*)::integer,
    coalesce(sum(standard_delivered), 0)::integer,
    coalesce(sum(heavy_delivered), 0)::integer,
    coalesce(sum(standard_earnings), 0),
    coalesce(sum(heavy_earnings), 0),
    coalesce(sum(gross_delivery_pay), 0),
    coalesce(bool_and(
      rider_id = header.rider_id
      and date between header.cutoff_start and header.cutoff_end
      and standard_delivered >= 0
      and heavy_delivered >= 0
      and failed >= 0
      and returned >= 0
      and applied_standard_rate is not null
      and applied_standard_rate >= 0
      and applied_heavy_rate is not null
      and applied_heavy_rate >= 0
      and rate_configuration_id is not null
      and calculation_version = header.calculation_version
      and standard_earnings >= 0
      and heavy_earnings >= 0
      and gross_delivery_pay = standard_earnings + heavy_earnings
    ), true)
  into
    line_count,
    standard_count,
    heavy_count,
    standard_total,
    heavy_total,
    gross_total,
    lines_valid
  from public.payroll_delivery_lines
  where payroll_record_id = p_record_id;

  if line_count = 0 then
    if header.total_parcels = 0
      and header.standard_parcels = 0
      and header.heavy_parcels = 0
      and header.standard_earnings = 0
      and header.heavy_earnings = 0
      and header.gross_pay = 0
    then
      return null;
    end if;
    return 'Selected payroll is missing immutable delivery snapshot lines.';
  end if;

  if not lines_valid then
    return 'Selected payroll contains invalid immutable delivery snapshot lines.';
  end if;

  if standard_count <> header.standard_parcels
    or heavy_count <> header.heavy_parcels
    or standard_total <> header.standard_earnings
    or heavy_total <> header.heavy_earnings
    or gross_total <> header.gross_pay
  then
    return 'Selected payroll snapshot lines do not match finalized totals.';
  end if;

  return null;
end;
$$;

revoke execute on function public.validate_finalized_payroll_snapshot(uuid)
from public, anon, authenticated;

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
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role;
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
begin
  if actor_id is null then
    raise exception 'PAYROLL_BULK_UNAUTHORIZED: Sign in to manage payroll.';
  end if;

  select role into actor_role
  from public.users
  where id = actor_id
    and status = 'active'::public.user_status;

  if actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'PAYROLL_BULK_UNAUTHORIZED: Only Admin or HR can perform this payroll action.';
  end if;

  if p_operation = 'approve' then
    expected_status := 'pending'::public.payroll_status;
    new_status := 'approved'::public.payroll_status;
  elsif p_operation = 'pay' then
    expected_status := 'approved'::public.payroll_status;
    new_status := 'paid'::public.payroll_status;
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
        approved_at = transitioned_at,
        updated_at = transitioned_at
    where id = any(record_ids);
  else
    update public.payroll_records
    set status = new_status,
        paid_by = actor_id,
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
      'bulk', input_count > 1
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
      'event_key', p_operation || ':' || pr.id || ':' || p_request_id
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

revoke execute on function public.execute_payroll_bulk_transition(text, jsonb, date, date, uuid)
from public, anon, authenticated;

create or replace function public.bulk_approve_payroll_records(
  p_records jsonb,
  p_cutoff_start date,
  p_cutoff_end date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.execute_payroll_bulk_transition(
    'approve', p_records, p_cutoff_start, p_cutoff_end, p_request_id
  );
end;
$$;

create or replace function public.bulk_mark_payroll_records_paid(
  p_records jsonb,
  p_cutoff_start date,
  p_cutoff_end date,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.execute_payroll_bulk_transition(
    'pay', p_records, p_cutoff_start, p_cutoff_end, p_request_id
  );
end;
$$;

revoke execute on function public.bulk_approve_payroll_records(jsonb, date, date, uuid)
from public, anon;
revoke execute on function public.bulk_mark_payroll_records_paid(jsonb, date, date, uuid)
from public, anon;
grant execute on function public.bulk_approve_payroll_records(jsonb, date, date, uuid)
to authenticated;
grant execute on function public.bulk_mark_payroll_records_paid(jsonb, date, date, uuid)
to authenticated;

-- Keep the existing state machine, but route approval/payment through the
-- authoritative RPC boundary and align HR payment with the existing UI policy.
create or replace function public.enforce_payroll_workflow_constraints()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_role public.user_role;
  transition_request_id text;
begin
  current_user_role := public.get_my_role();
  transition_request_id := nullif(current_setting('app.payroll_transition_request_id', true), '');

  if old.status is distinct from new.status then
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

  return new;
end;
$$;

revoke execute on function public.enforce_payroll_workflow_constraints()
from public, anon, authenticated;
