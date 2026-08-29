-- Refine the initial lifecycle-lock backfill: a Draft-only historical
-- allocation is not permanent evidence. The allocation must have been active
-- at an actual submit event, or still be active in a submitted payroll.

select set_config('app.payroll_deduction_financial_lock', 'true', true);

with allocation_payroll_refs as (
  select
    allocation.id as allocation_id,
    allocation.deduction_obligation_id,
    allocation.created_at,
    allocation.voided_at,
    allocation.payroll_record_id
  from public.payroll_deduction_allocations allocation
  where allocation.payroll_record_id is not null
  union
  select
    allocation.id,
    allocation.deduction_obligation_id,
    allocation.created_at,
    allocation.voided_at,
    adjustment_audit.payroll_record_id
  from public.payroll_deduction_allocations allocation
  join public.payroll_adjustment_audit_events adjustment_audit
    on adjustment_audit.entity_type = 'allocation'
   and adjustment_audit.entity_id = allocation.id
   and adjustment_audit.payroll_record_id is not null
), submitted_evidence as (
  select
    allocation.deduction_obligation_id,
    coalesce(payroll.submitted_at, payroll.approved_at, payroll.paid_at, payroll.updated_at) as committed_at,
    payroll.id as payroll_id
  from public.payroll_deduction_allocations allocation
  join public.payroll_records payroll on payroll.id = allocation.payroll_record_id
  where allocation.voided_at is null
    and payroll.status in (
      'pending'::public.payroll_status,
      'approved'::public.payroll_status,
      'paid'::public.payroll_status
    )
  union all
  select
    reference.deduction_obligation_id,
    activity.created_at,
    reference.payroll_record_id
  from allocation_payroll_refs reference
  join public.activity_logs activity
    on activity.event_type = 'payroll_submit'
   and activity.metadata->>'record_id' = reference.payroll_record_id::text
  where reference.created_at <= activity.created_at
    and (reference.voided_at is null or reference.voided_at >= activity.created_at)
  union all
  select
    allocation.deduction_obligation_id,
    payroll.submitted_at,
    payroll.id
  from public.payroll_deduction_allocations allocation
  join public.payroll_records payroll on payroll.id = allocation.payroll_record_id
  where payroll.submitted_at is not null
    and allocation.created_at <= payroll.submitted_at
    and (allocation.voided_at is null or allocation.voided_at >= payroll.submitted_at)
), committed as (
  select
    evidence.deduction_obligation_id,
    min(evidence.committed_at) as committed_at,
    (array_agg(evidence.payroll_id order by evidence.committed_at, evidence.payroll_id))[1] as payroll_id
  from submitted_evidence evidence
  group by evidence.deduction_obligation_id
)
update public.payroll_deduction_obligations obligation
set financially_committed_at = null,
    financially_committed_payroll_id = null
where obligation.financially_committed_at is not null
  and not exists (
    select 1 from committed
    where committed.deduction_obligation_id = obligation.id
  );

with allocation_payroll_refs as (
  select
    allocation.id as allocation_id,
    allocation.deduction_obligation_id,
    allocation.created_at,
    allocation.voided_at,
    allocation.payroll_record_id
  from public.payroll_deduction_allocations allocation
  where allocation.payroll_record_id is not null
  union
  select
    allocation.id,
    allocation.deduction_obligation_id,
    allocation.created_at,
    allocation.voided_at,
    adjustment_audit.payroll_record_id
  from public.payroll_deduction_allocations allocation
  join public.payroll_adjustment_audit_events adjustment_audit
    on adjustment_audit.entity_type = 'allocation'
   and adjustment_audit.entity_id = allocation.id
   and adjustment_audit.payroll_record_id is not null
), submitted_evidence as (
  select
    allocation.deduction_obligation_id,
    coalesce(payroll.submitted_at, payroll.approved_at, payroll.paid_at, payroll.updated_at) as committed_at,
    payroll.id as payroll_id
  from public.payroll_deduction_allocations allocation
  join public.payroll_records payroll on payroll.id = allocation.payroll_record_id
  where allocation.voided_at is null
    and payroll.status in (
      'pending'::public.payroll_status,
      'approved'::public.payroll_status,
      'paid'::public.payroll_status
    )
  union all
  select
    reference.deduction_obligation_id,
    activity.created_at,
    reference.payroll_record_id
  from allocation_payroll_refs reference
  join public.activity_logs activity
    on activity.event_type = 'payroll_submit'
   and activity.metadata->>'record_id' = reference.payroll_record_id::text
  where reference.created_at <= activity.created_at
    and (reference.voided_at is null or reference.voided_at >= activity.created_at)
  union all
  select
    allocation.deduction_obligation_id,
    payroll.submitted_at,
    payroll.id
  from public.payroll_deduction_allocations allocation
  join public.payroll_records payroll on payroll.id = allocation.payroll_record_id
  where payroll.submitted_at is not null
    and allocation.created_at <= payroll.submitted_at
    and (allocation.voided_at is null or allocation.voided_at >= payroll.submitted_at)
), committed as (
  select
    evidence.deduction_obligation_id,
    min(evidence.committed_at) as committed_at,
    (array_agg(evidence.payroll_id order by evidence.committed_at, evidence.payroll_id))[1] as payroll_id
  from submitted_evidence evidence
  group by evidence.deduction_obligation_id
)
update public.payroll_deduction_obligations obligation
set financially_committed_at = committed.committed_at,
    financially_committed_payroll_id = committed.payroll_id
from committed
where obligation.id = committed.deduction_obligation_id
  and obligation.financially_committed_at is null;

select set_config('app.payroll_deduction_financial_lock', '', true);
