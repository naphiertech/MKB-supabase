# MKBRiderTrack Engineering Walkthrough & Codex Handoff

This document is the authoritative engineering reference and handoff document for **MKBRiderTrack**. It records the current implementation state, verified architecture, database schema, security rules, recent bug fixes, and deferred features as of **August 15, 2026**.

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
| **Admin** | Broad administrative authority, rate settings, user management, employment archiving/restoration, audit review, and permitted override actions | All pages (Dashboard, Tracking & Zones, HR & Employees, Parcel Operations, Finance & Reports, Settings) | Broad administrative access, constrained by deployed RLS policies, workflow triggers, append-only audit protections, employment-transition rules, and immutable payroll rules |
| **HR** | Attendance verification, Rider onboarding, assignment and employment lifecycle management, document verification, review moderation | Dashboard, Live Monitoring, Attendance, Employee Registry, Rider Assignments, Reviews, Audit Logs, Daily Parcel Entry, Parcel History, Payroll Checklist | May manage authorized Rider assignments and Archive/Restore Rider employment; cannot manage Admin/HR/Payroll employment; Read-only on Rates |
| **Payroll** | Salary computation, cutoff initialization, payslip generation, payroll exports, approval tracking | Dashboard, Salary Computation, Payroll Reports, Payroll History, Parcel History (Reference) | Read/Write on Payroll Records/Snapshots; Read-only on `parcel_logs`, Attendance, and Rates |
| **Rider** | Selfie Time-In/Out, live location broadcast, offline queue, personal attendance & payslips | Rider Mobile App (Dashboard, Attendance Scanner, Monitoring/Geofence Status, Profile/Payslips) | Read/Write on own Attendance, Locations, Diagnostics; Read-only on own Payslips/Logs |

> [!IMPORTANT]
> **Multi-Hub workspace support is implemented.** Admin is always global; HR and Payroll staff may have global or explicitly assigned hub access; Riders derive their hub from `riders.hub_id`. The global Hub selector and database RLS boundaries must remain aligned. See Section 18 for the current implementation and the latest UI-only work.

---

## 3. Current Navigation & Sidebar Architecture

### Navigation Configurations (`src/components/common/sidebar/sidebarNavigation.ts`)

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

#### 4. Rider Role Navigation (`src/components/rider/RiderTopNav.tsx`)
- Mobile Navigation Bar: Dashboard (`dashboard`), Attendance (`attendance`), Live Map (`monitoring`), Profile & Payslips (`profile`)

### Global Hub Workspace Selector

- `HubProvider` loads the hubs visible to the authenticated user and owns the selected workspace.
- Admin and globally scoped HR/Payroll staff can select **All Hubs** or one accessible hub. Assigned-scope staff are constrained to their authorized hubs. Riders do not use the staff workspace selector.
- The selected workspace is persisted per user in `localStorage`, exposed through `HubContext`, and included in the route workspace key so affected screens refresh when the hub changes.
- Realtime location, violations, notifications, workforce directories, employee management, support tickets, payroll views, geofence data, and other hub-aware dashboard queries respect the active hub workspace in addition to server-enforced RLS.
- On Rider Assignments, a selected Hub includes Riders whose permanent Home Hub **or** current Operational Hub matches, so temporarily deployed Riders remain visible to both authorized operational contexts. Riders themselves never use this selector.

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
- Rider Dashboard biometric preloading is mobile-friendly and interaction-aware. After the dashboard becomes interactive, preload waits for browser idle time, postpones pending work while the rider scrolls or interacts, and yields between expensive initialization and representative warmup stages. Time In/Out receives foreground priority and reuses the existing singleton model promises without creating concurrent model instances.
- Zone-context hydration no longer restarts the complete Rider Dashboard cache/revalidation flow. Offline stale-while-revalidate behavior remains enabled, while the redundant identical startup revalidation was removed.
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

A real-device numeric post-fix first-face benchmark is still pending. Do not claim a measured numeric speedup until camera/WebGL timings are captured on a real target device through the telemetry above.

