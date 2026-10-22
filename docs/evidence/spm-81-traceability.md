# SPM-81 acceptance criteria and verification

Operational source: Product Backlog workbook, SPM-81, Sprint 3, In Progress. SPM-77 owns broader individual-booking management; this increment supplies the approved-booking cancellation path needed by SPM-81 without claiming all of SPM-77.

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Approving one of several venue requests confirms only that booking. | The existing selected-booking approval transaction in `backend/src/services/venueBookingService.js` converts only its verified hold; sibling records and reservations are unchanged. | `tests/spm-81/venueBooking.test.js`; SPM-54 and SPM-79 regressions. |
| Rejecting one with a reason leaves the other requests and bookings unchanged. | The existing rejection transaction requires a reason and releases only its linked hold. | `tests/spm-81/venueBooking.test.js`; SPM-34 and SPM-80 regressions. |
| Cancelling an approved booking leaves the other venue bookings. | The assigned Coordinator's `cancel` action on the existing booking-action API marks only that booking Cancelled and releases only its confirmed reservation. A Confirmed event returns to Planning; the cancelled venue need can be replaced without erasing its history. | `tests/spm-81/venueBooking.test.js`, `venueBookingApi.test.js`, `venueBooking.emulator.test.js`, and `e2e/spm81.independentBookings.spec.js`. |
| Approval conflicts use setup and turnaround in the occupied period. | Approval retains `checkVenueHoldInTransaction` and `findVenueConflict`, under the venue lock, for the selected venue. | `tests/spm-81/venueBooking.test.js` boundary and sibling test; SPM-16 and SPM-54 conflict tests. |

The Confirm guard still reads venue-need readiness in its transaction. Whole-event cancellation still releases all venue reservations. Individual booking cancellation does not release equipment reservations or another venue booking. No Firestore rule change or data migration is needed.

## Verification record

21 October 2026 local verification: `npm run lint`, `npm run build` and `git diff --check` passed; the build retains its existing large-chunk warning. Full `npm test` passed: 128 Node tests, 101 frontend tests, 1,788 root Vitest tests (49 opt-in cases skipped), and 102 Chromium browser tests. The SPM-81 targeted service suite passed seven tests at that point, its HTTP API suite passed two tests, its browser journey passed, and two isolated Firestore emulator concurrency tests passed. A final missing-reservation guard and test were then added; `npm run test:spm81` passed all 10 unit/service/API tests and its Chromium journey, and lint passed. The full suite was not rerun for that narrow guard. The first targeted HTTP run was blocked by the sandbox's local-socket restriction; the rerun outside that restriction passed. The first browser run had an ambiguous text locator; the exact locator passed on rerun and in the full suite.

HTTP tests use mocked identity and in-memory persistence; Playwright uses the local Firebase double. The opt-in emulator suite uses a local, isolated Firestore project and real Firestore transactions. None verifies the deployed Firebase project. Firestore rules were neither edited nor deployed.

Human acceptance: `docs/testing/spm-81-manual-testing.md` (Not run). Keep SPM-81 In Progress pending human acceptance and independent peer review. No Git publication or deployment is authorised.
