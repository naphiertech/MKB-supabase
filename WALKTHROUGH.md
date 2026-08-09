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
- **Production pipeline remains unchanged**:

```text
Camera
  -> SSD MobileNet V1
  -> Face Landmark 68
  -> Face Recognition Model
  -> 128-D descriptor
  -> MediaPipe liveness
  -> Euclidean comparison
  -> threshold 0.45
```

- **Detector and models**: SSD MobileNet V1 remains the production detector. Face Landmark 68 and the Face Recognition Model remain unchanged. Tiny Face Detector is not implemented.
- **Descriptor compatibility**: Existing 128-element vectors in `riders.face_descriptor` remain valid and unchanged. The stabilization required no descriptor migration and no rider re-enrollment.
- **Comparison rule**: Enrollment duplicate checks and rider verification continue to use Euclidean distance with the threshold fixed at exactly `0.45`.
- **Liveness and business rules**: MediaPipe continues to enforce the existing liveness interaction. Attendance, Time In/Out, offline replay, and geofence rules were not changed by the biometric work.

### Completed Biometric Performance Stabilization

- `warmUpModels()` now executes representative synthetic warmup passes for SSD detection, landmarks, descriptor inference, and MediaPipe without using rider biometric data or retaining/comparing a warmup descriptor.
- Face-api model weights remain resident for the application session. Transient release closes MediaPipe but does not clear the face-api load promise while tensors remain allocated, preventing the previous release/reload memory doubling state.
- `FaceScanner.tsx` owns one camera stream per scanner mount. Initializing, scanning, matched, and failed phase changes reuse that stream; tracks stop when the scanner actually unmounts.
- Enrollment startup callbacks are stable. Rapid EAR/debug updates no longer restart enrollment, and scan-session IDs ensure delayed work from an older scan is ignored after reset, close, or restart.
- The three-match safeguard now counts only newly computed descriptors from the active scan session. Re-evaluating a cached descriptor cannot increment the count repeatedly.
- The unused broken OpenCV bootstrap and its uncalled preprocessing path were removed.
- The face-api runtime/fallback is pinned to `0.22.2`; MediaPipe package and WASM runtime are aligned and pinned to `0.10.35`.
- Face-api model assets live under versioned `/models/face-api-0.22.2/`. Vercel applies long-lived immutable caching to that versioned path so future model changes require a new path/version.
- Timing-only telemetry covers preload, model initialization, camera request, first usable frame, liveness, warmup stages, recognition, match completion, and attendance persistence. Development builds expose:

```js
window.__MKB_BIOMETRIC_TIMINGS__?.snapshot()
```

Telemetry does not record face images, descriptors, biometric vectors, or rider IDs.

### Biometric Benchmark Context and Current Timing

The completed audit found that the main constraint was cold-start and resource lifecycle behavior, not descriptor-comparison scale:

- Before stabilization, first-process preload was approximately **11.35 seconds**.
- The first real face after preload was approximately **4.85 seconds**, because the old black-canvas warmup did not execute the landmark and descriptor networks meaningfully.
- The already-warm recognition pipeline was approximately **92 ms**.
- A warm MediaPipe frame was approximately **14 ms**.
- Descriptor comparison at the current rider count was effectively **under 1 ms**.
- Normal repeated inference did not leak tensors; the defect was that release cleared the load promise without disposing face-api tensors, so a later reload doubled model memory.

A real-device numeric post-fix first-face benchmark is still pending. Do not claim a measured post-fix speedup until camera/WebGL timings are captured on a real target device through the telemetry above.

Intentional interaction timing remains part of the current flow: scanner startup waits about **220 ms**, liveness requires genuine user interaction with roughly a **1-second minimum**, the success state remains visible for about **1.2 seconds**, and three genuinely fresh descriptor samples add verification time because descriptor sampling remains throttled. These are not documented as bugs.

### Deferred Biometric Changes

The following are not implemented: a Tiny Face Detector production switch, MediaPipe Web Worker migration, native TensorFlow Lite/native ML, Capacitor biometric migration, rider re-enrollment, and recognition-model replacement. Tiny remains only a future A/B candidate if measured real-device results still justify evaluating it.

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

