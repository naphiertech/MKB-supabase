# MKBRiderTrack Engineering Walkthrough & Codex Handoff

This document is the authoritative engineering reference and handoff document for **MKBRiderTrack**. It records the current implementation state, verified architecture, database schema, security rules, recent refactoring boundaries, and deferred features as of **August 24, 2026**.

This walkthrough is derived directly from the active repository source code, Supabase database migrations, test suites, and production build verification across both the Dashboard (`dashboard/`) and Landing (`landing/`) applications.

> **Note for Next IDE (Codex / Antigravity)**: When modifying or extending MKBRiderTrack, treat this document as the ground truth for current functionality. Features explicitly tagged as **PLANNED / DEFERRED** must not be documented as existing functionality.

---

## 1. Project Overview

**MKBRiderTrack** is a production-grade fleet management, rider attendance, parcel operations tracking, automated payroll, and multi-hub logistics monitoring system designed for last-mile delivery operations in the Philippines.

### Core Technology Stack
- **Dashboard Web App (`dashboard/`)**: React 18.3.1 SPA built with TypeScript, Vite, Tailwind CSS, Lucide icons, and Framer Motion micro-animations.
- **Public Website (`landing/`)**: Next.js 16.1.6 application using React 19.2.4, Tailwind CSS, Turbopack, and the Next.js App Router with Incremental Static Regeneration (ISR).
- **Backend & Database**: Supabase (Cloud PostgreSQL 15, PostGIS extension, Row Level Security, Supabase Auth, Realtime WebSocket subscriptions, Storage, and Edge Functions).
- **Biometrics & AI**: `face-api.js` (TensorFlow.js WebGL backend, SSD MobileNet V1) for 128-float facial vector extraction and MediaPipe for liveness/blink detection.
- **Offline Outbox**: Dexie.js (IndexedDB wrapper) with client-generated idempotency keys, original event timestamp replay, and stale-while-revalidate state management for mobile riders.

---

## 2. Current Role & Security Model

MKBRiderTrack enforces strict role-based authorization across both the frontend React UI and Supabase Row Level Security (RLS) policies.

| Role | Primary Responsibilities | Major Module Access | RLS Boundary |
| :--- | :--- | :--- | :--- |
| **Admin** | Fleet administration, dynamic attendance policy management, parcel rates, hub lifecycle, user management, employment archiving/restoration, audit review, and overrides | All pages (Dashboard, Tracking & Zones, HR & Employees, Parcel Operations, Finance & Reports, Settings) | Broad administrative access, constrained by deployed RLS policies, PostgreSQL triggers, append-only audit protections, employment-transition rules, and immutable payroll rules |
| **HR** | Attendance verification, Rider onboarding, assignment and employment lifecycle management, document verification, review moderation | Dashboard, Live Monitoring, Attendance, Employee Registry, Rider Assignments, Reviews, Audit Logs, Daily Parcel Entry, Parcel History, Payroll Checklist | May manage authorized Rider assignments and Archive/Restore Rider employment; cannot manage Admin/HR/Payroll employment; Read-only on Rates and Attendance Policies |
| **Payroll** | Salary computation, cutoff initialization, payslip generation, payroll exports, approval tracking | Dashboard, Salary Computation, Payroll Reports, Payroll History, Parcel History (Reference) | Read/Write on Payroll Records/Snapshots; Read-only on `parcel_logs`, Attendance, Rates, and Attendance Policies |
| **Rider** | Selfie Time-In/Out, live location broadcast, offline queue, personal attendance & payslips | Rider Mobile App (Dashboard, Attendance Scanner, Monitoring/Geofence Status, Profile/Payslips) | Read/Write on own Attendance, Locations, Diagnostics; Read-only on own Payslips/Logs |

> [!IMPORTANT]
> **Multi-Hub Workspace Isolation**: Admin is always global; HR and Payroll staff may have global access or explicitly assigned hub access (`user_hub_access`); Riders derive their operational hub from `riders.hub_id`. Database RLS policies backed by `private.user_can_access_hub(hub_id)` enforce visibility.

---

## 3. Current Navigation & Sidebar Architecture

### Navigation Configurations (`dashboard/src/components/common/sidebar/sidebarNavigation.ts`)