Physical Android acceptance testing of the interaction-aware preload has passed. During background biometric initialization, Rider Dashboard scrolling, hamburger navigation, and Notifications remained responsive. The previous significant freezing was not reproduced; only minor occasional frame drops remained and were accepted as manageable. Time In and Time Out biometric verification were also acceptable on the tested Android device. This is a qualitative acceptance result, not a numeric performance benchmark.

Intentional interaction timing remains part of the current flow: scanner startup waits about **220 ms**, liveness requires genuine user interaction with roughly a **1-second minimum**, the success state remains visible for about **1.2 seconds**, and three genuinely fresh descriptor samples add verification time because descriptor sampling remains throttled. These are not documented as bugs.

### Deferred Biometric Changes

The following are not implemented: a Tiny Face Detector production switch, MediaPipe Web Worker migration, native TensorFlow Lite/native ML, Capacitor biometric migration, rider re-enrollment, and recognition-model replacement. Current Android acceptance results do not justify these changes. Reconsider them only if future device telemetry or a verified regression demonstrates a need.

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

The Payroll Bulk Actions batch passed **57 / 57 database assertions** and **130 / 130 application tests** at the time that batch was completed. The current repository-wide application count is recorded in Section 16.

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

## 12. Employee Archive and Restore Employment

Employee Archive is an implemented employment-lifecycle workflow. It is not account deletion, and it does not add an `archived` value to either account access or Rider live status.

### Three Separate States

```text
Account access:        users.status             = active | suspended
Employment lifecycle: users.employment_status  = active | archived
Rider live state:      riders.status            = active | idle | violation | offline
```

- An Archived employee must have a suspended account. An Archived Rider is operationally offline.
- Account suspension by itself does not end employment.
- Restore Employment returns employment to Active but deliberately leaves the account Suspended and the Rider Offline. Account reactivation is a separate, explicit privileged action.
- The same `users`, Supabase Auth, and `riders` identities are retained throughout Archive and Restore. No replacement account or Rider row is created.

### Authoritative Server-Side Lifecycle

- `admin-user-actions` version 3 extends the existing privileged account-management Edge Function with `archive` and `restore` actions. It resolves the actor and target from server-side data and never trusts a client-supplied role.
- `transition_employee_lifecycle()` is the database-authoritative transition RPC. Only `service_role` can execute it; normal authenticated and anonymous clients cannot forge lifecycle changes.
- Requests use a stable request UUID. A retry returns the existing result without adding a duplicate `employee_archived` or `employee_restored` audit event.
- Archive validates the approved reason, effective date, permissions, self-archive prohibition, last-active-Admin protection, and open attendance blocker. Future-dated Archive is intentionally unsupported in v1.
- Archive bans Supabase Auth access, changes employment to Archived and account access to Suspended, sets a Rider Offline, resolves only applicable unresolved `boundary_exit` incidents, retains the zone assignment, appends an authoritative activity event, and sends the existing private `terminate_sessions` Realtime signal.
- `manual_flag` and `idle_timeout` incidents are not auto-resolved. Attendance is never silently closed or given a fake Time Out.
- If the database transition fails after the Auth ban, the Edge Function restores the target's previous Auth ban state.

### Metadata and Database Enforcement

`public.users` now stores `employment_status`, `archive_effective_date`, `archive_reason`, `archive_remarks`, `archived_at`, `archived_by`, `restored_at`, `restored_by`, and `restore_reason`. Constraints enforce required Archive metadata, the approved reasons, remarks for `Other`, and the Archived-implies-Suspended invariant. A partial unique index protects non-null `users.rider_id` links.

Pinned-search-path helper functions provide explicit current, historical, and date-effective workforce scopes:

- `is_user_currently_employed(user_id)`
- `is_rider_employed_on(rider_id, business_date)`
- `is_rider_operational_at(rider_id, event_time)`
- `get_rider_workforce_directory()`
- `get_payroll_eligible_rider_ids(cutoff_start, cutoff_end)`

