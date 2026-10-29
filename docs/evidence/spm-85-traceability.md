# SPM-85 acceptance criteria and verification

Source: the SPM-85 acceptance criteria and notes as given by the story owner on 29 October 2026 ("Notify the Event Coordinator Lead when a new request is submitted", from SPM-21, Change 5; depends on SPM-68). The Product Backlog workbook itself was not read or updated for this record.

Team decisions (29 Oct 2026, pending PO confirmation) and the evidence note are recorded in `docs/requirements/effective-requirements.md` §4.5, SPM-85.

| Acceptance criterion or note | Implementation | Automated evidence |
|---|---|---|
| Given an Organiser submits a request, then the Lead receives a notification with the event name, organisation, date and a link to the unassigned queue. | `submitDraftEventRequest` (`backend/src/services/eventRequestService.js`) reads the Leads with `loadUsersWithRole` before any write and, in the same transaction, adds `newUnassignedRequestNotifications` (`shared/notifications.js`): the message names the event and organisation, `eventStartsAt` carries the start, and the Notifications page shows it ("Event starts") and links to `/requests/unassigned` ("View unassigned requests"). | `tests/spm-85/unit/newUnassignedRequestNotifications.test.js`; `tests/spm-85/integration/leadNotificationApi.test.js` (AC1 block, including the transaction's reads and writes); `tests/spm-85/integration/leadNotificationsPage.test.jsx`; `tests/spm-85/e2e/spm85.leadNotified.spec.js` |
| Given several new requests, then each notification clearly identifies which event it's for. | One notice per request per Lead, each with its own `eventRequestId`, `eventTitle`, message and start. | Unit suite (AC2); API suite (two submissions, two notices); page suite (two notices listed separately) |
| All Event Coordinator Leads are notified (one shared unassigned queue; CL3 row 33). | Every user holding `coordinator_lead`; a submitter who is also a Lead is excluded by `addressed()`. | Unit suite (recipients); API suite (two Leads each notified once; Organiser-and-Lead submitter) |
| Only a first submission that enters the unassigned queue triggers the notification; a resubmitted Returned request goes back to its Coordinator (SPM-68; CL3 row 15). | The Leads are read and notified only when the action is `submit` and the submitted record is awaiting assignment (`awaitingCoordinatorAssignment`). | API suite (resubmit: no Lead notice and no `users` read) |
| No Lead accounts: the submission still succeeds (team decision). | An empty recipient list writes nothing. | Unit and API suites |

Not covered: the notice is not updated after assignment (known limitation, effective-requirements.md §4.5). Assignment and reassignment notifications (G8!C43) are not part of SPM-85.

## Verification record

29 October 2026, local (macOS), on top of SPM-41 (8b5e181):

- **SPM-85 tests:** 8 unit, 9 API and 3 page tests, plus one Chromium journey (`npm run test:spm85`). With the submit change removed, the 6 tests that expect a notice failed and the 11 "no notice" or content-only tests passed; restored, all passed. The tests were written after the code, not before.
- **Story regression (Vitest):** SPM-68 110, SPM-3 7, SPM-9 18, SPM-25 19, SPM-41 28, SPM-88 7; notification suites SPM-61 24, SPM-47 35, SPM-63 34, SPM-34 13, SPM-56 51, SPM-36 30, SPM-92 63, SPM-19 50 (2 emulator skipped), SPM-10 150, SPM-54 54 (4 emulator skipped), SPM-78 9 (2 emulator skipped), SPM-26 83. All passed.
- **Full checks:** root Vitest 2,145 passed, 55 skipped (opt-in live and emulator suites); Node suites 136 passed; frontend suite 101 passed; `npm run lint` and `git diff --check` clean; Playwright 118 of 118 passed; `npm run build` passed with the existing large-chunk warning.
- **Not verified:** API tests use mocked identity and in-memory persistence (`fakeFirestore`, which enforces reads before writes and applies a transaction's writes only on commit); browser tests use the Firebase double. No Firestore emulator or live-project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending; SPM-85 is not Done.
