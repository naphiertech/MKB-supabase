begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('legacy_staff_profile_normalization_test'));
select plan(29);
create temporary table legacy_staff_tap_results (result text not null);
grant insert on legacy_staff_tap_results to authenticated;

insert into legacy_staff_tap_results select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'sync_confirmed_auth_email_to_profile'
      and tgrelid = 'auth.users'::regclass
      and not tgisinternal
  ),
  'confirmed Auth email synchronization trigger exists'
);
insert into legacy_staff_tap_results select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'enforce_public_user_email_matches_auth'
      and tgrelid = 'public.users'::regclass
      and not tgisinternal
  ),
  'public profile email consistency trigger exists'
);
insert into legacy_staff_tap_results select ok(
  not has_function_privilege('authenticated', 'public.sync_confirmed_auth_email_to_profile()', 'EXECUTE'),
  'clients cannot execute the Auth email synchronization function directly'
);

insert into auth.users (id, email, email_confirmed_at, encrypted_password, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001', 'legacy.admin@mkb.ph', clock_timestamp(), 'legacy-admin-hash', '{"mfa_marker":"preserve"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', 'legacy.hr@mkb.ph', clock_timestamp(), 'legacy-hr-hash', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000003', 'legacy.payroll@mkb.ph', clock_timestamp(), 'legacy-payroll-hash', '{}'::jsonb),
  ('f1000000-0000-4000-8000-000000000004', 'legacy.rider@example.test', clock_timestamp(), 'legacy-rider-hash', '{}'::jsonb);

insert into public.users (id, full_name, email, role, status, contact, employment_type, date_of_hire) values
  ('f1000000-0000-4000-8000-000000000001', 'Legacy Admin', 'legacy.admin@mkb.ph', 'admin', 'active', null, null, null),
  ('f1000000-0000-4000-8000-000000000002', 'Legacy HR', 'legacy.hr@mkb.ph', 'hr', 'active', null, null, null),
  ('f1000000-0000-4000-8000-000000000003', 'Legacy Payroll', 'legacy.payroll@mkb.ph', 'payroll', 'suspended', null, null, null),
  ('f1000000-0000-4000-8000-000000000004', 'Legacy Rider', 'legacy.rider@example.test', 'rider', 'active', null, null, null);

insert into public.activity_logs (id, user_id, event_type, description, metadata) values (
  'f3000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'legacy_test_event',
  'Historical activity evidence remains unchanged.',
  '{"evidence":"preserve"}'::jsonb
);

update auth.users set email = 'confirmed.admin@gmail.com'
where id = 'f1000000-0000-4000-8000-000000000001';

insert into legacy_staff_tap_results select is(
  (select email from public.users where id = 'f1000000-0000-4000-8000-000000000001'),
  'confirmed.admin@gmail.com',
  'confirmed Auth email is synchronized to public.users'
);
insert into legacy_staff_tap_results select is(
  (select id::text from auth.users where id = 'f1000000-0000-4000-8000-000000000001'),
  'f1000000-0000-4000-8000-000000000001',
  'email synchronization preserves the Auth UUID'
);
insert into legacy_staff_tap_results select is(
  (select role::text from public.users where id = 'f1000000-0000-4000-8000-000000000001'),
  'admin',
  'email synchronization preserves the staff role'
);
insert into legacy_staff_tap_results select is(
  (select encrypted_password from auth.users where id = 'f1000000-0000-4000-8000-000000000001'),
  'legacy-admin-hash',
  'email synchronization preserves the Auth password hash'
);
insert into legacy_staff_tap_results select is(
  (select raw_user_meta_data->>'mfa_marker' from auth.users where id = 'f1000000-0000-4000-8000-000000000001'),
  'preserve',
  'email synchronization leaves Auth metadata untouched'
);
insert into legacy_staff_tap_results select is(
  (select jsonb_build_object('description', description, 'metadata', metadata) from public.activity_logs where id = 'f3000000-0000-4000-8000-000000000001'),
  jsonb_build_object('description', 'Historical activity evidence remains unchanged.', 'metadata', '{"evidence":"preserve"}'::jsonb),
  'confirmed email synchronization does not rewrite historical audit evidence'
);
insert into legacy_staff_tap_results select is(
  (select users.email from public.activity_logs logs join public.users users on users.id = logs.user_id where logs.id = 'f3000000-0000-4000-8000-000000000001'),
  'confirmed.admin@gmail.com',
  'audit actor display resolves the current confirmed profile identity'
);
update auth.users
set email_change = 'pending.hr@gmail.com',
    email_change_confirm_status = 1
where id = 'f1000000-0000-4000-8000-000000000002';
insert into legacy_staff_tap_results select is(
  (select email from public.users where id = 'f1000000-0000-4000-8000-000000000002'),
  'legacy.hr@mkb.ph',
  'pending Auth email_change is never copied to the public profile'
);
insert into legacy_staff_tap_results select throws_ok(
  $$update public.users set email = 'premature@gmail.com' where id = 'f1000000-0000-4000-8000-000000000002'$$,
  '23514', null,
  'public profile email cannot move ahead of the confirmed Auth email'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into legacy_staff_tap_results select lives_ok(
  $$update public.users set full_name = 'Legacy HR Updated' where id = 'f1000000-0000-4000-8000-000000000002'$$,
  'staff self-service can update a permitted profile field'
);
insert into legacy_staff_tap_results select throws_ok(
  $$update public.users set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'staff self-service cannot escalate its role'
);
insert into legacy_staff_tap_results select throws_ok(
  $$update public.users set status = 'suspended' where id = 'f1000000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'staff self-service cannot mutate account suspension state'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into legacy_staff_tap_results select is(
  (select jsonb_build_array(contact, employment_type, date_of_hire) from public.users where id = 'f1000000-0000-4000-8000-000000000002'),
  '[null, null, null]'::jsonb,
  'unrelated profile updates do not fabricate missing legacy values'
);
insert into legacy_staff_tap_results select is(
  (select status::text from public.users where id = 'f1000000-0000-4000-8000-000000000003'),
  'suspended',
  'normalization preserves existing suspension state'
);

insert into legacy_staff_tap_results select is(
  (
    select jsonb_build_object('public', public, 'limit', file_size_limit, 'mimes', allowed_mime_types)
    from storage.buckets where id = 'staff-avatars'
  ),
  jsonb_build_object(
    'public', false,
    'limit', 2097152,
    'mimes', array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'staff avatar bucket is private and constrained to approved images'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into legacy_staff_tap_results select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, owner_id, metadata)
    values ('f2000000-0000-4000-8000-000000000001', 'staff-avatars', 'staff/f1000000-0000-4000-8000-000000000002/avatar', 'f1000000-0000-4000-8000-000000000002', '{"mimetype":"image/png","size":1024}'::jsonb)$$,
  'HR can upload its own deterministic private profile photo'
);
insert into legacy_staff_tap_results select lives_ok(
  $$update storage.objects set metadata = '{"mimetype":"image/webp","size":2048}'::jsonb where id = 'f2000000-0000-4000-8000-000000000001'$$,
  'HR can replace its own deterministic private profile photo'
);
insert into legacy_staff_tap_results select throws_ok(
  $$insert into storage.objects (id, bucket_id, name, owner_id)
    values ('f2000000-0000-4000-8000-000000000002', 'staff-avatars', 'staff/f1000000-0000-4000-8000-000000000003/avatar', 'f1000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'HR cannot upload another staff member profile photo'
);
insert into legacy_staff_tap_results select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Staff can remove permitted profile photos'
      and cmd = 'DELETE'
      and roles = array['authenticated']::name[]
  ),
  'authenticated staff avatar deletion remains governed by the dedicated policy'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into legacy_staff_tap_results select throws_ok(
  $$insert into storage.objects (id, bucket_id, name, owner_id)
    values ('f2000000-0000-4000-8000-000000000005', 'staff-avatars', 'staff/f1000000-0000-4000-8000-000000000002/avatar', 'f1000000-0000-4000-8000-000000000003')$$,
  '42501', null,
  'Payroll cannot upload another staff member profile photo'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into legacy_staff_tap_results select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, owner_id)
    values ('f2000000-0000-4000-8000-000000000003', 'staff-avatars', 'staff/f1000000-0000-4000-8000-000000000003/avatar', 'f1000000-0000-4000-8000-000000000001')$$,
  'Admin can manage a permitted staff profile photo'
);

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into legacy_staff_tap_results select is(
  (select count(*) from storage.objects where id = 'f2000000-0000-4000-8000-000000000003'),
  0::bigint,
  'Rider cannot read staff profile photos'
);
insert into legacy_staff_tap_results select throws_ok(
  $$insert into storage.objects (id, bucket_id, name, owner_id)
    values ('f2000000-0000-4000-8000-000000000004', 'staff-avatars', 'staff/f1000000-0000-4000-8000-000000000004/avatar', 'f1000000-0000-4000-8000-000000000004')$$,
  '42501', null,
  'Rider cannot upload a staff profile photo'
);
reset role;
select set_config('request.jwt.claims', '', true);

insert into legacy_staff_tap_results select is(
  (select count(*) from public.users where id::text like 'f1000000-%'),
  4::bigint,
  'normalization neither deletes nor recreates test identities'
);
insert into legacy_staff_tap_results select is(
  (select count(*) from auth.users where id in (
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000004'
  )),
  4::bigint,
  'all original Auth identities remain present'
);
insert into legacy_staff_tap_results select ok(
  not exists (
    select 1
    from auth.users auth_user
    join public.users profile on profile.id = auth_user.id
    where auth_user.email_confirmed_at is not null
      and nullif(btrim(auth_user.email), '') is not null
      and profile.email is distinct from auth_user.email
  ),
  'migration leaves no confirmed Auth/public email mismatches'
);

insert into legacy_staff_tap_results select result from finish() as result;
select string_agg(result, E'\n' order by ctid) as test_suite from legacy_staff_tap_results;
rollback;
