# SPM-87 manual review

Record the date, event ID, account and actual result for each check. Use a non-production Firebase project or the local sandbox (the in-memory double). Criteria and evidence are in `docs/evidence/spm-87-traceability.md`.

## Set-up

1. As the assigned Coordinator of a Planning event, request two venue bookings and have each named Venue Staff member approve them.
2. As the assigned Technical Support Staff member, approve the technical arrangement (or the equipment request).

## Marking (AC1)

- [ ] Change **Expected attendees** and save. The dialog says the sign-offs are kept and marked Changed since approval. After **Save significant change**, both venue bookings and the technical arrangement still read **Approved**.
- [ ] A **Sign-offs changed since approval** card lists each with "— Changed since approval". The Organiser and staff do not see this card.
- [ ] Each assigned Venue and Technical Support Staff member receives one significant-change notice.
- [ ] **Submit for safety review** and **Confirm event** are not offered; direct calls return 409 `sign_off_review_pending`.

## Choosing (AC2, AC5, AC6)

- [ ] Tick one venue booking and the technical arrangement → **Send selected back for re-approval**. Only those read **Awaiting approval**; the other booking stays Approved. The Change Log shows **Sign-offs sent back for re-approval** with the before and after.
- [ ] The Venue Staff member of the sent-back booking and the Technical Support member each get a notice naming what to review again.
- [ ] Repeat on a fresh change and choose **None need re-approval**: every approval stays, and **Submit for safety review** is offered. **Confirm event** still waits for the safety approval.
- [ ] A second choice on a decided review, a choice by anyone but the assigned Coordinator, and an unknown item are all refused with nothing written.

## Re-approval (AC4)

- [ ] While a sign-off is Awaiting approval, the safety check and Confirm are refused.
- [ ] The Venue Staff member finds the booking **Awaiting re-approval** in **Venue bookings**; **Approve booking** → **Confirm approval** approves it again, keeping its reservation. Alternatively **Reject booking** releases the reservation, and if it was the primary venue the Coordinator must choose another.
- [ ] A sent-back booking whose period or attendance no longer fits the event cannot be approved again.
- [ ] The Technical Support member re-confirms the equipment request (also when it is Reserved), or approves the manual sign-off.

## Confirmed and Preparation (AC3)

- [ ] A significant change on a Confirmed event moves it to Planning, withdraws the safety approval (**Safety check required again**) and marks the sign-offs.
- [ ] The same on a Preparation event; the preparation sections become read-only again. A Preparation event with an open cancellation request refuses the change with 409.

## Acceptance record

Keep SPM-87 In Progress until these checks pass against a real backend and browser and the team decisions in effective-requirements.md §4.7 are confirmed.
