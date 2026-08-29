-- Distinguish reversible Draft/Rejected planning from irreversible submitted
-- payroll participation. Source rows and allocation accounting stay unchanged.

alter table public.payroll_deduction_obligations
  add column financially_committed_at timestamptz,
  add column financially_committed_payroll_id uuid;

-- Existing allocations attached to a payroll that has reached submission are
-- already permanently committed, including payrolls later returned/rejected.
with committed as (
  select
    allocation.deduction_obligation_id,
    min(coalesce(payroll.submitted_at, payroll.approved_at, payroll.paid_at, payroll.updated_at)) as committed_at,
    (array_agg(payroll.id order by coalesce(payroll.submitted_at, payroll.approved_at, payroll.paid_at, payroll.updated_at), payroll.id))[1] as payroll_id
  from public.payroll_deduction_allocations allocation
  join public.payroll_records payroll on payroll.id = allocation.payroll_record_id
  where payroll.status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
     or payroll.submitted_at is not null
     or payroll.approved_at is not null
     or payroll.paid_at is not null
  group by allocation.deduction_obligation_id
)
update public.payroll_deduction_obligations obligation
set financially_committed_at = committed.committed_at,
    financially_committed_payroll_id = committed.payroll_id
from committed
where obligation.id = committed.deduction_obligation_id;

-- A returned Draft payroll can be administratively deleted after its source
-- rows are voided/detached. The immutable submit activity plus allocation audit
-- identifies those already-submitted obligations without treating Draft-only
-- historical allocations as permanent financial usage.
with detached_committed as (
  select
    allocation.deduction_obligation_id,
    min(activity.created_at) as committed_at,
    (array_agg((activity.metadata->>'record_id')::uuid order by activity.created_at))[1] as payroll_id
  from public.payroll_deduction_allocations allocation
  join public.payroll_adjustment_audit_events adjustment_audit
    on adjustment_audit.entity_type = 'allocation'
   and adjustment_audit.entity_id = allocation.id
   and adjustment_audit.payroll_record_id is not null
  join public.activity_logs activity
    on activity.event_type = 'payroll_submit'
   and activity.metadata->>'record_id' = adjustment_audit.payroll_record_id::text
  group by allocation.deduction_obligation_id
)
update public.payroll_deduction_obligations obligation
set financially_committed_at = detached.committed_at,
    financially_committed_payroll_id = detached.payroll_id
from detached_committed detached
where obligation.id = detached.deduction_obligation_id
  and obligation.financially_committed_at is null;

create or replace function public.guard_payroll_deduction_financial_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.financially_committed_at is not null and (
    new.financially_committed_at is distinct from old.financially_committed_at
    or new.financially_committed_payroll_id is distinct from old.financially_committed_payroll_id
  ) then
    raise exception 'Submitted payroll participation cannot be cleared or rewritten.';
  end if;

  if old.financially_committed_at is null
    and new.financially_committed_at is not null
    and coalesce(current_setting('app.payroll_deduction_financial_lock', true), '') <> 'true' then
    raise exception 'Financial commitment can only be recorded by the payroll lifecycle.';
  end if;

  return new;
end;
$$;

create trigger payroll_deduction_financial_lock_immutable
before update of financially_committed_at, financially_committed_payroll_id
on public.payroll_deduction_obligations
for each row execute function public.guard_payroll_deduction_financial_lock();

revoke all on function public.guard_payroll_deduction_financial_lock() from public, anon, authenticated;

