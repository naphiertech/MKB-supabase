# CHAPTER III

# DESIGN AND METHODOLOGY

This chapter presents the design and development basis of MKBRiderTrack as supported by the current system implementation. It describes the software development stages, implemented requirements, system architecture, technical background, subsystem integration, testing evidence, research instruments, statistical tools, and ethical considerations. Statements about the system are limited to behaviors verified in the application source, database migrations, security policies, and automated tests. Items that depend on the researchers’ historical records or research protocol are marked for confirmation.

## 3.1 SDLC Model — Agile

The researchers identified **Agile** as the Software Development Life Cycle methodology used for MKBRiderTrack. Agile supports incremental development, recurring review, and adaptation as software requirements and implementation knowledge develop **[SOURCE REQUIRED]**. For MKBRiderTrack, this approach was appropriate because the system combines interdependent attendance, identity verification, geolocation, Hub and Zone management, parcel operations, payroll, reporting, and security rules. Changes in one area can affect several other modules; for example, attendance Time In affects parcel-rate eligibility, while parcel records become the operational source for payroll computation. An iterative approach allowed these connected rules to be refined and verified without treating the system as a single indivisible implementation.

The required sequence is presented as **Planning → Analysis → Design → Implementation → Testing and Integration → Maintenance**. These headings explain how the actual system outputs relate to Agile work. They do not reconstruct undocumented sprint dates, sprint counts, ceremonies, meetings, stakeholder sessions, or release events. The repository demonstrates incremental technical refinement through modular source changes, forward-only database migrations, regression tests, and continuous-integration checks, but it does not preserve a complete chronological record of the researchers’ Agile activities.

[INSERT FIGURE 3.1: SDLC Model]

### 3.1.1 Planning

Within the Agile approach, planning established the system scope and provided a basis that could be revisited as connected modules were refined. The planning scope represented by the completed system concerns the management of MKB Corporation’s riders, attendance, operational locations, parcel delivery records, and payroll. The implemented application identifies four principal user groups: Admin, Human Resources (HR), Payroll Officer, and Rider. The public landing website serves visitors separately and does not expose the authenticated operational workspaces.

The current implementation supports a project scope in which Admin users manage system-wide records and configurations; HR users manage workforce and attendance-related activities and review payroll; Payroll Officers prepare payroll computations and adjustments; and Riders access attendance, monitoring, profile, and payslip functions. The system also represents multiple operational Hubs and their Zones, allowing staff visibility and Rider assignments to be scoped by Hub.

The technical scope shows that attendance planning included live camera use, an enrolled facial reference, blink-based liveness checking, a current device location for Time In, and daily attendance records. Geofence planning is represented by circular and polygonal operational Zones, server-side processing of Rider location updates, violation records, and a newly added Hub coordinate-and-radius configuration. However, the current Time-In workflow does not yet use the Hub attendance radius or operational-Zone containment as an attendance gate. It only requires a fresh GPS position before and after face verification. Accordingly, physical Hub-radius enforcement must not be described as complete.

Payroll planning is represented by weekly Monday-to-Sunday cutoff periods beginning August 31, 2026, a one-week payout lag, date-eligible Rider coverage, parcel-derived delivery earnings, traceable manual earnings and deductions, approval and return paths, immutable submitted snapshots, Paid-state protection, and Rider access to approved or paid payroll records. Security planning is reflected in Supabase authentication, Row Level Security (RLS), role and Hub access checks, optional TOTP multi-factor authentication, trusted-device controls for Riders, protected database functions, and audit records.

The repository does not establish how these needs were originally identified or agreed upon. It contains no verified record of stakeholder meetings, interviews, requirement workshops, dates, participants, or direct statements by MKB Corporation representatives. These historical planning details must therefore be supplied by the researchers.

**[NEEDS CONFIRMATION: MKB Corporation operational problem formally identified during project planning]**

**[NEEDS CONFIRMATION: Stakeholders and target users consulted during planning]**

**[NEEDS CONFIRMATION: Requirements-gathering activities, dates, participants, and approved project scope]**

### 3.1.2 Analysis

The Agile analysis stage is represented by the functional rules and data boundaries encoded in the completed application. These rules provide a reliable description of the requirements refined into the current system, even though the repository does not preserve a complete history of requirement discussions or analysis sessions.

#### Functional and user-role requirements

The system requires an authenticated account to resolve to a role-bearing profile in the `users` table. The four implemented roles are Admin, HR, Payroll, and Rider. Admin users receive the broadest application workspace, including monitoring, geofence and Hub management, attendance, users, Rider assignments, configuration, audit logs, parcel operations, payroll, reports, and reviews. HR users receive workforce, attendance, monitoring, parcel, report, review, and payroll-review functions. Payroll Officers receive computation, payroll adjustments, reports, history, and read-only operational references. Riders receive only their own dashboard, attendance scanner, operational map, profile, and protected payroll information.

