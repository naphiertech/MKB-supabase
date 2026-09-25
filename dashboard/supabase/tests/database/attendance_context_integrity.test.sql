begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select pg_advisory_xact_lock(hashtext('rider_attendance_context_integrity_test'));
select no_plan();

-- Migration-only CI databases have no application user seed. Create the
-- context actors and Rider used by this test before constructing ctx.
insert into public.hubs(id,name,latitude,longitude,attendance_radius_m)
values ('a7400000-0000-4000-8000-000000000002','Context Base Hub',3,3,100);
insert into public.riders(id,hub_id,home_hub_id,name,mkb_id,email,status)
values ('c7400000-0000-4000-8000-000000000002','a7400000-0000-4000-8000-000000000002',
  'a7400000-0000-4000-8000-000000000002','Context Base Rider','CTX-BASE','ctx-base-rider@example.test','active');
insert into auth.users(id,email,email_confirmed_at) values
  ('d7400000-0000-4000-8000-000000000002','ctx-admin@example.test',clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000003','ctx-hr-base@example.test',clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000004','ctx-payroll@example.test',clock_timestamp()),
  ('d7400000-0000-4000-8000-000000000005','ctx-base-rider@example.test',clock_timestamp());
insert into public.users(id,full_name,email,role,rider_id,hub_access_scope,status,employment_status) values
  ('d7400000-0000-4000-8000-000000000002','Context Admin','ctx-admin@example.test','admin',null,'global','active','active'),
  ('d7400000-0000-4000-8000-000000000003','Context Base HR','ctx-hr-base@example.test','hr',null,'assigned','active','active'),
  ('d7400000-0000-4000-8000-000000000004','Context Payroll','ctx-payroll@example.test','payroll',null,'global','active','active'),
  ('d7400000-0000-4000-8000-000000000005','Context Base Rider','ctx-base-rider@example.test','rider',
   'c7400000-0000-4000-8000-000000000002','assigned','active','active');

create temporary table ctx as
select 'c7400000-0000-4000-8000-000000000002'::uuid rider_id,
       'a7400000-0000-4000-8000-000000000002'::uuid hub_id,
       'd7400000-0000-4000-8000-000000000005'::uuid rider_user,
       'd7400000-0000-4000-8000-000000000003'::uuid hr_user,
       'd7400000-0000-4000-8000-000000000002'::uuid admin_user,
       'd7400000-0000-4000-8000-000000000004'::uuid payroll_user,
       'c7400000-0000-4000-8000-000000000001'::uuid other_rider,
       (clock_timestamp() at time zone 'Asia/Manila')::date-1000 base_date
;
grant select on ctx to authenticated, anon;

-- Dedicated assigned-Hub HR and out-of-Hub Rider: do not use global HR
-- or an unknown UUID as the only cross-Hub security evidence.
insert into public.hubs(id,name,latitude,longitude,attendance_radius_m)
values ('a7400000-0000-4000-8000-000000000001','Context Other Hub',1,1,100);
insert into public.riders(id,hub_id,home_hub_id,name,mkb_id,email,status)
values ('c7400000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000001','a7400000-0000-4000-8000-000000000001','Context Other Rider','CTX-OTHER','ctx-other@example.test','active');
insert into auth.users(id,email,email_confirmed_at)
values ('d7400000-0000-4000-8000-000000000001','ctx-hr@example.test',clock_timestamp());
insert into public.users(id,full_name,email,role,hub_access_scope,status,employment_status)
values ('d7400000-0000-4000-8000-000000000001','Context Assigned HR','ctx-hr@example.test','hr','assigned','active','active');
insert into public.user_hub_access(user_id,hub_id,assigned_by)
select 'd7400000-0000-4000-8000-000000000001',hub_id,admin_user from ctx;
update ctx set hr_user='d7400000-0000-4000-8000-000000000001',other_rider='c7400000-0000-4000-8000-000000000001';


