-- The geofence trigger pins an empty search_path. Qualify the existing rider
-- audit trigger so it remains safe and functional when invoked by geofencing.
create or replace function public.handle_audit_rider_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    or old.zone_id is distinct from new.zone_id then
    insert into public.activity_logs (
      rider_id,
      event_type,
      description,
      metadata
    ) values (
      new.id,
      'rider_update',
      'Rider ' || new.name || ' status changed from ' ||
        coalesce(old.status::text, 'unknown') || ' to ' ||
        coalesce(new.status::text, 'unknown'),
      jsonb_build_object(
        'old_status', old.status,
        'new_status', new.status,
        'old_zone_id', old.zone_id,
        'new_zone_id', new.zone_id
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.handle_audit_rider_updates() from public, anon, authenticated;
