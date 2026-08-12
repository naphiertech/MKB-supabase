-- Keep the optional snapshot trigger polymorphic without referencing columns
-- that do not exist on the active trigger table.
create or replace function public.set_optional_hub_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_rider_id uuid;
  rider_hub uuid;
begin
  if tg_table_name = 'notifications' then
    related_rider_id := new.rider_id;
  elsif tg_table_name = 'activity_logs' then
    related_rider_id := new.rider_id;
    if related_rider_id is null and new.user_id is not null then
      select profile.rider_id into related_rider_id
      from public.users profile where profile.id = new.user_id;
    end if;
  elsif tg_table_name = 'support_tickets' then
    select profile.rider_id into related_rider_id
    from public.users profile where profile.id = new.created_by;
  else
    raise exception 'Unsupported hub snapshot table: %', tg_table_name using errcode = '0A000';
  end if;

  if related_rider_id is null then return new; end if;
  select rider.hub_id into rider_hub from public.riders rider where rider.id = related_rider_id;
  if new.hub_id is not null and new.hub_id is distinct from rider_hub then
    raise exception 'Row hub must match the Rider hub.' using errcode = '23514';
  end if;
  new.hub_id := rider_hub;
  return new;
end;
$$;

revoke execute on function public.set_optional_hub_snapshot() from public, anon, authenticated, service_role;
