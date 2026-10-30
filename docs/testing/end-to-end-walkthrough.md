# End-to-end manual walkthrough

One event from creation to cancellation, plus the equipment rejection path and completing a past event, using the seeded accounts. Labels in **bold** are the exact text of buttons, links, fields and messages in the frontend code. ⚠️ marks something the current UI cannot do, or does in a way a tester should know about. For the separate Preparation review, use `docs/testing/spm-88-manual-testing.md`.

This is a manual checklist. It has not been run in a browser as written; record what you see.

## Before you start

- [ ] Reset the seed so earlier demos are cleared: `SEED_ACCOUNT_PASSWORD=… node backend/scripts/seed.js --write --project=<FIREBASE_PROJECT_ID>` (run it without `--write` first for a dry run).
- [ ] Every seeded account is `<slug>@seed.connectsphere.test` with the password in `SEED_ACCOUNT_PASSWORD`. Set the browser to Singapore time (SGT): date/time fields use the browser's timezone.
- [ ] **Log in:** `/login` → **Email address**, **Password** → **Log in**; you land on `/profile`. **Switch user:** `/profile` → **Log out**.
- [ ] **Assignments.** Each is shown on screen; use the account the page names. With freshly seeded data:
  - Coordinator: chosen by the Event Coordinator Lead (`coordinator-lead@…`) in step 1b. Choose **Seed Coordinator 3** (`coordinator-3@…`), who has the lightest workload; the later steps assume it.
  - Venue Staff: usually **Seed Venue Staff** (`venue-staff@…`), named in the booking confirmation.
  - Technical Support Staff: almost certainly **Seed Venue + Technical Staff** (`venue-technical-staff@…`), not Seed Technical Staff, who already has the two seeded Pending Review requests. Named in the equipment request confirmation.

## Checklist

1. **Organiser creates, saves a draft and submits**
   - [ ] As `organiser-a1@…`, click **Create request** in the navbar (`/event-requests/new`, heading **Create Event Request**).
   - [ ] Fill **Event title/name** "Walkthrough Seminar", **Purpose**, **Expected attendance** `30`, **Duration in hours** `2`, **Preferred date/time** `20/11/2026 14:00` (needed for the conflict in step 3), **Venue/layout preferences** "Theatre", **Equipment requirements** "projector", and tick **Technical support is needed**.
   - [ ] **Save unsubmitted request** → toast **Draft saved**, "Your event request has been saved as a draft. You can continue editing it on this page."; the URL becomes `/event-requests/<id>/edit` and the heading **Edit Draft Event Request**.
   - [ ] Optional: **My drafts** (`/requests/drafts`, heading **Saved drafts**) lists it.
   - [ ] **Submit request** → toast **Request submitted**, "Your event request is now available for the next staff workflow."; card **Submitted for review** with **Back to requests**.
   - [ ] **Back to requests** (`/requests`, heading **Event requests**) → **View**. Note the `<id>`. Status **Submitted**; the **Event Coordinator** row reads **Unassigned** (SPM-68: nothing is assigned on submission).

1b. **The Event Coordinator Lead assigns a Coordinator (SPM-68)**
   - [ ] As `coordinator-lead@…`, click **Unassigned requests** in the navbar (`/requests/unassigned`, heading **Unassigned requests**). "Walkthrough Seminar" is listed with **Date and time**, **Duration** "2 hours", **Expected attendees** `30`, **Organisation** and **Submitted**, after the seeded "A2 unassigned (waiting for a Coordinator)" (oldest first).
   - [ ] On "Walkthrough Seminar", **Assign** → **Event Coordinator** lists "Seed Coordinator · 6 active events", "Seed Coordinator 2 · 2 active events", "Seed Coordinator 3 · 1 active event", with **Choose a Coordinator** selected and **Confirm assignment** disabled. The Lead is not listed.
   - [ ] Choose **Seed Coordinator 3** → **Confirm assignment** → "“Walkthrough Seminar” was assigned to Seed Coordinator 3."; the card disappears.
   - [ ] Optional: as `coordinator-3@…`, `/requests/unassigned` shows **You do not have access to this page**, and there is no **Unassigned requests** link.
   - [ ] As `organiser-a1@…`, reopen the event: the **Event Coordinator** row now reads **Seed Coordinator 3**.

