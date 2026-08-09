# MKBRiderTrack Engineering Walkthrough & Codex Handoff

This document is the authoritative engineering reference and handoff document for **MKBRiderTrack**. It records the current implementation state, verified architecture, database schema, security rules, recent bug fixes, and deferred features as of **August 9, 2026**.

This walkthrough is derived directly from the active repository source code, Supabase database migrations, test suites, and production build verification.

> **Note for Next IDE (Codex / Antigravity)**: When modifying or extending MKBRiderTrack, treat this document as the ground truth for current functionality. Features explicitly tagged as **PLANNED / DEFERRED** must not be documented as existing functionality.

---

## 1. Project Overview

**MKBRiderTrack** is a production-grade fleet management, rider attendance, parcel operations tracking, and automated payroll system designed for last-mile logistics operations in the Philippines.

### Core Technology Stack
- **Frontend App (`dashboard/`)**: React 18.3.1 SPA built with TypeScript, Vite, Tailwind CSS, Lucide icons, and Framer Motion micro-animations.
- **Public Website (`landing/`)**: Next.js 16.1.6 application using React 19.2.4, Tailwind CSS, and the Next.js App Router.
- **Backend & Database**: Supabase (Cloud PostgreSQL 15, Row Level Security, Supabase Auth, Realtime WebSocket subscriptions, Supabase Storage).
- **Biometrics & AI**: `face-api.js` (TensorFlow.js WebGL backend) for 128-float facial vector extraction and MediaPipe for liveness/blink detection.
- **Offline Outbox**: Dexie.js (IndexedDB wrapper) with idempotency keys, original timestamp replay, and stale-while-revalidate state management for mobile riders.

---

## 2. Current Role & Security Model

MKBRiderTrack enforces strict role-based authorization across both the frontend React UI and Supabase Row Level Security (RLS) policies.

| Role | Primary Responsibilities | Major Module Access | RLS Boundary |
| :--- | :--- | :--- | :--- |
| **Admin** | Broad administrative authority, rate settings, user management, audit review, and permitted override actions | All pages (Dashboard, Tracking & Zones, HR & Employees, Parcel Operations, Finance & Reports, Settings) | Broad administrative access, constrained by deployed RLS policies, workflow triggers, append-only audit protections, and immutable payroll rules |
| **HR** | Attendance verification, employee onboarding, document verification, review moderation | Dashboard, Live Monitoring, Attendance, Employee Registry, Reviews, Audit Logs, Daily Parcel Entry, Parcel History, Payroll Checklist | Read/Write on HR, Employees, Attendance, Documents, Parcel Entry; Read-only on Rates |
| **Payroll** | Salary computation, cutoff initialization, payslip generation, payroll exports, approval tracking | Dashboard, Salary Computation, Payroll Reports, Payroll History, Parcel History (Reference) | Read/Write on Payroll Records/Snapshots; Read-only on `parcel_logs`, Attendance, and Rates |
| **Rider** | Selfie Time-In/Out, live location broadcast, offline queue, personal attendance & payslips | Rider Mobile App (Dashboard, Attendance Scanner, Monitoring/Geofence Status, Profile/Payslips) | Read/Write on own Attendance, Locations, Diagnostics; Read-only on own Payslips/Logs |

> [!IMPORTANT]
> **Multi-Hub HR/Payroll Architecture** (e.g. 4 regional hubs, local vs main HR/Payroll scoping) is **PLANNED / DEFERRED**. Currently, the system uses a single organization-wide role model (**Admin**, **HR**, **Payroll**, **Rider**).

---

## 3. Current Navigation & Sidebar Architecture

### Navigation Configurations (`src/components/common/sidebar/sidebarNavigation.ts`)

#### 1. Admin Role (`ADMIN_ITEMS`)
- **Dashboard** (`key: 'dashboard'`)
- **Tracking & Zones** *(Collapsible)*: Live Monitoring (`monitoring`), Geofence / Zones (`geofence`)
- **HR & Employees** *(Collapsible)*: Attendance logs (`attendance`), Users Registry (`users`), Courier Reviews (`reviews`), Audit Logs (`audit_logs`)
- **Parcel Operations** *(Collapsible)*: Daily Parcel Entry (`daily_parcels`), Parcel History (`parcel_history`)
- **Finance & Reports** *(Collapsible)*: Payroll Checklist (`payroll`), Payroll History (`payroll_history`), Insights & Reports (`reports`)