Application page guards improve the user experience by preventing unsupported page keys, but the database is the principal authorization boundary. RLS policies and guarded functions restrict records by role, canonical Rider identity, employment state, account status, and Hub scope. Admin access is broad but remains subject to database constraints and protected lifecycle rules. HR cannot edit Draft or Rejected payroll computations. Payroll Officers can prepare editable payroll but cannot approve, reject, return, or mark it Paid. Riders can read and write only specifically permitted records associated with their own Rider identity.

#### Attendance requirements

The implemented Time-In requirement combines account eligibility, a current real GPS reading, a live camera stream, blink-based liveness, and one-to-one face verification. Browser geolocation uses high-accuracy tracking with no cached-position allowance at acquisition. A position is treated as current for at most two minutes. This condition is checked before the scanner opens and again after biometric verification, reducing the possibility that a location acquired before a long scan is accepted after it has become stale.

For face verification, the application detects one face, calculates facial landmarks, and produces a 128-dimensional descriptor. It compares the live descriptor with the enrolled Rider descriptor through Euclidean distance and a fixed threshold of `0.45`. The implementation requires three fresh matching descriptor samples. Before matching succeeds, MediaPipe landmarks must show a blink sequence consisting of stable open eyes, closed-eye frames, and reopened-eye frames. This is more accurately described as **face verification with blink-based liveness** than as general face recognition because the system compares the person at the camera with one claimed Rider identity.

After the checks pass, the application records or replaces the Rider’s same-day attendance state with a `face-scan` source, activates the Rider’s operational status, and stores a location update. If the database write cannot be completed because the client is offline, the operation may be placed in an IndexedDB outbox using a stable idempotency key and original event time. Server triggers still apply employment and operational eligibility when queued data is replayed.

Time Out operates on the active attendance row after the same biometric verification process. Unlike Time In, it may continue without a current GPS reading. When location is available, it is included in the subsequent status update. The attendance row receives `time_out`, and the Rider is placed offline. Duplicate scan execution is limited through per-session and in-flight locks.

Attendance punctuality is distinct from parcel compensation. The implemented attendance policy uses effective-dated `attendance_policy_configurations`. The view `v_attendance_summary` resolves the policy effective on the attendance date so that a later policy change does not silently reclassify historical attendance. A Time In exactly at the threshold is On Time, while a later value is Late. The fixed 5:00 p.m. Manila-time daily finalization process creates an Absent record when required and maintains missing-Time-Out as a separate completion condition rather than fabricating a clock-out time.

#### Geolocation and geofencing requirements

Operational Zones support circular and polygonal shapes. For circular Zones, the application calculates the great-circle distance between coordinates using the Haversine formula. For polygonal Zones, browser and database logic use ray-casting point-in-polygon evaluation. The Zone editor uses Turf to subtract existing circle or polygon geometry from a new polygon and can reject a fully or excessively overlapping design. Because each Rider has one current operational `zone_id`, no runtime multi-zone or nearest-zone selection process is implemented.

The browser uses Zone geometry to show provisional in-zone or out-of-zone feedback. Persisted decisions are made by PostgreSQL when a `rider_locations` row is inserted. The database examines attendance state, location freshness, and Zone containment to update Rider state and create or resolve appropriate geofence violations. A Rider with no active attendance is offline. During an active shift, an out-of-zone location may produce a violation; an in-zone location may result in active state; and a stale position may result in idle state. Re-entry automatically resolves only the applicable unresolved boundary-exit incident.

The `hubs` table now also supports `latitude`, `longitude`, and `attendance_radius_m`. New Hubs must have all three values, and modifications are audited. These fields provide a foundation for a physical attendance geofence. Nevertheless, current attendance code does not calculate Rider-to-Hub distance or reject Time In outside this radius. The implemented requirement is therefore fresh GPS acquisition, not completed Hub-radius enforcement. The operational Zone geofence likewise monitors the active shift but does not currently prevent Time In.

#### Parcel and payroll requirements

Parcel Operations stores daily standard delivered, heavy delivered, failed, returned, and assigned counts, together with notes and captured effective rates. An official same-day attendance Time In is required before parcel earnings can be recorded. The database selects the effective-dated parcel rate configuration and determines the standard rate from the Rider’s Manila Time In. Heavy parcels use the configured heavy-parcel rate. Unlocked records can be edited through normal Parcel Operations; a period already in Pending, Approved, or Paid payroll requires the formal correction-request workflow.

