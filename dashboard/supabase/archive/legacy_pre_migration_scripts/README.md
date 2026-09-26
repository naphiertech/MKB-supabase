# Archived Legacy Pre-Migration Scripts

These SQL files were historically stored in `dashboard/supabase/migrations/` without timestamp prefixes:

- `backend_geofencing.sql`
- `cache_rider_face_descriptor.sql`
- `create_reviews_table.sql`
- `payroll_workflow_security.sql`
- `update_my_last_login.sql`

## Important Notices

1. **Predate Timestamped Supabase Migrations:**
   These scripts were written and applied directly in June and July 2026 before Supabase CLI versioned migration tracking was instituted (which began at `20260804162434_offline_sync_server_integrity.sql`). Because their filenames lacked numerical timestamps, Supabase CLI skipped them during fresh database replay.

2. **Incorporated into Reconstructed Baseline:**
   The intended schema objects defined by these files (tables, functions, triggers, RLS policies, and indexes) have been fully incorporated into `dashboard/supabase/migrations/20260804000000_initial_schema_baseline.sql`.

3. **Historical Reference Only:**
   These files are preserved here solely for auditability and historical reference. **They must not be executed independently against production or development environments**, as doing so could overwrite policies or execute un-guarded statements (e.g. historical `DROP TABLE IF EXISTS` clauses).
