-- Policy V2 Phase 1: persistence/security only. No policy activation, decision
-- RPC, attendance evaluator, or payroll materialization is introduced here.

create table public.rider_absence_financial_consequences (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete restrict,
  hub_id uuid not null references public.hubs(id) on delete restrict,
  business_date date not null,
  absence_request_id uuid references public.rider_absence_requests(id) on delete restrict,
  attendance_context_code text not null,
  policy_version_id uuid not null references public.absence_policy_versions(id) on delete restrict,
  financial_eligibility_reason text not null,
  policy_penalty_amount numeric(12,2) not null,
  applied_amount numeric(12,2) not null,
  currency text not null default 'PHP',
  status text not null,
  confirmation_key uuid not null,
  decided_by uuid not null references public.users(id) on delete restrict,
  decided_at timestamptz not null default clock_timestamp(),
  supervisor_name text not null,
  decision_notes text not null,
  waiver_reason_category text,
  evidence_reference text,
  deduction_obligation_id uuid references public.payroll_deduction_obligations(id) on delete restrict,
  reversed_by uuid references public.users(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  reversal_earning_id uuid references public.payroll_earning_adjustments(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint absence_financial_rider_date_key unique (rider_id, business_date),
  constraint absence_financial_confirmation_key unique (confirmation_key),
  constraint absence_financial_status_check check (
    status in ('confirmed', 'waived_emergency', 'waived_excused', 'reversed')
  ),
  constraint absence_financial_eligibility_check check (
    financial_eligibility_reason in (
      'absence_without_prior_notice', 'denied_unauthorized_absence'
    )
  ),
  constraint absence_financial_policy_amount_check check (
    policy_penalty_amount > 0 and policy_penalty_amount <> 'NaN'::numeric
  ),
  constraint absence_financial_applied_amount_check check (applied_amount >= 0),
  constraint absence_financial_amount_ceiling_check check (applied_amount <= policy_penalty_amount),
  constraint absence_financial_status_amount_check check (
    (status = 'confirmed' and applied_amount = policy_penalty_amount)
    or (status in ('waived_emergency', 'waived_excused') and applied_amount = 0)
    or status = 'reversed'
  ),
  constraint absence_financial_supervisor_check check (length(btrim(supervisor_name)) between 1 and 120),
  constraint absence_financial_notes_check check (length(btrim(decision_notes)) between 1 and 500),
  constraint absence_financial_evidence_check check (
    evidence_reference is null or length(btrim(evidence_reference)) between 1 and 200
  ),
  constraint absence_financial_reversal_reason_check check (
    reversal_reason is null or length(btrim(reversal_reason)) between 1 and 500
  )
);

comment on table public.rider_absence_financial_consequences is
  'Explicit human decision snapshots only. No pending projection or automatic attendance-to-payroll effect.';
comment on column public.rider_absence_financial_consequences.hub_id is
  'Historical decision Hub scope; not a live mirror of the Rider current Hub.';
comment on column public.rider_absence_financial_consequences.business_date is
  'Asia/Manila business date.';
comment on column public.rider_absence_financial_consequences.applied_amount is
  'Decision amount retained on reversal; reversal does not rewrite the historical amount to zero.';

create index absence_financial_hub_status_date_idx
  on public.rider_absence_financial_consequences (hub_id, status, business_date desc);

-- This narrow storage guard preserves history without implementing a reversal
-- workflow. Future decision RPCs must supply authorization and transition rules.
create function private.guard_absence_financial_reversed_amount()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (new.status = 'reversed' or old.status = 'reversed')
     and new.applied_amount is distinct from old.applied_amount then
    raise exception 'Reversal must preserve the historical applied amount.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger absence_financial_reversed_amount_guard
before update on public.rider_absence_financial_consequences
for each row execute function private.guard_absence_financial_reversed_amount();

create trigger absence_financial_updated_at
before update on public.rider_absence_financial_consequences
for each row execute function public.handle_updated_at();

create table public.rider_absence_financial_consequence_audit_events (
  id uuid primary key default gen_random_uuid(),
  consequence_id uuid not null references public.rider_absence_financial_consequences(id) on delete restrict,
  action text not null check (action in ('confirmed', 'waived_emergency', 'waived_excused', 'reversed')),
  actor_id uuid not null references public.users(id) on delete restrict,
  old_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.rider_absence_financial_consequence_audit_events is
  'Append-only before/after decision history. Future explicit decision RPCs will append events atomically.';

create function private.prevent_absence_financial_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Absence financial audit history is immutable.' using errcode = '42501';
end;
$$;

create trigger absence_financial_audit_immutable
before update or delete on public.rider_absence_financial_consequence_audit_events
for each row execute function private.prevent_absence_financial_audit_mutation();

revoke all on function private.guard_absence_financial_reversed_amount() from public, anon, authenticated;
revoke all on function private.prevent_absence_financial_audit_mutation() from public, anon, authenticated;

alter table public.rider_absence_financial_consequences enable row level security;
alter table public.rider_absence_financial_consequence_audit_events enable row level security;

revoke all on table public.rider_absence_financial_consequences from public, anon, authenticated;
revoke all on table public.rider_absence_financial_consequence_audit_events from public, anon, authenticated;
grant select on table public.rider_absence_financial_consequences to authenticated;
grant select on table public.rider_absence_financial_consequence_audit_events to authenticated;

create policy absence_financial_admin_select
on public.rider_absence_financial_consequences for select to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role);

create policy absence_financial_hr_select
on public.rider_absence_financial_consequences for select to authenticated
using (
  (select public.get_my_role()) = 'hr'::public.user_role
  and private.user_can_access_hub(hub_id)
);

-- Audit visibility follows its parent decision RLS, avoiding duplicated Hub
-- snapshots and preventing audit JSON from exposing hidden consequence rows.
create policy absence_financial_audit_select
on public.rider_absence_financial_consequence_audit_events for select to authenticated
using (
  exists (
    select 1 from public.rider_absence_financial_consequences consequence
    where consequence.id = consequence_id
  )
);