#### 1. Admin Role (`ADMIN_ITEMS`)
- **Dashboard** (`key: 'dashboard'`)
- **Tracking & Zones** *(Collapsible)*: Live Monitoring (`monitoring`), Geofence / Zones (`geofence`), Hub Management (`hubs`)
- **HR & Employees** *(Collapsible)*: Attendance logs (`attendance`), Users Registry (`users`), Rider Assignments (`rider_assignments`), Courier Reviews (`reviews`), Audit Logs (`audit_logs`)
- **Parcel Operations** *(Collapsible)*: Daily Parcel Entry (`daily_parcels`), Parcel History (`parcel_history`)
- **Finance & Reports** *(Collapsible)*: Payroll Checklist (`payroll`), Payroll History (`payroll_history`), Insights & Reports (`reports`)

#### 2. HR Role (`HR_ITEMS`)
- **Dashboard** (`key: 'dashboard'`)
- **Tracking & Zones** *(Collapsible)*: Live Monitoring (`monitoring`)
- **HR & Employees** *(Collapsible)*: Attendance logs (`attendance`), Employee Management (`users`), Rider Assignments (`rider_assignments`), Courier Reviews (`reviews`), Audit Logs (`audit_logs`)
- **Parcel Operations** *(Collapsible)*: Daily Parcel Entry (`daily_parcels`), Parcel History (`parcel_history`)
- **Finance & Reports** *(Collapsible)*: Payroll Checklist (`payroll`), Payroll History (`payroll_history`), Insights & Reports (`reports`)

#### 3. Payroll Role (`PAYROLL_ITEMS`)
- **Dashboard** (`key: 'dashboard'`)
- **Compensation** *(Collapsible)*: Salary Computation (`computation`), Payroll Reports (`reports`), Payroll History (`payroll_history`)
- **Reference** *(Collapsible)*: Parcel History (`parcel_history`) — *Read-only reference access*

#### 4. Rider Role Navigation (`dashboard/src/components/rider/RiderTopNav.tsx`)
- Mobile Navigation Bar: Dashboard (`dashboard`), Attendance (`attendance`), Live Map (`monitoring`), Profile & Payslips (`profile`)

### Global Hub Workspace Selector
- `HubProvider` loads the hubs visible to the authenticated user and owns the selected workspace.
- Admin and globally scoped HR/Payroll staff can select **All Hubs** or one accessible hub. Assigned-scope staff are constrained to their authorized hubs. Riders do not use the staff workspace selector.
- The selected workspace is persisted per user in `localStorage`, exposed through `HubContext`, and included in the route workspace key so affected screens refresh when the hub changes.
- Realtime location, violations, notifications, workforce directories, employee management, support tickets, payroll views, geofence data, and other hub-aware dashboard queries respect the active hub workspace in addition to server-enforced RLS.

### Collapsible Sidebar Architecture
- **`Sidebar.tsx`**: Main coordinator and public entry point.
- **`SidebarNavGroup.tsx`**: Renders collapsible section headers with active child highlight indicator (`hasActiveChild`), expand/collapse chevron, and badge notifications.
- **`SidebarNavItem.tsx`**: Individual navigation link item.
- **`SidebarFlyout.tsx`**: Hover/focus popover flyout for collapsed icon-only mode.
- **`SidebarFooter.tsx`**: User profile card, account settings shortcut, and sign-out trigger.
- **`useSidebarCollapse.ts`**: Handles expanded (256px / `w-64`) vs collapsed (72px / `w-[72px]`) width state with `localStorage` key (`mkb_sidebar_collapsed`) and spring animations.

---

## 4. Current Page Structure & Component Boundaries

All dashboard pages reside under `dashboard/src/pages/`:

```
dashboard/src/pages/
├── AdminDashboard.tsx       # Operations control panel & real-time KPI overview
├── Attendance.tsx           # Fleet attendance verification, date/status filters, & audit table
├── AuditLogs.tsx            # Security events, configuration audits, & administrative logs
├── DailyParcelEntry.tsx     # Daily delivery logs entry, heavy parcel counts, & rate context
├── Geofence.tsx             # Geofence boundary setup, map canvas, & rider zone assignments
├── HRDashboard.tsx          # HR metrics, rider status grid, & violation summary
├── HubManagement.tsx       # Admin hub lifecycle, counts, and zone-to-hub assignments
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
├── RiderAssignments.tsx     # Admin/HR permanent transfers, temporary deployments, and history
├── RiderAttendance.tsx     # Rider mobile Time-In/Out selfie & MediaPipe liveness scanner
├── RiderDashboard.tsx      # Rider mobile home, duty action panel, & payslip portal
├── RiderMonitoring.tsx     # Rider mobile active zone map & location status ticker
├── RiderProfile.tsx        # Rider personal details, emergency contacts, & face enrollment
├── Settings.tsx             # System parameters, dynamic attendance policy & parcel rates
└── Users.tsx                # Employee management, user onboarding, & role assignments
```