For weekly payroll beginning August 31, 2026, a valid cutoff starts on Monday and ends on Sunday. Draft delivery values are calculated on the server from `parcel_logs`. The system prepares records for Riders eligible during the selected period and prevents duplicate Rider/cutoff records. The resulting delivery data is combined with traceable manual adjustments. Other Earnings and FM Pick Up are cutoff-specific earning entries. General Deductions, Late Onhold/FM, and Late Remittance are represented as obligations with allocations across cutoffs. The calculation follows the implemented relationship:

`Total Earnings = Gross Delivery Pay + Other Earnings + FM Pick Up`

`Total Deductions = General Deductions + Late Onhold/FM + Late Remittance`

`Net Pay = Total Earnings - Total Deductions`

The authoritative workflow uses exact database statuses. Draft or Rejected records may be submitted as Pending. A Pending record may be Approved, Rejected, or returned to Draft for revision. An Approved record may be marked Paid only on or after its earliest payable date. Approval and payment bulk actions use server-side row locking, version checks, request identifiers, and snapshot validation. A transition to Pending captures immutable daily delivery and adjustment data. Approved and Paid records cannot be recalculated from later operational edits, and Paid records are immutable.

The database enum also retains the legacy values `processed` and `flagged`, but these values are not part of the current authoritative transition graph. A returned record does not receive a `returned` status; it returns to `draft`, while return actor and timestamp fields preserve the event.

Riders with active employment and full account access may read their own Approved or Paid payroll records and corresponding finalized delivery lines. Payslips are generated on the client from these protected records and immutable snapshots. There is no separate `payslips` table.

#### Security and data requirements

The database model must preserve links among authenticated profiles, Riders, Hubs, Zones, attendance, location history, parcel operations, payroll, notifications, and audit records. UUID keys and foreign-key constraints establish identity and history. Unique constraints and idempotency records reduce duplicate daily operational and payroll transactions. RLS controls exposed-table access, while triggers and guarded functions enforce rules that must remain effective even if a user bypasses the ordinary page flow.

Security requirements implemented in the current system include Supabase session authentication, role resolution, Hub-scoped access, optional TOTP MFA, Rider trusted-device validation, account restriction and employment archive states, private document storage, session revocation, immutable financial snapshots, and append-only or guarded audit trails. These measures reduce specific risks but do not establish that the system is invulnerable or legally compliant without a separate assessment.

### 3.1.3 Design

#### System architecture

The Agile design stage is reflected in separable application, service, device-integration, and database boundaries that can be revised while retaining protected business rules. MKBRiderTrack uses a client-and-managed-backend architecture. The authenticated dashboard in `dashboard/` is a React 18 and TypeScript single-page application built with Vite 5. It coordinates role-specific screens, hooks, contexts, service modules, offline storage, and report generation. The public website in `landing/` is a separate React 19 application built with Next.js 16 and the App Router. It presents system information, sanitized Hub and Zone data, and moderated reviews. Next.js and Vite therefore belong to two separate frontend applications; they are not a combined build framework for the same interface. Operational functions remain in the Vite-built authenticated dashboard.

Both applications use Supabase, but for different scopes. The dashboard communicates with Supabase Auth, the PostgreSQL Data API and RPC functions, Realtime, Storage, and the `admin-user-actions` Edge Function. The landing website reads sanitized `public_hubs` and `public_zones` views and uses a server route for review submission and retrieval. Anonymous access to private workforce, attendance, location, parcel, and payroll records is not part of the public website design.

Within the dashboard, page components coordinate user interaction. Domain services execute queries and RPCs. Context providers maintain shared session, Hub, notification, and attendance-update state. PostgreSQL stores authoritative business records and applies RLS, constraints, triggers, effective-dated policies, workflow transitions, and audit rules. Supabase Realtime distributes changes such as notifications, attendance updates, Rider locations, and account/session events. Dexie-managed IndexedDB provides Rider-side cache and outbox behavior when network access is interrupted.

[INSERT FIGURE 3.2: MKB System Architecture]

#### Role and access design

The access design combines frontend page boundaries with database authorization. Frontend navigation presents only the modules relevant to a role, while `App.tsx` normalizes invalid page selections to an allowed default. This layer is not treated as the security boundary. RLS and guarded PostgreSQL functions evaluate role, user identity, canonical Rider identity, employment/account state, and Hub access.

