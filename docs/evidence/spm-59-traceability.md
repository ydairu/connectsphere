# SPM-59 acceptance criteria and verification

Operational source: Product Backlog workbook, `01_Product Backlog`, SPM-59 "Withdraw from a Registered Event and Release the Place to Another Attendee" (Sprint 4, To Do), and its `03_Sprint Backlog` tasks, read on 31 October 2026. AC3 also delivers SPM-39's former fourth criterion (moved 29 Oct 2026). The tests were written from the criteria before the code and failed first (43 of 46).

Team decisions X1–X8 (31 Oct 2026, pending PO confirmation) are in effective-requirements.md §4.18.

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| AC1 Withdrawal is permitted where the Organiser has allowed it. | `withdrawalAllowed` and `withdrawalClosesAt` in the registration section (form, Registration section, `validateRegistration`); `canWithdraw()` refuses when not allowed, after the cut-off, after the event starts, or on a finished event (X1). | `tests/spm-59/unit/withdrawal.test.js`; `tests/spm-59/integration/withdrawalApi.test.js` (AC1); `tests/spm-59/integration/withdrawalPages.test.jsx` |
| AC2 A registered Attendee selects Withdraw Registration and confirms: the registration is cancelled and the place released. | Withdraw button with a confirm step; `withdrawRegistration()` sets Withdrawn in the locked transaction, and the place is no longer held. | Unit, API (AC2) and page suites; `tests/spm-59/e2e/spm59.withdrawAndInvite.spec.js` |
| AC3 With a waiting list, the next person (first come, first served) is notified and invited to apply. (Also SPM-39 AC4.) | `settleWaitingList()` invites the first waiting by `waitlistSequence`, with a 48-hour deadline (X2) and an in-app notice; the place is held (X3); accept, decline or lapse (X4, X5); freed places from any cause go to the list first (X6). | Unit and API (AC3) suites; page suite (invitation card, notice link); E2E; `tests/spm-59/withdrawal.emulator.test.js` (CI only) |
| AC4 A withdrawn registration shows as Withdrawn. | `presentOwnRegistration()` and the status labels: "Withdrawn" on My registrations and the event page. | API and page suites; E2E |
| AC5 The registered count drops by one; a freed place follows the invitation process. | The registered count counts Registered records only; `placesHeld()` adds open invitations for capacity. | API suite (count, invitation, two withdrawals at once) |

Also delivered: X7 leave the waiting list; X8 register again after withdrawing; an invited Attendee is refused when trying to register instead of accepting.

## Verification record

31 October 2026, local (macOS):

- **Passed:** `npm run lint`, `git diff --check` and `npm run build` (existing large-chunk warning). Node suites 147; frontend suite 101; root Vitest 2,348 passed with 58 opt-in or emulator cases skipped; Playwright 124 of 124 in Chromium.
- **SPM-59 tests:** 21 unit, 18 API and 7 page tests, plus the Chromium journey (`npm run test:spm59`). With invitations turned into automatic registrations and the withdrawal-allowed check removed, 13 tests failed; restored, all passed.
- **Not run here:** `npm run test:spm59:emulator` (needs Java and the Firestore emulator; it runs in CI). API tests use mocked identity and in-memory persistence; browser tests use the Firebase double. No live-project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending. With this merged, SPM-39 and SPM-59 can both be marked Done after acceptance.