2. **Review, return for clarification, resubmit, approve to Planning**
   - [ ] As the assigned Coordinator (`coordinator-3@…`): **Requests** shows **Events assigned to you** → **View** (`/requests/<id>`).
   - [ ] **Status actions** → **Start review** → **Status changed to Under review.**
   - [ ] **Return for clarification** → prompt "Return this request to the organiser for clarification or amendments?" → fill **Message to the organiser (required)** (the button stays disabled with "Enter a message to the organiser to continue." until it has text) → **Return for clarification** → **Status changed to Returned for clarification.**
   - [ ] As `organiser-a1@…`, open the event: a **Clarification requested** card shows the message. ⚠️ The Organiser gets no notification for this; they only see it on the request page.
   - [ ] Edit **Purpose** under **Event details** → **Save changes** → **Changes saved.**
   - [ ] **Status actions** → **Resubmit request** → **Status changed to Submitted.** The **Event Coordinator** row still names Seed Coordinator 3: a resubmitted request keeps its Coordinator and does not return to the Lead's queue.
   - [ ] As the Coordinator: **Start review**, then **Approve for planning** → **Status changed to Planning.** **Arrangements and cancellation** shows **Venue arrangement** and **Technical arrangement** as **Awaiting approval**; under **Status actions**: "The event can be confirmed once all mandatory venue and technical arrangements are approved."

3. **Coordinator requests a venue; a conflicting choice is blocked**
   - [ ] On `/requests/<id>` click **Venue booking requests** (`/requests/<id>/venue-bookings`, heading **Venue booking requests**, form **Request a venue**). **Start**, **End** and **Venue requirements** are prefilled from the event.
   - [ ] **Conflict:** **Venue** "Seed Hall (setup 30, turnaround 45) (capacity 200)" → **Submit booking request** → error: "The venue is not available for that period. This venue has a confirmed booking occupying it on Fri 20 Nov 2026, 08:30–13:45 SGT." (the seeded A1 booking, 09:00–13:00, with the hall's 30/45 minutes; this event's setup would start at 13:30).
   - [ ] **Success:** **Venue** "Seed Breakout Room (no setup or turnaround) (capacity 40)" → **Submit booking request** → "Booking request submitted to *Seed Venue Staff*. The venue is tentatively held." A card for the room shows **Status** `pending`, **Assigned Venue Staff**, **Hold expiry** (7 days from now). ⚠️ The status shows the raw value `pending`.
   - [ ] **Back to event**.

4. **Coordinator submits an equipment request**
   - [ ] On `/requests/<id>`, the **Equipment requests** card shows **Organiser's equipment needs** and **Request equipment**.
   - [ ] **Item 1:** **Equipment type** "Projector (3 available)", **Quantity** `2`, **Technical requirements (optional)** "HDMI at lectern". **Add item** → **Item 2:** "Wireless microphone (3 available)", **Quantity** `1`.
   - [ ] Optional: a quantity of `0` → **Check the highlighted fields.** and "Enter a whole number of 1 or more." on that row, values kept.
   - [ ] **Submit equipment request** → "Equipment request sent to *Seed Venue + Technical Staff* for review." The request shows **Status: Pending Review**, **Required from** / **Required until**, "2 × Projector — HDMI at lectern", "1 × Wireless microphone".

