# SPM-79 manual acceptance checklist

Record tester, date, environment, account UIDs, screenshots, and pass/fail beside each check. Use a future Planning event assigned to the Coordinator. Keep the backlog In Progress until the customer checks and SPM-67 safety handoff are complete.

| Check | Result / evidence |
|---|---|
| Submit a 100-person main hall and a 30-person breakout room, with different intervals inside one 100-person event. Verify both requests appear under the event with their own status, expiry and Venue Staff queue entry. | |
| Try an interval outside the event, zero attendees, more than event attendance, and more than room capacity. Verify no booking or hold is created. | |
| Approve one request and reject the other. Verify the event stays Planning, Confirm returns 409, and the approved venue remains reserved. | |
| Replace the rejected request. Verify it carries the same venue need, retains the earlier request in history, and becomes ready after approval. | |
| Expire a pending hold in a controlled environment. Verify only that need is unresolved and its venue is available; the other approved booking stays linked. | |
| Try another Coordinator, unassigned Venue Staff, direct Confirm, and `approve_venue`. Verify each is refused without a booking or status write. | |
| Check the booking form and request list at desktop and mobile widths. Verify editable times and attendee count refresh available venues. | |
| Verify a technical approval remains required when the event asks for equipment or technical support. | |

SPM-67 must separately verify Send for Safety Check and the safety queue when that story is implemented.