6. **Authoritative Payroll Approval and Payment Actions**:
   - Bulk Approval and Bulk Mark as Paid are implemented for **Admin and HR only** through `bulk_approve_payroll_records()` and `bulk_mark_payroll_records_paid()` server-side RPCs.
   - Both RPCs delegate to the same `execute_payroll_bulk_transition()` transaction. Selected `payroll_records` rows are sorted and locked with `FOR UPDATE` before validation and transition.
   - Every selected row must still exist, belong to the requested cutoff, have the expected status and `updated_at` version, and contain a valid finalized snapshot. A mixed, invalid, or stale selection raises an error before any status update, so the complete operation fails atomically.
   - A caller-scoped request UUID and `payroll_bulk_operations` record make retries idempotent. Replaying the same completed request returns the stored result; reusing the request ID for different data is rejected.
   - Individual Approve and Mark as Paid actions route a one-record payload through these same RPCs. They do not maintain a separate client-side transition path.
   - Approval/payment activity logs and notifications are created inside the authoritative transaction. Paid remains immutable under the existing payroll workflow trigger and finalized payroll continues to use stored `payroll_delivery_lines`, never live `parcel_logs` recalculation.
   - Payroll Bulk Export remains a separate read-only action and cannot approve, pay, or otherwise mutate payroll.

The Payroll Bulk Actions batch passed **57 / 57 database assertions** and **130 / 130 application tests** at the time that batch was completed. The current repository-wide application count is recorded in Section 15.

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
- **Persistence Boundary**: Database-backed in-app notifications and notification history remain authoritative and persisted regardless of whether a user suppresses a toast or sound.

### Notification Preferences — IMPLEMENTED

- `user_notification_preferences` stores one Supabase-backed row per user. RLS restricts each user to their own preference row; `localStorage` is no longer authoritative and is used only for one-time migration of legacy values before those keys are removed.
- Preferences control toast presentation, notification sound, and role-relevant categories for violations, attendance, payroll, support tickets, and system events.
- Account-category and critical-priority notifications remain visible even when ordinary presentation is suppressed.
- Preferences affect presentation only. Notification rows/history are still persisted and Realtime delivery to the existing notification context remains intact.
- The preferences table intentionally has no Realtime publication/channel and the client adds no preference polling.
- Email digests, Web Push, SMS, and other external delivery infrastructure are not implemented.

---

## 11. Implemented Support, Account Security & Operational Actions

The first batch of actions previously presented as **Soon / Not yet available** is implemented. The authentication recovery flows and TOTP MFA have also completed manual acceptance testing successfully.

### Online Support Tickets — IMPLEMENTED

- `support_tickets` and append-only `support_ticket_messages` implement the lifecycle **Open -> In Progress -> Resolved**.
- Admin can manage all tickets and advance status. HR, Payroll, and Rider users can create, read, and reply only within their own tickets under RLS.
- Ticket messages have no client update/delete workflow or RLS policy, preserving immutable conversation history. Resolved tickets and their messages remain available as historical records but no longer accept replies.
- Both tables publish PostgreSQL changes through Supabase Realtime. Database triggers create in-app ticket notifications without making notification delivery a prerequisite for the ticket transaction.
- The implementation uses Supabase tables, triggers, RLS, and Realtime directly; it does not require an Edge Function or separate support backend.

### Account Recovery and Administration

1. **Forgot Password — IMPLEMENTED / MANUALLY VERIFIED**
   - `requestPasswordRecovery()` uses Supabase Auth `resetPasswordForEmail()` and supplies an explicit MKBRiderTrack recovery callback URL.
   - The recovery link returns to the dashboard recovery route, where `PasswordRecovery.tsx` verifies the recovery session and lets the user set a new password through Supabase Auth `updateUser()`.
   - Invalid or expired links display a recovery-specific error and direct the user back to sign-in to request another link.
   - Recovery email delivery, callback routing, and new-password completion have been manually verified.

2. **Admin/HR Send Password Reset — IMPLEMENTED / MANUALLY VERIFIED**
   - Employee Management sends the target user a Supabase Auth recovery link; staff never see, assign, or transmit the user's password.
   - The request is recorded through the existing activity-log path.
   - The action remains available only within the Admin/HR employee-management workflow. Privileged account administration that requires elevated Auth access remains server-side rather than exposing service-role credentials to the browser.
   - Recovery email delivery and the resulting reset link have been manually verified.

3. **Suspend / Reactivate User Account — IMPLEMENTED**
   - The frontend invokes the authenticated `admin-user-actions` Edge Function. The function validates the caller and target, updates the Supabase Auth ban state with server-side administrative credentials, synchronizes `public.users.status`, and appends an activity audit record.
   - Admin has the broader account-management workflow; HR is restricted to rider accounts. Users cannot suspend/reactivate themselves.
   - Suspended users are denied sign-in and an already-open session is signed out when the authoritative account status changes through Realtime. Reactivation restores Auth and application access.
   - Suspension/reactivation updates account access only. It does not delete attendance, parcel, payroll, violation, notification, or audit history.