### Refactored Page-Level Boundaries
1. **Rider Dashboard Boundaries**:
   - `RiderDashboard.tsx`: Main page coordinator and shell wrapper.
   - `pages/rider-dashboard/riderDashboardModel.ts`: Pure calculations, date formatting, and state mapping.
   - `pages/rider-dashboard/useRiderDashboardData.ts`: SWR-backed cache-first loading and reload ownership.
   - `pages/rider-dashboard/useRiderShiftController.ts`: GPS/geofence state, scanner orchestration, Time In/Out persistence, offline attendance queue integration, and active-shift location synchronization.
2. **Daily Parcel Entry Boundaries**:
   - `DailyParcelEntry.tsx`: Coordinator for query loading, filters, rate context, cutoff-lock checks, and persistence routing.
   - `pages/daily-parcels/useDailyParcelDraft.ts`: State management for editable rows and single-rider drafts.
   - `pages/daily-parcels/DailyParcelEntryTable.tsx`: Table and mobile card presentation.
   - `pages/daily-parcels/DailyParcelEntryDrawer.tsx`: Selected-Rider drawer presentation.
3. **Data Integrity & Realism**:
   - Removed all fake dashboard trend strings, mock sparklines, and simulated route elevation (since no elevation hardware telemetry exists).
   - Removed hardcoded `"Talon-Talon Rider"` fallback text in favor of truthful neutral or unassigned states.
   - **Taxonomy of Data**:
     - *Operational data* = 100% dynamic, database-backed.
     - *Policy/Configuration data* = semi-dynamic, effective-dated (Attendance Policies, Parcel Rates).
     - *Branding/Navigation/Reference tokens* = intentionally static.

---

## 5. Dynamic Attendance Policy & Attendance Architecture

### Dynamic Attendance Punctuality Policy (Effective-Dated)
The attendance lateness threshold is dynamically configurable by Admins via an effective-dated policy model:

- **Current Baseline**: 08:15 AM (`08:15:00` Asia/Manila).
- **Effective-Dating Resolution**:
  - `v_attendance_summary` and analytics functions (`get_executive_analytics_summary`) laterally join `attendance_policy_configurations` matching `p.effective_from <= a.date AND (p.effective_until IS NULL OR p.effective_until >= a.date)`.
  - **Zero Retroactive Reclassification**: An attendance log recorded on August 20 under an `08:15` policy remains evaluated against `08:15` even if a new `08:30` policy takes effect in September or an `08:10` policy takes effect in October.
- **Strict Boundary Semantics**:
  - Exact threshold is **On Time** (`08:15:00` &rarr; On Time).
  - Any time strictly past threshold is **Late** (`08:15:01` &rarr; Late).
- **Continuous Date Range & Overlap Prevention**:
  - Active-range overlap is blocked by the PostgreSQL range GiST exclusion constraint:
    ```sql
    CONSTRAINT attendance_policy_configurations_no_active_overlap
    EXCLUDE USING gist (
      daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[]') WITH &&
    ) WHERE (active)
    ```
  - `schedule_attendance_policy()` and `cancel_future_attendance_policy()` lock active policy rows and update every affected boundary in one PostgreSQL transaction. Scheduling closes the predecessor at `new_effective_from - 1`; cancellation restores the predecessor through the next active successor or back to open-ended coverage.
  - Direct authenticated `INSERT`, `UPDATE`, and `DELETE` privileges are revoked. Authenticated users retain policy `SELECT`; Admin-only state transitions use the two explicitly granted RPCs.
- **Historical Immutability Guard**:
  - `private.attendance_policy_business_date()` defines policy “today” as `(now() AT TIME ZONE 'Asia/Manila')::date`; browser helpers use the same explicit timezone rather than the Admin device timezone.
  - Database trigger `guard_attendance_policy_immutability()` permanently protects the threshold, start date, active state, deletion state, and already-governed coverage of effective policies.
  - The guard still permits the legitimate future transition `current open-ended policy → effective_until = future_start - 1`, provided no Manila business date already governed by that policy is removed.
  - Policies remain `active = true` after taking effect. `active = false` is reserved for policies canceled while still future-dated.
  - Future-dated policies can be canceled before taking effect through `cancel_future_attendance_policy()`; target deactivation and predecessor restoration commit or roll back together.
- **Fallback Integrity**:
  - `COALESCE(policy.late_threshold, time '08:15:00')` remains as defense-in-depth for legacy or corrupted data. Valid policy history is required to resolve exactly one active policy and must not depend on this fallback.
