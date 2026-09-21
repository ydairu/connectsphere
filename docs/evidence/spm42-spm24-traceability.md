# SPM-42 and SPM-24 — permission matrix and traceability

Owner: Shaun. Sprint 1. Last verified: 20 September 2026.

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
| Event Organiser | Own drafts; their organisation's non-draft requests, matched on `organisationId` |
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
| 3 | Organisers see their own and their organisation's requests, by organisation ID | `Organiser lists requests — own drafts and own organisation only` (API) |
| 4 | Coordinators have full visibility except drafts | `Coordinator lists all requests — drafts absent` (API and predicate) |
| 5 | Venue staff cannot see equipment; technical staff cannot see venue | `Venue staff GETs an assigned event — equipment section absent` and its mirror, asserted on the raw response body |
| 6 | Attendees receive no internal planning information | `Attendee GETs a confirmed event — no internal fields in the body` |
| 7 | A change outside a permitted section is rejected and the field identified | `Venue staff PATCHes an equipment field` (403 naming `equipment.requirements`), `Coordinator PATCHes the status field` |
| 8 | Organisers edit only requests they own; colleagues may view but never edit | `Organiser PATCHes a colleague's submitted request` |
| 9 | An owner cannot edit after submission unless returned for clarification | `Organiser PATCHes their own request while it is submitted`, `Organiser edits their own request after it is returned for clarification` |
| 10 | Coordinators edit every section of any event | `Coordinator edits any section on an unassigned event` |
| 11 | Venue staff update only venue; technical staff only equipment | `Venue staff PATCHes a venue field and an equipment field together — nothing is applied` |
| 12 | A multi-role user receives the combined permissions | `Venue+technical dual-role account PATCHes a venue field and an equipment field`, plus the leak regression in [`requestRoutes.test.js`](../../backend/src/routes/requestRoutes.test.js) |

Interface behaviour for criteria 5, 7 and the read-only states is covered by
[`requestDetail.test.jsx`](../../frontend/src/pages/requestDetail.test.jsx), and the signed-in-but-forbidden
response by [`access.test.js`](../../frontend/src/utils/access.test.js).

## 4. SPM-24 — criterion to test

| # | Criterion | Proven by |
| :--- | :--- | :--- |
| 1 | Drafts on a dedicated page, separate from submitted requests | `Lists every draft and nothing that has been submitted` ([`draftRequests.test.jsx`](../../frontend/src/pages/draftRequests.test.jsx)) |
| 2 | Every owned draft listed; no other Organiser's draft appears | `Every draft the Organiser owns is listed, and no draft belonging to another Organiser appears` (API) |
| 3 | An Organiser with no drafts is told so | `An Organiser with no saved drafts receives none` (API) and the empty-state test (UI) |
| 4 | Selecting a draft opens it for editing | `Selecting a draft opens it for editing` (UI) |
| 5 | Submitted requests show their status and are not editable as drafts | `A submitted request is listed with its current status, not as a draft` (API), `Shows each request with its status label and no editing` (UI) |
| 6 | A draft is invisible to every other user, coordinators and colleagues included | `A draft that has never been submitted is not visible to an Event Coordinator` and the same for a same-organisation Organiser, each checking list and direct id |

Reopening a draft with its data intact is SPM-4's criterion, verified there.

## 5. Test layers

| Layer | Location | Count | Environment |
| :--- | :--- | ---: | :--- |
| Unit — the predicates | [`shared/permissions.test.js`](../../shared/permissions.test.js) | 15 | Offline |
| Unit — seed demonstrates the rules | [`backend/scripts/seedData.test.js`](../../backend/scripts/seedData.test.js) | 12 | Offline |
| API — real HTTP status codes | [`requestRoutes.cases.js`](../../backend/src/routes/requestRoutes.cases.js) via [`requestRoutes.test.js`](../../backend/src/routes/requestRoutes.test.js) | 28 + 4 | Real Express app and middleware; mocked token verification and in-memory persistence |
| API — same cases, real project | [`requestRoutes.live.js`](../../backend/src/routes/requestRoutes.live.js) | 28 | Real Firebase Auth sign-ins and real Firestore |
| Security rules | [`check-firestore-rules.js`](../../backend/scripts/check-firestore-rules.js) | 16 | Deployed rules, via the Firestore REST API as a signed-in user |
| Interface | `frontend/src/pages/`, `frontend/src/utils/` | 53 | Vitest with jsdom and Testing Library; API mocked |

Commands:

```bash
npm test                                                                      # 107 Node, 53 Vitest
LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live --prefix backend  # 28 against the real project
node backend/scripts/check-firestore-rules.js --project=<FIREBASE_PROJECT_ID>  # 16 against deployed rules
```

Results on 20 September 2026: 107 Node tests, 53 Vitest tests, 28 live API tests and 16 rules checks
passed; frontend lint passed; the production build passed with the existing bundle-size warning.

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
| Browser-driven end-to-end test | **No.** Checked manually against the running app with the seeded accounts; no automated browser test exists |
| Continuous integration | **No.** No CI workflow in the repository |
| Operational workbook and Sprint record updated | **Outstanding — team action.** The workbook is not held in this repository |
| Team Definition of Done review | **Outstanding — team action** |
