begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('authenticated_core_access_contract_test'));
select no_plan();

create temporary table core_access_tap_results (result text not null);
grant insert on core_access_tap_results to anon, authenticated;

-- ============================================================================
-- 1. Table Privilege Audits (Least Privilege Verification)
-- ============================================================================

-- anon denied
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'SELECT'), 'anon cannot select from public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'UPDATE'), 'anon cannot update public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'INSERT'), 'anon cannot insert into public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'DELETE'), 'anon cannot delete from public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'TRUNCATE'), 'anon cannot truncate public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'REFERENCES'), 'anon cannot reference public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'TRIGGER'), 'anon cannot create trigger on public.users');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.users', 'MAINTAIN'), 'anon cannot maintain public.users');

insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'SELECT'), 'anon cannot select from public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'UPDATE'), 'anon cannot update public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'INSERT'), 'anon cannot insert into public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'DELETE'), 'anon cannot delete from public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'TRUNCATE'), 'anon cannot truncate public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'REFERENCES'), 'anon cannot reference public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'TRIGGER'), 'anon cannot create trigger on public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.riders', 'MAINTAIN'), 'anon cannot maintain public.riders');

insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'SELECT'), 'anon cannot select from public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'UPDATE'), 'anon cannot update public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'INSERT'), 'anon cannot insert into public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'DELETE'), 'anon cannot delete from public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'TRUNCATE'), 'anon cannot truncate public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'REFERENCES'), 'anon cannot reference public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'TRIGGER'), 'anon cannot create trigger on public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('anon', 'public.payroll_records', 'MAINTAIN'), 'anon cannot maintain public.payroll_records');

-- public pseudo-role denied
insert into core_access_tap_results select ok(not has_table_privilege('public', 'public.users', 'SELECT'), 'public cannot select from public.users');
insert into core_access_tap_results select ok(not has_table_privilege('public', 'public.riders', 'SELECT'), 'public cannot select from public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('public', 'public.payroll_records', 'SELECT'), 'public cannot select from public.payroll_records');

-- authenticated table privileges strictly bounded
-- public.users: ONLY SELECT, UPDATE
insert into core_access_tap_results select ok(has_table_privilege('authenticated', 'public.users', 'SELECT'), 'authenticated can select from public.users');
insert into core_access_tap_results select ok(has_table_privilege('authenticated', 'public.users', 'UPDATE'), 'authenticated can update public.users');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.users', 'INSERT'), 'authenticated cannot insert into public.users');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.users', 'DELETE'), 'authenticated cannot delete from public.users');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.users', 'TRUNCATE'), 'authenticated cannot truncate public.users');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.users', 'REFERENCES'), 'authenticated cannot reference public.users');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.users', 'TRIGGER'), 'authenticated cannot create trigger on public.users');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.users', 'MAINTAIN'), 'authenticated cannot maintain public.users');

-- public.riders: ONLY SELECT
insert into core_access_tap_results select ok(has_table_privilege('authenticated', 'public.riders', 'SELECT'), 'authenticated can select from public.riders');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'INSERT'), 'authenticated cannot insert into public.riders directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'UPDATE'), 'authenticated cannot update public.riders directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'DELETE'), 'authenticated cannot delete from public.riders directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'TRUNCATE'), 'authenticated cannot truncate public.riders directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'REFERENCES'), 'authenticated cannot reference public.riders directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'TRIGGER'), 'authenticated cannot create trigger on public.riders directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.riders', 'MAINTAIN'), 'authenticated cannot maintain public.riders directly');

-- public.payroll_records: ONLY SELECT, INSERT, UPDATE
insert into core_access_tap_results select ok(has_table_privilege('authenticated', 'public.payroll_records', 'SELECT'), 'authenticated can select from public.payroll_records');
insert into core_access_tap_results select ok(has_table_privilege('authenticated', 'public.payroll_records', 'INSERT'), 'authenticated can insert into public.payroll_records');
insert into core_access_tap_results select ok(has_table_privilege('authenticated', 'public.payroll_records', 'UPDATE'), 'authenticated can update public.payroll_records');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.payroll_records', 'DELETE'), 'authenticated cannot delete from public.payroll_records directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.payroll_records', 'TRUNCATE'), 'authenticated cannot truncate public.payroll_records directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.payroll_records', 'REFERENCES'), 'authenticated cannot reference public.payroll_records directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.payroll_records', 'TRIGGER'), 'authenticated cannot create trigger on public.payroll_records directly');
insert into core_access_tap_results select ok(not has_table_privilege('authenticated', 'public.payroll_records', 'MAINTAIN'), 'authenticated cannot maintain public.payroll_records directly');

