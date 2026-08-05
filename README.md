# MKBRiderTrack

MKBRiderTrack is a workforce operations system for managing delivery riders. It combines attendance, location and geofence monitoring, parcel operations, employee records, and payroll in one role-based platform.

The repository contains two applications backed by the same Supabase project:

| Application | Purpose | Default URL |
| --- | --- | --- |
| [`dashboard/`](dashboard/README.md) | Authenticated portals for Admin, HR, Payroll, and Rider users | `http://localhost:5173` |
| [`landing/`](landing/README.md) | Public product website and moderated review submission | `http://localhost:3000` |

## Main capabilities

- Role-based Admin, HR, Payroll, and Rider experiences.
- Rider attendance with face verification, GPS validation, and geofence checks.
- Live rider monitoring, route history, zone management, and violation tracking.
- Standard and heavy parcel recording with effective-dated rates and correction audits.
- Payroll calculation, approval, immutable finalized snapshots, payslips, reports, and exports.
- Employee registration, rider profiles, and private document management.
- Rider offline attendance and location synchronization with idempotent, recoverable queue processing.
- Supabase Auth, PostgreSQL, Storage, Realtime, and Row Level Security (RLS).

## Technology

- **Dashboard:** React 18, Vite 5, TypeScript, Tailwind CSS 3, Supabase JS, Dexie, Leaflet, Recharts, and Vitest.
- **Landing:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Radix UI, GSAP, Framer Motion, and Cloudflare Turnstile.
- **Backend:** Supabase PostgreSQL, Auth, Realtime, private Storage, SQL migrations, RLS policies, and pgTAP tests.

## Repository layout

```text
MKB-supabase/
|-- dashboard/                 Authenticated operations application
|   |-- src/                   React pages, components, services, and tests
|   `-- supabase/              Baseline checks, migrations, and database tests
|-- landing/                   Public Next.js website
|   |-- app/                   App Router pages and reviews API route
|   |-- components/            Site sections and shared UI components
|   `-- lib/                   Shared content and utilities
|-- docs/
|   `-- maintenance-baseline.md
|-- .github/workflows/ci.yml   Dashboard, landing, and optional database CI
`-- package.json               Workspace convenience scripts
```

## Prerequisites

- Node.js 22 is recommended. The dashboard test environment relies on native WebSocket support available in Node 22.
- npm for the root and dashboard packages.
- pnpm 10 for the landing application. The root installer can invoke it through `npx`.
- A Supabase project and Supabase CLI only when working with database migrations or pgTAP tests.

## Local setup

1. Install all dependencies from the repository root:

   ```bash
   npm install
   ```

2. Create `dashboard/.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_LANDING_URL=http://localhost:3000
   # Optional: country/state/city selector integration
   VITE_CSC_API_KEY=your-api-key
   ```

3. Create `landing/.env.local`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_DASHBOARD_URL=http://localhost:5173
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=your-turnstile-site-key
   TURNSTILE_SECRET_KEY=your-turnstile-secret-key
   ```

4. Start both applications:

   ```bash
   npm run dev
   ```

Never commit local environment files or service-role credentials. Frontend applications must use the public anon key and rely on RLS for authorization.

## Root commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the dashboard and landing site together |
| `npm run dev:dashboard` | Run only the Vite dashboard |
| `npm run dev:landing` | Run only the Next.js landing site |
| `npm run typecheck` | Type-check both applications |
| `npm run lint:dashboard` | Lint the dashboard |
| `npm test` | Run dashboard unit tests |
| `npm run check` | Run type checks, dashboard lint, and dashboard tests |
| `npm run build` | Create production builds for both applications |

## Database workflow

The tracked Supabase foundations are under `dashboard/supabase/`:

- `baseline/` contains read-only preflight and paid-payroll invariant checks.
- `migrations/` contains forward-only SQL migrations.
- `tests/database/` contains transactional pgTAP assertions.

Do not run `supabase db push` blindly against the existing migration folder or execute `attenrider_schema.sql` against an existing environment. Reconcile the target schema first, review each unapplied migration, test it against the development database or a recent copy, and verify protected payroll records before and after deployment. Paid, disbursed, and finalized historical payroll must remain immutable.

Database tests can be run from `dashboard/` with a safe development or test connection:

```bash
supabase test db --db-url "$SUPABASE_DB_URL" supabase/tests/database
```

Do not point transactional tests at production.

## Continuous integration

GitHub Actions verifies:

- Dashboard type-check, lint, unit tests, and production build on Node.js 22.
- Landing type-check and production build with pnpm on Node.js 20.
- Supabase pgTAP tests when the `SUPABASE_DB_URL` repository secret is configured.

The dashboard CI job uses non-secret placeholder Supabase values because unit tests and compilation do not contact the service. Deployment environments must provide the real project URL and anon key.

## Data ownership rules

- `parcel_logs` is the operational source of truth. Admin and HR manage parcel operations; Payroll consumes the data read-only.
- Paid and disbursed payroll records and finalized delivery-line snapshots are immutable.
- Historical calculations keep their captured rates and counts instead of being recalculated with current settings.
- Rider records use the canonical rider ID linked to the authenticated user.
- The `rider-documents` bucket is private and access is enforced by Storage policies.

See [`docs/maintenance-baseline.md`](docs/maintenance-baseline.md) before changing production behavior.