select ok(to_regprocedure('private.resolve_rider_attendance_context(uuid,date,timestamp with time zone)') is not null,'resolver exists');
select ok(to_regprocedure('public.list_rider_attendance_context(date,date,uuid,uuid,integer,integer)') is not null,'bounded API exists');
select ok((select prosecdef from pg_proc where oid='private.resolve_rider_attendance_context(uuid,date,timestamp with time zone)'::regprocedure),'resolver is SECURITY DEFINER');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='private.resolve_rider_attendance_context(uuid,date,timestamp with time zone)'::regprocedure),'resolver has empty search_path');
select ok(not has_function_privilege('authenticated','private.resolve_rider_attendance_context(uuid,date,timestamp with time zone)','EXECUTE'),'resolver is private');
select ok(has_function_privilege('authenticated','public.list_rider_attendance_context(date,date,uuid,uuid,integer,integer)','EXECUTE'),'authenticated can execute API');
select ok(not has_function_privilege('anon','public.list_rider_attendance_context(date,date,uuid,uuid,integer,integer)','EXECUTE'),'anon cannot execute API');
select ok(position('rider_absence' in pg_get_functiondef('public.finalize_daily_attendance()'::regprocedure))=0,'finalizer remains independent');

do $$declare b date:=(select base_date from ctx);x record;ca timestamptz;begin
 for x in select * from (values
  (1,'day_off','published'),(2,'work','published'),(3,'day_off','draft'),(4,'day_off','cancelled'))v(o,k,s) loop
  insert into public.rider_schedules(id,rider_id,work_date,hub_id,day_kind,status,revision,starts_at,ends_at,created_by,updated_by,published_by,published_at,cancelled_by,cancelled_at,cancellation_reason)
  values(('a7100000-0000-4000-8000-'||lpad(x.o::text,12,'0'))::uuid,(select rider_id from ctx),b+x.o,(select hub_id from ctx),x.k::public.rider_schedule_day_kind,x.s::public.rider_schedule_status,case when x.s='cancelled' then 3 else 2 end,case when x.k='work' then time '08:00' end,case when x.k='work' then time '17:00' end,(select admin_user from ctx),(select admin_user from ctx),case when x.s in('published','cancelled') then (select admin_user from ctx) end,case when x.s in('published','cancelled') then clock_timestamp() end,case when x.s='cancelled' then (select admin_user from ctx) end,case when x.s='cancelled' then clock_timestamp() end,case when x.s='cancelled' then 'cancelled schedule' end);
 end loop;end$$;

