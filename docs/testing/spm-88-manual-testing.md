# SPM-88 manual review

SPM-88 is incomplete until SPM-19 provides attendee registration. SPM-87 now provides the significant-change re-review (29 October 2026, local; not yet accepted). SPM-91/92 now records the safety approval that Start Preparation reads (27 October 2026, local; not yet accepted). Record the date, test event ID, account, and actual result for each check. Use separate events for completion and cancellation because those actions close an event.

## Test setup

1. Use a non-production Firebase project with seeded Coordinator, Organiser, Venue Staff, Technical Support Staff and Attendee accounts. Confirm the chosen future event is in Confirmed, has assigned staff and a valid safety approval from SPM-91/92 (the seeded Confirmed event has one; a new event gets one through the Safety Officer's review). The in-memory browser double also has a test-only shortcut that records an approval, in `tests/shared/firebase-double/doubleServer.js`.
2. Keep a second Preparation event whose end time has passed for completion. Use two more future events for direct and requested cancellation. Give those events a venue booking and equipment reservation when testing release.
3. Check the event's stored `eventRequests/{id}/activity` entries and each user's in-app Notifications page. This requires backend/database access; the request page currently shows field change history, not status history.

## Start Preparation and staff work

- [ ] The assigned Coordinator sees **Start Preparation** on a Confirmed event with valid safety approval. An unassigned Coordinator does not see it and a direct API call returns 404. Organiser or staff direct calls return 403.
- [ ] Without safety approval, the action is absent and a direct call returns 409 `safety_approval_required`; status, activity and notices stay unchanged.
- [ ] Starting Preparation changes the label to **Preparation**. One `status_changed` entry has Confirmed, Preparation, the Coordinator and time. Each assigned Venue or Technical Support Staff member receives one notice, including a member holding both roles.
- [ ] Venue Staff can save only Venue preparation status and notes. Technical Support Staff can save only Equipment preparation status and notes. A wrong-section PATCH returns 403. Invalid status or overlong notes return 400 without a write.
- [ ] Before Preparation and after the event closes, both sections are read-only. The Coordinator sees staff updates. The Organiser and Attendee see neither preparation section nor its history.

## Later actions

- [ ] Confirmed cannot jump straight to Completed. A Preparation event cannot be completed before its end; after the end, the assigned Coordinator can mark it Completed and a status history entry is saved.
- [ ] On a future Preparation event, direct cancellation requires a reason. A pending Organiser cancellation request blocks direct cancellation, but remains actionable after Preparation starts. Approval of that request cancels the event. After the start time, both cancellation paths are refused.
- [ ] For each cancellation path, check Cancelled status, status history, affected-user notices, and release of event venue/equipment reservations. Other events' reservations stay active.
- [ ] Cancelling an approved venue booking while the event is in Preparation returns the event to Planning and saves a status history entry.
- [ ] A significant edit in Preparation moves the event back to Planning (SPM-87), with a status history entry, the safety approval withdrawn and the recorded sign-offs marked Changed since approval for the Coordinator. Preparation sections become read-only again.
- [ ] Check attendee visibility in Confirmed and Preparation. Check registration in both statuses when SPM-19 exists.

## Acceptance record

Keep SPM-88 not Done until every applicable check passes against the integrated SPM-91/92, SPM-87 and SPM-19 flows, including a real backend and browser run. Record failures and the environment used; the in-memory double does not verify the deployed Firebase project.
