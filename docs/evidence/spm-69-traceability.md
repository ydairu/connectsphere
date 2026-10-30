# SPM-69 acceptance criteria and verification

Source: the SPM-69 acceptance criteria as given by the story owner on 29 October 2026 ("Event Coordinator Lead reassigns events between Coordinators"; builds on SPM-68 and reuses SPM-26). The Product Backlog workbook itself was not read or updated for this record.

Team decisions (29 Oct 2026, pending PO confirmation) are recorded in `docs/requirements/effective-requirements.md` §4.5, SPM-69.

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Given an active assigned event, when the Lead selects a different Coordinator and confirms, then the assignment is updated, and the history records the previous Coordinator, the new one, who made the change and when. | `reassignEventRequest` (`backend/src/services/coordinatorReassignmentService.js`): one transaction re-reads the event, checks `mayReassignCoordinator`, the status, `expectedCoordinatorUid` and SPM-68's `assignmentTargetRefusal`, then writes `assignedCoordinatorUid`, `assignedByUid`, `assignedAt` and a `coordinator_reassigned` entry (`previousCoordinatorUid`, `coordinatorUid`, `actor`, `at`) under the assignment lock. The Lead reaches the event from their Requests list; the page shows its Coordinator and a picker with active-event counts. | `tests/spm-69/integration/leadReassignmentApi.test.js` (AC1 block, including the transaction's reads and writes); `tests/spm-69/unit/leadReassignmentRules.test.js`; `tests/spm-26/` (unit, API, page); `tests/spm-69/integration/leadReassignPage.test.jsx`; `tests/spm-69/e2e/spm69.leadReassigns.spec.js` |
| Completed, Cancelled and Rejected events cannot be reassigned. | `reassignmentStatusRefusal` → 409 `terminal_status`, nothing written; an event finished after the page loaded is refused the same way and the page returns the Lead to their list. | Unit suite (AC2); API suite (AC2 block and "cancelled since the page loaded"); SPM-26 API and unit suites; page suite |
| Coordinators can no longer reassign events themselves; they can request a transfer (SPM-86). | `mayReassignCoordinator` requires the Lead role; the assigned Coordinator gets 403 and `canReassignCoordinator: false`, so no Reassign control is shown. The transfer request is SPM-86 and is not built. | Unit suite; API suite (AC3 block); SPM-26 suites; page suite; E2E |
| Given a reassignment, every record linked to the event (venue and equipment requests, holds, comments, history) stays with the event and becomes available to the new Coordinator. | Only the event's assignment fields change. Linked records are keyed by `eventRequestId` and checked against the event's current `assignedCoordinatorUid`; no stored creator uid is used for permissions. | API suite (AC4 block: equipment requests, an approved venue booking and its hold, activity history; the new Coordinator can act and edit, the old one gets 404); E2E (equipment request); SPM-14/17/34/54 suites |
| The Lead cannot approve, reject, return or confirm events (CL3 row 13). | The Lead role views `core` only, edits nothing and never passes `isAssignedCoordinator`, so it has no `availableActions`. | Unit suite (AC5); API suite (AC5 block: every attempt 403, record unchanged); E2E |

Not covered: reassignment notifications (G8!C43), the transfer request (SPM-86) and the Lead's overview with filters (SPM-70). Two truly simultaneous reassignments are not modelled by the in-memory harness; they rely on the shared assignment lock and Firestore's transaction retry.

## Verification record

29 October 2026, local (macOS), on top of SPM-85 (27e91c6):

- **SPM-69 tests:** 41 unit, 14 API and 4 page tests, plus one Chromium journey (`npm run test:spm69`). The tests were written after the code.
- **Story regression (Vitest):** SPM-26 84, SPM-68 110, SPM-85 20, SPM-65 15, SPM-46 78, SPM-14 30 (4 emulator skipped), SPM-17 76, SPM-56 51, SPM-36 30, SPM-28 81. All passed.
- **Full checks:** root Vitest 2,205 passed, 55 skipped (opt-in live and emulator suites); Node suites 136 passed; frontend suite 101 passed; `npm run lint` and `git diff --check` clean; Playwright 119 of 119 passed; `npm run build` passed with the existing large-chunk warning.
- **Not verified:** API tests use mocked identity and in-memory persistence; browser tests use the Firebase double. No Firestore emulator or live-project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending; SPM-69 is not Done.