- **Append-Only Audit**:
  - All policy creations, closures, and deactivations write append-only records to `attendance_policy_configuration_audit`.
- **Strict Decoupling from Parcel Rates**:
  - Attendance punctuality (8:15 AM late threshold) is strictly distinct from parcel compensation rate windows (8:00 AM / 9:00 AM).
- **Auto-Absence Cutoff**:
  - The 5:00 PM auto-absence cutoff remains fixed.

### Attendance Rules & Workflow
- **Time In**: Rider captures a live selfie on mobile. Verified GPS freshness is required when the scanner opens and re-checked immediately after face verification before the attendance row is written.
- **Time Out**: Operates against the active attendance record and may succeed without GPS (incorporating GPS when available).
- **Shared Attendance Facts**: `services/attendanceSummaryPolicy.ts` centralizes `time_in` / `raw_time_in`, normalized status aliases, leave evidence, presence evidence, late detection, and punctuality facts across attendance, parcel operations, and payroll metrics.
- **Execution Reliability**:
  - Per-scan and in-flight locks prevent duplicate Time In/Out executions.
  - Scanner startup cancels pending 220ms timers on early unmount/close.
  - Stale async responses from older requests are discarded.
  - Active-shift location synchronization cleanly cancels follow-up handlers upon unmount.

### Biometric Verification Architecture (`dashboard/src/lib/faceAi.ts`)
- **Pipeline**: SSD MobileNet V1 &rarr; Face Landmark 68 &rarr; Face Recognition Model (128-D descriptor) &rarr; MediaPipe Liveness &rarr; Euclidean comparison (fixed threshold `0.45`).
- **Stabilization Completed**: Model weights remain resident during the session; synthetic warmup passes initialize landmarks and descriptors without rider data; transient releases close MediaPipe without purging face-api tensors; camera streams are owned per scanner mount; interaction-aware preload yields to mobile scrolling and touch events.

---

## 6. Parcel Operations & Effective-Dated Rates

### Parcel Operations (`DailyParcelEntry.tsx`, `ParcelHistory.tsx`)
- **Categories**: Standard Delivered, Heavy Delivered, Failed, Returned, Notes.
- **Audit & Correction**: Edits append records to `parcel_log_audit`. Locked historical periods route edits to `parcel_correction_requests` requiring HR/Admin approval.
- **Persistence Routing**: Unlocked periods use `saveDailyParcelEntries()`. Table and drawer edits share a unified draft model so single-row saves use one authoritative source.

### Parcel Service Compatibility Façade
`services/operationsService.ts` remains the stable public import façade, re-exporting:
- `parcelOperationsPolicy.ts`: validation, pure calculations, and effective-dated rate resolution.
- `parcelOperationsRecords.ts`: queue loading, save ordering, history enrichment, audit writes, and payroll synchronization.
- `parcelCorrectionWorkflow.ts`: cutoff-lock checks, correction request creation/review, and correction audit history.

### Effective-Dated Rate Engine (`parcel_rate_configurations`)
- **Standard Rates**:
  - Early Standard Rate: **₱12.00 / parcel** (Time In &le; 08:00 AM)
  - Regular Standard Rate: **₱11.00 / parcel** (Time In &le; 09:00 AM)
  - Late Standard Rate: **₱10.00 / parcel** (Time In > 09:00 AM)
- **Heavy Parcels**: Delivered parcels exceeding the **4.0 kg** threshold receive a fixed heavy surcharge (**₱17.00 / parcel**), calculated per parcel (not per kg).

```text
Daily Gross Pay = (Standard Delivered × Effective Standard Rate) + (Heavy Delivered × ₱17.00)
```

---

## 7. Payroll Architecture & Data Invariants

### Critical Payroll Data Invariants
```text
Parcel Operations (parcel_logs)   ──► OPERATIONAL SOURCE OF TRUTH (Audited)
Draft Payroll (payroll_records)   ──► DERIVED WORKING DATA (Calculated from parcel_logs)
Finalized Payroll (payroll_delivery_lines) ──► IMMUTABLE SNAPSHOT DATA (Never rewritten)
```

