# SPM-71 acceptance and verification — 29 October 2026

Status: **In Progress**. The Product Backlog workbook under `docs/` records the team-directed removal of the no-available-staff criterion. This record maps the remaining criteria to the local implementation and tests; manual acceptance and the live-project backfill write remain pending.

| Revised acceptance criterion | Implementation | Evidence |
|---|---|---|
| Entering Planning assigns one member of each staff role automatically. | `statusTransitionService.js` calls `eventStaffAssignmentService.js` in the existing status transaction; the event stores one canonical UID per role. | `eventStaffAssignmentService.test.js`; `tests/spm-71/e2e/spm71.assignment.spec.js` |
| Choose the fewest active Planning, Confirmed or Preparation events; break ties by least recent assignment. | `shared/eventStaffAssignment.js` counts by current status and uses each role's locked assignment sequence. | `shared/eventStaffAssignment.test.js`; `tests/spm-71/integration/eventStaff.emulator.test.js` |
| Notify assignees and show the event in their assigned list. | Assignment notices and activity commit with the status change; existing scoped list uses `assignedStaffUids`. | Service test and SPM-71 Chromium journey |
| Assigned staff view the event and edit only their own preparation section under SPM-48. | `shared/permissions.js` checks canonical role ownership; the existing Preparation status gate remains. Legacy request reviewers keep request decision rights. | Shared unit test, SPM-71 request-routing tests, SPM-71 Chromium journey, SPM-48/SPM-88 suites |
| Cancelled or Completed events stop contributing to workload. | Workload counts only Planning, Confirmed and Preparation at selection time; Rejected is also excluded. | Shared unit test |

## Verification performed

- `npm test`: 146 Node tests, 101 frontend tests, 1,989 root Vitest tests passed; 56 opt-in root tests skipped. The Chromium suite passed 114/114 journeys. HTTP cases use mocked identity and in-memory persistence; browser journeys use the in-memory Firebase double.
- `npm run lint` and `npm run build` passed. The production build retained its existing large-chunk warning.
- `npm run test:spm71:emulator` passed its simultaneous Planning-transition case on the local Firestore emulator. The test verifies transaction retry, workload distribution, activity, and assignment notices; it is not live-project verification.
- Workbook cell, formula, sheet, merge, validation, and comment checks found only the intended SPM-71 criterion, note, and status edits; one exported style index differed but its effective alignment remained the same.
- The read-only backfill dry run on `connectsphere-6546c` found 139 active events needing canonical staff assignment. It reported two events with conflicting historical Venue Staff reviewers, no ineligible historical reviewers, and 33 role assignments requiring workload fallback. Every proposed choice is recorded in `docs/evidence/spm-71-backfill-dry-run.md`. No live-project write was made.

## Remaining checks

- Review the live-project dry-run report, then apply the backfill and verify a sample of historical requests before deploying the new routing. Backfill write mode has been tested with an in-memory store, but has not run on the live project; the Firestore emulator case covers concurrent Planning transitions.
- Complete the manual checklist in `docs/testing/spm-71-manual-testing.md`, including actual staff accounts and direct API authorisation checks. Do not mark SPM-71 Done until those checks and the team's Definition of Done pass.
- No GitHub commit or push was performed. No Firestore rules edit or deployment was performed.