#### 2. HR Role (`HR_ITEMS`)
- **Dashboard** (`key: 'dashboard'`)
- **Tracking & Zones** *(Collapsible)*: Live Monitoring (`monitoring`)
- **HR & Employees** *(Collapsible)*: Attendance logs (`attendance`), Employee Management (`users`), Courier Reviews (`reviews`), Audit Logs (`audit_logs`)
- **Parcel Operations** *(Collapsible)*: Daily Parcel Entry (`daily_parcels`), Parcel History (`parcel_history`)
- **Finance & Reports** *(Collapsible)*: Payroll Checklist (`payroll`), Payroll History (`payroll_history`), Insights & Reports (`reports`)

#### 3. Payroll Role (`PAYROLL_ITEMS`)
- **Dashboard** (`key: 'dashboard'`)
- **Compensation** *(Collapsible)*: Salary Computation (`computation`), Payroll Reports (`reports`), Payroll History (`payroll_history`)
- **Reference** *(Collapsible)*: Parcel History (`parcel_history`) — *Read-only reference access*

#### 4. Rider Role Navigation (`src/components/rider/RiderTopNav.tsx`)
- Mobile Navigation Bar: Dashboard (`dashboard`), Attendance (`attendance`), Live Map (`monitoring`), Profile & Payslips (`profile`)

---

### Collapsible Sidebar Architecture
The desktop sidebar is modularized into reusable presentation components under `src/components/common/sidebar/`:

- **`Sidebar.tsx`**: Main coordinator and public entry point.
- **`SidebarNavGroup.tsx`**: Renders collapsible section headers with active child highlight indicator (`hasActiveChild`), expand/collapse chevron, and badge notifications.
- **`SidebarNavItem.tsx`**: Individual navigation link item.
- **`SidebarFlyout.tsx`**: Hover/focus popover flyout for collapsed icon-only mode.
- **`SidebarFooter.tsx`**: User profile card, account settings shortcut, and sign-out trigger.
- **`useSidebarCollapse.ts`**: Handles expanded (256px / `w-64`) vs collapsed (72px / `w-[72px]`) width state with `localStorage` key (`mkb_sidebar_collapsed`) and spring animations (0.22s cubic-bezier curve).

---

## 4. Current Page Structure

All major pages reside under `src/pages/`:

```
src/pages/
├── AdminDashboard.tsx       # Operations control panel & real-time KPI overview
├── Attendance.tsx           # Fleet attendance verification, date/status filters, & audit table
├── AuditLogs.tsx            # Security events, configuration audits, & administrative logs
├── DailyParcelEntry.tsx     # Daily delivery logs entry, heavy parcel counts, & rate context
├── Geofence.tsx             # Geofence boundary setup, map canvas, & rider zone assignments
├── HRDashboard.tsx          # HR metrics, rider status grid, & violation summary
├── LiveMonitoring.tsx       # Real-time rider location tracking map & live activity ticker
├── Login.tsx                # Secure authentication portal with demo login shortcuts
├── NotFound.tsx             # 404 Error page
├── ParcelHistory.tsx        # Delivery history audit table, correction requests, & rate logs
├── PayrollComputation.tsx   # Cutoff selector, fleet initialization, & rider computation table
├── PayrollDashboard.tsx     # Payroll overview, approval workspace, & cutoff activities
├── PayrollHistory.tsx       # Finalized payout archives & historical payslip records
├── PayrollReports.tsx       # Payroll summary generator & multi-format export workspace
├── Reports.tsx              # Operations analytics, charts, & performance breakdown
├── ReviewsModeration.tsx    # Customer reviews & courier feedback moderation workspace
├── RiderAttendance.tsx     # Rider mobile Time-In/Out selfie & MediaPipe liveness scanner
├── RiderDashboard.tsx      # Rider mobile home, duty action panel, & payslip portal
├── RiderMonitoring.tsx     # Rider mobile active zone map & location status ticker
├── RiderProfile.tsx        # Rider personal details, emergency contacts, & face enrollment
├── Settings.tsx             # System parameters & effective-dated parcel rate manager
└── Users.tsx                # Employee management, user onboarding, & role assignments
```

