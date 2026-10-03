-- Dedicated "Absent w/o prior notice" (absent_without_notice) payroll deduction category.
-- Preserves Policy V2 inactivity: no automatic deductions, mandatory human confirmation,
-- mandatory Send to Payroll, and mandatory cutoff allocation.

-- 1. Extend payroll_adjustment_definitions constraints and insert definition.
alter table public.payroll_adjustment_definitions
  drop constraint if exists payroll_adjustment_definitions_fixed_code_check,
  drop constraint if exists payroll_adjustment_definitions_fixed_category_check;

alter table public.payroll_adjustment_definitions
  add constraint payroll_adjustment_definitions_fixed_code_check check (
    code in (
      'other_earnings',
      'fm_pickup',
      'general_deductions',
      'late_onhold',
      'late_remittance',
      'absent_without_notice'
    )
  ),
  add constraint payroll_adjustment_definitions_fixed_category_check check (
    (code in ('other_earnings', 'fm_pickup') and category = 'earning')
    or (code in ('general_deductions', 'late_onhold', 'late_remittance', 'absent_without_notice') and category = 'deduction')
  );

insert into public.payroll_adjustment_definitions (
  code, display_name, category, input_mode, active, change_reason
) values (
  'absent_without_notice',
  'Absent w/o prior notice',
  'deduction',
  'manual_amount',
  true,
  'Dedicated payroll deduction category for confirmed absence without prior notice consequences'
) on conflict (code) do nothing;

-- 2. Add absent_without_notice aggregate column to payroll_records.
alter table public.payroll_records
  add column if not exists absent_without_notice numeric(12,2) not null default 0
  check (absent_without_notice >= 0);

-- 3. Extend payroll_deduction_obligations check constraint.
alter table public.payroll_deduction_obligations
  drop constraint if exists payroll_deduction_obligations_code_check;

alter table public.payroll_deduction_obligations
  add constraint payroll_deduction_obligations_code_check check (
    adjustment_code in (
      'general_deductions',
      'late_onhold',
      'late_remittance',
      'absent_without_notice'
    )
  );

