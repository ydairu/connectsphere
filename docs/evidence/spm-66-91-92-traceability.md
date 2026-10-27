# SPM-66, SPM-91 and SPM-92 acceptance criteria and verification

Operational source: Product Backlog workbook rows for SPM-66 (Safety Officer role and access), SPM-91 (Submit an Event for Safety Review) and SPM-92 (Conduct an Operational Safety Review), as supplied by the team on 27 October 2026. SPM-91 and SPM-92 replace the earlier SPM-67. The criteria below are quoted from those rows. Requirement sources: W7-CUST Change #6 and Session 3 (CL3) rows G8!C2, C3, C17, C45–C47 and C49, reconciled in `docs/requirements/effective-requirements.md` §4.6.1.

Choices the criteria left open are recorded as team decisions pending PO confirmation in effective-requirements.md §4.6.1. They are marked **[Team decision]** below.

## SPM-66 — Safety Officer role and access

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| There is a new internal role, Safety Officer, defined in system defaults. There's no self-registration. | `SAFETY_OFFICER = 'safety_officer'` in `ROLES` (`shared/permissions.js`). The seed provisions `safety-officer@seed.connectsphere.test` (`backend/scripts/seedData.js`). `firestore.rules` still lets a browser create only `organiser` or `attendee` profiles, so the role cannot be self-registered; the rules were not changed. | `tests/spm-66/unit/safetyOfficerAccess.test.js`; the existing static rules test, `tests/spm-2/integration/firestoreRules.static.test.js` |
| Given an event awaiting a safety check, when the Safety Officer opens it, then they can see attendance, venue capacity and layout, accessibility needs, equipment and any known venue restrictions. | `SECTION_ACCESS` gives the role `core`, `venue` and `equipment`. `GET /api/requests/:id/safety-review/venues` (`listSafetyVenueDetails`) adds each approved booking's venue capacity, supported layouts, accessibility features, facilities and operating hours, with the capacity warning. **[Team decision]** The venue record has no restrictions field; operating hours are shown as the recorded restriction. | Unit suite; `tests/spm-92/integration/safetyReviewApi.test.js` (SPM-66 AC2); `tests/spm-92/integration/safetyReviewPage.test.jsx`; `tests/spm-92/e2e/spm92.safetyReview.spec.js` |
| The Safety Officer cannot edit event details. | The role's edit list is empty, so `PATCH /api/requests/:id` returns 403 naming the fields, and no status action names the role. | Unit suite; API suite (SPM-66 AC3: 403 for PATCH and Confirm, record unchanged) |
| Safety Officer accounts are created in system defaults. No administrator role is added (Session 3, row 18). | Seed account only; no administrator role or account-management route was added. | Unit suite (one seeded Safety Officer) |
| Events reach the Safety Officer only through the safety-review queue. They cannot open events that aren't awaiting or under their review. | `roleInScope` admits an event for the role only while `awaitingSafetyReview()` holds (Planning and a pending review). List, read, history and venue details all use that scope. **[Team decision]** Every Safety Officer sees every queued event; the event leaves their scope once its review is recorded. | Unit suite; API suite (nothing visible before submission, 403 by link, history and venue details; gone from the list after the review) |
| Given an event in the safety-review queue, when the Safety Officer opens it, then they can see its change history for attendance, venue/layout, access and equipment. | `canViewChangeHistory` admits an in-scope Safety Officer; `visibleChangeHistory` limits them to `core.expectedAttendees` and the `venue` and `equipment` fields. | Unit suite; API suite (title and internal notes excluded) |

## SPM-91 — Submit an Event for Safety Review

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Only the assigned Coordinator can submit an event in Planning for safety review. | `canSubmitForSafetyReview` (`shared/safetyReview.js`), applied by the `submit_safety_review` action in `transitionEventRequest`. | `tests/spm-92/unit/safetyReview.test.js`; API suite (unassigned Coordinator 404; Organiser and staff 403) |
| Submission is permitted only when all required venue bookings and technical arrangements are approved. | The same `arrangementsApproved()` check as Confirm, with venue booking readiness loaded in the transaction. | Unit suite; API suite (409 `arrangements_not_ready`, nothing written) |
| On submission, the event enters the safety-review queue and displays "Pending safety check"; its lifecycle status remains Planning. | Writes `safetyReview: { status: 'pending', … }` and a `safety_review_submitted` activity entry; the status is unchanged. The request page heading and the requests list show "Pending safety check" beside Planning. | API suite; page suite; E2E |
| The event cannot become Confirmed without a valid safety approval. | The Confirm guard in `shared/statusTransitions.js` refuses with `safety_approval_required` unless `safetyApproved()`. Start Preparation uses the same check, replacing the SPM-88 test verifier. | `shared/statusTransitions.test.js`; `backend/src/services/statusTransitionService.test.js`; API suite; E2E |
| Following revisions, the Coordinator can resubmit the event once the readiness conditions are satisfied. | The same action is allowed again after changes requested or invalidation, subject to the readiness check. **[Team decision]** After a rejection, only once the arrangement has been changed. Earlier reviews are kept in `safetyReviews`. **[Team decision]** A Confirmed event with no review (confirmed before SPM-91) may also be submitted. | Unit suite; API suite (AC5, rejection, legacy Confirmed) |
| When an accepted significant change returns a safety-approved event to Planning, its safety approval is invalidated and another safety check is required. | `significantChangeEffects` writes `safetyReview.status = 'invalidated'` in the edit's transaction. **[Team decision]** Every other change to the reviewed arrangements does the same: a venue booking requested or cancelled, an equipment request submitted, a technical sign-off rejected. A pending check is withdrawn as well. | Unit suite; `tests/spm-10/integration/significantChangesApi.test.js` (Confirmed → Planning, re-review, re-confirm); API suite; `tests/spm-92/integration/safetyInvalidation.test.js`; `tests/spm-81/venueBooking.test.js` |

