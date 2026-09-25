-- Existing geofence and employee-lifecycle functions record when a violation
-- is resolved. Keep pre-existing rows nullable because their exact historical
-- resolution timestamps are not available.
alter table public.violations
  add column if not exists resolved_at timestamptz;
