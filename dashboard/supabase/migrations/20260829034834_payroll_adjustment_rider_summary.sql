-- Paginated read models for the Rider-first Payroll Adjustments workspace.
-- Financial source rows and write/allocation semantics remain unchanged.

create or replace function private.assert_payroll_adjustment_reader()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.user_role;
begin
  select profile.role
  into actor_role
  from public.users profile
  where profile.id = actor
    and profile.status = 'active'::public.user_status
    and profile.employment_status = 'active'::public.employment_status;

  if actor is null or actor_role not in (
    'admin'::public.user_role,
    'hr'::public.user_role,
    'payroll'::public.user_role
  ) then
    raise exception 'Only active staff may read payroll adjustments.';
  end if;

  return actor;
end;
$$;

revoke all on function private.assert_payroll_adjustment_reader() from public, anon, authenticated;

create or replace function public.list_payroll_adjustment_rider_summaries(
  p_search text default null,
  p_hub_id uuid default null,
  p_adjustment_code text default null,
  p_status text default 'actionable',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  rider_id uuid,
  rider_name text,
  rider_code text,
  hub_id uuid,
  hub_name text,
  event_count bigint,
  adjustment_type_count bigint,
  total_remaining numeric,
  latest_activity timestamptz,
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
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if p_adjustment_code is not null and p_adjustment_code not in (
    'general_deductions', 'late_onhold', 'late_remittance'
  ) then
    raise exception 'Unsupported deduction adjustment type.';
  end if;

  if coalesce(p_status, '') not in (
    'actionable', 'history', 'all', 'open', 'partially_recovered', 'settled', 'voided'
  ) then
    raise exception 'Unsupported obligation status filter.';
  end if;

  return query
  with filtered as (
    select
      balance.rider_id,
      rider.name as rider_name,
      rider.mkb_id as rider_code,
      balance.hub_id,
      hub.name as hub_name,
      balance.adjustment_code,
      balance.available_to_allocate,
      balance.status,
      greatest(
        obligation.updated_at,
        balance.adjustment_date::timestamp at time zone 'Asia/Manila'
      ) as activity_at
    from public.v_payroll_deduction_balances balance
    join public.payroll_deduction_obligations obligation
      on obligation.id = balance.obligation_id
    join public.riders rider on rider.id = balance.rider_id
    join public.hubs hub on hub.id = balance.hub_id
    where private.user_can_access_hub_for(actor, balance.hub_id)
      and (p_hub_id is null or balance.hub_id = p_hub_id)
      and (p_adjustment_code is null or balance.adjustment_code = p_adjustment_code)
      and (
        normalized_search is null
        or rider.name ilike '%' || normalized_search || '%'
        or rider.mkb_id ilike '%' || normalized_search || '%'
      )
      and case p_status
        when 'actionable' then balance.status in ('open', 'partially_recovered')
        when 'history' then balance.status in ('settled', 'voided')
        when 'all' then true
        else balance.status = p_status
      end
  ), grouped as (
    select
      filtered.rider_id,
      filtered.rider_name,
      filtered.rider_code,
      filtered.hub_id,
      filtered.hub_name,
      count(*) as event_count,
      count(distinct filtered.adjustment_code) as adjustment_type_count,
      coalesce(sum(
        case when filtered.status in ('open', 'partially_recovered')
          then filtered.available_to_allocate else 0 end
      ), 0) as total_remaining,
      max(filtered.activity_at) as latest_activity
    from filtered
    group by filtered.rider_id, filtered.rider_name, filtered.rider_code, filtered.hub_id, filtered.hub_name
  )
  select
    grouped.rider_id,
    grouped.rider_name,
    grouped.rider_code,
    grouped.hub_id,
    grouped.hub_name,
    grouped.event_count,
    grouped.adjustment_type_count,
    grouped.total_remaining,
    grouped.latest_activity,
    count(*) over() as total_count
  from grouped
  order by grouped.latest_activity desc, grouped.rider_name, grouped.rider_id
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;

create or replace function public.list_payroll_adjustment_rider_events(
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
  if p_rider_id is null then
    raise exception 'Rider is required.';
  end if;

  if p_adjustment_code is not null and p_adjustment_code not in (
    'general_deductions', 'late_onhold', 'late_remittance'
  ) then
    raise exception 'Unsupported deduction adjustment type.';
  end if;

  if coalesce(p_status, '') not in (
    'actionable', 'history', 'all', 'open', 'partially_recovered', 'settled', 'voided'
  ) then
    raise exception 'Unsupported obligation status filter.';
  end if;

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

revoke all on function public.list_payroll_adjustment_rider_summaries(text,uuid,text,text,integer,integer)
  from public, anon, authenticated;
revoke all on function public.list_payroll_adjustment_rider_events(uuid,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.list_payroll_adjustment_rider_summaries(text,uuid,text,text,integer,integer)
  to authenticated, service_role;
grant execute on function public.list_payroll_adjustment_rider_events(uuid,text,text,integer,integer)
  to authenticated, service_role;
