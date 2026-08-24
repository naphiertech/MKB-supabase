-- Fixed Earnings & Deductions registry and immutable submitted-payroll snapshots.
-- All five adjustment inputs remain Rider-specific manual peso amounts.

create table public.payroll_adjustment_definitions (
  code text primary key,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  category text not null check (category in ('earning', 'deduction')),
  input_mode text not null default 'manual_amount' check (input_mode = 'manual_amount'),
  active boolean not null default true,
  change_reason text not null check (length(btrim(change_reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete restrict,
  constraint payroll_adjustment_definitions_fixed_code_check check (
    code in ('other_earnings', 'fm_pickup', 'general_deductions', 'late_onhold', 'late_remittance')
  ),
  constraint payroll_adjustment_definitions_fixed_category_check check (
    (code in ('other_earnings', 'fm_pickup') and category = 'earning')
    or (code in ('general_deductions', 'late_onhold', 'late_remittance') and category = 'deduction')
  )
);

create table public.payroll_adjustment_definition_audit (
  id uuid primary key default gen_random_uuid(),
  definition_code text not null references public.payroll_adjustment_definitions(code) on delete restrict,
  previous_values jsonb not null,
  new_values jsonb not null,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index payroll_adjustment_definition_audit_code_changed_idx
  on public.payroll_adjustment_definition_audit (definition_code, changed_at desc);

insert into public.payroll_adjustment_definitions (
  code, display_name, category, input_mode, active, change_reason
) values
  ('other_earnings', 'Other Earnings', 'earning', 'manual_amount', true, 'Initial fixed payroll adjustment registry'),
  ('fm_pickup', 'FM Pick Up', 'earning', 'manual_amount', true, 'Initial fixed payroll adjustment registry'),
  ('general_deductions', 'General Deductions', 'deduction', 'manual_amount', true, 'Initial fixed payroll adjustment registry'),
  ('late_onhold', 'Late Onhold / FM', 'deduction', 'manual_amount', true, 'Initial fixed payroll adjustment registry'),
  ('late_remittance', 'Late Remittance', 'deduction', 'manual_amount', true, 'Initial fixed payroll adjustment registry');

create or replace function public.guard_payroll_adjustment_definition_registry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payroll adjustment definitions are a fixed registry and cannot be deleted.';
  end if;

  if new.code is distinct from old.code
    or new.category is distinct from old.category
    or new.input_mode is distinct from old.input_mode
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by
  then
    raise exception 'Payroll adjustment code, category, input mode, and creator identity are immutable.';
  end if;

  if length(btrim(new.display_name)) = 0
    or length(btrim(new.change_reason)) = 0
    or new.updated_by is null
  then
    raise exception 'Display name, change reason, and updater identity are required.';
  end if;

  return new;
end;
$$;

create trigger payroll_adjustment_definition_registry_guard
before update or delete on public.payroll_adjustment_definitions
for each row execute function public.guard_payroll_adjustment_definition_registry();

create or replace function public.audit_payroll_adjustment_definition_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.payroll_adjustment_definition_audit (
    definition_code, previous_values, new_values, reason, changed_by
  ) values (
    new.code,
    jsonb_build_object(
      'display_name', old.display_name,
      'category', old.category,
      'input_mode', old.input_mode,
      'active', old.active
    ),
    jsonb_build_object(
      'display_name', new.display_name,
      'category', new.category,
      'input_mode', new.input_mode,
      'active', new.active
    ),
    new.change_reason,
    new.updated_by
  );
  return new;
end;
$$;

create trigger payroll_adjustment_definition_audit_update
after update on public.payroll_adjustment_definitions
for each row execute function public.audit_payroll_adjustment_definition_update();

create or replace function public.guard_payroll_adjustment_definition_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Payroll adjustment definition audit rows are append-only.';
end;
$$;

create trigger payroll_adjustment_definition_audit_immutable
before update or delete on public.payroll_adjustment_definition_audit
for each row execute function public.guard_payroll_adjustment_definition_audit();

alter table public.payroll_adjustment_definitions enable row level security;
alter table public.payroll_adjustment_definition_audit enable row level security;

revoke all on table public.payroll_adjustment_definitions from public, anon, authenticated;
revoke all on table public.payroll_adjustment_definition_audit from public, anon, authenticated;
grant select on table public.payroll_adjustment_definitions to authenticated;
grant select on table public.payroll_adjustment_definition_audit to authenticated;

create policy payroll_adjustment_definitions_staff_select
on public.payroll_adjustment_definitions
for select to authenticated
using (
  (select public.get_my_role()) in (
    'admin'::public.user_role,
    'hr'::public.user_role,
    'payroll'::public.user_role
  )
);

create policy payroll_adjustment_definition_audit_staff_select
on public.payroll_adjustment_definition_audit
for select to authenticated
using (
  (select public.get_my_role()) in (
    'admin'::public.user_role,
    'hr'::public.user_role,
    'payroll'::public.user_role
  )
);

create or replace function public.update_payroll_adjustment_definition(
  p_code text,
  p_display_name text,
  p_active boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
    or public.get_my_role() is distinct from 'admin'::public.user_role
  then
    raise exception 'Only Admin may update Earnings & Deductions definitions.';
  end if;

  if length(btrim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'Display name is required.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Change reason is required.';
  end if;

  perform 1
  from public.payroll_adjustment_definitions
  where code = p_code
  for update;

  if not found then
    raise exception 'Unknown payroll adjustment definition: %.', p_code;
  end if;

  update public.payroll_adjustment_definitions
  set display_name = btrim(p_display_name),
      active = p_active,
      change_reason = btrim(p_reason),
      updated_by = actor_id,
      updated_at = now()
  where code = p_code;
end;
$$;

revoke all on function public.update_payroll_adjustment_definition(text, text, boolean, text)
from public, anon, authenticated;
grant execute on function public.update_payroll_adjustment_definition(text, text, boolean, text)
to authenticated;

revoke all on function public.guard_payroll_adjustment_definition_registry() from public;
revoke all on function public.audit_payroll_adjustment_definition_update() from public;
revoke all on function public.guard_payroll_adjustment_definition_audit() from public;

create or replace function private.legacy_fm_pickup_amount(p_count integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_count, 0)::numeric * 3::numeric;
$$;

revoke all on function private.legacy_fm_pickup_amount(integer) from public, anon, authenticated;

create or replace function private.build_payroll_adjustment_snapshot(
  p_other_earnings numeric,
  p_fm_pickup_amount numeric,
  p_deductions numeric,
  p_late_onhold numeric,
  p_late_remittance numeric,
  p_version integer,
  p_legacy_fm_pickup_count integer default null
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
      end
    )
  )
  from public.payroll_adjustment_definitions definition;
$$;

revoke all on function private.build_payroll_adjustment_snapshot(numeric, numeric, numeric, numeric, numeric, integer, integer)
from public, anon, authenticated;

alter table public.payroll_records
  add column fm_pickup_amount numeric(12, 2) default 0,
  add column adjustment_snapshot jsonb,
  add column adjustment_snapshot_version integer,
  add column total_earnings_snapshot numeric(12, 2),
  add column total_deductions_snapshot numeric(12, 2),
  add column net_pay_snapshot numeric(12, 2);

-- Migration-owned additive backfill. Existing financial columns, statuses,
-- timestamps, actor snapshots, and parcel-delivery snapshots are unchanged.
alter table public.payroll_records disable trigger payroll_updated_at;
alter table public.payroll_records disable trigger trg_a_protect_payroll_snapshot_immutability;
alter table public.payroll_records disable trigger trg_enforce_payroll_workflow_constraints;

update public.payroll_records
set fm_pickup_amount = private.legacy_fm_pickup_amount(fm_pickup_count),
    adjustment_snapshot = case
      when status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
      then private.build_payroll_adjustment_snapshot(
        coalesce(other_earnings, 0),
        private.legacy_fm_pickup_amount(fm_pickup_count),
        coalesce(deductions, 0),
        coalesce(late_onhold, 0),
        coalesce(late_remittance, 0),
        1,
        fm_pickup_count
      )
      else null
    end,
    adjustment_snapshot_version = case
      when status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status) then 1
      else null
    end,
    total_earnings_snapshot = case
      when status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
      then coalesce(gross_pay, 0) + coalesce(other_earnings, 0) + private.legacy_fm_pickup_amount(fm_pickup_count)
      else null
    end,
    total_deductions_snapshot = case
      when status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
      then coalesce(deductions, 0) + coalesce(late_onhold, 0) + coalesce(late_remittance, 0)
      else null
    end,
    net_pay_snapshot = case
      when status in ('pending'::public.payroll_status, 'approved'::public.payroll_status, 'paid'::public.payroll_status)
      then coalesce(gross_pay, 0) + coalesce(other_earnings, 0) + private.legacy_fm_pickup_amount(fm_pickup_count)
        - coalesce(deductions, 0) - coalesce(late_onhold, 0) - coalesce(late_remittance, 0)
      else null
    end;

alter table public.payroll_records enable trigger trg_enforce_payroll_workflow_constraints;
alter table public.payroll_records enable trigger trg_a_protect_payroll_snapshot_immutability;
alter table public.payroll_records enable trigger payroll_updated_at;

alter table public.payroll_records
  alter column fm_pickup_amount set default 0,
  alter column fm_pickup_amount set not null,
  add constraint payroll_records_fm_pickup_amount_nonnegative_check check (fm_pickup_amount >= 0),
  add constraint payroll_records_adjustment_snapshot_version_check check (
    adjustment_snapshot_version is null or adjustment_snapshot_version > 0
  ),
  add constraint payroll_records_adjustment_snapshot_shape_check check (
    adjustment_snapshot is null
    or (
      jsonb_typeof(adjustment_snapshot) = 'object'
      and jsonb_typeof(adjustment_snapshot->'items') = 'array'
    )
  );

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

  return new;
end;
$$;

create trigger trg_guard_inactive_payroll_adjustment_values
before insert or update of other_earnings, fm_pickup_amount, deductions, late_onhold, late_remittance
on public.payroll_records
for each row execute function public.guard_inactive_payroll_adjustment_values();

create or replace function public.build_payroll_adjustment_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition_count integer;
  earning_total numeric;
  deduction_total numeric;
begin
  if old.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
    and new.status = 'pending'::public.payroll_status
  then
    select count(*) into definition_count from public.payroll_adjustment_definitions;
    if definition_count <> 5 then
      raise exception 'Payroll adjustment registry must contain exactly five definitions.';
    end if;

    if coalesce(new.other_earnings, 0) < 0
      or coalesce(new.fm_pickup_amount, 0) < 0
      or coalesce(new.deductions, 0) < 0
      or coalesce(new.late_onhold, 0) < 0
      or coalesce(new.late_remittance, 0) < 0
    then
      raise exception 'Payroll adjustment amounts cannot be negative.';
    end if;

    earning_total := coalesce(new.gross_pay, 0)
      + coalesce(new.other_earnings, 0)
      + coalesce(new.fm_pickup_amount, 0);
    deduction_total := coalesce(new.deductions, 0)
      + coalesce(new.late_onhold, 0)
      + coalesce(new.late_remittance, 0);

    new.adjustment_snapshot := private.build_payroll_adjustment_snapshot(
      new.other_earnings,
      new.fm_pickup_amount,
      new.deductions,
      new.late_onhold,
      new.late_remittance,
      2,
      null
    );
    new.adjustment_snapshot_version := 2;
    new.total_earnings_snapshot := earning_total;
    new.total_deductions_snapshot := deduction_total;
    new.net_pay_snapshot := earning_total - deduction_total;
  elsif old.status = 'pending'::public.payroll_status
    and new.status in ('draft'::public.payroll_status, 'rejected'::public.payroll_status)
  then
    new.adjustment_snapshot := null;
    new.adjustment_snapshot_version := null;
    new.total_earnings_snapshot := null;
    new.total_deductions_snapshot := null;
    new.net_pay_snapshot := null;
  end if;

  return new;
end;
$$;

create trigger trg_z_build_payroll_adjustment_snapshot
before update of status on public.payroll_records
for each row
when (old.status is distinct from new.status)
execute function public.build_payroll_adjustment_snapshot();

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

create trigger trg_b_guard_payroll_adjustment_snapshot_immutability
before update or delete on public.payroll_records
for each row execute function public.guard_payroll_adjustment_snapshot_immutability();

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

  if item_count <> 5
    or new.total_earnings_snapshot <> coalesce(new.gross_pay, 0) + earning_adjustments
    or new.total_deductions_snapshot <> deduction_adjustments
    or new.net_pay_snapshot <> new.total_earnings_snapshot - new.total_deductions_snapshot
  then
    raise exception 'Submitted payroll adjustment snapshot totals do not reconcile.';
  end if;

  return new;
end;
$$;

create trigger trg_y_validate_payroll_adjustment_snapshot_transition
before update of status on public.payroll_records
for each row
when (old.status is distinct from new.status)
execute function public.validate_payroll_adjustment_snapshot_transition();

revoke all on function public.guard_inactive_payroll_adjustment_values() from public;
revoke all on function public.build_payroll_adjustment_snapshot() from public;
revoke all on function public.guard_payroll_adjustment_snapshot_immutability() from public;
revoke all on function public.validate_payroll_adjustment_snapshot_transition() from public;