1. **Pure Read Queries**: `getPayrollRecords()` and `getPaginatedPayrollRecords()` are 100% pure read-only `SELECT` queries with zero write side-effects.
2. **Draft Deletion Lifecycle**: Deleting a draft payroll record removes only the `payroll_records` row. Operational source data (`parcel_logs`, `attendance_logs`, `riders`, and rate configurations) is 100% preserved.
3. **Cutoff Initialization Hydration**: `initializeCutoffPayrollForFleet()` generates draft rows and immediately calls `syncPayrollRecordsFromParcelLogs(..., { allowCreateMissing: false })` to hydrate parcel counts and effective rates.
4. **Immutable Finalized Snapshots**: Submitted, Approved, and Paid payroll use `payroll_delivery_lines` daily snapshots. Paid payroll cannot be recalculated from current parcel edits.
5. **Authoritative Bulk Approval & Payment**: Server-side RPCs `bulk_approve_payroll_records()` and `bulk_mark_payroll_records_paid()` execute atomic, row-locked transitions with idempotent request keys.
6. **Coverage-Based Cutoff Readiness (`getCutoffPreparationCoverage`)**: Computes exact cutoff readiness by comparing draft records against date-effective eligible fleet riders from `get_payroll_eligible_rider_ids`.
7. **Centralized Payroll Adjustments (`lib/payroll/payrollAdjustments.ts`)**:
   ```text
   Net Pay = Gross Pay + Other Earnings + (FM Pickups × ₱3.00) - Deductions - Late On-Hold - Late Remittance
   ```
8. **Archive Status Aggregation**: Multi-rider historical cutoffs aggregate as `Paid`, `Approved`, `Submitted`, `Draft`, `Rejected`, or `Mixed` (UI-derived badge).

---

## 8. Offline-First Rider Architecture

- **Storage**: IndexedDB managed via Dexie.js (`MKBOfflineDB`).
- **Outbox Queue**: Queues Time-In, Time-Out, and location broadcasts when offline.
- **Idempotency & Replay**: Assigns a unique `idempotencyKey` and original `eventTimestamp`. Replay preserves original event time.
- **Identity Trust**: Offline trust is bound to the canonical rider ID linked to the authenticated user.
- **Diagnostics**: Rider UI includes queue status and diagnostics modal for un-synced or failed events.
- **Request Ownership**: Discards stale async responses when a newer reload or unmount occurs.

---

## 9. Authoritative Violations & Geofence Lifecycle

- **PostgreSQL Authority**: `process_rider_location_geofence()` runs on `rider_locations` inserts. Browser geofence checks are provisional UI feedback only.
- **Manila Business Time**: Converts event timestamps through `Asia/Manila`.
- **Deterministic Status Lifecycle**:
  ```text
  No active attendance -> offline
  On duty, fresh GPS outside active zone -> violation
  On duty, fresh GPS inside active zone -> active
  On duty, GPS becomes stale (> 2 min) -> idle (via cron refresh_stale_rider_statuses)
  Time Out -> offline
  ```
- **Resolution**: Re-entry resolves only unresolved `boundary_exit` incidents for the rider's current zone. `manual_flag` and `idle_timeout` incidents require manual follow-up.

---

## 10. Notification Architecture & Preferences

- **Context Provider**: `dashboard/src/context/NotificationContext.tsx` subscribes to Supabase Realtime changes on `notifications`.
- **Fault Isolation**: `dispatchNotificationSafe()` prevents notification errors from blocking primary transactions.
- **Preferences (`user_notification_preferences`)**: Stores per-user presentation preferences (toast/sound/categories). Notification rows and history remain persisted in the database regardless of UI presentation toggles.

---

## 11. Account Security, Support Tickets & Lifecycle

- **Online Support Tickets**: RLS-isolated tickets with Open, In Progress, and Resolved states with immutable message history.
- **Password Recovery**: Verified recovery routing via `PasswordRecovery.tsx` and Supabase Auth.
- **Admin/HR Password Reset**: Privileged email recovery trigger from Employee Management.
- **Suspend / Reactivate User Account**: Invokes `admin-user-actions` Edge Function; suspends Auth access without deleting history.
- **Log Out All Other Devices**: Supabase Auth `signOut({ scope: 'others' })` paired with private Realtime Broadcast for immediate client revocation.
- **Two-Step Verification (TOTP MFA)**: Supabase Auth MFA enrollment with authenticator apps and `MfaChallenge.tsx` sign-in gating.

---

## 12. Employee Archive and Restore Employment

Employee Archive is an authoritative employment lifecycle separation:

```text
Account access:        users.status             = active | suspended
Employment lifecycle: users.employment_status  = active | archived
Rider live state:      riders.status            = active | idle | violation | offline
```

- **Archive**: Sets `employment_status = archived`, account to `suspended`, Rider to `offline`, resolves open boundary exits, bans Auth login, and sends a session-termination broadcast. Open attendance sessions block Archive.
- **Restore**: Sets `employment_status = active`, keeping account `suspended` and Rider `offline` until an explicit Reactivate action.
- **Data Preservation**: Historical attendance, parcels, payroll, GPS, violations, documents, and face descriptors remain permanently attached to the original employee identity.