Admin users have global coordination functions, including Hub and Zone management, configuration, user lifecycle management, parcel operations, payroll oversight, reports, and audits. HR users manage Riders and attendance, review operational information, and perform authorized payroll review transitions, while server rules prohibit HR from editing Draft or Rejected computations. Payroll Officers generate and edit Draft or Rejected payroll and related adjustments, then submit the record for review; they cannot approve or pay it. Riders access only their own attendance, location-facing interface, profile, and eligible payroll information.

#### Database design

The central identity relationship begins with `users`, which maps an authenticated account to a role, account status, employment status, and optional canonical Rider ID. `riders` contains operational workforce information, including current and home Hub/Zone assignments, status, face image reference, and facial descriptor. `hubs`, `zones`, `user_hub_access`, and `rider_assignments` represent multi-Hub visibility, geofence geometry, and permanent or temporary assignment history.

Attendance and monitoring use `attendance_logs`, `attendance_policy_configurations`, `attendance_policy_configuration_audit`, `rider_locations`, and `violations`. Parcel Operations use `parcel_logs`, `parcel_log_audit`, `parcel_correction_requests`, `parcel_rate_configurations`, and `parcel_rate_configuration_audit`. The optional FMS import foundation introduces `external_rider_mappings`, `fms_import_batches`, and `fms_daily_rider_observations`; however, its sidebar entry is currently hidden and it should not be presented as a generally available workflow.

Payroll centers on `payroll_records` and `payroll_delivery_lines`. The latter preserves finalized daily source values. Traceable adjustments use `payroll_adjustment_definitions`, `payroll_earning_adjustments`, `payroll_deduction_obligations`, `payroll_deduction_allocations`, and corresponding audit tables. `payroll_bulk_operations` retains idempotency and result information for authoritative bulk transitions.

Supporting entities include `notifications`, `user_notification_preferences`, `activity_logs`, `rider_documents`, `user_devices`, `reviews`, `support_tickets`, and `support_ticket_messages`. Domain-specific audit tables preserve policy, rate, parcel, and payroll changes. Foreign keys generally retain the original identity or prevent deletion where financial and audit history must remain attributable.

[INSERT FIGURE 3.3: System Database/ERD]

#### Attendance verification design

The verified attendance sequence is as follows:

1. The application confirms that the Rider account is not restricted and that no attendance write is already in progress.
2. For Time In, the browser must provide a current high-accuracy position. Time Out is permitted without this location precondition.
3. The application opens the user-facing camera and loads the face-api.js and MediaPipe models.
4. MediaPipe landmarks evaluate a blink sequence. Descriptor matching does not begin for attendance verification until the blink requirement passes.
5. face-api.js detects the face, resolves landmarks, and produces a fresh 128-dimensional descriptor.
6. The descriptor is compared one-to-one with the enrolled Rider descriptor by Euclidean distance. Three fresh samples must meet the `0.45` threshold.
7. For Time In, GPS freshness is checked again. The application then persists the attendance record and initial location/status updates, or stores an offline outbox item if an eligible network failure occurs.
8. Later Rider location inserts are evaluated by PostgreSQL against the current operational Zone and attendance state, producing active, idle, violation, or offline state as appropriate.
9. Time Out updates the active row, places the Rider offline, and stops the active-shift location loop.

This design does not store the verification frame, liveness score, or match confidence in each attendance row. It also does not currently use Hub radius or Zone containment as a Time-In rejection rule.

[INSERT FIGURE 3.4: Attendance Verification Workflow]

#### Geofence and map design

The system represents a circular Zone by a center latitude/longitude and radius, and a polygonal Zone by an ordered coordinate set. The Haversine formula used for circles is:

`a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)`

`c = 2 × atan2(√a, √(1 − a))`

`d = R × c`

where `φ` represents latitude in radians, `λ` represents longitude in radians, `R` is the Earth radius used by the implementation, and `d` is the distance in meters. Polygon containment uses ray casting rather than this distance formula. Leaflet and React Leaflet render operational maps, and the Zone editor uses Turf for polygon difference and overlap handling.

The new Hub attendance-geofence design stores a physical center and positive radius as an all-or-none set. New Hubs must be configured, while an existing legacy Hub may remain unconfigured until edited. This configuration and its audit trail are implemented. Attendance enforcement against it remains incomplete and must not appear in a figure as an active decision gate.

#### Payroll design

Payroll follows a source-to-snapshot design:

`attendance-supported parcel_logs -> Draft payroll_records -> Pending snapshot -> Approved/Rejected/Returned -> Paid -> payslip/report output`

