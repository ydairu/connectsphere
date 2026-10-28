# SPM-66, SPM-91 and SPM-92 manual review

Record the date, event ID, account and actual result for each check. Use a non-production Firebase project, reseeded with `backend/scripts/seed.js` so `safety-officer@seed.connectsphere.test` exists. Criteria and evidence are in `docs/evidence/spm-66-91-92-traceability.md`.

## Set-up

1. As the assigned Coordinator of a Planning event (for the seed, `coordinator@…` and `seed-req-a1-planning`), request a venue booking and have the named Venue Staff member approve it.
2. As the assigned Technical Support Staff member, approve the technical arrangement, or approve the equipment request if the event has one.

## SPM-91 — submitting

- [ ] Before step 2, **Submit for safety review** is not offered, and a direct `submit_safety_review` call returns 409 `arrangements_not_ready`.
- [ ] After step 2, the Coordinator is offered **Submit for safety review**, and **Confirm event** is not offered. The note reads "The arrangements are approved. The event can be confirmed once it passes its safety check."
- [ ] Another Coordinator gets 404 from a direct call. The Organiser and staff get 403.
- [ ] After submitting, the heading and the requests list show **Pending safety check** beside **Planning**. A second submission returns 409.
- [ ] A direct `confirm` call returns 409 `safety_approval_required`.

## SPM-66 — the Safety Officer's access

- [ ] Before submission, `safety-officer@…` sees an empty **Safety-review queue**, and opening the event link says "You do not have access to this request."
- [ ] After submission, the queue lists the event. Its page shows the event details read-only: attendance, layout, accessibility and equipment. Internal planning notes and preparation sections are absent. **Booked venues** shows capacity, supported layouts, accessibility features, facilities and operating hours.
- [ ] The **Change Log** tab lists only attendance, venue and equipment changes.
- [ ] A direct `PATCH /api/requests/:id` as the Safety Officer returns 403 naming the fields.

## SPM-92 — the review

- [ ] **Record safety review** with a checklist item unanswered, or with **Request changes** and no comments, shows the errors beside the fields and saves nothing.
- [ ] **Request changes** with comments and internal notes: the officer returns to the queue, which no longer lists the event. The event stays **Planning** with its sign-offs, and the Coordinator receives a notice with the comments. The Organiser sees **Safety changes requested** and the comments, but no internal notes, checklist or reviewer name.
- [ ] The Coordinator resubmits. The Safety Officer sees the earlier review under **Earlier reviews**.
- [ ] **Reject safety arrangement** with comments: the event stays **Planning**, and the Coordinator's notice says the venue arrangement must be revised and gives the reason.
- [ ] **Approve**: the Coordinator receives "passed its safety check", the heading shows **Safety approved**, and **Confirm event** now succeeds. On the Confirmed event, **Start Preparation** is offered.

## Invalidation

- [ ] On an approved or Confirmed event, saving a significant change (e.g. **Expected attendees**) warns that the safety check is withdrawn. After saving, the heading shows **Safety check required again** and Confirm is refused until a new review is approved.
- [ ] Cancelling an approved venue booking on a safety-approved event also shows **Safety check required again**.

## Acceptance record

Keep SPM-66, SPM-91 and SPM-92 In Progress until these checks pass against a real backend and browser, and the team decisions in effective-requirements.md §4.6.1 are confirmed. The in-memory double does not verify the deployed Firebase project.
