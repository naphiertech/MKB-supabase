# MKBRiderTrack Dashboard

The dashboard is the authenticated MKBRiderTrack application for Admin, HR, Payroll, and Rider users. It is a React single-page application backed directly by Supabase Auth, PostgreSQL, Realtime, and Storage.

## Role experiences

| Role | Primary access |
| --- | --- |
| Admin | System overview, monitoring, zones, employee records, documents, parcel operations, payroll oversight, reports, reviews, audit logs, and settings |
| HR | Attendance, monitoring, employee records, documents, parcel operations, payroll review, reports, reviews, and audit logs |
| Payroll | Payroll computation, history, reports, and read-only parcel context |
| Rider | Attendance, location tracking, assigned-zone status, profile, and offline synchronization diagnostics |

Authorization is enforced by Supabase RLS and Storage policies. Page visibility is a user-experience guard, not the security boundary.

## Current modules

- **Authentication:** Supabase sessions, role resolution, and canonical rider-profile loading.
- **Attendance:** Face capture, GPS freshness checks, Time In/Time Out, daily logs, and status handling.
- **Monitoring:** Realtime rider presence, maps, route trails, geofence status, and violation events.
- **Employee management:** Registration, editing, face registration, employment details, zones, and private rider documents.
- **Parcel Operations:** Standard delivered, heavy delivered, failed, returned, notes, rate context, history, correction requests, and audit records.
- **Payroll:** Heavy-aware daily computation, allowances, deductions, approvals, disbursement, immutable delivery snapshots, payslips, and exports.
- **Settings:** Profile controls and effective-dated Payroll & Parcel Rates configuration.
- **Offline rider support:** IndexedDB caching and an idempotent queue for attendance and location operations.

## Technology

- React 18 and TypeScript
- Vite 5
- Tailwind CSS 3
- Supabase JS 2
- Dexie/IndexedDB for rider offline data
- MediaPipe Tasks Vision for face matching
- Leaflet, React Leaflet, and Turf for maps and geospatial checks
- Recharts for analytics
- ExcelJS, SheetJS, jsPDF, and jsPDF AutoTable for exports
- Vitest and fake-indexeddb for regression tests

## Structure

```text
dashboard/
|-- src/
|   |-- components/            Shared and feature-specific UI
|   |-- contexts/              Authentication and application context
|   |-- hooks/                 Reusable React hooks
|   |-- lib/                   Supabase, offline storage, sync, and utilities
|   |-- pages/                 Role-aware application screens
|   |-- services/              Database and domain operations
|   |-- types/                 Application and generated database types
|   `-- App.tsx                Authentication gate and page orchestration
|-- supabase/
|   |-- baseline/              Preflight and payroll invariant scripts
|   |-- migrations/            Forward-only database migrations
|   `-- tests/database/        Transactional pgTAP tests
|-- vite.config.ts
|-- vitest.config.ts
`-- package.json
```

The application uses an internal page key and role-aware sidebar rather than URL routes. `src/App.tsx` is the main orchestration entry point and limits each authenticated role to its supported pages.

## Environment variables

Create `dashboard/.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_LANDING_URL=http://localhost:3000
# Optional: used by address selectors in Settings and employee forms
VITE_CSC_API_KEY=your-api-key
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required when the Supabase client module loads. Use only the public anon key in the browser; never expose the service-role key.

## Development

Node.js 22 is recommended. Supabase Realtime initialization in the Node-based test environment expects native WebSocket support, which is available in Node 22.

```bash
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5173` by default.

## Verification commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use `npm run test:watch` during development and `npm run preview` to inspect the production build locally.

## Offline synchronization contract

Rider offline operations are stored in IndexedDB and replay only after authentication and rider-profile resolution. Queue items contain:

- A stable idempotency key generated when the event occurs.
- The original event timestamp.
- The canonical rider ID.
- Enough attendance and location data to replay without in-memory state.

Interrupted `processing` items are recovered through a lease, retryable failures use bounded backoff, and permanently failed or unknown actions remain available in rider diagnostics. Do not start synchronization before both the auth user ID and linked rider ID are known.

## Parcel and payroll integrity

- Standard parcels are 4 kg or below; heavy parcels are above 4 kg.
- Heavy pay is a fixed amount per heavy parcel, not a per-kilogram calculation.
- Rates are resolved from the effective-dated configuration for the work date; the UI does not submit arbitrary rates.
- `parcel_logs` remains the Parcel Operations source of truth and is read-only to Payroll.
- Draft or rejected payroll can be refreshed from parcel operations.
- Pending, approved, paid, disbursed, and finalized historical payroll use protected snapshots and must not be rewritten by synchronization.
- Finalized daily lines are stored in `payroll_delivery_lines` for history, payslips, reports, exports, and audits.

## Employee documents

Documents use the private `rider-documents` Storage bucket and the `rider_documents` table. Admin and HR workflows support upload, replacement, secure signed viewing, verification, and deletion according to deployed policies. Files are limited to 5 MB and approved PDF or image MIME types. Rider access is not permitted.

## Database changes

1. Inspect the target Supabase schema and migration history.
2. Run the relevant read-only scripts in `supabase/baseline/`.
3. Add a new timestamped, forward-only migration; do not rewrite an applied migration.
4. Review and test it against the development database or a recent non-production copy.
5. Run the pgTAP files under `supabase/tests/database/`.
6. Regenerate TypeScript database types from the same project.
7. Re-run type-check, lint, unit tests, and build.
8. Verify RLS for Admin, HR, Payroll, and Rider and confirm paid-payroll fingerprints remain unchanged.

Do not run `supabase db push` blindly against this historical migration folder. Do not execute the root `attenrider_schema.sql` against an existing environment.

To run the database assertions against a safe database:

```bash
supabase test db --db-url "$SUPABASE_DB_URL" supabase/tests/database
```

Never target production with transactional tests.

## CI notes

The GitHub Actions dashboard job runs on Node.js 22 and executes install, type-check, lint, tests, and build. It supplies placeholder Vite Supabase values only so imported client modules can initialize during isolated verification. Real deployment values must be configured in the deployment environment.

Database assertions run separately only when the `SUPABASE_DB_URL` GitHub secret points to a dedicated development or test database.
