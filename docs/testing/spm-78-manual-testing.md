# SPM-78 manual testing checklist

Status: **Not run by a human.** The browser suite uses the local Firebase double. Use a test Firebase project and test accounts for this checklist.

Before testing, run the backfill in dry-run mode (`npm run backfill:venue-holds --prefix backend`) and review every proposed deadline and unresolved hold. Apply it with `npm run backfill:venue-holds --prefix backend -- --write` only after that review. Confirm that the GitHub Actions workflow `Venue hold expiry` is on the default branch, its three Admin credentials are configured as secrets, and a manual dispatch succeeds. The scheduled run should occur at the top of each hour; GitHub may delay it.

To check warnings and expiry in one sitting on the **test project**, create a booking normally, then use the Firestore console to set the same ISO `holdExpiresAt` on its `venueBookingRequests/{bookingId}` document and linked `venueAvailability/{holdId}` document. Set both to 30 minutes in the future and manually dispatch the workflow to check the warning. Then set both to one minute in the past: check the calendar, search, queue and approval refusal *before* dispatching the workflow again, then dispatch it to check the expiry notice and recorded status. Use a separate untouched booking to check the real seven-day creation deadline and a separate booking for timely approval.

| Check | Steps and expected result | Result |
|---|---|---|
| Seven-day hold | As the assigned Coordinator, submit a venue request on a Planning event. Its hold expiry is seven days after creation. No equipment hold is created. | Not run |
| Warning | Use a controlled test hold approaching its deadline. At the first hourly run after the 24-hour threshold, the current assigned Coordinator gets one in-app warning linked to that booking. Re-run the task; no second warning appears. | Not run |
| Exact deadline | At the stored expiry time, try the Venue Staff approval URL and API directly. Approval is refused. The staff queue no longer shows the request, even before the next scheduled run. | Not run |
| Venue availability | View the period on the calendar and search for it. The expired hold and its setup/turnaround do not block it; another booking or maintenance block still does. | Not run |
| Expiry record | After the next hourly run, the Coordinator gets one expiry notice. The request reads **Expired** in booking history, a new request can be submitted, and the event remains Planning. Running the task again changes nothing. | Not run |
| Other arrangements | Expire one of several venue holds. Other venue bookings and equipment reservations remain as they were. | Not run |
| Timely approval | Approve another request before its deadline. It becomes a confirmed booking and remains unavailable after the former deadline. No expiry notice appears. | Not run |
| Failure and recovery | Interrupt one task run, then rerun it. Each due hold gets at most one warning and one expiry notice; inspect workflow logs and any unresolved-record report. | Not run |

Record the project, test account roles, hold IDs, observed timestamps, workflow run link or ID, screenshots, and any failed step before claiming manual acceptance. Do not use production events for time-controlled tests.