### Session Security and MFA

4. **Log Out All Other Devices — IMPLEMENTED**
   - Supabase Auth `signOut({ scope: 'others' })` remains the authoritative refresh-session revocation operation.
   - A private, user-specific Supabase Realtime Broadcast supplies immediate cross-device logout UX. The broadcast includes the initiating Auth `session_id`, so the initiating browser stays signed in while the user's other connected sessions perform a local sign-out automatically.
   - If another device is offline or disconnected from Realtime, Auth revocation still applies; its visible UI logout may wait until the device reconnects or its access token refreshes/expires.
   - Explicit `SELECT` and `INSERT` policies on `realtime.messages` restrict private session-control topics to the matching authenticated user.

5. **Two-Step Verification / TOTP MFA — IMPLEMENTED / MANUALLY VERIFIED**
   - Uses Supabase Auth MFA APIs for factor enrollment, challenge/verification, assurance-level checks, factor listing, and removal.
   - Enrollment displays the Supabase-generated QR code, manual setup secret, and six-digit verification input for authenticator applications such as Google Authenticator.
   - After a verified factor is enrolled, sign-in is gated by `MfaChallenge.tsx` until the session reaches the required MFA assurance level.
   - MFA removal is supported. Factor state comes from Supabase Auth and is not treated as a `localStorage` preference.
   - Enrollment, authenticator verification, MFA sign-in challenge, and removal have been manually tested successfully.

### Live Monitoring and Payroll Actions

6. **Live Monitoring Call Rider — IMPLEMENTED**
   - Uses the selected rider's stored phone number and a normalized `tel:` link to open the device's supported dialer.
   - The action is disabled when no rider phone number is available. No VoIP service or external telecommunications provider was introduced.

7. **Live Monitoring Quick Flag — IMPLEMENTED**
   - Reuses the existing persisted `manual_flag` violation workflow and appends the corresponding activity record with optional follow-up context.
   - Manual flagging remains distinct from automatic `boundary_exit`/`idle_timeout` incidents, incident read state, notification delivery state, and resolution state. It does not modify attendance or payroll.

8. **Payroll Bulk Export — IMPLEMENTED**
   - Exports selected payroll records as CSV through `buildBulkPayrollExportRows()` and the existing payroll export utility.
   - The operation is read-only and does not update payroll status, calculations, approvals, payment state, parcel logs, or attendance.
   - Export rows use `getPayrollDeliveryData()`, preserving the authoritative live-data rules for editable payroll and finalized delivery-line snapshots for protected historical payroll. No second payroll calculation path was introduced.

9. **Payroll Bulk Approval — IMPLEMENTED**
   - Admin and HR can approve a homogeneous selection of Pending Review payroll through the server-side atomic transition described in Section 7.
   - Stale, mixed-status, wrong-cutoff, missing, or invalid-snapshot selections fail as a complete transaction.

10. **Payroll Bulk Mark as Paid — IMPLEMENTED**
   - Admin and HR can mark a homogeneous selection of Approved payroll as Paid through the same authoritative transition engine.
   - Paid records retain immutable finalized delivery snapshots and cannot be rewritten from current parcel operations.

### Acceptance-Test Regression Fixes

- **Immediate cross-device logout**: Added the private Realtime session-control signal described above while retaining Supabase Auth as the revocation authority.
- **Shared Modal focus stability**: `Modal.tsx` now keeps its open/close focus lifecycle stable when callers pass new callback identities during controlled-input state updates. Inputs remain mounted and focused during continuous typing without per-keystroke focus hacks.
- **Employee Management action menu**: `UsersTable.tsx` renders the action menu through a body portal with fixed positioning, viewport clamping, downward/upward collision handling, scroll/resize repositioning, outside-click dismissal, Escape handling, and keyboard navigation. Bottom-row actions are no longer clipped by table overflow containers.

---

## 12. Dashboard Skeleton Architecture

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

## 13. Database Schema & RLS Summary

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
19. **`support_tickets`**: RLS-isolated support requests with Open, In Progress, and Resolved lifecycle state.
20. **`support_ticket_messages`**: Append-only ticket conversation history.
21. **`user_notification_preferences`**: One Supabase-backed notification-presentation preference row per user.
22. **`payroll_bulk_operations`**: Server-only idempotency and completed-result records for atomic payroll bulk transitions.

---

## 14. Safe Operational Reset State

An operational test data reset was previously conducted on the staging database.

- **Preserved System Data**: Auth users, user accounts (`users`), rider profiles (`riders`), face descriptors, geofence zones (`zones`), rate configurations (`parcel_rate_configurations`), database schema, RLS policies, and Storage buckets (`rider-documents`).
- **Cleared Test Operational Data**: Test attendance logs, location broadcasts, parcel logs, correction requests, draft payroll records, and activity logs.