Database triggers and RLS policy checks independently reject archived or suspended Rider-originated attendance, GPS, operational self-update, and post-Archive parcel writes. This means a stale token or offline outbox cannot bypass employment state. Failed outbox operations remain in the existing diagnosable failed-operation flow; Archive does not delete the outbox to hide them.

Historical attendance, locations, parcels and correction audits, payroll and immutable delivery lines, violations, documents and Storage files, support conversations, notifications, activity history, face descriptors, vehicle data, and identity data remain attached to the original employee. Authorized historical views use an explicit historical/date-effective scope rather than the active workforce query.

### UI, Permissions, and Operational Scoping

- Admin can Archive/Restore permitted employee accounts but cannot archive their own account. HR can Archive/Restore Riders only. Payroll and Rider roles have no lifecycle controls.
- Users Registry / Employee Management defaults to Employment: Active and supports Archived and All views while preserving search, role, zone, and separate Account filters.
- Table badges and columns distinguish Employment, Account Access, and Presence. Archived rows are visually muted and expose only View Profile, View History, and Restore Employment.
- The Archive modal requires a reason and effective date, requires remarks for `Other`, explains the consequences and preserved history, and blocks submission when the Rider has an open attendance session.
- Archived profiles remain readable to authorized staff and show effective date, reason, remarks, actor, and timestamp. Operational editing is hidden while existing historical Attendance and Documents access remains available; the dedicated historical Payroll, Parcel, Violation, Report, and Audit workspaces retain date-appropriate identity lookup.
- Live Monitoring, active zone/assignment selectors, Daily Parcel Entry, active workforce counts, and normal global operational search exclude Archived employees. Historical pages still include them when the selected date requires it.
- Payroll initialization is still intentional and is now date-effective. It may create Drafts only for Riders employed during the selected cutoff, then uses the existing hydration path. Pure payroll reads, existing Drafts, Submitted/Approved/Paid records, and immutable snapshots retain all prior invariants.

Restore Employment preserves the last zone as context but does not record a separate database-level “zone confirmed” acknowledgment. Operations must confirm/change that assignment before explicitly reactivating the account. Formal rehire/employment-period tracking remains deferred.

### Deployment and Verification

- Local/deployed migration: `dashboard/supabase/migrations/20260811043036_employee_rider_archiving.sql` / remote migration `20260811043036 employee_rider_archiving`.
- Edge Function: deployed `admin-user-actions` version 3 with JWT verification enabled.
- No broad `supabase db push` was used, and no old production migration was rewritten or replayed.
- Postflight production invariants: 10 users, 7 Riders, 0 archived employees, 0 open attendance sessions, 0 Paid payroll rows, and the unchanged empty Paid-payroll fingerprint `d41d8cd98f00b204e9800998ecf8427e`.

## 13. Dashboard Skeleton Architecture

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

## 14. Database Schema & RLS Summary

The generated Supabase schema and repository migrations confirm the following application tables. This list excludes extension-owned/PostGIS metadata tables and should not be treated as an exhaustive inventory of every database relation:

1. **`users`**: System user profiles and separate account/employment lifecycle state (`id`, `full_name`, `role`, `email`, `status`, `employment_status`, `hub_access_scope`, Archive/Restore metadata, `created_at`).
2. **`hubs`**: Admin-managed operational hubs (`id`, `name`, `description`, `active`, audit actor fields, timestamps).
3. **`user_hub_access`**: Explicit staff-to-hub assignments for HR/Payroll users whose `hub_access_scope` is `assigned`.
4. **`riders`**: Fleet riders. `home_hub_id` / `home_zone_id` are the permanent Home assignment; `hub_id` / `zone_id` are the current Operational assignment used by attendance, parcels, GPS, geofencing, and other live workflows.
5. **`rider_assignments`**: Controlled permanent-transfer and temporary-deployment history (`rider_id`, source/target Hub and Zone snapshots, dates, status, reason, creator, early-end audit fields). A partial unique index permits only one active temporary deployment per Rider.
6. **`attendance_logs`**: Time-In/Out logs (`id`, `rider_id`, `hub_id`, `date`, `time_in`, `time_out`, `status`, `lat`, `lng`).
7. **`rider_locations`**: Live GPS coordinates (`id`, `rider_id`, `hub_id`, `latitude`, `longitude`, `speed`, `recorded_at`).
8. **`zones`**: Geofence polygon zones (`id`, `hub_id`, `name`, `coordinates`, `color`).
9. **`parcel_logs`**: Daily parcel counts & earnings (`id`, `rider_id`, `hub_id`, `date`, `parcels`, `heavy_parcels`, `rate`, `heavy_rate`, `standard_earnings`, `heavy_earnings`, `daily_gross`, `rate_configuration_id`).
10. **`parcel_log_audit`**: Append-only, hub-scoped audit history of parcel log edits.
11. **`parcel_correction_requests`**: Rider/HR correction requests (`id`, `parcel_log_id`, `hub_id`, `requested_delivered`, `requested_heavy`, `status`).
12. **`parcel_rate_configurations`**: Effective-dated rates (`id`, `effective_from`, `effective_until`, `early_standard_rate`, `regular_standard_rate`, `late_standard_rate`, `heavy_parcel_rate`, `heavy_threshold_kg`).
13. **`parcel_rate_configuration_audit`**: Audit trail for rate configuration changes.
14. **`payroll_records`**: Hub-scoped derived payroll summaries (`id`, `rider_id`, `hub_id`, `cutoff_start`, `cutoff_end`, `total_parcels`, `gross_pay`, `status`).
15. **`payroll_delivery_lines`**: Hub-scoped immutable daily delivery line snapshots for submitted/approved/paid payroll.
16. **`rider_documents`**: Employee document metadata (`id`, `rider_id`, `hub_id`, `document_type`, `file_path`, `verification_status`).
17. **`notifications`**: System notifications (`id`, `target_role`, `hub_id`, `title`, `message`, `read`).
18. **`activity_logs`**: System event audit trail (`id`, `event_type`, `hub_id`, `description`, `metadata`, `created_at`).
19. **`reviews`**: Courier review and moderation records.
20. **`user_devices`**: Registered user-device and device-validation records, including hub snapshots where applicable.
21. **`violations`**: Hub-scoped Rider incidents for `boundary_exit`, `idle_timeout`, and `manual_flag`, with independent read and resolution state.
22. **`support_tickets`**: RLS-isolated, hub-scoped support requests with Open, In Progress, and Resolved lifecycle state.
23. **`support_ticket_messages`**: Append-only ticket conversation history.
24. **`user_notification_preferences`**: One Supabase-backed notification-presentation preference row per user.
25. **`payroll_bulk_operations`**: Server-only idempotency and completed-result records for atomic payroll bulk transitions.

Hub-scoped operational tables use indexed `hub_id` snapshots and restrictive RLS policies backed by `private.user_can_access_hub(...)`. The database remains authoritative for data visibility; changing the frontend selector alone cannot grant access to another hub. Rider assignment mutations are exposed only through guarded RPCs; direct authenticated writes to `rider_assignments` and protected Rider assignment columns are denied.

---

## 15. Safe Operational Reset State

An operational test data reset was previously conducted on the staging database.

- **Preserved System Data**: Auth users, user accounts (`users`), rider profiles (`riders`), face descriptors, geofence zones (`zones`), rate configurations (`parcel_rate_configurations`), database schema, RLS policies, and Storage buckets (`rider-documents`).
- **Cleared Test Operational Data**: Test attendance logs, location broadcasts, parcel logs, correction requests, draft payroll records, and activity logs.

---

## 16. Current Test & Build Verification

Verification executed against active repository state:

- **TypeScript Type-Check (`npm run typecheck`)**: **PASS (0 errors)**
- **Violations Database Lifecycle/RLS Suite**: **PASS (27 / 27 transactional assertions)**
- **Payroll Bulk Actions Database Suite**: **PASS (57 / 57 transactional assertions; latest completed batch result)**
- **Employee Archive Database Lifecycle/RLS Suite**: **PASS (40 / 40 transactional assertions)**
- **Automated Test Suite (`npm test -- --run`)**: **PASS (241 / 241 tests passed across 60 test files)**
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
- Individual WebGL, WASM, or model-initialization operations may still produce occasional non-interruptible frame drops on lower-powered Android devices. Current physical-device testing found these minor and manageable after interaction-aware scheduling.
- A fully offline Archived Rider may not receive the immediate Realtime logout signal until reconnect or token refresh. Database triggers and RLS still reject new operational writes independently.
- Future-dated Archive and formal rehire/employment-period history are intentionally not implemented in v1. Restore uses the existing identity and records the current Archive/Restore gap rather than creating a new employment period.
- Restore retains the last assigned zone, but zone confirmation is currently an explicit operational step rather than a separately persisted database acknowledgment.
- The current Supabase advisor scan still reports unrelated pre-existing findings, including the `v_attendance_summary` Security Definer view, mutable search paths on legacy functions, `spatial_ref_sys` without RLS, PostGIS in `public`, legacy callable Security Definer functions, unindexed foreign keys, and unused-index/policy performance notices. These were not broadened into this feature.

---

## 17. Recently Resolved Issues

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
13. **Android Rider Dashboard Preload Freezing**: Resolved and physically accepted. Biometric preload now waits for browser idle time, yields between expensive stages, postpones pending work during rider interaction, and gives Time In/Out foreground priority. Android testing confirmed responsive scrolling, hamburger navigation, and Notifications during preload, with only manageable occasional frame drops.
14. **Employee/Rider Archiving**: Implemented as a separate, server-authoritative employment lifecycle. Archive removes former employees from current operations and login while preserving all history; Restore keeps account access suspended until a separate Reactivate action.
15. **PostgREST Multi-FK Embed Ambiguity**: Resolved. Workforce queries explicitly select `user_hub_access!user_hub_access_user_id_fkey(...)`; Rider operational screens explicitly select `zones!riders_zone_id_fkey(...)`, while permanent Home Zone displays intentionally use `zones!riders_home_zone_id_fkey(...)`.
16. **Controlled Rider Assignments**: Implemented for Admin and authorized HR with permanent transfers, temporary deployments, extension, early end, assignment history, Home/Operational Hub visibility, and server-side attendance, overlap, authorization, and Hub/Zone consistency checks.
17. **Dashboard UI Consistency and Dense-Control Regressions**: Resolved with shared card/control/state/table primitives, compact Users and Payroll filter widths, and responsive Rider Assignments table behavior without changing backend workflows.

---

## 18. Latest Implemented Work — Multi-Hub and Dashboard UI Polish

### August 12, 2026 — Multi-Hub Foundation and Workspace

This was an earlier full-stack implementation and is already committed. It is separate from the August 13 UI-only work below.

- Added `hubs`, `user_hub_access`, `users.hub_access_scope`, indexed operational `hub_id` snapshots, restrictive hub-access RLS, authoritative helper functions, and Admin RPCs for staff access and zone assignment.
- Admin remains global. HR and Payroll may be global or assigned to explicit hubs. Riders inherit their hub from `riders.hub_id`, and Rider zone/hub consistency is enforced.
- Added the global Hub selector, `HubContext`, persisted per-user workspace selection, hub-aware query state, hub-filtered Realtime handling, and route refresh behavior when the workspace changes.
- Added Admin Hub Management for creating, editing, activating/deactivating hubs and assigning zones. Hubs are not synthesized automatically.
- Added hub selection to the Geofence zone workflow and hub access controls to Employee Management.
- Preserve this implementation. Do not remove the Hub selector, `HubProvider`, Hub Management route, hub-scoped query filtering, database snapshots, RPCs, triggers, or RLS policies during UI work.

### August 13, 2026 — Audit Logs UI

- Reworked the narrow-screen audit ledger into readable activity cards instead of compressing the desktop table into an unusable mobile layout.
- Improved compact KPI cards, action/type emphasis, responsive filters, refresh/export controls, actor metadata, expandable details, loading/error/empty states, and internal table scrolling.
- Existing log loading, filtering, export data, activity-log persistence, permissions, and backend behavior were preserved.

