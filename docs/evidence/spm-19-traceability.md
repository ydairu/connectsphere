# SPM-19 acceptance criteria and verification

Operational source: Product Backlog workbook, `01_Product Backlog`, SPM-19 "Enable Attendee Registration for Confirmed Events" (Sprint 4, To Do), and its 13 `03_Sprint Backlog` tasks, read on 28 October 2026. Criterion 1 says "confirmed events"; the Sprint Backlog task and SPM-88 extend it to Confirmed or Preparation, which is what is built. The workbook wording should be updated to match.

Team decisions D1–D5 (28 Oct 2026, pending PO confirmation) are recorded in `docs/requirements/effective-requirements.md` §3 (SPM-42) and §4.18.

| Backlog acceptance criterion | Implementation | Automated evidence |
|---|---|---|
| Registration is only available for confirmed events with registration enabled. | `registrationAvailability()` in `shared/registration.js` refuses unless registration is enabled and the status is Confirmed or Preparation (`registrationEligibleStatus`, SPM-88). An Attendee cannot reach any other event at all (SPM-42 scope). D5: an event moved back to Planning keeps its registrations but takes no new ones. | `tests/spm-19/unit/registration.test.js`; `tests/spm-19/integration/registrationApi.test.js` (AC1 block) |
| Opening and closing dates are configured by the Event Organiser; registration is limited by event capacity. | `opensAt`, `closesAt` and `capacity` in the `registration` section, normalised by `normaliseRegistrationSettings` and checked by `registrationSettingsErrors` (opens before it closes, closes by the event start, within the venue capacity) on the draft form and on `PATCH /api/requests/:id` (`validateRegistration`). D1: the owner edits `registration`, and only it, at Confirmed or Preparation. D2: the limit is the smaller of the Organiser's capacity and the largest approved venue. | Unit suite (AC2, D1); API suite (AC2 block); `tests/spm-42` and `tests/spm-64` updated for D1 |
| A confirmed event within its period and below capacity: the Attendee registers, is confirmed and receives event information. | `registerForEvent()` in `backend/src/services/registrationService.js`: one transaction reads the event, the lock, the Attendee's registration, the active registrations and the approved venues, then writes the registration, the lock and a `registration_confirmed` notice. The event page shows a confirmation with name, date/time and venue; "My registrations" lists each registration's status. | API suite (AC3 block); `tests/spm-19/integration/registrationPages.test.jsx`; `tests/spm-19/e2e/spm19.registration.spec.js`; `tests/spm-19/registration.emulator.test.js` (concurrency, CI only) |
| An Organiser or Coordinator sees appropriate registration details for their events, subject to access restrictions. | D3: `canViewRegistrations()` — the owning Organiser and the assigned Coordinator. `GET /api/requests/:id/registrations` returns the count, capacity and each Attendee's name, email, status and time. A colleague, staff or another Attendee gets 403, an unassigned Coordinator 404. Attendees never receive the `registration` section or other Attendees' details. | API suite (AC4 block); page suite; E2E |

Sprint Backlog tasks:

| Task | Where |
|---|---|
| Record the registration capacity decision | D2, effective-requirements.md §4.18 |
| Registration settings: enabled, opening and closing date/time, capacity, set by the Organiser | `shared/eventRequest.js`, request form, Registration section on the event page |
| Validate open before close, close by event start, capacity within venue capacity | `registrationSettingsErrors`, `validateRegistration` |
| Registration record, one active registration per Attendee per event | `eventRegistrations`, id `{eventId}_{attendeeUid}` |
| Only Confirmed or Preparation with registration enabled and open | `registrationAvailability` |
| Capacity checked inside a transaction | `registerForEvent` with `systemLocks/registration-{eventId}` |
| Register action, reason when unavailable, confirmation with name, date/time and venue | `frontend/src/components/AttendeeRegistration.jsx` |
| My registrations page | `frontend/src/pages/MyRegistrationsPage.jsx`, `/registrations` |
| Count and list for the assigned Coordinator and owning Organiser only, denied at the API | `listEventRegistrations`, `frontend/src/components/EventRegistrations.jsx` |
| Seed Attendees and a small-capacity event | `seed-attendee-2`, `seed-attendee-3`, `seed-req-a1-confirmed-small` (2 places) |
| Unit, API, page and end-to-end tests | `tests/spm-19/` (plus the emulator test) |
| Update effective-requirements.md and project_context.md | Done |
| Pull request and peer review | Not done |

Known gaps: the seeded two-place event has no approved venue booking, so its confirmation reads "Venue: To be confirmed" and the Organiser's capacity is the limit; the venue cap is tested with an approved booking in the API suite. Lowering the capacity below the current count keeps every registration. SPM-90's primary venue does not exist yet (D2 uses the largest approved venue). No Firestore rule change is needed: `eventRegistrations` is not named in `firestore.rules`, so the browser cannot reach it; this was not re-checked against the deployed rules.

## Verification record

28 October 2026, local (macOS):

- **Passed:** `npm run lint`, `git diff --check` and `npm run build` (existing large-chunk warning). Node suites 134 passed; frontend suite 101 passed; root Vitest 1,978 passed with 51 opt-in or emulator cases skipped; Playwright 112 of 112 passed in Chromium.
- **SPM-19 tests:** 18 unit, 20 API and 10 page tests, plus the Chromium journey (`npm run test:spm19`). With the full-event check or the registrant-access check removed from `shared/registration.js`, four API tests failed, so the suite detects both.
- **Manual check:** on the local Firebase double, Attendees 1 and 2 took the two places on the seeded event, Attendee 3 was refused as full, a repeat registration was refused, the assigned Coordinator got the list, an unassigned Coordinator got 404, and an Organiser save with registration closing after the event start got 400. In the browser, an Attendee registered and saw the confirmation and "My registrations".
- **Not run here:** `npm run test:spm19:emulator` (needs Java and the Firestore emulator; it runs in CI). No live Firebase project check; Firestore rules were neither edited nor deployed.

Human acceptance and peer review are pending; keep SPM-19 In Progress until they are done.