---

## 13. Settings Architecture

The Settings workspace (`dashboard/src/pages/Settings.tsx`) contains 5 dedicated tabs:

1. **Personal Detail**: Profile information, avatar, email, and staff profile completion indicators.
2. **Security**: Password change, TOTP Two-Factor Authentication enrollment/management, and session revocation.
3. **Notification**: Category toggles, toast banners, and sound preferences backed by `user_notification_preferences`.
4. **Attendance Policy**: Admin-managed effective-dated attendance lateness policy settings with compact current policy card, scheduled future changes, policy history table, and audit trail drawer.
5. **Payroll & Parcel Rates**: Admin-managed effective-dated parcel rate configuration, heavy weight thresholds, configuration history, and rate change audit ledger.

---

## 14. Multi-Hub Logistics Architecture

MKBRiderTrack organizes operational territory using a strict 3-tier hierarchy:

```text
Hub ──► Geofence Zones ──► Riders
```

### Deployed Operational Hubs & Zones
- **Talon-Talon Hub**: Headquarters and southern Zamboanga distribution center.
- **Cabaluay Hub**: Eastern logistics hub and highway transfer center.
- **Baliwasan Hub**: Urban central commercial hub.
- **Ayala Hub**: Western industrial and coastal hub.

### Rider Assignment Mechanics
- **Permanent Transfer**: Updates both permanent Home (`home_hub_id` / `home_zone_id`) and current Operational (`hub_id` / `zone_id`) assignments.
- **Temporary Deployment**: Updates only current Operational assignment while preserving Home assignment. Expiration or early end automatically restores the Rider to their Home Hub and Home Zone.

---

## 15. Public Landing Website (`landing/`)

The public website (`landing/`) is a dedicated multi-page Next.js application designed to showcase the platform, demonstrate real-time operations, and provide customer touchpoints.

### Architecture & Routing
- **Framework**: Next.js 16.1.6 App Router, React 19, Turbopack, Tailwind CSS.
- **Public Routes**:
  - `/`: Platform overview, live operational metrics, and feature highlights.
  - `/about`: Company background, operational mission, and technology foundation.
  - `/modules`: Detailed breakdown of Fleet, Attendance, Parcel, and Payroll capabilities.
  - `/locations`: Overview of all 4 operational Hubs with aggregated zone counts and real-time operational status.
  - `/locations/[slug]`: Dynamic Hub detail pages (`talon-talon`, `cabaluay`, `baliwasan`, `ayala`) displaying real Supabase-backed geofence zones and interactive Leaflet map.
  - `/team`: Leadership and engineering team.
  - `/contact`: Inquiries, demo requests, and support routing.
- **Public Navigation**: `Platform`, `Capabilities`, `Operations`, `Team`, `Contact`, `Request Demo`, `Access Portal`.

### Visual Design Direction
- **Bryl-Minimal Foundation**: Warm-neutral palette with crisp typography, hairline borders (`border-border`), and structured grid layouts.
- **Amber Brand Accents**: The current light token is `oklch(0.72 0.17 65)` (documented as `#f59e0b`) and the dark token is `oklch(0.75 0.18 65)` (documented as `#fbbf24`). Amber is used selectively for key CTAs, active pills, and brand/status accents while the primary ink token remains neutral.
- **Natural Media**: Authentic photography and natural-color media assets.
- **Semantic Geofence Visualization**: Polygon zones retain their semantic operational colors for map clarity.

### Supabase Data Layer & Sanitized Public Views
The landing application reads live operational territory directly from Supabase while strictly preserving workforce privacy:
- **`public.public_hubs`**: Security-barrier view exposing only active hub metadata (`id`, `name`, `description`).
- **`public.public_zones`**: Security-barrier view exposing only active public geometry (`id`, `hub_id`, `name`, `zone_type`, `lat`, `lng`, `radius`, `polygon_coordinates`, `color`).
- **View Boundary**: Direct anonymous access to the `hubs` and `zones` base tables is revoked; `anon` and `authenticated` receive `SELECT` only on the sanitized views.
- **Privacy Boundary**: Anonymous users cannot access `riders`, `users`, `attendance_logs`, `parcel_logs`, or `payroll_records`.
- **Caching & Freshness**: Hub and Zone detail pages use Next.js Incremental Static Regeneration (ISR) with a 1-minute revalidation window.

---

