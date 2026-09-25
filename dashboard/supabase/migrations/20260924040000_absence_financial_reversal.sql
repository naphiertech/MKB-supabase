-- Policy V2 Phase 5: explicit Admin reversal, never an attendance/policy hook.
-- Existing confirmation evidence and amounts remain historical snapshots.
alter table public.rider_absence_financial_consequences
  add column reversal_evidence_reference text,
  add constraint absence_financial_reversal_evidence_check check (
    reversal_evidence_reference is null
    or length(btrim(reversal_evidence_reference)) between 1 and 200
  ),
  add constraint absence_financial_reversal_metadata_required check (
    status <> 'reversed'
    or (
      reversed_by is not null and reversed_at is not null
      and reversal_reason is not null and length(btrim(reversal_reason)) > 0
    )
  );

create unique index payroll_earning_absence_reversal_reference_key
  on public.payroll_earning_adjustments(reference)
  where reference like 'ABS-REV:%';
create unique index absence_financial_reversal_earning_link_key
  on public.rider_absence_financial_consequences(reversal_earning_id)
  where reversal_earning_id is not null;

create function public.reverse_rider_absence_financial_consequence(
  p_consequence_id uuid,
  p_reversal_reason text,
  p_evidence_reference text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  reason text := btrim(coalesce(p_reversal_reason, ''));
  evidence text := nullif(btrim(p_evidence_reference), '');
  today_manila date := (pg_catalog.clock_timestamp() at time zone 'Asia/Manila')::date;
  consequence public.rider_absence_financial_consequences%rowtype;
  reversed_consequence public.rider_absence_financial_consequences%rowtype;
  obligation public.payroll_deduction_obligations%rowtype;
  earning public.payroll_earning_adjustments%rowtype;
  payroll public.payroll_records%rowtype;
  target_payroll public.payroll_records%rowtype;
  allocation public.payroll_deduction_allocations%rowtype;
  locked_payroll_ids uuid[] := array[]::uuid[];
  changed_payroll_ids uuid[] := array[]::uuid[];
  changed_payroll_id uuid;
  current_rider_hub uuid;
  active_count integer;
  paid_count integer;
  paid_amount numeric;
  latest_paid_cutoff date;
  target_count integer := 0;
  compensation_id uuid;
  batch_result jsonb;
  reversal_path text;
  compensation_reference text;
begin
  if actor_id is null or not exists (
    select 1 from public.users actor
    where actor.id = actor_id and actor.role = 'admin'::public.user_role
      and actor.status = 'active'::public.user_status
      and actor.employment_status = 'active'::public.employment_status
  ) then
    raise exception 'Only an active employed Admin can reverse absence consequences.'
      using errcode = '42501';
  end if;
  if p_consequence_id is null or length(reason) not between 1 and 500
     or (evidence is not null and length(evidence) > 200) then
    raise exception 'Consequence, meaningful reversal reason, and valid evidence length are required.'
      using errcode = '22023';
  end if;

  select c.* into consequence from public.rider_absence_financial_consequences c
  where c.id = p_consequence_id for update;
  if not found then
    raise exception 'Financial consequence was not found.' using errcode = 'P0002';
  end if;
  if not private.user_can_access_hub_for(actor_id, consequence.hub_id) then
    raise exception 'Consequence is outside the authorized Hub scope.' using errcode = '42501';
  end if;
  if consequence.status not in ('confirmed', 'reversed')
     or consequence.applied_amount <= 0 or consequence.currency <> 'PHP' then
    raise exception 'Only a confirmed positive PHP decision can be reversed.' using errcode = '23514';
  end if;
  if consequence.status = 'reversed' and (
    consequence.reversal_reason is distinct from reason
    or consequence.reversal_evidence_reference is distinct from evidence
  ) then
    raise exception 'ABSENCE_REVERSAL_CONFLICT: Completed reversal has different inputs.'
      using errcode = '23505';
  end if;

  compensation_reference := 'ABS-REV:' || consequence.id::text;
  select e.* into earning from public.payroll_earning_adjustments e
  where e.reference = compensation_reference;
  if consequence.reversal_earning_id is not null
     and consequence.reversal_earning_id is distinct from earning.id then
    raise exception 'ABSENCE_REVERSAL_COMPENSATION_MISMATCH' using errcode = '23514';
  end if;

  if consequence.deduction_obligation_id is null then
    if earning.id is not null or exists (
      select 1 from public.payroll_deduction_obligations o where o.reference = 'ABS-PEN:' || consequence.id::text
    ) then
      raise exception 'ABSENCE_REVERSAL_LINK_MISMATCH' using errcode = '23514';
    end if;
    if consequence.status = 'reversed' then return consequence.id; end if;
    reversal_path := 'unmaterialized';
  else
    -- Payroll saves lock parents before obligations. Follow that ordering.
    -- Lock all recorded parents, including a previously linked compensation,
    -- before locking the obligation. A later recheck rejects newly added parents.
    for payroll in
      select p.* from public.payroll_records p
      where exists (
        select 1 from public.payroll_deduction_allocations a
        where a.deduction_obligation_id = consequence.deduction_obligation_id
          and a.payroll_record_id = p.id
      ) or p.id = earning.payroll_record_id
      order by p.id for update
    loop
      locked_payroll_ids := pg_catalog.array_append(locked_payroll_ids, payroll.id);
    end loop;

    select o.* into obligation from public.payroll_deduction_obligations o
    where o.id = consequence.deduction_obligation_id for update;
    if not found or obligation.reference is distinct from 'ABS-PEN:' || consequence.id::text
       or obligation.rider_id is distinct from consequence.rider_id
       or obligation.hub_id is distinct from consequence.hub_id
       or obligation.original_amount is distinct from consequence.applied_amount
       or obligation.adjustment_code is distinct from 'general_deductions'
       or obligation.adjustment_date is distinct from consequence.business_date then
      raise exception 'ABSENCE_REVERSAL_OBLIGATION_MISMATCH' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.payroll_deduction_allocations a
      where a.deduction_obligation_id = obligation.id and a.voided_at is null
        and (a.payroll_record_id is null or not (a.payroll_record_id = any(locked_payroll_ids)))
    ) then
      raise exception 'ABSENCE_REVERSAL_STATE_CHANGED: Retry after Payroll changes settle.'
        using errcode = '40001';
    end if;
    if exists (
      select 1 from public.payroll_deduction_allocations a
      join public.payroll_records p on p.id = a.payroll_record_id
      where a.deduction_obligation_id = obligation.id and a.voided_at is null
        and (a.rider_id <> consequence.rider_id or a.hub_id <> consequence.hub_id
          or p.rider_id <> a.rider_id or p.hub_id <> a.hub_id
          or a.cutoff_start <> p.cutoff_start or a.cutoff_end <> p.cutoff_end)
    ) then
      raise exception 'ABSENCE_REVERSAL_ALLOCATION_MISMATCH' using errcode = '23514';
    end if;

    select count(*)::integer,
      count(*) filter (where p.status = 'paid')::integer,
      coalesce(sum(a.amount) filter (where p.status = 'paid'), 0),
      max(p.cutoff_end) filter (where p.status = 'paid')
    into active_count, paid_count, paid_amount, latest_paid_cutoff
    from public.payroll_deduction_allocations a
    join public.payroll_records p on p.id = a.payroll_record_id
    where a.deduction_obligation_id = obligation.id and a.voided_at is null;

    if consequence.status = 'reversed' then
      if consequence.reversal_earning_id is null then
        if obligation.voided_at is null or active_count <> 0 or earning.id is not null
           or obligation.financially_committed_at is not null then
          raise exception 'ABSENCE_REVERSAL_COMPLETED_STATE_MISMATCH' using errcode = '23514';
        end if;
        return consequence.id;
      end if;
      -- Paid compensation may itself have progressed to submitted/paid. Retry
      -- verifies its historical identity, never reschedules or rewrites it.
      select e.* into earning from public.payroll_earning_adjustments e
      where e.id = consequence.reversal_earning_id for update;
      if earning.reference is distinct from compensation_reference
         or earning.rider_id is distinct from consequence.rider_id
         or earning.amount is distinct from consequence.applied_amount
         or earning.adjustment_code is distinct from 'other_earnings'
         or earning.voided_at is not null
         or earning.payroll_record_id is null
         or obligation.voided_at is not null
         or active_count <> paid_count or paid_amount <> consequence.applied_amount
         or not exists (
           select 1 from public.payroll_records p where p.id = earning.payroll_record_id
             and p.rider_id = earning.rider_id and p.hub_id = earning.hub_id
             and p.cutoff_start = earning.cutoff_start and p.cutoff_end = earning.cutoff_end
         ) then
        raise exception 'ABSENCE_REVERSAL_COMPENSATION_MISMATCH' using errcode = '23514';
      end if;
      return consequence.id;
    end if;

    if obligation.voided_at is not null then
      raise exception 'ABSENCE_REVERSAL_OBLIGATION_MISMATCH' using errcode = '23514';
    end if;

    if paid_count > 0 then
      -- Full historical refund is safe only after full recovery, with no
      -- remaining active allocations outside Paid. Partial/mixed debt requires
      -- a separately approved correction contract.
      if active_count <> paid_count or paid_amount <> consequence.applied_amount then
        raise exception 'ABSENCE_REVERSAL_PAYROLL_LOCKED' using errcode = '55000';
      end if;
      reversal_path := 'paid';
    else
      if obligation.financially_committed_at is not null
         or obligation.financially_committed_payroll_id is not null
         or exists (
           select 1 from public.payroll_deduction_allocations a
           join public.payroll_records p on p.id = a.payroll_record_id
           where a.deduction_obligation_id = obligation.id and a.voided_at is null
             and (p.status not in ('draft','rejected') or p.adjustment_source_version <> 2)
         ) then
        raise exception 'ABSENCE_REVERSAL_PAYROLL_LOCKED' using errcode = '55000';
      end if;
      if earning.id is not null then
        raise exception 'ABSENCE_REVERSAL_COMPENSATION_MISMATCH' using errcode = '23514';
      end if;
      reversal_path := case when active_count = 0 then 'unallocated' else 'draft' end;
    end if;

    if reversal_path = 'paid' then
      select r.hub_id into current_rider_hub from public.riders r
      where r.id = consequence.rider_id for share;

      -- Active earnings require an existing editable parent. Do not create a
      -- cutoff, attach to Paid, guess among multiple future parents, or create
      -- an unattached earning. Current/future means its cutoff has not ended.
      for payroll in
        select p.* from public.payroll_records p
        where p.rider_id = consequence.rider_id and p.hub_id = current_rider_hub
          and p.status in ('draft','rejected') and p.adjustment_source_version = 2
          and p.cutoff_start > latest_paid_cutoff and p.cutoff_end >= today_manila
        order by p.id for update
      loop
        target_count := target_count + 1;
        target_payroll := payroll;
      end loop;
      if target_count <> 1 then
        raise exception 'ABSENCE_REVERSAL_COMPENSATION_TARGET_REQUIRED' using errcode = '55000';
      end if;

      select e.* into earning from public.payroll_earning_adjustments e
      where e.reference = compensation_reference for update;
      if earning.id is not null then
        if earning.rider_id is distinct from consequence.rider_id
           or earning.amount is distinct from consequence.applied_amount
           or earning.adjustment_code is distinct from 'other_earnings'
           or earning.hub_id is distinct from target_payroll.hub_id
           or earning.payroll_record_id is distinct from target_payroll.id
           or earning.cutoff_start is distinct from target_payroll.cutoff_start
           or earning.cutoff_end is distinct from target_payroll.cutoff_end
           or earning.voided_at is not null
           or exists (
             select 1 from public.rider_absence_financial_consequences other_decision
             where other_decision.reversal_earning_id = earning.id and other_decision.id <> consequence.id
           ) then
          raise exception 'ABSENCE_REVERSAL_COMPENSATION_MISMATCH' using errcode = '23514';
        end if;
        compensation_id := earning.id;
      else
        batch_result := public.create_payroll_adjustments_batch(
          consequence.rider_id,
          pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
            'adjustment_code','other_earnings','amount',consequence.applied_amount,
            'payroll_record_id',target_payroll.id,
            'adjustment_date',greatest(today_manila,target_payroll.cutoff_start),
            'reason','Absence penalty refund: ' || consequence.id::text,
            'reference',compensation_reference
          )),
          'Absence penalty refund: ' || consequence.id::text
        );
        compensation_id := (batch_result -> 0 ->> 'id')::uuid;
      end if;
      -- The original Paid obligation and every allocation remain unchanged.
    else
      -- Targeted deallocation follows save_payroll_adjustment_plan's audited
      -- void lifecycle but does not resave unrelated earnings/allocations.
      for allocation in
        select a.* from public.payroll_deduction_allocations a
        where a.deduction_obligation_id = obligation.id and a.voided_at is null
        order by a.id for update
      loop
        update public.payroll_deduction_allocations
        set voided_at = pg_catalog.clock_timestamp(), voided_by = actor_id,
            void_reason = reason, updated_by = actor_id, updated_at = pg_catalog.clock_timestamp()
        where id = allocation.id;
        perform private.write_payroll_adjustment_audit(
          'allocation',allocation.id,allocation.rider_id,allocation.hub_id,
          allocation.payroll_record_id,'void',pg_catalog.to_jsonb(allocation),
          pg_catalog.jsonb_build_object('voided',true,'void_reason',reason),
          reason,actor_id,'manual'
        );
        if not (allocation.payroll_record_id = any(changed_payroll_ids)) then
          changed_payroll_ids := pg_catalog.array_append(changed_payroll_ids,allocation.payroll_record_id);
        end if;
      end loop;
      foreach changed_payroll_id in array changed_payroll_ids loop
        perform private.sync_traceable_payroll_aggregates(changed_payroll_id,pg_catalog.gen_random_uuid());
      end loop;
      perform public.void_payroll_deduction_obligation(obligation.id,reason);
    end if;
  end if;

  update public.rider_absence_financial_consequences
  set status = 'reversed', reversed_by = actor_id, reversed_at = pg_catalog.clock_timestamp(),
      reversal_reason = reason, reversal_evidence_reference = evidence,
      reversal_earning_id = compensation_id
  where id = consequence.id returning * into reversed_consequence;

  insert into public.rider_absence_financial_consequence_audit_events(
    consequence_id,action,actor_id,created_at,old_values,new_values
  ) values (
    consequence.id,'reversed',actor_id,pg_catalog.clock_timestamp(),
    pg_catalog.to_jsonb(consequence),
    pg_catalog.to_jsonb(reversed_consequence) || pg_catalog.jsonb_build_object('reversal_path',reversal_path)
  );
  return consequence.id;
end;
$$;

comment on function public.reverse_rider_absence_financial_consequence(uuid,text,text) is
  'Explicit Admin reversal. Void unused/uncommitted debt via existing Payroll lifecycle; permanently committed unpaid debt fails closed; fully paid debt receives one ABS-REV earning in a unique existing future editable Payroll. No eligibility/policy recalculation or paid-history mutation.';

revoke all on function public.reverse_rider_absence_financial_consequence(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.reverse_rider_absence_financial_consequence(uuid,text,text)
  to authenticated;
