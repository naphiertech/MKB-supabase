begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select pg_advisory_xact_lock(hashtext('support_tickets_test'));
select plan(39);

select has_table('public', 'support_tickets', 'support_tickets table exists');
select has_table('public', 'support_ticket_messages', 'support_ticket_messages table exists');
select ok(to_regclass('public.support_ticket_messages_sender_idx') is not null, 'message sender foreign key has a covering index');
select ok((select relrowsecurity from pg_class where oid = 'public.support_tickets'::regclass), 'support_tickets has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.support_ticket_messages'::regclass), 'support_ticket_messages has RLS enabled');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='support_tickets' and cmd='DELETE'), 0, 'tickets have no delete policy');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='support_ticket_messages' and cmd in ('UPDATE','DELETE')), 0, 'messages have no update or delete policy');
select ok(not has_table_privilege('anon', 'public.support_tickets', 'SELECT'), 'anonymous users cannot read tickets');
select ok(not has_table_privilege('anon', 'public.support_ticket_messages', 'SELECT'), 'anonymous users cannot read messages');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets'), 'tickets are published to Realtime');
select ok(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_ticket_messages'), 'messages are published to Realtime');
select ok(not has_function_privilege('authenticated', 'public.handle_support_ticket_change()', 'EXECUTE'), 'ticket trigger function is not client executable');
select ok(not has_function_privilege('authenticated', 'public.handle_support_ticket_message()', 'EXECUTE'), 'message trigger function is not client executable');

insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'support-admin@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'support-hr@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'support-payroll@example.test'),
  ('91000000-0000-4000-8000-000000000004', 'support-rider@example.test'),
  ('91000000-0000-4000-8000-000000000005', 'support-other@example.test');

insert into public.users (id, full_name, email, role) values
  ('91000000-0000-4000-8000-000000000001', 'Support Admin', 'support-admin@example.test', 'admin'),
  ('91000000-0000-4000-8000-000000000002', 'Support HR', 'support-hr@example.test', 'hr'),
  ('91000000-0000-4000-8000-000000000003', 'Support Payroll', 'support-payroll@example.test', 'payroll'),
  ('91000000-0000-4000-8000-000000000004', 'Support Rider', 'support-rider@example.test', 'rider'),
  ('91000000-0000-4000-8000-000000000005', 'Other Rider', 'support-other@example.test', 'rider');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select lives_ok(
  $$insert into support_tickets (id, created_by, subject, category, description, status, resolved_at)
    values ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000005', 'Clock-in scanner failure', 'attendance', 'The face scanner does not complete verification.', 'resolved', now())$$,
  'a rider can create a ticket'
);
select is((select created_by from support_tickets where id='92000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000004'::uuid, 'ticket creator is forced to the authenticated user');
select is((select status::text from support_tickets where id='92000000-0000-4000-8000-000000000001'), 'open', 'new ticket starts Open');
select is((select resolved_at from support_tickets where id='92000000-0000-4000-8000-000000000001'), null::timestamptz, 'new ticket cannot provide resolved_at');
select matches((select ticket_number from support_tickets where id='92000000-0000-4000-8000-000000000001'), '^MKB-[A-F0-9]{8}$', 'ticket receives a human-readable unique reference');

select lives_ok(
  $$insert into support_ticket_messages (id, ticket_id, sender_id, message)
    values ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000005', 'Please help with my scanner.')$$,
  'a rider can reply to their own ticket'
);
select is((select sender_id from support_ticket_messages where id='93000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000004'::uuid, 'reply sender is forced to the authenticated user');

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
insert into support_tickets (id, subject, category, description)
values ('92000000-0000-4000-8000-000000000002', 'Different rider ticket', 'technical_issue', 'This ticket belongs to a different rider.');
select is((select count(*) from support_tickets), 1::bigint, 'a user reads only their own tickets');
select throws_ok(
  $$insert into support_ticket_messages (ticket_id, message) values ('92000000-0000-4000-8000-000000000001', 'Unauthorized reply')$$,
  '42501', null, 'a user cannot reply to another user ticket'
);

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$insert into support_tickets (id, subject, category, description)
    values ('92000000-0000-4000-8000-000000000003', 'Payroll support request', 'payroll', 'The payroll user needs help with an export.')$$,
  'Payroll can create an owned support ticket'
);
select is((select count(*) from support_tickets), 1::bigint, 'Payroll reads only its own support ticket');

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$insert into support_tickets (id, subject, category, description)
    values ('92000000-0000-4000-8000-000000000004', 'HR support request', 'account_login', 'The HR user needs help with account access.')$$,
  'HR can create an owned support ticket'
);
select is((select count(*) from support_tickets), 1::bigint, 'HR reads only its own ticket and receives no global support-management access');
select is_empty(
  $$update support_tickets
    set status='in_progress'
    where id='92000000-0000-4000-8000-000000000001'
    returning id$$,
  'HR cannot manage another user ticket'
);

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from support_tickets), 4::bigint, 'Admin can read all tickets');
select lives_ok(
  $$insert into support_ticket_messages (id, ticket_id, message)
    values ('93000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'We are reviewing the scanner issue.')$$,
  'Admin can reply to any active ticket'
);
select lives_ok(
  $$update support_tickets set status='in_progress' where id='92000000-0000-4000-8000-000000000001'$$,
  'Admin can move Open to In Progress'
);
select lives_ok(
  $$update support_tickets set status='resolved' where id='92000000-0000-4000-8000-000000000001'$$,
  'Admin can move In Progress to Resolved'
);
select ok((select resolved_at is not null from support_tickets where id='92000000-0000-4000-8000-000000000001'), 'resolving populates resolved_at');
select is((select count(*) from support_ticket_messages where ticket_id='92000000-0000-4000-8000-000000000001'), 2::bigint, 'status changes preserve complete message history');
select throws_ok(
  $$insert into support_ticket_messages (ticket_id, message) values ('92000000-0000-4000-8000-000000000001', 'Reply after resolution')$$,
  '42501', null, 'resolved tickets reject new replies'
);
select throws_ok(
  $$update support_tickets set subject='Rewritten history' where id='92000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'Admin cannot rewrite immutable ticket fields'
);

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from notifications where metadata->>'support_event_key'='ticket-created:92000000-0000-4000-8000-000000000001'), 1::bigint, 'ticket creation produces one Admin notification');
select is((select count(*) from notifications where metadata->>'support_event_key'='message-created:93000000-0000-4000-8000-000000000001'), 1::bigint, 'user reply produces one Admin notification');
select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*) from notifications where metadata->>'support_event_key'='message-created:93000000-0000-4000-8000-000000000002' and recipient_id='91000000-0000-4000-8000-000000000004'), 1::bigint, 'staff reply produces one creator notification');
select is((select count(*) from notifications where metadata->>'support_event_key' in ('status-changed:92000000-0000-4000-8000-000000000001:in_progress','status-changed:92000000-0000-4000-8000-000000000001:resolved')), 2::bigint, 'meaningful status changes notify the creator once each');

select coalesce(string_agg(result, E'\n'), 'ok') as test_suite
from finish() as result;
rollback;
