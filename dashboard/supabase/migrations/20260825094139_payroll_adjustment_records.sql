-- Traceable Rider-specific payroll earnings and carry-over deduction obligations.
-- Existing submitted payroll remains legacy source version 1 and is never reconstructed.

create type public.payroll_adjustment_source as enum ('manual', 'legacy_migration');

alter table public.payroll_records add column adjustment_source_version smallint;
update public.payroll_records set adjustment_source_version = 1;
alter table public.payroll_records
  alter column adjustment_source_version set default 2,
  alter column adjustment_source_version set not null,
  add constraint payroll_records_adjustment_source_version_check
    check (adjustment_source_version in (1, 2));

create table public.payroll_earning_adjustments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  payroll_record_id uuid references public.payroll_records(id) on delete restrict,
  cutoff_start date not null,
  cutoff_end date not null,
  adjustment_code text not null references public.payroll_adjustment_definitions(code) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  adjustment_date date not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  reference text check (reference is null or length(btrim(reference)) between 1 and 200),
  source public.payroll_adjustment_source not null default 'manual',
  created_by uuid references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.users(id) on delete restrict,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint payroll_earning_adjustments_code_check check (adjustment_code in ('other_earnings','fm_pickup')),
  constraint payroll_earning_adjustments_cutoff_check check (cutoff_start <= cutoff_end),
  constraint payroll_earning_adjustments_date_check check (adjustment_date between cutoff_start and cutoff_end),
  constraint payroll_earning_adjustments_actor_check check (source = 'legacy_migration' or created_by is not null),
  constraint payroll_earning_adjustments_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null)
  ),
  constraint payroll_earning_adjustments_active_parent_check check (voided_at is not null or payroll_record_id is not null)
);

create table public.payroll_deduction_obligations (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  adjustment_code text not null references public.payroll_adjustment_definitions(code) on delete restrict,
  original_amount numeric(12,2) not null check (original_amount > 0),
  adjustment_date date not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  reference text check (reference is null or length(btrim(reference)) between 1 and 200),
  source public.payroll_adjustment_source not null default 'manual',
  created_by uuid references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.users(id) on delete restrict,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint payroll_deduction_obligations_code_check check (adjustment_code in ('general_deductions','late_onhold','late_remittance')),
  constraint payroll_deduction_obligations_actor_check check (source = 'legacy_migration' or created_by is not null),
  constraint payroll_deduction_obligations_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null)
  )
);

create table public.payroll_deduction_allocations (
  id uuid primary key default gen_random_uuid(),
  deduction_obligation_id uuid not null references public.payroll_deduction_obligations(id) on delete restrict,
  payroll_record_id uuid references public.payroll_records(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  cutoff_start date not null,
  cutoff_end date not null,
  amount numeric(12,2) not null check (amount > 0),
  source public.payroll_adjustment_source not null default 'manual',
  created_by uuid references public.users(id) on delete restrict,
  updated_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.users(id) on delete restrict,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 500),
  constraint payroll_deduction_allocations_cutoff_check check (cutoff_start <= cutoff_end),
  constraint payroll_deduction_allocations_actor_check check (source = 'legacy_migration' or created_by is not null),
  constraint payroll_deduction_allocations_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and void_reason is not null)
  ),
  constraint payroll_deduction_allocations_active_parent_check check (voided_at is not null or payroll_record_id is not null)
);

create table public.payroll_adjustment_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('earning','obligation','allocation')),
  entity_id uuid not null,
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  payroll_record_id uuid,
  action text not null check (length(btrim(action)) between 1 and 80),
  previous_values jsonb,
  new_values jsonb,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  actor_id uuid references public.users(id) on delete restrict,
  source public.payroll_adjustment_source not null,
  created_at timestamptz not null default now(),
  constraint payroll_adjustment_audit_actor_check check (source = 'legacy_migration' or actor_id is not null),
  constraint payroll_adjustment_audit_values_check check (previous_values is not null or new_values is not null)
);