-- ============================================================================
-- 2. Negative: anon denied runtime queries
-- ============================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into core_access_tap_results select throws_ok(
  $$select count(*) from public.users$$,
  '42501', null,
  'anon runtime query on public.users is denied'
);
insert into core_access_tap_results select throws_ok(
  $$select count(*) from public.riders$$,
  '42501', null,
  'anon runtime query on public.riders is denied'
);
insert into core_access_tap_results select throws_ok(
  $$select count(*) from public.payroll_records$$,
  '42501', null,
  'anon runtime query on public.payroll_records is denied'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================================
-- 3. Seed deterministic actors and fixtures
-- ============================================================================
insert into public.hubs (id, name, latitude, longitude, attendance_radius_m, active) values
  ('ca100000-0000-4000-8000-000000000001', 'Access Contract Hub Alpha', 6.9214, 122.0790, 500, true),
  ('ca100000-0000-4000-8000-000000000002', 'Access Contract Hub Beta', 6.9214, 122.0790, 500, true);

insert into public.zones (id, hub_id, name, lat, lng, radius, color, status) values
  ('cb100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', 'Zone Alpha', 6.9214, 122.0790, 100, '#111111', 'active'),
  ('cb100000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000002', 'Zone Beta', 6.9214, 122.0790, 100, '#222222', 'active');

insert into public.riders (id, hub_id, zone_id, name, mkb_id, email, status) values
  ('cc100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', 'cb100000-0000-4000-8000-000000000001', 'Contract Rider Alpha', 'CTR-RDR-001', 'contract-rider-a@example.test', 'active'),
  ('cc100000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000002', 'cb100000-0000-4000-8000-000000000002', 'Contract Rider Beta', 'CTR-RDR-002', 'contract-rider-b@example.test', 'active');

insert into auth.users (id, email, email_confirmed_at) values
  ('cd100000-0000-4000-8000-000000000001', 'contract-staff@mkb.ph', clock_timestamp()),
  ('cd100000-0000-4000-8000-000000000002', 'contract-payroll@mkb.ph', clock_timestamp()),
  ('cd100000-0000-4000-8000-000000000003', 'contract-rider-a@example.test', clock_timestamp()),
  ('cd100000-0000-4000-8000-000000000004', 'contract-rider-b@example.test', clock_timestamp());

insert into public.users (id, full_name, email, role, status, employment_status, contact, hub_access_scope) values
  ('cd100000-0000-4000-8000-000000000001', 'Contract Staff HR', 'contract-staff@mkb.ph', 'hr', 'active', 'active', '09111111111', 'assigned'),
  ('cd100000-0000-4000-8000-000000000002', 'Contract Payroll Officer', 'contract-payroll@mkb.ph', 'payroll', 'active', 'active', '09222222222', 'assigned');

insert into public.users (id, full_name, email, role, status, employment_status, contact, rider_id, hub_access_scope) values
  ('cd100000-0000-4000-8000-000000000003', 'Contract Rider Alpha', 'contract-rider-a@example.test', 'rider', 'active', 'active', '09333333333', 'cc100000-0000-4000-8000-000000000001', 'assigned'),
  ('cd100000-0000-4000-8000-000000000004', 'Contract Rider Beta', 'contract-rider-b@example.test', 'rider', 'active', 'active', '09444444444', 'cc100000-0000-4000-8000-000000000002', 'assigned');

-- Grant payroll officer and staff access only to Hub Alpha
insert into public.user_hub_access (user_id, hub_id, assigned_by) values
  ('cd100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001'),
  ('cd100000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001');

-- Pre-seed payroll records:
-- 1. Alpha Draft (Hub Alpha)
-- 2. Beta Draft (Hub Beta)
-- 3. Alpha Paid (Hub Alpha)
insert into public.payroll_records (
  id, rider_id, hub_id, cutoff_start, cutoff_end, total_parcels, rate_per_parcel, gross_pay, status
) values
  ('ce100000-0000-4000-8000-000000000001', 'cc100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', date '2026-08-31', date '2026-09-06', 0, 10.00, 0.00, 'draft'),
  ('ce100000-0000-4000-8000-000000000002', 'cc100000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000002', date '2026-08-31', date '2026-09-06', 0, 10.00, 0.00, 'draft'),
  ('ce100000-0000-4000-8000-000000000003', 'cc100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', date '2026-08-01', date '2026-08-07', 50, 10.00, 500.00, 'paid');

-- ============================================================================
-- 4. Positive: Staff self-profile flow works
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cd100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into core_access_tap_results select is(
  (select full_name from public.users where id = 'cd100000-0000-4000-8000-000000000001'),
  'Contract Staff HR',
  'staff can read own user profile'
);

insert into core_access_tap_results select lives_ok(
  $$update public.users set contact = '09888888888' where id = 'cd100000-0000-4000-8000-000000000001'$$,
  'staff self-profile update contact works'
);

insert into core_access_tap_results select is(
  (select contact from public.users where id = 'cd100000-0000-4000-8000-000000000001'),
  '09888888888',
  'staff self-profile contact was updated'
);

-- Negative: Staff self-profile cannot escalate role
insert into core_access_tap_results select throws_ok(
  $$update public.users set role = 'admin' where id = 'cd100000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'staff self-profile cannot escalate role'
);

-- Negative: Staff cannot directly insert into or delete from public.users
insert into core_access_tap_results select throws_ok(
  $$insert into public.users (id, full_name, email, role) values (gen_random_uuid(), 'Rogue User', 'rogue@example.test', 'admin')$$,
  '42501', null,
  'staff cannot insert into public.users directly'
);
insert into core_access_tap_results select throws_ok(
  $$delete from public.users where id = 'cd100000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'staff cannot delete from public.users directly'
);

-- ============================================================================
-- 5. Positive: Rider can read own Rider data
-- ============================================================================
select set_config('request.jwt.claims', '{"sub":"cd100000-0000-4000-8000-000000000003","role":"authenticated"}', true);

insert into core_access_tap_results select is(
  (select count(*) from public.riders where id = 'cc100000-0000-4000-8000-000000000001'),
  1::bigint,
  'rider can read own rider record'
);
insert into core_access_tap_results select is(
  (select mkb_id from public.riders where id = 'cc100000-0000-4000-8000-000000000001'),
  'CTR-RDR-001',
  'rider reads correct own mkb_id'
);

-- ============================================================================
-- 6. Negative: Rider cannot access unrelated staff/payroll data
-- ============================================================================

-- Cannot read other riders
insert into core_access_tap_results select is(
  (select count(*) from public.riders where id = 'cc100000-0000-4000-8000-000000000002'),
  0::bigint,
  'rider cannot read other rider record'
);

-- Cannot read other user profiles
insert into core_access_tap_results select is(
  (select count(*) from public.users where id <> 'cd100000-0000-4000-8000-000000000003'),
  0::bigint,
  'rider cannot read other users profiles'
);

-- Cannot read draft or pending payroll records
insert into core_access_tap_results select is(
  (select count(*) from public.payroll_records where status = 'draft'),
  0::bigint,
  'rider cannot read draft payroll records'
);

-- Can read own paid payroll record
insert into core_access_tap_results select is(
  (select count(*) from public.payroll_records where id = 'ce100000-0000-4000-8000-000000000003'),
  1::bigint,
  'rider can read own paid payroll record'
);

-- Cannot insert payroll records
insert into core_access_tap_results select throws_ok(
  $$insert into public.payroll_records (rider_id, hub_id, cutoff_start, cutoff_end, total_parcels, rate_per_parcel, gross_pay, status)
    values ('cc100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', date '2026-09-14', date '2026-09-20', 0, 10, 0, 'draft')$$,
  '42501', null,
  'rider cannot insert payroll records'
);

-- Cannot directly mutate public.riders (mutations denied at table level)
insert into core_access_tap_results select throws_ok(
  $$update public.riders set contact = '09999999999' where id = 'cc100000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'rider cannot update public.riders directly'
);
insert into core_access_tap_results select throws_ok(
  $$insert into public.riders (name, mkb_id, email, hub_id) values ('Rogue Rider', 'ROGUE-001', 'rogue@example.test', 'ca100000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'rider cannot insert into public.riders directly'
);
insert into core_access_tap_results select throws_ok(
  $$delete from public.riders where id = 'cc100000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'rider cannot delete from public.riders directly'
);

-- Rider update on payroll records has no effect (no update policy for rider)
insert into core_access_tap_results select lives_ok(
  $$update public.payroll_records set notes = 'tampered' where id = 'ce100000-0000-4000-8000-000000000003'$$,
  'rider update on payroll_records executes without crash'
);
insert into core_access_tap_results select is(
  (select notes from public.payroll_records where id = 'ce100000-0000-4000-8000-000000000003'),
  null,
  'rider cannot mutate payroll_records notes'
);

-- ============================================================================
-- 7. Positive: Authorized Payroll user can create/update intended Payroll draft workflow
-- ============================================================================
select set_config('request.jwt.claims', '{"sub":"cd100000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- Can read authorized hub payroll records
insert into core_access_tap_results select is(
  (select count(*) from public.payroll_records where hub_id = 'ca100000-0000-4000-8000-000000000001'),
  2::bigint,
  'authorized payroll user can read Hub Alpha payroll records'
);

-- Can create new draft payroll record in authorized Hub
insert into core_access_tap_results select lives_ok(
  $$insert into public.payroll_records (
      id, rider_id, hub_id, cutoff_start, cutoff_end, total_parcels, rate_per_parcel, gross_pay, status
    ) values (
      'ce100000-0000-4000-8000-000000000004', 'cc100000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001',
      date '2026-09-07', date '2026-09-13', 0, 10.00, 0.00, 'draft'
    )$$,
  'payroll user can insert draft payroll record in authorized hub'
);

-- Can update draft payroll record in authorized Hub
insert into core_access_tap_results select lives_ok(
  $$update public.payroll_records set notes = 'Draft notes updated by payroll' where id = 'ce100000-0000-4000-8000-000000000004'$$,
  'payroll user can update draft payroll record notes in authorized hub'
);

-- Can submit draft payroll record for approval
insert into core_access_tap_results select lives_ok(
  $$update public.payroll_records set status = 'pending' where id = 'ce100000-0000-4000-8000-000000000004'$$,
  'payroll user can submit draft payroll record for approval'
);
insert into core_access_tap_results select is(
  (select status::text from public.payroll_records where id = 'ce100000-0000-4000-8000-000000000004'),
  'pending',
  'payroll record status transitioned to pending'
);

-- ============================================================================
-- 8. Negative: Payroll cannot access unauthorized rows/hubs
-- ============================================================================

-- Cannot read payroll records from unauthorized Hub Beta
insert into core_access_tap_results select is(
  (select count(*) from public.payroll_records where hub_id = 'ca100000-0000-4000-8000-000000000002'),
  0::bigint,
  'payroll user cannot read Hub Beta payroll records'
);

-- Cannot insert payroll records for unauthorized Hub Beta
insert into core_access_tap_results select throws_ok(
  $$insert into public.payroll_records (
      id, rider_id, hub_id, cutoff_start, cutoff_end, total_parcels, rate_per_parcel, gross_pay, status
    ) values (
      'ce100000-0000-4000-8000-000000000005', 'cc100000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000002',
      date '2026-09-07', date '2026-09-13', 0, 10.00, 0.00, 'draft'
    )$$,
  '42501', null,
  'payroll user cannot insert payroll records in unauthorized hub'
);

-- Cannot read riders in unauthorized Hub Beta
insert into core_access_tap_results select is(
  (select count(*) from public.riders where hub_id = 'ca100000-0000-4000-8000-000000000002'),
  0::bigint,
  'payroll user cannot read riders in unauthorized hub'
);

-- Cannot delete payroll records directly (delete privilege denied at table level)
insert into core_access_tap_results select throws_ok(
  $$delete from public.payroll_records where id = 'ce100000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'payroll user cannot delete payroll records directly'
);

-- Cannot move payroll record to unauthorized hub (historical hub assignment is immutable)
insert into core_access_tap_results select throws_ok(
  $$update public.payroll_records set hub_id = 'ca100000-0000-4000-8000-000000000002' where id = 'ce100000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'payroll user cannot change historical payroll hub assignment'
);

-- Cannot update payroll record in unauthorized Hub Beta (updates 0 rows under RLS)
insert into core_access_tap_results select lives_ok(
  $$update public.payroll_records set notes = 'tampered' where id = 'ce100000-0000-4000-8000-000000000002'$$,
  'update on unauthorized hub payroll record executes without crashing'
);
insert into core_access_tap_results select is(
  (select notes from public.payroll_records where id = 'ce100000-0000-4000-8000-000000000002'),
  null,
  'payroll user cannot mutate Hub Beta payroll record notes'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into core_access_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from core_access_tap_results;
rollback;
