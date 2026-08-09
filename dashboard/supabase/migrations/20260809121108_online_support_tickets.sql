-- Authenticated online support tickets with immutable replies, Admin-only
-- management, in-app notifications, activity history, and RLS-authorized
-- Postgres Changes subscriptions.

create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved');
create type public.support_ticket_category as enum (
  'account_login',
  'attendance',
  'payroll',
  'parcel_operations',
  'geofence_location',
  'technical_issue',
  'other'
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('MKB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_by uuid not null default auth.uid() references public.users(id) on delete restrict,
  subject text not null check (char_length(btrim(subject)) between 5 and 120),
  category public.support_ticket_category not null,
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  status public.support_ticket_status not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_resolution_consistency check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete restrict,
  sender_id uuid not null default auth.uid() references public.users(id) on delete restrict,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index support_tickets_created_by_updated_idx
  on public.support_tickets (created_by, updated_at desc);
create index support_tickets_status_updated_idx
  on public.support_tickets (status, updated_at desc);
create index support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

revoke all on table public.support_tickets from anon, authenticated;
revoke all on table public.support_ticket_messages from anon, authenticated;
grant select, insert on table public.support_tickets to authenticated;
grant update (status) on table public.support_tickets to authenticated;
grant select, insert on table public.support_ticket_messages to authenticated;

create policy "Users read own tickets and Admin reads all"
on public.support_tickets
for select
to authenticated
using (
  (select auth.uid()) = created_by
  or (select public.get_my_role()) = 'admin'::public.user_role
);

create policy "Users create own open tickets"
on public.support_tickets
for insert
to authenticated
with check (
  (select auth.uid()) = created_by
  and status = 'open'::public.support_ticket_status
  and resolved_at is null
);

create policy "Admin manages ticket status"
on public.support_tickets
for update
to authenticated
using ((select public.get_my_role()) = 'admin'::public.user_role)
with check ((select public.get_my_role()) = 'admin'::public.user_role);

create policy "Participants read ticket messages"
on public.support_ticket_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = ticket_id
      and (
        ticket.created_by = (select auth.uid())
        or (select public.get_my_role()) = 'admin'::public.user_role
      )
  )
);

create policy "Participants reply to active tickets"
on public.support_ticket_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.support_tickets ticket
    where ticket.id = ticket_id
      and ticket.status <> 'resolved'::public.support_ticket_status
      and (
        ticket.created_by = (select auth.uid())
        or (select public.get_my_role()) = 'admin'::public.user_role
      )
  )
);

