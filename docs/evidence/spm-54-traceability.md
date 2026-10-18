# SPM-54 acceptance traceability

Source: `docs/requirements/Product Backlog (1).xlsx`, sheet `01_Product Backlog`, SPM-54; current effective requirements; the user-approved SPM-54 implementation plan of 18 October 2026. The supplied workbook says **In Progress, Sprint 3**. Keep that status while dependent criteria and human acceptance remain outstanding. No separate current Sprint 3 planning record was available in this checkout, so no ownership, estimate or Sprint allocation is changed.

Progress update: SPM-54's workbook notes (K66) now record the implemented increment, verification results and outstanding work. Status remains In Progress and Sprint remains Sprint 3. Only that notes cell was changed; other workbook entries were preserved.

## Acceptance criteria

| Workbook criterion | Implementation | Verification / status |
|---|---|---|
| Approval confirms the venue for the event period; suitable and available pending request is approved | Shared approval predicate and strict action validation; `approveVenueBooking` rechecks the booking's linked hold, current event attendance/facilities and venue conflicts. One transaction writes the decision, converts the existing hold, updates locks/event timestamp, and writes activity and notice. | `tests/spm-54/unit/venueBookingApproval.test.js`; `tests/spm-54/integration/venueBookingApproval.test.js`; `tests/spm-54/integration/venueBookingApprovalApi.test.js`; emulator races. Implemented. |
| Calendar displays a confirmed booking | Existing `venueAvailability` entry becomes `confirmed_booking`; the existing calendar reads it with setup/turnaround. | Service integration and `tests/spm-54/e2e/spm54.approveVenueBooking.spec.js`. Implemented. |
| Overlapping availability search excludes the venue | Existing search/conflict checks consume the converted commitment, including occupied buffers. | Service integration and browser journey. Implemented. |
| Coordinator sees Approved/Confirmed | Assigned Coordinator's existing booking list and details display approval and time; event remains Planning. | API, component and browser tests. Implemented. |
| Cancellation releases the venue reservation | `prepareVenueHoldRelease` now releases active confirmed bookings and tentative holds during whole-event rejection/direct cancellation/approved cancellation. Requests for cancellation alone, return and refusal release nothing. | Service integration, SPM-14 regression and event-closure emulator race. Implemented. |
| Assigned Coordinator is notified | In-app notice to the current assigned Coordinator, with booking ID and detail link, written in the approval transaction. Existing self-notification suppression remains. | Unit, service/API and browser tests. Implemented. |
| Approved booking and Preparation status replace temporary venue sign-off for preparation | Deferred exactly as the approved plan specifies; current temporary preparation conditions are not replaced by this increment. | **Waiting for SPM-67/88 and SPM-48/89 integration. Not satisfied.** |
| Significant change preserves the booking and approval; Coordinator decides whether to request reapproval | Booking records and their original reserved intervals survive the real section-edit API; this does not change existing event-level sign-off resets. | API tests at Planning and Confirmed verify preservation. **Coordinator-controlled reapproval waits for SPM-87; full criterion not satisfied.** |

## Implementation choices and compatibility

These are choices authorised by the implementation plan, not additional customer requirements:

- Existing action URL: `POST /api/requests/:id/venue-bookings/:bookingId/actions`; body `{"action":"approve"}`. Rejection remains supported. Authentication is 401; incorrect role 403; inaccessible/mismatched booking 404; malformed action 400; status/suitability/conflict failures 409.
- `venueBookingRequests.status = approved` is separate from the event's status. Approval does not set event-level venue sign-off, confirm the event, or unlock preparation. Existing event confirmation still uses legacy sign-offs; all-required-venues readiness remains SPM-79/81 work.
- Approval stores `approvedByUid`, `approvedAt`, `updatedAt`, and warning-only suitability results. Its existing `holdId` continues to identify the same availability document. Hold expiry becomes null after confirmation; the status determines that it is a permanent commitment until released.
- The current event's attendance is used for legacy booking requests. Per-venue attendance belongs to SPM-79. Capacity and missing required facilities block approval; layout, accessibility and operating-hours warnings use existing suitability rules. Free-text special requests still require staff judgement.
- The booking's actual interval is used, rather than silently replacing it with the event's edited dates. A missing/removed/mismatched hold is refused. An expired own hold may approve only after a fresh conflict check; it has no priority over a newly acquired hold.
- Every approval reads/writes the venue lock, staff allocation lock and event document. All transaction reads precede writes. This coordinates with existing hold creation, staff assignment and event closure/reassignment.
- Closed bookings retain approval metadata. Whole-event closure releases confirmed commitments even if they predate the new booking approval path. The SPM-14 test that previously preserved confirmed bookings was updated to the SPM-54 cancellation rule.
- The pending queue projection now wraps its presenter explicitly so array indexes cannot be interpreted as decision capabilities.
- No browser Firestore access, new route family, security-rule edit, deployment or data migration is introduced.

## Verification

Local verification on 18 October 2026:

- `npm run test:spm54`: 43 Vitest unit/service/API/component tests passed; three Chromium browser tests passed. The four emulator cases are skipped in ordinary Vitest runs.
- Isolated Firestore emulator (`demo-connectsphere-spm54`, loopback port 8085): four concurrency tests passed (duplicate approvals, approve-versus-reject, expired-hold approval versus competing acquisition, approval versus event rejection). Transaction contention retried successfully. This is real emulator persistence, not deployed-project verification.
- Lint and production build passed; the build retained the existing large-bundle warning.
- Full `npm test` regression: 128 Node tests, 100 frontend tests, 1,656 root Vitest tests and 91 Chromium tests passed. The root run skipped 39 opt-in live/emulator cases; the four SPM-54 emulator cases passed separately above.
- The mobile approval screenshot was visually inspected; the browser test also checks for horizontal overflow at 390px. Human manual acceptance is not claimed.

Service/API tests use in-memory persistence and mocked token verification. Browser tests run the real React app and Express API against the local Firebase double. The emulator suite tests Admin SDK transactions, not client security rules. No live Firebase or production seed run was performed; rules were neither edited nor deployed.

## Remaining work and risk

- Human acceptance: `docs/testing/spm-54-manual-testing.md` remains Not run for the tester.
- SPM-79/81 required-venue readiness and attendance, SPM-67/88 safety/Preparation, SPM-48/89 preparation integration, and SPM-87 Coordinator-controlled reapproval remain separate dependencies. No completion is claimed for them.
- Existing maintenance writes do not take the venue booking lock. Approval checks committed maintenance entries, but a simultaneous maintenance write can still introduce an unavailable period. This is a cross-story limitation; the approval increment does not implement affected-booking handling.
- Independent peer review remains outstanding; self-review and automated tests are not peer approval.
- Delivery is local only, as requested. No commit, push, pull request or deployment was performed.

## Warning preview and replacement corrections — 18 October 2026

User-authorised corrections following manual feedback:

| Behaviour | Implementation | Regression coverage | Manual check |
|---|---|---|---|
| Pending warnings are visible before a decision | Booking GET computes read-only suitability from current event/venue and booking interval; confirmation refreshes GET | SPM-54 service/API and component tests; corrected replacement browser workflow | M1, M2 |
| Problems block confirmation, warnings permit it | Confirmation displays separate problems and warnings; approval transaction still rechecks | Unit rules, preview-then-change service test, capacity browser test | M8 |
| Replacement defaults use current requirements | Replacement refreshes event layout/accessibility; preserves venue, period and special requests for review | Formatter unit test, pending/rejected replacement component tests, rejection/correction/replacement browser test | M16, M17 |
| Failed refresh cannot continue with stale data | Loading/failed refresh disables confirmation/submission; Retry refresh recovers | Component failure/retry tests | M18 |

Saved requirements and approval warnings remain historical snapshots. GET diagnostics are not persisted and do not guarantee availability. The original rejected record remains unchanged apart from the existing replacement relationship. No migration or approval transaction change is needed. Manual checks remain Not run; dependent acceptance criteria and peer review remain outstanding.

Verification of this correction (18 October 2026):

- Final targeted SPM-54/SPM-14/SPM-34 run: 93 tests passed, eight opt-in emulator cases skipped. This includes the additional replacement-refresh failure test added after the full root Vitest run.
- Full `npm test`: 128 Node tests, 100 frontend tests, 1,664 root Vitest tests (39 opt-in cases skipped), and 92 Chromium tests passed. All four SPM-54 browser scenarios passed.
- Final page regression rerun: 15 component tests passed. Lint, production build and whitespace checks passed; the existing bundle-size warning remains.
- API/service persistence is in-memory and browser tests use the local Firebase double. No emulator or live Firebase rerun, deployment, human acceptance or peer review is claimed for this correction. Earlier emulator results above remain historical evidence.

## Booking-form requirement overrides — later correction, 18 October 2026

The previous correction covered changing the event before replacement but missed changing only the booking form. `venueBookingSuitability` now uses the submitted booking requirements for layout review in both pending GET and transactional approval. Current event attendance and structured facilities/accessibility still apply. Unmatched free text explicitly asks staff to review the requested layout/additional instructions; it is not parsed as structured facilities or accessibility. Existing records without requirements retain the legacy event-layout fallback. Historical booking and approved-warning snapshots are not rewritten.

Regression evidence: unit tests cover case-insensitive classroom matching against an unchanged Breakkout Room event and free-text review; service tests cover rejected replacement, preview, approval and preservation of event/history; the new browser case edits only the replacement form and checks pending, confirmation and reloaded approval. Manual check M19 covers the reported flow and remains Not run.

Verification: `npm run test:spm54` passed 54 unit/service/API/component tests and five Chromium tests; four opt-in emulator cases skipped. Lint, production build and whitespace checks passed (existing bundle-size warning). API tests use in-memory persistence and browser tests use the Firebase double. Full regression results above precede this follow-up; the full suite, emulator and live project were not rerun for this narrowly scoped helper change. No deployment or Git publication. SPM-54 remains In Progress; human acceptance, peer review and dependent workflows remain outstanding.