create index payroll_earning_adjustments_payroll_idx on public.payroll_earning_adjustments(payroll_record_id) where voided_at is null;
create index payroll_earning_adjustments_hub_date_idx on public.payroll_earning_adjustments(hub_id, adjustment_date desc);
create index payroll_earning_adjustments_rider_date_idx on public.payroll_earning_adjustments(rider_id, adjustment_date desc);
create index payroll_deduction_obligations_hub_date_idx on public.payroll_deduction_obligations(hub_id, adjustment_date desc);
create index payroll_deduction_obligations_rider_code_idx on public.payroll_deduction_obligations(rider_id, adjustment_code, adjustment_date desc);
create index payroll_deduction_allocations_payroll_idx on public.payroll_deduction_allocations(payroll_record_id) where voided_at is null;
create index payroll_deduction_allocations_obligation_idx on public.payroll_deduction_allocations(deduction_obligation_id) where voided_at is null;
create unique index payroll_deduction_allocations_active_unique
  on public.payroll_deduction_allocations(deduction_obligation_id, payroll_record_id)
  where voided_at is null and payroll_record_id is not null;
create index payroll_adjustment_audit_entity_idx on public.payroll_adjustment_audit_events(entity_type, entity_id, created_at desc);
create index payroll_adjustment_audit_hub_idx on public.payroll_adjustment_audit_events(hub_id, created_at desc);

alter table public.payroll_earning_adjustments enable row level security;
alter table public.payroll_deduction_obligations enable row level security;
alter table public.payroll_deduction_allocations enable row level security;
alter table public.payroll_adjustment_audit_events enable row level security;

revoke all on public.payroll_earning_adjustments, public.payroll_deduction_obligations,
  public.payroll_deduction_allocations, public.payroll_adjustment_audit_events from public, anon, authenticated;
grant select on public.payroll_earning_adjustments, public.payroll_deduction_obligations,
  public.payroll_deduction_allocations, public.payroll_adjustment_audit_events to authenticated;
grant all on public.payroll_earning_adjustments, public.payroll_deduction_obligations,
  public.payroll_deduction_allocations, public.payroll_adjustment_audit_events to service_role;

create policy payroll_earning_adjustments_staff_select on public.payroll_earning_adjustments
for select to authenticated using (
  (select public.get_my_role()) in ('admin'::public.user_role,'hr'::public.user_role,'payroll'::public.user_role)
  and private.user_can_access_hub(hub_id)
);
create policy payroll_deduction_obligations_staff_select on public.payroll_deduction_obligations
for select to authenticated using (
  (select public.get_my_role()) in ('admin'::public.user_role,'hr'::public.user_role,'payroll'::public.user_role)
  and private.user_can_access_hub(hub_id)
);
create policy payroll_deduction_allocations_staff_select on public.payroll_deduction_allocations
for select to authenticated using (
  (select public.get_my_role()) in ('admin'::public.user_role,'hr'::public.user_role,'payroll'::public.user_role)
  and private.user_can_access_hub(hub_id)
);
create policy payroll_adjustment_audit_staff_select on public.payroll_adjustment_audit_events
for select to authenticated using (
  (select public.get_my_role()) in ('admin'::public.user_role,'hr'::public.user_role,'payroll'::public.user_role)
  and private.user_can_access_hub(hub_id)
);

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
  end as status
from public.payroll_deduction_obligations obligation
join public.payroll_adjustment_definitions definition on definition.code=obligation.adjustment_code
left join public.payroll_deduction_allocations allocation on allocation.deduction_obligation_id=obligation.id
left join public.payroll_records payroll on payroll.id=allocation.payroll_record_id
group by obligation.id, definition.display_name;

revoke all on public.v_payroll_deduction_balances from public, anon;
grant select on public.v_payroll_deduction_balances to authenticated, service_role;

create or replace function private.assert_payroll_adjustment_manager()
returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid(); actor_role public.user_role;
begin
  select role into actor_role from public.users
  where id=actor and status='active'::public.user_status and employment_status='active'::public.employment_status;
  if actor is null or actor_role not in ('admin'::public.user_role,'payroll'::public.user_role) then
    raise exception 'Only Admin or Payroll may manage payroll adjustments.';
  end if;
  return actor;
end;
$$;
revoke all on function private.assert_payroll_adjustment_manager() from public, anon, authenticated;

create or replace function private.write_payroll_adjustment_audit(
  p_entity_type text, p_entity_id uuid, p_rider_id uuid, p_hub_id uuid,
  p_payroll_record_id uuid, p_action text, p_previous jsonb, p_new jsonb,
  p_reason text, p_actor uuid, p_source public.payroll_adjustment_source
) returns void language sql security definer set search_path=''
as $$
  insert into public.payroll_adjustment_audit_events(
    entity_type,entity_id,rider_id,hub_id,payroll_record_id,action,
    previous_values,new_values,reason,actor_id,source
  ) values (
    p_entity_type,p_entity_id,p_rider_id,p_hub_id,p_payroll_record_id,p_action,
    p_previous,p_new,btrim(p_reason),p_actor,p_source
  );