## SPM-92 — Conduct an Operational Safety Review

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Only an authorised Safety Officer can record the review, within the review scope defined by SPM-66. | `POST /api/requests/:id/safety-review` → `decideSafetyReview`: the SPM-66 scope check, then `canDecideSafetyReview`, then validation, in one transaction. | Unit suite; API suite (Coordinator, Organiser, staff and Attendee 403; unassigned Coordinator 404; event outside the queue 403; second review after the first 403) |
| The checklist covers attendance versus capacity, layout, emergency access, accessibility, equipment placement and venue restrictions, with comments for each item. | `SAFETY_CHECKLIST_ITEMS`; every item needs a result and may have a comment (`normaliseSafetyReviewDecision`). **[Team decision]** Results are Satisfactory, Concern or Not applicable. | Unit suite; API suite (400 for an incomplete checklist); page suite |
| The Officer records exactly one outcome: Approve, Request changes, or Reject safety arrangement. Comments are required for Request changes and Reject. | One `outcome` field validated against the three values; comments required for the other two. | Unit suite; API suite (400 with field errors, nothing written); page suite |
| Approval enables the Coordinator to confirm the event, subject to all other confirmation conditions, and notifies the Coordinator. | `safetyReview.status = 'approved'`; a `safety_approved` notice to the assigned Coordinator in the same transaction. | API suite (Confirm then succeeds); E2E |
| Request changes keeps the event in Planning, preserves venue/technical sign-offs and notifies the Coordinator with actionable comments. | Only `safetyReview` and `safetyReviews` are written; the notice's `reason` is the comments. | Unit suite (only two fields written); API suite |
| Rejection rejects the venue arrangement, not the whole event. The event remains in Planning and the Coordinator receives the reason. | `safetyReview.status = 'rejected'`; the notice says the venue arrangement must be revised and carries the reason. **[Team decision]** No booking is changed automatically; the Coordinator revises and resubmits. | API suite |
| The Organiser sees the outcome and actionable comments, but not private internal notes. | `safetyReviewSummary` gives the owning Organiser only the status, outcome, overall comments and time. **[Team decision]** Checklist comments are treated as internal. | Unit suite; API suite; page suite |
| Each review records the reviewer, date/time, checklist results, outcome and comments. | One entry per review in `safetyReviews`, plus a `safety_review_decided` activity entry. | Unit suite; API suite |

## Other changes made by this increment

- The seeded Confirmed and Preparation events now carry a recorded safety approval, because the new Confirm rule requires one.
- Tests that confirmed an event or started Preparation without a safety approval were updated to record one first: SPM-9, SPM-10, SPM-27, SPM-36, SPM-47, SPM-56, SPM-61, SPM-79, SPM-81 and SPM-88. Where the seeded Confirmed event is used, Start Preparation now appears in the Coordinator's available actions.
- The injected `verifySafetyApproval` option was removed from `createApp`, the routes and the controller. The E2E double's `/__double__/safety-approvals/:id` now records an approval on the event instead.

## Known gaps

- **Invalidation is per path.** Each write that changes the arrangements calls `safetyReviewInvalidation`. A future path that forgets to would leave a stale approval. A sturdier design would record the reviewed booking and equipment request ids at submission and compare them at Confirm; it was not done here.
- **No restrictions field.** "Known venue restrictions" shows operating hours only. Maintenance blocks or unavailability are not listed.
- **No notification to Safety Officers.** The queue is the only signal that an event is waiting.
- **Status history page.** Submission and review are recorded as activity entries, but the request page shows field history only, as for other actions.

## Verification record

27 October 2026, local (Windows): `npm run lint`, `git diff --check` and `npm run build` passed (with the existing large-chunk warning). Node suites: 134 passed. Frontend suite: 101 passed. Root Vitest: 1,927 passed, 49 opt-in cases skipped, none failed. Playwright: 111 of 111 passed, including `tests/spm-92/e2e/spm92.safetyReview.spec.js`.

HTTP tests use mocked identity and in-memory persistence; Playwright uses the local Firebase double. Neither verifies the deployed Firebase project. Firestore rules were neither edited nor deployed. Human acceptance and peer review have not been done, so keep all three stories In Progress until they are.
