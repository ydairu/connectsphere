# SPM-61 acceptance criteria and verification

Operational source: Product Backlog workbook, `01_Product Backlog`, SPM-61 (Sprint 4, To Do). Read on 25 October 2026. The criteria below are quoted from that row.

**Workbook note to correct:** the row's Notes say "Return notification already delivered in SPM-25", and the `03_Sprint Backlog` task says "Return is already sent by SPM-25". Neither was true. SPM-25 recorded "the Organiser is notified" as Not met (project_context.md, item 15), and `return_for_clarification` wrote no notification. SPM-61 adds it. It also closes SPM-45's recorded gap, "the Organiser is not notified of a rejection".

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Notification triggers: event request approved, rejected, returned for clarification, event confirmed. | `statusChangeNotifications()` in `shared/notifications.js` returns a notice for `approve`, `reject`, `return_for_clarification` and `confirm`, and nothing for any other action. `transitionEventRequest` in `backend/src/services/statusTransitionService.js` writes it in the status-change transaction. | `tests/spm-61/unit/organiserStatusNotifications.test.js`; `tests/spm-61/integration/organiserStatusNotificationsApi.test.js` |
| Notification contents: event name, decision type, reason (for rejection/return), link to the request. | Each notice stores `eventTitle`, a `type` (`request_approved`, `request_rejected`, `request_returned`, `request_confirmed`) and a message naming the event and decision. It also stores `reason` (the rejection reason or clarification message) and `eventRequestId`, which the Notifications page turns into a link to `/requests/:id`. | Unit, API and page suites |
| Approve: the Organiser is notified that the request has been approved and planning will proceed. | "“…” has been approved and moved to Planning. The event coordinator will now arrange the venue and equipment." | Unit and API suites |
| Return with a message: the notification contains the clarification request and a link to edit and resubmit. | The `request_returned` notice carries the message. The page shows it as "Message from the coordinator" with an **Edit request** link to the event page, where the owner edits and resubmits a returned request. | Unit, API and page suites; `tests/spm-61/e2e/spm61.organiserNotifications.spec.js` |
| Reject with a reason: the notification states the rejection and the reason. | The `request_rejected` notice carries the reason and says whether the request was rejected during review or during planning. | Unit and API suites (both stages); page suite |
| An Organiser with several requests: the notification identifies which event the decision applies to. | Each notice has its own `eventRequestId` and `eventTitle`, and its message names the event. | Unit and API suites |
| Confirm: the Organiser is notified that the event is confirmed, with a link to view the confirmed arrangements. | The `request_confirmed` notice has a **View arrangements** link to the event page. Its Event Status tab shows "Your event arrangements" (SPM-64). | Unit, API and page suites; E2E suite |

These rules come from the `03_Sprint Backlog` tasks, not from the acceptance criteria:

| Sprint Backlog task | Implementation | Automated evidence |
|---|---|---|
| Notify the owning Organiser. | One notice, addressed to `ownerUid`. Same-organisation colleagues, staff and Coordinators are not notified, and the user who acted is never notified (`addressed()`). | Unit and API suites |
| Send each notification in the same transaction as the status change, and none for refused actions. | Every refusal throws before the transaction writes anything. | API suite: unassigned Coordinator (404), other roles (403), missing reason or message (400), wrong status and Confirm before arrangements (409) |

In-app is the only channel, as for SPM-47 and SPM-63 (effective-requirements.md §4.20, team decision pending). No Firestore rule change or data migration is needed: notices use the existing `notifications` collection and `GET /api/notifications`.

## Verification record

25 October 2026, local (macOS):

- **Passed:** `npm run lint`, `git diff --check` and `npm run build` (with the existing large-chunk warning). The Node suites (128 tests) and the frontend suite (101 tests) passed.
- **SPM-61 tests:** 24 Vitest tests passed (unit, API and page) and both Chromium journeys passed (`npm run test:spm61`). With the transaction's notification call disabled, the six API tests that expect a notice failed, so they detect a missing notice.
- **Root Vitest:** 1,837 passed, 49 opt-in cases skipped, 5 failed. The same 5 fail on `main` without this change: SPM-14, SPM-34 and SPM-54 venue booking suites and one SPM-76 page test. The likely cause of the venue suite failures is the date: the SPM-14 fixtures pin `now` to 16 Oct 2026, so their seven-day holds expired on 23 Oct 2026 by the real clock. This was not investigated further, and the SPM-76 failure (a missing heading) may have a different cause. SPM-61 neither causes nor fixes them.
- **Playwright:** the full run passed 105 of 106. The failure was a 30-second timeout in `spm58_technical_staff_trace_a_reservation_to_its_event`. The SPM-58 spec passed on rerun with this change, alongside the SPM-61, SPM-25, SPM-45 and SPM-63 journeys (7 passed).

HTTP tests use mocked identity and in-memory persistence; Playwright uses the local Firebase double. Neither verifies the deployed Firebase project. Firestore rules were neither edited nor deployed.

The criteria were checked against the workbook row on 25 October 2026, and every one is covered. Human acceptance and peer review have not been done, so keep SPM-61 In Progress until they are.