---

## 5. Attendance & Biometric Architecture

### Attendance Rules & Workflow
- **Time-In / Time-Out**: Rider captures a live camera snapshot on mobile.
- **Shift & Cutoff Rules**: Automatically checks Manila time (`Asia/Manila`). On-time vs Late status determined by schedule thresholds.
- **Automatic Absent Handling**: System marks missing Time-Ins at shift cutoff.

### Biometric Verification Architecture (`dashboard/src/lib/faceAi.ts`)
- **Models**: `face-api.js` powered by TensorFlow.js WebGL backend (`ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet`).
- **MediaPipe Liveness**: Integrated blink detection / head movement check to prevent photo spoofing.
- **Descriptor Storage**: 128-element float vector stored in `riders.face_descriptor` (JSONB / Float array).
- **Duplicate Check**: On onboarding, new face descriptors are checked against all existing riders using Euclidean distance (Threshold = `0.45`). Matches below threshold reject registration as duplicate face.
- **Warmup & Caching**: Model weights preloaded during application initialization; canvas warmup prevents first-scan camera lag.

---

## 6. Parcel Operations & Effective-Dated Rates

### Parcel Operations (`DailyParcelEntry.tsx`, `ParcelHistory.tsx`)
- **Parcel Categories**: Standard Delivered, Heavy Delivered, Failed, Returned, Notes.
- **Audit & Correction**: Edits create append-only audit entries in `parcel_log_audit`. Corrections submit entries to `parcel_correction_requests` requiring HR/Admin approval.
- **Source of Truth**: `parcel_logs` is the operational source of truth, but it is not strictly immutable. Approved correction workflows may update operational parcel records while `parcel_correction_requests` and append-only `parcel_log_audit` history preserve accountability.

### Effective-Dated Rate Engine (`parcel_rate_configurations`)
- Rates are effective-dated based on work date (`date`) and attendance Time-In.
- Overlap prevention prevents conflicting date ranges.
- **Default Rate Tokens**:
  - Early Standard Rate: **₱12.00 / parcel**
  - Regular Standard Rate: **₱11.00 / parcel**
  - Late/Fallback Standard Rate: **₱10.00 / parcel**
  - Heavy Parcel Rate: **₱17.00 / parcel**
  - Heavy Weight Threshold: **> 4.0 kg**
- **Heavy Parcel Rule**: Delivered parcels exceeding 4 kg threshold receive the fixed heavy rate per parcel (₱17.00/parcel), not calculated per kg.

```text
Standard Earnings = Standard Delivered × Effective Standard Rate
Heavy Earnings    = Heavy Delivered × Effective Heavy Rate (₱17)
Daily Gross Pay   = Standard Earnings + Heavy Earnings
Failed / Returned = ₱0.00
```

---

## 7. Payroll Architecture & Data Invariants

### Status Workflow
```text
Draft  ──►  Submitted (Pending Review)  ──►  Approved  ──►  Paid / Disbursed
  ▲                     │
  └──── Rejected ◄──────┘
```

### Critical Payroll Data Invariants (Source of Truth Rule)

```text
Parcel Operations (parcel_logs)   ──►  OPERATIONAL SOURCE OF TRUTH (Controlled corrections are audited)
Draft Payroll (payroll_records)   ──►  DERIVED WORKING DATA (Calculated from parcel_logs)
Finalized Payroll (payroll_delivery_lines) ──► IMMUTABLE SNAPSHOT DATA (Never rewritten)
```