5. **Technical Support reviews: approve this request, reject a short one**
   - [ ] As the account named in step 4 (expected `venue-technical-staff@…`), click **Equipment requests** in the navbar (`/equipment/requests`). The request is under **Waiting for review**: **Status** Pending Review, **Equipment** "2 × Projector, 1 × Wireless microphone", **Submitted**. Click **Review on event**.
   - [ ] Availability is checked automatically: "Can be fulfilled: every equipment type has enough available units." and "Projector: 3 available, 2 requested — enough".
   - [ ] **Approve request** → "Approved. The technical arrangement is approved."; the request is **Approved** with **Approved by**; **Technical arrangement: Approved**. Back on the queue it is under **Reviewed**.
   - [ ] **Reject a short request (SPM-36):** as `technical-staff@…`, **Equipment requests** → the B1 request ("B1 planning (technical staff only)") under **Waiting for review** → **Review on event** (`/requests/seed-req-b1-planning`).
     - Expect "Shortfall: this request cannot be fulfilled.", "short by 1" on PA speaker set, **Approve request** disabled and "A request with a shortfall cannot be approved."
     - **Reject request** → **Reason for rejection (required)** is prefilled with "Not enough available units: PA speaker set (3 requested, 2 available)." (editable); fill **Suggested alternative (optional)**, e.g. "Two PA speaker sets and a portable speaker".
     - Clearing the reason disables **Confirm rejection** and shows "Enter a reason to continue."; **Cancel** closes the form without saving.
     - **Confirm rejection** → "Rejected. The Coordinator has been notified."; the request is **Rejected** with **Rejected by**, **Reason for rejection** and **Suggested alternative**; **Technical arrangement: Rejected**. The event stays **Planning**.
   - [ ] As B1's Coordinator, `coordinator-2@…`, open `/requests/seed-req-b1-planning`: the card shows the same rejection details and a form headed **Submit a revised request** with "This replaces the rejected request." Submitting it ("Equipment request sent to … for review.") sends it back to `technical-staff@…` for review. Until a revision is approved, **Confirm event** is not offered.
   - [ ] ⚠️ B1's Organiser (`organiser-b1@…`) sees **Technical arrangement: Rejected** in the existing arrangements summary, but no equipment request, reason or alternative.

6. **Venue sign-off; preparation remains read-only**
   - [ ] As the Venue Staff member named in step 3 (`venue-staff@…`), open `/requests/<id>`. ⚠️ There is no booking approval (SPM-54 is not built); the venue sign-off is the generic action below, and the booking stays `pending` with its hold.
   - [ ] **Status actions** → **Approve venue arrangement** → **Your decision has been recorded.**; **Venue arrangement: Approved**.
   - [ ] **Venue preparation** and **Equipment preparation** remain read-only in Planning and Confirmed. They unlock only when the event enters Preparation.

7. **Safety check; confirm; significant change; re-confirm; confirm again**
   - [ ] As the Coordinator, **Confirm event** is not offered yet: "The arrangements are approved. The event can be confirmed once it passes its safety check." **Submit for safety review** → "Send this event to the Safety Officer for its operational safety check? …" → **Submit for safety review**. The heading shows **Pending safety check** beside **Planning** (SPM-91).
   - [ ] As `safety-officer@…`, **Requests** shows **Safety-review queue** with the event → **View**. The event details are read-only; the **Safety check** card lists **Booked venues** with capacity, layouts, accessibility features and **Operating hours (venue restriction)** (SPM-66). Choose a **Result** for each of the six checklist items, choose **Approve** → **Record safety review** → back on the queue with "Safety review recorded: Approve." The event is no longer listed, and its link now says "You do not have access to this request."
   - [ ] As the Coordinator, the heading shows **Safety approved** and the Notifications page has "“…” passed its safety check." **Confirm event** → **Status changed to Confirmed.**
   - [ ] **Start Preparation** is now offered on the Confirmed event. Leave it for the separate Preparation review (`docs/testing/spm-88-manual-testing.md`).
   - [ ] **Event details** → **Expected attendees** `35` → **Save changes** → **Confirm significant change**: "You changed Expected attendees. Saving keeps the recorded venue and technical sign-offs but marks them Changed since approval; you then choose which need re-approval. The event moves back from Confirmed to Planning … The safety check is withdrawn …"
   - [ ] **Save significant change** → **Changes saved.**; status **Planning**; both arrangements still **Approved**; the heading shows **Safety check required again** (SPM-91); a **Sign-offs changed since approval** card lists the venue booking and **Technical arrangement — Changed since approval** (SPM-87). **Submit for safety review** and **Confirm event** are not offered.
   - [ ] Tick both and **Send selected back for re-approval** → "The selected sign-offs were sent back for re-approval."; both arrangements **Awaiting approval**; the **Change Log** has a **Sign-offs sent back for re-approval** entry. (Alternatively, **None need re-approval** keeps both approvals and goes straight to the safety check.)
   - [ ] As the Technical Support member: the request is still **Approved**, with "After a significant change, the event coordinator sent the technical sign-off back for re-approval. Re-confirm to approve it again." → **Re-confirm approval** → "Approval re-confirmed. The technical arrangement is approved again." and a **Re-confirmed by** row.
   - [ ] As the Venue Staff member: **Venue bookings** shows the booking **Awaiting re-approval** → **View details** → **Approve booking** → **Confirm approval**.
   - [ ] As the Coordinator, **Submit for safety review** again; as `safety-officer@…`, approve it from the queue as above. The **Safety check** card now lists the earlier review too.
   - [ ] As the Coordinator, **Confirm event** → **Status changed to Confirmed.**

