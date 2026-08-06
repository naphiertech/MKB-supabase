# MKBRiderTrack Engineering Walkthrough

This document records the major maintenance and implementation work completed on MKBRiderTrack through August 5, 2026. It is intended as a practical handoff for future development, debugging, deployment, and audit work.

The walkthrough is based on the current repository, migration history, tests, deployment checks, and relevant Git commits. It focuses on what changed, why it changed, and which safeguards must remain intact.

## 1. Starting approach and maintenance rules

Before implementation, the project was treated as an existing production system rather than a greenfield rewrite.

The working rules were:

- Understand the existing modules and data flow before editing.
- Keep changes incremental and focused.
- Preserve the current application architecture and design language.
- Reuse existing services, components, tables, and Storage buckets.
- Keep Admin, HR, Payroll, and Rider permissions distinct.
- Do not recalculate or rewrite paid payroll.
- Test behavior before and after changes.
- Avoid Supabase Branching and other paid features.
- Use forward-only timestamped migrations instead of blindly running `supabase db push`.

The repository contains:

- `dashboard/`: authenticated React application for Admin, HR, Payroll, and Rider users.
- `landing/`: public Next.js product website.
- `dashboard/supabase/`: database baseline scripts, migrations, and transactional database tests.
- `docs/maintenance-baseline.md`: minimum safety checks for production changes.

## 2. Offline synchronization stabilization

The first major implementation area was the Rider offline queue. The objective was to keep offline Time In, Time Out, and location tracking reliable without rewriting the entire system.

Relevant commits:

- `b55b89d` — Implement offline sync engine, geolocation, and tests.
- `72256cf` — Add sync diagnostics and database integrity tests.

### Queue guarantees added

- Every queued operation receives a stable `idempotencyKey` when the event is created.
- Every operation stores its original `eventTimestamp`.
- Replay uses the original event time instead of the later synchronization time.
- Queue ownership uses the canonical rider ID linked to the authenticated user.
- Synchronization starts only after authentication is ready and the rider profile is loaded.
- Time Out payloads include the rider ID, date, attendance reference, timestamp, optional location, and idempotency key needed for restart-safe replay.
- Operations left in `processing` are recovered through a processing lease after interruption or application restart.
- Retryable failures use bounded retry behavior.
- Unknown actions and unowned legacy operations become permanent failures instead of being silently deleted.
- Permanently failed operations remain available through rider diagnostics.

### Rider identity and device trust

The offline cache mismatch between authentication user IDs and rider IDs was corrected:

- Auth user IDs identify the signed-in account and owner-bound device trust.
- Canonical rider IDs identify attendance, location, parcel, and payroll records.
- Offline access depends on a device trust record established through successful online validation.
- Admin, HR, and Payroll remain online-first browser roles.

### GPS integrity

- Attendance and tracking use verified device readings.
- Time In rejects stale or unavailable coordinates when a fresh location is required.
- Time Out remains possible without inventing coordinates.
- Location inserts are protected by server-side latitude and longitude constraints.

### Server-side integrity

Migration `20260804162434_offline_sync_server_integrity.sql` added or reinforced:

- One attendance record per rider and date.
- Chronological Time In and Time Out.
- Agreement between the attendance date and event timestamp in `Asia/Manila`.
- Valid geographic coordinate ranges.
- Canonical rider ownership in attendance and location RLS.

The regression suite covers duplicate replay, interrupted synchronization, stuck processing recovery, unknown actions, historical timestamps, rider identity correctness, and Time Out replay after restart.

## 3. Rider synchronization diagnostics

The rider interface gained a queue status indicator and diagnostics modal.

The diagnostics workflow exposes:

- Pending synchronization work.
- Permanently failed operations.
- Failure reasons needed for rider or administrator support.
- A safe way to distinguish offline work from successfully synchronized records.

The queue remains local to the Rider workflow and is not used to make Admin, HR, or Payroll offline applications.

## 4. UI/UX production improvements

A system-wide UI/UX audit focused on workflow clarity, accessibility, feedback, consistency, and responsiveness rather than cosmetic redesign.

Relevant commit:

- `db68e82` — Accessibility, lazy-loading, and UX improvements.

### Honest unavailable states

Actions without real backend behavior no longer show fake success messages. Planned features such as support tickets, password reset, account suspension, some security controls, and certain bulk Payroll operations are disabled or labeled `Not yet available`.

