-- Cover the new audit and assignment foreign keys used by Hub Management.
create index hubs_created_by_idx
  on public.hubs (created_by)
  where created_by is not null;

create index hubs_updated_by_idx
  on public.hubs (updated_by)
  where updated_by is not null;

create index user_hub_access_assigned_by_idx
  on public.user_hub_access (assigned_by)
  where assigned_by is not null;