## 16. Database Schema & RLS Summary

Key database tables and views in active use:

1. `users`: System accounts, roles, employment status, and archive metadata.
2. `hubs`: Operational hubs.
3. `user_hub_access`: Assigned staff-to-hub visibility mappings.
4. `riders`: Fleet profiles with Home and Operational Hub/Zone assignments and face descriptors.
5. `rider_assignments`: Permanent transfer and temporary deployment history.
6. `attendance_logs`: Daily Time-In/Out records.
7. `attendance_policy_configurations`: Effective-dated attendance lateness thresholds with range GiST exclusion constraint.
8. `attendance_policy_configuration_audit`: Append-only audit history for attendance policy modifications.
9. `rider_locations`: High-frequency GPS coordinates.
10. `zones`: PostGIS geofence polygons.
11. `parcel_logs`: Daily delivered, heavy, failed, and returned parcel counts.
12. `parcel_log_audit`: Append-only parcel edit log.
13. `parcel_correction_requests`: Formal parcel correction requests.
14. `parcel_rate_configurations`: Effective-dated parcel compensation rates.
15. `parcel_rate_configuration_audit`: Audit trail for rate changes.
16. `payroll_records`: Derived payroll cutoff summaries.
17. `payroll_delivery_lines`: Immutable daily delivery line snapshots for finalized payroll.
18. `payroll_bulk_operations`: Idempotency records for bulk payroll operations.
19. `rider_documents`: Verified rider licenses and government credentials.
20. `notifications`: System alerts and in-app notifications.
21. `activity_logs`: System audit trail.
22. `violations`: Geofence boundary exits, idle timeouts, and manual flags.
23. `support_tickets` & `support_ticket_messages`: Support ticket workflows.
24. `user_notification_preferences`: Per-user notification presentation settings.
25. `v_attendance_summary`: Date-effective lateral resolution view for attendance and lateness.
26. `public_hubs` & `public_zones`: Sanitized views for the public landing website.

---

## 17. Current Test & Build Verification

Verification executed against active repository state as of **August 24, 2026**:

- **Dashboard Unit Test Suite (`npm --prefix dashboard test`)**: **PASS (480 / 480 tests passed across 95 test files)**
- **Attendance Policy Database Regression Suite (`attendance_policy_integrity.test.sql`)**: **PASS (35 / 35 pgTAP assertions)**
- **Broader Database pgTAP Sweep**: **16 / 17 files passed**; the unrelated `payroll_actor_identity_snapshots.test.sql` currently reports **1 failing assertion out of 35**.
- **Dashboard and Landing TypeScript Typecheck (`npm run typecheck`)**: **PASS (0 errors)**
- **Dashboard ESLint (`npm --prefix dashboard run lint`)**: **PASS (0 errors, 17 existing warnings)**
- **Dashboard Production Build (`npm --prefix dashboard run build`)**: **PASS (Vite production bundle built in ~36s)**
- **Landing Production Build (`npm --prefix landing run build`)**: **PASS (Next.js 16.1.6 Turbopack, 13/13 static & ISR routes compiled)**
- **Diff Validation (`git diff --check`)**: **PASS (Clean, zero whitespace or syntax errors)**

---

## 18. Manual Smoke Test Checklist

Use this focused checklist to verify critical operational workflows:

1. **Rider Dashboard Loading**: Open the Rider Dashboard; confirm cached data renders instantly, fresh data reconciles cleanly, and active zone/shift state is accurate.
2. **Rider Time In**: With verified GPS, complete selfie face/liveness verification; confirm GPS freshness is verified again before one Time In is recorded.
3. **Rider Time Out**: Complete face verification with GPS disabled; confirm Time Out succeeds against the open attendance record.
4. **Scanner Startup Cancellation**: Open the face scanner and close it before 220 ms; confirm camera stream cleanup runs without orphaned callbacks.
5. **GPS & Geofence Status**: Move in/out of assigned zone boundaries; confirm status transitions between Active, Idle, and Violation without coordinate leakage.
6. **Controlled Logout During Active Shift**: Attempt logout while clocked in; confirm the active-shift warning appears and logout does not fabricate a Time Out.
7. **Parcel Table & Drawer Draft Sync**: Edit counts in the table, open the drawer, stage adjustments, and verify the single-draft model keeps values synchronized.
8. **Bulk Parcel Save**: Modify multiple rows and confirm Save All persists only dirty rows.
9. **Locked-Cutoff Parcel Correction**: Attempt an edit on a locked historical cutoff; verify that a formal correction request is created instead of a direct update.
10. **Payroll Approval & Payment Flow**: Submit a draft, approve it as Admin/authorized HR, and mark as Paid; confirm immutable `payroll_delivery_lines` snapshots are created.
11. **Attendance Policy Scheduling**: Schedule a future attendance threshold (e.g. 08:30); verify the predecessor's `effective_until` closes on the day prior with zero overlap.
12. **Historical Attendance Policy Integrity**: View attendance records from prior months; confirm that historical rows continue evaluating against the threshold effective on their attendance date.
13. **Unstarted Policy Cancellation**: Cancel an unstarted future policy; verify the predecessor's `effective_until` reverts to open-ended (`NULL`).
14. **Public Landing Operations Map**: Navigate to `/locations` and `/locations/talon-talon`; verify that real Supabase-backed hub and zone boundaries render on the Leaflet map without exposing private rider data.