do $$declare b date:=(select base_date from ctx);x record;ca timestamptz;begin
 for x in select * from (values
  (1,'planned_leave',5,5,'approved',null::int,0),(2,'planned_leave',6,6,'approved',null::int,0),(3,'planned_leave',7,7,'rejected',null::int,0),(4,'planned_leave',8,8,'pending',null::int,0),(5,'planned_leave',9,9,'withdrawn',null::int,0),(6,'planned_leave',10,14,'cancelled',12,0),(7,'planned_leave',16,17,'cancelled',15,0),(8,'planned_leave',1,1,'approved',null::int,0),(9,'planned_leave',3,3,'rejected',null::int,0),
  (10,'absence_notice',18,18,'approved',null::int,0),(11,'absence_notice',19,19,'rejected',null::int,0),(12,'absence_notice',20,20,'pending',null::int,0),(13,'absence_notice',21,21,'withdrawn',null::int,0),(14,'absence_notice',22,22,'cancelled',21,0),(15,'absence_notice',23,23,'cancelled',23,0),(16,'planned_leave',24,24,'approved',null::int,0),(17,'absence_notice',24,24,'approved',null::int,0),(18,'planned_leave',25,25,'rejected',null::int,-2),(19,'planned_leave',25,25,'pending',null::int,0),(20,'planned_leave',26,26,'withdrawn',null::int,-2),(21,'planned_leave',26,26,'approved',null::int,0),(22,'absence_notice',27,27,'approved',null::int,0),(23,'planned_leave',28,28,'approved',null::int,0),(24,'absence_notice',29,29,'approved',null::int,0),(25,'absence_notice',32,32,'cancelled',33,0)
 )v(i,k,s,e,st,co,sub) loop
  ca:=case when x.co is null then null else ((b+x.co)::timestamp+time '11:00') at time zone 'Asia/Manila' end;
  insert into public.rider_absence_requests(id,rider_id,request_kind,start_date,end_date,hub_id,reason,submitted_by,submitted_at,status,revision,reviewed_by,reviewed_at,review_reason,withdrawn_by,withdrawn_at,withdrawal_reason,cancelled_by,cancelled_at,cancellation_reason,request_key,updated_by)
  values(('a7200000-0000-4000-8000-'||lpad(x.i::text,12,'0'))::uuid,(select rider_id from ctx),x.k::public.rider_absence_request_kind,b+x.s,b+x.e,(select hub_id from ctx),'private reason',(select rider_user from ctx),clock_timestamp()+make_interval(days=>x.sub),x.st::public.rider_absence_request_status,case when x.st in('pending','withdrawn') then 1 else 2 end,case when x.st in('approved','rejected','cancelled') then (select hr_user from ctx) end,case when x.st in('approved','rejected','cancelled') then clock_timestamp() end,case when x.st in('approved','rejected','cancelled') then 'private review note' end,case when x.st='withdrawn' then (select rider_user from ctx) end,case when x.st='withdrawn' then clock_timestamp() end,case when x.st='withdrawn' then 'private withdrawal note' end,case when x.st='cancelled' then (select hr_user from ctx) end,ca,case when x.st='cancelled' then 'private cancellation note' end,gen_random_uuid(),(select hr_user from ctx));
 end loop;end$$;

do $$declare b date:=(select base_date from ctx);x record;begin
 for x in select * from (values(1,null::time,null::time,'absent','system'),(2,null::time,null::time,'absent','system'),(3,time '08:00',null::time,'present','face-scan'),(4,null::time,null::time,'absent','system'),(5,null::time,null::time,'absent','system'),(6,time '08:00',time '17:00','present','face-scan'),(7,time '09:00',null::time,'present','face-scan'),(8,null::time,null::time,'on_leave','manual'),(9,null::time,null::time,'absent','system'),(10,null::time,null::time,'absent','system'))v(o,ti,to_,st,src) loop
  insert into public.attendance_logs(id,rider_id,date,time_in,time_out,status,source,notes) values(('a7300000-0000-4000-8000-'||lpad(x.o::text,12,'0'))::uuid,(select rider_id from ctx),b+(case x.o when 1 then 1 when 2 then 6 when 3 then 7 when 4 then 18 when 5 then 27 when 6 then 28 when 7 then 29 when 8 then 30 when 9 then 31 else 32 end),case when x.ti is null then null else ((b+(case x.o when 1 then 1 when 2 then 6 when 3 then 7 when 4 then 18 when 5 then 27 when 6 then 28 when 7 then 29 when 8 then 30 when 9 then 31 else 32 end))::timestamp+x.ti) at time zone 'Asia/Manila' end,case when x.to_ is null then null else ((b+(case x.o when 1 then 1 when 2 then 6 when 3 then 7 when 4 then 18 when 5 then 27 when 6 then 28 when 7 then 29 when 8 then 30 when 9 then 31 else 32 end))::timestamp+x.to_) at time zone 'Asia/Manila' end,x.st::public.attendance_status,x.src::public.attendance_source,'raw fixture');
 end loop;end$$;

-- Keep setup data in a fixture table and run each pgTAP assertion as a
-- top-level SELECT so every assertion produces a TAP line.
create temporary table context_cases(label text,day_offset integer,expected_status text,
  expected_context text,expected_to_work boolean,expected_excusal text,moment_offset integer,moment_time time);