### August 13, 2026 — Payroll Reports Chart

- Replaced the visually empty parcel comparison area with a responsive ranked horizontal comparison for **Parcels Delivered per Rider**.
- Added proportional volume bars, zero-value treatment, leader emphasis, scale markers, loading and empty states, and summary metrics for highest volume, leader output, and active riders.
- Existing payroll calculations, cutoff filtering, source records, report generation, exports, and immutable payroll rules were not changed.

### August 13, 2026 — Universal Dashboard Width and Responsiveness Pass

- Root cause: operational pages duplicated centered `max-w-*` / `mx-auto` containers while the shared staff workspace had no explicit fluid-width contract.
- Added shared `.dashboard-workspace`, `.dashboard-page`, and `.dashboard-auto-grid` primitives. Staff routes now use a full available-width canvas after the sidebar, `min-width: 0`, fluid responsive padding, and no `100vw` overflow workaround.
- Removed conflicting page-level caps from Admin/HR dashboards, Hub Management, Reviews Moderation, Attendance, Users/Employee Management, Reports, Geofence, Audit Logs, Parcel Operations/History, Payroll Checklist/Dashboard, Payroll Computation, Payroll Reports, Payroll History, and Settings.
- Improved adaptive Reviews grids and narrow-screen Hub Management details/zone assignment controls. Live Monitoring intentionally remains a flush map canvas; dialogs, focused forms, authentication UI, the Support drawer, and Rider-focused workflows retain appropriate readable bounds.
- This batch changed only `dashboard/src` frontend presentation files plus this documentation. It did **not** change services, Supabase, migrations, database schema/data, RLS, authentication, attendance, payroll calculations, geofencing behavior, facial recognition, backend functions, or `landing/`.

### August 13, 2026 — Controlled Rider Assignments

- Added the Admin/HR **Rider Assignments** workspace with Active Assignments, Temporary Deployments, Expiring Soon, and Unassigned Rider summaries; Hub/Zone/type/status filters; responsive desktop table and mobile cards; and assignment-history details.
- A permanent transfer changes both permanent Home and current Operational Hub/Zone. A temporary deployment keeps Home unchanged and temporarily changes only the Operational pair. Expiry and early end restore the exact current Home Hub and Home Zone.
- `rider_assignments` preserves source/target assignment history. Extending updates the same logical deployment and writes the prior/new end date and reason to `activity_logs`; it does not create an overlapping deployment.
- `transfer_rider_permanently`, `deploy_rider_temporarily`, `extend_rider_deployment`, and `end_rider_deployment_early` enforce authorization and workflow rules. Assignment changes are blocked during open attendance; permanent transfer is blocked during an active deployment; only one active deployment is allowed; target Zone must belong to the active target Hub.
- Operational records continue using their own Hub snapshots, so historical attendance, parcels, payroll, GPS, violations, and audit data are not rewritten by later assignment changes. Payroll remains one record and one official payslip per Rider per cutoff across all work locations.
- Repository migrations: `20260813155743_rider_assignments.sql`, `20260813161837_allow_unzoned_rider_home_assignment.sql`, and `20260813162155_index_rider_assignment_foreign_keys.sql`.

### August 15, 2026 — Dashboard UI Normalization and Rider Assignment Action UX

- Added shared dashboard presentation primitives for cards, toolbars, controls, buttons, badges, loading/error/empty states, and table defaults while preserving page services and domain logic.
- Removed duplicate in-page headings where the global top bar already supplies the page title, and tightened desktop filter controls in Users and Payroll so short dropdowns do not consume unnecessary width.
- Rider Assignments now keeps short desktop values on one line, allows naturally long Rider/Zone names to wrap, preserves the mobile card layout, and uses responsive horizontal table overflow without a visually persistent scrollbar.
- The desktop Actions column is a compact sticky right-side three-dot menu rendered through the existing portal/overlay pattern. It remains visible during horizontal scrolling and supports tooltip/accessible labeling, keyboard navigation, Escape, outside-click dismissal, focus restoration, and the existing drawers and eligibility rules.
- Normal/Home rows expose Transfer Permanently, Deploy Temporarily, and View Assignment History. Active temporary deployments expose Extend Deployment, End Deployment Early, and View Assignment History.

