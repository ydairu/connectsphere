# SPM-61 acceptance criteria and verification

Operational source: Product Backlog workbook, SPM-61, Sprint 4. The criteria below are taken from a summary of the workbook row. They were not re-read from the workbook for this increment, so check them against it before acceptance.

SPM-25 ("the Organiser is notified" on return) and SPM-45 ("the Organiser is not notified of a rejection") recorded these notices as missing. This increment adds them, so it also closes those two gaps.

| Acceptance criterion (summarised) | Implementation | Automated evidence |
|---|---|---|
| Approving a request (Under Review → Planning) notifies the Organiser. | `statusChangeNotifications()` in `shared/notifications.js` returns a `request_approved` notice for the owner. `transitionEventRequest` in `backend/src/services/statusTransitionService.js` writes it in the status-change transaction. | `tests/spm-61/unit/organiserStatusNotifications.test.js`, `tests/spm-61/integration/organiserStatusNotificationsApi.test.js` |
| Rejecting a request from Under Review or Planning notifies the Organiser with the reason. | `request_rejected` carries the required reason and says which stage it was rejected at. | Unit and API suites (both stages) |
| Confirming an event notifies the Organiser, with a link to the confirmed arrangements. | `request_confirmed`. The Notifications page links it as "View arrangements" to the event page, whose Event Status tab shows "Your event arrangements" (SPM-64). | Unit and API suites; `tests/spm-61/integration/organiserNotificationsPage.test.jsx`; `tests/spm-61/e2e/spm61.organiserNotifications.spec.js` |
| Returning a request notifies the Organiser with the event name, the Coordinator's message and an edit link. | `request_returned` carries the clarification message. The page shows it as "Message from the coordinator" and links "Edit request" to the event page, where the owner edits a returned request. | Unit, API, page and E2E suites |
| Only the owning Organiser is notified. | One notice, addressed to `ownerUid`. Same-organisation colleagues, staff and Coordinators are not notified, and the user who acted is never notified (`addressed()`). | Unit and API suites |
| The notice names the right event when the Organiser has several. | Each notice stores `eventRequestId` and `eventTitle`, and its message names the event. | Unit and API suites |
| A refused action, or one by an unassigned Coordinator, sends nothing. | Every refusal throws before the transaction writes anything, so no notice is written. | API suite: unassigned Coordinator (404), other roles (403), missing reason or message (400), wrong status and Confirm before arrangements (409) |

In-app is the only channel, as for SPM-47 and SPM-63 (effective-requirements.md §4.20, team decision pending). No Firestore rule change or data migration is needed: notices use the existing `notifications` collection and `GET /api/notifications`.

## Verification record

25 October 2026, local (macOS):

- **Passed:** `npm run lint`, `git diff --check` and `npm run build` (with the existing large-chunk warning). The Node suites (128 tests) and the frontend suite (101 tests) passed.
- **SPM-61 tests:** 24 Vitest tests passed (unit, API and page) and both Chromium journeys passed (`npm run test:spm61`). With the transaction's notification call disabled, the six API tests that expect a notice failed, so they detect a missing notice.
- **Root Vitest:** 1,837 passed, 49 opt-in cases skipped, 5 failed. The same 5 fail on `main` without this change: SPM-14, SPM-34 and SPM-54 venue booking suites and one SPM-76 page test. The likely cause of the venue suite failures is the date: the SPM-14 fixtures pin `now` to 16 Oct 2026, so their seven-day holds expired on 23 Oct 2026 by the real clock. This was not investigated further, and the SPM-76 failure (a missing heading) may have a different cause. SPM-61 neither causes nor fixes them.
- **Playwright:** the full run passed 105 of 106. The failure was a 30-second timeout in `spm58_technical_staff_trace_a_reservation_to_its_event`. The SPM-58 spec passed on rerun with this change, alongside the SPM-61, SPM-25, SPM-45 and SPM-63 journeys (7 passed).

HTTP tests use mocked identity and in-memory persistence; Playwright uses the local Firebase double. Neither verifies the deployed Firebase project. Firestore rules were neither edited nor deployed.

Human acceptance has not been run. Keep SPM-61 In Progress until the criteria are checked against the workbook and accepted.
