# SPM-80 manual acceptance checklist

Story source: Product Backlog workbook, SPM-80, Sprint 3, In Progress. Record tester, date, environment, staff account UIDs, event ID, booking IDs, screenshots, and pass/fail for each check. Use a test event in Planning with two distinct venues and periods inside the event schedule. Sign in as the Venue Staff member assigned to each booking; assignments may differ.

| Check | Result / evidence |
|---|---|
| Coordinator submits two venue requests for one event. In each assigned staff queue, find a separate card for every request assigned to that staff member. Check event name, venue, start date/time, end date/time, and the booking-specific details link. | Not run |
| Open each details link, verify it opens the selected booking rather than its sibling, then return to the queue. | Not run |
| Approve one request. Refresh the relevant queues. The approved booking has left the pending queue; every other pending request for the event remains in its assignee's queue. | Not run |
| Use a fresh pair of requests and reject one with a reason. Refresh the relevant queues. The rejected booking has left the pending queue; its pending sibling remains visible. | Not run |
| Check a staff member with no assigned pending requests sees the empty message. Check an unassigned Venue Staff member sees no other member's requests and cannot open their booking details by direct URL. | Not run |
| Check the queue and selected details at desktop and mobile widths. Confirm both venue names, dates/times, and links remain readable without horizontal overflow. | Not run |

## Implementation tasks for review

- [x] Display event name and requested venue together in each pending queue card heading.
- [x] Keep the existing assigned-staff queue API, pending selection and booking-specific details links.
- [x] Add unit, HTTP API, component and browser tests for separate requests and sibling visibility after approval or rejection.
- [x] Update affected SPM-14 and SPM-53 UI assertions.
- [x] Run lint, build and targeted tests. Record full-suite result in the traceability record.
- [x] Keep SPM-80 In Progress in the Product Backlog.
- [ ] Complete human acceptance checks and attach evidence.
- [ ] Complete independent peer review before marking Done.

Git publication is excluded by the user's instruction: do not commit, push or create a pull request.
