-- Per-user in-app presentation preferences. Notification persistence remains
-- independent and no Realtime publication is added for this table.
create table public.user_notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  toast_enabled boolean not null default true,
  sound_enabled boolean not null default true,
  violation_alerts boolean not null default true,
  attendance_alerts boolean not null default true,
  payroll_updates boolean not null default true,
  support_ticket_updates boolean not null default true,
  system_updates boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences enable row level security;

revoke all on table public.user_notification_preferences from anon, authenticated;
grant select, insert, update on table public.user_notification_preferences to authenticated;

create policy "Users read own notification preferences"
on public.user_notification_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create own notification preferences"
on public.user_notification_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update own notification preferences"
on public.user_notification_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create function public.protect_user_notification_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.user_id := (select auth.uid());
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Preference ownership and creation time are immutable.' using errcode = '22000';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger protect_user_notification_preferences_row
before insert or update on public.user_notification_preferences
for each row execute function public.protect_user_notification_preferences();

revoke execute on function public.protect_user_notification_preferences()
from public, anon, authenticated;
