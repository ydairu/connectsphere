# SPM-78 acceptance and verification

Source: Product Backlog workbook row SPM-78, Sprint 3, **In Progress**; effective requirements §9.4. The workbook remains untracked and its status was not changed by this increment.

| Acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Holds last seven days and apply to venues only | Existing hold creation and `holdExpiresAt` stay in `shared/venueAvailability.js`; expiry service touches venue holds and booking records only. | `tests/spm-78/venueHoldExpiry.test.js` deadline and unaffected-arrangement cases; browser journey. |
| Warn the Coordinator before expiry | Hourly task writes a 24-hour in-app warning once, addressed to the current assigned Coordinator. | Service tests for threshold, retries, reassignment and missed warning; browser notice test; emulator overlapping-run test. |
| Expire unapproved hold, release venue, notify Coordinator | Task transaction marks the booking Expired, releases only its linked hold, records activity and sends one notice. Read paths enforce the deadline immediately. | Service tests; browser status, queue and notice test; emulator concurrency test. |
| Calendar and venue search show the period available | Calendar excludes expired hold and buffer slots; existing venue search and conflict checks use the same deadline. | Service boundary test and browser calendar/search journey; existing SPM-16/SPM-75 suites. |
| Approval before deadline confirms without later expiry | Approval rejects at or after the deadline and converts an earlier hold into a confirmed booking. | Updated SPM-54 boundary test; SPM-78 service, browser and emulator tests. |
| Event stays in Planning | Expiry makes no status change and does not release equipment or other bookings. | SPM-78 service, browser and emulator assertions. |

## Operational status

The repository defines an hourly GitHub Actions workflow and an Admin SDK command. The default-branch schedule, repository secrets and live Firebase run have **not** been verified. Existing holds missing a deadline need the dry-run backfill and review before an explicit write run. Human checks in `docs/testing/spm-78-manual-testing.md` are **Not run**. SPM-78 must remain **In Progress** until these operational and manual checks are complete.

Verification environments: unit/service tests use in-memory persistence; browser tests use the real React and Express application with a Firebase double; concurrency tests use an isolated local Firestore emulator. None proves deployed scheduling or production database behavior. No Firestore rules were edited or deployed.

## Local verification — 19 October 2026

- Lint and production build passed. The build retained its existing large-bundle warning.
- Existing Node and frontend suites passed: 128 and 101 tests. Full root Vitest passed: 1,748 tests, with 41 opt-in live/emulator tests skipped.
- The isolated Firestore emulator passed both SPM-78 concurrency tests. The focused SPM-78 browser suite passed both tests.
- Full Playwright regression ran 96 tests: 95 passed and one SPM-54 assertion failed because the booking page now labels the pending status **Under review**. That assertion was updated and its focused rerun passed. The full Playwright suite was not rerun after the assertion change.
- No manual review, live Firebase run, repository-secret check, scheduled GitHub Actions run, or production backfill was performed.