create or replace function private.mark_payroll_deduction_financial_commitment(
  p_payroll_record_id uuid,
  p_committed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.payroll_deduction_financial_lock', 'true', true);
  update public.payroll_deduction_obligations obligation
  set financially_committed_at = coalesce(p_committed_at, now()),
      financially_committed_payroll_id = p_payroll_record_id
  where obligation.financially_committed_at is null
    and exists (
      select 1
      from public.payroll_deduction_allocations allocation
      where allocation.deduction_obligation_id = obligation.id
        and allocation.payroll_record_id = p_payroll_record_id
        and allocation.voided_at is null
    );
  perform set_config('app.payroll_deduction_financial_lock', '', true);
end;
$$;

revoke all on function private.mark_payroll_deduction_financial_commitment(uuid,timestamptz)
  from public, anon, authenticated;

create or replace function public.mark_payroll_deduction_commitment_on_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
    and old.status is distinct from new.status then
    perform private.mark_payroll_deduction_financial_commitment(
      new.id,
      coalesce(new.submitted_at, new.approved_at, new.paid_at, now())
    );
  end if;
  return new;
end;
$$;

create trigger trg_mark_payroll_deduction_commitment
after update of status on public.payroll_records
for each row execute function public.mark_payroll_deduction_commitment_on_transition();

revoke all on function public.mark_payroll_deduction_commitment_on_transition()
  from public, anon, authenticated;

create or replace function public.mark_payroll_deduction_commitment_on_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payroll public.payroll_records%rowtype;
begin
  if new.payroll_record_id is null or new.voided_at is not null then
    return new;
  end if;

  select * into payroll
  from public.payroll_records
  where id = new.payroll_record_id;

  if found and payroll.status in (
    'pending'::public.payroll_status,
    'approved'::public.payroll_status,
    'paid'::public.payroll_status
  ) then
    perform private.mark_payroll_deduction_financial_commitment(
      payroll.id,
      coalesce(payroll.submitted_at, payroll.approved_at, payroll.paid_at, now())
    );
  end if;

  return new;
end;
$$;

create trigger trg_mark_payroll_deduction_commitment_on_allocation
after insert or update of payroll_record_id, voided_at
on public.payroll_deduction_allocations
for each row execute function public.mark_payroll_deduction_commitment_on_allocation();

revoke all on function public.mark_payroll_deduction_commitment_on_allocation()
  from public, anon, authenticated;

create or replace view public.v_payroll_deduction_balances
with (security_invoker = true)
as
select
  obligation.id as obligation_id,
  obligation.rider_id,
  obligation.hub_id,
  obligation.adjustment_code,
  definition.display_name,
  obligation.original_amount,
  obligation.adjustment_date,
  obligation.reason,
  obligation.reference,
  obligation.voided_at,
  coalesce(sum(allocation.amount) filter (where payroll.status = 'paid'::public.payroll_status and allocation.voided_at is null),0) as recovered,
  coalesce(sum(allocation.amount) filter (where payroll.status in ('pending'::public.payroll_status,'approved'::public.payroll_status) and allocation.voided_at is null),0) as committed,
  coalesce(sum(allocation.amount) filter (where payroll.status in ('draft'::public.payroll_status,'rejected'::public.payroll_status) and allocation.voided_at is null),0) as planned,
  greatest(obligation.original_amount - coalesce(sum(allocation.amount) filter (where payroll.status = 'paid'::public.payroll_status and allocation.voided_at is null),0),0) as outstanding,
  greatest(obligation.original_amount - coalesce(sum(allocation.amount) filter (where allocation.voided_at is null),0),0) as available_to_allocate,
  case
    when obligation.voided_at is not null then 'voided'
    when coalesce(sum(allocation.amount) filter (where payroll.status = 'paid'::public.payroll_status and allocation.voided_at is null),0) >= obligation.original_amount then 'settled'
    when coalesce(sum(allocation.amount) filter (where payroll.status = 'paid'::public.payroll_status and allocation.voided_at is null),0) > 0 then 'partially_recovered'
    else 'open'
  end as status,
  obligation.financially_committed_at,
  obligation.financially_committed_at is not null as financially_locked
from public.payroll_deduction_obligations obligation
join public.payroll_adjustment_definitions definition on definition.code = obligation.adjustment_code
left join public.payroll_deduction_allocations allocation on allocation.deduction_obligation_id = obligation.id
left join public.payroll_records payroll on payroll.id = allocation.payroll_record_id
group by obligation.id, definition.display_name;

revoke all on public.v_payroll_deduction_balances from public, anon;
grant select on public.v_payroll_deduction_balances to authenticated, service_role;

create or replace function public.update_payroll_deduction_obligation(
  p_obligation_id uuid,
  p_original_amount numeric,
  p_adjustment_date date,
  p_reason text,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_payroll_adjustment_manager();
  oldrow public.payroll_deduction_obligations%rowtype;
  allocated numeric;
  financial_fields_changed boolean;
begin
  select * into oldrow
  from public.payroll_deduction_obligations
  where id = p_obligation_id
  for update;

  if not found then raise exception 'Deduction obligation was not found.'; end if;
  if oldrow.voided_at is not null then raise exception 'Voided obligation cannot be edited.'; end if;
  if not private.user_can_access_hub_for(actor, oldrow.hub_id) then
    raise exception 'Obligation is outside the authorized Hub scope.';
  end if;

  financial_fields_changed := p_original_amount is distinct from oldrow.original_amount
    or p_adjustment_date is distinct from oldrow.adjustment_date;

  if financial_fields_changed and oldrow.financially_committed_at is not null then
    raise exception 'Original amount and incident date are permanently immutable after submitted payroll participation.';
  end if;

  if financial_fields_changed and exists (
    select 1
    from public.payroll_deduction_allocations allocation
    where allocation.deduction_obligation_id = p_obligation_id
      and allocation.voided_at is null
  ) then
    raise exception 'Original amount and incident date are locked while an active payroll allocation exists.';
  end if;

  select coalesce(sum(amount),0)
  into allocated
  from public.payroll_deduction_allocations
  where deduction_obligation_id = p_obligation_id
    and voided_at is null;

  if p_original_amount < allocated then
    raise exception 'Original amount cannot be less than active allocations.';
  end if;
  if exists (
    select 1 from public.payroll_deduction_allocations
    where deduction_obligation_id = p_obligation_id
      and voided_at is null
      and cutoff_end < p_adjustment_date
  ) then
    raise exception 'Incident date cannot move after an existing allocation cutoff.';
  end if;

  update public.payroll_deduction_obligations
  set original_amount = p_original_amount,
      adjustment_date = p_adjustment_date,
      reason = btrim(p_reason),
      reference = nullif(btrim(p_reference),''),
      updated_by = actor,
      updated_at = now()
  where id = p_obligation_id;

  perform private.write_payroll_adjustment_audit(
    'obligation',p_obligation_id,oldrow.rider_id,oldrow.hub_id,null,'update',to_jsonb(oldrow),
    jsonb_build_object(
      'original_amount',p_original_amount,
      'adjustment_date',p_adjustment_date,
      'reason',btrim(p_reason),
      'reference',nullif(btrim(p_reference),'')
    ),
    p_reason,actor,'manual'
  );
end;
$$;

revoke all on function public.update_payroll_deduction_obligation(uuid,numeric,date,text,text)
  from public, anon, authenticated;
grant execute on function public.update_payroll_deduction_obligation(uuid,numeric,date,text,text)
  to authenticated;

drop function public.list_payroll_adjustment_rider_events(uuid,text,text,integer,integer);

create function public.list_payroll_adjustment_rider_events(
  p_rider_id uuid,
  p_adjustment_code text default null,
  p_status text default 'actionable',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  obligation_id uuid,
  rider_id uuid,
  hub_id uuid,
  adjustment_code text,
  display_name text,
  original_amount numeric,
  adjustment_date date,
  reason text,
  reference text,
  voided_at timestamptz,
  recovered numeric,
  committed numeric,
  planned numeric,
  outstanding numeric,
  available_to_allocate numeric,
  status text,
  financially_committed_at timestamptz,
  financially_locked boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := private.assert_payroll_adjustment_reader();
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if p_rider_id is null then raise exception 'Rider is required.'; end if;
  if p_adjustment_code is not null and p_adjustment_code not in (
    'general_deductions', 'late_onhold', 'late_remittance'
  ) then raise exception 'Unsupported deduction adjustment type.'; end if;
  if coalesce(p_status, '') not in (
    'actionable', 'history', 'all', 'open', 'partially_recovered', 'settled', 'voided'
  ) then raise exception 'Unsupported obligation status filter.'; end if;

  return query
  select
    balance.obligation_id,
    balance.rider_id,
    balance.hub_id,
    balance.adjustment_code,
    balance.display_name,
    balance.original_amount,
    balance.adjustment_date,
    balance.reason,
    balance.reference,
    balance.voided_at,
    balance.recovered,
    balance.committed,
    balance.planned,
    balance.outstanding,
    balance.available_to_allocate,
    balance.status,
    balance.financially_committed_at,
    balance.financially_locked,
    count(*) over() as total_count
  from public.v_payroll_deduction_balances balance
  where balance.rider_id = p_rider_id
    and private.user_can_access_hub_for(actor, balance.hub_id)
    and (p_adjustment_code is null or balance.adjustment_code = p_adjustment_code)
    and case p_status
      when 'actionable' then balance.status in ('open', 'partially_recovered')
      when 'history' then balance.status in ('settled', 'voided')
      when 'all' then true
      else balance.status = p_status
    end
  order by balance.adjustment_date desc, balance.obligation_id desc
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;

revoke all on function public.list_payroll_adjustment_rider_events(uuid,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.list_payroll_adjustment_rider_events(uuid,text,text,integer,integer)
  to authenticated, service_role;
