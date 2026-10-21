# SPM-79 traceability and verification

Operational source: Product Backlog workbook, SPM-79, Sprint 3, In Progress. Customer clarification requires separate venue requests, each within the overall schedule, and independent decisions and holds. SPM-67's safety handoff is still To Do.

| Acceptance area | Implementation | Automated evidence |
|---|---|---|
| Several required venues, independent requests and replacements | `shared/venueBooking.js` need ID/readiness; `backend/src/services/venueBookingService.js` booking transaction and legacy-chain derivation | `tests/spm-79/venueBooking.test.js`; `tests/spm-79/e2e/spm79.multipleVenues.spec.js` |
| Per-request interval and attendance, capacity and suitability | `shared/venueBooking.js`; `backend/src/services/venueBookingService.js`; `frontend/src/pages/VenueBookingsPage.jsx` | `tests/spm-79/venueBooking.test.js`; SPM-14/54 regressions |
| Separate staff queue, hold, expiry, decision and visible status | Existing booking service, queue and UI, extended booking presentation | SPM-14/34/53/54/78 regressions; SPM-79 browser journey |
| All needs approved before Confirm; direct old action refused | `shared/arrangements.js`, `shared/requestActions.js`, `backend/src/services/statusTransitionService.js`; readiness loaded in the Confirm transaction and request responses | SPM-79 service/browser journey; SPM-9 status tests; `tests/spm-79/venueBooking.emulator.test.js` |
| Safety-check handoff | Readiness is exported for SPM-67 to use; no safety action or queue added in SPM-79 | Deferred to SPM-67 |

The root Vitest and browser suites use in-memory persistence or the browser Firebase double. The opt-in emulator suite uses Firestore transactions. No test here verifies a deployed Firebase project. Record actual run results and human evidence below before marking Done.

## Run record

21 October 2026 local verification: `npm run lint` and `npm run build` passed (the build retains the existing bundle-size warning). `npm run test:existing` passed 128 Node and 101 frontend tests. The root Vitest suite passed 1,774 tests, with 47 opt-in cases skipped. The full Chromium suite passed 99 tests. `npm run test:spm79` passed three unit/service tests and one Chromium journey. With a local Firestore emulator at `127.0.0.1:8085`, `npm run test:spm79:emulator` passed three transaction tests. The emulator was stopped afterward.

The root API tests use mocked token verification and in-memory persistence; the Chromium suite uses the browser Firebase double. Emulator tests exercise real Firestore transactions in an isolated local project. No live Firebase project or human acceptance was tested. Firestore rules were not edited or deployed. No Git publication or deployment occurred.