---

## 15. Current Test & Build Verification

Verification executed against active repository state:

- **TypeScript Type-Check (`npm run typecheck`)**: **PASS (0 errors)**
- **Violations Database Lifecycle/RLS Suite**: **PASS (27 / 27 transactional assertions)**
- **Payroll Bulk Actions Database Suite**: **PASS (57 / 57 transactional assertions; latest completed batch result)**
- **Automated Test Suite (`npm test`)**: **PASS (140 / 140 tests passed across 36 test files)**
- **Account-Security Database Suite**: **PASS (14 / 14 transactional assertions)**
- **Session-Control RLS Suite**: **PASS (5 / 5 transactional assertions)**
- **ESLint Linting (`npm run lint`)**: **PASS (0 errors, 8 pre-existing warnings)**
- **Production Build (`npm run build`)**: **PASS (the existing Vite large-chunk advisory remains)**
- **Diff Validation (`git diff --check`)**: **PASS**

`jsdom@26.1.0` is installed as a **test-only development dependency** for real DOM focus, portal positioning, and interaction regression tests. It is not part of the application runtime architecture.

### Known Remaining Risks
- Stale rider status is evaluated on a one-minute schedule after a two-minute freshness threshold, so the visible transition may take approximately **2–3 minutes**.
- Reliable historical violation reconstruction requires historical zone-assignment data. Until that exists, delayed historical coordinates are retained without generating historical alerts.
- Existing unrelated Supabase advisor findings remain outside the Violations stabilization scope and require a separate security-maintenance pass.

---

## 16. Recently Resolved Issues

1. **Payroll Deletion Resurrection Bug**: Resolved. Read queries (`getPayrollRecords`, `getPaginatedPayrollRecords`) made pure SELECT operations so deleted draft records stay deleted.
2. **Payroll Re-Initialization Zero-Parcel Summary Bug**: Resolved. `initializeCutoffPayrollForFleet()` now explicitly calls `syncPayrollRecordsFromParcelLogs(..., { allowCreateMissing: false })` to hydrate newly created draft records with parcel aggregates and effective rates.
3. **Sidebar Modularization & Reference Section**: Resolved. Extracted presentation subcomponents into `components/common/sidebar/` and organized Payroll sidebar items into `Compensation` and `Reference` (`Parcel History`).
4. **DashboardSkeleton Modularization**: Resolved. Extracted skeletons into domain component folders (`components/dashboard/`, `components/hr/`, `components/payroll/`, etc.) with `SkeletonPrimitives.tsx`.
5. **Authoritative Violations Lifecycle**: Resolved. PostgreSQL now protects current rider state from historical GPS replay, scopes re-entry resolution to `boundary_exit`, handles zone reassignment and stale GPS deterministically, publishes rider status changes through Realtime, and separates automatic notifications from manual follow-up flags.
6. **First “Soon” Action Batch**: Resolved. Forgot Password, Admin/HR password-reset requests, account suspension/reactivation, logout of other sessions, TOTP MFA, Call Rider, Quick Flag, and Payroll Bulk Export are implemented; working actions no longer report fake success or appear as unavailable.
7. **One-Character Modal Focus Regression**: Resolved in the shared `Modal.tsx` focus lifecycle. Controlled modal inputs retain the same DOM node, caret, and focus across state updates.
8. **Employee Action Menu Clipping**: Resolved with a portal/fixed menu that flips within the viewport and preserves accessible dismissal and keyboard behavior.
9. **Online Support Tickets**: Resolved. The disabled support placeholder was replaced with an RLS-isolated Open/In Progress/Resolved ticket workflow, immutable replies, Realtime updates, and persisted in-app notifications.
10. **Notification Preferences**: Resolved. Preferences now persist per user in Supabase and control role-relevant toast/sound presentation without suppressing notification-history persistence.
11. **Payroll Bulk Approval and Payment**: Resolved. Admin/HR bulk and individual approval/payment actions now share atomic, idempotent, row-locked server transitions with immutable-snapshot validation.
12. **Biometric Cold-Start and Lifecycle Stabilization**: Resolved. Full representative warmup, mount-scoped camera ownership, resident face-api weights, stale-session cancellation, fresh-sample matching, versioned assets, and timing-only telemetry were added without changing models, descriptors, threshold, attendance, or geofence behavior.

---

## 17. Deferred / Future Features (Explicitly Marked PLANNED / DEFERRED)