---

## 19. Deferred / Future Features (Explicitly Marked PLANNED / DEFERRED)

> [!CAUTION]
> The following features have been discussed or planned, but **are NOT yet implemented**. Future agents must not assume these exist:

1. **Native Capacitor Mobile Build & Background GPS Daemon** *(PLANNED / DEFERRED)*: Mobile features currently run as a responsive web app / PWA with foreground geolocation.
2. **Self-Service Account Deletion** *(PLANNED / DEFERRED)*: Users must contact an administrator so operational history is not accidentally purged.
3. **Internal Live Chat in Monitoring** *(PLANNED / DEFERRED)*: Live Monitoring Call Rider triggers `tel:` dialer; in-app chat is deferred.
4. **External SMS / Email Notification Push Engine** *(PLANNED / DEFERRED)*: System uses Supabase Realtime in-app notifications. External email digests and SMS push are deferred.
5. **Loans & Cash Advance Automation** *(PLANNED / DEFERRED)*: Automatic loan deduction matrices are deferred; manual adjustments (`deductions`, `other_earnings`) are used.
6. **Hub-Specific Shift Schedules & Dynamic 5:00 PM Auto-Absence Cutoffs** *(PLANNED / DEFERRED)*: Global attendance lateness policy is implemented; hub-specific custom shift hours and dynamic auto-absence cutoffs remain deferred.
7. **Future-Dated Employee Archiving** *(PLANNED / DEFERRED)*: Archive effective dates are limited to today or earlier in v1.
8. **Alternative Biometric Neural Networks** *(PLANNED / DEFERRED)*: Tiny Face Detector and native TFLite are deferred; SSD MobileNet V1 remains authoritative.

---

## 20. Essential Engineering Invariants for Codex & Antigravity Agents

1. **Attendance Punctuality vs Parcel Rates**: Never conflate attendance lateness (8:15 AM threshold via `attendance_policy_configurations` and `v_attendance_summary.hr_status`) with the parcel compensation rate matrix (≤8:00 AM, 8:01–9:00 AM, >9:00 AM via `parcel_rate_configurations`).
2. **Zero Retroactive Reclassification**: Always evaluate historical attendance against the policy effective on the record's date (`a.date`), never against the policy active today. Effective policy rows must remain active and retain every already-governed Manila business date; schedule/cancel changes must use the atomic Attendance Policy RPCs.
3. **Pure Read Queries**: `getPayrollRecords()` and `getPaginatedPayrollRecords()` must remain pure `SELECT` queries without write side-effects.
4. **Immutable Paid Payroll**: Finalized payroll must read from `payroll_delivery_lines` snapshots and must never be recalculated from live parcel edits.
5. **PostgreSQL Geofence Authority**: `process_rider_location_geofence()` owns persisted status and violation decisions.
6. **Multi-Hub Isolation**: Keep the global Hub selector synchronized with database `hub_id` snapshots and restrictive RLS (`private.user_can_access_hub`).
7. **Home vs Operational Rider Assignments**: `riders.home_hub_id` / `home_zone_id` are permanent; `riders.hub_id` / `zone_id` are operational. Temporary deployments must restore to Home on expiration.
8. **Disambiguate PostgREST Embeds**: Explicitly name foreign keys in embedded selects (`user_hub_access!user_hub_access_user_id_fkey`, `zones!riders_zone_id_fkey`, `zones!riders_home_zone_id_fkey`).
9. **Separate Account, Employment, and Rider State**: Employee Archive changes `employment_status`, suspends `users.status`, and sets Rider `offline`. Restore keeps account suspended until explicit Reactivation.
10. **Public Landing Privacy**: The landing application must read only sanitized views (`public.public_hubs`, `public.public_zones`) and never expose private workforce or rider data.
