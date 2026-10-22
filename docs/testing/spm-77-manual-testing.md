# SPM-77 manual acceptance checklist

Use a future event with two venue needs and the assigned Coordinator, relevant Venue Staff, and in-scope Organiser accounts. Record tester, date, environment, event/booking IDs, screenshots and pass/fail for every row. These checks have not been run by a person.

| Check | Result / evidence |
|---|---|
| Submit two venues with different time windows and attendee counts. On Venue Details, check that each current venue has its own period, status and next step; expand previous attempts after a replacement. Repeat as the Organiser. | Not run |
| Approve both. Cancel one as the assigned Coordinator. Reload and confirm only that venue is available again; the other remains Approved and unavailable to a competing event. If the event was Confirmed, check that it returned to Planning. | Not run |
| Replace the cancelled booking. Check that it stays under the same venue need, its cancelled attempt remains in history, and Confirm is blocked until Venue Staff approve the replacement. | Not run |
| Try an unavailable venue and a period overlapping only setup or turnaround. Check refusal does not change the other booking or reservation. | Not run |
| Cancel the whole event. Check all active venue holds and confirmed reservations are released; the overview says no replacement is needed. | Not run |
| Open the booking action API as an Organiser and an unassigned Coordinator. Check both are refused. Check an unrelated Organiser cannot read the venue booking list, while an in-scope Organiser sees no staff assignment or internal requirements. | Not run |
| At mobile and desktop widths, check the overview, history disclosure and booking link; reload after changes to confirm the displayed status persists. | Not run |
| **After SPM-74 is implemented:** flag one approved venue as unavailable. Confirm that the Organiser sees which venue is affected and the next step, while the other venue remains listed normally. | Blocked by SPM-74 |

SPM-77 remains **In Progress** until the SPM-74 dependency and Definition of Done checks are complete. Do not commit or push this increment.
