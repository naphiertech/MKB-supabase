begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select pg_advisory_xact_lock(hashtext('trusted_device_function_hardening_test'));
select no_plan();

select ok(
  (select prosecdef from pg_proc where oid='public.validate_and_register_device(text,text,text,text,text,text)'::regprocedure),
  'trusted-device validation remains SECURITY DEFINER'
);
select is(
  (select pg_get_userbyid(proowner) from pg_proc where oid='public.validate_and_register_device(text,text,text,text,text,text)'::regprocedure),
  'postgres',
  'trusted-device validation remains owned by postgres'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid='public.validate_and_register_device(text,text,text,text,text,text)'::regprocedure),
  'trusted-device validation pins an empty search_path'
);
select matches(
  (select pg_get_functiondef('public.validate_and_register_device(text,text,text,text,text,text)'::regprocedure)),
  'v_user_role public\.user_role',
  'the application role type is explicitly schema-qualified'
);
select matches(
  (select pg_get_functiondef('public.validate_and_register_device(text,text,text,text,text,text)'::regprocedure)),
  'v_user_id pg_catalog\.uuid',
  'declaration-time UUID resolution is explicitly pinned to pg_catalog'
);
select ok(has_function_privilege('anon','public.validate_and_register_device(text,text,text,text,text,text)','EXECUTE'), 'anonymous invocation reachability is preserved');
select ok(has_function_privilege('authenticated','public.validate_and_register_device(text,text,text,text,text,text)','EXECUTE'), 'authenticated Rider invocation is preserved');
select ok(has_function_privilege('service_role','public.validate_and_register_device(text,text,text,text,text,text)','EXECUTE'), 'service-role invocation is preserved');

insert into public.riders(id,name,mkb_id,email,status) values
  ('fe100000-0000-4000-8000-000000000001','Trusted Device Rider','TEST-DEVICE-001','trusted-device-rider@example.test','active');
insert into auth.users(id,email,email_confirmed_at) values
  ('fe200000-0000-4000-8000-000000000001','trusted-device-rider@example.test',clock_timestamp());
insert into public.users(id,full_name,email,role,rider_id,status) values
  ('fe200000-0000-4000-8000-000000000001','Trusted Device Rider','trusted-device-rider@example.test','rider','fe100000-0000-4000-8000-000000000001','active');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fe200000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(
  public.validate_and_register_device('device-1','fingerprint-1','Rider Phone','android','test-agent','127.0.0.1'),
  jsonb_build_object('allowed',true,'reason','registered_first_device'),
  'first authenticated Rider device registration preserves its response'
);
select is(
  public.validate_and_register_device('device-1','fingerprint-1','Rider Phone','android','updated-agent','127.0.0.2'),
  jsonb_build_object('allowed',true,'reason','trusted_device_match'),
  'existing trusted device matching preserves its response'
);
select is((select count(*) from public.user_devices where user_id='fe200000-0000-4000-8000-000000000001'),1::bigint,'existing-device validation does not create a duplicate row');
select is(
  public.validate_and_register_device('device-2','fingerprint-2','Other Phone','android','other-agent','127.0.0.3'),
  (select jsonb_build_object(
    'allowed',false,
    'reason','device_mismatch',
    'registered_device_name',device_name,
    'registered_at',registered_at
  ) from public.user_devices where user_id='fe200000-0000-4000-8000-000000000001'),
  'different-device rejection preserves its exact response structure'
);

do $$
declare path_result jsonb;
begin
  perform pg_catalog.set_config('search_path','pg_catalog',true);
  path_result := public.validate_and_register_device('device-1','fingerprint-1','Rider Phone','android','path-test','127.0.0.4');
  perform pg_catalog.set_config('search_path','public,extensions',true);
  if path_result is distinct from pg_catalog.jsonb_build_object('allowed',true,'reason','trusted_device_match') then
    raise exception 'trusted-device response changed under caller search_path';
  end if;
exception when others then
  perform pg_catalog.set_config('search_path','public,extensions',true);
  raise;
end $$;
select pass('caller-controlled session search_path cannot alter application object or type resolution');

reset role;
select set_config('request.jwt.claims','',true);
select throws_ok(
  $$select public.validate_and_register_device('device-x','fingerprint-x','Unknown','web','agent',null)$$,
  'P0001',
  'Unauthorized: No active authentication session.',
  'null auth.uid invocation still fails with the existing error'
);

set local search_path=public,extensions;
select coalesce(string_agg(result,E'\n'),'ok') as test_suite from finish() result;
rollback;
