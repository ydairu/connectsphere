# SPM-39 acceptance criteria and verification

Operational source: Product Backlog workbook, `01_Product Backlog`, SPM-39 "Join a Waiting List When an Event Reaches Registration Capacity" (Sprint 4, To Do), and its `03_Sprint Backlog` tasks, read on 29 October 2026. The fourth criterion was moved to SPM-59 the same day (see effective-requirements.md §4.18). The tests were written from the three remaining criteria before the code and failed first (28 of 31).

Team decisions W1–W5 (29 Oct 2026, pending PO confirmation) are in effective-requirements.md §4.18.

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| AC1 A Confirmed event at capacity with registration open: an Attendee who tries to register is offered the waiting list. | `canJoinWaitingList()` allows joining only when `registrationAvailability()` reports `full`; the event response's `attendeeRegistration.canJoinWaitingList` drives the "Join waiting list" button, which replaces Register. W4: refused with `not_full` while a place is free. | `tests/spm-39/unit/waitingList.test.js`; `tests/spm-39/integration/waitingListApi.test.js` (AC1); `tests/spm-39/integration/waitingListPages.test.jsx`; `tests/spm-39/e2e/spm39.waitingList.spec.js` |
| AC2 Registration closed: they cannot join the waiting list. | Any other availability reason (closed, not yet open, disabled, unset, not Confirmed/Preparation) is the refusal reason; the page shows only the reason. | Unit, API (AC2) and page suites |
| AC3 Confirming adds them in the order they joined, first come, first served. | The page asks for confirmation first. `joinWaitingList()` runs under `systemLocks/registration-{eventId}` and takes the next `waitlistSequence` from it (W3); `waitingListPosition()` ranks by it. Positions show on the event page and "My registrations". One entry per Attendee; registered Attendees cannot join. | Unit, API (AC3) and page suites; E2E; `tests/spm-39/waitingList.emulator.test.js` (five simultaneous joins, CI only) |

Sprint Backlog tasks: offer when full and not when closed (AC1, AC2); entries ordered by join, refusing duplicates and registered Attendees (AC3); position on My registrations (page suite, E2E); unit, API and page tests (done, plus E2E and emulator); docs (done); pull request and peer review (not done).

Regressions checked: waitlisted Attendees are left out of the registered count and list (SPM-19) and are not sent cancellation notices (SPM-41).

## Verification record

29 October 2026, local (macOS):

- **Passed:** `npm run lint`, `git diff --check` and `npm run build` (existing large-chunk warning). Node suites 136; frontend suite 101; root Vitest 2,176 passed with 56 opt-in or emulator cases skipped; Playwright 119 of 119 in Chromium.
- **SPM-39 tests:** 12 unit, 12 API and 7 page tests, plus the Chromium journey (`npm run test:spm39`). With the queue ordered by Attendee id instead of join order, three tests failed; restored, all passed.
- **Not run here:** `npm run test:spm39:emulator` (needs Java and the Firestore emulator; it runs in CI). API tests use mocked identity and in-memory persistence; browser tests use the Firebase double. No live-project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending. With AC4 moved to SPM-59, SPM-39 can be marked Done once they are.
