-- Policy V2 Phase 2: read-only evaluation infrastructure.
-- No policy rows, effective date, financial writes, or production activation.
-- Explicit preview evaluates candidates only; ordinary reads remain inactive.
-- Reversal metadata / waiver reason constraints belong to the later decision
-- RPC phase and are intentionally not changed by this read-only migration.

create function private.resolve_rider_absence_financial_eligibility(
  p_rider_id uuid,
  p_business_date date,
  p_as_of timestamptz default pg_catalog.clock_timestamp(),
  p_preview boolean default false
)
returns table (
  rider_id uuid,
  business_date date,
  hub_id uuid,
  assessment_status text,
  assessment_reason text,
  attendance_context_code text,
  expected_to_work boolean,
  is_finalized boolean,
  assessment_policy_version_id uuid,
  notice_timeliness text,
  notice_days integer,
  financial_eligibility_reason text,
  requires_confirmation boolean,
  existing_consequence_id uuid,
  existing_consequence_status text,
  evaluation_mode text,
  existing_consequence_hub_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  assessment record;
  context record;
  selected_notice_days integer;
  candidate_reason text;
  decision_id uuid;
  decision_status text;
  decision_hub_id uuid;
begin
  if p_rider_id is null or p_business_date is null or p_as_of is null or p_preview is null then
    raise exception 'Rider, business date, server moment, and preview mode are required.'
      using errcode = '22023';
  end if;

  -- V1 owns classification and its precedence. Do not remap raw clocks or
  -- implement a second copy of the V1 assessment rules.
  select a.* into assessment
  from private.resolve_rider_absence_assessment(p_rider_id, p_business_date, p_as_of) a;

  if not found then
    return;
  end if;

  -- Context owns request selection and date-effective Hub provenance.
  select c.* into context
  from private.resolve_rider_attendance_context(p_rider_id, p_business_date, p_as_of) c;

  select request.start_date - (request.submitted_at at time zone 'Asia/Manila')::date
  into selected_notice_days
  from public.rider_absence_requests request
  where request.id = context.context_request_id;

  -- There is no live V2 policy in Phase 2. Preview is an explicit what-if read,
  -- not an effective policy or an authorization to confirm a penalty.
  if p_preview
     and assessment.expected_to_work
     and assessment.is_finalized
     and assessment.effective_status = 'absent'
     and assessment.assessment_status = 'unexcused'
     and context.planned_leave_state is distinct from 'pending'::public.rider_absence_request_status
     and context.absence_notice_state is distinct from 'pending'::public.rider_absence_request_status then
    if assessment.context_code = 'no_notice'
       and context.context_request_id is null then
      candidate_reason := 'absence_without_prior_notice';
    elsif assessment.context_code in ('leave_rejected', 'notice_rejected') then
      candidate_reason := 'denied_unauthorized_absence';
    end if;
    -- Withdrawn/cancelled contexts deliberately have no financial mapping.
    -- Late timing alone never overrides approved/accepted/pending excusal.
  end if;

  select consequence.id, consequence.status, consequence.hub_id
  into decision_id, decision_status, decision_hub_id
  from public.rider_absence_financial_consequences consequence
  where consequence.rider_id = p_rider_id
    and consequence.business_date = p_business_date;

  return query select
    assessment.rider_id,
    assessment.business_date,
    context.hub_id,
    assessment.assessment_status,
    assessment.assessment_reason,
    assessment.context_code,
    assessment.expected_to_work,
    assessment.is_finalized,
    assessment.policy_version_id,
    case
      when selected_notice_days is null then 'no_notice'::text
      when selected_notice_days >= 3 then 'timely'::text
      else 'late'::text
    end,
    selected_notice_days,
    candidate_reason,
    candidate_reason is not null and decision_id is null,
    decision_id,
    decision_status,
    case when p_preview then 'preview'::text else 'inactive'::text end,
    decision_hub_id;
end;
$$;

comment on function private.resolve_rider_absence_financial_eligibility(uuid, date, timestamptz, boolean) is
  'Read-only V1-based candidate preview; inactive by default. as_of controls finalization, not reconstruction of past request states. No financial effect or policy activation.';

revoke all on function private.resolve_rider_absence_financial_eligibility(uuid, date, timestamptz, boolean)
  from public, anon, authenticated, service_role;

create function public.list_rider_absence_financial_eligibility(
  p_start_date date,
  p_end_date date,
  p_hub_id uuid default null,
  p_rider_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0,
  p_preview boolean default false
)
returns table (
  rider_id uuid,
  business_date date,
  hub_id uuid,
  assessment_status text,
  assessment_reason text,
  attendance_context_code text,
  expected_to_work boolean,
  is_finalized boolean,
  assessment_policy_version_id uuid,
  notice_timeliness text,
  notice_days integer,
  financial_eligibility_reason text,
  requires_confirmation boolean,
  existing_consequence_id uuid,
  existing_consequence_status text,
  evaluation_mode text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
  server_moment timestamptz := pg_catalog.statement_timestamp();
begin
  if actor_id is null or actor_role is null
     or actor_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
    raise exception 'Only Admin and HR can read absence financial eligibility.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.users actor
    where actor.id = actor_id
      and actor.status = 'active'::public.user_status
      and actor.employment_status = 'active'::public.employment_status
  ) then
    raise exception 'Only active employed Admin and HR accounts can read absence financial eligibility.'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'A valid financial eligibility date range is required.' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 31 then
    raise exception 'Financial eligibility reads are limited to 32 calendar days.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Financial eligibility page size must be between 1 and 500.' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Financial eligibility page offset must be between 0 and 100000.' using errcode = '22023';
  end if;
  if p_preview is null then
    raise exception 'Preview mode must be explicit true or false.' using errcode = '22023';
  end if;

  if actor_role = 'hr'::public.user_role and p_hub_id is not null
     and not private.user_can_access_hub(p_hub_id) then
    raise exception 'You are not authorized to read financial eligibility for the requested Hub.'
      using errcode = '42501';
  end if;

  return query
  select
    evaluation.rider_id,
    evaluation.business_date,
    evaluation.hub_id,
    evaluation.assessment_status,
    evaluation.assessment_reason,
    evaluation.attendance_context_code,
    evaluation.expected_to_work,
    evaluation.is_finalized,
    evaluation.assessment_policy_version_id,
    evaluation.notice_timeliness,
    evaluation.notice_days,
    evaluation.financial_eligibility_reason,
    evaluation.requires_confirmation,
    -- Decision snapshots may retain a different historical Hub. A definer
    -- read must not disclose their identity/status outside that stored scope.
    case when actor_role = 'admin'::public.user_role
           or private.user_can_access_hub(evaluation.existing_consequence_hub_id)
      then evaluation.existing_consequence_id end,
    case when actor_role = 'admin'::public.user_role
           or private.user_can_access_hub(evaluation.existing_consequence_hub_id)
      then evaluation.existing_consequence_status end,
    evaluation.evaluation_mode
  from public.riders rider
  cross join lateral pg_catalog.generate_series(
    p_start_date::timestamp, p_end_date::timestamp, interval '1 day'
  ) series
  cross join lateral private.resolve_rider_absence_financial_eligibility(
    rider.id, series::date, server_moment, p_preview
  ) evaluation
  where (p_rider_id is null or rider.id = p_rider_id)
    and public.is_rider_employed_on(rider.id, series::date)
    and (
      actor_role = 'admin'::public.user_role
      or (evaluation.hub_id is not null and private.user_can_access_hub(evaluation.hub_id))
    )
    and (p_hub_id is null or evaluation.hub_id = p_hub_id)
  order by evaluation.business_date, rider.name, rider.id
  offset p_offset
  limit p_limit;
end;
$$;

comment on function public.list_rider_absence_financial_eligibility(date, date, uuid, uuid, integer, integer, boolean) is
  'Admin/HR-only bounded read with safe metadata. p_preview=true returns explicitly labelled hypothetical candidates; ordinary reads remain inactive until a future activation implementation. No private request text or financial writes.';

revoke all on function public.list_rider_absence_financial_eligibility(date, date, uuid, uuid, integer, integer, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.list_rider_absence_financial_eligibility(date, date, uuid, uuid, integer, integer, boolean)
  to authenticated;
