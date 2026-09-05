begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('rider_absence_requests_v1_test'));
select no_plan();
create temporary table rider_absence_tap_results (result text not null);
create temporary table rider_absence_ids (name text primary key, id uuid not null);
create temporary table rider_absence_replay_baseline (
  request_id uuid not null,
  submitted_at timestamptz not null,
  audit_count bigint not null,
  notification_count bigint not null
);
grant insert, select on rider_absence_tap_results to authenticated;
grant insert, select on rider_absence_ids to authenticated;
grant insert on rider_absence_tap_results to anon;

insert into rider_absence_tap_results select has_table('public', 'rider_absence_requests', 'unified Rider absence request table exists');
insert into rider_absence_tap_results select has_table('public', 'rider_absence_request_audit_events', 'absence request audit table exists');
insert into rider_absence_tap_results select has_column('public', 'rider_absence_requests', 'request_kind', 'request kind is explicit');
insert into rider_absence_tap_results select has_column('public', 'rider_absence_requests', 'submitted_at', 'server submission timestamp exists');
insert into rider_absence_tap_results select has_column('public', 'rider_absence_requests', 'request_key', 'request idempotency key exists');
insert into rider_absence_tap_results select has_column('public', 'rider_absence_request_audit_events', 'old_values', 'absence audit stores before values');
insert into rider_absence_tap_results select has_column('public', 'rider_absence_request_audit_events', 'new_values', 'absence audit stores after values');
insert into rider_absence_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.rider_absence_requests'::regclass), 'absence requests have RLS enabled');
insert into rider_absence_tap_results select ok((select relrowsecurity from pg_class where oid = 'public.rider_absence_request_audit_events'::regclass), 'absence audit has RLS enabled');
insert into rider_absence_tap_results select ok(to_regprocedure('public.submit_rider_absence_request(public.rider_absence_request_kind,date,date,text,uuid)') is not null, 'submit absence request RPC exists');
insert into rider_absence_tap_results select ok(to_regprocedure('public.withdraw_rider_absence_request(uuid,integer,text)') is not null, 'withdraw absence request RPC exists');
insert into rider_absence_tap_results select ok(to_regprocedure('public.review_rider_absence_request(uuid,integer,text,text)') is not null, 'review absence request RPC exists');
insert into rider_absence_tap_results select ok(to_regprocedure('public.cancel_approved_rider_absence_request(uuid,integer,text)') is not null, 'cancel approved absence request RPC exists');
insert into rider_absence_tap_results select ok(to_regprocedure('public.list_rider_absence_requests(date,date,uuid,uuid,public.rider_absence_request_status,public.rider_absence_request_kind)') is not null, 'bounded absence request list RPC exists');
insert into rider_absence_tap_results select ok(to_regprocedure('public.get_rider_absence_request_detail(uuid)') is not null, 'absence request detail RPC exists');
insert into rider_absence_tap_results select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.submit_rider_absence_request(public.rider_absence_request_kind,date,date,text,uuid)'::regprocedure)) > 0,
  'submission RPC serializes requests per Rider'
);
insert into rider_absence_tap_results select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.review_rider_absence_request(uuid,integer,text,text)'::regprocedure)) > 0,
  'review RPC serializes against Rider submissions'
);
insert into rider_absence_tap_results select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.withdraw_rider_absence_request(uuid,integer,text)'::regprocedure)) > 0,
  'withdraw RPC serializes against Rider submissions'
);
insert into rider_absence_tap_results select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.cancel_approved_rider_absence_request(uuid,integer,text)'::regprocedure)) > 0,
  'cancel RPC serializes against Rider submissions'
);
insert into rider_absence_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_absence_requests', 'INSERT'), 'clients cannot insert absence requests directly');
insert into rider_absence_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_absence_requests', 'UPDATE'), 'clients cannot update absence requests directly');
insert into rider_absence_tap_results select ok(not has_table_privilege('authenticated', 'public.rider_absence_request_audit_events', 'DELETE'), 'clients cannot delete absence audit directly');