Daily parcel records remain the operational source. Database calculation functions derive delivery-line and cutoff summaries for Draft or Rejected payroll. Manual earnings and deduction allocations are added through traceable records rather than unexplained aggregate edits. On submission to Pending, immutable daily delivery lines and adjustment snapshots are built. Reviewers may approve, reject, or return a Pending record to Draft. Approved records remain protected and may become Paid only after the server-calculated payable date. Client-generated PDF, CSV, XLSX, and official payslip workbooks read the protected data rather than recalculating finalized records from current parcel settings.

[INSERT FIGURE 3.5: Payroll Processing Workflow]

#### Security design

Supabase Auth establishes the account session, while the `users` profile supplies application role and lifecycle information. Optional authenticator-based MFA adds a second sign-in step. Rider devices are registered through a device UUID and fingerprint; a different untrusted device is rejected until authorized reset or transfer. Account suspension, employment archive, and Rider online state are modeled separately to preserve operational history.

RLS protects tables exposed through Supabase. Security-sensitive state changes are implemented through guarded functions or an Edge Function that verifies the caller and target before using service-role capabilities. Private Realtime topics support session-control messages. Private Storage policies protect Rider documents. Payroll and operational audit records preserve actor and source information, while approved and paid financial snapshots are protected from later recomputation.

These controls should be described as implemented safeguards, not as proof of absolute security. The application still depends on correct Supabase deployment, environment configuration, key management, user practices, browser/device behavior, and continued maintenance.

#### 3.1.3.1 Technical Background

The current system uses the following verified technologies.

| Technology or library | Role in MKBRiderTrack | Implemented location and technical relevance |
| --- | --- | --- |
| React 18 | Authenticated dashboard user interface | Used throughout `dashboard/src` for role workspaces, attendance, monitoring, parcels, payroll, and reports. |
| Vite 5 | Dashboard development and production bundling | Configures the React SPA build and test-compatible module environment. |
| React 19 and Next.js 16 App Router | Public landing website | Used in `landing/app` for public pages, sanitized operational locations, and the review API route. |
| TypeScript | Static typing for both web applications | Defines role, service, domain, component, and generated Supabase contracts. |
| Tailwind CSS | Interface styling | Dashboard uses Tailwind 3; landing uses Tailwind 4 styling conventions. |
| Supabase JavaScript Client | Client access to managed backend services | Used for Auth, database queries, RPCs, Realtime, Storage, and public review/location access. |
| PostgreSQL and PostGIS | Authoritative data and geospatial rule layer | Migrations define entities, foreign keys, checks, unique constraints, views, triggers, workflow functions, RLS, and geofence processing. |
| Supabase Auth | Account authentication and MFA | Provides sessions, password recovery, refresh-session revocation, and TOTP factors. |
| Supabase RLS | Record-level authorization | Restricts operational data by role, Rider identity, employment/account state, and Hub scope. |
| Supabase Realtime | Live application updates | Delivers notification, attendance, location, account-status, and private session-control events. |
| Supabase Storage | Private file storage | Stores protected Rider documents and staff avatars under role-scoped policies. |
| Supabase Edge Functions | Privileged account lifecycle operations | `admin-user-actions` performs verified Auth administration and coordinated profile transitions without exposing the service-role key to the browser. |
| face-api.js 0.22.2 | Face detection, landmarks, descriptor extraction, and matching | Loaded as a pinned browser runtime; local SSD MobileNet V1, Face Landmark 68, and Face Recognition weights produce and compare 128-dimensional descriptors. face-api.js uses TensorFlow.js internally. |
| MediaPipe Tasks Vision 0.10.35 | Blink-based liveness | Bundled Face Landmarker and WASM assets calculate eye landmarks and Eye Aspect Ratio for open-close-open verification. It is not the descriptor-matching engine. |
| Browser MediaDevices API | Camera acquisition | Requests a user-facing video stream for enrollment and attendance scanning and releases tracks during cleanup. |
| Browser Geolocation API | Rider coordinate acquisition | Uses high-accuracy `watchPosition` data and timestamp freshness checks for Time In and active-shift location reporting. |
| Leaflet and React Leaflet | Operational and public maps | Render Hubs, Zones, Rider positions, routes, and location pickers. |
| Turf | Zone design geometry | Subtracts existing Zone geometry from a new polygon and helps prevent excessive overlap during editing. |
| Dexie and IndexedDB | Offline cache and outbox | Stores Rider cache, trusted-device data, and queued Time In, Time Out, and location operations with idempotency information. |
| Recharts | Dashboard analytics visualization | Renders operational and payroll report charts without establishing research-evaluation results. |
| ExcelJS, SheetJS, jsPDF, JSZip | Reports and controlled exports | Generates XLSX, CSV, PDF, official-template payslips, and multi-file packages from authorized data. |
| Vitest and jsdom | Automated frontend and service testing | Exercise domain policies, components, hooks, offline behavior, exports, biometrics, attendance, FMS, and payroll logic. |
| pgTAP | Transactional database testing | SQL suites test RLS, constraints, RPCs, workflow transitions, and database invariants against a configured development/test database. |
| GitHub Actions | Continuous integration | Runs dashboard typecheck, lint, unit tests, and build; landing typecheck and build; and conditional pgTAP tests. |

