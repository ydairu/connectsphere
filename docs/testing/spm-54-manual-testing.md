# SPM-54 manual acceptance and implementation checklist

Status: implementation available; human acceptance is **Not run**. Automated browser checks use a local Firebase double and do not constitute human or deployed-project acceptance.

## Setup

- Use a test environment and record its name, date, tester and account roles with the results. Do not use production events for destructive test cases.
- Use a future Planning event assigned to your Coordinator. Have its assigned Venue Staff account, another Venue Staff account and the owning Organiser available. Booking assignment is automatic; read the assigned staff name before switching accounts.
- With the repository's demonstration accounts, `seed-req-a1-planning` has 80 attendees. The Seed Hall holds 200 and is suitable for the main approval test. The Seed Breakout Room holds 40 and is useful for the capacity-refusal test. Do not expect the smaller room to approve for that event.
- Use a future interval without existing commitments. The browser displays local time; include the timezone in evidence. The hall occupies an additional 30 minutes before and 45 minutes after the booking.
- Open the event, then **Venue booking requests**. Staff open **Venue bookings** in navigation, then **View details**. Keep separate events for destructive cancellation/rejection cases.

## Acceptance checks

| ID | Action and expected result | Human result |
|---|---|---|
| M1 | Coordinator submits a suitable venue request. Its assigned Venue Staff member opens it and selects **Approve booking**. The confirmation names the venue and start/end. Cancel returns to the decision controls without approving. | Not run |
| M2 | Select Approve again, then **Confirm approval**. Controls are disabled while saving. Success displays **Approved — venue confirmed**, approval time and the reserved period. Reload: approval persists and tentative expiry is absent. | Not run |
| M3 | Return to the staff pending queue and refresh. The approved request is absent; any other pending requests remain. | Not run |
| M4 | Coordinator opens the event's booking list and details. The correct venue, period and approved status appear. The event remains Planning; approval does not confirm the event or set its legacy venue sign-off. | Not run |
| M5 | Coordinator opens Notifications. The approval notice's **View booking** link opens exactly the approved request. Reloading or retrying approval does not create a second notice. | Not run |
| M6 | Open the venue calendar for the booked interval. It shows a confirmed booking instead of a tentative hold, with setup and turnaround still occupied. | Not run |
| M7 | Search available venues over the booked period or its buffers. The venue is excluded. Attempt a conflicting request directly through the booking form: it is refused. | Not run |
| M8 | Submit a request whose attendance exceeds capacity. Staff attempt approval: a clear capacity refusal appears and the booking remains pending. Repeat with a missing required facility configured in the event's structured venue requirements. | Not run |
| M9 | Submit two venue requests for one event and approve one. The other keeps its own pending status, assignee and hold. Event status stays Planning. | Not run |
| M10 | Open the same booking in two staff tabs. Approve in the first, then approve from the stale second tab. It is refused; **Reload booking** reveals the saved approval. Try the URL and action as unassigned staff and another role: access/action is refused. | Not run |
| M11 | Coordinator saves a significant change, such as moving the event start. The approved booking and its original reserved interval remain. Existing event-level sign-off reset behaviour is separate; Coordinator-controlled booking reapproval awaits SPM-87. | Not run |
| M12 | On a future Confirmed test event with an approved booking, Organiser requests cancellation. The venue remains booked while pending, returned for information or refused. | Not run |
| M13 | On separate future Confirmed test events, test direct Coordinator cancellation and approval of the Organiser's cancellation request. Every venue reservation for that event is released; booking history is retained, and unrelated events remain booked. | Not run |
| M14 | Reject a Planning event with an approved booking. The booking closes and the reservation is released. Recheck the calendar/search for the freed period, allowing for any unrelated commitment. | Not run |
| M15 | In a controlled test fixture, expire a pending hold and attempt approval. It can approve only if still free. If another request acquired the period, approval is refused. A removed or mismatched hold requires replacement. | Not run |

M12–M13 require an event that reaches Confirmed through the existing status flow. Booking approval alone does not satisfy that flow's legacy arrangement sign-offs. Record a blocked setup if the environment cannot provide it; do not treat a fixture as evidence that later safety/readiness workflows exist.

The following checks are **waiting for dependent stories**, not passed: safety-approved Preparation editing (SPM-67/88, SPM-48/89), Coordinator-selected reapproval (SPM-87), and complete required-venue readiness/per-venue attendance (SPM-79/81).

## Direct API checks

Use an authenticated test session to call `POST /api/requests/:eventId/venue-bookings/:bookingId/actions` with `{"action":"approve"}`. Keep tokens out of screenshots and committed evidence.

- No authentication: 401.
- Account without Venue Staff role: 403.
- Venue Staff not assigned to the booking, wrong event/booking association or missing booking: 404.
- Extra fields such as `status` or `ownerUid`, or an unknown action: 400 for an accessible pending booking.
- Already decided, wrong event status, unsuitable venue, released hold or conflicting availability: 409, with no additional approval/activity/notification writes.
- Valid assigned pending request in Planning: 200 with `booking.status` equal to `approved`; subsequent reads expose `canApprove: false` and `canReject: false`.

## Implementation tasks for review

- [x] Add approval and confirmation to booking details.
- [x] Enforce the assigned Venue Staff role and pending/Planning gates in the backend.
- [x] Recheck current attendance, facilities, booking interval and buffered availability.
- [x] Convert the exact linked hold to a confirmed reservation atomically with approval, activity and notification.
- [x] Show approval to staff and Coordinator; remove it from the pending queue.
- [x] Integrate confirmed-booking calendar and search behaviour.
- [x] Notify the current assigned Coordinator with a booking link.
- [x] Release confirmed reservations on whole-event cancellation and rejection.
- [x] Preserve other bookings and retain the approval/reserved interval after significant edits.
- [x] Refuse duplicate/stale decisions and test concurrent decisions against the emulator.
- [x] Add unit, service/API, component, browser and emulator tests.
- [x] Record verification results and outstanding criteria in the project progress records.
- [ ] Complete the human acceptance checks above and attach evidence.
- [ ] Complete the dependent acceptance criteria before marking SPM-54 Done.
- [ ] Complete independent peer code review.

Git publication is excluded by the user's instruction: keep all changes local; do not commit, push or create a pull request.

Verification and acceptance-criterion mapping are in `docs/evidence/spm-54-traceability.md`.

## Repeat automated checks

```sh
npm run test:spm54
npm run lint
npm test
npm run build
```

With Firebase CLI and a supported Java runtime installed, the isolated emulator command is:

```sh
firebase emulators:exec --only firestore --project demo-connectsphere-spm54 --config tests/spm-54/firebase.emulator.json "npm run test:spm54:emulator"
```

The emulator suite resets only the `demo-connectsphere-spm54` emulator database and refuses to run unless `FIRESTORE_EMULATOR_HOST` is exactly `127.0.0.1:8085`. Ordinary `npm test` skips these four emulator tests; run the explicit emulator command to verify concurrency.
