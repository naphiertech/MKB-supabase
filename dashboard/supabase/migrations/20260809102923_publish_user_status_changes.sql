-- Account suspension changes must reach the affected signed-in client so the
-- application can clear its local session immediately. Auth banning remains
-- the server-side source of truth for future sign-in and refresh attempts.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
end;
$$;

create or replace function public.enforce_user_status_server_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status is distinct from new.status
     and coalesce((select auth.role()), '') not in ('service_role')
     and (select auth.uid()) is not null then
    raise exception 'Account status changes require the privileged account action service.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_status_server_boundary() from public, anon, authenticated;

drop trigger if exists enforce_user_status_server_boundary on public.users;
create trigger enforce_user_status_server_boundary
before update of status on public.users
for each row execute function public.enforce_user_status_server_boundary();