insert into public.hubs (id, name, latitude, longitude, attendance_radius_m) values
  ('a6000000-0000-4000-8000-000000000001', 'Absence Test Hub Alpha', 1, 1, 100),
  ('a6000000-0000-4000-8000-000000000002', 'Absence Test Hub Beta', 2, 2, 100);

insert into public.zones (id, hub_id, name, lat, lng, radius, color, status) values
  ('b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'Absence Zone Alpha', 1, 1, 100, '#111111', 'active'),
  ('b6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000002', 'Absence Zone Beta', 2, 2, 100, '#222222', 'active');

insert into public.riders (id, hub_id, zone_id, home_hub_id, home_zone_id, name, mkb_id, email, status) values
  ('c6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Absence Rider Alpha', 'TEST-ABS-A', 'absence-rider-a@example.test', 'active'),
  ('c6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000002', 'b6000000-0000-4000-8000-000000000002', 'Absence Rider Beta', 'TEST-ABS-B', 'absence-rider-b@example.test', 'active'),
  ('c6000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Absence Rider Archived', 'TEST-ABS-C', 'absence-rider-c@example.test', 'offline');

insert into auth.users (id, email, email_confirmed_at) values
  ('d6000000-0000-4000-8000-000000000001', 'absence-admin@example.test', clock_timestamp()),
  ('d6000000-0000-4000-8000-000000000002', 'absence-hr-alpha@example.test', clock_timestamp()),
  ('d6000000-0000-4000-8000-000000000003', 'absence-hr-beta@example.test', clock_timestamp()),
  ('d6000000-0000-4000-8000-000000000004', 'absence-payroll@example.test', clock_timestamp()),
  ('d6000000-0000-4000-8000-000000000005', 'absence-rider-a@example.test', clock_timestamp()),
  ('d6000000-0000-4000-8000-000000000006', 'absence-rider-b@example.test', clock_timestamp()),
  ('d6000000-0000-4000-8000-000000000007', 'absence-rider-c@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status) values
  ('d6000000-0000-4000-8000-000000000001', 'Absence Admin', 'absence-admin@example.test', 'admin', null, 'global', 'active', 'active'),
  ('d6000000-0000-4000-8000-000000000002', 'Absence HR Alpha', 'absence-hr-alpha@example.test', 'hr', null, 'assigned', 'active', 'active'),
  ('d6000000-0000-4000-8000-000000000003', 'Absence HR Beta', 'absence-hr-beta@example.test', 'hr', null, 'assigned', 'active', 'active'),
  ('d6000000-0000-4000-8000-000000000004', 'Absence Payroll', 'absence-payroll@example.test', 'payroll', null, 'global', 'active', 'active'),
  ('d6000000-0000-4000-8000-000000000005', 'Absence Rider Alpha', 'absence-rider-a@example.test', 'rider', 'c6000000-0000-4000-8000-000000000001', 'assigned', 'active', 'active'),
  ('d6000000-0000-4000-8000-000000000006', 'Absence Rider Beta', 'absence-rider-b@example.test', 'rider', 'c6000000-0000-4000-8000-000000000002', 'assigned', 'active', 'active');

insert into public.users (id, full_name, email, role, rider_id, hub_access_scope, status, employment_status, archive_effective_date, archive_reason, archived_at, archived_by) values
  ('d6000000-0000-4000-8000-000000000007', 'Absence Rider Archived', 'absence-rider-c@example.test', 'rider', 'c6000000-0000-4000-8000-000000000003', 'assigned', 'suspended', 'archived', (clock_timestamp() at time zone 'Asia/Manila')::date, 'Resigned', clock_timestamp(), 'd6000000-0000-4000-8000-000000000001');

insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('d6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001'),
  ('d6000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000001');

-- Rider submits planned leave. submitted_at is server-generated because the RPC
-- has no caller-controlled timestamp argument.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_absence_ids
select 'planned_leave', public.submit_rider_absence_request(
  'planned_leave',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 2,
  'Personal appointment',
  'e6000000-0000-4000-8000-000000000001'
);
insert into rider_absence_tap_results select is(
  (select status from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'pending'::public.rider_absence_request_status,
  'Rider planned leave starts pending'
);
insert into rider_absence_tap_results select is(
  (select request_kind from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'planned_leave'::public.rider_absence_request_kind,
  'planned leave request kind is stored'
);
insert into rider_absence_tap_results select ok(
  (select submitted_at <= clock_timestamp() and submitted_at >= created_at
   from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'submission timestamp comes from the server'
);
insert into rider_absence_tap_results select is(
  (select hub_id from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'a6000000-0000-4000-8000-000000000001'::uuid,
  'request stores the date-effective operational Hub'
);
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_request_audit_events where request_id = (select id from rider_absence_ids where name = 'planned_leave')),
  1::bigint,
  'submission writes one audit event'
);

reset role;
insert into rider_absence_replay_baseline
select request.id,
       request.submitted_at,
       (select count(*) from public.rider_absence_request_audit_events audit where audit.request_id = request.id),
       (select count(*) from public.notifications notification where notification.metadata ->> 'request_id' = request.id::text)
from public.rider_absence_requests request
where request.id = (select id from rider_absence_ids where name = 'planned_leave');
insert into rider_absence_tap_results select is(
  (select notification_count from rider_absence_replay_baseline),
  1::bigint,
  'one staff notification is written for the successful submission'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

-- Reusing the same key and payload is idempotent and must not duplicate the
-- request or its submit notification.
select public.submit_rider_absence_request(
  'planned_leave',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 2,
  'Personal appointment',
  'e6000000-0000-4000-8000-000000000001'
);
reset role;
insert into rider_absence_tap_results select is(
  (select id from rider_absence_requests where request_key = 'e6000000-0000-4000-8000-000000000001'),
  (select request_id from rider_absence_replay_baseline),
  'same request key preserves the request ID'
);
insert into rider_absence_tap_results select is(
  (select submitted_at from rider_absence_requests where request_key = 'e6000000-0000-4000-8000-000000000001'),
  (select submitted_at from rider_absence_replay_baseline),
  'same request key preserves the original server receipt timestamp'
);
insert into rider_absence_tap_results select is(
  (select count(*) from rider_absence_request_audit_events where request_id = (select request_id from rider_absence_replay_baseline)),
  (select audit_count from rider_absence_replay_baseline),
  'same request key does not duplicate audit history'
);
insert into rider_absence_tap_results select is(
  (select count(*) from notifications where metadata ->> 'request_id' = (select request_id from rider_absence_replay_baseline)::text),
  (select notification_count from rider_absence_replay_baseline),
  'same request key does not duplicate notifications'
);
insert into rider_absence_tap_results select ok(
  not exists (
    select 1
    from public.notifications notification
    where notification.metadata ->> 'request_id' = (select request_id from rider_absence_replay_baseline)::text
      and (
        notification.message ilike '%Personal appointment%'
        or notification.metadata::text ilike '%Personal appointment%'
      )
  ),
  'request reasons are absent from notification text and metadata'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_requests where request_key = 'e6000000-0000-4000-8000-000000000001'),
  1::bigint,
  'duplicate request key returns the existing request'
);

-- Cross-kind overlap is allowed while both requests are pending.
insert into rider_absence_ids
select 'absence_notice', public.submit_rider_absence_request(
  'absence_notice',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 1,
  'Unexpected inability to report',
  'e6000000-0000-4000-8000-000000000002'
);
insert into rider_absence_tap_results select is(
  (select request_kind from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'absence_notice')),
  'absence_notice'::public.rider_absence_request_kind,
  'absence notice kind is stored separately from planned leave'
);
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
insert into rider_absence_ids
select 'beta_notice', public.submit_rider_absence_request(
  'absence_notice',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 3,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 3,
  'Beta Hub notice',
  'e6000000-0000-4000-8000-000000000008'
);
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.submit_rider_absence_request('absence_notice',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,(clock_timestamp() at time zone 'Asia/Manila')::date + 1,'Duplicate notice','e6000000-0000-4000-8000-000000000003')$$,
  '23505', null, 'duplicate active notice for the same Rider/date is rejected'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.submit_rider_absence_request('absence_notice',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'Multi-day notice','e6000000-0000-4000-8000-000000000004')$$,
  '22023', null, 'absence notice must be for one business date'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.submit_rider_absence_request('planned_leave',(clock_timestamp() at time zone 'Asia/Manila')::date + 3,(clock_timestamp() at time zone 'Asia/Manila')::date + 2,'Reversed leave','e6000000-0000-4000-8000-000000000005')$$,
  '22023', null, 'planned leave requires ordered dates'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.submit_rider_absence_request('planned_leave',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,(clock_timestamp() at time zone 'Asia/Manila')::date + 1,'Overlapping leave','e6000000-0000-4000-8000-000000000009')$$,
  '23505', null, 'overlapping active planned leave is rejected'
);

-- Rider can read own private requests but cannot read or review another Rider.
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_requests where submitted_by = 'd6000000-0000-4000-8000-000000000005'),
  2::bigint,
  'Rider can read own request history'
);
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_requests where rider_id = 'c6000000-0000-4000-8000-000000000002'),
  0::bigint,
  'Rider cannot read another Rider request'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'absence_notice'),1,'approved','Forged Rider review')$$,
  '42501', null, 'Rider cannot review an absence request'
);
insert into rider_absence_tap_results select throws_ok(
  $$insert into public.rider_absence_requests (rider_id,request_kind,start_date,end_date,hub_id,reason,submitted_by,updated_by) values ('c6000000-0000-4000-8000-000000000002','planned_leave',(clock_timestamp() at time zone 'Asia/Manila')::date + 3,(clock_timestamp() at time zone 'Asia/Manila')::date + 3,'a6000000-0000-4000-8000-000000000002','Direct insert','d6000000-0000-4000-8000-000000000005','d6000000-0000-4000-8000-000000000005')$$,
  '42501', null, 'Rider cannot insert another request directly'
);

