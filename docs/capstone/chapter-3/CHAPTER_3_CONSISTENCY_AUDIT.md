# Chapter III Repository-to-Paper Consistency Audit

## Audit result

**Overall result: CONDITIONALLY ALIGNED WORKING DRAFT — NOT YET SAFE AS A FINAL SUBMISSION.**

The technical descriptions in `CHAPTER_3_DESIGN_AND_METHODOLOGY.md` are supported by the repository evidence recorded in `CHAPTER_3_EVIDENCE.md`. Agile is now confirmed as the official SDLC methodology. ISO/IEC 25010 is confirmed as the planned system-evaluation framework, and Likert-scale responses with Weighted Mean are confirmed as the planned statistical treatment. The chapter is not complete for submission because planning history, final questionnaire contents, ISO/IEC 25010 edition and selected characteristics, respondents, sampling, instrument validation and administration, interpretation ranges, human testing, consent/privacy procedures, and external citations remain unresolved. No claim of complete alignment is made.

## Scope and baseline

- Audited branch/commit before documentation edits: `main` at `b378a5f` (`Add hub attendance geofence support`).
- Audit date: August 31, 2026.
- Applications audited: authenticated dashboard and public landing website.
- Backend audited: tracked Supabase migrations, RLS, functions, Edge Function, generated database types, and pgTAP sources.
- Current local technical test evidence: `npm.cmd --prefix dashboard test` passed 638 tests in 119 files.
- Current static verification: `npm.cmd run typecheck` failed at `dashboard/src/services/hubs/hubService.test.ts:207` because a mocked Supabase single-response object lacks required response metadata fields. `npm.cmd --prefix dashboard run lint` completed with zero errors and 45 warnings.
- Not verified live: deployed Supabase migration state, live RLS behavior, production deployment, browser smoke testing, camera/GPS behavior on a physical device, and connected pgTAP results.
- Application code, migrations, and configuration were not modified.

## Required structure check

| Requirement | Chapter location | Result |
| --- | --- | --- |
| Chapter III only | Entire document | PASS |
| Short chapter introduction | Opening paragraph | PASS |
| 3.1 SDLC Model — Agile | `3.1` | PASS; methodology confirmed without invented chronology |
| Planning | `3.1.1` | PASS |
| Analysis | `3.1.2` | PASS |
| Design | `3.1.3` | PASS |
| Technical Background numbered 3.1.3.1 | `3.1.3.1` | PASS |
| Implementation | `3.1.4` | PASS |
| Testing and Integration | `3.1.5` | PASS |
| Maintenance | `3.1.6` | PASS |
| 3.2 Capstone/Research Instruments | `3.2` | PASS; planned ISO/IEC 25010 questionnaire stated, unresolved details retained |
| 3.3 Statistical Tools | `3.3` | PASS; planned Likert/Weighted Mean treatment and formula stated, unresolved interpretation details retained |
| 3.4 Ethical Considerations | `3.4` | PASS, unresolved placeholders retained |
| Figure placeholders only for reproducible implementation | Figures 3.1–3.5 | PASS |
| No Chapters I, II, IV, or V | Entire document | PASS |

## Technical consistency checks