$$;
revoke all on function private.write_payroll_adjustment_audit(text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,uuid,public.payroll_adjustment_source) from public, anon, authenticated;

create or replace function public.guard_payroll_adjustment_audit_events()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'Payroll adjustment audit events are append-only.'; end; $$;
create trigger payroll_adjustment_audit_events_immutable before update or delete
on public.payroll_adjustment_audit_events for each row execute function public.guard_payroll_adjustment_audit_events();
revoke all on function public.guard_payroll_adjustment_audit_events() from public, anon, authenticated;

create or replace function public.guard_payroll_financial_source_rows()
returns trigger language plpgsql security definer set search_path=''
as $$
declare parent_status public.payroll_status; parent_id uuid;
begin
  if tg_op='DELETE' then raise exception 'Financial source records cannot be deleted.'; end if;
  parent_id := coalesce(new.payroll_record_id, old.payroll_record_id);
  if parent_id is not null then
    select status into parent_status from public.payroll_records where id=parent_id;
    if parent_status in ('pending','approved','paid') then
      raise exception 'Submitted payroll financial source records are immutable.';
    end if;
  end if;
  return new;
end;
$$;
create trigger payroll_earning_adjustments_guard before update or delete on public.payroll_earning_adjustments
for each row execute function public.guard_payroll_financial_source_rows();
create trigger payroll_deduction_allocations_guard before update or delete on public.payroll_deduction_allocations
for each row execute function public.guard_payroll_financial_source_rows();
revoke all on function public.guard_payroll_financial_source_rows() from public, anon, authenticated;

create or replace function public.guard_traceable_payroll_aggregate_writes()
returns trigger language plpgsql set search_path=''
as $$
begin
  if old.adjustment_source_version=2 and new.adjustment_source_version<>2 then
    raise exception 'Traceable payroll cannot revert to legacy adjustment sources.';
  end if;
  if (new.adjustment_source_version=2 or old.adjustment_source_version=2) and (
    new.other_earnings is distinct from old.other_earnings or
    new.fm_pickup_amount is distinct from old.fm_pickup_amount or
    new.deductions is distinct from old.deductions or
    new.late_onhold is distinct from old.late_onhold or
    new.late_remittance is distinct from old.late_remittance or
    new.adjustment_source_version is distinct from old.adjustment_source_version
  ) and nullif(current_setting('app.payroll_adjustment_sync_request_id',true),'') is null then
    raise exception 'Traceable payroll adjustment totals can only be changed by the guarded synchronization path.';
  end if;
  return new;
end;
$$;
create trigger trg_c_guard_traceable_payroll_aggregate_writes before update on public.payroll_records
for each row execute function public.guard_traceable_payroll_aggregate_writes();
revoke all on function public.guard_traceable_payroll_aggregate_writes() from public, anon, authenticated;