insert into context_cases values
  ('approved',5,'on_leave','approved_leave',true,'excused',null,null),
  ('approved after raw',6,'on_leave','approved_leave',true,'excused',null,null),
  ('rejected with clock',7,'present','leave_rejected',true,'not_applicable',null,null),
  ('pending leave',8,'absent','leave_pending',true,'not_excused',null,null),
  ('withdrawn leave',9,'absent','leave_withdrawn',true,'not_excused',null,null),
  ('cancel first',10,'on_leave','approved_leave',true,'excused',null,null),
  ('cancel date',12,'on_leave','approved_leave',true,'excused',null,null),
  ('cancel next',13,'absent','leave_cancelled',true,'not_excused',null,null),
  ('cancel before start',16,'absent','leave_cancelled',true,'not_excused',null,null),
  ('accepted',18,'absent','accepted_notice',true,'excused',null,null),
  ('rejected notice',19,'absent','notice_rejected',true,'not_excused',null,null),
  ('pending notice',20,'absent','notice_pending',true,'not_excused',null,null),
  ('withdrawn notice',21,'absent','notice_withdrawn',true,'not_excused',null,null),
  ('notice before',22,'absent','notice_cancelled',true,'not_excused',null,null),
  ('notice on',23,'absent','accepted_notice',true,'excused',null,null),
  ('notice after',32,'absent','accepted_notice',true,'excused',null,null),
  ('mixed',24,'on_leave','approved_leave',true,'excused',null,null),
  ('new pending',25,'absent','leave_pending',true,'not_excused',null,null),
  ('new approved',26,'on_leave','approved_leave',true,'excused',null,null),
  ('worked leave',28,'present','worked_during_approved_leave',true,'not_applicable',null,null),
  ('worked notice',29,'late','worked_despite_accepted_notice',true,'not_applicable',null,null),
  ('legacy',30,'on_leave','manual_legacy_on_leave',true,'not_applicable',null,null),
  ('day off',1,'day_off','approved_leave',false,'not_applicable',null,null),
  ('published work',2,'absent','no_notice',true,'not_excused',null,null),
  ('draft day off',3,'absent','leave_rejected',true,'not_excused',null,null),
  ('cancelled day off',4,'absent','no_notice',true,'not_excused',null,null),
  ('before cutoff',31,'not_finalized',null,true,'not_applicable',31,TIME '16:59:59'),
  ('at cutoff',31,'absent','no_notice',true,'not_excused',31,TIME '17:00'),
  ('after cutoff',31,'absent','no_notice',true,'not_excused',31,TIME '17:00:01'),
  ('cancel middle day',11,'on_leave','approved_leave',true,'excused',null,null);
select is(actual.effective_status,test.expected_status,test.label || ' status')
from context_cases test cross join ctx fixture
cross join lateral private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  case when test.moment_offset is null then clock_timestamp()
       else ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,time '18:00')) at time zone 'Asia/Manila' end
) actual
order by test.day_offset,test.label;
select is(actual.context_code,test.expected_context,test.label || ' context')
from context_cases test cross join ctx fixture
cross join lateral private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  case when test.moment_offset is null then clock_timestamp()
       else ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,time '18:00')) at time zone 'Asia/Manila' end
) actual
order by test.day_offset,test.label;
select is(actual.expected_to_work,test.expected_to_work,test.label || ' expected-to-work')
from context_cases test cross join ctx fixture
cross join lateral private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  case when test.moment_offset is null then clock_timestamp()
       else ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,time '18:00')) at time zone 'Asia/Manila' end
) actual
order by test.day_offset,test.label;
select is(actual.excusal_state,test.expected_excusal,test.label || ' excusal')
from context_cases test cross join ctx fixture
cross join lateral private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  case when test.moment_offset is null then clock_timestamp()
       else ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,time '18:00')) at time zone 'Asia/Manila' end
) actual
order by test.day_offset,test.label;
select is((select raw_status from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+6)),'absent'::public.attendance_status,'raw status unchanged');
select is((select attendance_log_id from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+6)),'a7300000-0000-4000-8000-000000000002'::uuid,'raw ID unchanged');
select is((select absence_notice_state from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+24)),'approved'::public.rider_absence_request_status,'mixed state retained');
select is((select context_request_id from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+30)),null::uuid,'legacy leave has no request provenance');