This preserves the existing interface while preventing users from believing an operation was completed when no backend action occurred.

### Accessibility and interaction improvements

- Shared modals received stronger focus handling and accessible dialog behavior.
- Required Employee form fields display visible asterisks.
- Forms display `Required fields are marked with *.`
- Labels, inline errors, `aria-invalid`, and `aria-describedby` associations were improved.
- Custom controls such as employment type, zones, and face registration follow the same validation language.
- Page loading and lazy-loading behavior was improved without changing role workflows.
- Existing spacing, typography, colors, drawers, tables, badges, and motion conventions were preserved.

## 5. Supabase production baseline and security foundations

The live Supabase schema was reconciled before adding new data structures. Paid-feature Branching was not used.

The workflow used:

1. Read-only production preflight checks.
2. Paid-payroll fingerprints.
3. Forward-only timestamped migrations.
4. Transactional database assertions.
5. Postflight fingerprint and RLS verification.
6. Regenerated TypeScript types.
7. Application tests, type-check, lint, and production build.

### Parcel Operations security

Migration `20260805051106_secure_parcel_operations_rls.sql`:

- Enabled RLS on parcel correction and audit tables.
- Removed unsafe anonymous access.
- Made parcel audit data append-only.
- Kept Admin and HR as Parcel Operations writers.
- Made Payroll read-only for `parcel_logs`.
- Prevented Rider modification of operational parcel data.

### Employee document foundation

Migration `20260805051114_create_rider_documents_foundation.sql`:

- Added the `rider_documents` metadata table.
- Reused the private `rider-documents` Storage bucket.
- Enforced the 5 MB limit and approved PDF/image MIME types.
- Added deterministic object paths to avoid unlimited duplicate versions.
- Added Admin and HR document-management policies.
- Kept Rider access disabled.

Follow-up migration `20260805051638_fix_rider_document_storage_path_policy.sql` corrected the deterministic Storage-path policy.

### Effective-dated rate configuration

Migration `20260805051121_create_parcel_rate_and_heavy_support.sql` added:

- Effective-dated `parcel_rate_configurations`.
- Rate-change audit history.
- Overlap prevention for effective date ranges.
- Additive heavy-parcel fields.
- Server-side rate resolution based on the work date and attendance time.

Confirmed default values:

- Early standard rate: ₱12 per parcel.
- Regular standard rate: ₱11 per parcel.
- Late/fallback standard rate: ₱10 per parcel.
- Heavy parcel rate: ₱17 per parcel.
- Heavy threshold: above 4 kg.

The heavy rate is fixed per heavy parcel, not calculated per kilogram.

## 6. Employee Documents and Settings integration

Employee Documents were added as a third tab inside Rider Details.

The workflow supports:

- Upload and deterministic replacement.
- Secure viewing through signed URLs.
- Verification and verification identity.
- Deletion according to RLS and Storage policies.
- Document number, issue date, expiration date, notes, uploader, verifier, and timestamps.
- Missing, Pending Verification, Verified, Expiring Soon, and Expired states.
- A 30-day Expiring Soon threshold.

Required document types:

- Driver’s License.
- Government ID.
- Vehicle Registration.
- Employment Contract.

Optional types include Insurance, NBI or Police Clearance, Medical Certificate, and Other.

Admin Settings also gained `Payroll & Parcel Rates`:

- Admin can manage safe future configurations with a required change reason.
- HR and Payroll can view configurations read-only.
- Rider has no access.
- Historical configurations and audit entries remain visible.
- The interface warns that changing rates never alters paid historical payroll.

## 7. Heavy Parcel integration in Parcel Operations

Daily Parcel Entry was expanded to record:

- Standard Delivered.
- Heavy Delivered.
- Failed.
- Returned.
- Notes.

The service layer resolves rates. The UI cannot submit arbitrary rates.

Daily calculation:

```text
Standard earnings = Standard Delivered × attendance-based standard rate
Heavy earnings    = Heavy Delivered × effective heavy parcel rate
Daily gross       = Standard earnings + Heavy earnings
```

Failed and returned parcels earn ₱0.

Parcel History now exposes standard, heavy, failed, returned, delivered, handled, success-rate, applied-rate, earnings, and configuration context without giving Payroll edit access.