> [!CAUTION]
> The following features have been discussed or planned for future releases, but **are NOT yet implemented in the codebase**. Future agents must not assume these exist.

1. **Account Deletion** *(PLANNED / DEFERRED)*:
   - No self-service or automated account-deletion workflow is implemented. Current UI directs the user to an administrator so operational history is not accidentally removed.
2. **Support Access** *(PLANNED / DEFERRED)*:
   - The controlled support-access setting is disabled and explicitly marked not yet available.
3. **Internal Live Monitoring Message / Chat** *(PLANNED / DEFERRED)*:
   - Live Monitoring's Message action remains disabled and marked Soon. Call Rider does not provide chat functionality.
4. **External Notification Delivery** *(PLANNED / DEFERRED)*:
   - Email digests, Web Push, SMS, and background external-delivery infrastructure are not implemented. Supabase-backed presentation preferences and database-backed in-app Realtime notifications are implemented separately.
5. **Localization / Preferred-Language Engine** *(PLANNED / DEFERRED)*:
   - Preferred-language selection is currently a stored preference only; it does not translate application content.
6. **Landing Contact-Form Backend** *(PLANNED / DEFERRED)*:
   - The public landing contact form has no submission handler, API route, or persistence workflow.
7. **Multi-Hub HR & Payroll Architecture** *(PLANNED / DEFERRED)*:
   - 4 regional hub structures (Hub-scoped HR/Payroll access vs main organization scope).
   - Currently, single organization-wide role model is used.
8. **Loans / Cash Advances / Financial Management** *(PLANNED / DEFERRED)*:
   - Cash Advances, Loans, and automatic repayment deductions.
   - Currently, standard gross pay and manual adjustment fields (`other_earnings`, `deductions`, `late_onhold`, `late_remittance`) are used.
9. **Native Capacitor Rider Application / Native Background GPS** *(PLANNED / DEFERRED)*:
   - Native iOS/Android builds and background geolocation daemon.
   - Currently, mobile rider features run as responsive web app / PWA with foreground GPS.
10. **Alternative Biometric Architecture** *(PLANNED / DEFERRED)*:
   - Tiny Face Detector production use, MediaPipe Web Workers, native TensorFlow Lite/native ML, Capacitor biometric migration, rider re-enrollment, and recognition-model replacement are not implemented.
   - SSD MobileNet V1 remains authoritative. Tiny may be evaluated only as a future A/B candidate if measured real-device evidence justifies it.

---

## 18. Current Handover State for Next IDE (Codex / Antigravity Handoff)

### Essential Invariants for Future Developers & AI Agents

1. **Never Re-introduce Read-Time Write Side-Effects**: `getPayrollRecords()` and `getPaginatedPayrollRecords()` must remain pure `SELECT` operations. Never call `syncPayrollRecordsFromParcelLogs()` inside read query functions.
2. **Never Delete Operational Source Data on Payroll Deletion**: Deleting a `payroll_records` row must delete ONLY the `payroll_records` table row. `parcel_logs`, `attendance_logs`, `riders`, and rate configurations must remain 100% untouched.
3. **Immutable Paid Payroll**: Submitted, Approved, and Paid/Disbursed payroll records use `payroll_delivery_lines` snapshots and must **never** be recalculated or overwritten by live parcel changes.
4. **Keep Approval and Payment Atomic**: Bulk and individual Approve/Mark as Paid actions must continue to use the server-side RPC transition engine. Never replace row locking, stale-version checks, idempotency, immutable-snapshot validation, audit entries, or notifications with client-side multi-update loops.
5. **Centralized Role Authorization**: Keep role permissions and sidebar definitions centralized in `sidebarNavigation.ts`; Supabase RLS remains the database security authority even when the frontend hides or disables an action.
6. **Keep PostgreSQL Authoritative for Geofencing**: `process_rider_location_geofence()` owns persisted status and violation decisions. Historical replay must never regress current rider state or create current alerts, and re-entry must resolve only the matching unresolved `boundary_exit`.
7. **Preserve Biometric Compatibility**: SSD MobileNet V1 remains the production detector, stored face descriptors remain unchanged 128-D vectors, and the Euclidean match threshold remains exactly `0.45`. Do not switch to Tiny or another recognition architecture without measured real-device evidence and an explicitly approved migration plan.
8. **Preserve Notification Persistence**: Notification preferences control toast/sound/category presentation, not whether notification rows and history are created. Critical and account notifications must remain visible.
9. **Preserve Operational Rate Integrity**: Parcel rates are resolved based on work date and Time-In timestamp. The fixed heavy parcel rate (₱17/parcel) applies to parcels above 4 kg.
