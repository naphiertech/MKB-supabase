-- Atomic multi-entry creation and audited corrections for traceable payroll adjustments.

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

  -- Validate every item before inserting any row.
  for item in select value from jsonb_array_elements(p_items) loop
    item_code:=item->>'adjustment_code';
    item_amount:=coalesce((item->>'amount')::numeric,0);
    item_date:=(item->>'adjustment_date')::date;
    item_reason:=btrim(coalesce(item->>'reason',''));
    item_reference:=nullif(btrim(item->>'reference'),'');
    item_payroll_id:=nullif(item->>'payroll_record_id','')::uuid;
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

create or replace function public.update_payroll_earning_adjustment(
  p_adjustment_id uuid,
  p_amount numeric,
  p_adjustment_date date,
  p_reason text,
  p_reference text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=private.assert_payroll_adjustment_manager();
  oldrow public.payroll_earning_adjustments%rowtype;
  payroll public.payroll_records%rowtype;
begin
  select * into oldrow from public.payroll_earning_adjustments where id=p_adjustment_id for update;
  if not found or oldrow.voided_at is not null then raise exception 'Earning adjustment was not found or is voided.'; end if;
  if not private.user_can_access_hub_for(actor,oldrow.hub_id) then raise exception 'Earning is outside the authorized Hub scope.'; end if;
  if oldrow.payroll_record_id is null then raise exception 'Detached earning cannot be edited.'; end if;
  select * into payroll from public.payroll_records where id=oldrow.payroll_record_id for update;
  if payroll.status not in ('draft','rejected') then raise exception 'Submitted payroll earning records are immutable.'; end if;
  if p_amount<=0 then raise exception 'Earning amount must be greater than zero.'; end if;
  if p_adjustment_date not between payroll.cutoff_start and payroll.cutoff_end then raise exception 'Earning date must fall within its payroll cutoff.'; end if;
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception 'Reason is required.'; end if;
  update public.payroll_earning_adjustments set amount=p_amount,adjustment_date=p_adjustment_date,
    reason=btrim(p_reason),reference=nullif(btrim(p_reference),''),updated_by=actor,updated_at=now()
  where id=p_adjustment_id;
  perform private.write_payroll_adjustment_audit('earning',p_adjustment_id,oldrow.rider_id,oldrow.hub_id,oldrow.payroll_record_id,
    'update',to_jsonb(oldrow),jsonb_build_object('amount',p_amount,'adjustment_date',p_adjustment_date,'reason',btrim(p_reason),'reference',nullif(btrim(p_reference),'')),p_reason,actor,'manual');
  perform private.sync_traceable_payroll_aggregates(payroll.id,gen_random_uuid());
end;
$$;

-- Retain the current deduction correction rules and also preserve the incident-date allocation invariant.
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
  if exists(select 1 from public.payroll_deduction_allocations where deduction_obligation_id=p_obligation_id and voided_at is null and cutoff_end<p_adjustment_date) then
    raise exception 'Incident date cannot move after an existing allocation cutoff.';
  end if;
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

revoke all on function public.create_payroll_adjustments_batch(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.update_payroll_earning_adjustment(uuid,numeric,date,text,text) from public,anon,authenticated;
grant execute on function public.create_payroll_adjustments_batch(uuid,jsonb,text) to authenticated;
grant execute on function public.update_payroll_earning_adjustment(uuid,numeric,date,text,text) to authenticated;