create or replace function private.sync_traceable_payroll_aggregates(p_payroll_record_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare earning_other numeric; earning_fm numeric; deduction_general numeric; deduction_onhold numeric; deduction_remittance numeric;
begin
  select
    coalesce(sum(amount) filter(where adjustment_code='other_earnings'),0),
    coalesce(sum(amount) filter(where adjustment_code='fm_pickup'),0)
  into earning_other,earning_fm from public.payroll_earning_adjustments
  where payroll_record_id=p_payroll_record_id and voided_at is null;
  select
    coalesce(sum(a.amount) filter(where o.adjustment_code='general_deductions'),0),
    coalesce(sum(a.amount) filter(where o.adjustment_code='late_onhold'),0),
    coalesce(sum(a.amount) filter(where o.adjustment_code='late_remittance'),0)
  into deduction_general,deduction_onhold,deduction_remittance
  from public.payroll_deduction_allocations a join public.payroll_deduction_obligations o on o.id=a.deduction_obligation_id
  where a.payroll_record_id=p_payroll_record_id and a.voided_at is null;
  perform set_config('app.payroll_adjustment_sync_request_id',p_request_id::text,true);
  update public.payroll_records set
    other_earnings=earning_other, fm_pickup_amount=earning_fm,
    deductions=deduction_general, late_onhold=deduction_onhold,
    late_remittance=deduction_remittance, adjustment_source_version=2
  where id=p_payroll_record_id;
  perform set_config('app.payroll_adjustment_sync_request_id','',true);
end;
$$;
revoke all on function private.sync_traceable_payroll_aggregates(uuid,uuid) from public, anon, authenticated;

create or replace function public.create_payroll_deduction_obligation(
  p_rider_id uuid, p_adjustment_code text, p_original_amount numeric,
  p_adjustment_date date, p_reason text, p_reference text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid:=private.assert_payroll_adjustment_manager(); rider_hub uuid; definition_active boolean; result_id uuid:=gen_random_uuid();
begin
  if p_original_amount<=0 then raise exception 'Original amount must be greater than zero.'; end if;
  if p_adjustment_date is null then raise exception 'Adjustment date is required.'; end if;
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Reason is required.'; end if;
  select hub_id into rider_hub from public.riders where id=p_rider_id for share;
  if not found then raise exception 'Rider was not found.'; end if;
  if rider_hub is null then raise exception 'Rider must have an assigned Hub.'; end if;
  if not private.user_can_access_hub_for(actor,rider_hub) then raise exception 'Rider is outside the authorized Hub scope.'; end if;
  select active into definition_active from public.payroll_adjustment_definitions
  where code=p_adjustment_code and category='deduction';
  if not found or not definition_active then raise exception 'Deduction definition is unavailable.'; end if;
  insert into public.payroll_deduction_obligations(
    id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,reference,source,created_by,updated_by
  ) values (result_id,p_rider_id,rider_hub,p_adjustment_code,p_original_amount,p_adjustment_date,btrim(p_reason),nullif(btrim(p_reference),''),'manual',actor,actor);
  perform private.write_payroll_adjustment_audit('obligation',result_id,p_rider_id,rider_hub,null,'create',null,
    jsonb_build_object('adjustment_code',p_adjustment_code,'original_amount',p_original_amount,'adjustment_date',p_adjustment_date,'reason',btrim(p_reason),'reference',nullif(btrim(p_reference),'')),
    p_reason,actor,'manual');
  return result_id;
end;
$$;

create or replace function public.void_payroll_deduction_obligation(p_obligation_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=private.assert_payroll_adjustment_manager(); row_before public.payroll_deduction_obligations%rowtype;
begin
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Void reason is required.'; end if;
  select * into row_before from public.payroll_deduction_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Deduction obligation was not found.'; end if;
  if not private.user_can_access_hub_for(actor,row_before.hub_id) then raise exception 'Obligation is outside the authorized Hub scope.'; end if;
  if exists(select 1 from public.payroll_deduction_allocations where deduction_obligation_id=p_obligation_id and voided_at is null) then
    raise exception 'Remove planned allocations first; obligations with committed or recovered history cannot be voided.';
  end if;
  update public.payroll_deduction_obligations set voided_at=now(),voided_by=actor,void_reason=btrim(p_reason),updated_at=now(),updated_by=actor where id=p_obligation_id;
  perform private.write_payroll_adjustment_audit('obligation',p_obligation_id,row_before.rider_id,row_before.hub_id,null,'void',to_jsonb(row_before),
    jsonb_build_object('voided',true,'void_reason',btrim(p_reason)),p_reason,actor,'manual');
end;
$$;

create or replace function public.update_payroll_deduction_obligation(
  p_obligation_id uuid,p_original_amount numeric,p_adjustment_date date,p_reason text,p_reference text default null
) returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=private.assert_payroll_adjustment_manager(); oldrow public.payroll_deduction_obligations%rowtype; allocated numeric;
begin
  select * into oldrow from public.payroll_deduction_obligations where id=p_obligation_id for update;
  if not found then raise exception 'Deduction obligation was not found.'; end if;
  if oldrow.voided_at is not null then raise exception 'Voided obligation cannot be edited.'; end if;
  if not private.user_can_access_hub_for(actor,oldrow.hub_id) then raise exception 'Obligation is outside the authorized Hub scope.'; end if;
  select coalesce(sum(amount),0) into allocated from public.payroll_deduction_allocations where deduction_obligation_id=p_obligation_id and voided_at is null;
  if p_original_amount<allocated then raise exception 'Original amount cannot be less than active allocations.'; end if;
  if exists(select 1 from public.payroll_deduction_allocations a join public.payroll_records p on p.id=a.payroll_record_id where a.deduction_obligation_id=p_obligation_id and a.voided_at is null and p.status in ('pending','approved','paid'))
     and (p_original_amount is distinct from oldrow.original_amount or p_adjustment_date is distinct from oldrow.adjustment_date) then
    raise exception 'Original amount and incident date are immutable after committed or recovered history.';
  end if;
  update public.payroll_deduction_obligations set original_amount=p_original_amount,adjustment_date=p_adjustment_date,
    reason=btrim(p_reason),reference=nullif(btrim(p_reference),''),updated_by=actor,updated_at=now() where id=p_obligation_id;
  perform private.write_payroll_adjustment_audit('obligation',p_obligation_id,oldrow.rider_id,oldrow.hub_id,null,'update',to_jsonb(oldrow),
    jsonb_build_object('original_amount',p_original_amount,'adjustment_date',p_adjustment_date,'reason',btrim(p_reason),'reference',nullif(btrim(p_reference),'')),p_reason,actor,'manual');
end;
$$;

create or replace function public.save_payroll_adjustment_plan(
  p_payroll_record_id uuid,p_earnings jsonb,p_allocations jsonb,p_reason text
) returns void language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=private.assert_payroll_adjustment_manager(); payroll public.payroll_records%rowtype;
  item jsonb; item_id uuid; obligation public.payroll_deduction_obligations%rowtype;
  earning_existing public.payroll_earning_adjustments%rowtype;
  existing public.payroll_deduction_allocations%rowtype; available numeric; request_id uuid:=gen_random_uuid(); projected numeric;
begin
  if jsonb_typeof(coalesce(p_earnings,'[]'))<>'array' or jsonb_typeof(coalesce(p_allocations,'[]'))<>'array' then raise exception 'Adjustment plan must use arrays.'; end if;
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Change reason is required.'; end if;
  select * into payroll from public.payroll_records where id=p_payroll_record_id for update;
  if not found then raise exception 'Payroll record was not found.'; end if;
  if payroll.status not in ('draft','rejected') then raise exception 'Payroll adjustments are editable only in Draft or Rejected status.'; end if;
  if payroll.hub_id is null then raise exception 'Payroll record must have an assigned Hub.'; end if;
  if not private.user_can_access_hub_for(actor,payroll.hub_id) then raise exception 'Payroll is outside the authorized Hub scope.'; end if;

  -- Omitted active earnings are explicitly voided, never deleted.
  for earning_existing in select * from public.payroll_earning_adjustments where payroll_record_id=p_payroll_record_id and voided_at is null for update loop
    if not exists(select 1 from jsonb_array_elements(coalesce(p_earnings,'[]')) e where nullif(e->>'id','')::uuid=earning_existing.id) then
      update public.payroll_earning_adjustments set voided_at=now(),voided_by=actor,void_reason=btrim(p_reason),updated_by=actor,updated_at=now() where id=earning_existing.id;
      perform private.write_payroll_adjustment_audit('earning',earning_existing.id,earning_existing.rider_id,earning_existing.hub_id,p_payroll_record_id,'void',to_jsonb(earning_existing),jsonb_build_object('voided',true),p_reason,actor,'manual');
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_earnings,'[]')) loop
    if coalesce((item->>'amount')::numeric,0)<=0 then raise exception 'Earning amount must be greater than zero.'; end if;
    if (item->>'adjustment_date')::date not between payroll.cutoff_start and payroll.cutoff_end then raise exception 'Earning date must fall within the payroll cutoff.'; end if;
    if not exists(select 1 from public.payroll_adjustment_definitions where code=item->>'adjustment_code' and category='earning' and active) then raise exception 'Earning definition is unavailable.'; end if;
    item_id:=nullif(item->>'id','')::uuid;
    if item_id is null then
      item_id:=gen_random_uuid();
      insert into public.payroll_earning_adjustments(id,rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,reference,source,created_by,updated_by)
      values(item_id,payroll.rider_id,payroll.hub_id,payroll.id,payroll.cutoff_start,payroll.cutoff_end,item->>'adjustment_code',(item->>'amount')::numeric,(item->>'adjustment_date')::date,btrim(item->>'reason'),nullif(btrim(item->>'reference'),''),'manual',actor,actor);
      perform private.write_payroll_adjustment_audit('earning',item_id,payroll.rider_id,payroll.hub_id,payroll.id,'create',null,item,p_reason,actor,'manual');
    else
      if not exists(select 1 from public.payroll_earning_adjustments where id=item_id and payroll_record_id=payroll.id and voided_at is null) then raise exception 'Earning adjustment was not found in this payroll.'; end if;
      update public.payroll_earning_adjustments set adjustment_code=item->>'adjustment_code',amount=(item->>'amount')::numeric,
        adjustment_date=(item->>'adjustment_date')::date,reason=btrim(item->>'reason'),reference=nullif(btrim(item->>'reference'),''),updated_by=actor,updated_at=now() where id=item_id;
    end if;
  end loop;

  -- Omitted or zero allocations are voided and detached from the active plan.
  for existing in select * from public.payroll_deduction_allocations where payroll_record_id=p_payroll_record_id and voided_at is null for update loop
    if not exists(select 1 from jsonb_array_elements(coalesce(p_allocations,'[]')) a where (a->>'obligation_id')::uuid=existing.deduction_obligation_id and coalesce((a->>'amount')::numeric,0)>0) then
      update public.payroll_deduction_allocations set voided_at=now(),voided_by=actor,void_reason=btrim(p_reason),updated_by=actor,updated_at=now() where id=existing.id;
      perform private.write_payroll_adjustment_audit('allocation',existing.id,existing.rider_id,existing.hub_id,p_payroll_record_id,'void',to_jsonb(existing),jsonb_build_object('voided',true),p_reason,actor,'manual');
    end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_allocations,'[]')) order by value->>'obligation_id' loop
    if coalesce((item->>'amount')::numeric,0)<=0 then continue; end if;
    select * into obligation from public.payroll_deduction_obligations where id=(item->>'obligation_id')::uuid for update;
    if not found or obligation.voided_at is not null then raise exception 'Deduction obligation is unavailable.'; end if;
    if obligation.rider_id<>payroll.rider_id or obligation.hub_id<>payroll.hub_id then raise exception 'Deduction obligation does not belong to this Rider and Hub.'; end if;
    if payroll.cutoff_end<obligation.adjustment_date then raise exception 'Deduction cannot be allocated to a cutoff ending before the incident date.'; end if;
    select * into existing from public.payroll_deduction_allocations where deduction_obligation_id=obligation.id and payroll_record_id=payroll.id and voided_at is null for update;
    select obligation.original_amount-coalesce(sum(amount),0) into available from public.payroll_deduction_allocations
      where deduction_obligation_id=obligation.id and voided_at is null and id is distinct from existing.id;
    if (item->>'amount')::numeric>available then raise exception 'Allocation exceeds the available obligation balance.'; end if;
    if existing.id is null then
      insert into public.payroll_deduction_allocations(deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source,created_by,updated_by)
      values(obligation.id,payroll.id,payroll.rider_id,payroll.hub_id,payroll.cutoff_start,payroll.cutoff_end,(item->>'amount')::numeric,'manual',actor,actor) returning * into existing;
      perform private.write_payroll_adjustment_audit('allocation',existing.id,payroll.rider_id,payroll.hub_id,payroll.id,'create',null,item,p_reason,actor,'manual');
    else
      update public.payroll_deduction_allocations set amount=(item->>'amount')::numeric,updated_by=actor,updated_at=now() where id=existing.id;
    end if;
  end loop;
  perform private.sync_traceable_payroll_aggregates(payroll.id,request_id);
  select coalesce(gross_pay,0)+coalesce(other_earnings,0)+coalesce(fm_pickup_amount,0)-coalesce(deductions,0)-coalesce(late_onhold,0)-coalesce(late_remittance,0)
  into projected from public.payroll_records where id=payroll.id;
  if projected<0 then raise exception 'Applied deductions cannot make projected net pay negative.'; end if;
