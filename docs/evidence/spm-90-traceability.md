# SPM-90 acceptance traceability

The pasted SPM-90 story is the acceptance source. The Product Backlog workbook and Sprint record were not present in this checkout. No Done status is claimed until their current records and human acceptance are checked.

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| One primary booking required for multi-venue Confirm | `shared/primaryVenue.js`, `shared/statusTransitions.js`, `backend/src/services/statusTransitionService.js` | `shared/primaryVenue.test.js`, `tests/spm-90/primaryVenueApi.test.js` |
| Attendee sees only primary location | `shared/permissions.js`, request list and detail pages; the primary snapshot includes the catalogue location | SPM-90 API, page, and browser tests |
| Organiser sees every venue | Existing venue-booking API and `frontend/src/components/VenueBookingOverview.jsx` | SPM-90 API and browser tests; SPM-77 overview regression |
| Cancelled primary requires reassignment | `backend/src/services/venueBookingService.js`, primary-selection-required event metadata | SPM-90 API tests and Firestore emulator race suite |
| Changes appear in history | `shared/changeHistory.js`, `backend/src/services/primaryVenueHistory.js`, `frontend/src/utils/changeHistory.js` | SPM-90 API tests; SPM-28 history regression |

Selection, cancellation, Confirm, and whole-event closure write the event and activity entries in their existing Firestore transactions. `backend/scripts/backfillPrimaryVenues.js` is dry-run-first and never guesses a primary venue for an existing multi-venue Confirmed event. See `docs/testing/spm-90-manual-testing.md` for human acceptance.

Local verification on 27 October 2026: the full `npm test` run passed 135 Node tests, 101 frontend tests, the root Vitest suite, and 111 Chromium journeys before the final address-display refinement. After that refinement, the SPM-90 Node, HTTP, page, browser, and four Firestore emulator transaction tests passed; lint and the production build passed. The first full run encountered a timeout in an unchanged registration test; it passed alone and in the subsequent full run. HTTP tests use mocked identity and in-memory persistence, browser tests use a Firebase double, and emulator tests use local Firestore. No live Firebase, deployed-rule check, backfill write, human acceptance, or CI run is claimed.