-- HR can review only requests in an authorized Hub.
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.review_rider_absence_request((select id from rider_absence_ids where name = 'planned_leave'),1,'approved','Leave approved for review');
select public.review_rider_absence_request((select id from rider_absence_ids where name = 'absence_notice'),1,'approved','Notice accepted for review');
insert into rider_absence_tap_results select is(
  (select status from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'approved'::public.rider_absence_request_status,
  'authorized HR can approve a pending request'
);
insert into rider_absence_tap_results select is(
  (select revision from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  2,
  'review advances the request revision'
);
insert into rider_absence_tap_results select is(
  (select status from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'absence_notice')),
  'approved'::public.rider_absence_request_status,
  'an accepted Absence Notice uses the approved request state'
);
insert into rider_absence_tap_results select ok(
  (select reviewed_by = 'd6000000-0000-4000-8000-000000000002' and review_reason = 'Leave approved for review'
   from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'review stores the server-derived reviewer and reason'
);
reset role;
insert into rider_absence_tap_results select is(
  (select count(*) from public.notifications
   where metadata ->> 'request_id' = (select id from rider_absence_ids where name = 'planned_leave')::text
     and metadata ->> 'event' = 'approved'),
  1::bigint,
  'one Rider notification is written for the successful approval'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'beta_notice'),1,'approved','Wrong Hub HR review')$$,
  '42501', null, 'HR cannot review a request outside the authorized Hub'
);
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_requests where hub_id = 'a6000000-0000-4000-8000-000000000001'),
  0::bigint,
  'HR cannot read another Hub request'
);
select public.review_rider_absence_request((select id from rider_absence_ids where name = 'beta_notice'),1,'approved','Beta notice accepted');
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request('ffffffff-ffff-4fff-8fff-ffffffffffff',1,'approved','Unknown HR review')$$,
  '42501',
  'You are not authorized to manage this Leave & Absence request.',
  'HR receives the same inaccessible response for an unknown review target'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'beta_notice'),1,'approved','Out of Hub HR review')$$,
  '42501',
  'You are not authorized to manage this Leave & Absence request.',
  'HR receives the same inaccessible response for an out-of-Hub review target'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.get_rider_absence_request_detail('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  '42501',
  'You are not authorized to read this Leave & Absence request.',
  'HR receives the same inaccessible response for an unknown detail target'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.get_rider_absence_request_detail((select id from rider_absence_ids where name = 'beta_notice'))$$,
  '42501',
  'You are not authorized to read this Leave & Absence request.',
  'HR receives the same inaccessible response for an out-of-Hub detail target'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.cancel_approved_rider_absence_request((select id from rider_absence_ids where name = 'beta_notice'),2,'Out of Hub HR cancellation')$$,
  '42501',
  'You are not authorized to manage this Leave & Absence request.',
  'HR receives the same inaccessible response for an out-of-Hub cancellation target'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.cancel_approved_rider_absence_request('ffffffff-ffff-4fff-8fff-ffffffffffff',1,'Unknown HR cancellation')$$,
  '42501',
  'You are not authorized to manage this Leave & Absence request.',
  'HR receives the same inaccessible response for an unknown cancellation target'
);

