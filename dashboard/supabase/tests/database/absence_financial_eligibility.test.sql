-- Isolated database only, with repository migrations applied. No schema stubs,
-- disabled guards, production connection, or historical test-suite repair.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select no_plan();

select has_function('private', 'resolve_rider_absence_financial_eligibility',
  array['uuid', 'date', 'timestamp with time zone', 'boolean'], 'private evaluator exists');
select has_function('public', 'list_rider_absence_financial_eligibility',
  array['date', 'date', 'uuid', 'uuid', 'integer', 'integer', 'boolean'], 'bounded staff read API exists');

insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a7200000-0000-4000-8000-000000000001', 'Eligibility Alpha', 1, 1, 100),
  ('a7200000-0000-4000-8000-000000000002', 'Eligibility Beta', 2, 2, 100);
insert into public.riders (id, hub_id, name, mkb_id, email, status) values
  ('c7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', 'Eligibility Rider Alpha', 'TEST-AFE-A', 'afe-rider@example.test', 'active'),
  ('c7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000002', 'Eligibility Rider Beta', 'TEST-AFE-B', 'afe-rider-b@example.test', 'active');
insert into auth.users (id, email, email_confirmed_at) values
  ('d7200000-0000-4000-8000-000000000001', 'afe-admin@example.test', clock_timestamp()),
  ('d7200000-0000-4000-8000-000000000002', 'afe-hr@example.test', clock_timestamp()),
  ('d7200000-0000-4000-8000-000000000003', 'afe-payroll@example.test', clock_timestamp()),
  ('d7200000-0000-4000-8000-000000000004', 'afe-rider@example.test', clock_timestamp());
insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status) values
  ('d7200000-0000-4000-8000-000000000001', 'Eligibility Admin', 'afe-admin@example.test', 'admin', null, 'global', 'active', 'active'),
  ('d7200000-0000-4000-8000-000000000002', 'Eligibility HR', 'afe-hr@example.test', 'hr', null, 'assigned', 'active', 'active'),
  ('d7200000-0000-4000-8000-000000000003', 'Eligibility Payroll', 'afe-payroll@example.test', 'payroll', null, 'global', 'active', 'active'),
  ('d7200000-0000-4000-8000-000000000004', 'Eligibility Rider', 'afe-rider@example.test', 'rider', 'c7200000-0000-4000-8000-000000000001', 'assigned', 'active', 'active');
insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('d7200000-0000-4000-8000-000000000002', 'a7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001');

insert into public.attendance_logs (rider_id, hub_id, date, time_in, status)
values ('c7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', '2026-09-10', '2026-09-10 00:00:00+00', 'present');
insert into public.rider_schedules (
  rider_id, work_date, hub_id, day_kind, status, created_by, updated_by, published_by, published_at
) values ('c7200000-0000-4000-8000-000000000001', '2026-09-11', 'a7200000-0000-4000-8000-000000000001', 'day_off', 'published', 'd7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', '2026-09-09 00:00:00+00');

-- Direct owner fixtures model existing server-stamped evidence. Production
-- evaluation never accepts a caller-supplied submitted_at or mutates requests.
insert into public.rider_absence_requests (
  rider_id, hub_id, request_kind, start_date, end_date, reason,
  submitted_by, submitted_at, status, reviewed_by, reviewed_at, review_reason,
  withdrawn_by, withdrawn_at, withdrawal_reason,
  cancelled_by, cancelled_at, cancellation_reason, updated_by
)
select 'c7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001', f.kind::public.rider_absence_request_kind,
  f.start_date::date, f.end_date::date, 'PRIVATE REQUEST TEXT',
  'd7200000-0000-4000-8000-000000000001', f.submitted_at::timestamptz, f.status::public.rider_absence_request_status,
  case when f.status in ('approved', 'rejected', 'cancelled') then 'd7200000-0000-4000-8000-000000000001'::uuid end,
  case when f.status in ('approved', 'rejected', 'cancelled') then f.submitted_at::timestamptz end,
  case when f.status in ('approved', 'rejected', 'cancelled') then 'PRIVATE REVIEW TEXT' end,
  case when f.status = 'withdrawn' then 'd7200000-0000-4000-8000-000000000001'::uuid end,
  case when f.status = 'withdrawn' then f.submitted_at::timestamptz end,
  case when f.status = 'withdrawn' then 'PRIVATE WITHDRAWAL TEXT' end,
  case when f.status = 'cancelled' then 'd7200000-0000-4000-8000-000000000001'::uuid end,
  case when f.status = 'cancelled' then f.submitted_at::timestamptz end,
  case when f.status = 'cancelled' then 'PRIVATE CANCELLATION TEXT' end,
  'd7200000-0000-4000-8000-000000000001'