OpenCV is not part of the current implementation. TensorFlow.js is used through the face-api.js browser runtime rather than as a direct package import. These distinctions prevent legacy or marketing descriptions from being presented as the current technical design.

### 3.1.4 Implementation

The Agile implementation stage produced the system through independently testable but integrated subsystems. The implementation separates user-interface coordination from domain services and database authority. React pages and components collect user input and present role-appropriate information. Hooks coordinate device functions such as camera, geolocation, network state, biometrics, and session state. Service modules translate user actions into Supabase queries and RPC calls. PostgreSQL performs the final checks for protected operational and financial behavior. Forward-only migrations and focused regression tests provide evidence of incremental technical changes without establishing undocumented sprint chronology.

Authentication implementation begins in `useAuth`, which reconciles the Supabase session with the database profile and canonical Rider identity. `App.tsx` applies MFA and role gates, loads the appropriate staff or Rider shell, and listens for lifecycle changes. The `admin-user-actions` Edge Function performs privileged suspension, reactivation, restriction, archive, and restore operations only after verifying caller authority and Hub scope.

Attendance implementation uses `useRiderShiftController` to coordinate geolocation, scanner state, biometric results, persistence, cached Rider data, and active-shift location synchronization. `useFaceRecognition` and `faceAi.ts` implement the face-verification and liveness sequence. `attendanceService.ts` records Time In and Time Out, while the offline sync engine replays eligible queued operations. Database triggers protect employment eligibility and daily lifecycle integrity.

Geofence implementation is divided between browser presentation and database authority. The browser calculates approximate distance or polygon containment for immediate status presentation and map rendering. `rider_locations` inserts invoke database geofence processing, which evaluates the current operational Zone and attendance state before writing Rider and violation state. Hub Management now captures physical Hub coordinates and a radius, but this information is not yet connected to the attendance decision.

Parcel implementation uses a shared service façade over parcel policy, records, and correction modules. Normal daily entries write `parcel_logs` and audit data. Effective-dated rate triggers require official attendance and prevent arbitrary client-provided rates from becoming authoritative. Locked periods use correction requests. The FMS import page and supporting database foundation can stage spreadsheet observations and confirm them with mapping, attendance, cutoff, optimistic-concurrency, and audit checks; because its navigation is hidden, it remains a partially exposed subsystem.

Payroll implementation initializes weekly records for eligible Riders, calculates Draft delivery values on the server, manages traceable adjustments, and submits immutable snapshots for review. Payroll Officers or Admin users can submit Draft/Rejected records. Admin or HR reviewers can approve, reject, return, and—after the payout waiting period—mark Approved records Paid. Bulk approval and payment use idempotent request identifiers and row-version checks. Payslips and reports are generated from authorized snapshots through PDF, CSV, and XLSX adapters.

Reporting implementation reads operational data through scoped services and converts it to charts and export documents. Notification implementation persists alerts, distributes updates through Realtime, and separately applies presentation preferences. Audit implementation uses `activity_logs` and domain-specific append-only or guarded audit tables. Support tickets use RLS-isolated tickets and message history.

The public landing application is implemented separately in Next.js. It reads sanitized Hub and Zone views and exposes moderated reviews through a server route. This separation prevents the public interface from becoming an entry point to private workforce and payroll data.

### 3.1.5 Testing and Integration

Testing and integration support the Agile approach by verifying subsystem behavior as implementation changes are incorporated. This is **software verification**, distinct from research or user evaluation. The repository contains automated testing at the application and database layers. The dashboard uses Vitest with jsdom and targeted browser API mocks. The tests cover authentication lifecycle, MFA gating, role navigation, attendance, face-model lifecycle, camera cleanup, geolocation freshness, geofence calculations, offline storage and replay, parcel rules, FMS parsing/confirmation, payroll calendar and adjustments, reports, exports, Hub management, notifications, and supporting services.

For this Chapter III audit, the current dashboard suite was executed with `npm.cmd --prefix dashboard test`. The run passed **638 tests across 119 test files** on August 31, 2026. This result verifies the automated assertions represented by the current suite; it is not a biometric accuracy measurement, usability score, acceptance rate, or guarantee that every production path is defect-free.