1. **Pure Read Queries (`getPayrollRecords`, `getPaginatedPayrollRecords`)**:
   - `getPayrollRecords()` and `getPaginatedPayrollRecords()` are **100% pure read-only `SELECT` queries**.
   - They **never** perform write side-effects or automatic payroll synchronization during reads.
   - Searching, filtering, paginating, or refreshing list views executes pure `SELECT` queries.

2. **Payroll Synchronization (`syncPayrollRecordsFromParcelLogs`)**:
   - Accepts `options?: SyncPayrollOptions` (`{ allowCreateMissing?: boolean }`).
   - **`allowCreateMissing: false` (Default)**: Updates calculations for existing `DRAFT` or `REJECTED` payroll records from `parcel_logs`. Does **not** recreate draft records that were intentionally deleted.
   - **`allowCreateMissing: true`**: Used only during explicit initialization actions to generate missing draft records for riders with parcel logs.

3. **Payroll Deletion Lifecycle**:
   - Deleting a payroll draft (single or bulk) executes `DELETE FROM payroll_records WHERE id = ...`.
   - Only the target `payroll_records` row is removed.
   - **Source data is 100% preserved**: `parcel_logs`, `parcel_log_audit`, `parcel_correction_requests`, `attendance_logs`, `riders`, and `parcel_rate_configurations` are **NEVER deleted or modified**.
   - Refetching or page refreshing executes pure `SELECT`, so deleted drafts stay absent.

4. **Fleet Cutoff Initialization Hydration (`initializeCutoffPayrollForFleet`)**:
   - `initializeCutoffPayrollForFleet()` identifies missing fleet riders for a cutoff and batch-inserts initial draft records.
   - Immediately executes `syncPayrollRecordsFromParcelLogs(cutoffFrom, cutoffTo, { allowCreateMissing: false })` to hydrate parcel counts, standard/heavy breakdown, effective rates, and gross pay.
   - Summary table, Payroll Details, and daily breakdown lines stay 100% in agreement.
   - If hydration fails, an error is thrown cleanly so false success toasts are prevented.

5. **Immutable Snapshot Tables (`payroll_delivery_lines`)**:
   - Submitted, Approved, and Paid payroll use `payroll_delivery_lines` immutable daily snapshots.
   - Paid payroll (Calculation Version 1 or 2) cannot be recalculated or overwritten by live parcel corrections.

---

## 8. Offline-First Rider Architecture

- **Storage**: IndexedDB managed via Dexie.js (`MKBOfflineDB`).
- **Outbox Queue**: Queues Time-In, Time-Out, and location broadcasts when offline.
- **Idempotency & Replay**: Assigns a unique `idempotencyKey` and original `eventTimestamp`. Replay retains original event time.
- **Identity Trust**: Offline trust is bound to the canonical rider ID linked to the authenticated auth user.
- **Diagnostics**: Rider UI includes queue status and diagnostics modal for un-synced or failed events.

> [!IMPORTANT]
> **Native Capacitor Background Location Tracking** is **PLANNED / DEFERRED**. Currently, mobile rider features run as a responsive web app / PWA in mobile browsers.

---

## 9. Authoritative Violations & Geofence Lifecycle

### Authority and Event-Time Processing
- **PostgreSQL is authoritative**: `process_rider_location_geofence()` runs as the persisted evaluator before a `rider_locations` insert is committed. Browser geofence checks are provisional UI feedback only and must not replace the database decision.
- **Manila business time**: Attendance matching uses the location event's original `recorded_at` timestamp converted through `Asia/Manila`, rather than the database synchronization date. An open attendance record from the immediately previous Manila business date may cover a legitimate cross-midnight shift.
- **Fresh event**: A location may mutate current rider state only when it is newer than `riders.last_ping` and no more than two minutes old when processed.
- **Historical event**: Older or delayed coordinates remain in `rider_locations` with their event-time status classification, but cannot overwrite `riders.lat`, `riders.lng`, `riders.status`, or `riders.last_ping`.
- **Historical alert policy**: Historical replay does not create or resolve violation alerts. Reliable reconstruction would require historical zone-assignment snapshots, which the current schema does not retain.

