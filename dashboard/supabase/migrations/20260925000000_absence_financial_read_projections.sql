-- Policy V2 Phase 6: explicit safe-field read projections only.
-- Base consequence/audit RLS and existing financial write APIs remain unchanged.

create function public.list_rider_absence_financial_consequences_for_payroll(
  p_start_date date,
  p_end_date date,
  p_hub_id uuid default null,
  p_rider_id uuid default null,
  p_status text default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  consequence_id uuid,
  rider_id uuid,
  rider_name text,
  rider_code text,
  hub_id uuid,
  hub_name text,
  business_date date,
  status text,
  policy_penalty_amount numeric,
  applied_amount numeric,
  currency text,
  deduction_obligation_id uuid,
  obligation_status text,
  obligation_outstanding numeric,
  obligation_available_to_allocate numeric,
  reversal_earning_id uuid,
  has_compensation boolean,
  is_reversed boolean,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
begin
  if actor_id is null or actor_role is null
     or actor_role not in ('admin'::public.user_role, 'payroll'::public.user_role)
     or not exists (
       select 1 from public.users actor where actor.id = actor_id
         and actor.status = 'active'::public.user_status
         and actor.employment_status = 'active'::public.employment_status
     ) then
    raise exception 'Only active employed Admin and Payroll accounts can read this projection.'
      using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date > 31 then
    raise exception 'A valid date window of at most 32 calendar days is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500
     or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Page size must be 1..500 and offset must be 0..100000.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in (
    'confirmed', 'waived_emergency', 'waived_excused', 'reversed'
  ) then
    raise exception 'Unsupported financial consequence status.' using errcode = '22023';
  end if;
  if p_hub_id is not null and not private.user_can_access_hub_for(actor_id, p_hub_id) then
    raise exception 'You are not authorized to read the requested Hub.' using errcode = '42501';
  end if;

  return query
  select
    consequence.id,
    consequence.rider_id,
    rider.name,
    rider.mkb_id,
    consequence.hub_id,
    hub.name,
    consequence.business_date,
    consequence.status,
    consequence.policy_penalty_amount,
    consequence.applied_amount,
    consequence.currency,
    balance.obligation_id,
    balance.status,
    balance.outstanding,
    balance.available_to_allocate,
    earning.id,
    consequence.reversal_earning_id is not null,
    consequence.status = 'reversed',
    consequence.decided_at
  from public.rider_absence_financial_consequences consequence
  join public.riders rider on rider.id = consequence.rider_id
  join public.hubs hub on hub.id = consequence.hub_id
  -- Reuse the existing ledger read model, not a second balance calculation.
  -- Only a matching historical Rider/Hub link may expose obligation details.
  left join public.v_payroll_deduction_balances balance
    on balance.obligation_id = consequence.deduction_obligation_id
    and balance.rider_id = consequence.rider_id
    and balance.hub_id = consequence.hub_id
  -- A later compensation can belong to a different Hub. Its presence is safe
  -- historical state, but its identifier remains subject to its own Hub scope.
  left join public.payroll_earning_adjustments earning
    on earning.id = consequence.reversal_earning_id
    and earning.rider_id = consequence.rider_id
    and private.user_can_access_hub_for(actor_id, earning.hub_id)
  where consequence.business_date between p_start_date and p_end_date
    and private.user_can_access_hub_for(actor_id, consequence.hub_id)
    and (p_hub_id is null or consequence.hub_id = p_hub_id)
    and (p_rider_id is null or consequence.rider_id = p_rider_id)
    and (p_status is null or consequence.status = p_status)
  order by consequence.business_date desc, consequence.id
  limit p_limit offset p_offset;
end;
$$;

comment on function public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer) is
  'Read-only Admin/Payroll projection of persisted decisions with historical Hub authorization. Safe fields only; no notes, evidence, actors, audit JSON, policy internals, or eligibility evaluation. Compensation identity is withheld outside its own Hub scope.';

create function public.list_my_absence_financial_consequences(
  p_start_date date,
  p_end_date date,
  p_status text default null,
  p_limit integer default 500,
  p_offset integer default 0
)
returns table (
  consequence_id uuid,
  business_date date,
  status text,
  status_label text,
  policy_penalty_amount numeric,
  applied_amount numeric,
  currency text,
  has_obligation boolean,
  is_reversed boolean,
  has_compensation boolean,
  decided_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := (select public.get_my_role());
  my_rider_id uuid := (select public.get_my_rider_id());
begin
  if actor_id is null or actor_role is distinct from 'rider'::public.user_role
     or my_rider_id is null or not public.is_rider_account_operational(actor_id) then
    raise exception 'Only an active employed linked Rider can read their financial consequences.'
      using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date > 31 then
    raise exception 'A valid date window of at most 32 calendar days is required.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500
     or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'Page size must be 1..500 and offset must be 0..100000.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in (
    'confirmed', 'waived_emergency', 'waived_excused', 'reversed'
  ) then
    raise exception 'Unsupported financial consequence status.' using errcode = '22023';
  end if;
  return query
  select
    consequence.id,
    consequence.business_date,
    consequence.status,
    case consequence.status
      when 'confirmed' then 'Financial penalty confirmed'::text
      when 'waived_emergency' then 'Penalty waived'::text
      when 'waived_excused' then 'Penalty waived'::text
      when 'reversed' then 'Financial penalty reversed'::text
    end,
    consequence.policy_penalty_amount,
    consequence.applied_amount,
    consequence.currency,
    consequence.deduction_obligation_id is not null,
    consequence.status = 'reversed',
    consequence.reversal_earning_id is not null,
    consequence.decided_at
  from public.rider_absence_financial_consequences consequence
  where consequence.rider_id = my_rider_id
    and consequence.business_date between p_start_date and p_end_date
    and (p_status is null or consequence.status = p_status)
  order by consequence.business_date desc, consequence.id
  limit p_limit offset p_offset;
end;
$$;

comment on function public.list_my_absence_financial_consequences(date,date,text,integer,integer) is
  'Read-only active Rider-own projection using get_my_rider_id(). Status labels and link-presence flags never assert deduction or refund payment. No staff notes/evidence, user identities, audit JSON, policy internals, or eligibility evaluation.';

revoke all on function public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.list_my_absence_financial_consequences(date,date,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.list_rider_absence_financial_consequences_for_payroll(date,date,uuid,uuid,text,integer,integer)
  to authenticated;
grant execute on function public.list_my_absence_financial_consequences(date,date,text,integer,integer)
  to authenticated;
