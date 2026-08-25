-- Close the traceable-payroll INSERT path discovered by the focused pgTAP pass.
create or replace function public.guard_traceable_payroll_aggregate_writes()
returns trigger language plpgsql set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if new.adjustment_source_version=2 and (
      coalesce(new.other_earnings,0)<>0 or coalesce(new.fm_pickup_amount,0)<>0 or
      coalesce(new.fm_pickup_count,0)<>0 or coalesce(new.deductions,0)<>0 or
      coalesce(new.late_onhold,0)<>0 or coalesce(new.late_remittance,0)<>0
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