### Latest Verification

- Responsive browser matrix: **86 checks passed** from 320px through 3840px, including effective widths representative of 1080p, 1440p, 2K, 4K, ultrawide, and zoomed-out desktop usage.
- TypeScript: **PASS**.
- Automated tests: **241 / 241 PASS across 60 files**.
- ESLint: **PASS with 0 errors and 8 pre-existing warnings**.
- Production build: **PASS**; the existing Vite large-chunk advisory remains.
- `git diff --check`: **PASS**.
- All task-generated implementation changes are inside `dashboard/`; no task-generated `landing/` changes remain.

---

## 19. Deferred / Future Features (Explicitly Marked PLANNED / DEFERRED)

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
7. **Loans / Cash Advances / Financial Management** *(PLANNED / DEFERRED)*:
   - Cash Advances, Loans, and automatic repayment deductions.
   - Currently, standard gross pay and manual adjustment fields (`other_earnings`, `deductions`, `late_onhold`, `late_remittance`) are used.
8. **Native Capacitor Rider Application / Native Background GPS** *(PLANNED / DEFERRED)*:
   - Native iOS/Android builds and background geolocation daemon.
   - Currently, mobile rider features run as responsive web app / PWA with foreground GPS.
9. **Alternative Biometric Architecture** *(PLANNED / DEFERRED)*:
   - Tiny Face Detector production use, MediaPipe Web Workers, native TensorFlow Lite/native ML, Capacitor biometric migration, rider re-enrollment, and recognition-model replacement are not implemented.
   - SSD MobileNet V1 remains authoritative. Current physical Android acceptance testing does not justify Tiny Face Detector or a MediaPipe Worker; evaluate alternatives only if future telemetry or a verified regression warrants it.
10. **Formal Rehire / Employment Periods** *(PLANNED / DEFERRED)*:
   - Restore Employment currently reuses the same employee identity and preserves the Archive/Restore gap. A separate `employment_periods` model and formal Rehire workflow are not implemented.
11. **Future-Dated Employee Archive** *(PLANNED / DEFERRED)*:
   - Archive effective dates are limited to today or earlier in v1. Scheduled future employment termination is not implemented.

---

## 20. Current Handover State for Next IDE (Codex / Antigravity Handoff)

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
10. **Keep Employment, Account, and Rider State Separate**: Employee Archive changes `users.employment_status`, forces account suspension, and leaves Rider live state Offline. Restore Employment must not automatically reactivate the account, create a new identity, synthesize history, or replay stale offline work.
11. **Use Explicit Workforce Scopes**: Current operational selectors use Active/current workforce scope; historical pages use All/date-effective scope. Do not globally hide Archived identities or globally include them in new work.
12. **Preserve Multi-Hub Authorization**: Keep the global Hub selector and client workspace filters synchronized with the database-authoritative `hub_id` snapshots and restrictive RLS. A UI-only change must never remove hub boundaries, broaden an assigned staff member to All Hubs, or treat client filtering as an authorization substitute.
13. **Preserve Home vs Operational Rider Assignments**: `riders.home_hub_id` / `home_zone_id` are permanent; `riders.hub_id` / `zone_id` are operational. Use the assignment RPCs, never rewrite historical operational snapshots, never create overlapping deployments, and return temporary deployments to the exact current Home pair on expiry or early end.
14. **Disambiguate PostgREST Embeds**: Because `users` has multiple relationships to `user_hub_access` and `riders` has both current and Home relationships to `zones`, always name the intended FK in embedded selects. Operational Rider screens use `zones!riders_zone_id_fkey`; Home assignment displays use `zones!riders_home_zone_id_fkey`.
15. **Preserve One Payroll per Rider per Cutoff**: Multi-Hub work contributes to the Rider's single payroll record and official MKB payslip. Hub attribution remains internal; do not split payroll or alter the official payslip format by Hub.
