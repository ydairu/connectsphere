# SPM-81 manual acceptance checklist

Use a future event with two venue needs and the assigned Coordinator and Venue Staff accounts. Record tester, date, environment, event and booking IDs, screenshots, and pass/fail beside each check. These checks have not been run by a person.

| Check | Result / evidence |
|---|---|
| Submit separate main hall and breakout room requests. Approve the hall as its assigned Venue Staff member. Confirm only the hall is Approved and confirmed on the calendar; the breakout room remains pending in its assigned queue. | Not run |
| On a fresh pair, reject one request with a reason. Confirm the other request or approved booking is unchanged, and the rejected venue's hold is released. | Not run |
| Approve both bookings, then open one booking as the assigned Coordinator and select Cancel booking. Check the confirmation names the selected venue. Confirm only its reservation becomes available; the other remains Approved and unavailable to other events. | Not run |
| Replace the cancelled booking. Confirm it retains the original venue need, the cancelled decision stays in history, and Confirm remains blocked until the replacement is approved. | Not run |
| Repeat an individual cancellation on a future Confirmed event. Confirm the event returns to Planning, the other venue stays booked, and status history names the change and actor. | Not run |
| At a venue with 30 minutes setup and 45 minutes turnaround, attempt an approval with a competing commitment overlapping only a buffer. Confirm refusal. At the exact occupied-period boundary, confirm approval succeeds. | Not run |
| Try the cancellation API as an unassigned Coordinator, Venue Staff member, and Organiser; repeat a completed cancellation; try after the event starts and with an open event cancellation request. Confirm no partial changes. | Not run |
| Check the booking details and cancellation confirmation at desktop and mobile widths. Reload after each action and confirm the displayed statuses persist. | Not run |

## Implementation tasks

- [x] Reuse the existing per-booking action route and make action dispatch explicit.
- [x] Add a server-side cancellation decision for the assigned Coordinator, with transactionally linked reservation release and activity.
- [x] Return a Confirmed event to Planning and record status history when one approved booking is cancelled.
- [x] Allow a cancelled venue need to be replaced while retaining the earlier decision.
- [x] Show cancellation and refresh the Coordinator's booking page after it succeeds.
- [x] Add unit/service, HTTP API, browser and Firestore emulator coverage for independent decisions and cancellation.
- [ ] Complete human acceptance and independent peer review before marking SPM-81 Done.

Do not commit, push, or create a pull request for this increment.