-- A pending Alpha request remains governed by its stored Hub after the Rider
-- transfers to Beta. Approval keeps strict current assignment validation;
-- rejection remains an authorized historical decision.
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_absence_ids
select 'cross_hub', public.submit_rider_absence_request(
  'planned_leave',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 9,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 9,
  'Cross Hub review case',
  'e6000000-0000-4000-8000-000000000009'
);
insert into rider_absence_ids
select 'admin_case', public.submit_rider_absence_request(
  'planned_leave',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 10,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 10,
  'Admin global review case',
  'e6000000-0000-4000-8000-000000000010'
);
reset role;
insert into public.rider_assignments (
  id, rider_id, assignment_type, from_hub_id, from_zone_id,
  target_hub_id, target_zone_id, start_date, status, reason, created_by
) values (
  'f6000000-0000-4000-8000-000000000001',
  'c6000000-0000-4000-8000-000000000001',
  'permanent_transfer',
  'a6000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000002',
  'b6000000-0000-4000-8000-000000000002',
  (clock_timestamp() at time zone 'Asia/Manila')::date,
  'completed',
  'Transfer for cross Hub test',
  'd6000000-0000-4000-8000-000000000001'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'cross_hub'),1,'approved','Beta HR approval attempt')$$,
  '42501', null, 'Hub B HR cannot manage the stored Hub A request'
);
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'cross_hub'),1,'approved','Alpha HR approval after transfer')$$,
  '23514', null, 'Hub A HR cannot approve after the assignment boundary changed'
);
select public.review_rider_absence_request((select id from rider_absence_ids where name = 'cross_hub'),1,'rejected','Alpha HR rejection after transfer');
insert into rider_absence_tap_results select is(
  (select status from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'cross_hub')),
  'rejected'::public.rider_absence_request_status,
  'Hub A HR can reject a pending historical request after transfer'
);
insert into rider_absence_tap_results select is(
  (select revision from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'cross_hub')),
  2,
  'cross Hub rejection advances the request revision'
);
insert into rider_absence_tap_results select is(
  (select action from public.rider_absence_request_audit_events where request_id = (select id from rider_absence_ids where name = 'cross_hub') order by revision desc limit 1),
  'rejected',
  'cross Hub rejection writes a rejected audit event'
);
reset role;
insert into rider_absence_tap_results select is(
  (select count(*) from public.notifications
   where metadata ->> 'request_id' = (select id from rider_absence_ids where name = 'cross_hub')::text
     and metadata ->> 'event' = 'rejected'),
  1::bigint,
  'cross Hub rejection writes the normal Rider notification'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.review_rider_absence_request((select id from rider_absence_ids where name = 'admin_case'),1,'rejected','Admin global rejection after transfer');
insert into rider_absence_tap_results select is(
  (select reviewed_by from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'admin_case')),
  'd6000000-0000-4000-8000-000000000001'::uuid,
  'Admin retains global authority over the stored Hub request'
);

