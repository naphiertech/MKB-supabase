-- Private Realtime Broadcast authorization for immediate cross-device session
-- termination UX. Supabase Auth remains authoritative for refresh-session
-- revocation; this channel only tells already-open clients to clear locally.
drop policy if exists "MKB users receive own session control" on realtime.messages;
create policy "MKB users receive own session control"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) = 'user:' || (select auth.uid())::text || ':session-control'
);

drop policy if exists "MKB users send own session control" on realtime.messages;
create policy "MKB users send own session control"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and (select realtime.topic()) = 'user:' || (select auth.uid())::text || ':session-control'
);