-- 4. Guard manual obligation creation against absent_without_notice.
-- Absent penalties originate strictly through Leave & Absence -> V2 decision bridge.
create or replace function public.create_payroll_deduction_obligation(
  p_rider_id uuid, p_adjustment_code text, p_original_amount numeric,
  p_adjustment_date date, p_reason text, p_reference text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid:=private.assert_payroll_adjustment_manager(); rider_hub uuid; definition_active boolean; result_id uuid:=gen_random_uuid();
begin
  if p_adjustment_code = 'absent_without_notice' then
    raise exception 'Absent w/o prior notice cannot be created manually. Use Leave & Absence management.';
  end if;
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
revoke all on function public.create_payroll_deduction_obligation(uuid,text,numeric,date,text,text) from public, anon, authenticated;
grant execute on function public.create_payroll_deduction_obligation(uuid,text,numeric,date,text,text) to authenticated;

create or replace function public.create_payroll_adjustments_batch(
  p_rider_id uuid,
  p_items jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=private.assert_payroll_adjustment_manager();
  rider_hub uuid;
  item jsonb;
  item_code text;
  item_category text;
  item_amount numeric;
  item_date date;
  item_reason text;
  item_reference text;
  item_payroll_id uuid;
  payroll public.payroll_records%rowtype;
  result_id uuid;
  result_items jsonb:='[]'::jsonb;
  affected_payrolls uuid[]:=array[]::uuid[];
  affected_payroll uuid;
begin
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Select at least one payroll adjustment.';
  end if;
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Batch reason is required.'; end if;

  select hub_id into rider_hub from public.riders where id=p_rider_id for share;
  if not found then raise exception 'Rider was not found.'; end if;
  if rider_hub is null then raise exception 'Rider must have an assigned Hub.'; end if;
  if not private.user_can_access_hub_for(actor,rider_hub) then raise exception 'Rider is outside the authorized Hub scope.'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    item_code:=item->>'adjustment_code';
    item_amount:=coalesce((item->>'amount')::numeric,0);
    item_date:=(item->>'adjustment_date')::date;
    item_reason:=btrim(coalesce(item->>'reason',''));
    item_reference:=nullif(btrim(item->>'reference'),'');
    item_payroll_id:=nullif(item->>'payroll_record_id','')::uuid;

    if item_code = 'absent_without_notice' then
      raise exception 'Absent w/o prior notice cannot be created manually. Use Leave & Absence management.';
    end if;

    select category into item_category from public.payroll_adjustment_definitions where code=item_code and active;
    if not found then raise exception 'Adjustment definition % is unavailable.',item_code; end if;
    if item_amount<=0 then raise exception 'Every selected adjustment amount must be greater than zero.'; end if;
    if item_date is null then raise exception 'Every selected adjustment requires a date.'; end if;
    if length(item_reason)=0 then raise exception 'Every selected adjustment requires a reason.'; end if;
    if item_category='earning' then
      if item_payroll_id is null then raise exception 'Earning adjustments require an editable payroll cutoff.'; end if;
      select * into payroll from public.payroll_records where id=item_payroll_id for share;
      if not found or payroll.rider_id<>p_rider_id or payroll.hub_id<>rider_hub then raise exception 'Earning payroll does not belong to this Rider and Hub.'; end if;
      if payroll.status not in ('draft','rejected') then raise exception 'Earnings are editable only while payroll is Draft or Rejected.'; end if;
      if item_date not between payroll.cutoff_start and payroll.cutoff_end then raise exception 'Earning date must fall within its payroll cutoff.'; end if;
    elsif item_category<>'deduction' then
      raise exception 'Unsupported payroll adjustment category.';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(p_items) loop
    item_code:=item->>'adjustment_code';
    item_amount:=(item->>'amount')::numeric;
    item_date:=(item->>'adjustment_date')::date;
    item_reason:=btrim(item->>'reason');
    item_reference:=nullif(btrim(item->>'reference'),'');
    item_payroll_id:=nullif(item->>'payroll_record_id','')::uuid;
    select category into item_category from public.payroll_adjustment_definitions where code=item_code;
    result_id:=gen_random_uuid();
    if item_category='deduction' then
      insert into public.payroll_deduction_obligations(
        id,rider_id,hub_id,adjustment_code,original_amount,adjustment_date,reason,reference,source,created_by,updated_by
      ) values (result_id,p_rider_id,rider_hub,item_code,item_amount,item_date,item_reason,item_reference,'manual',actor,actor);
      perform private.write_payroll_adjustment_audit('obligation',result_id,p_rider_id,rider_hub,null,'batch_create',null,item,p_reason,actor,'manual');
    else
      select * into payroll from public.payroll_records where id=item_payroll_id for update;
      insert into public.payroll_earning_adjustments(
        id,rider_id,hub_id,payroll_record_id,cutoff_start,cutoff_end,adjustment_code,amount,adjustment_date,reason,reference,source,created_by,updated_by
      ) values (result_id,p_rider_id,rider_hub,payroll.id,payroll.cutoff_start,payroll.cutoff_end,item_code,item_amount,item_date,item_reason,item_reference,'manual',actor,actor);
      perform private.write_payroll_adjustment_audit('earning',result_id,p_rider_id,rider_hub,payroll.id,'batch_create',null,item,p_reason,actor,'manual');
      if not payroll.id=any(affected_payrolls) then affected_payrolls:=array_append(affected_payrolls,payroll.id); end if;
    end if;
    result_items:=result_items||jsonb_build_array(jsonb_build_object('id',result_id,'adjustment_code',item_code,'category',item_category));
  end loop;
  foreach affected_payroll in array affected_payrolls loop
    perform private.sync_traceable_payroll_aggregates(affected_payroll,gen_random_uuid());
  end loop;
  return result_items;
end;
$$;
revoke all on function public.create_payroll_adjustments_batch(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_payroll_adjustments_batch(uuid,jsonb,text) to authenticated;

-- 5. Update absence -> payroll bridge function to use absent_without_notice.
create or replace function public.materialize_absence_financial_deduction_obligation(
  p_consequence_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  consequence public.rider_absence_financial_consequences%rowtype;
  obligation public.payroll_deduction_obligations%rowtype;
  linked_consequence public.rider_absence_financial_consequences%rowtype;
  canonical_reference text;
  obligation_reason text;
begin
  if p_consequence_id is null then
    raise exception 'Consequence ID is required.' using errcode = '23502';
  end if;

  actor_id := private.assert_authorized_absence_decision_maker();

  if not private.user_is_admin_for(actor_id) then
    raise exception 'FORBIDDEN: Only an active Admin can send an absence consequence to Payroll.'
      using errcode = '42501';
  end if;

  select c.* into consequence
  from public.rider_absence_financial_consequences c
  where c.id = p_consequence_id
  for update;

  if not found then
    raise exception 'ABSENCE_CONSEQUENCE_NOT_FOUND: The requested consequence does not exist.'
      using errcode = 'P0002';
  end if;

  if not private.user_can_access_hub_for(actor_id, consequence.hub_id) then
    raise exception 'FORBIDDEN: Consequence is outside the actor authorized Hub scope.'
      using errcode = '42501';
  end if;

  if consequence.status <> 'confirmed'
     or consequence.applied_amount is null
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
       or obligation.adjustment_code not in ('absent_without_notice', 'general_deductions')
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

    if consequence.deduction_obligation_id = obligation.id then
      return obligation.id;
    end if;

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
    where definition.code = 'absent_without_notice'
      and definition.category = 'deduction'
      and definition.active
    for share;
    if not found then
      raise exception 'Absent w/o prior notice is unavailable.' using errcode = '55000';
    end if;

    insert into public.payroll_deduction_obligations (
      rider_id, hub_id, adjustment_code, original_amount, adjustment_date,
      reason, reference, source, created_by, updated_by
    ) values (
      consequence.rider_id, consequence.hub_id, 'absent_without_notice',
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

  insert into public.rider_absence_financial_consequence_audit_events (
    consequence_id, action, actor_id, created_at, old_values, new_values
  ) values (
    consequence.id, 'payroll_obligation_linked', actor_id, pg_catalog.clock_timestamp(),
    pg_catalog.to_jsonb(consequence), pg_catalog.to_jsonb(linked_consequence)
  );

  return obligation.id;
end;
$$;
revoke all on function public.materialize_absence_financial_deduction_obligation(uuid) from public, anon;
grant execute on function public.materialize_absence_financial_deduction_obligation(uuid) to authenticated, service_role;

-- 6. Historical Data Migration: Safely migrate pending unallocated ABS-PEN obligations.
-- Any ABS-PEN obligation with NO allocations and NO financial commitments moves to absent_without_notice.
-- Already allocated/committed historical payroll records remain untouched.
update public.payroll_deduction_obligations
set adjustment_code = 'absent_without_notice'
where reference like 'ABS-PEN:%'
  and adjustment_code = 'general_deductions'
  and financially_committed_at is null
  and financially_committed_payroll_id is null
  and not exists (
    select 1 from public.payroll_deduction_allocations a
    where a.deduction_obligation_id = payroll_deduction_obligations.id
  );

-- 7. Update sync_traceable_payroll_aggregates to calculate absent_without_notice.
create or replace function private.sync_traceable_payroll_aggregates(p_payroll_record_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  earning_other numeric;
  earning_fm numeric;
  deduction_general numeric;
  deduction_onhold numeric;
  deduction_remittance numeric;
  deduction_absent_without_notice numeric;
begin
  select
    coalesce(sum(amount) filter(where adjustment_code='other_earnings'),0),
    coalesce(sum(amount) filter(where adjustment_code='fm_pickup'),0)
  into earning_other,earning_fm from public.payroll_earning_adjustments
  where payroll_record_id=p_payroll_record_id and voided_at is null;

  select
    coalesce(sum(a.amount) filter(where o.adjustment_code='general_deductions'),0),
    coalesce(sum(a.amount) filter(where o.adjustment_code='late_onhold'),0),
    coalesce(sum(a.amount) filter(where o.adjustment_code='late_remittance'),0),
    coalesce(sum(a.amount) filter(where o.adjustment_code='absent_without_notice'),0)
  into deduction_general,deduction_onhold,deduction_remittance,deduction_absent_without_notice
  from public.payroll_deduction_allocations a join public.payroll_deduction_obligations o on o.id=a.deduction_obligation_id
  where a.payroll_record_id=p_payroll_record_id and a.voided_at is null;

  perform set_config('app.payroll_adjustment_sync_request_id',p_request_id::text,true);
  update public.payroll_records set
    other_earnings=earning_other, fm_pickup_amount=earning_fm,
    deductions=deduction_general, late_onhold=deduction_onhold,
    late_remittance=deduction_remittance, absent_without_notice=deduction_absent_without_notice,
    adjustment_source_version=2
  where id=p_payroll_record_id;
  perform set_config('app.payroll_adjustment_sync_request_id','',true);
end;
$$;
revoke all on function private.sync_traceable_payroll_aggregates(uuid,uuid) from public, anon, authenticated;

-- 8. Update guard_traceable_payroll_aggregate_writes to guard absent_without_notice.
create or replace function public.guard_traceable_payroll_aggregate_writes()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if new.adjustment_source_version=2 and (
      coalesce(new.other_earnings,0)<>0 or coalesce(new.fm_pickup_amount,0)<>0 or
      coalesce(new.fm_pickup_count,0)<>0 or coalesce(new.deductions,0)<>0 or
      coalesce(new.late_onhold,0)<>0 or coalesce(new.late_remittance,0)<>0 or
      coalesce(new.absent_without_notice,0)<>0
    ) then
      raise exception 'New traceable payroll must receive adjustments through the guarded synchronization path.';
    end if;
    return new;
  end if;

  if old.adjustment_source_version=2 and new.adjustment_source_version<>2 then
    raise exception 'Traceable payroll cannot revert to legacy adjustment sources.';
  end if;
  if (new.adjustment_source_version=2 or old.adjustment_source_version=2) and (
    new.other_earnings is distinct from old.other_earnings or
    new.fm_pickup_amount is distinct from old.fm_pickup_amount or
    new.deductions is distinct from old.deductions or
    new.late_onhold is distinct from old.late_onhold or
    new.late_remittance is distinct from old.late_remittance or
    new.absent_without_notice is distinct from old.absent_without_notice or
    new.adjustment_source_version is distinct from old.adjustment_source_version
  ) and nullif(current_setting('app.payroll_adjustment_sync_request_id',true),'') is null then
    raise exception 'Traceable payroll adjustment totals can only be changed by the guarded synchronization path.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_c_guard_traceable_payroll_aggregate_writes on public.payroll_records;
create trigger trg_c_guard_traceable_payroll_aggregate_writes
before insert or update on public.payroll_records
for each row execute function public.guard_traceable_payroll_aggregate_writes();
revoke all on function public.guard_traceable_payroll_aggregate_writes() from public, anon, authenticated;

-- 9. Update guard_inactive_payroll_adjustment_values to check absent_without_notice.
create or replace function public.guard_inactive_payroll_adjustment_values()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed boolean;
  definition_active boolean;
begin
  if new.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status) then
    return new;
  end if;

  select active into definition_active
  from public.payroll_adjustment_definitions where code = 'other_earnings';
  changed := case when tg_op = 'INSERT' then coalesce(new.other_earnings, 0) <> 0
                  else new.other_earnings is distinct from old.other_earnings end;
  if not definition_active and changed then raise exception 'Other Earnings is inactive and cannot accept a new value.'; end if;

  select active into definition_active
  from public.payroll_adjustment_definitions where code = 'fm_pickup';
  changed := case when tg_op = 'INSERT' then coalesce(new.fm_pickup_amount, 0) <> 0
                  else new.fm_pickup_amount is distinct from old.fm_pickup_amount end;
  if not definition_active and changed then raise exception 'FM Pick Up is inactive and cannot accept a new value.'; end if;

  select active into definition_active
  from public.payroll_adjustment_definitions where code = 'general_deductions';
  changed := case when tg_op = 'INSERT' then coalesce(new.deductions, 0) <> 0
                  else new.deductions is distinct from old.deductions end;
  if not definition_active and changed then raise exception 'General Deductions is inactive and cannot accept a new value.'; end if;

  select active into definition_active
  from public.payroll_adjustment_definitions where code = 'late_onhold';
  changed := case when tg_op = 'INSERT' then coalesce(new.late_onhold, 0) <> 0
                  else new.late_onhold is distinct from old.late_onhold end;
  if not definition_active and changed then raise exception 'Late Onhold / FM is inactive and cannot accept a new value.'; end if;

  select active into definition_active
  from public.payroll_adjustment_definitions where code = 'late_remittance';
  changed := case when tg_op = 'INSERT' then coalesce(new.late_remittance, 0) <> 0
                  else new.late_remittance is distinct from old.late_remittance end;
  if not definition_active and changed then raise exception 'Late Remittance is inactive and cannot accept a new value.'; end if;

  select active into definition_active
  from public.payroll_adjustment_definitions where code = 'absent_without_notice';
  changed := case when tg_op = 'INSERT' then coalesce(new.absent_without_notice, 0) <> 0
                  else new.absent_without_notice is distinct from old.absent_without_notice end;
  if not definition_active and changed then raise exception 'Absent w/o prior notice is inactive and cannot accept a new value.'; end if;

  return new;
end;
$$;
drop trigger if exists trg_guard_inactive_payroll_adjustment_values on public.payroll_records;
create trigger trg_guard_inactive_payroll_adjustment_values
before insert or update of other_earnings, fm_pickup_amount, deductions, late_onhold, late_remittance, absent_without_notice
on public.payroll_records
for each row execute function public.guard_inactive_payroll_adjustment_values();
revoke all on function public.guard_inactive_payroll_adjustment_values() from public;

-- 10. Update private snapshot builder to accept optional absent_without_notice.
create or replace function private.build_payroll_adjustment_snapshot(
  p_other_earnings numeric,
  p_fm_pickup_amount numeric,
  p_deductions numeric,
  p_late_onhold numeric,
  p_late_remittance numeric,
  p_version integer,
  p_legacy_fm_pickup_count integer default null,
  p_absent_without_notice numeric default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'version', p_version,
    'items', jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'code', definition.code,
        'label', definition.display_name,
        'category', definition.category,
        'input_mode', definition.input_mode,
        'active', definition.active,
        'amount', case definition.code
          when 'other_earnings' then coalesce(p_other_earnings, 0)
          when 'fm_pickup' then coalesce(p_fm_pickup_amount, 0)
          when 'general_deductions' then coalesce(p_deductions, 0)
          when 'late_onhold' then coalesce(p_late_onhold, 0)
          when 'late_remittance' then coalesce(p_late_remittance, 0)
          when 'absent_without_notice' then coalesce(p_absent_without_notice, 0)
        end,
        'legacy_quantity', case
          when definition.code = 'fm_pickup' then p_legacy_fm_pickup_count
          else null
        end
      )) order by case definition.code
        when 'other_earnings' then 1
        when 'fm_pickup' then 2
        when 'general_deductions' then 3
        when 'late_onhold' then 4
        when 'late_remittance' then 5
        when 'absent_without_notice' then 6
      end
    )
  )
  from public.payroll_adjustment_definitions definition;
$$;
revoke all on function private.build_payroll_adjustment_snapshot(numeric, numeric, numeric, numeric, numeric, integer, integer, numeric)
from public, anon, authenticated;

-- 11. Update traceable snapshot builder to include absent_without_notice.
create or replace function private.build_traceable_payroll_adjustment_snapshot(p_payroll_record_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object('version',3,'items',jsonb_agg(jsonb_build_object(
    'code',d.code,'label',d.display_name,'category',d.category,'input_mode',d.input_mode,'active',d.active,
    'amount',case d.code
      when 'other_earnings' then coalesce(p.other_earnings,0)
      when 'fm_pickup' then coalesce(p.fm_pickup_amount,0)
      when 'general_deductions' then coalesce(p.deductions,0)
      when 'late_onhold' then coalesce(p.late_onhold,0)
      when 'late_remittance' then coalesce(p.late_remittance,0)
      when 'absent_without_notice' then coalesce(p.absent_without_notice,0)
    end,
    'sources',case when d.category='earning' then coalesce((select jsonb_agg(jsonb_build_object('earning_id',e.id,'amount',e.amount,'adjustment_date',e.adjustment_date,'reason',e.reason,'reference',e.reference) order by e.created_at)
      from public.payroll_earning_adjustments e where e.payroll_record_id=p.id and e.adjustment_code=d.code and e.voided_at is null),'[]'::jsonb)
      else coalesce((select jsonb_agg(jsonb_build_object('allocation_id',a.id,'obligation_id',o.id,'original_amount',o.original_amount,'applied_amount',a.amount,'adjustment_date',o.adjustment_date,'reason',o.reason,'reference',o.reference) order by a.created_at)
      from public.payroll_deduction_allocations a join public.payroll_deduction_obligations o on o.id=a.deduction_obligation_id where a.payroll_record_id=p.id and o.adjustment_code=d.code and a.voided_at is null),'[]'::jsonb) end
  ) order by case d.code
    when 'other_earnings' then 1
    when 'fm_pickup' then 2
    when 'general_deductions' then 3
    when 'late_onhold' then 4
    when 'late_remittance' then 5
    when 'absent_without_notice' then 6
    else 7
  end))
  from public.payroll_records p cross join public.payroll_adjustment_definitions d where p.id=p_payroll_record_id group by p.id;
$$;
revoke all on function private.build_traceable_payroll_adjustment_snapshot(uuid) from public, anon, authenticated;

-- 12. Update build_payroll_adjustment_snapshot trigger function.
create or replace function public.build_payroll_adjustment_snapshot()
returns trigger language plpgsql security definer set search_path=''
as $$
declare earning_total numeric; deduction_total numeric;
begin
  if old.status in ('draft','rejected') and new.status='pending' then
    earning_total:=coalesce(new.gross_pay,0)+coalesce(new.other_earnings,0)+coalesce(new.fm_pickup_amount,0);
    deduction_total:=coalesce(new.deductions,0)+coalesce(new.late_onhold,0)+coalesce(new.late_remittance,0)+coalesce(new.absent_without_notice,0);
    if earning_total-deduction_total<0 then raise exception 'Applied deductions cannot make projected net pay negative.'; end if;
    if new.adjustment_source_version=2 then
      new.adjustment_snapshot:=private.build_traceable_payroll_adjustment_snapshot(new.id);
      new.adjustment_snapshot_version:=3;
    else
      new.adjustment_snapshot:=private.build_payroll_adjustment_snapshot(new.other_earnings,new.fm_pickup_amount,new.deductions,new.late_onhold,new.late_remittance,2,null,new.absent_without_notice);
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
revoke all on function public.build_payroll_adjustment_snapshot() from public;

-- 13. Update validate_payroll_adjustment_snapshot_transition to support 5 or 6 items.
create or replace function public.validate_payroll_adjustment_snapshot_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_count integer;
  earning_adjustments numeric;
  deduction_adjustments numeric;
begin
  if new.status not in ('approved'::public.payroll_status, 'paid'::public.payroll_status) then
    return new;
  end if;

  if new.adjustment_snapshot is null
    or new.adjustment_snapshot_version is null
    or new.total_earnings_snapshot is null
    or new.total_deductions_snapshot is null
    or new.net_pay_snapshot is null
  then
    raise exception 'Submitted payroll is missing its immutable adjustment snapshot.';
  end if;

  select
    count(*)::integer,
    coalesce(sum((item->>'amount')::numeric) filter (where item->>'category' = 'earning'), 0),
    coalesce(sum((item->>'amount')::numeric) filter (where item->>'category' = 'deduction'), 0)
  into item_count, earning_adjustments, deduction_adjustments
  from jsonb_array_elements(new.adjustment_snapshot->'items') item;

  if item_count not in (5, 6)
    or new.total_earnings_snapshot <> coalesce(new.gross_pay, 0) + earning_adjustments
    or new.total_deductions_snapshot <> deduction_adjustments
    or new.net_pay_snapshot <> new.total_earnings_snapshot - new.total_deductions_snapshot
  then
    raise exception 'Submitted payroll adjustment snapshot totals do not reconcile.';
  end if;

  return new;
end;
$$;
revoke all on function public.validate_payroll_adjustment_snapshot_transition() from public;

-- 14. Update guard_payroll_adjustment_snapshot_immutability to include absent_without_notice.
create or replace function public.guard_payroll_adjustment_snapshot_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status) then
      raise exception 'Submitted payroll adjustment snapshots are immutable.';
    end if;
    return old;
  end if;

  if old.status in ('approved'::public.payroll_status, 'paid'::public.payroll_status)
    and new.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
  then
    raise exception 'Approved and Paid payroll adjustment snapshots cannot be cleared or rebuilt.';
  end if;

  if old.status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
    and new.status not in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    and (
      new.other_earnings is distinct from old.other_earnings
      or new.fm_pickup_count is distinct from old.fm_pickup_count
      or new.fm_pickup_amount is distinct from old.fm_pickup_amount
      or new.deductions is distinct from old.deductions
      or new.late_onhold is distinct from old.late_onhold
      or new.late_remittance is distinct from old.late_remittance
      or new.absent_without_notice is distinct from old.absent_without_notice
      or new.adjustment_snapshot is distinct from old.adjustment_snapshot
      or new.adjustment_snapshot_version is distinct from old.adjustment_snapshot_version
      or new.total_earnings_snapshot is distinct from old.total_earnings_snapshot
      or new.total_deductions_snapshot is distinct from old.total_deductions_snapshot
      or new.net_pay_snapshot is distinct from old.net_pay_snapshot
    )
  then
    raise exception 'Submitted payroll adjustment amounts and snapshots are immutable.';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_b_guard_payroll_adjustment_snapshot_immutability on public.payroll_records;
create trigger trg_b_guard_payroll_adjustment_snapshot_immutability
before update or delete on public.payroll_records
for each row execute function public.guard_payroll_adjustment_snapshot_immutability();
revoke all on function public.guard_payroll_adjustment_snapshot_immutability() from public;

-- 15. Update save_payroll_adjustment_plan to subtract absent_without_notice in net pay projection.
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
  select coalesce(gross_pay,0)+coalesce(other_earnings,0)+coalesce(fm_pickup_amount,0)-coalesce(deductions,0)-coalesce(late_onhold,0)-coalesce(late_remittance,0)-coalesce(absent_without_notice,0)
  into projected from public.payroll_records where id=payroll.id;
  if projected<0 then raise exception 'Applied deductions cannot make projected net pay negative.'; end if;
end;
$$;
revoke all on function public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_payroll_adjustment_plan(uuid,jsonb,jsonb,text) to authenticated;

-- 16. Update get_payroll_adjustment_rider_summaries and get_payroll_adjustment_rider_ledger to allow absent_without_notice.
create or replace function public.get_payroll_adjustment_rider_summaries(
  p_hub_id uuid default null,
  p_search text default null,
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
  adjustment_code text,
  available_to_allocate numeric,
  status text,
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
    'general_deductions', 'late_onhold', 'late_remittance', 'absent_without_notice'
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
        coalesce(obligation.updated_at, obligation.created_at),
        coalesce((
          select max(allocation.created_at)
          from public.payroll_deduction_allocations allocation
          where allocation.deduction_obligation_id = balance.obligation_id
        ), obligation.created_at)
      ) as activity_at
    from public.v_payroll_deduction_balances balance
    join public.payroll_deduction_obligations obligation on obligation.id = balance.obligation_id
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
      and (
        (p_status = 'actionable' and balance.status in ('open', 'partially_recovered'))
        or (p_status = 'history' and balance.status in ('settled', 'voided'))
        or (p_status = 'all')
        or (balance.status = p_status)
      )
  ),
  aggregated as (
    select
      filtered.rider_id,
      max(filtered.rider_name) as rider_name,
      max(filtered.rider_code) as rider_code,
      filtered.hub_id,
      max(filtered.hub_name) as hub_name,
      min(filtered.adjustment_code) as sample_adjustment_code,
      sum(filtered.available_to_allocate) as total_remaining,
      min(filtered.status) as sample_status,
      count(*)::bigint as event_count,
      count(distinct filtered.adjustment_code)::bigint as adjustment_type_count,
      max(filtered.activity_at) as latest_activity
    from filtered
    group by filtered.rider_id, filtered.hub_id
  ),
  total_records as (
    select count(*)::bigint as total_rows from aggregated
  )
  select
    aggregated.rider_id,
    aggregated.rider_name,
    aggregated.rider_code,
    aggregated.hub_id,
    aggregated.hub_name,
    aggregated.sample_adjustment_code as adjustment_code,
    aggregated.total_remaining as available_to_allocate,
    aggregated.sample_status as status,
    aggregated.event_count,
    aggregated.adjustment_type_count,
    aggregated.total_remaining,
    aggregated.latest_activity,
    total_records.total_rows as total_count
  from aggregated
  cross join total_records
  order by aggregated.latest_activity desc, aggregated.rider_name asc
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;
revoke all on function public.get_payroll_adjustment_rider_summaries(uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_payroll_adjustment_rider_summaries(uuid, text, text, text, integer, integer) to authenticated, service_role;

create or replace function public.get_payroll_adjustment_rider_ledger(
  p_rider_id uuid,
  p_adjustment_code text default null,
  p_status text default 'all',
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
    'general_deductions', 'late_onhold', 'late_remittance', 'absent_without_notice'
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
    and (
      (p_status = 'actionable' and balance.status in ('open', 'partially_recovered'))
      or (p_status = 'history' and balance.status in ('settled', 'voided'))
      or (p_status = 'all')
      or (balance.status = p_status)
    )
  order by balance.adjustment_date desc, balance.obligation_id desc
  limit safe_page_size
  offset (safe_page - 1) * safe_page_size;
end;
$$;
revoke all on function public.get_payroll_adjustment_rider_ledger(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.get_payroll_adjustment_rider_ledger(uuid, text, text, integer, integer) to authenticated, service_role;

-- 17. Update enforce_payroll_workflow_constraints to protect absent_without_notice from HR mutation.
create or replace function public.enforce_payroll_workflow_constraints()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_user_role public.user_role;
  transition_request_id text;
  earliest_payable date;
  current_date_manila date;
begin
  current_user_role := private.current_user_role();
  transition_request_id := nullif(current_setting('app.payroll_transition_request_id', true), '');

  if current_user_role is null and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Unauthorized payroll operation.';
  end if;

  if tg_op = 'INSERT' then
    if current_user_role = 'hr'::public.user_role then
      raise exception 'HR cannot create payroll records.';
    end if;

    if new.status <> 'draft'::public.payroll_status then
      raise exception 'New payroll records must be created in Draft status.';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      if new.status in ('approved'::public.payroll_status, 'rejected'::public.payroll_status)
        and old.status = 'pending'::public.payroll_status
        and current_user_role not in ('admin'::public.user_role, 'hr'::public.user_role) then
        raise exception 'Only HR or Admin can approve or reject payroll.';
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

      if new.status = 'paid'::public.payroll_status and new.cutoff_start >= '2026-08-31'::date then
        current_date_manila := (now() at time zone 'Asia/Manila')::date;
        earliest_payable := public.calculate_payroll_payable_date(new.cutoff_start, new.cutoff_end);
        if current_date_manila < earliest_payable then
          raise exception 'PAYROLL_PREMATURE_PAYOUT: Weekly payroll (% to %) cannot be marked as Paid before earliest payable date % (Asia/Manila).', new.cutoff_start, new.cutoff_end, earliest_payable;
        end if;
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
      or new.absent_without_notice is distinct from old.absent_without_notice
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

    if old.status is not distinct from new.status and (
      new.submitted_by is distinct from old.submitted_by
      or new.submitted_at is distinct from old.submitted_at
      or new.submitted_by_name_snapshot is distinct from old.submitted_by_name_snapshot
      or new.submitted_by_email_snapshot is distinct from old.submitted_by_email_snapshot
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.approved_by_name_snapshot is distinct from old.approved_by_name_snapshot
      or new.approved_by_email_snapshot is distinct from old.approved_by_email_snapshot
      or new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejected_by_name_snapshot is distinct from old.rejected_by_name_snapshot
      or new.rejected_by_email_snapshot is distinct from old.rejected_by_email_snapshot
      or new.rejection_reason is distinct from old.rejection_reason
      or new.returned_by is distinct from old.returned_by
      or new.returned_at is distinct from old.returned_at
      or new.returned_by_name_snapshot is distinct from old.returned_by_name_snapshot
      or new.returned_by_email_snapshot is distinct from old.returned_by_email_snapshot
      or new.paid_by is distinct from old.paid_by
      or new.paid_at is distinct from old.paid_at
      or new.paid_by_name_snapshot is distinct from old.paid_by_name_snapshot
      or new.paid_by_email_snapshot is distinct from old.paid_by_email_snapshot
    ) then
      raise exception 'Workflow audit fields can only be modified during authorized status transitions.';
    end if;

    return new;
  end if;

  return new;
end;
$$;