select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.list_rider_absence_requests((clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 7,null,null,null,null)$$,
  '42501', null, 'Payroll has no request access by default'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.list_rider_absence_requests((clock_timestamp() at time zone 'Asia/Manila')::date,(clock_timestamp() at time zone 'Asia/Manila')::date + 7,null,null,null,null)$$,
  '42501', null, 'Anonymous users cannot read requests'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- A pending request can be withdrawn by its submitting Rider and cannot later
-- be reviewed. Approved requests can be cancelled by authorized HR.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_absence_ids
select 'withdrawn', public.submit_rider_absence_request(
  'planned_leave',
  (clock_timestamp() at time zone 'Asia/Manila')::date + 6,
  (clock_timestamp() at time zone 'Asia/Manila')::date + 6,
  'Withdraw test',
  'e6000000-0000-4000-8000-000000000006'
);
select public.withdraw_rider_absence_request((select id from rider_absence_ids where name = 'withdrawn'),1,'Plans changed');
insert into rider_absence_tap_results select is(
  (select status from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'withdrawn')),
  'withdrawn'::public.rider_absence_request_status,
  'Rider can withdraw a pending request'
);
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'withdrawn'),2,'approved','Too late')$$,
  '23514', null, 'withdrawn request cannot be reviewed'
);
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.cancel_approved_rider_absence_request((select id from rider_absence_ids where name = 'planned_leave'),2,'Approved leave withdrawn by HR');
insert into rider_absence_tap_results select is(
  (select status from public.rider_absence_requests where id = (select id from rider_absence_ids where name = 'planned_leave')),
  'cancelled'::public.rider_absence_request_status,
  'authorized HR can cancel an approved request'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.cancel_approved_rider_absence_request((select id from rider_absence_ids where name = 'planned_leave'),2,'Duplicate cancel')$$,
  '23514', null, 'cancelled request cannot be cancelled twice'
);