create function public.protect_support_ticket()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.status := 'open'::public.support_ticket_status;
    new.resolved_at := null;
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.ticket_number is distinct from old.ticket_number
    or new.created_by is distinct from old.created_by
    or new.subject is distinct from old.subject
    or new.category is distinct from old.category
    or new.description is distinct from old.description
    or new.created_at is distinct from old.created_at then
    raise exception 'Ticket identity and request history are immutable.' using errcode = '22000';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'open'::public.support_ticket_status
      and new.status = 'in_progress'::public.support_ticket_status then
      new.resolved_at := null;
    elsif old.status = 'in_progress'::public.support_ticket_status
      and new.status = 'resolved'::public.support_ticket_status then
      new.resolved_at := clock_timestamp();
    else
      raise exception 'Ticket status must progress from Open to In Progress to Resolved.' using errcode = '22000';
    end if;
  else
    new.resolved_at := old.resolved_at;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function public.protect_support_ticket_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  new.sender_id := (select auth.uid());
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create function public.handle_support_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (
      sender_id, type, category, priority, title, message,
      target_roles, metadata
    ) values (
      new.created_by,
      'system'::public.notification_type,
      'system'::public.notification_category,
      'medium'::public.notification_priority,
      'New support ticket ' || new.ticket_number,
      new.subject,
      array['admin'::public.user_role],
      jsonb_build_object(
        'source', 'support_ticket',
        'support_event_key', 'ticket-created:' || new.id::text,
        'ticket_id', new.id,
        'ticket_number', new.ticket_number
      )
    );

    insert into public.activity_logs (user_id, event_type, description, metadata)
    values (
      new.created_by,
      'support_ticket_created',
      'Support ticket ' || new.ticket_number || ' was created.',
      jsonb_build_object('ticket_id', new.id, 'ticket_number', new.ticket_number, 'category', new.category)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    if actor_id is distinct from new.created_by then
      insert into public.notifications (
        sender_id, type, category, priority, title, message,
        recipient_id, target_roles, metadata
      ) values (
        actor_id,
        'system'::public.notification_type,
        'system'::public.notification_category,
        'medium'::public.notification_priority,
        'Support ticket updated',
        new.ticket_number || ' is now ' || replace(initcap(new.status::text), '_', ' ') || '.',
        new.created_by,
        array[]::public.user_role[],
        jsonb_build_object(
          'source', 'support_ticket',
          'support_event_key', 'status-changed:' || new.id::text || ':' || new.status::text,
          'ticket_id', new.id,
          'ticket_number', new.ticket_number,
          'previous_status', old.status,
          'new_status', new.status
        )
      );
    end if;

    insert into public.activity_logs (user_id, event_type, description, metadata)
    values (
      actor_id,
      case when new.status = 'resolved'::public.support_ticket_status then 'support_ticket_resolved' else 'support_ticket_status_changed' end,
      'Support ticket ' || new.ticket_number || ' changed from ' || replace(initcap(old.status::text), '_', ' ') || ' to ' || replace(initcap(new.status::text), '_', ' ') || '.',
      jsonb_build_object('ticket_id', new.id, 'ticket_number', new.ticket_number, 'previous_status', old.status, 'new_status', new.status)
    );
  end if;
  return new;
end;
$$;

create function public.handle_support_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticket_record public.support_tickets%rowtype;
  sender_role public.user_role;
begin
  select * into ticket_record
  from public.support_tickets
  where id = new.ticket_id;

  select role into sender_role
  from public.users
  where id = new.sender_id;

  update public.support_tickets
  set updated_at = new.created_at
  where id = new.ticket_id;

  if sender_role = 'admin'::public.user_role then
    if new.sender_id is distinct from ticket_record.created_by then
      insert into public.notifications (
        sender_id, type, category, priority, title, message,
        recipient_id, target_roles, metadata
      ) values (
        new.sender_id,
        'system'::public.notification_type,
        'system'::public.notification_category,
        'medium'::public.notification_priority,
        'Support replied to ' || ticket_record.ticket_number,
        'A support reply was added to your ticket.',
        ticket_record.created_by,
        array[]::public.user_role[],
        jsonb_build_object(
          'source', 'support_ticket',
          'support_event_key', 'message-created:' || new.id::text,
          'ticket_id', new.ticket_id,
          'ticket_number', ticket_record.ticket_number,
          'message_id', new.id
        )
      );
    end if;
  else
    insert into public.notifications (
      sender_id, type, category, priority, title, message,
      target_roles, metadata
    ) values (
      new.sender_id,
      'system'::public.notification_type,
      'system'::public.notification_category,
      'medium'::public.notification_priority,
      'New reply on ' || ticket_record.ticket_number,
      'The ticket requester added a reply.',
      array['admin'::public.user_role],
      jsonb_build_object(
        'source', 'support_ticket',
        'support_event_key', 'message-created:' || new.id::text,
        'ticket_id', new.ticket_id,
        'ticket_number', ticket_record.ticket_number,
        'message_id', new.id
      )
    );
  end if;

  return new;
end;
$$;

create trigger protect_support_ticket_row
before insert or update on public.support_tickets
for each row execute function public.protect_support_ticket();

create trigger protect_support_ticket_message_row
before insert on public.support_ticket_messages
for each row execute function public.protect_support_ticket_message();

create trigger support_ticket_change_history
after insert or update on public.support_tickets
for each row execute function public.handle_support_ticket_change();

create trigger support_ticket_message_history
after insert on public.support_ticket_messages
for each row execute function public.handle_support_ticket_message();

revoke execute on function public.protect_support_ticket() from public, anon, authenticated;
revoke execute on function public.protect_support_ticket_message() from public, anon, authenticated;
revoke execute on function public.handle_support_ticket_change() from public, anon, authenticated;
revoke execute on function public.handle_support_ticket_message() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.support_tickets;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.support_ticket_messages;
exception when duplicate_object then null;
end;
$$;
