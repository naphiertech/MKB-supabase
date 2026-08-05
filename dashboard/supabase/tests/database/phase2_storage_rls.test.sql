begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select pg_advisory_xact_lock(hashtext('phase2_storage_rls_test'));
select plan(13);

select is(
  (
    select jsonb_build_object(
      'public', public,
      'limit', file_size_limit,
      'mimes', allowed_mime_types
    )
    from storage.buckets
    where id = 'rider-documents'
  ),
  jsonb_build_object(
    'public', false,
    'limit', 5242880,
    'mimes', array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'rider-documents bucket has the approved private configuration'
);

insert into auth.users (id, email) values
  ('12000000-0000-4000-8000-000000000001', 'storage-admin@example.test'),
  ('12000000-0000-4000-8000-000000000002', 'storage-hr@example.test'),
  ('12000000-0000-4000-8000-000000000003', 'storage-rider@example.test');

insert into public.riders (id, name, mkb_id, email) values
  ('22000000-0000-4000-8000-000000000001', 'Storage Test Rider', 'TEST-STORAGE-001', 'storage-rider@example.test');

insert into public.users (id, full_name, email, role, rider_id) values
  ('12000000-0000-4000-8000-000000000001', 'Storage Test Admin', 'storage-admin@example.test', 'admin', null),
  ('12000000-0000-4000-8000-000000000002', 'Storage Test HR', 'storage-hr@example.test', 'hr', null),
  ('12000000-0000-4000-8000-000000000003', 'Storage Test Rider', 'storage-rider@example.test', 'rider', '22000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, owner_id, metadata)
    values (
      '32000000-0000-4000-8000-000000000001',
      'rider-documents',
      'riders/22000000-0000-4000-8000-000000000001/drivers_license',
      '12000000-0000-4000-8000-000000000001',
      '{"mimetype":"application/pdf","size":1024}'::jsonb
    )$$,
  'Admin can upload a deterministic rider document object'
);
select is(
  (select count(*) from storage.objects where id = '32000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Admin can read rider document objects'
);
select lives_ok(
  $$update storage.objects
    set metadata = '{"mimetype":"application/pdf","size":2048}'::jsonb
    where id = '32000000-0000-4000-8000-000000000001'$$,
  'Admin can replace rider document objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'rider-documents',
      'riders/22000000-0000-4000-8000-000000000001/unbounded-version-name',
      '12000000-0000-4000-8000-000000000001'
    )$$,
  '42501',
  null,
  'Admin cannot upload a non-deterministic document path'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*) from storage.objects where id = '32000000-0000-4000-8000-000000000001'),
  1::bigint,
  'HR can read rider document objects'
);
select lives_ok(
  $$update storage.objects
    set metadata = '{"mimetype":"application/pdf","size":3072}'::jsonb
    where id = '32000000-0000-4000-8000-000000000001'$$,
  'HR can replace rider document objects'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*) from storage.objects where id = '32000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Rider cannot read rider document objects'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'rider-documents',
      'riders/22000000-0000-4000-8000-000000000001/government_id',
      '12000000-0000-4000-8000-000000000003'
    )$$,
  '42501',
  null,
  'Rider cannot upload rider document objects'
);
select throws_ok(
  $$delete from storage.objects
    where id = '32000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'Rider direct deletion is rejected'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*) from storage.objects where id = '32000000-0000-4000-8000-000000000001'),
  1::bigint,
  'the Rider delete attempt leaves the object intact'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Admin and HR can delete rider document files'
      and cmd = 'DELETE'
      and roles = array['authenticated']::name[]
  ),
  'Storage API deletion has an authenticated Admin and HR policy'
);
select is(
  (select count(*) from storage.objects where id = '32000000-0000-4000-8000-000000000001'),
  1::bigint,
  'direct SQL verification does not remove Storage objects'
);

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
