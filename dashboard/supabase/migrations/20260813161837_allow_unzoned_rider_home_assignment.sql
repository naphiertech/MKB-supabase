-- Preserve the existing supported state where a Rider can be assigned to a Hub
-- while waiting for a Zone. A non-null Zone must still belong to its Hub.
create or replace function public.enforce_rider_home_assignment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  home_zone_hub uuid;
begin
  if tg_op = 'INSERT' then
    new.home_hub_id := coalesce(new.home_hub_id, new.hub_id);
    new.home_zone_id := coalesce(new.home_zone_id, new.zone_id);
  end if;

  if new.home_zone_id is not null then
    select zone.hub_id into home_zone_hub
    from public.zones zone where zone.id = new.home_zone_id;
    if not found then
      raise exception 'Home Zone was not found.' using errcode = '23503';
    end if;
    if home_zone_hub is null or new.home_hub_id is distinct from home_zone_hub then
      raise exception 'Home Hub and Home Zone must belong together.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_rider_home_assignment_consistency() from public, anon, authenticated, service_role;

create or replace function public.enforce_rider_assignment_history_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_zone_hub uuid;
  target_zone_hub uuid;
begin
  if new.from_zone_id is not null then
    select zone.hub_id into source_zone_hub from public.zones zone where zone.id = new.from_zone_id;
    if not found or source_zone_hub is distinct from new.from_hub_id then
      raise exception 'Source Hub and Source Zone must belong together.' using errcode = '23514';
    end if;
  end if;

  select zone.hub_id into target_zone_hub from public.zones zone where zone.id = new.target_zone_id;
  if not found or target_zone_hub is distinct from new.target_hub_id then
    raise exception 'Target Hub and Target Zone must belong together.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_rider_assignment_history_consistency() from public, anon, authenticated, service_role;