A separate root TypeScript check was also attempted and did not complete successfully. The failure occurs in a Hub-service test mock whose returned object lacks response metadata fields required by the current Supabase response type. Dashboard linting completed with zero errors and 45 warnings. Because this task is limited to research documentation, no application or test-code correction was made, and the repository is not described as fully passing all static checks.

The repository also contains 27 transactional pgTAP files for database constraints, RLS, attendance lifecycle, offline sync integrity, devices, multi-Hub behavior, parcel/FMS rules, payroll transitions and snapshots, and related safeguards. GitHub Actions is configured to run these tests only when a dedicated `SUPABASE_DB_URL` secret is available. No safe connected test database was established during this audit, so the current pgTAP result is not claimed here.

Integration is supported by shared generated types, service contracts, Supabase queries and RPCs, Realtime subscriptions, forward-only migrations, and CI checks. The CI workflow runs dashboard type checking, linting, unit tests, and production build; landing type checking and production build; and conditional database tests. A manual smoke-test checklist exists in the engineering walkthrough, but the repository does not prove that it was performed against the current commit. No Playwright or Cypress end-to-end browser suite was found.

**[NEEDS CONFIRMATION: Actual human system-testing and acceptance-testing procedure]**

**[NEEDS CONFIRMATION: Test participants, roles, devices, test environment, scenarios, dates, and recorded results]**

**[NEEDS CONFIRMATION: Whether biometric verification accuracy, liveness reliability, usability, or performance was formally evaluated]**

### 3.1.6 Maintenance

Maintenance represents the continuing Agile cycle after implementation and integration, during which defects, dependency changes, security needs, and verified operational requirements may be addressed incrementally. The repository demonstrates maintainability practices rather than a verified formal maintenance program. Database changes are organized as forward-only migrations. Financial and attendance rules are protected by regression tests and immutable history. CI checks both applications and can execute pgTAP against a configured non-production database. The engineering walkthrough and maintenance baseline document high-risk invariants, including paid-payroll immutability, date-effective attendance policy, Hub isolation, and server-authoritative geofence processing.

Reasonable future maintenance activities include controlled dependency updates, regression testing, migration review, database backup verification, RLS and function review, security-key management, audit-log monitoring, correction of stale generated database types, and reassessment of biometric models and browser compatibility. The Hub attendance-geofence foundation requires further work before its radius can be represented as enforced during Time In. The hidden FMS import route also requires a product decision before it can be documented as a generally available workflow.

These items describe maintenance needs and repository-supported practices; they do not prove that MKB Corporation has adopted a maintenance schedule, monitoring service, backup procedure, incident-response process, or production service-level agreement.

**[NEEDS CONFIRMATION: Current deployment status and whether the system has entered production maintenance]**

**[NEEDS CONFIRMATION: Maintenance owner, schedule, backup process, monitoring procedure, and change-approval process]**

## 3.2 Capstone/Research Instruments

The planned system-evaluation instrument will be a questionnaire based on **ISO/IEC 25010**. The standard provides a software product-quality model that can guide the selection and organization of evaluation characteristics **[SOURCE REQUIRED]**. In this study, the framework is intended only for the future research and user-evaluation portion. It is not the basis for claiming that the 638 automated tests constitute an ISO/IEC 25010 evaluation, and no ISO/IEC 25010 results have yet been produced.

The final questionnaire should translate the selected quality characteristics into understandable statements about the implemented MKBRiderTrack system. Evaluation statements should remain consistent with actual behavior, including the separate React/Vite operational dashboard and React/Next.js public website, role-restricted access, face verification with blink-based liveness, fresh-GPS requirement for Time In, post-Time-In Operational-Zone monitoring, Hub-radius configuration without current Time-In enforcement, parcel and payroll workflows, offline behavior, and protected financial records. The questionnaire must not ask respondents to rate unavailable functionality as though it were implemented.

The repository contains no final questionnaire, validation sheet, reliability analysis, respondent list, or completed response dataset. These components remain part of the research protocol and must be documented before administration.

**[NEEDS CONFIRMATION: Exact respondent groups]**

**[NEEDS CONFIRMATION: Number of respondents]**

**[NEEDS CONFIRMATION: Sampling method, if applicable]**

**[NEEDS CONFIRMATION: Exact ISO/IEC 25010 edition and selected quality characteristics]**

**[NEEDS CONFIRMATION: Final ISO/IEC 25010-based questionnaire contents and Likert-scale anchors]**

**[NEEDS CONFIRMATION: Instrument validation and reliability procedure]**

