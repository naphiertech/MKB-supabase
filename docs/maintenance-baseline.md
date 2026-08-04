# Maintenance Baseline

This document defines the minimum checks required before changing production behavior.

## Local quality checks

Run these commands from the repository root:

```bash
npm run check
npm run build
```

`npm run check` type-checks both applications, lints the dashboard, and runs the dashboard regression tests. The landing application does not currently install an ESLint toolchain, so CI does not claim landing lint coverage.

## Database source of truth

The tracked files under `dashboard/supabase/migrations/` are historical migrations. The ignored root `attenrider_schema.sql` and the generated TypeScript database types do not currently agree with every query used by the application.

Before making a database-dependent change:

1. Export the live Supabase schema, including tables, enums, views, functions, triggers, grants, and RLS policies.
2. Compare the export with the tracked migrations and application queries.
3. Regenerate the TypeScript database types from the same Supabase project.
4. Create a new forward-only migration for the intended change; do not rewrite an already-applied migration.
5. Test the migration against a recent non-production data copy.

Do not execute the ignored root schema file against an existing environment.

## Safe deployment and rollback

- Use expand-and-contract migrations for renamed, constrained, or removed fields.
- Keep application releases compatible with both the old and expanded schema during rollout.
- Back up affected data before destructive migrations.
- Record the reverse operation or recovery procedure before deployment.
- Verify admin, HR, payroll, and rider permissions after every RLS change.
- Verify online and offline attendance paths after changes to attendance or synchronization logic.

## Current baseline limitations

- Live Supabase schema reconciliation still requires access to the authoritative project.
- Dashboard lint passes with existing warnings; CI fails only on lint errors.
- Automated tests cover offline storage, synchronization recovery/identity/timestamps/restart behavior, and pure geofence utilities. Live Supabase, RLS, payroll, and end-to-end authentication tests remain follow-up work.

## Offline synchronization contract

- Queue rows are owned by a canonical rider ID and include a stable `idempotencyKey` plus the original `eventTimestamp`.
- Time In and location inserts reuse the client idempotency key as a database UUID. Time Out replays update the stored attendance-log reference.
- Replay starts only after authentication readiness and the linked rider profile provide both the auth user ID and rider ID.
- A two-minute processing lease recovers operations interrupted by a crash. Retryable failures use exponential backoff and become permanent after five attempts.
- Unknown or unowned legacy operations are retained as permanent failures instead of being deleted or assigned to an unverified rider.
- Permanently failed operations remain in IndexedDB, appear in the rider navigation indicator, and are available through `SyncEngine.getFailedOperations()`.
- Rider attendance and tracking persist only verified device GPS readings. Time In requires a reading no older than two minutes; Time Out remains available without inventing coordinates.
- Rider offline access requires an owner-bound device trust record created by successful online validation and expires after seven days. Admin, HR, and Payroll remain online-first web roles.
