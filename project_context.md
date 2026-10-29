# ConnectSphere Project Context

Last reviewed: 29 October 2026 (SPM-90 local recheck and SPM-66/91/92 merge; older implementation sections retain their historical dates)

## Current implementation map (27 October 2026)

The browser has routes for authentication, profiles, requests and drafts, venue catalogue and bookings, equipment inventory and requests, reservations, and notifications (`frontend/src/App.jsx`). Express mounts health, profile, event request, scoped request, venue, equipment, and notification APIs (`backend/src/app.js`). `shared/` holds policy and validation used by both applications. Product request data goes through the Express API; the browser reads its own `users/{uid}` profile under Firestore rules. See `docs/architecture/` for current diagrams and data boundaries.

The implemented role model includes Safety Officer; Coordinator Lead remains absent. Submission still assigns a Coordinator automatically. SPM-90 has local primary-venue selection, confirmation gating, attendee location projection and change history. Confirm also requires the recorded SPM-91/92 safety approval. Live-project backfill and human acceptance remain outstanding. The available backlog workbook is a reference for story interactions; its status is not used to judge application implementation. CI has three jobs for code checks, Firestore emulator transactions, and Playwright. The earlier September observations below are historical checkpoints, not a current inventory of routes, seed counts, or CI.

## Current SPM-90 state (29 October 2026)

The assigned Coordinator can choose a current approved venue booking as primary through `PUT /api/requests/:id/primary-venue`. Confirm requires a primary venue for a multi-venue event and automatically selects the sole approved booking for a single venue need. Attendees receive only the primary venue name, catalogue location and event times; Organisers retain all associated bookings. Switching the primary booking while Confirmed preserves the event status. Cancelling the primary booking clears it, returns a Confirmed event to Planning through the existing cancellation behavior, and requires an explicit replacement choice. The existing change history records selection, switching and clearing. The selection API uses an expected previous booking ID to reject stale competing updates.

The backfill script is dry-run-first and was not run against a live project. Already Confirmed multi-venue events without primary metadata need Coordinator selection before rollout. The locally available Product Backlog workbook was consulted for story interactions and left unchanged. The SPM-90 implementation meets the acceptance criteria in local automated checks; manual acceptance remains pending in `docs/testing/spm-90-manual-testing.md`. Acceptance mapping and the 29 October verification results are in `docs/evidence/spm-90-traceability.md`. No Firestore rules were changed or deployed.

## Current SPM-88 state (26 October 2026)

The local code now has a separate `Preparation` status and an assigned-Coordinator `start_preparation` action. The action records the status change and sends one in-app notice to each assigned Venue or Technical Support Staff member in the same transaction. **Update, 27 October 2026:** it now requires the safety approval recorded by SPM-92 (see the SPM-66/91/92 section below), which replaced the fail-closed verifier. Confirmed events from before SPM-91 have no approval, so they cannot start preparation until reviewed.

Staff preparation sections are editable only in Preparation. Completion requires Preparation and an ended event. Direct cancellation and approved Organiser cancellation requests work before a Preparation event starts, with the existing reservation release. Cancelling an approved venue booking returns Preparation to Planning. Attendees can read eligible Confirmed and Preparation events, but registration itself is still SPM-19 scope. Significant section edits in Preparation return 409 without writing until SPM-87 supplies the required re-review and safety invalidation path. **Update, 27 October 2026:** Confirm now requires the SPM-91/92 safety approval, so the safety-before-Confirmed sequence exists locally.

SPM-88 is **In Progress / not Done** in the Product Backlog. Local tests cover the implemented parts; no live Firebase verification or human acceptance has been performed. See `docs/testing/spm-88-manual-testing.md`. The earlier dated sections below describe their historical increments and may mention SPM-48's old temporary preparation gate.

## Project Purpose

ConnectSphere Event Services needs a custom Event Planning and Venue Booking System that centralises event information currently spread across email, spreadsheets, calendars, messaging applications, forms, and documents. The Week 12 first release must implement the 20 core functionality areas identified in the Week 4 Project Instructions as coherent end-to-end workflows.

Detailed requirements and their provenance are maintained in [`docs/requirements/`](docs/requirements/).

## Authoritative Sources

Use the following priority when sources differ:

1. Latest explicit team decision for a team-controlled choice
2. Later customer clarifications and changes, including Session 3 and the Week 7 update as distilled in `docs/requirements/effective-requirements.md`
3. Earlier customer clarifications, including Sessions 1 and 2
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

At the original September checkpoint, tracked application routes included:

- `/`
- `/login`
- `/register`
- protected `/profile`