The correction workflow records previous and requested standard, heavy, failed, and returned counts. Approved corrections recalculate using the configuration for the original work date, append an audit record, and do not rewrite paid payroll.

Migration `20260805051453_make_daily_gross_heavy_aware.sql` converted `daily_gross` into a stored heavy-aware value maintained by the parcel-rate trigger.

## 8. Heavy-aware Payroll and immutable snapshots

Relevant commit:

- `145545a` — Support heavy-parcel rates and payroll snapshots.

Payroll consumes parcel operational metrics read-only. Parcel Operations remains the source of truth.

### Live versus finalized data

- Draft and rejected payroll may synchronize from live `parcel_logs`.
- Pending, approved, paid, disbursed, and finalized payroll use immutable snapshots.
- Paid and disbursed payroll cannot be overwritten by parcel synchronization.
- The two existing paid payroll records remain legacy calculation-version 1 snapshots.
- Their original totals were not recalculated with current attendance, parcel logs, or rates.

### Daily snapshot table

Migration `20260805051130_create_payroll_delivery_snapshots.sql` added `payroll_delivery_lines`.

Each finalized calculation-version 2 payroll captures:

- Date.
- Standard delivered.
- Heavy delivered.
- Failed and returned counts.
- Applied standard and heavy rates.
- Standard and heavy earnings.
- Gross delivery pay.
- Rate configuration reference.
- Calculation version.

These immutable lines are the source for Payroll History, Payslips, Reports, CSV/PDF/XLSX exports, and audits.

Migration `20260805064031_fix_payroll_delivery_line_rider_policy.sql` prevents a delivery line from being attached to a rider different from the payroll record owner.

### Payroll user experience

- Salary Computation shows a day-by-day Operational Breakdown.
- Payroll Details includes a compact Operational Summary.
- Heavy counts and earnings appear naturally in the existing workflow.
- Historical screens identify legacy aggregate snapshots.
- Exports validate required snapshot data and do not silently reconstruct finalized payroll from live operations.

## 9. CI stabilization

GitHub Actions initially failed because dashboard modules validate Supabase environment variables during import and Supabase Realtime requires native WebSocket support in the Node test environment.

CI was corrected to:

- Use safe placeholder Vite Supabase values for isolated dashboard tests and compilation.
- Run the dashboard job on Node.js 22 for native WebSocket support.
- Keep real deployment credentials outside the workflow.
- Run dashboard type-check, lint, tests, and production build.
- Run landing type-check and build with pnpm.
- Run Supabase database tests only when `SUPABASE_DB_URL` points to a dedicated development or test database.
- Explicitly report when database tests are skipped because that secret is absent.

Relevant commits:

- `240daf6` and `ace5bec` — CI corrections.

Test files belong in Git and should be pushed. They protect synchronization, payroll, documents, rate configuration, operations, geolocation, and form behavior from regression.

## 10. README refresh

Relevant commit:

- `0ccfd62` — Add dashboard README and update landing and root README.

The three READMEs were rewritten to match the current system:

- Root project overview and workspace commands.
- Dashboard roles, architecture, offline contract, database workflow, and integrity rules.
- Landing routes, review moderation flow, environment variables, and deployment steps.

The root `.gitignore` was updated narrowly so the root, dashboard, landing, and this walkthrough documentation can be committed while unrelated generated Markdown remains ignored.

## 11. Payroll “Error loading logs” investigation and repair

Relevant commit:

- `f375d8a` — Backfill parcel rates and protect payroll synchronization.

### Reported symptoms

The Payroll Salary Computation page showed:

```text
Error loading logs
Failed to fetch logs from Supabase.
```

The browser console reported:

- `MissingPayrollSnapshotError` for incomplete stored rate data.
- Missing heavy-rate snapshots for August 1, 3, and 4.
- A separate `POST /attendance_logs` response with status 400.

### Root cause

Three editable August parcel rows were created before heavy-parcel metadata was required. They contained valid standard counts and earnings but had:

```text
heavy_rate = NULL
rate_configuration_id = NULL
```

Payroll correctly failed closed because incomplete rate snapshots must never enter a finalized payslip.

Two additional code behaviors were identified:

- Payroll synchronization validated legacy parcel rows before checking whether the related payroll was finalized.
- The Payroll attendance lookup reused a loader that attempted daily attendance finalization, causing a read-only Payroll account to issue an unauthorized insert.

### Fix applied

Migration `20260805100101_backfill_working_parcel_rate_metadata.sql`:

- Backfilled only editable or unfinalized parcel rows.
- Added the ₱17 heavy rate and active configuration reference.
- Aborted if any eligible row contained heavy parcels or inconsistent historical earnings requiring manual review.
- Left parcel counts, standard rates, standard earnings, heavy earnings, and daily gross unchanged.
- Left parcel rows belonging to finalized legacy payroll untouched.
- Updated the rate trigger so an approved future edit can safely repair missing additive metadata.

Application changes:

- `syncPayrollRecordsFromParcelLogs()` now loads payroll status before validating live parcel metadata.
- Finalized payroll is skipped before legacy live-row validation and remains immutable.
- Draft, rejected, or new payroll still fails closed when required rate metadata is incomplete.
- `getRiderAttendanceInDateRange()` now performs a rider-scoped, read-only lookup and does not trigger attendance finalization.

### Production verification

- The three August operational fingerprints were unchanged after metadata repair.
- Both protected paid-payroll fingerprints remained unchanged.
- No editable parcel rows remained with missing heavy-rate metadata.
- Legacy parcel rows attached to paid calculation-version 1 payroll remained untouched.
- The new migration was recorded in Supabase migration history.

## 12. Current data flow

### Rider attendance and location

```text
Rider action
  → verified auth user and canonical rider profile
  → fresh GPS/face checks where required
  → online Supabase write OR offline IndexedDB queue
  → idempotent replay after authentication
  → attendance/location tables protected by RLS and constraints
```

### Parcel Operations to Payroll

```text
Admin/HR parcel entry
  → service resolves effective-dated configuration
  → parcel_logs stores counts, applied rates, and earnings
  → draft/rejected payroll reads live operational rows
  → submission creates immutable payroll_delivery_lines
  → history, payslips, reports, and exports read snapshots
  → paid/disbursed payroll cannot be rewritten
```

### Employee documents

```text
Admin/HR action
  → deterministic private Storage path
  → rider_documents metadata
  → RLS and Storage policy authorization
  → signed URL for secure viewing
  → verification and expiration status in Rider Details
```

## 13. Verification baseline

After the latest Payroll repair:

- Dashboard unit/integration tests: 58 passed across 12 files.
- TypeScript type-check: passed.
- ESLint: zero errors and eight existing warnings.
- Dashboard production build: passed.
- Supabase paid-payroll invariants: passed.
- Editable parcel metadata postflight: passed.
- Migration history: verified.

The build still reports a large-chunk warning. It does not block deployment, but future performance work may split large export, reporting, mapping, or vision dependencies.

## 14. Invariants future changes must preserve

1. Parcel Operations is the source of truth for delivery data.
2. Payroll cannot edit `parcel_logs`.
3. Rates are resolved by work date and stored with the operational record or immutable payroll snapshot.
4. Paid, disbursed, and finalized payroll must never be recalculated automatically.
5. Historical exports must use immutable snapshot data.
6. Legacy calculation-version 1 payroll must not be reconstructed from current operational data.
7. Rider attendance and locations must use the canonical rider ID.
8. Offline operations must retain idempotency keys and original event timestamps.
9. Synchronization must wait for authenticated rider identity.
10. Unknown or permanently failed queue operations must remain diagnosable.
11. Rider documents must remain private and policy-protected.
12. Frontend role checks must not replace RLS authorization.

## 15. Known follow-up work

The following items were observed but were not expanded into unrelated changes:

- Existing ESLint warnings should be addressed in a focused cleanup.
- Large production chunks may benefit from additional code splitting.
- Supabase database tests require a safe `SUPABASE_DB_URL` CI secret to run automatically.
- Supabase advisors still report pre-existing security and performance findings, including the attendance summary view and older functions/policies. These need a separate audited migration because changing them can affect authentication and RLS behavior.
- Features labeled `Not yet available` still require real backend workflows before they can be enabled.

Before any future production change, run:

```bash
npm run check
npm run build
```

For database work, also run the baseline scripts, transactional database assertions, RLS checks, Storage checks where relevant, and the paid-payroll fingerprint postflight.
