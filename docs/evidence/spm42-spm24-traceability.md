# SPM-42 and SPM-24 — permission matrix and traceability

> **Changed by SPM-48 (7 Oct 2026):** staff edit rights changed; Venue Staff and Technical Support Staff now edit only their own preparation section, not `venue` / `equipment`. See [effective-requirements.md, §7 SPM-48](../requirements/effective-requirements.md#spm-48--venue-staff-and-technical-support-staff-update-preparation-status).

Owner: Shaun. Sprint 1. Last verified: 1 October 2026 (live API and deployed-rule checks: 26 September 2026).

This record maps each acceptance criterion to the code that implements it and the tests that prove it,
and states the permission matrix the two stories share. Acceptance criteria are quoted from
[`effective-requirements.md`](../requirements/effective-requirements.md); the rules behind them come
from the clarification records in [`docs/requirements/`](../requirements/).

## 1. The permission matrix

Permission is **role × record × status**. Three predicates are evaluated **per role**, and the results
are then combined:

```
canEdit(user, request, section) =
  ∃ role ∈ rolesOf(user) :
       roleInScope(role, user, request)      may this role see this record?
    && roleGateOpen(role, user, request)     may this role edit it right now?
    && section ∈ sectionsEditableBy(role)    may this role ever edit this section?
```

Combining the roles first and checking the conditions afterwards is wrong: for a user holding both
`organiser` and `venue_staff` on their own request at planning, the venue role's open gate would unlock
the organiser's `core` section, which Clarification 2 forbids. A regression test covers exactly this.

### Sections

| Section | Fields |
| :--- | :--- |
| `core` | title, purpose, description, preferred date/time, duration, expected attendees |
| `venue` | layout preference, accessibility |
| `equipment` | equipment requirements, technical support needed |
| `registration` | registration enabled, registration notes |
| `internal` | staff planning notes |

### Record scope — which records a role may see

| Role | Records in scope |
| :--- | :--- |
| Event Organiser | Own drafts and every other request they own, with or without an `organisationId`; their organisation's non-draft requests, matched on `organisationId` |
| Event Coordinator | Every request except a draft |
| Venue Staff | Non-draft requests they are assigned to |
| Technical Support Staff | Non-draft requests they are assigned to |
| Attendee | Confirmed requests with registration enabled |

Drafts are owner-only for every role, with no expiry (Clarification 2, Drafts).

### Sections by role

| Role | May view | May edit |
| :--- | :--- | :--- |
| Event Organiser | core, venue, equipment, registration | core, venue, equipment, registration |
| Event Coordinator | all five | all five |
| Venue Staff | core, venue | venue |
| Technical Support Staff | core, equipment | equipment |
| Attendee | core | — |

### Status gate — when editing is allowed

| Role | Status | May edit? |
| :--- | :--- | :--- |
| Organiser (owner) | draft, returned for clarification | Yes, their sections |
| Organiser (owner) | submitted, under review, planning, confirmed | No |
| Organiser (same organisation, not owner) | any | Never — view only |
| Event Coordinator | any except draft | Yes, all sections |
| Venue / Technical Staff | planning, confirmed | Yes, their section only |
| Every role | completed, cancelled, rejected | No |

The last row and the Attendee's confirmed-only scope are **team decisions** of 20 September 2026, not
customer rulings; both are recorded as such in `effective-requirements.md`.

## 2. Where the rules live

| Concern | Implementation |
| :--- | :--- |
| The matrix itself | [`shared/permissions.js`](../../shared/permissions.js) — pure functions, no I/O, imported by both sides |
| Status values | [`shared/status.js`](../../shared/status.js) — no status string literal is written anywhere else |
| API authorisation | [`backend/src/middleware/authorise.js`](../../backend/src/middleware/authorise.js) — delegates every decision to the module above |
| Routes | [`backend/src/routes/requestRoutes.js`](../../backend/src/routes/requestRoutes.js) — list, read, section edit |
| Direct database access | [`firestore.rules`](../../firestore.rules) — the browser cannot reach `eventRequests` at all |
| Interface | [`RequestDetailPage.jsx`](../../frontend/src/pages/RequestDetailPage.jsx), [`RequestsPage.jsx`](../../frontend/src/pages/RequestsPage.jsx), [`DraftRequestsPage.jsx`](../../frontend/src/pages/DraftRequestsPage.jsx), [`ProtectedRoute.jsx`](../../frontend/src/components/ProtectedRoute.jsx) |
| Demonstration data | [`backend/scripts/seedData.js`](../../backend/scripts/seedData.js) — nine accounts, sixteen requests, every status |

## 3. SPM-42 — criterion to test

| # | Criterion | Proven by |
| :--- | :--- | :--- |
| 1 | A record outside a user's scope is not returned, not merely hidden | `Attendee requests a draft by direct ID`, `Organiser requests another organisation's event by direct ID` (API) |
| 2 | Direct-link and API attempts are denied | The same API cases, plus 16 checks against the deployed rules in [`check-firestore-rules.js`](../../backend/scripts/check-firestore-rules.js) |
| 3 | Organisers see their own and their organisation's requests, by organisation ID | `Organiser lists requests — own drafts and own organisation only` (API); `Self-registered organiser lists and opens their own submitted request without organisation ID` (API and predicate) |
| 4 | Coordinators have full visibility except drafts | `Coordinator lists all requests — drafts absent` (API and predicate) |
| 5 | Venue staff cannot see equipment; technical staff cannot see venue | `Venue staff GETs an assigned event — equipment section absent` and its mirror, asserted on the raw response body |
| 6 | Attendees receive no internal planning information | `Attendee GETs a confirmed event — no internal fields in the body` |
| 7 | A change outside a permitted section is rejected and the field identified | `Venue staff PATCHes an equipment field` (403 naming `equipment.requirements`), `Coordinator PATCHes the status field` |
| 8 | Organisers edit only requests they own; colleagues may view but never edit | `Organiser PATCHes a colleague's submitted request` |
| 9 | An owner cannot edit after submission unless returned for clarification | `Organiser PATCHes their own request while it is submitted`, `Organiser edits their own request after it is returned for clarification` |
| 10 | Coordinators edit every section of any event | `Coordinator edits any section on an unassigned event` |
| 11 | Venue staff update only venue; technical staff only equipment | `Venue staff PATCHes a venue field and an equipment field together — nothing is applied` |
| 12 | A multi-role user receives the combined permissions | `Venue+technical dual-role account PATCHes a venue field and an equipment field`, plus the leak regression in [`requestApi.test.js`](../../tests/spm-42/integration/requestApi.test.js) |

Interface behaviour for criteria 5, 7 and the read-only states is covered by
[`requestDetail.test.jsx`](../../frontend/src/pages/requestDetail.test.jsx), and the signed-in-but-forbidden
response by [`access.test.js`](../../frontend/src/utils/access.test.js).

## 4. SPM-24 — criterion to test

| # | Criterion | Proven by |
| :--- | :--- | :--- |
| 1 | Drafts on a dedicated page, separate from submitted requests | `Lists every draft and nothing that has been submitted` ([`draftRequests.test.jsx`](../../frontend/src/pages/draftRequests.test.jsx)) |
| 2 | Every owned draft listed; no other Organiser's draft appears | `Every draft the Organiser owns is listed, and no draft belonging to another Organiser appears` (API) |
| 3 | An Organiser with no drafts is told so | `An Organiser with no saved drafts receives none` (API) and the empty-state test (UI) |
| 4 | Selecting a draft opens it for editing | `Selecting a draft opens it for editing` (UI, API mocked); `spm24_selecting_a_draft_opens_it_for_editing` (E2E), which checks the draft's saved values load into editable fields |
| 5 | Submitted requests show their status and are not editable as drafts | `A submitted request is listed with its current status, not as a draft` (API), `Shows each request with its status label and no editing` (UI) |
| 6 | A draft is invisible to every other user, coordinators and colleagues included | `A draft that has never been submitted is not visible to an Event Coordinator` and the same for a same-organisation Organiser, each checking list and direct id |

Reopening a draft with its data intact is SPM-4's criterion, verified there.

## 5. Test layers

| Layer | Location | Count | Environment |
| :--- | :--- | ---: | :--- |
| Unit — the predicates | [`tests/spm-42/unit/permissions.test.js`](../../tests/spm-42/unit/permissions.test.js) | 16 | Offline |
| Unit — seed demonstrates the rules | [`tests/spm-42/unit/seedData.test.js`](../../tests/spm-42/unit/seedData.test.js) | 12 | Offline |
| API — real HTTP status codes | [`requestApi.cases.js`](../../tests/spm-42/integration/requestApi.cases.js) via [`requestApi.test.js`](../../tests/spm-42/integration/requestApi.test.js) | 21 + 5 | Real Express app and middleware; mocked token verification and in-memory persistence |
| API — SPM-24's list cases | [`draftListApi.cases.js`](../../tests/spm-24/integration/draftListApi.cases.js) via [`draftListApi.test.js`](../../tests/spm-24/integration/draftListApi.test.js) | 7 | As above |
| API — same cases, real project | [`requestApi.live.test.js`](../../tests/spm-42/integration/requestApi.live.test.js), [`draftListApi.live.test.js`](../../tests/spm-24/integration/draftListApi.live.test.js) | 28 | Real Firebase Auth sign-ins and real Firestore |
| Security rules | [`check-firestore-rules.js`](../../backend/scripts/check-firestore-rules.js) | 16 | Deployed rules, via the Firestore REST API as a signed-in user |
| End to end | [`spm42.permissions.spec.js`](../../tests/spm-42/e2e/spm42.permissions.spec.js), [`spm24.drafts.spec.js`](../../tests/spm-24/e2e/spm24.drafts.spec.js) | 14 | Playwright in Chromium: real frontend and real API, Firebase replaced by the in-memory double |
| Interface | `frontend/src/pages/`, `frontend/src/utils/` | 53 | Vitest with jsdom and Testing Library; API mocked |

Commands:

```bash
npm test                                                                      # every suite: node:test, Vitest, Playwright
npm run test:vitest                                                           # the tests/ suites only
npx playwright test tests/spm-42 tests/spm-24                                 # the E2E specs for these stories
LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live                  # 28 against the real project
node backend/scripts/check-firestore-rules.js --project=<FIREBASE_PROJECT_ID>  # 16 against deployed rules
```

SPM-42 and SPM-24 suites live under `tests/spm-42/` and `tests/spm-24/`, matching the layout SPM-1 and
SPM-2 use. Their component tests stay beside the pages in `frontend/src/` for now, because the root
Vitest project loads React twice when `frontend/node_modules` is present, which fails every jsdom suite
locally; see `project_context.md`.

Results on 1 October 2026, after merging `origin/main` at `49db945`: 47 unit and 33 API tests under
`tests/`, 53 frontend Vitest tests, 59 remaining `node:test` tests (SPM-8's included) and 32 Playwright
tests passed; repository lint and the production build passed with the existing bundle-size warning. The
28 live API tests and 16 deployed-rule checks were last run, and passed, on 26 September 2026; they were
not re-run after the merge.

Before 1 October, `spm24_selecting_a_draft_opens_it_for_editing` passed without proving criterion 4:
`/api/event-requests` used the real Firebase `authenticate` whatever `createApp` was given, so under the
in-memory double the draft never loaded, and the editor still rendered an empty form. Those routes now take
`authenticate` and their database from `createApp`, the double serves them from the same in-memory records
as `/api/requests`, and the test checks the draft's saved values. Restoring the old wiring makes it fail.

## 6. Definition of Done — status

| Item | State |
| :--- | :--- |
| Every acceptance criterion implemented | Yes, both stories |
| Each criterion mapped to code and at least one test | Yes, sections 3 and 4 |
| Successful, validation, authorisation and failure paths covered | Yes at the API level; validation of field values on post-submission edits is a known gap, not a criterion |
| Enforcement in the backend and data layer, not only the interface | Yes: API middleware plus deployed rules, verified against the live project |
| Unrelated behaviour and files preserved | Yes; SPM-2, SPM-7 and SPM-4 flows untouched and their tests passing |
| Repository records updated | Yes: this file, `project_context.md`, `presentation-evidence.md`, `AGENTS.md`, `README.md` |
| Team decisions labelled and dated | Yes: the two supporting rules and the route split, ratified 20 September 2026 |
| Browser-driven end-to-end test | Yes: 14 Playwright tests in Chromium covering both stories, against the real frontend and API with Firebase replaced by the in-memory double |
| Continuous integration | Yes: GitHub Actions runs lint, every test suite, the build and Playwright on each push |
| Operational workbook and Sprint record updated | **Outstanding — team action.** The workbook is not held in this repository |
| Team Definition of Done review | **Outstanding — team action** |