The root package is an npm workspace over `frontend`, `backend` and `shared`; it provides development, build, lint, and test commands (`test`, `test:existing`, `test:spm1`, `test:spm2`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`). The frontend package keeps its own build, lint and Vitest commands. The [CI workflow](.github/workflows/ci.yml) defines three independent jobs on every push and on pull requests into `main`: code checks and build, seven local Firestore emulator transaction suites, and the full Playwright E2E suite. The opt-in live API harness is not part of CI. See the [CI pipeline guide](docs/testing/ci-pipeline.md) for commands, artifacts, and verification boundaries.

## Independently Observed Implementation State (September checkpoint)

At that checkpoint, the code provided an authentication prototype but did **not** yet match the complete customer/backlog role model. Later sections and the current implementation map above supersede these observations where implementation changed.

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

## SPM-53 pending venue booking queue — 16 October 2026

- Venue Staff now see concise event/venue/start/end cards with View details at `/venues/booking-requests`. A selected booking opens at `/requests/:id/venue-bookings?bookingId=:bookingId`, read-only, with full requirements, special requests and a return link.
- User-approved UI choice: reuse Arrangements and cancellation label/value rows, spacing and dividers. Booking-page navigation wraps on mobile. The event Requests/Closed events page and Coordinator submission/replacement behaviour remain unchanged.
- Existing Express endpoints and booking assignment permissions are reused. Shared pending selection orders oldest first with ID ties; expired-but-undecided requests remain pending. Queue entry/return, Refresh and error retry refetch current data.
- Verification and limitations are recorded in `docs/evidence/spm-53-traceability.md`; Dairu's 17-case checklist is `docs/testing/spm-53-manual-testing.md`. Unit, API/component regressions, all 69 Chromium browser tests, lint and production build passed; desktop/mobile screenshots were reviewed. Manual acceptance remains unperformed. SPM-54 approval/rejection is covered only by persisted-state fixtures, not a real decision journey.
- No database migration, rule change/deployment, production seed or live Firebase verification. The operational workbook/Sprint record remains absent; no Done status or Sprint allocation is claimed.
28. **SPM-13 check whether a venue is suitable for an event (15 Oct 2026, branch `spm-13`):**
    - **Built:**
      - **Rules:** `shared/venueSuitability.js` runs six checks per venue. Capacity overflow, a missing required facility and a booking, hold or maintenance block at the event's time make a venue unsuitable; an unsupported layout, a missing accessibility feature and operating hours give warnings. Every failure and warning is named. The event's own bookings and holds are ignored, and so are tentative holds that have expired (`isExpiredHold`, SPM-16). Other events are named only by type and time.
      - **Operating hours:** `shared/operatingHours.js` reads common free-text forms in Singapore time; unreadable text gets its own warning showing the text.
      - **API:** `GET /api/event-requests/:id/venue-suitability` (optionally `?venueId=`) returns every catalogue venue's result, suitable first, plus the catalogue's facilities and accessibility features. Only the assigned Coordinator, Under Review or Planning: another Coordinator gets 404, other roles 403, another status 409. `GET /api/requests/:id` adds `canCheckVenueSuitability`. `createApp`'s `getVenueDb` now also reaches the event-request routes.
      - **Requirements:** `venue.requiredFacilities` and `venue.requiredAccessibilityFeatures` on the event, chosen by the Coordinator from catalogue values and saved through `PATCH /api/requests/:id`, which validates them (`validateVenueRequirements.js`, 400 for anything but a list of text). They are ordinary fields, recorded in the change history, and kept out of the page's Venue section form (`pageEditor: false` in `requestSections.js`).
      - **Page:** a "Venue suitability" card on the request page for the assigned Coordinator: requirement checkboxes, a prompt when the Organiser says accessibility is required, and each venue with its result and reasons.
    - **Decisions:** AC2 resolves the missing-facility block/warning question (unsuitable). A1 (requirements chosen by the Coordinator and stored on the event), B1 (operating hours read from the text) and C (Under Review and Planning) are team decisions of 15 Oct 2026, pending PO confirmation (effective-requirements.md §4.11).
    - **Gaps:**
      - Setup/turnaround and several venues per event are SPM-76.
      - Nothing stops an Organiser setting the requirement fields through the API at Draft or Returned (section-level permissions); the page does not offer it.
      - No E2E test of the card yet. The E2E double now seeds venues (SPM-16), so one can be added.
      - SPM-14 has its own capacity warning (`capacityWarning` in `shared/venueBooking.js`), so the booking page and the suitability card word capacity overflow differently.
    - **Evidence:**
      - `tests/spm-13/unit/venueSuitability.test.js`
      - `tests/spm-13/unit/operatingHours.test.js`
      - `tests/spm-13/integration/venueSuitabilityApi.test.js`
      - `tests/spm-13/integration/venueSuitabilityPage.test.jsx`
    - **Local verification (macOS, Node 24.1.0, 16 Oct 2026, on top of `main` at `b35c0f3` with SPM-14/53, SPM-16 and SPM-37):** lint passed; `test:spm13` 54 Vitest passed; 128 Node and 99 frontend tests passed; root Vitest 1418 passed (35 opt-in live and emulator tests skipped); Playwright Chromium 69/69 passed; the production build passed. The Firestore emulator suite (`test:spm14:emulator`) was not run. Two page tests first failed in a full root run because they ticked options before the check had loaded; they now wait for it.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.

29. **SPM-17 Coordinator records and submits equipment requirements (17 Oct 2026, branch `feature/SPM-17-equipment-requests`):**
    - **Built:**
      - **Rules:** `shared/equipmentRequest.js` validates a request: 1–50 items, each an SPM-37 equipment type, a whole-number quantity of 1 or more and optional technical requirements (500 characters). Each type appears once. Errors are keyed by field (`items.1.quantity`), and only `items` and `submissionKey` may be sent. It also holds `canRequestEquipment` (assigned Coordinator, Planning), `canReadEquipmentRequest` (assigned Coordinator, or the request's Technical Support assignee) and the Technical Support Staff reuse order.
      - **Staff chooser:** `shared/staffAssignment.js` `chooseStaff(users, role, pendingAssigneeUids, lastUid)`, SPM-14's rule with the role as a parameter. SPM-14's `chooseVenueStaff` is now a wrapper around it, with the same results and its tests unchanged.
      - **API:** `GET`/`POST /api/requests/:id/equipment-requests` (`backend/src/services/equipmentRequestService.js`). One transaction checks the submission reference, Planning, no other Pending Review request, the event period and every equipment type. It assigns Technical Support Staff (reuse order, else `chooseStaff` with `systemLocks/technicalStaffAssignment`) and writes the request (Pending Review, period snapshot, `replacesId` set by the server after a rejection), the event's `assignedStaffUids` and an `equipment_requested` activity entry. Codes: 201, 400 with field errors, 403 for a user without the Coordinator role, 404 for an unassigned Coordinator or an unreadable list, 409 for a status or state refusal.
      - **Closing:** event reject, cancel and approved cancellation close Pending Review requests in the status transaction (`prepareEquipmentRequestClose`).
      - **Page:** an "Equipment requests" card on the request page. The Coordinator gets a form (type, quantity, optional technical requirements; add and remove rows) beside the Organiser's free-text needs. Errors are shown per row and the entered values and retry key are kept. Technical Support Staff get the list read-only; anyone the API refuses sees nothing. A load failure is a plain note with Try again, not an alert, so the page's own alerts stay unique.
      - **Seed:** three equipment types with 2–3 Available units each, and on `seed-req-a1-planning` a rejected request replaced by a Pending Review request assigned to `seed-technical-staff`.
    - **Changed outside SPM-17 (SPM-14-adjacent):**
      - `backend/src/services/statusTransitionService.js`: on reject, cancel and approved cancellation, `prepareVenueHoldRelease` and `prepareEquipmentRequestClose` both read first, then both write. Before, the hold release wrote straight after its reads, so no later read was possible in that transaction. Hold release behaviour is unchanged (SPM-14 tests pass), and an SPM-17 test fails if the old order is restored.
      - `shared/venueBooking.js`: `chooseVenueStaff` delegates to `chooseStaff`.
      - `AGENTS.md` §6: the `/api/requests` row lists `/:id/venue-bookings` and `/:id/equipment-requests`.
    - **Decisions:** team decisions of 17 Oct 2026, pending PO confirmation, including the reuse order (effective-requirements.md §4.15).
    - **Gaps:**
      - No review, reservation or rejection (SPM-56 / SPM-62 / SPM-36); Reserved and Rejected exist only in fixtures and seed data. No Technical Support queue.
      - The period is a snapshot; a later date change does not update it. Availability is not checked (SPM-18).
      - The equipment request status and `arrangementApprovals.technical` may both hold the technical decision once SPM-56 exists.
      - No E2E test; no live or emulator run.
    - **Evidence:**
      - `tests/spm-17/unit/equipmentRequest.test.js`
      - `tests/spm-17/unit/staffAssignment.test.js`
      - `tests/spm-17/unit/seedEquipmentRequests.test.js`
      - `tests/spm-17/integration/equipmentRequestService.test.js`
      - `tests/spm-17/integration/equipmentRequestApi.test.js`
      - `tests/spm-17/integration/equipmentRequestsPage.test.jsx`
    - **Local verification (macOS, 17 Oct 2026, on top of `main` at `5ea4277`):**
      - Lint passed. `test:spm17`: 76 passed.
      - Vitest suites: SPM-14 28 passed (4 emulator tests skipped), SPM-53 12, SPM-9 18, SPM-63 34, SPM-47 35, SPM-45 26, SPM-37 40, SPM-42 76 passed (23 live tests skipped).
      - Root Vitest 1494 passed, 35 opt-in live and emulator tests skipped. 128 Node and 99 frontend tests passed.
      - Playwright Chromium 69/69 passed. The production build passed with the existing bundle-size warning.
      - Seed dry run against `connectsphere-6546c`: 18 venue, availability and equipment documents to create, no blockers, nothing written.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.

30. **SPM-75 search venues using setup, turnaround and hold expiry (17 Oct 2026, branch `spm-75`):**
    - **Built:** `GET /api/venues` with `availableFrom`/`availableTo` now keeps a venue only when `venueAvailableFor` (`shared/venueSearch.js`) finds no conflict. That helper calls SPM-16's `findVenueConflict` with the searched period as the candidate, so setup and turnaround count on both sides, maintenance blocks use their own times, and expired tentative holds (`isExpiredHold`) no longer block. `listVenues` reads each venue's full record for its setup and turnaround; the response shape is unchanged. The catalogue page's search text says so.
    - **Decision:** the searched venue's own setup and turnaround apply to the searched period, so search agrees with SPM-16/SPM-14 booking checks; team decision of 17 Oct 2026, pending PO confirmation (effective-requirements.md §4.10).
    - **Not changed:** the availability calendar (SPM-73 for setup/turnaround, SPM-78 for expired holds). SPM-13's suitability check still compares the event's own times (SPM-76).
    - **To agree:** SPM-78 (In Progress, Sprint 3) has an AC4 that also covers expired holds in venue search; with SPM-75 merged, SPM-78 needs only the calendar half.
    - **Evidence:**
      - `tests/spm-75/unit/venueAvailableFor.test.js`
      - `tests/spm-75/integration/venueSearchBuffersApi.test.js`
    - **Local verification (macOS, Node 24.1.0, 17 Oct 2026, on `main` at `41b6a5a`):** lint passed; `test:spm75` 14 Vitest passed; the venue suites (SPM-11, 12, 13, 14, 16, 30, 49, 72) passed; 128 Node and 99 frontend tests passed; root Vitest 1508 passed (35 opt-in live and emulator tests skipped); Playwright Chromium 69/69 passed; the production build passed. The backlog ACs were re-read from the sheet on 17 Oct 2026 and are unchanged since 15 Oct.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.
31. **SPM-73 show setup and turnaround on the availability calendar (17 Oct 2026, branch `spm-73`):**
    - **Built:** `shared/venueCalendar.js` (`buildVenueCalendar`) replaces `buildAvailabilityResponse`, which moved out of `shared/venueAvailability.js` with its gap-filling helper (`venueOccupancy.js` already imports that module). Each confirmed booking and tentative hold gets a `setup` slot before it and a `turnaround` slot after it, sized from the venue's SPM-72 times and naming the booking (`commitmentId`, `commitmentStatus`, `title`). Commitments are read wider than the period by the venue's times, then every slot is cut to the period. Maintenance blocks get neither. `GET /api/venues/:id/availability` also returns the venue's `buffers`. The calendar page labels the new slots "Setup"/"Turnaround" ("Before …"/"After …" the booking), adds them to the legend with a dashed, striped style, and states the venue's times.
    - **Unchanged:** a venue with no setup or turnaround gets exactly the SPM-11 calendar; the SPM-11, SPM-30 and SPM-16 tests pass without changes. Expired holds are still shown (SPM-78).
    - **Evidence:**
      - `tests/spm-73/unit/venueCalendar.test.js`
      - `tests/spm-73/integration/venueCalendarApi.test.js`
      - `tests/spm-73/integration/venueCalendarPage.test.jsx`
      - `tests/spm-73/e2e/spm73.calendarBuffers.spec.js` (the seeded hall, setup 30 and turnaround 45)
    - **Local verification (macOS, Node 24.1.0, 17 Oct 2026, on `main` at `ebde1b3`, with SPM-75):** lint passed; `test:spm73` 15 Vitest + 1 Playwright passed, with the SPM-11, 12, 16, 30 and 75 suites; 128 Node and 99 frontend tests passed; root Vitest 1523 passed (35 opt-in live and emulator tests skipped); Playwright Chromium 70/70 passed; the production build passed.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check outside Playwright. `firestore.rules` is unchanged, and no backlog status change is claimed.

32. **SPM-18 check equipment availability for an event (17 Oct 2026, branch `feature/spm-18`):**
    - **Built:**
      - **Rules:** `shared/equipmentAvailabilityCheck.js`. Each requested type in an SPM-17 equipment request is checked separately against its Available units (SPM-37). The result gives the available and requested quantity, any shortfall, and `fulfillable`, which is true only if every type has enough units.
      - **Period:** the request's `requiredPeriod` (the event's date, start time and duration). Transit time is zero.
      - **API:** `GET /api/requests/:id/equipment-requests/:requestId/availability` (`backend/src/services/equipmentAvailabilityService.js`), read-only. Codes: 200; 400 for a stored quantity below 1; 403 for a user without the Technical Support role; 404 for a missing request, a request from another event, or Technical Support Staff not assigned to it; 409 for a Closed or Rejected request.
      - **Page:** on the request page's Equipment requests card, a "Check availability" button on each Pending Review or Reserved request, for the Technical Support role. It shows "Can be fulfilled" or "Shortfall", each type's counts, and any technical requirements for the staff member to judge.
    - **Decisions:** assigned-staff-only checking and the checkable statuses are team decisions of 17 Oct 2026, pending PO confirmation (effective-requirements.md §4.16).
    - **Unresolved:** "Only Technical Support Staff can check" conflicts with SPM-37's Coordinator read-only view of `/api/equipment`, which is unchanged. This is for the PO to decide.
    - **Blocked:**
      - Subtracting units reserved for overlapping events, and not subtracting the event's own reservations on a re-check: no equipment reservations exist (SPM-57, SPM-62).
      - Matching units to technical requirements: requirements are free text and units have no technical attributes. Units are matched by type only.
      - SPM-18 is not Done until these are built or the PO agrees to defer them.
    - **Evidence:**
      - `tests/spm-18/unit/equipmentAvailabilityCheck.test.js`
      - `tests/spm-18/integration/equipmentAvailabilityApi.test.js` (requests created through SPM-17's real POST route)
      - `tests/spm-18/integration/availabilityCheckPage.test.jsx`
      - `tests/spm-18/e2e/spm18.equipmentAvailability.spec.js` (SPM-37 units, an SPM-17 request on A1 planning, a shortfall, then a repair and re-check)
    - **Local verification (Windows, 17 Oct 2026):** lint passed; `test:spm18`: 26 Vitest and 1 Playwright passed; 128 Node and 99 frontend tests passed; root Vitest 1534 passed (35 opt-in live and emulator tests skipped); the production build passed with the existing bundle-size warning; Playwright Chromium passed all 70 tests.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.

33. **SPM-56 Technical Support Staff review and approve an equipment request (17 Oct 2026, branch `feature/SPM-56-approve-equipment`):**
    - **Built:**
      - **Status and summary:** `approved` added between Pending Review and Reserved. The event carries `currentEquipmentRequest: { id, status }`, written by SPM-17's submit and close and by approval. Only the Coordinator receives it (`projectRequest` passes extra metadata only to internal-section viewers).
      - **Rules:** `equipmentDecision` / `equipmentRequestActions` in `shared/equipmentRequest.js`: the request's assignee, also on the event's `assignedStaffUids`, a Pending Review request, the event at Planning. Re-confirm needs an Approved request with no approved technical sign-off. `technicalArrangementRequired` also counts a current request; `canDecideArrangement` refuses the manual technical decision while one exists (`equipment_request_decides`).
      - **API:** `POST /api/requests/:id/equipment-requests/:requestId/actions` with `approve` or `reconfirm_approval`. One transaction reads the event, the request and the units, re-runs SPM-18's `checkRequestAvailability` (refusing with 409 and the per-item shortfall), then writes the request status, `arrangementApprovals.technical`, the summary, `equipment_request_approved` (or `…_reconfirmed`) and `arrangement_decided` activity entries, and the Coordinator's notice. Codes: 200; 400 unknown action; 403 without the Technical Support role; 404 for another member, a removed assignee or a missing request; 409 for status, event state or a shortfall.
      - **Queue:** `GET /api/equipment/requests/assigned` (Technical Support only): the member's requests, Pending Review first, oldest first, trimmed. Page `/equipment/requests` with a navbar link; each card links to the event's Equipment requests card.
      - **Card:** for the assignee who may act, the availability check runs on load, and Approve (or Re-confirm) is enabled only when it can be fulfilled. A server shortfall replaces the result. The Coordinator sees "Approved by" with name and time. The action area is where SPM-36's Reject goes.
      - **Seed:** B1's Planning event has a short Pending Review request (3 PA speaker sets against 2 units) with its summary. A1's existing request is fulfillable; A1 is left without a summary on purpose (below).
    - **Changed in SPM-17 / SPM-18 behaviour (decided 17 Oct 2026):** a new request is refused while one is Approved; a new request clears a technical sign-off left from an earlier request; event rejection or cancellation also closes Approved requests and sets the summary to Closed; SPM-18's checkable statuses include Approved; SPM-18's unit loading moved to `loadUnitsByType` in `equipmentService.js` (route responses unchanged).
    - **Existing tests changed (expected effects, not regressions):**
      - `tests/spm-17/integration/equipmentRequestService.test.js` (3 assertions) and `tests/spm-17/integration/equipmentRequestApi.test.js` (1): listed requests now carry `actions`.
      - `tests/spm-17/unit/seedEquipmentRequests.test.js`: "one Pending Review request in the seed" became "at most one per event", because B1 now has one too.
      - `tests/spm-18/unit/equipmentAvailabilityCheck.test.js`: the checkable statuses include Approved.
      - `tests/spm-18/e2e/spm18.equipmentAvailability.spec.js`: the two "Check availability" clicks were removed, because the check now runs on load for the assignee (AC2); every assertion is kept.
    - **Seed choice:** giving A1's Planning event a summary made SPM-9's and SPM-10's manual technical sign-off tests on A1 fail with 409, as the new rule intends. A1 is left without a summary instead, so those tests are unchanged; its request behaves as one made before SPM-56.
    - **Decisions:** team decisions of 17 Oct 2026, pending PO confirmation (effective-requirements.md §4.15, §4.16), including why a new request clears the technical sign-off (it has not been reviewed; not the CL3 G8!C51 automatic reset).
    - **Gaps:** no units are reserved (SPM-62); equipment preparation unlocks on approval, before reservation (SPM-62 / SPM-88); Re-confirm is temporary until SPM-87; reject is SPM-36; activity entries other than field changes are not displayed; requests made before SPM-56 have no summary until approved, closed or replaced.
    - **Evidence:**
      - `tests/spm-56/unit/equipmentApproval.test.js`
      - `tests/spm-56/unit/seedEquipmentApproval.test.js`
      - `tests/spm-56/integration/equipmentApprovalService.test.js` (including SPM-10's reset through the real PATCH route on the E2E double's store)
      - `tests/spm-56/integration/equipmentApprovalApi.test.js`
      - `tests/spm-56/integration/equipmentApprovalPages.test.jsx`
    - **Local verification (macOS, 17 Oct 2026, on top of `main` at `e3b0aa3`):**
      - Lint passed. `test:spm56`: 51 passed.
      - Vitest suites: SPM-17 76, SPM-18 26, SPM-9 18, SPM-10 147, SPM-48 96, SPM-14 28 passed (4 emulator tests skipped).
      - Root Vitest 1600 passed, 35 opt-in live and emulator tests skipped. 128 Node and 99 frontend tests passed.
      - Playwright Chromium 71/71 passed, after the SPM-18 spec change above. The production build passed with the existing bundle-size warning.
      - Seed dry run against `connectsphere-6546c`: no blockers, nothing written.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.

## SPM-34 venue booking rejection — 18 October 2026

- The assigned Venue Staff member can reject one pending booking while its event is in Planning. The API requires a reason and accepts an optional free-text suggested alternative. The booking decision, release of its tentative hold, activity entry, cleared legacy venue sign-off and in-app notice to the current assigned Coordinator are written together in one transaction. Other bookings on the event are unchanged.
- The assigned Coordinator sees the rejection details beside the booking and receives a notice linking to it. A replacement request may use a rejected booking whose hold has already been released. Venue approval remains SPM-54; the full all-required-venues confirmation gate and per-venue sign-off remain SPM-54/SPM-81 work.
- `docs/evidence/spm-34-traceability.md` maps the six backlog criteria to implementation and automated checks. `docs/testing/spm-34-manual-testing.md` is the pending human acceptance checklist. The untracked operational workbook still says **In Progress**; no Done or Sprint change is claimed.
- Local verification: `npm test` passed 128 Node tests, 100 frontend tests, 1,611 root Vitest tests (35 opt-in live/emulator tests skipped), and 88 Chromium browser tests. The final SPM-34 rerun passed 13 Vitest tests and one Chromium test after two additional service cases and a UI state adjustment. Targeted SPM-14/SPM-53 regressions, lint and production build passed; the build retained its existing bundle-size warning. HTTP tests use mocked token verification with in-memory persistence; Playwright uses a Firebase double. No Firebase emulator, live project, human manual acceptance, or rules deployment is claimed. `firestore.rules` was not edited.

## SPM-54 venue booking approval — 18 October 2026

- **Implemented locally:** assigned Venue Staff can approve a pending booking while the event is in Planning. The existing booking action API rechecks current attendance, required facilities and the booking's buffered interval; only its verified own hold is excluded from conflicts. Approval converts that same hold to a confirmed reservation and saves the approval, activity and Coordinator notification in one transaction. Expired holds have no priority; removed or mismatched holds are refused.
- **UI and availability:** booking details include confirmation, approval time, saved status and stale-decision reload. Approved bookings leave the pending queue, appear as confirmed on the calendar and are excluded from overlapping availability searches. Each booking remains independent; approving it does not confirm the event or set its legacy venue sign-off.
- **Lifecycle integration:** whole-event rejection, direct cancellation and approved Organiser cancellation release confirmed reservations as well as tentative holds. Cancellation requests, returns and refusals release nothing. Significant edits preserve the booking's approval and original reserved interval.
- **Verified:** SPM-54 has 43 passing unit/service/API/component tests, three passing browser tests and four passing isolated Firestore emulator concurrency tests. Full `npm test`: 128 Node, 100 frontend, 1,656 root Vitest and 91 Chromium tests passed (39 opt-in live/emulator cases skipped in the normal root run). Lint and production build passed, with the existing bundle-size warning. The mobile approval screenshot was visually inspected. No live Firebase, human acceptance or rules deployment is claimed; rules were not edited.
- **Progress:** remains **In Progress, Sprint 3**, not Done. Human acceptance and independent peer review remain outstanding. Preparation integration (SPM-67/88, SPM-48/89), required-venue readiness/per-venue attendance (SPM-79/81) and Coordinator-controlled reapproval (SPM-87) remain separate dependencies. Existing maintenance-write concurrency risk remains documented.
- **Evidence:** `docs/evidence/spm-54-traceability.md`; human acceptance and implementation checklist: `docs/testing/spm-54-manual-testing.md`. Delivery is local only by user instruction: no commit, push or pull request.

## SPM-54 warning preview and replacement corrections — 18 October 2026

- Pending booking GET now returns read-only suitability problems/warnings using current event/venue data and the booking interval. Staff see warnings before approval; confirmation refreshes them, blocks on problems and offers Retry on failure. Saved approval warnings are explicitly historical. The approval transaction still rechecks all conditions.
- Starting a pending/rejected replacement fetches the current event's layout/accessibility defaults; venue, interval and special requests remain for review. Requirements stay editable and survive failed submission; the original booking remains historical.
- Verification: final SPM-54/SPM-14/SPM-34 targeted run passed 93 tests (eight emulator cases skipped). Full `npm test` passed 128 Node, 100 frontend, 1,664 root Vitest (39 opt-in cases skipped) and 92 Chromium tests. One additional replacement-refresh failure component case was added afterward and passed in the final targeted run. Final lint/build passed, retaining the existing bundle-size warning.
- Manual checks M1/M2/M8 were updated; M16–M18 cover corrected replacement text, preserved history/notes and refresh failure. Human results remain Not run. In-memory API and Firebase-double browser tests are not live Firebase evidence; emulator was not rerun for this correction. Story stays In Progress with existing dependency and peer-review gaps. All changes remain local.

## Booking-form requirement overrides — later correction, 18 October 2026

The previous correction covered changing the event before replacement but missed changing only the booking form. `venueBookingSuitability` now uses the submitted booking requirements for layout review in both pending GET and transactional approval. Current event attendance and structured facilities/accessibility still apply. Unmatched free text explicitly asks staff to review the requested layout/additional instructions; it is not parsed as structured facilities or accessibility. Existing records without requirements retain the legacy event-layout fallback. Historical booking and approved-warning snapshots are not rewritten.

Regression evidence: unit tests cover case-insensitive classroom matching against an unchanged Breakkout Room event and free-text review; service tests cover rejected replacement, preview, approval and preservation of event/history; the new browser case edits only the replacement form and checks pending, confirmation and reloaded approval. Manual check M19 covers the reported flow and remains Not run.

Verification: `npm run test:spm54` passed 54 unit/service/API/component tests and five Chromium tests; four opt-in emulator cases skipped. Lint, production build and whitespace checks passed (existing bundle-size warning). API tests use in-memory persistence and browser tests use the Firebase double. Full regression results above precede this follow-up; the full suite, emulator and live project were not rerun for this narrowly scoped helper change. No deployment or Git publication. SPM-54 remains In Progress; human acceptance, peer review and dependent workflows remain outstanding.

## Event request and venue booking page tabs — 18 October 2026

- The event detail page now groups its existing content into Event Status, Venue Details, Equipment Required and Change Log tabs. Conditional coordinator, arrangement and status notices follow the named Event Status sections. Venue suitability moved to Recommendations on the event's venue booking page, beside Submit a Request and Requests. Request summaries show the venue and recorded status before expansion.
- The venue request form shows read-only event start/end values and searches for venues available in that period. The submission API rejects a different period before writing a new booking; replacement may still select its own pending hold. This is a later user-directed implementation rule; previously submitted booking periods are unchanged.
- Verification: lint and production build passed (existing bundle-size warning); 128 Node, 101 frontend and 1,669 root Vitest tests passed (39 opt-in cases skipped). The full Chromium run passed 91 of 93 tests; two tab-related test expectations were corrected and the affected suite then passed 10 of 10. After the final venue tab-panel adjustment, 25 venue Chromium regressions passed. API tests use in-memory persistence and browser tests use a Firebase double. No live Firebase or human acceptance was run, and no Firestore rules were edited or deployed. Operational backlog/Sprint status was not changed.

## SPM-36 equipment request rejection and walkthrough fixes — 18 October 2026

Branch `feature/SPM-36-reject-equipment`, four commits:

- **SPM-36 built:**
  - **Action:** `reject` on `POST /api/requests/:id/equipment-requests/:requestId/actions`, with `reason` (required, 1–1000 characters) and `suggestedAlternative` (optional, up to 1000). Same permission checks as approval (403 / 404 / 409), then field errors (400, nothing written).
  - **Writes, in one transaction:** the request Rejected with who, when, reason and alternative; `arrangementApprovals.technical` rejected; the event summary Rejected; `equipment_request_rejected` and `arrangement_decided` activity entries; a notice to the assigned Coordinator with the reason. The event stays in Planning; nothing is reserved; no availability check is run or recorded.
  - **After a rejection:** Confirm stays blocked and the manual technical sign-off stays refused until a revised request is approved. A revised request replaces the rejected one (`replacesId`), clears its sign-off and goes to the same Technical Support member (SPM-17 / SPM-56 rules, now tested for a rejection).
  - **Page:** **Reject request** beside Approve (not gated on fulfilment) opens **Reason for rejection (required)**, prefilled from a shortfall (`shortfallSummary`), and **Suggested alternative (optional)**, with **Confirm rejection** / **Cancel**. The Coordinator sees **Rejected by**, the reason and alternative, and a form headed **Submit a revised request**. The queue groups requests under **Waiting for review** and **Reviewed**.
  - **Organisers** see no equipment request, but the existing SPM-9 summary shows them "Technical arrangement: Rejected", without a reason.
- **Fix A:** the SPM-16 conflict message names the occupied period in Singapore time ("on Fri 20 Nov 2026, 08:30–13:45 SGT", both dates across midnight) and the 409 message ends with a full stop. The structured `conflict` keeps ISO values.
- **Fix B:** `seed-req-a1-confirmed-past` (organiser-a1, Seed Coordinator, 1 Oct 2026, both sign-offs approved, no venue entries) so **Mark as completed** can be demonstrated. Seed Coordinator's workload is now 5 (coordinator-3 is still next).
- **Fix C:** `docs/testing/end-to-end-walkthrough.md`, updated for the conflict wording, the rejection path and the past event.
- **Existing tests changed:**
  - `tests/spm-56/unit/equipmentApproval.test.js`, `tests/spm-56/unit/seedEquipmentApproval.test.js`, `tests/spm-17/integration/equipmentRequestService.test.js`: the assignee's actions on a Pending Review request are now `['approve', 'reject']`.
  - `tests/spm-56/unit/equipmentApproval.test.js`, `tests/spm-56/integration/equipmentApprovalService.test.js`, `tests/spm-56/integration/equipmentApprovalApi.test.js`: the unknown action is now `'not_an_action'` (was `'reject'`).
  - `tests/spm-56/integration/equipmentApprovalPages.test.jsx`: queue event titles are read at heading level 3 under the new groups.
  - `tests/spm-16/integration/tentativeHoldConflicts.test.js`: the new conflict wording (fix A).
  - `backend/scripts/seedData.test.js`: workloads 5, 2 and 1 (fix B).
  - No Playwright spec needed a change.
- **Evidence:** `tests/spm-36/` (unit, service, API and page tests); the new fix A case in `tests/spm-16/integration/tentativeHoldConflicts.test.js`; `tests/spm-27/unit/seedPastConfirmedEvent.test.js`.
- **Local verification (macOS, 18 Oct 2026, on top of `main` at `01e0f8b`):**
  - Lint passed. `test:spm36`: 30 passed.
  - Vitest suites: SPM-56 51, SPM-17 76, SPM-18 26, SPM-16 43 (1 live test skipped), SPM-14 28 (4 emulator tests skipped), SPM-9 18, SPM-10 147, SPM-48 96 passed.
  - Root Vitest 1635 passed, 35 opt-in live and emulator tests skipped. 128 Node and 99 frontend tests passed.
  - Playwright Chromium 87/87 passed. The production build passed with the existing bundle-size warning.
  - Seed dry run against `connectsphere-6546c`: `seed-req-a1-confirmed-past` to create, no blockers, nothing written.
- **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check (the walkthrough has not been run). `firestore.rules` is unchanged, and no backlog status change is claimed.

35. **SPM-62 reserve available equipment for an event, and SPM-57 reserved equipment is unavailable to overlapping events (18 Oct 2026, branch `feature/spm-62`):**
    - **Built (SPM-62):**
      - **Reserve:** `reserve` action on SPM-56's actions route, for the request's assignee, on an Approved request at Planning or Confirmed. One transaction reads a lock per equipment type (`systemLocks/equipmentReservation-{typeId}`), the units and overlapping reservations, re-runs the availability check, then writes:
        - one `equipmentReservations` record per type (type, quantity, event, period, unit ids, who and when);
        - the request as Reserved, with its reserved asset tags;
        - the event's `currentEquipmentRequest` summary and `reservedEquipment` (types and quantities only);
        - an `equipment_reserved` activity entry.
      - **Refusals:** a shortfall refuses the whole reservation (409 with the per-type result), and nothing is written.
      - **Unit choice:** the free Available units with the lowest asset tags (`chooseUnits`).
      - **Organiser:** `presentRequest` sends `reservedEquipment` (`reservedEquipmentSummary`, for anyone who may view the equipment section). "Your event arrangements" shows "Reserved: 2 × Projector" in place of the requested list, with no unit ids.
      - **Preparation:** `canUpdateEquipmentPreparation` now needs `reservedEquipment` instead of the technical sign-off. The new read-only reason is `equipment_not_reserved` ("Available once the equipment is reserved.").
      - **Release:** event rejection or cancellation releases the event's active reservations, closes a Reserved request, removes `reservedEquipment` and records `equipment_reservation_released` (`prepareReservationRelease`, called from `prepareEquipmentRequestClose`). A significant change does not release them.
      - **Page:** "Reserve equipment" beside Approve on the Equipment requests card; "Reserved by" and "Reserved units" for the Coordinator and assignee.
      - **Seed:** A1 Confirmed has a Reserved request for one projector, its active reservation and `reservedEquipment`. Like A1 Planning, it has no `currentEquipmentRequest` summary, so the SPM-9 and SPM-10 manual sign-off demonstrations are unchanged.
    - **Built (SPM-57):**
      - `periodsOverlap` (strict, so back-to-back periods do not overlap; no venue buffers) and `reservedUnitIds` (active reservations of other events that are not Rejected, Cancelled or Completed) in `shared/equipmentReservation.js`, loaded by `loadReservedUnitIds`.
      - Used by the SPM-18 check (not subtracting the event's own reservations), SPM-56 approval, reserving, and `/api/equipment` with a period. The last now returns `reservedUnits`, and the equipment page shows "N reserved for overlapping events".
      - `loadUnitsByType` now returns each unit's `id`.
    - **Decisions:** automatic unit choice, reserving at Planning or Confirmed, release on whole-event rejection or cancellation, and no equipment preparation without a reservation are team decisions of 18 Oct 2026, pending PO confirmation (effective-requirements.md §4.17).
    - **Held:** re-confirming the equipment arrangement after a significant change conflicts with CL3 row 51 and is held until SPM-87. Until then, a Reserved event whose technical sign-off is cleared by a significant change cannot be confirmed again: Re-confirm only works on Approved requests, and the manual sign-off is refused while a current request exists.
    - **Gaps:**
      - A new request while one is Reserved is accepted (SPM-17's tests cover it) and does not release the earlier reservation.
      - A reserved unit that breaks is not flagged (SPM-37 AC5).
      - Reservation and release history is not displayed, and the Coordinator is not notified.
      - The per-type lock is not verified under real concurrency.
      - Technical requirements are still not matched (SPM-18).
    - **Existing tests changed (expected effects, not regressions):**
      - `tests/spm-56/unit/equipmentApproval.test.js`, `tests/spm-56/integration/equipmentApprovalService.test.js` and `tests/spm-36/unit/equipmentRejection.test.js`: an Approved request's actions now include `reserve`.
      - `tests/spm-48/unit/preparation.test.js`, `tests/spm-48/integration/preparationApi.test.js` and `tests/spm-48/e2e/spm48.preparation.spec.js`: equipment preparation now needs a reservation; the reason is `equipment_not_reserved` ("Available once the equipment is reserved."). The venue-only copy of A1 Confirmed has nothing reserved.
      - `tests/spm-28/unit/changeHistory.test.js` and `tests/spm-42/unit/permissions.test.js`: fixtures that edit equipment preparation now carry `reservedEquipment`.
      - `tests/spm-37/unit/equipmentAvailability.test.js`: the summary has `reservedUnits`.
    - **Evidence:**
      - `tests/spm-57/unit/reservedOverlap.test.js`
      - `tests/spm-62/unit/equipmentReservation.test.js`
      - `tests/spm-62/integration/equipmentReservationApi.test.js` (SPM-62 and SPM-57 through the real routes)
      - `tests/spm-62/integration/equipmentReservationPages.test.jsx`
      - `tests/spm-62/e2e/spm62.equipmentReservation.spec.js`
    - **Merged with SPM-36 (18 Oct 2026):** Reject and Reserve sit side by side in the action list (`approve`, `reject`, `reconfirm_approval`, `reserve`), the presented request fields and the page. SPM-36's past Confirmed seed event is kept beside A1 Confirmed's reservation.
    - **Merged with SPM-34 / SPM-54 (18 Oct 2026):** the request page now uses tabs. The Organiser's arrangements card (with `reservedEquipment`) stays on Event Status; the Equipment requests card, with Reserve, is on Equipment Required. SPM-62's page and E2E tests open that tab. SPM-53's tests pass unchanged.
    - **Local verification (Windows, 18 Oct 2026, on top of `main` at `858ea60`):**
      - Lint passed. 128 Node and 101 frontend tests passed. The production build passed with the existing bundle-size warning.
      - Root Vitest 1740 passed, 39 opt-in live and emulator tests skipped. On the first full run, `tests/spm-18/integration/availabilityCheckPage.test.jsx` failed once. It passed 3/3 on its own and in the full rerun, so it appears timing-sensitive under load.
      - Playwright Chromium 94/94 passed, including SPM-53's and SPM-62's specs.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. The seed was not run against the real project. `firestore.rules` is unchanged, and no backlog status change is claimed.

## SPM-78 tentative venue hold expiry — 19 October 2026

- New booking holds retain SPM-16's seven-day deadline. A booking is effectively Expired at that instant, including in API capabilities and the Venue Staff queue; approval at or after expiry is refused. The calendar omits the hold and its setup/turnaround slots, matching venue search and conflict checks. An expired request stays in event history and can be replaced while the event remains in Planning.
- `backend/src/services/venueHoldExpiryService.js` records expiry, releases only the matching venue hold, writes activity, and sends the current Coordinator an in-app notice. It warns once at the 24-hour threshold. It is safe to retry or overlap hourly runs, and skips the warning if the first run is already past expiry. The task does not move the event or release equipment. An isolated Firestore emulator test covers concurrent runs and approval at expiry.
- The command `npm run process:venue-holds --prefix backend` is wired to `.github/workflows/venue-hold-expiry.yml` at the top of each hour. **Operational gap:** repository secrets and a successful default-branch run have not been verified; there is no deployed-scheduler or live-project claim. Delayed GitHub scheduling can delay notices beyond an hour.
- `npm run backfill:venue-holds --prefix backend` is dry-run by default; `-- --write` fills missing deadlines where creation time or the linked booking's deadline is known. It lists mismatches and records with no usable time for review. No live backfill was run. The untracked backlog workbook remains In Progress for Sprint 3; manual acceptance is pending. See `docs/evidence/spm-78-traceability.md` and `docs/testing/spm-78-manual-testing.md`.

36. **SPM-58 view which event each equipment reservation is for, and prevent double-booking (19 Oct 2026, branch `feature/spm-58`):**
    - **Built:**
      - **Reservations list:** `GET /api/equipment/reservations` (Technical Support Staff; `?status=active|released`, else 400) returns the reservations of events in the member's scope, active first. Each has the event name and status, date and start/end time, type, quantity, asset tags, status, who reserved it and when, and the release time and reason.
      - **Page:** `/equipment/reservations` ("Equipment reservations"), with an Active/Released filter and a link to each event. It is reached from "View reservations" on the Equipment page, not the navbar.
      - **Units:** `GET /api/equipment/:id` gives each unit `reservations` (active, and the event not Rejected, Cancelled or Completed), naming the event only when the viewer may see it. The equipment type page shows "Reserved for <event>, <date and time>", "Reserved for another event", or "Not reserved".
      - **Event:** a "Reserved equipment" card under the equipment section on the Equipment Required tab, from the existing `reservedEquipment` response field.
      - **Double-booking:** the overlap check and per-type lock are SPM-62's. `tests/spm-58/integration/equipmentReservation.emulator.test.js` checks them on a real Firestore emulator. It runs in CI as a new step beside SPM-14's (`.github/workflows/ci.yml`, `npm run test:spm58:emulator`, same `firebase.spm14.json` configuration).
    - **Decisions:** scope-limited viewing, "another event" on units, and no navbar entry are team decisions of 19 Oct 2026, pending PO confirmation (effective-requirements.md §4.17).
    - **Gaps:** the reservation record stores no event name; the event's current title is read when the reservations are viewed. Only Technical Support Staff reach the list. The SPM-62 gaps remain.
    - **Shared files changed:** `.github/workflows/ci.yml` (a new emulator step and its artifact upload; existing steps unchanged); `frontend/src/pages/EquipmentPage.jsx` and `EquipmentDetailPage.jsx` (SPM-37); `RequestDetailPage.jsx` (one card on the Equipment Required tab). No other story's tests were changed.
    - **Evidence:**
      - `tests/spm-58/integration/reservationViewApi.test.js`
      - `tests/spm-58/integration/reservationViewPages.test.jsx`
      - `tests/spm-58/integration/equipmentReservation.emulator.test.js` (Firestore emulator)
      - `tests/spm-58/e2e/spm58.reservationView.spec.js`
    - **Local verification (Windows, 19 Oct 2026, on top of `main` at `a5fe2e4`):**
      - Lint passed. 128 Node and 101 frontend tests passed. The production build passed with the existing bundle-size warning.
      - Root Vitest 1763 passed, 44 opt-in live and emulator tests skipped. On the first full run, `tests/spm-36/integration/equipmentRejectionPages.test.jsx` failed once. It is untouched by this change, passed 3/3 alone and in the full rerun, so it appears timing-sensitive under load.
      - Playwright Chromium 97/97 passed.
      - Firestore emulator (firebase-tools 15.34.0, local Java 21): `test:spm58:emulator` 3/3 passed.
    - **Not verified:** no live API run, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.

37. **SPM-38 release reserved equipment when an event is cancelled or rejected (20 Oct 2026, branch `feature/spm-38`):**
    - **Already built (SPM-62):** `reject`, `cancel` and `approve_cancellation` are the only paths to Rejected or Cancelled. Each releases the event's active reservations (`releasedAt`, `releasedReason`), closes the equipment request and removes `reservedEquipment`, in the status transaction.
    - **Built (SPM-38):** `RELEASE_REASON_LABELS` in `shared/equipmentReservation.js`. The Equipment reservations page shows "Released: <time> — Event cancelled" or "— Event rejected".
    - **Evidence, one test per criterion:**
      - `tests/spm-38/integration/reservationRelease.test.js`: reject, direct cancel and an approved cancellation request each release every reservation; another event's availability for the same period counts the released units; the record's status, time and reason; rejecting or replacing a venue booking leaves reservations active.
      - `tests/spm-38/integration/releasedReservationPage.test.jsx`
      - `tests/spm-38/e2e/spm38.releaseOnReject.spec.js`: reserve, reject the event, see Released / "Event rejected", and both units available again. On its first local run it timed out waiting for Rejected on a cold dev server. It now waits for each state, and passed 5/5 repeated runs.
    - **Gaps:** cancellation and rejection still do not notify Attendees (no registration). No event other than a whole-event transition releases reservations, by design.
    - **Local verification (Windows, 20 Oct 2026, on top of `main` at `9369591`):** lint passed; 128 Node and 101 frontend tests passed; root Vitest 1771 passed (44 opt-in skipped); the production build passed with the existing bundle-size warning; Playwright Chromium 98/98 passed.
    - **Not verified:** in-memory doubles only. No live API run, emulator, deployed project or manual browser check. `firestore.rules` is unchanged, and no backlog status change is claimed.

## Documentation Boundaries

- [`AGENTS.md`](AGENTS.md) governs repository work.
- Source records preserve chronology and must not be silently rewritten to match later decisions.
- `effective-requirements.md` is the current reconciled interpretation.
- The backlog and Sprint records control operational status and estimates.
- [`docs/evidence/presentation-evidence.md`](docs/evidence/presentation-evidence.md) tracks verified work, evidence locations, gaps, and candidate Week 11 slide content against the course rubric.
- [`docs/evidence/spm42-spm24-traceability.md`](docs/evidence/spm42-spm24-traceability.md) holds the SPM-42 permission matrix, the criterion-to-test mapping for SPM-42 and SPM-24, and their Definition of Done status.

## SPM-79 multiple venue requests — 21 October 2026

- **Implementation:** venue booking requests now carry their own interval, attendee count and venue need ID. A new request creates a need; a replacement retains it, and older replacement chains derive the same ID without migration. Capacity and event-window checks run before a booking or hold is written. The Coordinator form searches again when time or attendance changes.
- **Confirmation:** the current request for every need must be approved. The existing Confirm transaction reads booking readiness before changing status. The old `approve_venue` and `reject_venue` event actions are refused. Technical approval remains separate. This readiness helper is available for SPM-67; Send for Safety Check itself is not implemented here.
- **Status:** remains **In Progress, Sprint 3**. Human acceptance and SPM-67's safety handoff remain outstanding. The temporary SPM-48 venue-preparation gate still reads the legacy sign-off, so preparation access for newly booked events needs integration with SPM-67/88 before those stories can be accepted.
- **Local verification:** lint and production build passed; 128 Node, 101 frontend, 1,774 root Vitest, 99 Chromium and three isolated SPM-79 Firestore emulator tests passed. The build retains the existing bundle-size warning. Root API tests use in-memory persistence and browser tests use the Firebase double; no live-project or human acceptance is claimed.
- **Evidence:** `docs/evidence/spm-79-traceability.md`; human checklist `docs/testing/spm-79-manual-testing.md`. No live Firebase project, rules deployment, Git publication or deployment is claimed.

## SPM-80 separate requests in the Venue Staff queue — 21 October 2026

- Queue cards now show the event name and requested venue together, with each request's own start/end times and details link. The existing API returns one pending booking record per assigned request; approving or rejecting one does not remove another pending booking for the same event. Assignment scope, route and response shape are unchanged.
- **Status:** In Progress, Sprint 3. Human acceptance and independent peer review remain outstanding. SPM-81 decisions and SPM-77 booking management are separate stories.
- **Local verification:** targeted SPM-80/SPM-53 Vitest tests passed (10 tests) and two SPM-80 Chromium journeys passed. Full `npm test` passed 128 Node, 101 frontend, 1,779 root Vitest (47 opt-in cases skipped) and 101 Chromium tests. Lint and build passed; the build retains its large-chunk warning. API tests use mocked identity and in-memory persistence; browser tests use the local Firebase double. No live Firebase, emulator or human acceptance was tested.
- **Evidence:** `docs/evidence/spm-80-traceability.md`; manual checklist `docs/testing/spm-80-manual-testing.md`. No Firestore rules change/deployment, Git publication or deployment occurred.

## SPM-81 independent venue decisions — 21 October 2026

- Existing SPM-54 approval and SPM-34 rejection paths decide only the selected booking. SPM-81 adds explicit multi-venue checks and a narrow individual cancellation path on the existing booking action API. The assigned Coordinator cancels one current approved booking; only its confirmed reservation is released. The booking retains its Cancelled history and its venue need can be replaced.
- **Team decision approved for this increment:** cancelling an approved booking on a Confirmed event returns it to Planning with status history. The action is available before the event starts and while no whole-event cancellation request is open. The remaining venue bookings and equipment reservations stay intact. Confirm needs approval of the replacement venue need.
- **Scope:** this is the approved-booking cancellation path needed by SPM-81. Broader SPM-77 booking management, SPM-67 safety handoff, SPM-48/89 preparation integration, and human acceptance remain separate. SPM-81 stays **In Progress, Sprint 3** until all acceptance and Definition of Done checks are complete.
- **Evidence:** `docs/evidence/spm-81-traceability.md`; Dairu's manual checklist `docs/testing/spm-81-manual-testing.md`. No Firestore rules change or deployment, live Firebase verification, or Git publication is claimed.
- **Local verification:** lint, production build and whitespace checks passed; `npm test` passed 128 Node, 101 frontend, 1,788 root Vitest tests (49 opt-in cases skipped) and 102 Chromium browser tests. Two isolated SPM-81 Firestore emulator concurrency tests passed. HTTP tests use mocked identity and in-memory persistence; browser tests use the Firebase double. The existing build chunk-size warning remains. Human manual acceptance and live-project verification were not performed.
- A final missing-reservation guard and test were added after the full suite; `npm run test:spm81` passed 10 unit/service/API tests and its Chromium journey, and lint passed afterward. The full suite was not rerun for that guard.

## SPM-77 individual venue booking management — 22 October 2026

- The event Venue Details tab now shows one current booking per venue need for Coordinators and in-scope Organisers, with separate status, period, next step and expandable earlier attempts. The existing booking GET API supplies a limited customer-facing response to Organisers; action permissions remain unchanged.
- Approved-booking changes reuse SPM-81 cancellation followed by SPM-14 replacement. The selected venue need remains unresolved until its replacement is approved. Sibling venue bookings and equipment reservations remain intact; whole-event closure still releases active venue commitments.
- **Status:** In Progress, Sprint 3. SPM-74 is still To Do and must supply and verify the recorded affected-booking flag for post-approval venue unavailability before the final Organiser display criterion is Done. Human acceptance and independent peer review are pending.
- **Evidence:** `docs/evidence/spm-77-traceability.md`; manual checklist `docs/testing/spm-77-manual-testing.md`. Targeted SPM-77 Vitest passed 9 tests and its Chromium journey passed after the final small follow-ups. The earlier full local run passed 128 Node, 101 frontend, 1,797 root Vitest and 103 Chromium tests; SPM-79 and SPM-81 Firestore emulator suites passed 3 and 2 transaction tests. Lint and build passed with the existing large-chunk warning. No live-project verification, rules deployment, commit, push or PR is claimed.

## SPM-76 suitability with setup/turnaround, per venue — 22 October 2026

- **AC1 (setup and turnaround):** `checkVenueSuitability` (`shared/venueSuitability.js`) now compares the event's occupied period (start − setup to end + turnaround) with each other booking's or hold's occupied period, using SPM-16's `commitmentOccupiedPeriod` (exported from `shared/venueConflicts.js`); maintenance blocks keep their own times. A clash that exists only through setup or turnaround says which buffer causes it, for example "The venue needs 45 minutes of turnaround after it and 30 minutes of setup before the event, which overlap". A plain overlap keeps SPM-13's message. Expired holds and the event's own commitments are still ignored. SPM-14's approval-time suitability check calls the same function, so it sees buffers too.
- **AC2/AC3 (each venue separately):** `GET /api/event-requests/:id/venue-suitability` returns `eventVenues` beside the existing catalogue `venues`: the current venue request of each venue need that is Pending or Approved (SPM-79's `currentVenueBookingGroups`; rejected, cancelled, expired and replaced requests are left out), in the order requested, each with its own `result`, `problems`, `warnings` and request status. A requested venue missing from the catalogue is unsuitable and says so. The card shows "This event's venues" first, then "All catalogue venues".
- **Decision (team, 22 Oct 2026, pending PO confirmation):** the event's venues are its current venue requests; every venue is checked against the event's own date and time, as in SPM-13, not against the period typed on a request.
- **Status:** In Progress, Sprint 3. Human acceptance and independent peer review are pending.
- **Local verification:** lint passed; `npx vitest run` passed 1,818 tests (49 opt-in cases skipped), including 20 new SPM-76 unit, API and page tests; the Node and frontend suites passed; `npx playwright test` passed 104 Chromium tests, including the new SPM-76 journey (the Planning event with two requested venues, the hall suitable and the breakout room failing on capacity). API tests use mocked identity and in-memory persistence; browser tests use the Firebase double. The production build and live Firebase were not run. No commit, push or PR is claimed.

## SPM-61 notify the Organiser of status changes — 25 October 2026

- **Built:** when the assigned Coordinator approves, rejects, confirms or returns a request, the owning Organiser gets an in-app notice. The notice is written in the status-change transaction, through `statusChangeNotifications()` in `shared/notifications.js`, called from `transitionEventRequest`. A rejection carries its reason and stage, and a return carries the clarification message. Same-organisation colleagues, staff and Coordinators are not notified. A refused action writes nothing. On the Notifications page, a return links to "Edit request" and a confirmation links to "View arrangements", both on the event page.
- **Closes:** SPM-25's "the Organiser is notified" (item 15) and SPM-45's "the Organiser is not notified of a rejection" (item 19).
- **Criteria source:** checked against the workbook's SPM-61 row on 25 Oct 2026; every acceptance criterion is covered (`docs/evidence/spm-61-traceability.md`). The row's note "Return notification already delivered in SPM-25" is wrong and should be corrected in the workbook.
- **Status:** In Progress, Sprint 4. Human acceptance is pending.
- **Evidence:** `docs/evidence/spm-61-traceability.md`; `npm run test:spm61`. Local verification passed lint, the build, 128 Node tests, 101 frontend tests and the SPM-61 Vitest and Chromium tests.
- **Failures not caused by SPM-61:** five root Vitest tests (SPM-14, SPM-34, SPM-54, SPM-76) fail on `main` too, probably because of fixture dates. One SPM-58 Chromium test timed out in the full run and passed on rerun.
- **Not verified:** API tests use mocked identity and in-memory persistence, and browser tests use the Firebase double. There was no live-project check, and Firestore rules were neither edited nor deployed.

## SPM-66 / SPM-91 / SPM-92 safety review — 27 October 2026

- **Built:** a `safety_officer` role (SPM-66), provisioned in the seed only. The assigned Coordinator's **Submit for safety review** action (`submit_safety_review`) sends a Planning event whose venue bookings and technical arrangement are approved into the safety-review queue, shown as "Pending safety check" (SPM-91). A Safety Officer sees only queued events: core, venue and equipment, read-only; the booked venues' capacity, layouts, accessibility features and operating hours; and the change history of attendance and the venue and equipment fields. They record a six-item checklist and one outcome through `POST /api/requests/:id/safety-review` (SPM-92). Confirm and Start Preparation now require the recorded approval. The injected safety verifier is gone.
- **Rules:** `shared/safetyReview.js` and `shared/safetyReviewState.js`; summarised in AGENTS.md §6 "Safety review". The team decisions made for the open details are recorded in effective-requirements.md §4.6.1 (pending PO confirmation).
- **Other effects:** the seeded Confirmed and Preparation events carry a recorded approval. Any change to the reviewed arrangements (significant change, venue booking requested or cancelled, equipment request submitted, technical sign-off rejected) withdraws an approval or a pending check. A rejected arrangement must be changed before resubmission. Confirmed events from before SPM-91 can be reviewed while Confirmed. Tests across SPM-9, 10, 27, 36, 47, 56, 61, 63, 79, 81 and 88 now record an approval before Confirm.
- **Known gaps:** invalidation relies on each write path calling `safetyReviewInvalidation`; there is no venue restrictions field beyond operating hours; Safety Officers are not notified of new queue entries; Event Coordinator Lead is still not implemented.
- **Status:** SPM-66, SPM-91 and SPM-92 are **In Progress**. Every acceptance criterion has code and automated tests (`docs/evidence/spm-66-91-92-traceability.md`), but human acceptance, peer review and the team decisions are outstanding. Manual checks: `docs/testing/spm-66-91-92-manual-testing.md`.
- **Evidence:** `npm run test:spm92`. Local run on 27 Oct 2026 (Windows): `npm run lint` and `npm run build` passed (existing large-chunk warning); Node suites 134 passed; frontend suite 101 passed; root Vitest 1,927 passed with 49 opt-in skips; Playwright 111 of 111 passed (after the code-review fixes).
- **Not verified:** API tests use mocked identity and in-memory persistence, and browser tests use the Firebase double. There was no live-project check. Firestore rules were neither edited nor deployed; none is needed because staff roles were already excluded from self-registration.