### Deterministic Rider Status Lifecycle
```text
No active event-time attendance                    -> offline
On duty, but latest current GPS becomes stale      -> idle
Fresh on-duty coordinate outside active zone       -> violation
Fresh on-duty coordinate inside / no active zone   -> active
Time Out                                            -> offline (existing attendance workflow)
```

- A fresh outside coordinate creates one unresolved `boundary_exit`; repeated outside pings do not create duplicate open incidents.
- Re-entry resolves only unresolved `boundary_exit` records for the rider's current zone, preserves the incident row, and populates `resolved_at` using the re-entry event timestamp.
- Re-entry does not automatically resolve `manual_flag` or `idle_timeout` incidents.
- Reassigning a rider's zone resolves an unresolved `boundary_exit` tied to the old zone and moves an Active/Violation rider to `idle` until a fresh coordinate is evaluated against the new assignment.
- `refresh_stale_rider_statuses(interval '2 minutes')` runs once per minute through `pg_cron`. An on-duty Active/Violation rider with stale GPS becomes `idle`; the existing Time Out workflow remains responsible for `offline`.

### Realtime, Incident State, and Access Boundaries
- Admin and HR monitoring subscribe to authoritative `riders` UPDATE events as well as `rider_locations` and `violations`, so status changes caused by stale-GPS processing or zone reassignment do not require another location ping to appear in the UI.
- These concepts remain independent:
  - **Incident exists**: a row exists in `violations`.
  - **Read / acknowledged**: `violations.read` controls whether the incident is new to the viewer.
  - **Manually flagged for follow-up**: a linked notification explicitly contains `metadata.manual_flag = true`.
  - **Resolved**: `violations.resolved` and `violations.resolved_at` describe the incident lifecycle.
  - **Notification sent**: an automatic linked notification exists; this does not imply manual flagging.
- Database violation types are `boundary_exit`, `idle_timeout`, and `manual_flag`.
- Violation RLS permits Admin/HR SELECT, INSERT, and UPDATE; Riders may SELECT only their own incidents. Anonymous users have no table access, Payroll has no violation-management permission, and persisted trigger functions are not directly executable by client roles.

---

## 10. Notification Architecture

- **Context Provider**: `dashboard/src/context/NotificationContext.tsx` defines `NotificationProvider` and manages system notifications.
- **Realtime Channel**: Subscribes to Supabase Realtime changes on `notifications` table.
- **Role Targeting**: Filters alerts by role (`admin`, `hr`, `payroll`, `rider`).
- **Fault Isolation**: Uses `dispatchNotificationSafe()` to ensure notification failures never block primary database transactions.

---

## 11. Dashboard Skeleton Architecture

`DashboardSkeleton.tsx` is modularized to prevent layout shifts and maintain exact visual synchronization with live pages:

- **Shared Visual Primitives (`src/components/common/SkeletonPrimitives.tsx`)**:
  - `SkeletonBlock`, `SkeletonText`, `SkeletonStatCard`, `SkeletonTable` (includes mobile stacked card fallback `sm:hidden`), `SkeletonMap`.
- **Domain-Colocated Skeletons**:
  - `src/components/dashboard/AdminDashboardSkeleton.tsx`
  - `src/components/hr/HRDashboardSkeleton.tsx`
  - `src/components/attendance/AttendanceSkeleton.tsx`
  - `src/components/geofence/GeofenceSkeleton.tsx`
  - `src/components/monitoring/LiveMonitoringSkeleton.tsx`
  - `src/components/payroll/PayrollDashboardSkeleton.tsx` (includes `DailyParcelEntrySkeleton`, `ParcelHistorySkeleton`, `PayrollHistorySkeleton`, `SalaryComputationSkeleton`, `PayrollReportsSkeleton`, `PayrollChecklistSkeleton`)
  - `src/components/reports/ReportsSkeleton.tsx`
  - `src/components/rider/RiderDashboardSkeleton.tsx`, `RiderProfileSkeleton.tsx`
  - `src/components/settings/SettingsSkeleton.tsx`
  - `src/components/users/UsersSkeleton.tsx`
  - `src/components/common/LoginSkeleton.tsx`, `AuditLogsSkeleton.tsx`, `ReviewsSkeleton.tsx`
