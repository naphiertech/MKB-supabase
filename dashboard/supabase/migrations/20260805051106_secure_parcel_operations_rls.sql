-- Phase 2.1: close the unauthenticated parcel correction/audit exposure and
-- make Payroll read-only on Parcel Operations data.

alter table public.parcel_correction_requests enable row level security;
alter table public.parcel_log_audit enable row level security;

revoke all on table public.parcel_correction_requests from anon;
revoke all on table public.parcel_log_audit from anon;
revoke all on table public.parcel_logs from anon;

revoke all on table public.parcel_correction_requests from authenticated;
revoke all on table public.parcel_log_audit from authenticated;
grant select, insert, update on table public.parcel_correction_requests to authenticated;
grant select, insert on table public.parcel_log_audit to authenticated;

grant select, insert, update, delete on table public.parcel_logs to authenticated;

drop policy if exists "Admin and HR can read parcel correction requests"
  on public.parcel_correction_requests;
drop policy if exists "Admin and HR can create parcel correction requests"
  on public.parcel_correction_requests;
drop policy if exists "Admin can review parcel correction requests"
  on public.parcel_correction_requests;

create policy "Admin and HR can read parcel correction requests"
  on public.parcel_correction_requests
  for select
  to authenticated
  using ((select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role));

create policy "Admin and HR can create parcel correction requests"
  on public.parcel_correction_requests
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and requested_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy "Admin can review parcel correction requests"
  on public.parcel_correction_requests
  for update
  to authenticated
  using (
    (select public.get_my_role()) = 'admin'::public.user_role
    and status = 'pending'
  )
  with check (
    (select public.get_my_role()) = 'admin'::public.user_role
    and status in ('approved', 'rejected')
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
  );

drop policy if exists "Admin and HR can read parcel audit"
  on public.parcel_log_audit;
drop policy if exists "Admin and HR can append parcel audit"
  on public.parcel_log_audit;

create policy "Admin and HR can read parcel audit"
  on public.parcel_log_audit
  for select
  to authenticated
  using ((select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role));

create policy "Admin and HR can append parcel audit"
  on public.parcel_log_audit
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
    and (
      changed_by = (select auth.uid())
      or approved_by = (select auth.uid())
    )
  );

alter table public.parcel_correction_requests
  drop constraint if exists parcel_correction_requests_status_check;
alter table public.parcel_correction_requests
  add constraint parcel_correction_requests_status_check
  check (status in ('pending', 'approved', 'rejected')) not valid;
alter table public.parcel_correction_requests
  validate constraint parcel_correction_requests_status_check;

alter table public.parcel_log_audit
  drop constraint if exists parcel_log_audit_action_type_check;
alter table public.parcel_log_audit
  add constraint parcel_log_audit_action_type_check
  check (action_type in (
    'created',
    'updated',
    'correction_requested',
    'correction_approved',
    'correction_rejected'
  )) not valid;
alter table public.parcel_log_audit
  validate constraint parcel_log_audit_action_type_check;

create or replace function public.enforce_parcel_correction_review()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'Parcel correction requests can only be reviewed once.';
  end if;

  if new.parcel_log_id is distinct from old.parcel_log_id
    or new.rider_id is distinct from old.rider_id
    or new.date is distinct from old.date
    or new.previous_delivered is distinct from old.previous_delivered
    or new.previous_failed is distinct from old.previous_failed
    or new.previous_returned is distinct from old.previous_returned
    or new.requested_delivered is distinct from old.requested_delivered
    or new.requested_failed is distinct from old.requested_failed
    or new.requested_returned is distinct from old.requested_returned
    or new.reason is distinct from old.reason
    or new.requested_by is distinct from old.requested_by
    or new.requested_at is distinct from old.requested_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Parcel correction request details are immutable after submission.';
  end if;

  return new;
end;
$$;

create trigger parcel_correction_requests_review_once
  before update on public.parcel_correction_requests
  for each row
  execute function public.enforce_parcel_correction_review();

-- Audit rows must survive attempts to remove their source parcel or rider.
alter table public.parcel_log_audit
  drop constraint parcel_log_audit_parcel_log_id_fkey,
  add constraint parcel_log_audit_parcel_log_id_fkey
    foreign key (parcel_log_id) references public.parcel_logs(id) on delete restrict,
  drop constraint parcel_log_audit_rider_id_fkey,
  add constraint parcel_log_audit_rider_id_fkey
    foreign key (rider_id) references public.riders(id) on delete restrict;

-- Replace the broad Parcel Operations policies. Payroll retains SELECT only.
drop policy if exists "Operations, HR, Payroll and Admin can insert parcel logs"
  on public.parcel_logs;
drop policy if exists "Operations, HR, Payroll and Admin can update parcel logs"
  on public.parcel_logs;
drop policy if exists "Payroll and Admin can delete parcel logs"
  on public.parcel_logs;
drop policy if exists "Payroll and Admin can read all parcel logs"
  on public.parcel_logs;
drop policy if exists "Admin and HR can insert parcel logs"
  on public.parcel_logs;
drop policy if exists "Admin and HR can update parcel logs"
  on public.parcel_logs;
drop policy if exists "Admin can delete parcel logs"
  on public.parcel_logs;
drop policy if exists "Admin HR and Payroll can read parcel logs"
  on public.parcel_logs;

create policy "Admin HR and Payroll can read parcel logs"
  on public.parcel_logs
  for select
  to authenticated
  using (
    (select public.get_my_role()) in (
      'admin'::public.user_role,
      'hr'::public.user_role,
      'payroll'::public.user_role
    )
  );

create policy "Admin and HR can insert parcel logs"
  on public.parcel_logs
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );

create policy "Admin and HR can update parcel logs"
  on public.parcel_logs
  for update
  to authenticated
  using (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  )
  with check (
    (select public.get_my_role()) in ('admin'::public.user_role, 'hr'::public.user_role)
  );

create policy "Admin can delete parcel logs"
  on public.parcel_logs
  for delete
  to authenticated
  using ((select public.get_my_role()) = 'admin'::public.user_role);
