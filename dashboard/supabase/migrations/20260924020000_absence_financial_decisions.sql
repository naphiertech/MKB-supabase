-- Policy V2 Phase 3: explicit human decisions only.
-- No policy activation/seed, Payroll materialization, or reversal workflow.

-- V1 rules have no monetary configuration. Extend the existing versioned rule
-- record without changing V1 values; published-policy guards also protect this
-- column. A later activation must configure the official V2 rule amounts.
alter table public.absence_policy_rules
  add column financial_penalty_amount numeric(12,2),
  add constraint absence_policy_rule_financial_amount_check check (
    financial_penalty_amount is null
    or (financial_penalty_amount > 0 and financial_penalty_amount <> 'NaN'::numeric)
  );

comment on column public.absence_policy_rules.financial_penalty_amount is
  'Optional PHP penalty for an explicit human financial decision. No default; missing configuration fails closed. Published policy amounts are immutable.';

alter table public.rider_absence_financial_consequences
  add constraint absence_financial_waiver_reason_required check (
    status not in ('waived_emergency', 'waived_excused')
    or (waiver_reason_category is not null and length(btrim(waiver_reason_category)) > 0)
  );

-- Both public commands share one atomic write path. Only the SECURITY DEFINER
-- wrappers can invoke it; auth identity is still derived from auth.uid().
create function private.record_rider_absence_financial_decision(
  p_rider_id uuid,
  p_business_date date,
  p_confirmation_key uuid,
  p_supervisor_name text,
  p_decision_notes text,
  p_decision text,
  p_waiver_reason_category text,
  p_evidence_reference text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  actor_id uuid;
  server_moment timestamptz;
  context record;
  eligibility record;
  policy public.absence_policy_versions%rowtype;
  existing_decision public.rider_absence_financial_consequences%rowtype;
  decision_row public.rider_absence_financial_consequences%rowtype;
  policy_amount numeric(12,2);
  decision_status text;
  supervisor text := btrim(coalesce(p_supervisor_name, ''));
  notes text := btrim(coalesce(p_decision_notes, ''));
  waiver_category text := nullif(lower(btrim(p_waiver_reason_category)), '');
  evidence text := nullif(btrim(p_evidence_reference), '');
begin
  -- Existing helper checks Admin/HR, authenticated identity, and both active
  -- account and active employment, matching the Phase 2 read contract.
  actor_id := private.assert_rider_absence_reviewer();

  if p_rider_id is null or p_business_date is null or p_confirmation_key is null then
    raise exception 'Rider, business date, and confirmation key are required.' using errcode = '22023';
  end if;
  if length(supervisor) not between 1 and 120
     or length(notes) not between 1 and 500
     or (evidence is not null and length(evidence) > 200) then
    raise exception 'Supervisor, decision notes, or evidence reference has an invalid length.'
      using errcode = '22023';
  end if;

  if p_decision = 'confirm' and waiver_category is null then
    decision_status := 'confirmed';
  elsif p_decision = 'waive' and waiver_category in ('emergency', 'excused') then
    decision_status := case waiver_category
      when 'emergency' then 'waived_emergency'
      when 'excused' then 'waived_excused'
    end;
  else
    raise exception 'Waiver reason must be emergency or excused; Confirm cannot include a waiver reason.'
      using errcode = '22023';
  end if;

  -- Same-key calls serialize even across different Riders. Then reuse the
  -- existing per-Rider Leave & Absence lock to serialize decision creation
  -- against submission/review/withdrawal/cancellation and other decisions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('absence_financial_key:' || p_confirmation_key::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rider_absence_requests:' || p_rider_id::text, 0)
  );
  server_moment := pg_catalog.clock_timestamp();

  select c.* into context
  from private.resolve_rider_attendance_context(p_rider_id, p_business_date, server_moment) c;

  if context.hub_id is null or not private.user_can_access_hub(context.hub_id) then
    raise exception 'You are not authorized to decide this Rider business date.' using errcode = '42501';
  end if;

  -- Match V1 date-effective policy selection, then require exactly official V2.
  -- A preview flag is never accepted from the client or used as activation.
  select v.* into policy
  from public.absence_policy_versions v
  where v.lifecycle = 'published'
    and v.effective_from <= p_business_date
  order by v.effective_from desc, v.version_number desc
  limit 1
  for share;

  if policy.id is null
     or policy.version_number <> 2
     or policy.policy_type <> 'official'
     or policy.published_at > server_moment
     or policy.effective_from > (server_moment at time zone 'Asia/Manila')::date then
    raise exception 'ACTIVE_OFFICIAL_V2_REQUIRED: No active official Policy V2 applies to this business date.'
      using errcode = '55000';
  end if;

  -- Retry happens before current eligibility: a prior decision itself makes
  -- requires_confirmation false. Only an exact normalized payload/actor replay
  -- can return the original ID, and authorization is checked again each time.
  select c.* into existing_decision
  from public.rider_absence_financial_consequences c
  where c.confirmation_key = p_confirmation_key
  for update;

  if found then
    if existing_decision.rider_id = p_rider_id
       and existing_decision.business_date = p_business_date
       and existing_decision.decided_by = actor_id
       and existing_decision.status = decision_status
       and existing_decision.supervisor_name = supervisor
       and existing_decision.decision_notes = notes
       and existing_decision.waiver_reason_category is not distinct from waiver_category
       and existing_decision.evidence_reference is not distinct from evidence then
      if not private.user_can_access_hub(existing_decision.hub_id) then
        raise exception 'You are not authorized to read the existing decision.' using errcode = '42501';
      end if;
      return existing_decision.id;
    end if;
    raise exception 'CONFIRMATION_KEY_CONFLICT: The retry key belongs to a different decision or actor.'
      using errcode = '23505';
  end if;

  perform 1 from public.rider_absence_financial_consequences c
  where c.rider_id = p_rider_id and c.business_date = p_business_date
  for update;
  if found then
    raise exception 'ABSENCE_ALREADY_DECIDED: This Rider business date already has a consequence decision.'
      using errcode = '23505';
  end if;

  -- The private candidate evaluator is reusable after the separate live-policy
  -- gate. Ordinary Phase 2 reads remain inactive; no preview can write a row.
  select e.* into eligibility
  from private.resolve_rider_absence_financial_eligibility(
    p_rider_id, p_business_date, server_moment, true
  ) e;
  if eligibility.financial_eligibility_reason is null
     or eligibility.requires_confirmation is distinct from true
     or eligibility.assessment_policy_version_id is distinct from policy.id
     or eligibility.hub_id is distinct from context.hub_id then
    raise exception 'ABSENCE_NOT_ELIGIBLE: A currently eligible unresolved absence is required.'
      using errcode = '23514';
  end if;

  select rule.financial_penalty_amount into policy_amount
  from public.absence_policy_rules rule
  where rule.policy_version_id = policy.id
    and rule.rule_key = eligibility.attendance_context_code
    and rule.assessment_status = 'unexcused';

  if policy_amount is null then
    raise exception 'POLICY_AMOUNT_REQUIRED: The active V2 rule has no configured penalty amount.'
      using errcode = '55000';
  end if;

  insert into public.rider_absence_financial_consequences (
    rider_id, hub_id, business_date, absence_request_id, attendance_context_code,
    policy_version_id, financial_eligibility_reason, policy_penalty_amount,
    applied_amount, currency, status, confirmation_key, decided_by, decided_at,
    supervisor_name, decision_notes, waiver_reason_category, evidence_reference
  ) values (
    p_rider_id, context.hub_id, p_business_date, context.context_request_id,
    eligibility.attendance_context_code, policy.id, eligibility.financial_eligibility_reason,
    policy_amount, case when decision_status = 'confirmed' then policy_amount else 0 end,
    'PHP', decision_status, p_confirmation_key, actor_id, pg_catalog.clock_timestamp(),
    supervisor, notes, waiver_category, evidence
  ) returning * into decision_row;

  -- No exception is swallowed: either both inserts succeed or the whole call
  -- rolls back. A replay above returns before reaching either insert.
  insert into public.rider_absence_financial_consequence_audit_events (
    consequence_id, action, actor_id, created_at, old_values, new_values
  ) values (
    decision_row.id, decision_status, actor_id, pg_catalog.clock_timestamp(),
    null, pg_catalog.to_jsonb(decision_row)
  );

  return decision_row.id;
end;
$$;

revoke all on function private.record_rider_absence_financial_decision(uuid, date, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

create function public.confirm_rider_absence_financial_consequence(
  p_rider_id uuid,
  p_business_date date,
  p_confirmation_key uuid,
  p_supervisor_name text,
  p_decision_notes text,
  p_evidence_reference text default null
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select private.record_rider_absence_financial_decision(
    p_rider_id, p_business_date, p_confirmation_key, p_supervisor_name,
    p_decision_notes, 'confirm', null, p_evidence_reference
  );
$$;

create function public.waive_rider_absence_financial_consequence(
  p_rider_id uuid,
  p_business_date date,
  p_confirmation_key uuid,
  p_supervisor_name text,
  p_decision_notes text,
  p_waiver_reason_category text,
  p_evidence_reference text default null
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select private.record_rider_absence_financial_decision(
    p_rider_id, p_business_date, p_confirmation_key, p_supervisor_name,
    p_decision_notes, 'waive', p_waiver_reason_category, p_evidence_reference
  );
$$;

comment on function public.confirm_rider_absence_financial_consequence(uuid, date, uuid, text, text, text) is
  'Admin/HR explicit decision with applicable official V2 and server-derived eligibility/amount. Records consequence plus audit atomically; never writes Payroll.';
comment on function public.waive_rider_absence_financial_consequence(uuid, date, uuid, text, text, text, text) is
  'Admin/HR explicit waiver (emergency or excused). Requires applicable official V2 and eligibility; records zero applied amount plus audit, never Payroll.';

revoke all on function public.confirm_rider_absence_financial_consequence(uuid, date, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.waive_rider_absence_financial_consequence(uuid, date, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_rider_absence_financial_consequence(uuid, date, uuid, text, text, text)
  to authenticated;
grant execute on function public.waive_rider_absence_financial_consequence(uuid, date, uuid, text, text, text, text)
  to authenticated;
