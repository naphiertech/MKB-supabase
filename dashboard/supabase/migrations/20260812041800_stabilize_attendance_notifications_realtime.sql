-- Keep Postgres Changes authorization evaluable for authenticated subscribers.
-- Legacy notification policies targeted PUBLIC while calling get_my_role(), a
-- helper intentionally executable only by authenticated users. Anonymous
-- policy evaluation therefore caused Realtime replication RLS errors.

revoke all on table public.notifications from anon;
revoke delete, truncate, references, trigger on table public.notifications from authenticated;
grant select, insert, update on table public.notifications to authenticated;

drop policy if exists "Authenticated users can insert notifications" on public.notifications;
drop policy if exists "System can insert notifications" on public.notifications;
drop policy if exists "Users can read assigned or targeted notifications" on public.notifications;
drop policy if exists "Users can read own targeted notifications" on public.notifications;
drop policy if exists "Users can update assigned or targeted notifications" on public.notifications;
drop policy if exists "Users can update read status on own notifications" on public.notifications;

create policy "Authenticated users can insert notifications"
on public.notifications for insert to authenticated
with check (true);

create policy "Authenticated users can read assigned or targeted notifications"
on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  or (
    recipient_id is null
    and (
      (select public.get_my_role()) = 'admin'::public.user_role
      or (select public.get_my_role()) = any (target_roles)
    )
  )
);

create policy "Authenticated users can update assigned or targeted notifications"
on public.notifications for update to authenticated
using (
  recipient_id = (select auth.uid())
  or (
    recipient_id is null
    and (
      (select public.get_my_role()) = 'admin'::public.user_role
      or (select public.get_my_role()) = any (target_roles)
    )
  )
)
with check (
  recipient_id = (select auth.uid())
  or (
    recipient_id is null
    and (
      (select public.get_my_role()) = 'admin'::public.user_role
      or (select public.get_my_role()) = any (target_roles)
    )
  )
);
