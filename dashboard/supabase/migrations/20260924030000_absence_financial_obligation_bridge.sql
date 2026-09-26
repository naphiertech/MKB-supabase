-- Policy V2 Phase 4: explicit bridge from an existing human decision to an
-- unallocated obligation. No attendance evaluation, policy activation, Payroll
-- record writes, allocation, or reversal.

-- Existing Payroll references are free text. Reserve uniqueness only for this
-- bridge namespace, including voided rows so history cannot be rematerialized.
create unique index payroll_obligation_absence_reference_key
  on public.payroll_deduction_obligations (reference)
  where reference like 'ABS-PEN:%';

create unique index absence_financial_obligation_link_key
  on public.rider_absence_financial_consequences (deduction_obligation_id)
  where deduction_obligation_id is not null;

alter table public.rider_absence_financial_consequence_audit_events
  drop constraint rider_absence_financial_consequence_audit_events_action_check,
  add constraint rider_absence_financial_consequence_audit_events_action_check
    check (action in (
      'confirmed', 'waived_emergency', 'waived_excused', 'reversed',
      'payroll_obligation_linked'
    ));

create function public.materialize_absence_financial_deduction_obligation(
  p_consequence_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  consequence public.rider_absence_financial_consequences%rowtype;
  linked_consequence public.rider_absence_financial_consequences%rowtype;
  obligation public.payroll_deduction_obligations%rowtype;
  canonical_reference text;
  obligation_reason text;
begin
  -- Admin is the narrow intersection of consequence decision roles (Admin/HR)
  -- and existing Payroll write roles (Admin/Payroll). HR/Payroll cannot invoke
  -- this bridge. Explicit checks also fail closed for missing/inactive profiles.
  if actor_id is null or not exists (
    select 1 from public.users actor
    where actor.id = actor_id
      and actor.role = 'admin'::public.user_role
      and actor.status = 'active'::public.user_status
      and actor.employment_status = 'active'::public.employment_status
  ) then
    raise exception 'Only an active employed Admin can materialize absence obligations.'
      using errcode = '42501';
  end if;
  if p_consequence_id is null then
    raise exception 'A financial consequence ID is required.' using errcode = '22023';
  end if;

  -- Serialize concurrent calls before inspecting the link or inserting debt.
  select c.* into consequence
  from public.rider_absence_financial_consequences c
  where c.id = p_consequence_id
  for update;
  if not found then
    raise exception 'Financial consequence was not found.' using errcode = 'P0002';
  end if;
  if not private.user_can_access_hub_for(actor_id, consequence.hub_id) then
    raise exception 'The consequence is outside your authorized Hub scope.' using errcode = '42501';
  end if;
  if consequence.status <> 'confirmed'
     or consequence.applied_amount <= 0
     or consequence.currency <> 'PHP' then
    raise exception 'Only a confirmed positive PHP consequence can create an obligation.'
      using errcode = '23514';
  end if;

  canonical_reference := 'ABS-PEN:' || consequence.id::text;
  obligation_reason := 'Confirmed absence penalty for ' || consequence.business_date::text;

  if consequence.deduction_obligation_id is not null then
    select o.* into obligation
    from public.payroll_deduction_obligations o
    where o.id = consequence.deduction_obligation_id
    for update;
    if not found then
      raise exception 'ABSENCE_OBLIGATION_MISMATCH: The linked obligation is missing.'
        using errcode = '23514';
    end if;
  else
    select o.* into obligation
    from public.payroll_deduction_obligations o
    where o.reference = canonical_reference
    for update;
  end if;

  if obligation.id is not null then
    if obligation.reference is distinct from canonical_reference
       or obligation.rider_id is distinct from consequence.rider_id
       or obligation.hub_id is distinct from consequence.hub_id
       or obligation.adjustment_code is distinct from 'general_deductions'
       or obligation.original_amount is distinct from consequence.applied_amount
       or obligation.adjustment_date is distinct from consequence.business_date
       or obligation.voided_at is not null
       or obligation.voided_by is not null
       or obligation.void_reason is not null
       or exists (
         select 1 from public.rider_absence_financial_consequences other_decision
         where other_decision.deduction_obligation_id = obligation.id
           and other_decision.id <> consequence.id
       ) then
      raise exception 'ABSENCE_OBLIGATION_MISMATCH: Existing obligation identity, amount, ownership, or lifecycle does not match.'
        using errcode = '23514';
    end if;

    -- Already linked is a pure retry, even after later allocation/submission.
    -- Do not rewrite an obligation, relink it, or append duplicate audit events.
    if consequence.deduction_obligation_id = obligation.id then
      return obligation.id;
    end if;

    -- Unlinked references may be adopted only while entirely unused. Include
    -- voided/detached allocations, not merely current balance-view totals.
    if obligation.financially_committed_at is not null
       or obligation.financially_committed_payroll_id is not null
       or exists (
         select 1 from public.payroll_deduction_allocations allocation
         where allocation.deduction_obligation_id = obligation.id
       ) then
      raise exception 'ABSENCE_OBLIGATION_UNSAFE_RELINK: An obligation with Payroll history cannot be linked.'
        using errcode = '23514';
    end if;
  else
    perform 1 from public.payroll_adjustment_definitions definition
    where definition.code = 'general_deductions'
      and definition.category = 'deduction'
      and definition.active
    for share;
    if not found then
      raise exception 'General Deductions is unavailable.' using errcode = '55000';
    end if;

    -- The generic create RPC derives the Rider CURRENT Hub. Use the historical
    -- consequence Hub here, preserving the existing ledger fields and audit
    -- helper. No trigger, financial lock, or RLS grant is weakened.
    insert into public.payroll_deduction_obligations (
      rider_id, hub_id, adjustment_code, original_amount, adjustment_date,
      reason, reference, source, created_by, updated_by
    ) values (
      consequence.rider_id, consequence.hub_id, 'general_deductions',
      consequence.applied_amount, consequence.business_date,
      obligation_reason, canonical_reference, 'manual', actor_id, actor_id
    ) returning * into obligation;

    perform private.write_payroll_adjustment_audit(
      'obligation', obligation.id, obligation.rider_id, obligation.hub_id,
      null, 'create', null,
      pg_catalog.to_jsonb(obligation) || pg_catalog.jsonb_build_object(
        'absence_financial_consequence_id', consequence.id
      ),
      obligation_reason, actor_id, 'manual'
    );
  end if;

  update public.rider_absence_financial_consequences
  set deduction_obligation_id = obligation.id
  where id = consequence.id
  returning * into linked_consequence;

  -- Payroll audit records creation; this separate existing audit stream records
  -- the consequence link (also for safe adoption). Both are in this transaction.
  insert into public.rider_absence_financial_consequence_audit_events (
    consequence_id, action, actor_id, created_at, old_values, new_values
  ) values (
    consequence.id, 'payroll_obligation_linked', actor_id, pg_catalog.clock_timestamp(),
    pg_catalog.to_jsonb(consequence), pg_catalog.to_jsonb(linked_consequence)
  );

  return obligation.id;
end;
$$;

comment on function public.materialize_absence_financial_deduction_obligation(uuid) is
  'Admin-only idempotent bridge from a confirmed historical PHP consequence to one unallocated general_deductions obligation. Uses applied_amount and ABS-PEN:<UUID>; never re-evaluates policy/attendance or writes Payroll records/allocations.';

revoke all on function public.materialize_absence_financial_deduction_obligation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.materialize_absence_financial_deduction_obligation(uuid)
  to authenticated;