select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.cancel_approved_rider_absence_request((select id from rider_absence_ids where name = 'planned_leave'),3,'Payroll probe')$$,
  '42501', null, 'unauthorized Payroll cannot learn a request terminal state'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.get_rider_absence_request_detail('ffffffff-ffff-4fff-8fff-ffffffffffff')$$,
  '42501', null, 'unauthorized Payroll receives an inaccessible response for an unknown request'
);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request('ffffffff-ffff-4fff-8fff-ffffffffffff',1,'approved','Payroll probe')$$,
  '42501', null, 'unauthorized Payroll receives an inaccessible response before review lookup'
);

-- Stale revision and immutable audit protections.
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.review_rider_absence_request((select id from rider_absence_ids where name = 'absence_notice'),1,'rejected','Stale review')$$,
  '40001', null, 'stale review revision is rejected'
);
reset role;
select set_config('request.jwt.claims', '', true);
insert into rider_absence_tap_results select throws_ok(
  $$update public.rider_absence_request_audit_events set reason = 'tampered' where request_id = (select id from rider_absence_ids where name = 'planned_leave')$$,
  '42501', null, 'absence audit history is immutable'
);

-- Archived employment cannot submit a request.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
insert into rider_absence_tap_results select throws_ok(
  $$select public.submit_rider_absence_request('planned_leave',(clock_timestamp() at time zone 'Asia/Manila')::date + 1,(clock_timestamp() at time zone 'Asia/Manila')::date + 1,'Archived attempt','e6000000-0000-4000-8000-000000000007')$$,
  '42501', null, 'archived Rider cannot submit a request'
);

-- A role change cannot preserve private Rider rows through an old rider_id link.
reset role;
update public.users
set role = 'payroll'::public.user_role
where id = 'd6000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d6000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_requests where rider_id = 'c6000000-0000-4000-8000-000000000001'),
  0::bigint,
  'former Rider account cannot read private requests after role changes'
);
insert into rider_absence_tap_results select is(
  (select count(*) from public.rider_absence_request_audit_events where rider_id = 'c6000000-0000-4000-8000-000000000001'),
  0::bigint,
  'former Rider account cannot read private audit history after role changes'
);

reset role;
select set_config('request.jwt.claims', '', true);
insert into rider_absence_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from rider_absence_tap_results;
rollback;