from (values
  ('planned_leave', '2026-09-12', '2026-09-12', '2026-09-09 15:59:00+00', 'approved'),
  ('absence_notice', '2026-09-13', '2026-09-13', '2026-09-13 00:00:00+00', 'approved'),
  ('planned_leave', '2026-09-14', '2026-09-14', '2026-09-11 00:00:00+00', 'pending'),
  ('absence_notice', '2026-09-15', '2026-09-15', '2026-09-14 00:00:00+00', 'pending'),
  ('planned_leave', '2026-09-17', '2026-09-17', '2026-09-14 00:00:00+00', 'rejected'),
  ('absence_notice', '2026-09-18', '2026-09-18', '2026-09-16 00:00:00+00', 'rejected'),
  ('planned_leave', '2026-09-19', '2026-09-19', '2026-09-16 00:00:00+00', 'withdrawn'),
  ('absence_notice', '2026-09-20', '2026-09-20', '2026-09-17 00:00:00+00', 'withdrawn'),
  ('planned_leave', '2026-09-21', '2026-09-21', '2026-09-18 00:00:00+00', 'cancelled'),
  ('absence_notice', '2026-09-22', '2026-09-22', '2026-09-19 00:00:00+00', 'cancelled'),
  ('planned_leave', '2026-09-23', '2026-09-24', '2026-09-21 00:00:00+00', 'pending'),
  ('planned_leave', '2026-09-25', '2026-09-25', '2026-09-22 16:00:00+00', 'pending'),
  ('planned_leave', '2026-09-26', '2026-09-26', '2026-09-23 15:59:00+00', 'pending'),
  ('planned_leave', '2026-09-27', '2026-09-27', '2026-09-24 00:00:00+00', 'rejected'),
  ('absence_notice', '2026-09-27', '2026-09-27', '2026-09-26 00:00:00+00', 'pending')
) f(kind, start_date, end_date, submitted_at, status);

-- Existing human decision fixture only: evaluation must never insert this row.
insert into public.rider_absence_financial_consequences (
  id, rider_id, hub_id, business_date, attendance_context_code, policy_version_id,
  financial_eligibility_reason, policy_penalty_amount, applied_amount, status,
  confirmation_key, decided_by, supervisor_name, decision_notes
)
select 'e7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002',
  'a7200000-0000-4000-8000-000000000002', '2026-09-16', 'no_notice', p.id,
  'absence_without_prior_notice', 750, 750, 'confirmed',
  'f7200000-0000-4000-8000-000000000001', 'd7200000-0000-4000-8000-000000000001', 'Test Supervisor', 'PRIVATE DECISION TEXT'
from public.absence_policy_versions p where p.version_number = 1;

