# ConnectSphere Project Context

Last reviewed: 19 September 2026 (organisation profile increment)

## Project Purpose

ConnectSphere Event Services needs a custom Event Planning and Venue Booking System that centralises event information currently spread across email, spreadsheets, calendars, messaging applications, forms, and documents. The Week 12 first release must implement the 20 core functionality areas identified in the Week 4 Project Instructions as coherent end-to-end workflows.

Detailed requirements and their provenance are maintained in [`docs/requirements/`](docs/requirements/).

## Authoritative Sources

Use the following priority when sources differ:

1. Latest explicit team decision for a team-controlled choice
2. Clarification Session 2
3. Clarification Session 1
4. Week 4 Project Instructions and Week 1 Customer Briefing
5. Current Product Backlog and Sprint records
6. Engineering recommendation

Repository documentation derived from the authoritative project materials:

- [`docs/requirements/customer-briefing.md`](docs/requirements/customer-briefing.md) — Week 1 Customer Briefing record
- [`docs/requirements/clarification-session-1.md`](docs/requirements/clarification-session-1.md) — first customer clarification record
- [`docs/requirements/clarification-session-2.md`](docs/requirements/clarification-session-2.md) — second customer clarification record
- [`docs/requirements/effective-requirements.md`](docs/requirements/effective-requirements.md) — reconciled current requirements

Operational project records maintained by the team:

- Product Backlog workbook — current stories, acceptance criteria, estimates, statuses, Sprint assignments, and notes
- Sprint 1 Planning record — Sprint Goal, ownership, estimates, capacity reasoning, and planning decisions

These operational records should be added to a suitable repository evidence folder once the team chooses their committed filenames. Clarification Session 2 was supplied directly by the team; its portable repository record is preserved above.

The Product Backlog workbook is the operational source of record. Jira is not used. Stories are grouped by Functionality Area rather than Epic.

## Current Technology Foundation

The repository currently uses:

- React 19, Vite 7, React Router 7, and custom CSS
- Node.js and Express 5
- Firebase Authentication with email/password
- Cloud Firestore
- Firebase Admin SDK for backend token verification

Tracked application routes currently include:

- `/`
- `/login`
- `/register`
- protected `/profile`

