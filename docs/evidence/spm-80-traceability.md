# SPM-80 acceptance criteria and verification

Operational source: Product Backlog workbook, SPM-80, Sprint 3, In Progress. This story extends the SPM-53 Venue Staff queue after SPM-79 introduced multiple requests per event. SPM-81 decision rules and SPM-77 booking management are separate stories.

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Each venue request appears separately with event name, venue, date and time. | Existing per-booking `venueBookingRequests` records and assigned-staff query in `backend/src/services/venueBookingService.js`; `pendingVenueBookings` in `shared/venueBooking.js`; queue cards in `frontend/src/pages/VenueBookingsPage.jsx` now pair event and venue in the heading. | `tests/spm-80/unit/pendingVenueBookings.test.js`; `tests/spm-80/integration/queueApi.test.js`; `tests/spm-80/integration/queuePage.test.jsx`; `tests/spm-80/e2e/spm80.queue.spec.js` |
| Deciding one booking leaves any other pending venue request for the event visible. | Existing per-booking approve/reject transactions change only the selected booking; the queue filters each booking independently on the next read. | SPM-80 unit, API and two browser journeys above; SPM-34/SPM-54/SPM-79 regressions in the full suite. |

Assignment scope is the SPM-14 team decision: a Venue Staff member sees requests assigned to them, including when sibling requests belong to another staff member. The queue response and route are unchanged. No Firestore rules, data migration or new status transition is part of SPM-80.

## Verification record

21 October 2026 local verification: targeted SPM-80 unit/API/component tests and the affected SPM-53 component test passed (10 tests); both SPM-80 Chromium journeys passed. `npm run lint` and `npm run build` passed, with the existing large-chunk build warning. Full `npm test` passed: 128 Node tests, 101 frontend tests, 1,779 root Vitest tests (47 opt-in cases skipped), and 101 Chromium tests. This includes the SPM-53 and SPM-79 regressions. The two SPM-80 browser journeys passed again after adding exact start/end display assertions. HTTP integration tests use mocked identity and in-memory persistence; the browser journeys use the local Firebase double. No live Firebase project, Firestore emulator, deployed rules or human manual acceptance was verified.

Manual checks: `docs/testing/spm-80-manual-testing.md` (Not run). Keep SPM-80 In Progress until the human checks and team Definition of Done are satisfied. No commit, push, pull request or deployment was performed.