-- Snapshot complete rows, not just counts, before ANY evaluator calls.
create temporary table financial_read_baseline (relation_name text primary key, rows_json jsonb);
insert into financial_read_baseline select 'rider_absence_financial_consequences', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.rider_absence_financial_consequences t;
insert into financial_read_baseline select 'rider_absence_financial_consequence_audit_events', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.rider_absence_financial_consequence_audit_events t;
insert into financial_read_baseline select 'payroll_deduction_obligations', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_obligations t;
insert into financial_read_baseline select 'payroll_records', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_records t;
insert into financial_read_baseline select 'payroll_earning_adjustments', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_earning_adjustments t;
insert into financial_read_baseline select 'absence_policy_versions', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.absence_policy_versions t;
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-10', '2026-10-01 10:00:00+00'::timestamptz, true)), 'not_absent'::text, 'actual attendance reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-10', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'actual attendance has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-11', '2026-10-01 10:00:00+00'::timestamptz, true)), 'not_applicable'::text, 'published day off reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-11', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'published day off has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-12', '2026-10-01 10:00:00+00'::timestamptz, true)), 'excused'::text, 'approved leave reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-12', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'approved leave has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-13', '2026-10-01 10:00:00+00'::timestamptz, true)), 'excused'::text, 'accepted notice reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-13', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'accepted notice has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-14', '2026-10-01 10:00:00+00'::timestamptz, true)), 'pending_review'::text, 'pending leave reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-14', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'pending leave has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-15', '2026-10-01 10:00:00+00'::timestamptz, true)), 'pending_review'::text, 'pending notice reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-15', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'pending notice has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-19', '2026-10-01 10:00:00+00'::timestamptz, true)), 'unexcused'::text, 'withdrawn leave reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-19', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'withdrawn leave has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-20', '2026-10-01 10:00:00+00'::timestamptz, true)), 'unexcused'::text, 'withdrawn notice reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-20', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'withdrawn notice has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-21', '2026-10-01 10:00:00+00'::timestamptz, true)), 'unexcused'::text, 'cancelled leave reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-21', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'cancelled leave has no financial eligibility');
select is((select assessment_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-22', '2026-10-01 10:00:00+00'::timestamptz, true)), 'unexcused'::text, 'cancelled notice reuses V1 classification');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-22', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'cancelled notice has no financial eligibility');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'absence_without_prior_notice'::text, 'no notice finalized expected absence is a preview candidate');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-17', '2026-10-01 10:00:00+00'::timestamptz, true)), 'denied_unauthorized_absence'::text, 'denied leave despite timely submission is a preview candidate');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-18', '2026-10-01 10:00:00+00'::timestamptz, true)), 'denied_unauthorized_absence'::text, 'denied notice is a preview candidate');
select is((select notice_timeliness from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-12', '2026-10-01 10:00:00+00'::timestamptz, true)), 'timely'::text, 'three calendar days is timely even below 72 elapsed hours');
select is((select notice_days from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-12', '2026-10-01 10:00:00+00'::timestamptz, true)), 3, 'timely notice counts Manila dates');
select is((select notice_timeliness from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-13', '2026-10-01 10:00:00+00'::timestamptz, true)), 'late'::text, 'same-day accepted notice is late but remains excused');
select is((select notice_timeliness from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'no_notice'::text, 'missing request is no_notice');
select is((select notice_days from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), null::integer, 'missing request has no invented notice-day count');
select is((select notice_days from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-24', '2026-10-01 10:00:00+00'::timestamptz, true)), 2, 'multi-day request uses start date, not evaluated day');
select is((select notice_days from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-25', '2026-10-01 10:00:00+00'::timestamptz, true)), 2, '16:00 UTC is the next Manila calendar date');
select is((select notice_timeliness from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-25', '2026-10-01 10:00:00+00'::timestamptz, true)), 'late'::text, 'UTC boundary does not falsely classify three-day notice');
select is((select notice_days from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-26', '2026-10-01 10:00:00+00'::timestamptz, true)), 3, '15:59 UTC is still the same Manila date');
set local timezone = 'America/Los_Angeles';
select is((select notice_days from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-25', '2026-10-01 10:00:00+00'::timestamptz, true)), 2, 'session timezone cannot change Manila notice days');
set local timezone = 'UTC';
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-27', '2026-10-01 10:00:00+00'::timestamptz, true)), null::text, 'pending notice prevents eligibility despite a denied leave');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-09-16 08:59:59+00'::timestamptz, true)), null::text, 'pre-cutoff absence is not eligible');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-09-16 09:00:00+00'::timestamptz, true)), 'absence_without_prior_notice'::text, '17:00 Manila cutoff finalizes expected absence');
select ok((select requires_confirmation from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'eligible unresolved preview requires confirmation');
select ok(not (select requires_confirmation from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000002', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'existing decision suppresses pending confirmation');
select is((select existing_consequence_id from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000002', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'e7200000-0000-4000-8000-000000000001'::uuid, 'existing decision identity is returned');
select is((select existing_consequence_status from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000002', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'confirmed'::text, 'existing decision status is returned');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, false)), null::text, 'inactive evaluation does not generate historical eligibility');
select ok(not (select requires_confirmation from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, false)), 'inactive evaluation never creates a confirmation queue');
select is((select evaluation_mode from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, true)), 'preview'::text, 'candidate results explicitly marked preview');
select is((select evaluation_mode from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', date '2026-09-16', '2026-10-01 10:00:00+00'::timestamptz, false)), 'inactive'::text, 'ordinary results explicitly marked inactive');
select is((select financial_eligibility_reason from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', '2026-09-16', '2026-10-01 10:00:00+00')), null::text, 'private evaluator defaults to inactive');
select throws_ok($$select * from private.resolve_rider_absence_financial_eligibility('c7200000-0000-4000-8000-000000000001', null)$$, '22023', null, 'null date rejected');

select ok(not has_function_privilege('authenticated', 'private.resolve_rider_absence_financial_eligibility(uuid,date,timestamptz,boolean)', 'EXECUTE'), 'private evaluator unavailable to clients');
select ok(not has_function_privilege('anon', 'public.list_rider_absence_financial_eligibility(date,date,uuid,uuid,integer,integer,boolean)', 'EXECUTE'), 'Anon has no public execution grant');
select ok(not has_function_privilege('service_role', 'public.list_rider_absence_financial_eligibility(date,date,uuid,uuid,integer,integer,boolean)', 'EXECUTE'), 'read API does not grant service-role bypass');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d7200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 0, true)
  where rider_id in ('c7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002')), 2::bigint, 'Admin sees both hubs');
select ok((select requires_confirmation from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000001', 500, 0, true)), 'Admin explicit preview returns unresolved candidate');
select is((select financial_eligibility_reason from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000001')), null::text, 'public default does not activate V2');
select is((select evaluation_mode from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000001')), 'inactive'::text, 'public default reports inactive');
select is((select existing_consequence_status from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000002')), 'confirmed'::text, 'ordinary read still reports existing decision');
select ok((select not (to_jsonb(e)::text like '%PRIVATE%') from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000002', 500, 0, true) e), 'RPC does not leak private decision text');
select ok((select not (to_jsonb(e)::text like '%PRIVATE%') from public.list_rider_absence_financial_eligibility('2026-09-12', '2026-09-12', null, 'c7200000-0000-4000-8000-000000000001', 500, 0, true) e), 'RPC does not leak request or review text');
select is((select count(*) from public.list_rider_absence_financial_eligibility('2026-09-10', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000001', 1, 0, true)), 1::bigint, 'page limit respected');
select is((select business_date from public.list_rider_absence_financial_eligibility('2026-09-10', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000001', 1, 1, true)), date '2026-09-11', 'offset follows stable date ordering');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility(null, '2026-09-16')$$, '22023', null, 'null start rejected');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-17', '2026-09-16')$$, '22023', null, 'reversed date range rejected');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-01', '2026-10-03')$$, '22023', null, 'more than 32 calendar days rejected');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 501)$$, '22023', null, 'oversized page rejected');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, -1)$$, '22023', null, 'negative offset rejected');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 100001)$$, '22023', null, 'excessive offset rejected');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 0, null)$$, '22023', null, 'null preview rejected');
select set_config('request.jwt.claims', '{"sub":"d7200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 0, true)
  where rider_id in ('c7200000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000002')), 1::bigint, 'HR sees only authorized hub without a hub filter');
select is((select count(*) from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, 'c7200000-0000-4000-8000-000000000002', 500, 0, true)), 0::bigint, 'Rider filter cannot bypass hub authorization');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', 'a7200000-0000-4000-8000-000000000002', null, 500, 0, true)$$, '42501', null, 'explicit unauthorized hub rejected');
select set_config('request.jwt.claims', '{"sub":"d7200000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 0, true)$$, '42501', null, 'Payroll denied preview');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16')$$, '42501', null, 'Payroll denied ordinary read');
select set_config('request.jwt.claims', '{"sub":"d7200000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 0, true)$$, '42501', null, 'Rider denied preview');
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16')$$, '42501', null, 'Rider denied ordinary read');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.list_rider_absence_financial_eligibility('2026-09-16', '2026-09-16', null, null, 500, 0, true)$$, '42501', null, 'Anon denied');
reset role;

-- Check complete before/after contents after private and public reads.
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.rider_absence_financial_consequences t),
  (select rows_json from financial_read_baseline where relation_name = 'rider_absence_financial_consequences'), 'rider_absence_financial_consequences unchanged by all evaluation reads');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.rider_absence_financial_consequence_audit_events t),
  (select rows_json from financial_read_baseline where relation_name = 'rider_absence_financial_consequence_audit_events'), 'rider_absence_financial_consequence_audit_events unchanged by all evaluation reads');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_deduction_obligations t),
  (select rows_json from financial_read_baseline where relation_name = 'payroll_deduction_obligations'), 'payroll_deduction_obligations unchanged by all evaluation reads');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_records t),
  (select rows_json from financial_read_baseline where relation_name = 'payroll_records'), 'payroll_records unchanged by all evaluation reads');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.payroll_earning_adjustments t),
  (select rows_json from financial_read_baseline where relation_name = 'payroll_earning_adjustments'), 'payroll_earning_adjustments unchanged by all evaluation reads');
select is((select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.absence_policy_versions t),
  (select rows_json from financial_read_baseline where relation_name = 'absence_policy_versions'), 'absence_policy_versions unchanged by all evaluation reads');
select * from finish();
rollback;