The root package is an npm workspace over `frontend`, `backend` and `shared`; it provides development, build, lint, and test commands (`test`, `test:existing`, `test:spm1`, `test:spm2`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`). The frontend package keeps its own build, lint and Vitest commands. A GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint, all test suites, the production build and the Playwright E2E suites on every push and on pull requests into `main`.

## Independently Observed Implementation State

The current code provides a useful authentication prototype, but it does **not** yet match the complete customer/backlog role model.

Observed facts:

- Registration uses Firebase email/password authentication.
- The registration UI offers `attendee` and `organiser` account types; public registration does not offer internal staff roles.
- Organiser registration requires an organisation name. Organisers, including multi-role accounts, can view/add/edit that name on their profile through an authenticated backend update.
- Registration writes `roles: [role]` and retains the legacy `role` field. Frontend role checks and backend `requireRole` support multiple roles.
- Organisation name edits change only the user's descriptive `organisationName`; matching names do not link accounts. Existing organisation IDs and event records are preserved. Company-ID assignment and shared organisation membership remain outside this increment.
- The protected frontend product routes include `/profile`, `/event-requests/new`, `/event-requests/:id/edit`, `/requests`, `/requests/drafts`, and `/requests/:id`. Routes may now carry `allowedRoles`; a signed-in user without the role receives a 403 page rather than a redirect to login.
- The backend exposes authenticated profile and event-request create/update/load routes, plus a permission-enforced request API: `GET /api/requests`, `GET /api/requests/:id`, and `PATCH /api/requests/:id`.
- SPM-42 record, section and status rules are enforced in `backend/src/middleware/authorise.js`, which delegates every decision to `shared/permissions.js`. Records outside a user's scope are not returned, sections a role may not view are absent from the response body, and a forbidden write is rejected with 403 naming each field.
- `firestore.rules` is deployed to the Firebase project. The browser has no access to `eventRequests`, and a user may read and update only their own `users/{uid}` document without changing its role or organisation fields. Verified on 15 September 2026 with signed-in client requests.
- A seed script populates nine demonstration accounts, including a venue + technical dual-role account and an Organiser owning nothing, plus sixteen event requests covering every status in `shared/status.js`.
- SPM-7 event request creation has an implemented draft-based create path.
- SPM-4 draft saving and same-draft editing has been implemented for owned unsubmitted drafts through the direct edit route.
- SPM-24 presents saved drafts on a dedicated page and submitted requests, with their current status, on a separate page.
- SPM-3 submission and downstream staff review remain separate Sprint 1 scope items.
- Automated tests now exist on both sides: `node:test` for `shared/`, `backend/src/` and `backend/scripts/`, and Vitest with Testing Library for the frontend. An opt-in suite runs the same API cases against the real Firebase project. No CI workflow is present.

Required correction before claiming full Sprint 1 completion:

- public registration must be limited to Event Organiser and Attendee;
- Event Organiser registration now collects organisation name; company-ID assignment/membership remains incomplete;
- internal staff accounts must not be created through public registration;
- the five customer roles must replace the generic `employee` model;
- multiple roles per user and the union of their permissions must be supported if SPM-42 remains unchanged;
- record-, ownership-, and field/section-level authorisation is enforced and tested at the API level, and is presented for all five roles in the request pages; the two supporting rules in `effective-requirements.md` were ratified by the team on 20 Sep 2026;
- event request submission must still be completed for SPM-3.

README statements about completed authentication behaviour should therefore be treated as prototype claims until they are reconciled with the current backlog and verified through tests.

## Sprint 1

### Goal

> Deliver the first usable end-to-end workflow that enables users to securely register and access ConnectSphere according to their roles, while allowing Event Organisers to create, save, resume, and submit event requests for review.

### Stakeholder Value

- Users receive secure access to appropriate features and information.
- Event Organisers can prepare requests without losing incomplete work and submit structured information for later planning.

### Planning Facts

- Planning meeting: 12 September 2026, 22:00–23:30, Zoom
- Scrum Master/facilitator: Lesley
- Product Owner: Isabelle
- Developers: Dairu, Shaun, Jian Yong
- Forecast: 18 story points
- Reference story: SPM-2, Register for an Account, fixed at 3 points
- No historical velocity is available because this is the first Sprint.
- The team made a conservative forecast because of setup and CI overhead, other coursework, limited availability, and four of five team members having full-time internships.

### Selected Stories

| Story | Title | Owner | Points |
|---|---|---:|---:|
| SPM-1 | Sign In and Access Only My Role's Area | Dairu | 3 |
| SPM-2 | Register for an Account | Dairu | 3 |
| SPM-3 | Submit an Event Request | Jian Yong | 2 |
| SPM-4 | Save an Event Request as a Draft | Jian Yong | 1 |
| SPM-7 | Create an Event Request | Jian Yong | 2 |
| SPM-24 | View My Saved Draft Requests and Distinguish Them from Submitted Requests | Shaun | 2 |
| SPM-42 | View and Edit Information According to My Role's Permissions | Shaun | 5 |

Developer totals: Dairu 6, Jian Yong 5, Shaun 7.

## Current Team Decisions

- Use email/password authentication for the current backlog scope.
- Use a dedicated Drafts page rather than a combined list.
- Keep SPM-22, SPM-23, and SPM-43 as historical rows with `Removed — Overlap` status.
- Keep SPM-44, draft deletion, as Deferred/KIV and outside Sprint 1.
- Do not use Jira.
- Do not create ADRs at this stage.
- Do not copy all course materials into this repository; retain concise, actionable requirement and evidence records.

## Requirement Highlights

- Customer roles: Event Organiser, Event Coordinator, Venue Staff, Technical Support Staff, and Attendee.
- Event Organisers and Attendees self-register; internal staff accounts are system-defined or pre-provisioned.
- There is no System Administrator role.
- A user may hold multiple roles; permissions combine.
- The customer did not specify password rules or require Google SSO.
- Event requests have one event date and normally one Event Organiser owner.
- Mandatory submission information is title, purpose, expected attendance, duration, preferred date/time, and primary venue/layout requirements.
- Drafts may be incomplete, remain private to their creator, have no expiry, and do not start staff review.

See [`docs/requirements/effective-requirements.md`](docs/requirements/effective-requirements.md) for the reconciled rules across all 20 functionality areas.

## Known Inconsistencies and Open Items

1. **Sprint dates:** the planning document records 13–27 September 2026; an earlier discussion used 14–27 September 2026. Confirm the official start date before publishing Sprint evidence.
2. **Story ownership:** the planning document's Team Roles table swaps Shaun's and Jian Yong's story groups, while its detailed table and the team's latest explicit allocation support the ownership shown above. Correct the Team Roles table.
3. **SPM-2 points:** the workbook's Story Points cell appears formula-based/blank when extracted, while its notes and Sprint Planning identify it as the 3-point reference story. Make the workbook display 3 consistently.
4. **Approved versus Confirmed:** customer sources sometimes treat these as the same and elsewhere describe Approved as initial feasibility and Confirmed as completed venue/technical arrangements. Resolve the lifecycle before implementing status transitions.
5. **Same-organisation visibility:** Organisers must not see unrelated client data, but visibility across different Organisers in the same organisation remains a team design choice.
    - **Follow-up (4 Oct 2026):** resolved as a team decision dated 3 Oct 2026 — same-organisation Organisers view each other's submitted events read-only (effective-requirements.md §3).
6. **Password policy:** no customer rule exists. The current frontend enforces six characters; record this as a team decision if retained.
7. **Role model:** roles arrays and shared permission checks exist, but complete five-role workflows and organisation membership still require verification before SPM-42 can be Done.
8. **Testing and CI:** automated shared/backend and frontend tests exist. On 19 Sep, `npm test` passed 68 Node tests and 17 Vitest tests; frontend lint and production build passed (build reports a bundle-size warning). Organisation persistence/authentication checks use mocks or in-memory storage, including real Express HTTP routing with mocked Firebase. No live Firebase, emulator, deployed security-rule, or manual browser verification was performed for that increment. On 20 Sep, `npm test` passed 107 Node tests and 53 Vitest tests; frontend lint and production build passed with the same bundle-size warning; an opt-in API suite passed 28 tests against the real Firebase project using real sign-ins, and 16 checks passed against the deployed rules using signed-in client requests. `firestore.rules` is in the repository and deployed. A CI workflow was added on 24 Sep (item 9). The operational workbook/Sprint record remains absent from the repository.
9. **SPM-1/SPM-2 test suites and CI (24 Sep 2026):** `tests/` holds story-organised suites for SPM-1 and SPM-2 (Vitest + React Testing Library + Supertest, Playwright for E2E), plus a GitHub Actions workflow. On 24 Sep: existing suites 107 Node + 41 Vitest passed; `tests/` Vitest 238 passed (SPM-1 133, SPM-2 101, lint 4); Playwright 18 passed (SPM-1 13, SPM-2 5) in Chromium; ESLint over the whole repository and the production build passed. Firebase is replaced by in-memory fakes (unit/integration) and an in-memory double (E2E); in those suites `firestore.rules` is checked only as source text, which is not rule execution. Separately, the deployed rules are exercised against the live project by `backend/scripts/check-firestore-rules.js` using real signed-in client requests; the Firestore emulator (Java) is still not set up.
10. **Root Vitest jsdom suites fail locally (26 Sep 2026):** every jsdom suite under `tests/` fails with `Cannot read properties of null` when `frontend/node_modules` is present, because components resolve React from the frontend install while `react-dom` resolves from the root install. CI passes because it installs only at the root. Hiding `frontend/node_modules` makes the suites pass, and `resolve.alias`, `resolve.dedupe` and inlining did not override it; a single hoisted install (npm workspaces) is the likely fix. Until it is fixed, the SPM-42/SPM-24 component tests stay in `frontend/src/`, where the frontend's own Vitest project runs them.
11. **SPM-8 automatic coordinator assignment (30 Sep 2026, branch `SPM-8`):** submitting a draft now assigns the eligible Event Coordinator with the fewest active assigned events (random tie-break, submitter excluded) in the same Firestore transaction as the status change, stores it in `assignedCoordinatorUid`, and records a "System" entry in `eventRequests/{id}/activity`. An empty coordinator pool aborts the submission with a 500 and leaves the draft unchanged. SPM-8 is not in the Sprint 1 selection above. Gaps: no resubmit (Returned → Submitted) action exists, so keeping the existing Coordinator on resubmission is tested only at the assignment-service level; the activity history is written but not yet displayed; the assignment rule awaits ratification (effective-requirements.md §5). On 30 Sep: existing suites 134 Node + 41 Vitest passed, `tests/` Vitest 238 passed, Playwright 18 passed, ESLint and the production build passed. Assignment tests run against an in-memory Firestore fake, so transaction serialisation under real concurrency has not been verified on the emulator or the deployed project.
    - **Follow-up (3 Oct 2026):** the "awaits ratification" note above is superseded. All SPM-8 assignment rules were confirmed by the PO on 20 Sep 2026, so they are team decisions (effective-requirements.md §5). Code and tests are unchanged.
12. **E2E double serves the event request routes (1 Oct 2026):** `/api/event-requests` (SPM-7, SPM-4, SPM-3) now takes `authenticate` and its database from `createApp` instead of always using Firebase, and the Playwright double serves it and `/api/requests` from one in-memory database (`backend/src/testing/fakeFirestore.js`) that also holds the profiles. Before this, the double rejected every `/api/event-requests` call, and `spm24_selecting_a_draft_opens_it_for_editing` passed only because the editor rendered an empty form after a failed load. The test now checks the draft's saved values.
13. **SPM-65 coordinators see only their assigned events (2 Oct 2026, branch `SPM-65`):**
    - **Team decision, 1 Oct 2026:** a Coordinator views and acts only on events whose `assignedCoordinatorUid` is their uid.
    - **Why the old rule was dropped:** the "full system visibility" rule it replaces was not traceable to the G8 answer sheets, and is corrected in effective-requirements.md, SPM-42.
    - **Enforcement:** `isAssignedCoordinator()` in `shared/permissions.js` is the coordinator's record scope, so list, read and section edit on `/api/requests` all apply it.
    - **List query:** a coordinator-only user's list is read with `where('assignedCoordinatorUid', '==', uid)`, taking the uid from the verified token.
    - **Refusals:** an unassigned event gets 404 on GET and PATCH for any user holding the coordinator role. Other roles keep 403.
    - **Multi-role users:** they keep the union of their roles' scopes.
    - **Wording:** the requests page heading for coordinators is "Events assigned to you".
    - **Gaps:** there is no reassignment route (SPM-26), so acceptance criteria 4–5 are tested by changing `assignedCoordinatorUid` in the fixture. Coordinators still edit every section of an assigned event, which is the SPM-42 implementation rather than a customer quotation (unresolved in effective-requirements.md).
    - **Verification on 2 Oct:**
      - Passed: ESLint, the existing suites (42 Node + 55 frontend Vitest), `tests/` Vitest with coverage (377 passed, 30 live tests skipped), the production build and Playwright (34 passed).
      - Live API suite (`LIVE_API_PROJECT=connectsphere-6546c npm run test:api:live`): 30/30 passed against the deployed project with real sign-ins. This covers the `assignedCoordinatorUid` query (no index needed) and the coordinator 404s.
      - The first live run had 4 venue-staff failures. SPM-9 testing (`feature/spm-9`) had moved `seed-req-a1-planning` to Cancelled, which is not an SPM-65 defect; re-seeding fixed it.
      - Reassignment (criteria 4–5) is tested in memory only.

14. **SPM-65 / SPM-9 CI reconciliation (2 Oct 2026):**
    - SPM-9 visibility tests now use each seeded event's assigned Coordinator and expect 404 for an out-of-scope Coordinator read. Scope refusals are tested separately from forbidden actions on visible events.
    - Both paths through `statusTransitionService.js` now return 404 for out-of-scope users holding the Coordinator role, matching the recorded SPM-65 rule; other out-of-scope users retain 403. The union of roles is evaluated before choosing the refusal.
    - Regression evidence: `tests/spm-9/integration/statusTransitionsApi.test.js` covers scope refusals, missing-event equivalence and unchanged records/history; `backend/src/services/statusTransitionService.test.js` covers multi-role submission, resubmission and staff sign-off without granting unassigned Coordinator actions; `frontend/src/pages/requestDetail.test.jsx` covers displaying a transition 404 without changing status or remaining busy.
    - Local verification on Windows, Node 22.17.0: lint passed; existing suites passed (128 Node tests and 67 frontend tests); coverage suites passed (395 tests, 30 opt-in live tests skipped); production build passed with a bundle-size warning; Playwright Chromium passed all 39 tests. Vite-based checks required execution outside the restricted sandbox.
    - These API and E2E checks use in-memory Firebase doubles. No live Firebase, emulator, deployed-rules or manual browser verification was performed. GitHub Actions verification of the updated branch remains pending; no deployment or operational story-status update is claimed.

16. **SPM-5 review and approve for Planning (2 Oct 2026, branch `feature/spm-5`):**
    - **Built:** start review, approve and the assigned-Coordinator-only rule already existed from SPM-9 and SPM-65. SPM-5 adds an Approve guard, `hasSufficientInformation()` in `shared/statusTransitions.js`, which refuses approval with 409 `insufficient_information` while the request fails the submission check. The request page explains why Approve is missing.
    - **Pending team decision:** "open it for review" is the **Start review** action, not viewing the page (effective-requirements.md §4).
    - **Backlog note:** reject, which SPM-5 assigns to SPM-45, was already built by SPM-9.
    - **Evidence:**
      - `tests/spm-5/unit/approveForPlanning.test.js`
      - `tests/spm-5/integration/reviewAndApproveApi.test.js`
      - `tests/spm-5/e2e/spm5.reviewAndApprove.spec.js`
      - SPM-5 cases in `frontend/src/pages/requestDetail.test.jsx`
      - The `shared/statusTransitions.test.js` fixture was completed so it passes the guard.
    - **Local verification (Windows):** lint passed; 128 Node tests and 71 frontend tests passed; root Vitest 415 passed (30 opt-in live tests skipped); the production build passed.
    - **Not verified:** these are in-memory doubles only. No live Firebase or manual browser check was run, and no backlog status change is claimed.
15. **SPM-25 return for clarification (2 Oct 2026, branch `feature/spm-25`):**
    - **Built:** Return for Clarification now requires a message (`REASON_REQUIRED_ACTIONS` in `shared/requestActions.js`). Each return appends `{ message, requestedByUid, requestedAt }` to the top-level `clarificationRequests` metadata in the same transaction as the status change. `clarificationSummary()` gives the messages, newest first and without the sender, to the owning Organiser and to Coordinators. The request page shows the latest message while the request is Returned, and the full list as history afterwards. Return, Organiser editing and resubmission were already provided by SPM-9 and SPM-42.
    - **Not met — "the Organiser is notified":** no notification system exists (effective-requirements.md §20). The Organiser sees the status and message only on opening the request. SPM-25 is not Done until that criterion is met or the Product Owner agrees to defer it.
    - **Pending team decisions:** the in-app notice standing in for a notification, and keeping messages after resubmission (effective-requirements.md §4).
    - **Risk carried over:** `PATCH /api/requests/:id` does not validate field values (AGENTS.md §6), so a malformed value in an Organiser's edit to a returned request is stored until resubmission, where `validateEventRequestSubmission` refuses it. Booleans are coerced rather than rejected there, and edits after resubmission are not checked.
    - **Evidence:**
      - `tests/spm-25/unit/clarificationRequests.test.js`
      - `tests/spm-25/integration/returnForClarificationApi.test.js`
      - `tests/spm-25/e2e/spm25.returnForClarification.spec.js`
      - SPM-25 cases in `frontend/src/pages/requestDetail.test.jsx`
      - The SPM-9 return steps now send a message.
    - **Local verification (Windows):** lint passed; 128 Node tests and 71 frontend tests passed; root Vitest 414 passed (30 opt-in live tests skipped); the production build passed with the existing bundle-size warning; Playwright Chromium passed all 40 tests.
    - **Not verified:** these are in-memory doubles only. No live Firebase, emulator or manual browser check was run, and no backlog status change is claimed.
17. **SPM-46 view the assigned Event Coordinator (3 Oct 2026, branch `SPM-46`):**
    - **Built:** an Organiser viewing an event they may see under SPM-42 (owner or same-organisation colleague) gets `assignedCoordinator` in the response. It is `{ assigned, name }`, with the name read from `users/{uid}.name`. The request page shows "Event Coordinator: <name>", "Not yet assigned" or "Assigned (name unavailable)". Drafts and every other role get `null`. Neither the uid nor any other profile field is sent. Rules: `shared/assignedCoordinator.js`; lookup: `backend/src/services/assignedCoordinatorService.js`; `createApp` takes `getUserDb` (defaulting to `getEventRequestDb`).
    - **Team decisions (3 Oct 2026):** colleague visibility, the "name unavailable" fallback, and keeping "Not yet assigned" for Week 7 Change 5 (effective-requirements.md §5, SPM-46).
    - **Gaps:** there is no reassignment route (SPM-26), so criterion 3 is tested by changing `assignedCoordinatorUid` in the fixture. The E2E double holds a profile for one Coordinator only, so reassignment, "Not yet assigned" and "name unavailable" are tested at API and page level, not E2E. The requests list does not show the Coordinator.
    - **Evidence:**
      - `tests/spm-46/unit/assignedCoordinator.test.js`
      - `tests/spm-46/integration/assignedCoordinatorApi.test.js`
      - `tests/spm-46/integration/assignedCoordinatorPage.test.jsx`
      - `tests/spm-46/e2e/spm46.assignedCoordinator.spec.js`
    - **Local verification (macOS):** lint passed; 128 Node tests and 75 frontend tests passed; root Vitest 505 passed (30 opt-in live tests skipped); Playwright Chromium passed all 45 tests; the production build passed with the existing bundle-size warning.
    - **Not verified:** these are in-memory doubles only. No live Firebase, emulator or manual browser check was run, and no backlog status change is claimed.
17. **SPM-63 Coordinator cancellation and SPM-47 Organiser cancellation request (3 Oct 2026, branch `feature/spm-47-63`):**
    - **Built:** the start date/time cut-off; required reasons on request, refuse and direct cancel; return of a request for more information, with resubmission; and the `cancellation` record with an in-app notice on the event page. Cancelled, Completed and Rejected events are listed under "Closed events". There are in-app notifications for the assigned Coordinator (request, resubmission), the Organiser (return, refusal, cancellation) and assigned staff (cancellation), on a new Notifications page (effective-requirements.md §6, §20).
    - **Not met:** releasing venue and equipment reservations, because no reservation records exist; and notifying registered Attendees, because Attendee Registration does not exist. Neither story is Done until these are met or the Product Owner agrees to defer them.
    - **Team decision (3 Oct 2026):** an unassigned Coordinator cannot view an event's cancellation request, replacing SPM-47's "(they may view it)" to match SPM-65. The backlog criterion's wording is still to be updated (effective-requirements.md §6).
    - **Pending team decisions:** the cut-off rules, the returned-request rules, and in-app as the only notification channel.
    - **Changed behaviour:** SPM-9's undated cancellation is now bounded by the start date/time. Requesting and refusing cancellation now require a reason. The SPM-9 tests were updated to match.
    - **Evidence:**
      - `tests/spm-63/unit/coordinatorCancel.test.js`
      - `tests/spm-63/unit/cancellationNotifications.test.js`
      - `tests/spm-63/integration/coordinatorCancelApi.test.js`
      - `tests/spm-63/e2e/spm63.coordinatorCancel.spec.js`
      - `tests/spm-47/unit/cancellationRequestRules.test.js`
      - `tests/spm-47/integration/cancellationRequestApi.test.js`
      - `tests/spm-47/e2e/spm47.cancellationRequest.spec.js`
      - `frontend/src/pages/cancellation.test.jsx`
      - `frontend/src/pages/notifications.test.jsx`
    - **Local verification (Windows, 3 Oct):** lint passed; 128 Node tests and 90 frontend tests passed; root Vitest 503 passed (30 opt-in live tests skipped); the production build passed with the existing bundle-size warning; Playwright Chromium passed all 44 tests.
    - **Not verified:** these are in-memory doubles only. No live Firebase, emulator or manual browser check was run. `firestore.rules` was not changed or deployed. No backlog status change is claimed.
    - **Date risk:** the seeded events start on 20 Nov 2026. After that date, the E2E cancellation specs (SPM-9, SPM-47, SPM-63) will fail on the cut-off, as SPM-9's would. The API suites move the event's start relative to the real clock.

18. **SPM-26 reassign an event to a different Event Coordinator (3 Oct 2026, branch `SPM-26`):**
    - **Built:** the assigned Coordinator reassigns a non-terminal event from the request page. They choose a Coordinator, tick the offline-agreement confirmation, and confirm; they are then taken to their list with a notice. The Reassign action is shown from `canReassignCoordinator` in the request response. The two new routes (candidates and reassignment) are under `/api/event-requests/:id/reassignment`. In one transaction, the reassignment reads the request, the Coordinators and SPM-8's lock, then writes the new `assignedCoordinatorUid`, a `coordinator_reassigned` activity entry and the lock. SPM-8's Coordinator query is now the exported `loadCoordinators()`, and SPM-9's `requireRequestScope()` is exported for reuse. Rules and decisions: effective-requirements.md §5, SPM-26.
    - **E2E fixture:** `EXTRA_USERS.secondCoordinator` (Seed Coordinator 2) is now seeded in the E2E double. When SPM-46 is merged, its E2E comment saying the double has one Coordinator must be updated.
    - **Gaps:** no notifications (§20). Reassignment history is written but not yet displayed. Concurrency is serialised through the lock document only in principle: the in-memory fake does not model Firestore transaction retries, so this has not been verified on the emulator or the deployed project.
    - **Evidence:**
      - `tests/spm-26/unit/coordinatorReassignment.test.js`
      - `tests/spm-26/integration/reassignCoordinatorApi.test.js`
      - `tests/spm-26/integration/reassignCoordinatorPage.test.jsx`
      - `tests/spm-26/e2e/spm26.reassignCoordinator.spec.js`
    - **Local verification (macOS):** lint passed; 128 Node tests and 75 frontend tests passed; root Vitest 517 passed (30 opt-in live tests skipped); Playwright Chromium passed all 44 tests; the production build passed.
    - **Not verified:** these are in-memory doubles only. No live Firebase, emulator or manual browser check was run, and no backlog status change is claimed.

19. **SPM-45 reject a request and SPM-27 mark an event Completed (4 Oct 2026, branch `feature/spm-45-27`):**
    - **Built (SPM-45):** Reject, built by SPM-9, now requires a reason. Each rejection writes top-level `rejection` metadata (reason, previous status, `rejectedByUid`, time) in the status-change transaction. `rejectionNotice()` in `shared/requestActions.js` gives the reason, previous status and time, without who rejected it. The request page asks for a rejection reason before confirming, and shows a Rejected request as closed, with a link for Organisers to create a new request.
    - **Built (SPM-27):** Complete, built by SPM-9, now writes top-level `completion` metadata (`completedByUid`, `completedByName`, time). `completionNotice()` gives the time to every user who can view the event, and the name to Coordinators only. The request page shows "Event completed".
    - **Pending team decision:** showing who completed an event to Coordinators only (effective-requirements.md §6).
    - **Changed behaviour:** a rejection without a reason is now refused with 400 `reason_required`. The SPM-9 and SPM-25 tests that rejected without a reason were updated to send one.
    - **Gaps:** the activity history is not displayed. The Organiser is not notified of a rejection. Seeded Rejected and Completed requests have no `rejection`/`completion` record.
    - **Evidence:**
      - `tests/spm-45/unit/rejectRequest.test.js`
      - `tests/spm-45/integration/rejectRequestApi.test.js`
      - `tests/spm-45/e2e/spm45.rejectRequest.spec.js`
      - `tests/spm-27/unit/markCompleted.test.js`
      - `tests/spm-27/integration/markCompletedApi.test.js`
      - `tests/spm-27/e2e/spm27.markCompleted.spec.js`
      - `frontend/src/pages/rejectionCompletion.test.jsx`
    - **Local verification (Windows, 4 Oct):** lint passed; 128 Node tests and 99 frontend tests passed; root Vitest 706 passed (30 opt-in live tests skipped); the production build passed with the existing bundle-size warning; Playwright Chromium passed all 53 tests.
    - **Not verified:** these are in-memory doubles only. No live Firebase, emulator or manual browser check was run. `firestore.rules` was not changed or deployed. No backlog status change is claimed.

20. **SPM-64 view and edit my event request (4 Oct 2026, branch `SPM-64`):**
    - **Built:** a "Your event arrangements" card on the request page for Organisers: date and time, venue and equipment labelled "Requested", with the venue and technical sign-off state (`frontend/src/components/ArrangementsSummary.jsx`, `frontend/src/utils/eventArrangements.js`). The sign-off wording now lives in `eventArrangements.js` and is shared with SPM-9's "Arrangements and cancellation" card. Before Planning an undecided sign-off reads "Not started — reviewed during planning", and on a closed event "Not reviewed — event closed", on both cards (team decision, 4 Oct 2026). No API or permission change: AC1–AC4 and AC6 were already met by SPM-42 and are now tested per status. No "Request change" option (SPM-20).
    - **Docs:** same-organisation visibility is recorded as a team decision of 3 Oct 2026 (effective-requirements.md §3; §9 item 3 resolved). "(Assumption)" on AC6 is to be removed in the backlog workbook.
    - **Cross-story (SPM-46 × SPM-26):** after a real reassignment the Organiser sees the new Coordinator's name (`tests/spm-46/integration/reassignedCoordinatorName.test.js`, `tests/spm-46/e2e/spm46.reassignedCoordinatorName.spec.js`). The SPM-46 E2E comment about the double holding one Coordinator is updated.
    - **Gaps:** "confirmed arrangements" cannot show anything booked: venue booking and equipment reservation do not exist. On a Completed, Cancelled or Rejected event an undecided sign-off reads "Not reviewed — event closed" (follow-up, 4 Oct 2026).
    - **Evidence:**
      - `tests/spm-64/unit/eventArrangements.test.js`
      - `tests/spm-64/integration/organiserViewEditApi.test.js`
      - `tests/spm-64/integration/organiserViewEditPage.test.jsx`
      - `tests/spm-64/e2e/spm64.viewMyRequest.spec.js`
    - **Local verification (macOS, 4 Oct 2026):** lint passed; 128 Node tests and 99 frontend tests passed; root Vitest 786 passed (30 opt-in live tests skipped); Playwright Chromium passed all 57 tests; the production build passed with the existing bundle-size warning. One SPM-25 page test (`requestDetail.test.jsx`) now finds section headings by role, because the new summary also has a "Venue" row.
    - **Not verified:** no live Firebase, emulator or manual browser check was run, and no backlog status change is claimed.
    - **Follow-up, AC4/AC6 (4 Oct 2026, built on branch `SPM-28`, shipping in the SPM-28 PR as a separate section):**
      - **What it adds:** "Submitted by: You / <name>" on the Organiser's requests list, an "All" / "My requests" filter (client-side), and a view-only note on a colleague's request page.
      - **API:** Organisers receive `ownerName` and `isOwnRequest`, in list items and in the request response, which covers GET, PATCH and transitions. `isOwnRequest` is needed because the response carries no owner uid and names are not unique. Other roles' responses are unchanged.
      - **Code:** `shared/requestOwner.js` and `backend/src/services/requestOwnerService.js` (one `users/{uid}` read per colleague owner).
      - **Evidence:** `tests/spm-64/integration/requestOwnerApi.test.js`, `tests/spm-64/integration/ownerLabels.test.jsx`. In-memory doubles only.
      - **Local verification (macOS, 4 Oct 2026, with SPM-28):** lint passed; `test:spm64` 104 Vitest + 3 Playwright and `test:spm28` 81 Vitest + 3 Playwright passed; 128 Node and 99 frontend tests passed; root Vitest 896 passed (30 opt-in live tests skipped); Playwright 60/60; the build passed. No existing test needed changing.
21. **SPM-28 view the change history of an event (4 Oct 2026, branch `SPM-28`):**
    - **Built:**
      - Section edits through `PATCH /api/requests/:id` (the only post-submission field-write path) now run in a transaction that also writes one `field_changed` activity entry per changed field.
      - `GET /api/requests/:id/history` serves the entries to the assigned Coordinator and the owning Organiser, without internal planning for the Organiser and without actor uids.
      - The request page has a "Change history" panel.
      - Rules: `shared/changeHistory.js`.
      - Store contract: `update(id, patch, { version, recordChanges })` and `listFieldHistory(id)`, in all three stores.
    - **Seed:** `SEED_FIELD_HISTORY` puts three entries on `seed-req-a1-planning`, one of them internal planning. `seed.js --write` also removes stray `field_changed` entries under seeded requests, within four guardrails (`backend/scripts/seedHistory.js`, unit-tested).
    - **Decisions:** viewers, Submitted onwards and field edits only are team decisions of 4 Oct 2026, pending PO confirmation (effective-requirements.md §7).
    - **Gaps:**
      - Values are unvalidated (the SPM-10 validation gap).
      - Entries from one save share a timestamp.
      - Live API runs add entries until the next seed.
      - Transaction behaviour is not verified on the Firestore emulator. (Corrected 7 Oct 2026: it was verified against the real project by the live API suite; see below.)
    - **Evidence:**
      - `tests/spm-28/unit/changeHistory.test.js`
      - `tests/spm-28/unit/seedHistory.test.js`
      - `tests/spm-28/integration/changeHistoryApi.test.js`
      - `tests/spm-28/integration/changeHistoryPage.test.jsx`
      - `tests/spm-28/e2e/spm28.changeHistory.spec.js`
    - **Local verification (macOS, 4 Oct 2026):** lint passed; `test:spm28` 81 Vitest + 3 Playwright passed; 128 Node tests and 99 frontend tests passed; root Vitest 867 passed (30 opt-in live tests skipped); Playwright Chromium passed all 60 tests; the production build passed with the existing bundle-size warning. No existing test needed changing.
    - **Not verified:** no live Firebase, emulator or manual browser check was run, the seed was not run against the real project, and no backlog status change is claimed.
    - **Correction (7 Oct 2026):** the two lines above understated the verification. The SPM-28 transaction (`firestoreEventRequestStore.update` with `recordChanges`) was verified against the real Firebase project by the live API suite (`npm run test:api:live`), which passed 30/30 on 4 Oct 2026, as reported by the team. The emulator and a manual browser check remain unverified.
22. **SPM-48 Venue Staff and Technical Support Staff update preparation status (7 Oct 2026, branch `SPM-48`):**
    - **Built:**
      - Two new sections, `venuePreparation` and `equipmentPreparation` (`{ status, notes }`; Not Started / In Progress / Ready). A section never saved reads as Not Started with empty notes.
      - Values, defaults, the 2,000-character notes limit, validation and the read-only reasons: `shared/preparation.js`.
      - **SPM-42 behaviour change** (`SECTION_ACCESS` in `shared/permissions.js`): assigned Venue Staff edit only venue preparation, and assigned Technical Support Staff only equipment preparation. Staff view the requested `venue` / `equipment` read-only and no longer edit them. The assigned Coordinator views both preparation sections read-only. Organisers and Attendees never receive them.
      - **TEMPORARY condition:** Planning or Confirmed, and the matching SPM-9 sign-off approved. It lives in `canUpdateVenuePreparation` / `canUpdateEquipmentPreparation`, applied per section in `editableSectionsFor`, until SPM-54 / SPM-56 / SPM-62 exist.
      - **Validation:** `PATCH /api/requests/:id` validates preparation values after authorisation (`backend/src/middleware/validatePreparation.js`); invalid values get 400 and nothing is written.
      - **History:** recorded through SPM-28 (same PATCH, same transaction). `shared/changeHistory.js` hides preparation entries from the Organiser as it hides internal planning.
      - **Page:** a Venue preparation / Equipment preparation card for the staff role that edits it, with a read-only reason taken from the API's `preparation` field. The Coordinator sees both read-only. Shown from Planning onwards.
      - **Refactor:** sign-off constants moved to `shared/arrangementDecisions.js` (re-exported by `shared/arrangements.js`) to avoid a circular import.
    - **Seed:** `seed-req-a1-confirmed` now has both sign-offs approved (`arrangementApprovals`), so staff may update its preparation. `seed-req-a1-planning` has none, so preparation is read-only there. IDs are unchanged. `seed-history-a1-planning-2` is kept as historical data that predates SPM-48. **A reseed (`seed.js --write`) is needed** before the live API suite or a manual check on the real project.
    - **Decisions:** the criteria, the temporary condition, the display rule and the notes limit are team decisions of 7 Oct 2026, pending PO confirmation (effective-requirements.md §7).
    - **Open question for the PO:** G8 Session 1 supports staff editing only their preparation/reservation sections; G8 Session 2's "their respective venue/equipment sections" is the wording SPM-42 was built on and could mean the requested sections (effective-requirements.md §7 and §9 item 12).
    - **Gaps:**
      - Nothing in the application sets `assignedStaffUids` (only the seed does), so outside seed data no staff can update preparation. This is existing SPM-42 behaviour, likely for SPM-14 / SPM-17 / SPM-56 (effective-requirements.md §9).
      - The condition is temporary (above).
      - [`docs/evidence/spm42-spm24-traceability.md`](docs/evidence/spm42-spm24-traceability.md) still shows the pre-SPM-48 staff edit rule.
    - **Existing tests changed:** only those encoding the old staff edit rule, listed in the SPM-48 PR. One more, `Coordinator edits a section outside "main details"`, iterated every section and now excludes the preparation sections the Coordinator only views.
    - **Test-only change:** the E2E double gained `POST /__double__/accounts/:key`, which signs in one extra seeded account until the next reset. The SPM-48 E2E uses it for `coordinator3`, A1 confirmed's Coordinator; a permanent extra Coordinator would change SPM-26's reassignment choices.
    - **Evidence:**
      - `tests/spm-48/unit/preparation.test.js`
      - `tests/spm-48/integration/preparationApi.test.js`
      - `tests/spm-48/integration/preparationPage.test.jsx`
      - `tests/spm-48/e2e/spm48.preparation.spec.js`
    - **Local verification (macOS, 7 Oct 2026):** lint passed; `test:spm48` 96 Vitest + 3 Playwright passed; `test:spm28` 81 Vitest + 3 Playwright passed; 128 Node and 99 frontend tests passed; root Vitest 1004 passed (30 opt-in live tests skipped); Playwright Chromium 63/63 passed; the production build passed with the existing bundle-size warning.
    - **Not verified:** no live API run, emulator, deployed project or manual browser check, the seed was not run against the real project, `firestore.rules` is unchanged, and no backlog status change is claimed.
23. **SPM-10 edit event information and flag significant changes for re-review (9 Oct 2026, branch `SPM-10`):**
    - **Built:**
      - **Field list:** `shared/significantChanges.js`. Significant fields are date/time, duration, attendance, layout preference, the two accessibility fields, the equipment list and the technical support flag. Every other field is ordinary.
      - **Validation and normalisation:** significant fields are validated on `PATCH /api/requests/:id` after the 403 check (`backend/src/middleware/validateSignificantFields.js`), normalised, and compared by meaning, so `"80"` and `80` are not a change. Date/time, duration, attendance and layout cannot be cleared from Submitted onwards; drafts may still clear them.
      - **Effects, in the edit's transaction:** history entries are marked `significant: true`. At Planning or Confirmed the recorded sign-off decisions are cleared. At Confirmed the event moves back to Planning, with a `status_changed` entry (`action`/`reason` `significant_change`, the Coordinator, the time and the fields). Assigned users holding a Venue or Technical Support Staff role are notified in-app (`backend/src/services/staffRecipientService.js`).
      - **Store contract:** a new `consequences` option on `store.update`, in all three stores.
      - **AC7:** a significant change to a Confirmed event with an open cancellation request is refused with 409; ordinary edits are allowed.
      - **Request page:** an in-page confirmation before a significant change at Planning or Confirmed, and a "Significant" label in the change history. Refused saves:
        - **AC7 (409):** significant fields are reset to their saved values and ordinary edits are kept.
        - **400:** all input is kept, with errors beside each field.
        - **Stale write (409):** the latest record is reloaded into the form.
      - **Status label:** "Moved back to Planning (significant change)" in `frontend/src/utils/statusActions.js`.
    - **Seed:** unchanged. The E2E registers `coordinator3` (A1 confirmed's Coordinator) through the double's `POST /__double__/accounts/:key`, as SPM-48's does.
    - **Decisions:** the criteria of 8 Oct 2026, the layout rule (free text, no fixed list), the no-clearing rule, the role-filtered notifications and the AC7 block are team decisions (effective-requirements.md §7, SPM-10). AC9 (bookings not released) has nothing to build until SPM-54 / SPM-56 / SPM-62.
    - **Existing tests changed:**
      - `tests/spm-5/integration/reviewAndApproveApi.test.js`: `spm5_an_invalid_value_entered_during_review_blocks_approval` is now `…_is_refused_and_approval_stays_available`. AC6 refuses the invalid value when it is entered (400, nothing written).
      - `tests/spm-27/e2e/spm27.markCompleted.spec.js`: the setup order only. The date moves before the sign-offs are approved, because a date change at Planning is significant and clears them. No assertion changed.
      - SPM-25 and SPM-64 tests (Organiser edits on Returned requests) were not affected.
    - **Gaps:**
      - Ordinary fields are still unvalidated.
      - No page displays `status_changed` entries yet.
      - History entries from before SPM-10 carry no significant flag.
      - With no staff assigned (only the seed assigns staff, effective-requirements.md §9 item 11), nobody is notified.
    - **Evidence:**
      - `tests/spm-10/unit/significantChanges.test.js`
      - `tests/spm-10/integration/significantChangesApi.test.js`
      - `tests/spm-10/integration/significantChangePage.test.jsx`
      - `tests/spm-10/e2e/spm10.significantChange.spec.js`
    - **Local verification (macOS, 9 Oct 2026):** lint passed; `test:spm10` 145 Vitest + 1 Playwright passed; `test:spm27` 23 Vitest + 2 Playwright, `test:spm48` 96 + 3 and `test:spm28` 81 + 3 passed; 128 Node and 99 frontend tests passed; root Vitest 1160 passed (30 opt-in live tests skipped); Playwright Chromium 64/64 passed; the production build passed.
    - **Not verified:** no live API run, emulator, deployed project or manual browser check; the Firestore store's `consequences` path is exercised only through the in-memory and fakeFirestore stores. `firestore.rules` is unchanged, and no backlog status change is claimed.
24. **SPM-12 search and filter venues by event requirements (15 Oct 2026, branch `spm-12`):**
    - **Built:**
      - **Rules:** `shared/venueSearch.js` parses the filters, matches venues and builds the filter options.
      - **API:** `GET /api/venues` takes `attendance`, `location`, `layout`, and repeated `facility` and `accessibility` parameters beside SPM-30's `availableFrom`/`availableTo`. A venue is returned only when it meets every filter applied. The response adds `filterOptions`: the distinct locations, layouts, facilities and accessibility features recorded in the whole catalogue. Invalid values get 400 with field errors. Route access is unchanged (Coordinators and Venue Staff).
      - **Page:** the venue catalogue's search card is now "Search by event requirements": date/time, expected attendance, location and layout dropdowns, and accessibility and facility checkboxes. Every filter is optional. A search lists the applied filters and the number of matches; no match shows "No matching venues" with a Clear filters button.
    - **Decisions:** AC4 resolves the partial-match question as no results with a clear message. Catalogue-sourced options for every filter, exact case-insensitive matching and optional filters are team decisions of 15 Oct 2026, pending PO confirmation (effective-requirements.md §4.10).
    - **Existing test changed:** `tests/spm-30/integration/maintenanceBlocksPage.test.jsx` now expects the "No matching venues" heading instead of "No venues available" (AC4).
    - **Gaps:**
      - Setup/turnaround buffers (SPM-75) and hold expiry (SPM-78) are not applied; every tentative hold makes a venue unavailable.
      - Operating hours are not checked; they are free text (a Session 1 suitability factor, for SPM-13).
      - Accessibility features and facilities are free text, so near-duplicates ("Mic system" / "Microphone system") appear as separate options.
      - No seeded venues and no E2E test: the E2E double does not give the venue routes its in-memory database.
    - **Evidence:**
      - `tests/spm-12/unit/venueSearch.test.js`
      - `tests/spm-12/integration/venueSearchApi.test.js`
      - `tests/spm-12/integration/venueSearchPage.test.jsx`
    - **Local verification (macOS, Node 24.1.0, 15 Oct 2026):** lint passed; `test:spm12` 31 Vitest passed; 128 Node and 99 frontend tests passed; root Vitest 1212 passed (30 opt-in live tests skipped); Playwright Chromium 64/64 passed; the production build passed with the existing bundle-size warning.
    - **Not verified:** these use in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.
25. **SPM-72 configure venue setup and turnaround time (15 Oct 2026, branch `spm-72`):**
    - **Built:**
      - **Fields:** each venue has `setupMinutes` and `turnaroundMinutes`, whole minutes, 0 or more, no maximum. Venues created before SPM-72 read as 0; nothing is migrated. Validation is in `normaliseVenueInput` (`shared/venue.js`): a negative, fractional, non-numeric or blank value gets 400 naming the field.
      - **Occupied period:** `shared/venueOccupancy.js` has `occupiedPeriod` (10:00–12:00 with 30/45 minutes gives 09:30–12:45), `venueBufferMinutes` and `hasConfirmedBooking`. Nothing applies `occupiedPeriod` yet; SPM-16, SPM-73 and SPM-75 are expected to import it.
      - **Lock (AC5):** while the venue has a confirmed booking that has not ended, `PATCH /api/venues/:id` refuses changed times with 409 naming each field, checked inside the edit's transaction. Other details still save. `GET /api/venues/:id` adds `bufferTimesLocked`, and the edit page then shows the times read-only with a note.
      - **History (AC7):** changes are recorded as SPM-29 `venue_field_changed` entries (old value, new value, who, when). An older venue's first edit records no change from nothing to 0. On creation, the venue record holds the values and who created it when.
      - **Pages:** add and edit pages have "Setup time (minutes)" and "Turnaround time (minutes)", starting at 0 on the add page. The venue detail page shows both.
    - **Decisions:** AC5 adopts CL3 row 6's lock point (confirmed booking) over row 4's ("once set"). The meaning of "has a confirmed booking", the 409, keeping times that an edit leaves out, and creation history are team decisions of 15 Oct 2026, pending PO confirmation (effective-requirements.md §4.8).
    - **Gaps:**
      - Nothing creates confirmed bookings yet (SPM-54), so AC5 is tested only with seeded `venueAvailability` entries. It assumes SPM-54 stores bookings there with status `confirmed_booking`.
      - A change while the venue has only tentative holds can make their occupied periods overlap; nothing flags it (effective-requirements.md §4.8, C6 sub-parts).
      - Venue history is recorded but not displayed.
      - No E2E test: the E2E double does not give the venue routes its in-memory database.
    - **Shared file changed:** `REMOVED_STATUSES` in `shared/venueAvailability.js` is now exported.
    - **Evidence:**
      - `tests/spm-72/unit/venueBufferTimes.test.js`
      - `tests/spm-72/integration/venueBufferTimesApi.test.js`
      - `tests/spm-72/integration/venueBufferTimesPage.test.jsx`
    - **Local verification (macOS, Node 24.1.0, 15 Oct 2026, on top of SPM-12's merge `2e92be8`):** lint passed; `test:spm72` 28 and `test:spm12` 31 Vitest passed; 128 Node and 99 frontend tests passed; root Vitest 1240 passed (30 opt-in live tests skipped); Playwright Chromium 64/64 passed; the production build passed with the existing bundle-size warning. Before the merge, one Playwright run alongside the root Vitest suite timed out once in an SPM-2 registration spec, which then passed on its own.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.
26. **SPM-16 booking conflict detection (15 Oct 2026, branch `feature/SPM-16-conflict-detection`):**
    - **Built (service level only, no route):**
      - **Rule:** `findVenueConflict` in `shared/venueConflicts.js`. Bookings and holds are compared on occupied periods (`occupiedPeriod`, with the venue's current times on both sides). Maintenance blocks are compared on their own period. Overlap uses `overlaps()`, so a later setup may start exactly when an earlier turnaround ends, and one second of overlap conflicts. Filtering reuses `activeCommitmentsInRange`. Each venue is checked on its own.
      - **Expiry:** `TENTATIVE_HOLD_DURATION_MS` (7 days), `tentativeHoldExpiresAt` and `isExpiredHold` in `shared/venueAvailability.js`. Expired holds do not block a new request. Holds without `holdExpiresAt` still block. The calendar and search are unchanged.
      - **Enforcement:** `createTentativeVenueHold(input, actor, db, now)` checks the venue exists. It then reads the venue, the lock `systemLocks/venueBooking-{venueId}` and the venue's `venueAvailability` in one transaction. A conflict throws `VenueConflictError` and writes nothing. Otherwise the transaction writes the hold (`lifecycleStatus: 'active'`, `holdExpiresAt`) and the lock. `sendVenueError` maps the error to 409 with the type and occupied period only.
      - **Seed:** `SEED_VENUES` (hall with setup 30 and turnaround 45; room with 0/0) and `SEED_VENUE_AVAILABILITY` at the hall:
        - A1 Confirmed's booking at that event's own date and time.
        - An active hold for B1 Planning at its own date and time. Its expiry is 30 June 2027 (23:59:59 SGT), so it stays active for demonstrations.
        - **Existing seed changed:** `seed-req-b1-planning`'s `preferredDateTime` moved from 20 Nov to 27 Nov 2026 (09:00 SGT). Every non-draft seeded event was on 20 Nov 09:00, so B1's hold at its own time would have clashed with A1's seeded booking at the same hall.
        - An expired hold linked to no event.
    - **Decisions:** team decisions of 15 Oct 2026, pending PO confirmation (effective-requirements.md §4.14).
    - **Existing test changed:** `tests/spm-11/integration/venueAvailabilityApi.test.js` now expects `VenueConflictError` instead of the earlier 400 message for an overlapping hold.
    - **Gaps:**
      - No route or UI creates holds or bookings (SPM-14, SPM-54).
      - SPM-14 must release an event's own hold before re-holding the same venue with new times.
      - SPM-54 needs an `excludeId` option when re-checking on approval.
      - Clashes after a setup or turnaround change are not flagged.
      - Maintenance blocks do not take the venue lock.
      - The seed has only been dry-run, not written to the project.
    - **Evidence:**
      - `tests/spm-16/unit/venueConflicts.test.js`
      - `tests/spm-16/unit/seedVenues.test.js`
      - `tests/spm-16/integration/tentativeHoldConflicts.test.js` (in-memory double; sequential requests, lock reads and writes)
      - `tests/spm-16/integration/tentativeHoldConcurrency.live.test.js` (opt-in, real project)
    - **Local verification (macOS, 15 Oct 2026):**
      - Lint passed.
      - `test:spm16`: 42 passed, 1 live test skipped. `test:spm11`: 10 passed. `test:unit`: 144 passed. `test:integration`: 280 passed, 1 skipped.
      - 128 Node and 99 frontend tests passed. Root Vitest: 1282 passed, 31 opt-in live tests skipped.
      - Playwright Chromium: 64/64 passed.
      - Seed dry run against `connectsphere-6546c`: 5 venue documents to create, no blockers, nothing written.
    - **Live verification (real Firebase project `connectsphere-6546c`, run once):**
      - Five simultaneous overlapping holds on a throwaway venue: 1 created, 4 refused with `VenueConflictError`, 1 hold stored.
      - The venue, its hold and its lock were deleted afterwards. A follow-up read-only query found none left.
    - **Not verified:** emulator, manual browser check, production build (no frontend change). `firestore.rules` is unchanged, and no backlog status change is claimed.

27. **SPM-37 exclude unavailable equipment from the available quantity (15 Oct 2026, branch `feature/spm-37`):**
    - **Built:**
      - The first equipment inventory. Equipment types live in `equipmentTypes`; their units live in `equipmentUnits`, each with `equipmentTypeId`, an asset tag that is unique within its type, and a status: Available, Damaged, Under Repair or Unavailable.
      - Only Available units count as available. The other three statuses are excluded for every period, because a status has no dates.
      - Each status change is recorded in `equipmentUnits/{id}/activity` with the previous status, new status, optional note, actor and time.
      - `/api/equipment` lists every type's total, available and unavailable counts for an optional period, and serves one type with its units. Technical Support Staff add types and units and change unit status; Event Coordinators view only.
      - Pages: `/equipment` and `/equipment/:id`, and an "Equipment" navbar link for both roles.
      - Rules are in `shared/equipment.js` and the service is `backend/src/services/equipmentService.js`. `createApp` takes `getEquipmentDb`, and the E2E double passes its in-memory database to it.
    - **Team decisions (15 Oct 2026, pending PO confirmation):** the individual-unit model; Coordinator read-only access; new units start Available. See effective-requirements.md §4.16.
    - **Blocked — AC5** (a reserved unit becomes Damaged, Under Repair or Unavailable: shortfall flag, other reservations kept, Technical Support Staff and Coordinator notified). No equipment reservations exist (SPM-38), so there is nothing to flag. SPM-37 is not Done until AC5 is built once reservations exist, or the PO agrees to defer it.
    - **Gaps:**
      - Reservations are not subtracted from the available count, so the count is usable stock and the period is validated but does not change it (SPM-18, SPM-38).
      - Organisers' equipment needs are still free text and are not linked to equipment types.
      - Unit activity history is written but not displayed.
      - Nothing is seeded, and there is no rename or delete for types or units.
    - **Evidence:**
      - `tests/spm-37/unit/equipmentAvailability.test.js`
      - `tests/spm-37/integration/equipmentApi.test.js`
      - `tests/spm-37/integration/equipmentPage.test.jsx`
      - `tests/spm-37/e2e/spm37.equipmentAvailability.spec.js`
    - **Local verification (Windows, 15 Oct 2026):** lint passed; 128 Node and 99 frontend tests passed; root Vitest 1322 passed (31 opt-in live tests skipped); the production build passed with the existing bundle-size warning; Playwright Chromium passed all 66 tests.
    - **Not verified:** these are in-memory doubles only. No live Firebase, emulator or manual browser check was run. `firestore.rules` is unchanged: its default deny already blocks the browser from the new collections, and the API uses the Admin SDK. No backlog status change is claimed.

## SPM-14 venue booking increment — 16 October 2026

- Assigned Coordinators can submit venue booking requests at Planning through `/api/requests/:id/venue-bookings`. The browser form is linked from event details. Assigned Venue Staff read their pending queue at `/venues/booking-requests`.
- Team choice authorised for this increment: least pending requests, round robin on ties; retain the assignee on replacement. The booking, assignment, hold and activity entry save atomically. Capacity overflow warns but permits a pending request for review, not approval.
- Replacement secures the new hold and releases the exact old one together. Event rejection, direct cancellation and approved cancellation release tentative holds in the status transaction; cancellation requests alone do not. Confirmed bookings are preserved.
- Verification and gaps: `docs/evidence/spm-14-traceability.md`. The user manual checklist is `docs/testing/spm-14-manual-testing.md`. Local unit/integration suites, production build, targeted browser tests and isolated Firestore emulator checks passed. Manual acceptance and SPM-54 rejection-flow integration remain outstanding.
- No live project or production seed was used; rules were neither edited nor deployed. The workbook/Sprint record is absent, and no operational status or Sprint assignment was changed. Existing calendar/search expiry and maintenance concurrency gaps remain.

## Documentation Boundaries

- [`AGENTS.md`](AGENTS.md) governs repository work.
- Source records preserve chronology and must not be silently rewritten to match later decisions.
- `effective-requirements.md` is the current reconciled interpretation.
- The backlog and Sprint records control operational status and estimates.
- [`docs/evidence/presentation-evidence.md`](docs/evidence/presentation-evidence.md) tracks verified work, evidence locations, gaps, and candidate Week 11 slide content against the course rubric.
- [`docs/evidence/spm42-spm24-traceability.md`](docs/evidence/spm42-spm24-traceability.md) holds the SPM-42 permission matrix, the criterion-to-test mapping for SPM-42 and SPM-24, and their Definition of Done status.