end;
$$;

create or replace function public.delete_draft_payroll_record(p_payroll_record_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=private.assert_payroll_adjustment_manager(); payroll public.payroll_records%rowtype; row_item record;
begin
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Deletion reason is required.'; end if;
  select * into payroll from public.payroll_records where id=p_payroll_record_id for update;
  if not found then raise exception 'Payroll record was not found.'; end if;
  if payroll.status<>'draft' then raise exception 'Only Draft payroll can be deleted.'; end if;
  if not private.user_can_access_hub_for(actor,payroll.hub_id) then raise exception 'Payroll is outside the authorized Hub scope.'; end if;
  for row_item in select * from public.payroll_earning_adjustments where payroll_record_id=payroll.id and voided_at is null for update loop
    update public.payroll_earning_adjustments set voided_at=now(),voided_by=actor,void_reason=btrim(p_reason),payroll_record_id=null,updated_by=actor,updated_at=now() where id=row_item.id;
    perform private.write_payroll_adjustment_audit('earning',row_item.id,row_item.rider_id,row_item.hub_id,payroll.id,'detach_on_payroll_delete',to_jsonb(row_item),jsonb_build_object('voided',true),p_reason,actor,'manual');
  end loop;
  for row_item in select * from public.payroll_deduction_allocations where payroll_record_id=payroll.id and voided_at is null for update loop
    update public.payroll_deduction_allocations set voided_at=now(),voided_by=actor,void_reason=btrim(p_reason),payroll_record_id=null,updated_by=actor,updated_at=now() where id=row_item.id;
    perform private.write_payroll_adjustment_audit('allocation',row_item.id,row_item.rider_id,row_item.hub_id,payroll.id,'detach_on_payroll_delete',to_jsonb(row_item),jsonb_build_object('voided',true),p_reason,actor,'manual');
  end loop;
  delete from public.payroll_records where id=payroll.id;
end;
$$;

-- Version-3 snapshot keeps the existing five aggregate items and adds source detail.
create or replace function private.build_traceable_payroll_adjustment_snapshot(p_payroll_record_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object('version',3,'items',jsonb_agg(jsonb_build_object(
    'code',d.code,'label',d.display_name,'category',d.category,'input_mode',d.input_mode,'active',d.active,
    'amount',case d.code when 'other_earnings' then coalesce(p.other_earnings,0) when 'fm_pickup' then coalesce(p.fm_pickup_amount,0)
      when 'general_deductions' then coalesce(p.deductions,0) when 'late_onhold' then coalesce(p.late_onhold,0) when 'late_remittance' then coalesce(p.late_remittance,0) end,
    'sources',case when d.category='earning' then coalesce((select jsonb_agg(jsonb_build_object('earning_id',e.id,'amount',e.amount,'adjustment_date',e.adjustment_date,'reason',e.reason,'reference',e.reference) order by e.created_at)
      from public.payroll_earning_adjustments e where e.payroll_record_id=p.id and e.adjustment_code=d.code and e.voided_at is null),'[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('allocation_id',a.id,'obligation_id',o.id,'original_amount',o.original_amount,'applied_amount',a.amount,'adjustment_date',o.adjustment_date,'reason',o.reason,'reference',o.reference) order by a.created_at)
      from public.payroll_deduction_allocations a join public.payroll_deduction_obligations o on o.id=a.deduction_obligation_id where a.payroll_record_id=p.id and o.adjustment_code=d.code and a.voided_at is null),'[]'::jsonb) end
  ) order by case d.code when 'other_earnings' then 1 when 'fm_pickup' then 2 when 'general_deductions' then 3 when 'late_onhold' then 4 else 5 end))
  from public.payroll_records p cross join public.payroll_adjustment_definitions d where p.id=p_payroll_record_id group by p.id;
$$;
revoke all on function private.build_traceable_payroll_adjustment_snapshot(uuid) from public, anon, authenticated;

create or replace function public.build_payroll_adjustment_snapshot()
returns trigger language plpgsql security definer set search_path=''
as $$
declare earning_total numeric; deduction_total numeric;
begin
  if old.status in ('draft','rejected') and new.status='pending' then
    earning_total:=coalesce(new.gross_pay,0)+coalesce(new.other_earnings,0)+coalesce(new.fm_pickup_amount,0);
    deduction_total:=coalesce(new.deductions,0)+coalesce(new.late_onhold,0)+coalesce(new.late_remittance,0);
    if earning_total-deduction_total<0 then raise exception 'Applied deductions cannot make projected net pay negative.'; end if;
    if new.adjustment_source_version=2 then
      new.adjustment_snapshot:=private.build_traceable_payroll_adjustment_snapshot(new.id);
      new.adjustment_snapshot_version:=3;
    else
      new.adjustment_snapshot:=private.build_payroll_adjustment_snapshot(new.other_earnings,new.fm_pickup_amount,new.deductions,new.late_onhold,new.late_remittance,2,null);
      new.adjustment_snapshot_version:=2;
    end if;
    new.total_earnings_snapshot:=earning_total; new.total_deductions_snapshot:=deduction_total; new.net_pay_snapshot:=earning_total-deduction_total;
  elsif old.status='pending' and new.status in ('draft','rejected') then
    new.adjustment_snapshot:=null; new.adjustment_snapshot_version:=null;
    new.total_earnings_snapshot:=null; new.total_deductions_snapshot:=null; new.net_pay_snapshot:=null;
  end if;
  return new;
end;
$$;

-- Migration provenance: only editable Hub-resolved payroll is reconstructed.
do $$
declare p public.payroll_records%rowtype; obligation_id uuid; allocation_id uuid; code_name text; applied numeric;
begin
  for p in select * from public.payroll_records where status in ('draft','rejected') and hub_id is not null loop
    if coalesce(p.other_earnings,0)>0 then
      insert into public.payroll_earning_adjustments(rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,source)
      values(p.rider_id,p.hub_id,p.id,p.cutoff_start,p.cutoff_end,'other_earnings',p.other_earnings,p.cutoff_end,'Legacy editable payroll amount imported','legacy_migration');
    end if;
    if coalesce(p.fm_pickup_amount,0)>0 then
      insert into public.payroll_earning_adjustments(rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,source)
      values(p.rider_id,p.hub_id,p.id,p.cutoff_start,p.cutoff_end,'fm_pickup',p.fm_pickup_amount,p.cutoff_end,'Legacy editable payroll amount imported','legacy_migration');
    end if;
    foreach code_name in array array['general_deductions','late_onhold','late_remittance'] loop
      applied:=case code_name when 'general_deductions' then coalesce(p.deductions,0) when 'late_onhold' then coalesce(p.late_onhold,0) else coalesce(p.late_remittance,0) end;
      if applied>0 then
        obligation_id:=gen_random_uuid(); allocation_id:=gen_random_uuid();
        insert into public.payroll_deduction_obligations(id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,source)
        values(obligation_id,p.rider_id,p.hub_id,code_name,applied,p.cutoff_end,'Legacy editable payroll amount imported','legacy_migration');
        insert into public.payroll_deduction_allocations(id,deduction_obligation_id,payroll_record_id,rider_id,hub_id,cutoff_start,cutoff_end,amount,source)
        values(allocation_id,obligation_id,p.id,p.rider_id,p.hub_id,p.cutoff_start,p.cutoff_end,applied,'legacy_migration');
        perform private.write_payroll_adjustment_audit('obligation',obligation_id,p.rider_id,p.hub_id,p.id,'legacy_import',null,jsonb_build_object('original_amount',applied,'adjustment_code',code_name),'Legacy editable payroll amount imported',null,'legacy_migration');
        perform private.write_payroll_adjustment_audit('allocation',allocation_id,p.rider_id,p.hub_id,p.id,'legacy_import',null,jsonb_build_object('amount',applied),'Legacy editable payroll amount imported',null,'legacy_migration');
      end if;
    end loop;
    perform private.sync_traceable_payroll_aggregates(p.id,gen_random_uuid());
  end loop;
end;
$$;

-- Public function privileges are opt-in; table mutations remain unavailable.
revoke all on function public.create_payroll_deduction_obligation(uuid,text,numeric,date,text,text) from public, anon, authenticated;
revoke all on function public.update_payroll_deduction_obligation(uuid,numeric,date,text,text) from public, anon, authenticated;
revoke all on function public.void_payroll_deduction_obligation(uuid,text) from public, anon, authenticated;
revoke all on function public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.delete_draft_payroll_record(uuid,text) from public, anon, authenticated;
grant execute on function public.create_payroll_deduction_obligation(uuid,text,numeric,date,text,text) to authenticated;
grant execute on function public.update_payroll_deduction_obligation(uuid,numeric,date,text,text) to authenticated;
grant execute on function public.void_payroll_deduction_obligation(uuid,text) to authenticated;
grant execute on function public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text) to authenticated;
grant execute on function public.delete_draft_payroll_record(uuid,text) to authenticated;
