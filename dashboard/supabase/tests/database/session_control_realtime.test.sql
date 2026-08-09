begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select ok(
  (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass),
  'Realtime messages retains RLS'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'MKB users receive own session control' and cmd = 'SELECT'),
  1,
  'session-control receive policy exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'MKB users send own session control' and cmd = 'INSERT'),
  1,
  'session-control send policy exists'
);
select matches(
  (select qual from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'MKB users receive own session control'),
  'auth\.uid\(\).*session-control',
  'receive policy targets only the authenticated user topic'
);
select matches(
  (select with_check from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'MKB users send own session control'),
  'auth\.uid\(\).*session-control',
  'send policy targets only the authenticated user topic'
);

select * from finish();
rollback;
