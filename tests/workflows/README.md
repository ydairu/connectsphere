# Cross-Story E2E Workflows

Story-focused suites remain under `tests/spm-N/e2e/`. Shared workflows live here and are
referenced by each relevant story rather than duplicated.

## Coordinator Reassignment

`e2e/coordinatorReassignment.spec.js` covers SPM-26 and SPM-46: reassignment through the
real Express API, followed by the Organiser opening the event in Chromium and seeing the
new Coordinator's name without their UID. Firebase is an in-memory double, not a live project.
The Coordinator's reassignment UI remains covered in `tests/spm-26/e2e/`.

This suite was relocated from `tests/spm-46/e2e/spm46.reassignedCoordinatorName.spec.js`;
older evidence records retain its historical location. Both `npm run test:spm26` and
`npm run test:spm46` include the relocated test.

```bash
npx playwright test tests/workflows/e2e/coordinatorReassignment.spec.js
```

## Venue Management

`e2e/venueManagement.spec.js` groups SPM-6, SPM-49, SPM-29, SPM-11 and SPM-30 into
16 independent Chromium tests. Story IDs appear in the describe block and each test title.
The existing Playwright discovery and CI command include this suite automatically.

## Run

```bash
npx playwright test tests/workflows/e2e/venueManagement.spec.js
```

```bash
npm run test:e2e
```

## Acceptance Coverage

| Story | Criteria exercised | Test titles within the grouped spec |
| --- | --- | --- |
| SPM-6 | Six core details and multiple layouts persist; one independently bookable space creates exactly one record; creator and timestamp recorded | `create one space, reopen every value and record creator` |
| SPM-6 | Invalid/required fields identified, input retained, no record created; correction succeeds | `missing and invalid fields retain input and create nothing` |
| SPM-6 | Failure reports no success, preserves input, writes nothing; retry succeeds | `failed create preserves input, no false success or write, retry succeeds` |
| SPM-49 | Coordinator and Venue Staff catalogue/detail viewing; every recorded layout; viewing makes no hold or booking | Create/reopen test, edit/reopen test and role tests |
| SPM-49 | Missing information reads `Not recorded`; empty catalogue communicated | `incomplete historical data and empty catalogue are explicit` |
| SPM-49 | Viewing is distinct from availability/suitability checking; errors do not fabricate data | Create/reopen persistence assertions; `read failures and missing venues show errors, not fabricated data` |
| SPM-29 | Saved values populate edit; six core fields update on the same identity; reopened values current; old/new field history with actor/time; commitments unchanged | `edit all catalogue fields without duplicating or changing arrangements` |
| SPM-29 | Invalid save identifies every affected field, saved data/history unchanged; Cancel writes nothing | `invalid edit and Cancel preserve saved values and history` |
| SPM-29 | Failure reports no success, input retained, no write; retry succeeds | `failed edit preserves input, no false success or write, retry succeeds` |
| SPM-11 | Confirmed bookings, tentative holds, maintenance and free intervals distinct; selected venue/period and previous/next navigation; cancelled booking ignored | `distinct calendar states, period navigation, venue selection and zero-buffer boundary` |
| SPM-11 | Another event cannot hold the same venue/time; actual cancellation releases a tentative hold | `ended block permits a new SPM-11 hold; competing event refused and cancellation frees it` |
| SPM-30 | Start/end/reason recorded; all five reason options offered; create/amend/cancel-edit/remove; unavailable calendar and Coordinator search exclusion; removal frees period | `maintenance create, amend, cancel edit, remove and Coordinator search` |
| SPM-30 | Invalid range and failed create/remove do not change persistence or falsely succeed | `invalid block, failed save and failed removal preserve persisted state` |
| SPM-30 | Ended block does not prevent a new booking request/hold | Hold competition/cancellation test |
| All five | Coordinator read-only; Organiser, Attendee and Technical Support denied catalogue/calendar; all non-Venue Staff denied create/edit/block mutations through direct URLs and API | Four parameterised role tests |

## Environment and Limits

- Real React, Express routes, middleware and services run against the resettable in-memory Firebase
  double. Test-only `/__double__/venue-fixtures` installs historical/calendar states and
  `/__double__/venue-state` inspects persistence and audit entries. Neither endpoint is in the product API.
- Tests use UTC and fixed intervals. Each test resets its database and gets a fresh browser session.
- Failure responses are injected with Playwright routing before the backend receives the write.
  They verify browser recovery and no write on a rejected transport, not a Firestore storage outage.
  Backend validation/persistence failures remain covered by story unit/integration tests.
- Hold competition uses two browser sign-ins and the real booking submission UI sequentially.
  It does not establish concurrent Firestore transaction correctness.
- Confirmed calendar bookings are fixtures because SPM-54 booking approval is not implemented.
  The cancellation test performs real arrangement sign-offs and event confirmation/cancellation.
- SPM-11's original no-turnaround criterion is superseded by SPM-73. The boundary test uses a
  zero-buffer venue; `tests/spm-73/e2e/spm73.calendarBuffers.spec.js` covers nonzero calendar buffers.
- SPM-29's affected-staff notification criterion remains outside this suite, following the earlier
  implementation deferral. This is a coverage gap, not removal of the workbook criterion.
- SPM-74 affected-booking recovery/notifications are separate scope. SPM-78 expiry, warnings, and calendar/search behavior are covered by `tests/spm-78/`; operational scheduling and human acceptance remain to be checked.
- No live Firebase, emulator, deployed rules, manual acceptance or complete story Done claim is made.
