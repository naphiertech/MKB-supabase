create index rider_assignments_from_hub_id_idx on public.rider_assignments (from_hub_id);
create index rider_assignments_from_zone_id_idx on public.rider_assignments (from_zone_id);
create index rider_assignments_target_zone_id_idx on public.rider_assignments (target_zone_id);
create index rider_assignments_created_by_idx on public.rider_assignments (created_by);
create index rider_assignments_ended_by_idx on public.rider_assignments (ended_by) where ended_by is not null;
