# SPM-84 acceptance criteria and verification

Source: the SPM-84 acceptance criteria as given by the story owner on 30 October 2026 ("Notify when the Lead assigns or reassigns a Coordinator"; builds on SPM-68 and SPM-69). The Product Backlog workbook itself was not read or updated for this record.

Team decisions (30 Oct 2026, pending PO confirmation) are recorded in `docs/requirements/effective-requirements.md` §4.5, SPM-84.

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Given the Lead assigns a Coordinator, then that Coordinator and the Event Organiser are notified. The Organiser's notification names the Coordinator. | `assignCoordinator` adds `coordinatorAssignmentNotifications(..., { change: 'assigned' })`: `event_assigned_to_you` to the Coordinator and `event_coordinator_assigned` to the owning Organiser ("{Coordinator} is now the Event Coordinator for “{title}”."). | `tests/spm-84/unit/coordinatorAssignmentNotifications.test.js`; `tests/spm-84/integration/assignmentNotificationsApi.test.js` (AC1 block); `tests/spm-84/e2e/spm84.assignmentNotices.spec.js` |
| Given the Lead reassigns an event, then the new Coordinator, the previous Coordinator and the Event Organiser are notified. | `reassignEventRequest` adds the same builder with `change: 'reassigned'` and the previous Coordinator: three notices. | Unit suite (AC2); API suite (AC2 block) |
| Given a notification, when the Coordinator clicks the link, then the event opens. | The new Coordinator's and the Organiser's notices take the page's default link, "View event" → `/requests/{id}`, which both may open. | API suite (both may open the event the notice names); `tests/spm-84/integration/assignmentNotificationsPage.test.jsx`; E2E |
| The acting Lead and other Leads aren't notified (CL3 row 43). | Leads are never recipients; `addressed()` drops the user who acted, including a Lead who was the previous Coordinator. | Unit suite (AC4); API suite (AC4 block: the Lead, a second Lead, a colleague and staff get nothing); E2E (the Lead has no notifications) |
| Given a reassignment, the previous Coordinator's notification says the event has been reassigned to the new Coordinator and has no link. | `event_reassigned_away`: "“{title}” has been reassigned to {new Coordinator}. You no longer manage it."; `linkFor` returns null for it and the page renders no link; "Mark as read" remains. | Unit suite; API suite (the previous Coordinator gets 404 on the event); page suite |
| Notifications are sent only when the assignment or reassignment is saved successfully. | The notices are written in the change's own transaction, after its other writes; a refusal throws before any write. | API suite (one committed transaction holds the change and its notices; eight refusals — 400, 403, 409 — write none) |

## Verification record

30 October 2026, local (macOS), on top of SPM-69 (203eb7f):

- **SPM-84 tests:** 10 unit, 13 API and 4 page tests, plus one Chromium journey (`npm run test:spm84`). With the two service changes removed, the 5 API tests that expect notices failed and the 8 refusal tests passed; restored, all passed. The tests were written after the code.
- **Story regression (Vitest):** SPM-68 110, SPM-69 59, SPM-85 20, SPM-26 84, SPM-41 28, SPM-46 78; notification suites SPM-61 24, SPM-47 35, SPM-63 34, SPM-34 13, SPM-56 51, SPM-36 30, SPM-92 63, SPM-19 50 (2 emulator skipped), SPM-10 150, SPM-88 7; `frontend/src/pages/notifications.test.jsx` 4. All passed.
- **Full checks:** root Vitest 2,232 passed, 55 skipped (opt-in live and emulator suites); Node suites 136 passed; frontend suite 101 passed; `npm run lint` and `git diff --check` clean; Playwright 120 of 120 passed; `npm run build` passed with the existing large-chunk warning.
- **Not verified:** API tests use mocked identity and in-memory persistence; browser tests use the Firebase double. No Firestore emulator or live-project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending; SPM-84 is not Done.