- **Coordinator & Re-Export Layer (`src/components/common/DashboardSkeleton.tsx`)**:
  - Centralized dispatcher mapping `page` and `role` to domain skeletons while re-exporting all skeleton types for backward compatibility.

---

## 12. Database Schema & RLS Summary

The generated Supabase schema and repository migrations confirm the following application tables. This list excludes extension-owned/PostGIS metadata tables and should not be treated as an exhaustive inventory of every database relation:

1. **`users`**: System user profiles (`id`, `full_name`, `role`, `email`, `created_at`).
2. **`riders`**: Fleet riders (`id`, `name`, `mkb_id`, `user_id`, `zone_id`, `face_descriptor`, `status`).
3. **`attendance_logs`**: Time-In/Out logs (`id`, `rider_id`, `date`, `time_in`, `time_out`, `status`, `lat`, `lng`).
4. **`rider_locations`**: Live GPS coordinates (`id`, `rider_id`, `latitude`, `longitude`, `speed`, `recorded_at`).
5. **`zones`**: Geofence polygon zones (`id`, `name`, `coordinates`, `color`).
6. **`parcel_logs`**: Daily parcel counts & earnings (`id`, `rider_id`, `date`, `parcels`, `heavy_parcels`, `rate`, `heavy_rate`, `standard_earnings`, `heavy_earnings`, `daily_gross`, `rate_configuration_id`).
7. **`parcel_log_audit`**: Append-only audit history of parcel log edits.
8. **`parcel_correction_requests`**: Rider/HR correction requests (`id`, `parcel_log_id`, `requested_delivered`, `requested_heavy`, `status`).
9. **`parcel_rate_configurations`**: Effective-dated rates (`id`, `effective_from`, `effective_until`, `early_standard_rate`, `regular_standard_rate`, `late_standard_rate`, `heavy_parcel_rate`, `heavy_threshold_kg`).
10. **`parcel_rate_configuration_audit`**: Audit trail for rate configuration changes.
11. **`payroll_records`**: Derived payroll summaries (`id`, `rider_id`, `cutoff_start`, `cutoff_end`, `total_parcels`, `gross_pay`, `status`).
12. **`payroll_delivery_lines`**: Immutable daily delivery line snapshots for submitted/approved/paid payroll.
13. **`rider_documents`**: Employee document metadata (`id`, `rider_id`, `document_type`, `file_path`, `verification_status`).
14. **`notifications`**: System notifications (`id`, `target_role`, `title`, `message`, `read`).
15. **`activity_logs`**: System event audit trail (`id`, `event_type`, `description`, `metadata`, `created_at`).
16. **`reviews`**: Courier review and moderation records.
17. **`user_devices`**: Registered user-device and device-validation records.
18. **`violations`**: Rider incident records for `boundary_exit`, `idle_timeout`, and `manual_flag`, with independent read and resolution state.

---

## 13. Safe Operational Reset State

An operational test data reset was previously conducted on the staging database.

- **Preserved System Data**: Auth users, user accounts (`users`), rider profiles (`riders`), face descriptors, geofence zones (`zones`), rate configurations (`parcel_rate_configurations`), database schema, RLS policies, and Storage buckets (`rider-documents`).
- **Cleared Test Operational Data**: Test attendance logs, location broadcasts, parcel logs, correction requests, draft payroll records, and activity logs.

---

## 14. Current Test & Build Verification

Verification executed against active repository state:

- **TypeScript Type-Check (`npm run typecheck`)**: **PASS (0 errors)**
- **Violations Database Lifecycle/RLS Suite**: **PASS (27 / 27 transactional assertions)**
- **Automated Test Suite (`npm test`)**: **PASS (71 / 71 tests passed across 14 test files)**
- **ESLint Linting (`npm run lint`)**: **PASS (0 errors, 8 warnings)**
- **Production Build (`npm run build`)**: **PASS (built in 31.95s)**