| Paper topic | Repository check | Result and qualification |
| --- | --- | --- |
| SDLC methodology | Researchers confirmed Agile; repository supports incremental technical refinement but not a full sprint chronology | ALIGNED; no sprint dates, counts, ceremonies, or meetings invented |
| Dashboard architecture | React 18.3.1, TypeScript, Vite 5, Tailwind 3 | ALIGNED |
| Landing architecture | Next.js 16.1.6, React 19.2.4, App Router, Tailwind 4 | ALIGNED |
| Supabase use | Auth, PostgreSQL/Data API/RPC, RLS, Realtime, Storage, Edge Function | ALIGNED; live project not verified |
| Canonical roles | `admin`, `hr`, `payroll`, `rider` | ALIGNED; unused Edge helper `dispatcher` type omitted |
| Role responsibilities | Navigation, page guards, RLS, and payroll transition checks | ALIGNED |
| Face technology | face-api.js performs detection/landmarks/descriptors/matching; MediaPipe performs blink liveness | ALIGNED; incorrect README shorthand not repeated |
| Biometric terminology | One-to-one comparison against claimed Rider | Corrected to **face verification**; UI “recognition” wording noted as inconsistent |
| Face data storage | Rider profile may contain face image reference and 128-value descriptor | ALIGNED; paper does not claim attendance frames are stored |
| Liveness | Stable open, closed, reopened eye sequence using MediaPipe EAR | ALIGNED; no anti-spoofing/accuracy guarantee made |
| Camera | User-facing MediaDevices stream with cleanup | ALIGNED; no physical-device test claimed |
| GPS | High-accuracy watch, maximumAge 0 at acquisition, two-minute freshness, second Time-In check | ALIGNED |
| Hub attendance radius | Configuration, constraints, UI, and audit exist | Correctly classified as incomplete enforcement |
| Operational Zone at Time In | Used for feedback and subsequent location violation processing | Correctly states it does not block Time In |
| Circle geofence | Haversine distance | ALIGNED |
| Polygon geofence | Ray-casting containment; Turf editing overlap subtraction | ALIGNED |
| Attendance persistence | `attendance_logs`, offline queue, status/location updates, daily finalization | ALIGNED |
| Attendance policy | Effective-dated, Manila-time, history-preserving | ALIGNED |
| Parcel prerequisite | Same-date official attendance Time In required | ALIGNED with August 30 migration |
| Parcel rate selection | Effective date plus Manila Time In | ALIGNED |
| FMS import | Page/services/migrations/tests exist; sidebar entry commented | Correctly qualified as partially exposed |
| Payroll period | Monday-Sunday from August 31, 2026 | ALIGNED |
| Payout lag | Earliest payable date is cutoff end plus eight days | ALIGNED |
| Draft calculation | Server-derived from `parcel_logs` | ALIGNED |
| Adjustments | Five traceable items and obligation/allocation design | ALIGNED |
| Workflow statuses | Draft, Pending, Approved, Rejected, Paid; Pending may return to Draft | ALIGNED; legacy `processed`/`flagged` noted |
| Approval/payment | Server-authoritative bulk functions, row/version checks, request idempotency | ALIGNED |
| Payslips | Client-generated from protected records/snapshots | ALIGNED; no fictitious `payslips` table introduced |
| Reports/notifications/audits/support | Implemented modules and tables | ALIGNED; no outcome claims made |
| Offline capabilities | Dexie/IndexedDB cache and queued Time In/Out/location replay | ALIGNED; no native background GPS claim made |
| Testing | Current Vitest run plus pgTAP sources and CI | ALIGNED; unrun pgTAP/manual/E2E limitations stated |
| Static checks | Root typecheck currently fails in one Hub-service test mock; dashboard lint has warnings only | DISCLOSED; no application change made |
| Maintenance | Repository practices and future needs | ALIGNED; no formal program claimed |
| ISO/IEC 25010 evaluation | Confirmed as the planned questionnaire framework; no completed instrument or results exist | ALIGNED; clearly separated from software verification |
| Likert/Weighted Mean | Confirmed planned response format and statistical treatment; formula defines frequency and weight variables | ALIGNED; no respondent totals, sample data, or computed results introduced |

## Database entity and relationship check

The paper names only entities found in current migrations, generated types, or current source. Principal relationships are consistent with the implementation:

- `users` resolves authenticated profiles and optionally links to a canonical `riders` row.
- `riders` links to current and home `hubs`/`zones`; `rider_assignments` records permanent and temporary changes.
- `attendance_logs`, `rider_locations`, and `violations` link operational activity to the Rider.
- `parcel_logs` links the Rider and business date to rate-supported parcel operations; audit/correction tables preserve changes.
- `payroll_records` links a Rider and cutoff to workflow state; `payroll_delivery_lines` and adjustment tables preserve financial details.
- `notifications`, `activity_logs`, documents, devices, reviews, and support tables provide supporting functions.
- The three FMS tables are supported by the August 30 migration even though the generated types have not yet been refreshed to include them.