**[NEEDS CONFIRMATION: Questionnaire administration procedure]**

## 3.3 Statistical Tools

The planned system-evaluation questionnaire will collect **Likert-scale responses**, and the responses for each evaluation statement will be summarized using the **Weighted Mean**. This statistical treatment is planned for future respondent data; it has not yet been applied, and this chapter contains no fabricated scores, respondent totals, or ISO/IEC 25010 results.

The Weighted Mean will be computed as:

\[
\bar{x}_w = \frac{\sum_{i=1}^{k} f_i w_i}{\sum_{i=1}^{k} f_i}
\]

where:

- `\bar{x}_w` is the Weighted Mean for one questionnaire statement;
- `k` is the number of Likert response categories;
- `f_i` is the frequency of responses in category `i`;
- `w_i` is the numerical weight assigned to category `i`; and
- `\sum f_i` is the total number of valid responses to that statement.

After data collection, the frequency in each response category will be multiplied by its assigned weight. The products will be summed and divided by the total valid responses for that item. The resulting Weighted Mean may then be interpreted using the researchers’ approved verbal-interpretation ranges. The exact response anchors, numerical weights, handling of missing responses, aggregation procedure, and interpretation intervals must match the final validated questionnaire and research protocol **[SOURCE REQUIRED]**.

**[NEEDS CONFIRMATION: Final Likert-scale anchors and numerical weights]**

**[NEEDS CONFIRMATION: Weighted Mean verbal-interpretation ranges]**

**[NEEDS CONFIRMATION: Rules for missing responses and any aggregation across ISO/IEC 25010 characteristics]**

## 3.4 Ethical Considerations

MKBRiderTrack processes information that requires careful and limited handling. Verified data includes account identity and contact information, employee and Rider records, facial image references, 128-dimensional facial descriptors, device-identification information, current and historical operational locations, attendance records, parcel performance records, violations, supporting Rider documents, payroll amounts and adjustments, notifications, and audit events. The system also uses live camera frames and MediaPipe landmarks during verification. Attendance rows do not store the verification frame, liveness score, or match confidence, although the enrolled Rider profile may retain a face image reference and facial descriptor.

The researchers should apply data-minimization and purpose-limitation principles to these records. Identity, camera-derived, location, attendance, and payroll information should be collected and used only for legitimate project and operational purposes. Facial descriptors and reference images should not be reused for unrelated identification or surveillance. The blink-based liveness check and descriptor threshold should not be described as bias-free, perfectly accurate, or immune to spoofing because the repository contains no formal accuracy or demographic-performance study.

Geolocation is used to obtain a fresh position for Time In and to support active-shift monitoring and operational-Zone violation processing. Ethical use requires clear communication about when location is collected, why it is needed, who may view it, how long it is retained, and how errors may be reviewed. The present web implementation uses foreground browser geolocation and does not establish an unrestricted native background-tracking service. The new Hub radius configuration should likewise not be presented to users as an enforced attendance rule until that behavior is implemented and validated.

Access to payroll and employment information should be limited to authorized functions. The implemented role and RLS design separates payroll preparation from approval and payment, limits Riders to their own eligible payroll records, and preserves protected snapshots and audit history. Private Rider documents are held under Storage policies. These are relevant technical safeguards, but their existence does not by itself establish organizational or legal compliance.

The researchers considered the principles established under Republic Act No. 10173, the Data Privacy Act of 2012, in relation to the handling of personal information **[SOURCE REQUIRED]**. This statement identifies a relevant legal framework and does not assert that the application has passed a legal or regulatory compliance assessment. Any final compliance statement should be supported by an authorized review of notice, consent, lawful basis, retention, access, correction, security, breach response, and disposal procedures.

Participants and system users should receive understandable information about the purpose of the study, the data involved, voluntary participation where applicable, risks, benefits, withdrawal or complaint mechanisms, and the handling of evaluation responses. No consent form or consent procedure is stored in the repository.

**[NEEDS CONFIRMATION: Participant/user consent procedure]**

**[NEEDS CONFIRMATION: Privacy notice and lawful basis for processing employee, biometric, location, and payroll information]**

**[NEEDS CONFIRMATION: Data-retention, correction, deletion, backup, and incident-response procedures]**

**[NEEDS CONFIRMATION: Ethics or institutional approval, if required]**

The ethical presentation of evaluation results also requires accurate reporting. Technical test passes must not be represented as respondent satisfaction, business productivity improvement, attendance-fraud prevention, payroll-error elimination, biometric accuracy, or overall system effectiveness. Such conclusions require a confirmed instrument, appropriate respondents, statistical treatment, and documented results.
