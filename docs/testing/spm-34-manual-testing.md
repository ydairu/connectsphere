# SPM-34 manual acceptance checklist

Use a Planning event assigned to an Event Coordinator, with an assigned Venue Staff account. Perform these checks in a test environment. Record the date, environment, account roles, and result for each step before claiming manual acceptance.

| Check | Action and expected result | Result |
|---|---|---|
| 1 | Coordinator submits a venue booking. Its assigned Venue Staff member opens it from the pending queue and selects **Reject booking**. The form asks for a reason; a blank or whitespace-only reason is refused. | Not run |
| 2 | Staff enters a reason and optional suggestion, confirms, then reloads. The booking reads **rejected** and shows both texts. It no longer appears in the pending queue. | Not run |
| 3 | Coordinator opens the booking and their notification. The booking shows the reason and suggestion; the notification shows the reason and **View booking** opens the same request. | Not run |
| 4 | Check the venue's calendar or availability for the declined period. Its tentative hold is gone. Coordinator submits a replacement; the new request is pending and the old rejection remains visible. | Not run |
| 5 | Submit two venue requests for one event and reject one. The other request and its hold remain unchanged; the event remains in Planning. | Not run |
| 6 | Call the reject API as another Venue Staff member, another role, and again after rejection. Each call is refused without a second notification. | Not run |

The automated browser test covers the main journey with an in-memory Firebase double. This checklist remains for a human check of the running application; it has not been signed off.