8. **Complete and cancel**
   - [ ] **Mark as completed** (seeded past event): as `coordinator@…` (Seed Coordinator), open `/requests/seed-req-a1-confirmed-past` ("A1 preparation (event held, ready to complete)", held on 1 Oct 2026). **Status actions** → **Mark as completed** → "Mark this event as completed? A completed event cannot change status again." → **Mark as completed** → **Status changed to Completed.**; an **Event completed** card with **Marked completed on**. The action appears only once a Preparation event has ended.
   - [ ] **Direct cancel** (our event, as its Coordinator): **Cancel event** → "Cancel this event? A cancelled event cannot change status again." → **Reason (required)** → **Cancel event** → **Status changed to Cancelled.**; **Event cancelled** card with **Reason**; the equipment request becomes **Closed**; the room's tentative hold is released.
   - [ ] **Cancel at the Organiser's request** (`seed-req-a1-confirmed`, "A1 confirmed (registration open)"):
     - As `organiser-a1@…`: **Request cancellation** → "Ask the event coordinator to cancel this event? The event stays active until they decide." → **Reason (required)** → **Request cancellation** → **Your decision has been recorded.** and "Cancellation requested — awaiting the event coordinator’s decision."
     - As `coordinator-3@…`: **Approve cancellation** → confirm → **Status changed to Cancelled.**; **Event cancelled** with "Cancelled at the organiser’s request." Its seeded confirmed hall booking is not released, by design.

9. **Change history and notifications**
   - [ ] As the Coordinator, **Change history** at the bottom of `/requests/<id>`: **Expected attendees** `30 → 35` with **Significant**, the Organiser's **Purpose** edit and the preparation changes, each with who and their role.
   - [ ] As `organiser-a1@…`, the same panel without Internal planning and preparation.
   - [ ] ⚠️ Status changes, sign-offs, the venue booking and equipment approvals and rejections are recorded but not displayed anywhere (the equipment card shows who approved or rejected a request and when).
   - [ ] **Notifications** (navbar, `/notifications`), each with **Mark as read** and **View event**:
     - Coordinator 3: "The equipment request for “Walkthrough Seminar” was approved. The technical arrangement is approved.", the "…was re-confirmed…" version, and "The organiser has requested cancellation of “A1 confirmed (registration open)”."
     - Coordinator 2: "The equipment request for “B1 planning (technical staff only)” was rejected. Submit a revised request. Suggested alternative: …" with **Reason:** the rejection reason.
     - Venue Staff and the Technical Support member: "“Walkthrough Seminar” has had a significant change (Expected attendees). It has moved back to Planning, and the venue and technical sign-off must be approved again." and "“Walkthrough Seminar”, which you are assigned to, has been cancelled." with **Reason:**
     - organiser-a1: "“Walkthrough Seminar” has been cancelled by the event coordinator." with **Reason:**, and "Your cancellation request was approved. “A1 confirmed (registration open)” has been cancelled."
   - [ ] ⚠️ No notification is sent for submitting, returning, approving to Planning, a venue booking request or an equipment request submission.