No `payslips` table, raw attendance-selfie table, liveness-history table, or GPS-route-summary table was invented.

## Unsupported-claim scan

The chapter does not claim any of the following:

- Sprint dates, sprint counts, ceremonies, meetings, stakeholder sessions, or other Agile history not supported by project records.
- Stakeholder meetings, interviews, dates, or participant statements.
- A completed ISO/IEC 25010 evaluation, completed questionnaire, or ISO/IEC 25010 scores.
- Respondent counts, sample data, computed Weighted Means, verbal results, reliability coefficients, or evaluation conclusions.
- Biometric accuracy, liveness accuracy, perfect security, elimination of fraud, elimination of payroll errors, or quantified productivity improvement.
- Completed Hub-radius enforcement at attendance.
- OpenCV as a current dependency.
- Raw camera frames, per-scan confidence, or liveness values stored in attendance rows.
- Native background GPS, external SMS/email notification delivery, or self-service account deletion.
- A successful live deployment, connected database test, browser smoke test, or formal maintenance program.
- Full legal compliance with Republic Act No. 10173.

## Unresolved information required from the researchers

1. Actual planning history: problem statement, stakeholders, requirement-gathering activities, dates, and approved scope.
2. Exact ISO/IEC 25010 edition, selected quality characteristics, and final questionnaire statements.
3. Exact respondent groups, number of respondents, and sampling method, if applicable.
4. Instrument validation, reliability, and questionnaire-administration procedures.
5. Final Likert anchors and weights, Weighted Mean verbal-interpretation ranges, missing-response rules, and any aggregation across quality characteristics.
6. Actual human system-testing/acceptance-testing procedure, environment, participants, devices, scenarios, dates, and results.
7. Consent procedure, privacy notice, lawful basis, ethics approval, data-retention rules, correction/deletion rules, backup process, and incident response.
8. Current deployment and maintenance status, responsible personnel, schedule, monitoring, backup, and change-approval process.
9. Verified scholarly and legal sources for Agile, ISO/IEC 25010, Weighted Mean/Likert methodology, biometric/liveness methodology where academically required, and the Data Privacy Act discussion.
10. Product decision on whether Hub-radius attendance enforcement and the hidden FMS import workflow are intended to be completed before the research paper describes them as available features.

## Inconsistencies requiring attention

1. Current UI and product-title copy uses “Face Recognition,” while the attendance implementation performs one-to-one face verification.
2. `dashboard/README.md` says MediaPipe is used for face matching; current code uses MediaPipe for blink liveness and face-api.js for descriptor matching.
3. Hub Management copy refers to physical attendance enforcement, but the Time-In workflow does not consume the Hub radius.
4. The FMS import page is technically implemented but its sidebar entries are commented out.
5. Generated Supabase types omit the new FMS tables introduced by the current migration.
6. Payroll enum values `processed` and `flagged` remain for compatibility but are outside the current authoritative transition graph.
7. The August 25 walkthrough is behind the August 30–31 payroll, FMS, parcel-attendance, and Hub-geofence changes; the chapter therefore relies on current source and migrations for those areas.
8. The current root typecheck fails in a test mock at `dashboard/src/services/hubs/hubService.test.ts:207`; this task did not repair application/test code because its scope is documentation only.

## Submission safety decision

The chapter is **safe to use as an implementation-grounded working draft only if every remaining bracketed placeholder and `[SOURCE REQUIRED]` marker remains visible**. It is **not safe to submit as a final research-paper chapter** until the researchers supply and verify the remaining planning history, final instrument details, respondents and sampling, Likert interpretation rules, human testing protocol, consent/privacy procedures, maintenance/deployment information, and citations. Agile, the planned ISO/IEC 25010 framework, and planned Likert/Weighted Mean treatment no longer require confirmation.

The technical portions should also be re-audited if application behavior or migrations change after commit `b378a5f`, particularly if Hub-radius Time-In enforcement, FMS navigation, biometric terminology, or payroll workflow rules are modified.
