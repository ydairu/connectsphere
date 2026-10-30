# SPM-41 acceptance criteria and verification

Operational source: Product Backlog workbook, `01_Product Backlog`, SPM-41 "Notify Registered Attendees When an Event Is Cancelled or Rescheduled" (Sprint 4, To Do), and its `03_Sprint Backlog` tasks, read on 28 October 2026. The tests below were written before the implementation and failed first (21 of 27, with the six "sends nothing" cases passing trivially until Attendees were notified at all).

Team decisions E1–E5 (29 Oct 2026, pending PO confirmation) are recorded in `docs/requirements/effective-requirements.md` §4.20.

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Triggers: cancellation approved; event rescheduled to a new date/time. | Cancellation: `transitionEventRequest` (`cancel`, `approve_cancellation`, and E5 `reject`) reads the event's active registrations at the start of the transaction (`loadRegisteredAttendeeUids`) and passes them to `cancellationNotifications`. Reschedule: the section-edit save (`requestController.update`) adds Attendee notices through `store.update(..., { consequences })` when `eventRescheduled()` finds a new start or (E1) duration. | `tests/spm-41/unit/attendeeChangeNotifications.test.js`; `tests/spm-41/integration/attendeeChangeNotificationsApi.test.js` |
| Contents: event name, type of change, updated date/time if rescheduled. | `attendeeChangeNotifications()` in `shared/notifications.js`: `changeType` `cancelled` or `rescheduled`, a message naming the event, and for a reschedule `eventStartsAt`/`eventEndsAt` with the previous ones. The Notifications page shows "New date and time" and "Previously". | Unit suite; `tests/spm-41/integration/attendeeChangePages.test.jsx` |
| A confirmed event with registered Attendees: when the Coordinator approves a cancellation, all registered Attendees are notified. | As above, for a Coordinator's cancellation and an approved Organiser request, from Confirmed or Preparation. Only active registrations of that event; refused actions send nothing. | API suite (AC3 block); `tests/spm-41/e2e/spm41.attendeeChangeNotices.spec.js` |
| A confirmed event with registered Attendees: when rescheduled, all registered Attendees get the updated date and time. | As above. E2: a further change while the event is back in Planning notifies again. An edit that does not move the time notifies no Attendee. | API suite (AC4 block); E2E |
| The notice includes the event name, the type of change and the updated date/time where applicable. | As above. No reason is sent to Attendees. | Unit, API and page suites |
| No registered Attendees: no Attendee notices, but Organiser and staff notices still apply. | `attendeeChangeNotifications` returns nothing for no uids; the SPM-63 and SPM-10 notices are unchanged. | Unit suite; API suite (AC6 block) |

Also delivered: E3, "My registrations" shows each event's current date/time and status ("Event cancelled", "Event being rearranged") and links to the event only while the Attendee may open it; E4, Attendee notices link to "My registrations". Evidence: API suite (E3 block), page suite, E2E.

Not covered: SPM-20 (Organiser change requests) does not exist yet, so a reschedule through an accepted change request is untested. It is covered automatically if SPM-20 applies the change through the section-edit save; AGENTS.md §6 says so. Venue changes are not announced (SPM-74).

## Verification record

29 October 2026, local (macOS):

- **Passed:** `npm run lint`, `git diff --check` and `npm run build` (existing large-chunk warning). Node suites 136 passed; frontend suite 101 passed; root Vitest 2,015 passed with 55 opt-in or emulator cases skipped.
- **SPM-41 tests:** 12 unit, 14 API and 5 page tests, plus two Chromium journeys (`npm run test:spm41`). With the reschedule hook disabled, three API tests failed; restored, all passed.
- **Playwright:** 115 of 115 passed in a full run. Earlier full runs failed one venue catalogue test (and, once, timed out the SPM-10 spec) because the disk was almost full: Playwright could not save the test trace (ENOSPC). With disk space freed, every test passed. These were not order-dependent failures and not caused by this change.
- **Not verified:** API tests use mocked identity and in-memory persistence; browser tests use the Firebase double. No live-project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending; keep SPM-41 In Progress until they are done.