-- Date-edge and true review transitions; reads never mutate raw evidence.
-- Preserve and emit all dynamic request-transition/cutoff scenarios as top-level TAP.
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal,moment_offset,moment_time) AS (
VALUES
  ('after cutoff',31,'absent','no_notice',true,'not_excused',31,TIME '17:00:01'),
  ('cancel middle day',11,'on_leave','approved_leave',true,'excused',null,null),
  ('cancel last day',14,'absent','leave_cancelled',true,'not_excused',null,null),
  ('pending then approved',8,'on_leave','approved_leave',true,'excused',null,null),
  ('pending then accepted',20,'absent','accepted_notice',true,'excused',null,null),
  ('pending then rejected',25,'absent','leave_rejected',true,'not_excused',null,null),
  ('raw present without clocks',31,'absent','no_notice',true,'not_excused',null,null)
)
SELECT is(actual.effective_status,test.expected_status,test.label || ' status')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  CASE WHEN test.moment_offset IS NULL THEN clock_timestamp()
       ELSE ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,TIME '18:00')) AT TIME ZONE 'Asia/Manila' END
) actual
ORDER BY test.day_offset,test.label;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal,moment_offset,moment_time) AS (
VALUES
  ('after cutoff',31,'absent','no_notice',true,'not_excused',31,TIME '17:00:01'),
  ('cancel middle day',11,'on_leave','approved_leave',true,'excused',null,null),
  ('cancel last day',14,'absent','leave_cancelled',true,'not_excused',null,null),
  ('pending then approved',8,'on_leave','approved_leave',true,'excused',null,null),
  ('pending then accepted',20,'absent','accepted_notice',true,'excused',null,null),
  ('pending then rejected',25,'absent','leave_rejected',true,'not_excused',null,null),
  ('raw present without clocks',31,'absent','no_notice',true,'not_excused',null,null)
)
SELECT is(actual.context_code,test.expected_context,test.label || ' context')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  CASE WHEN test.moment_offset IS NULL THEN clock_timestamp()
       ELSE ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,TIME '18:00')) AT TIME ZONE 'Asia/Manila' END
) actual
ORDER BY test.day_offset,test.label;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal,moment_offset,moment_time) AS (
VALUES
  ('after cutoff',31,'absent','no_notice',true,'not_excused',31,TIME '17:00:01'),
  ('cancel middle day',11,'on_leave','approved_leave',true,'excused',null,null),
  ('cancel last day',14,'absent','leave_cancelled',true,'not_excused',null,null),
  ('pending then approved',8,'on_leave','approved_leave',true,'excused',null,null),
  ('pending then accepted',20,'absent','accepted_notice',true,'excused',null,null),
  ('pending then rejected',25,'absent','leave_rejected',true,'not_excused',null,null),
  ('raw present without clocks',31,'absent','no_notice',true,'not_excused',null,null)
)
SELECT is(actual.expected_to_work,test.expected_to_work,test.label || ' expected-to-work')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  CASE WHEN test.moment_offset IS NULL THEN clock_timestamp()
       ELSE ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,TIME '18:00')) AT TIME ZONE 'Asia/Manila' END
) actual
ORDER BY test.day_offset,test.label;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal,moment_offset,moment_time) AS (
VALUES
  ('after cutoff',31,'absent','no_notice',true,'not_excused',31,TIME '17:00:01'),
  ('cancel middle day',11,'on_leave','approved_leave',true,'excused',null,null),
  ('cancel last day',14,'absent','leave_cancelled',true,'not_excused',null,null),
  ('pending then approved',8,'on_leave','approved_leave',true,'excused',null,null),
  ('pending then accepted',20,'absent','accepted_notice',true,'excused',null,null),
  ('pending then rejected',25,'absent','leave_rejected',true,'not_excused',null,null),
  ('raw present without clocks',31,'absent','no_notice',true,'not_excused',null,null)
)
SELECT is(actual.excusal_state,test.expected_excusal,test.label || ' excusal')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,
  CASE WHEN test.moment_offset IS NULL THEN clock_timestamp()
       ELSE ((fixture.base_date+test.moment_offset)::timestamp + coalesce(test.moment_time,TIME '18:00')) AT TIME ZONE 'Asia/Manila' END
) actual
ORDER BY test.day_offset,test.label;
select is((select completion_state from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+28)),'complete','clocks preserve completion');
select is((select completion_state from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+29)),'missing_time_out','open historical clock preserves missing timeout');
select set_config('request.jwt.claims',json_build_object('sub',(select admin_user from ctx),'role','authenticated')::text,true);
select public.review_rider_absence_request('a7200000-0000-4000-8000-000000000004',1,'approved','approve pending leave');
select public.review_rider_absence_request('a7200000-0000-4000-8000-000000000012',1,'approved','accept pending notice');
select public.review_rider_absence_request('a7200000-0000-4000-8000-000000000019',1,'rejected','reject pending leave');
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('pending then approved',8,'on_leave','approved_leave',true,'excused'),
         ('pending then accepted',20,'absent','accepted_notice',true,'excused'),
         ('pending then rejected',25,'absent','leave_rejected',true,'not_excused')
)
SELECT is(actual.effective_status,test.expected_status,test.label || ' status')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()
) actual
ORDER BY test.day_offset,test.label;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('pending then approved',8,'on_leave','approved_leave',true,'excused'),
         ('pending then accepted',20,'absent','accepted_notice',true,'excused'),
         ('pending then rejected',25,'absent','leave_rejected',true,'not_excused')
)
SELECT is(actual.context_code,test.expected_context,test.label || ' context')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()
) actual
ORDER BY test.day_offset,test.label;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('pending then approved',8,'on_leave','approved_leave',true,'excused'),
         ('pending then accepted',20,'absent','accepted_notice',true,'excused'),
         ('pending then rejected',25,'absent','leave_rejected',true,'not_excused')
)
SELECT is(actual.expected_to_work,test.expected_to_work,test.label || ' expected-to-work')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()
) actual
ORDER BY test.day_offset,test.label;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('pending then approved',8,'on_leave','approved_leave',true,'excused'),
         ('pending then accepted',20,'absent','accepted_notice',true,'excused'),
         ('pending then rejected',25,'absent','leave_rejected',true,'not_excused')
)
SELECT is(actual.excusal_state,test.expected_excusal,test.label || ' excusal')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(
  fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()
) actual
ORDER BY test.day_offset,test.label;
select set_config('request.jwt.claims','{}',true);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_user from ctx),'role','authenticated')::text,true);
select ok(exists(select 1 from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select rider_id from ctx),500,0)),'Admin reads context');
select is((select effective_status from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select rider_id from ctx),500,0) where business_date=(select base_date from ctx)+31),'absent','API returns finalized no notice');
select is((select attendance_log_id from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select rider_id from ctx),500,0) where business_date=(select base_date from ctx)+15),null::uuid,'API keeps logical row ID null');
select ok(not exists(select 1 from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select rider_id from ctx),500,0)x where to_jsonb(x)::text ilike '%reason%' or to_jsonb(x)::text ilike '%review%' or to_jsonb(x)::text ilike '%audit%'),'API omits private fields');
select throws_ok($$select count(*) from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+32,null,null,500,0)$$,'22023',null,'API range bounded');
select set_config('request.jwt.claims',json_build_object('sub',(select hr_user from ctx),'role','authenticated')::text,true);
select ok(exists(select 1 from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,(select hub_id from ctx),(select rider_id from ctx),500,0)),'HR reads authorized Hub');
select is((select count(*) from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select other_rider from ctx),500,0)),0::bigint,'HR cannot read another Hub');
select set_config('request.jwt.claims',json_build_object('sub',(select rider_user from ctx),'role','authenticated')::text,true);
select ok(exists(select 1 from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select rider_id from ctx),500,0)),'Rider reads own context');
select throws_ok($$select count(*) from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx)+31,null,(select other_rider from ctx),500,0)$$,'42501',null,'Rider cannot read another context');
select set_config('request.jwt.claims',json_build_object('sub',(select payroll_user from ctx),'role','authenticated')::text,true);
select throws_ok($$select count(*) from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx),null,null,500,0)$$,'42501',null,'Payroll cannot read private context');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select count(*) from public.list_rider_attendance_context((select base_date from ctx),(select base_date from ctx),null,null,500,0)$$,'42501',null,'anonymous is denied');
reset role;
-- A raw label without a clock is not evidence that the Rider worked.
update public.attendance_logs set status='present' where id='a7300000-0000-4000-8000-000000000009';
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('raw present without clocks',31,'absent','no_notice',true,'not_excused')
)
SELECT is(actual.effective_status,test.expected_status,test.label || ' status')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()) actual;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('raw present without clocks',31,'absent','no_notice',true,'not_excused')
)
SELECT is(actual.context_code,test.expected_context,test.label || ' context')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()) actual;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('raw present without clocks',31,'absent','no_notice',true,'not_excused')
)
SELECT is(actual.expected_to_work,test.expected_to_work,test.label || ' expected-to-work')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()) actual;
WITH transition_cases(label,day_offset,expected_status,expected_context,expected_to_work,expected_excusal) AS (
  VALUES ('raw present without clocks',31,'absent','no_notice',true,'not_excused')
)
SELECT is(actual.excusal_state,test.expected_excusal,test.label || ' excusal')
FROM transition_cases test CROSS JOIN ctx fixture
CROSS JOIN LATERAL private.resolve_rider_attendance_context(fixture.rider_id,fixture.base_date+test.day_offset,clock_timestamp()) actual;
select is((select punctuality_state from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+31)),'none','no clock has no punctuality');
select is((select schedule_id from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+3)),null::uuid,'draft schedule provenance is not Attendance evidence');
select is((select schedule_id from private.resolve_rider_attendance_context((select rider_id from ctx),(select base_date from ctx)+4)),null::uuid,'cancelled schedule provenance is not Attendance evidence');
insert into public.rider_absence_requests(id,rider_id,request_kind,start_date,end_date,hub_id,reason,submitted_by,request_key,updated_by)
select 'a7200000-0000-4000-8000-000000000099',rider_id,'planned_leave',base_date+15,base_date+15,'a7400000-0000-4000-8000-000000000001','private other Hub reason',rider_user,gen_random_uuid(),rider_user from ctx;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select hr_user from ctx),'role','authenticated')::text,true);
select is((select count(*) from public.list_rider_attendance_context((select base_date from ctx)+15,(select base_date from ctx)+15,null,(select rider_id from ctx))),1::bigint,'request stored Hub does not replace Attendance date scope');
select is((select context_code from public.list_rider_attendance_context((select base_date from ctx)+15,(select base_date from ctx)+15,null,(select rider_id from ctx))),'leave_pending','hidden request remains safe communication classification, not No Notice');
select is((select planned_leave_request_id from public.list_rider_attendance_context((select base_date from ctx)+15,(select base_date from ctx)+15,null,(select rider_id from ctx))),null::uuid,'HR cannot read out-of-Hub request identity');
select is((select context_request_revision from public.list_rider_attendance_context((select base_date from ctx)+15,(select base_date from ctx)+15,null,(select rider_id from ctx))),null::integer,'HR cannot read out-of-Hub request revision');
reset role;
select * from finish();
rollback;