### Known Remaining Risks
- Stale rider status is evaluated on a one-minute schedule after a two-minute freshness threshold, so the visible transition may take approximately **2–3 minutes**.
- Reliable historical violation reconstruction requires historical zone-assignment data. Until that exists, delayed historical coordinates are retained without generating historical alerts.
- Existing unrelated Supabase advisor findings remain outside the Violations stabilization scope and require a separate security-maintenance pass.

---

## 15. Recently Resolved Issues

1. **Payroll Deletion Resurrection Bug**: Resolved. Read queries (`getPayrollRecords`, `getPaginatedPayrollRecords`) made pure SELECT operations so deleted draft records stay deleted.
2. **Payroll Re-Initialization Zero-Parcel Summary Bug**: Resolved. `initializeCutoffPayrollForFleet()` now explicitly calls `syncPayrollRecordsFromParcelLogs(..., { allowCreateMissing: false })` to hydrate newly created draft records with parcel aggregates and effective rates.
3. **Sidebar Modularization & Reference Section**: Resolved. Extracted presentation subcomponents into `components/common/sidebar/` and organized Payroll sidebar items into `Compensation` and `Reference` (`Parcel History`).
4. **DashboardSkeleton Modularization**: Resolved. Extracted skeletons into domain component folders (`components/dashboard/`, `components/hr/`, `components/payroll/`, etc.) with `SkeletonPrimitives.tsx`.
5. **Authoritative Violations Lifecycle**: Resolved. PostgreSQL now protects current rider state from historical GPS replay, scopes re-entry resolution to `boundary_exit`, handles zone reassignment and stale GPS deterministically, publishes rider status changes through Realtime, and separates automatic notifications from manual follow-up flags.

---

## 16. Deferred / Future Features (Explicitly Marked PLANNED / DEFERRED)

> [!CAUTION]
> The following features have been discussed or planned for future releases, but **are NOT yet implemented in the codebase**. Future agents must not assume these exist.

1. **Multi-Hub HR & Payroll Architecture** *(PLANNED / DEFERRED)*:
   - 4 regional hub structures (Hub-scoped HR/Payroll access vs main organization scope).
   - Currently, single organization-wide role model is used.
2. **Loan & Financial Management** *(PLANNED / DEFERRED)*:
   - Cash Advances, Loans, and automatic repayment deductions.
   - Currently, standard gross pay and manual adjustment fields (`other_earnings`, `deductions`, `late_onhold`, `late_remittance`) are used.
3. **Native Capacitor Mobile Application / Background GPS** *(PLANNED / DEFERRED)*:
   - Native iOS/Android builds and background geolocation daemon.
   - Currently, mobile rider features run as responsive web app / PWA with foreground GPS.

---

## 17. Current Handover State for Next IDE (Codex / Antigravity Handoff)

### Essential Invariants for Future Developers & AI Agents

1. **Never Re-introduce Read-Time Write Side-Effects**: `getPayrollRecords()` and `getPaginatedPayrollRecords()` must remain pure `SELECT` operations. Never call `syncPayrollRecordsFromParcelLogs()` inside read query functions.
2. **Never Delete Operational Source Data on Payroll Deletion**: Deleting a `payroll_records` row must delete ONLY the `payroll_records` table row. `parcel_logs`, `attendance_logs`, `riders`, and rate configurations must remain 100% untouched.
3. **Immutable Paid Payroll**: Submitted, Approved, and Paid/Disbursed payroll records use `payroll_delivery_lines` snapshots and must **never** be recalculated or overwritten by live parcel changes.
4. **Centralized Role Authorization**: Keep role permissions and sidebar definitions centralized in `sidebarNavigation.ts` and enforce authorization via Supabase RLS policies.
5. **Keep PostgreSQL Authoritative for Geofencing**: `process_rider_location_geofence()` owns persisted status and violation decisions. Historical replay must never regress current rider state or create current alerts, and re-entry must resolve only the matching unresolved `boundary_exit`.
6. **Preserve Operational Rate Integrity**: Parcel rates are resolved based on work date and Time-In timestamp. The fixed heavy parcel rate (₱17/parcel) applies to parcels above 4 kg.
