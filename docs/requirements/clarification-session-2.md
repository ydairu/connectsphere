# Clarification Session 2 Record

## Source and Interpretation Rule

This document preserves the second customer clarification session as a later chronological source. Where it directly revises Session 1, the later answer governs the effective requirement. Team choices remain separate from customer-confirmed rules.

Source: full Q&A supplied directly by the team in the project working conversation. No standalone Session 2 file has been located.

See [`effective-requirements.md`](effective-requirements.md) for the reconciled current interpretation.

## 1. Accounts, Roles, and Access

- There is no System Administrator role.
- External Event Organisers and Attendees sign up directly.
- Internal staff accounts are managed or defined within system defaults.
- User Accounts and Authentication handles identity and role assignment.
- Event Information Management enforces field-level and context-based view/edit permissions using roles and event ownership.
- Internal staff can view relevant event information.
- Event Organisers can view their own requests and their organisation's events.
- Event Coordinators edit main event details.
- Event Organisers edit and resubmit their own requests.
- Venue Staff update venue-related sections.
- Technical Support Staff update equipment/technical sections.
- Attendees cannot access internal planning information.
- Session 2 explicitly permits one person to hold two roles to complete current work. Management of roles in the UI remains a team choice.

This multi-role answer refines Session 1, where dual-role capability had been left open. Effective permissions should combine the user's assigned roles.

## 2. Attendee Registration

- Attendee registration may be enabled or configured by the Event Organiser when creating or updating the event request.
- The Organiser decides the registration opening and closing time.
- An unregistered person may view event information but cannot attend.
- Registration is capped at the event/venue capacity.
- When capacity is reached, new registrants join a first-come, first-served waiting list if the Organiser leaves registration open; the Organiser may instead close registration.

## 3. Event Lifecycle, Rejection, and Cancellation

- **Under Review:** the Coordinator evaluates the request or seeks clarification.
- **Planning:** initial feasibility has passed and venue/equipment planning is underway.
- **Confirmed/Approved:** essential venue and technical arrangements are approved.
- **Completed:** event date/time has passed.
- **Rejected:** the request cannot proceed because of venue/equipment unavailability or suitability issues.
- **Cancelled:** cancellation follows an Organiser request or may be initiated by the Coordinator for a stated situation.

The session distinguishes:

- rejection before confirmation when requirements cannot be met; and
- cancellation for an event already approved/confirmed.

An Organiser's cancellation request may be rejected by the Event Coordinator. No customer-defined cancellation time boundary exists; the team may define one with a rationale.

The wording “Confirmed/Approved” still conflicts with the Session 1 answer that separately described Approved as initial feasibility and Confirmed as completed arrangements. This remains unresolved for the implemented state machine.

## 4. Coordinator Assignment

- Initial Coordinator assignment is automatic.
- Round-robin or load-based assignment are acceptable examples.
- Exactly one Coordinator is assigned to an event.
- The assigned Coordinator may initiate reassignment after offline agreement.
- Detailed assignment criteria beyond basic automatic assignment are a team choice.

## 5. Event Changes

- Significant changes trigger a formal change request and re-review.
- Examples include date, duration, expected attendance, venue, and equipment requirements.
- Review/Planning resumes to reassess feasibility.
- If an essential changed requirement cannot be accommodated, the request may be rejected or returned for modification.
- Routine contact-information or descriptive-text edits are normal updates and need not trigger re-review.
- The Coordinator reviews whether a change is significant and whether it affects confirmation or planning status.

## 6. Venue Suitability, Holds, and Conflicts

- Venue suitability factors include:
  - expected attendance versus capacity;
  - date/time availability;
  - supported room layout;
  - accessibility features;
  - required facilities.
- No numeric accessibility score is required; boolean/tag-based filtering is recommended.
- Search behaviour when no exact match exists is a team choice: empty results or partial matches with warnings are both acceptable.
- Registration capacity should not exceed venue capacity.
- A rejected venue booking keeps or returns the event to Planning so that another venue can be considered.
- A tentative hold is released when the event is rejected, cancelled, or the booking is updated.
- No fixed hold-expiry duration is specified; the team may choose one with reasonable justification.
- Any overlap, even one second, is an incompatible booking conflict and is prevented.
- Simultaneous conflicting attempts are resolved first-come, first-served.

The question about which missing facilities are blocking versus warnings was not fully answered; only the capacity constraint and registration cap were reinforced.

## 7. Technical Approval

- Technical Support Staff approve or reject a request according to staff and equipment availability for that request.
- The answer does not require equipment and on-site support to always appear together; approval is based on what the event actually requests.

## 8. Draft Requests

- Drafts may contain incomplete event requests and be resumed later.
- A draft is strictly private and single-owner until submitted for review.
- Other Organisers, Coordinators, and staff do not co-view or co-edit an unsubmitted draft.
- Drafts have no automatic expiry or submission deadline.
- Separate Drafts page versus combined list is a team UX decision.

The team later selected a dedicated Drafts page. That is a team decision, not a customer mandate.

## 9. Notifications and Communication

- Notification channel selection and user delivery preferences are team design choices.
- Communication between Organiser and Coordinator may use comments attached to the event record.
- For simplicity, discussion may happen offline and the Coordinator may manually record the result in the system.
- The customer did not require floorplans, site-recce alerts, or a specific communication channel.

## 10. Venue Booking Response Times

- No fixed venue-approval SLA, turnaround time, or response window is required.
- The team may define operational boundaries with a documented rationale.

## 11. Effective Changes from Session 1

| Topic | Session 1 position | Session 2 refinement |
|---|---|---|
| Multiple roles | Left to implementation design | One user may have two roles; UI management remains a team choice. |
| Coordinator assignment | Automatic, one Coordinator | Automatic; round-robin/load-based examples; reassignment by assigned Coordinator after offline agreement. |
| Draft privacy | Draft save/resume, UI open | Explicitly private and single-owner until submission. |
| Draft lifetime | No submission deadline broadly implied | Explicitly no expiry or deadline. |
| Registration capacity | Capacity and FCFS waiting list | Reinforced venue-cap registration and Organiser decision to close or leave registration open. |
| Booking overlap | Prevent incompatible overlap | Any overlap, even one second, is blocked; FCFS resolves simultaneous attempts. |
| Event change classification | Attendance, duration, venue, date/time | Adds equipment; distinguishes routine contact/description edits. |
| Cancellation | Organiser requests, Coordinator approves | Organiser request may be rejected; Coordinator-initiated cancellation is also mentioned; no fixed time boundary. |

## 12. Items Still Open After Session 2

- final Approved versus Confirmed state model;
- exact cancellation boundary if the team elects to add one;
- exact Coordinator assignment algorithm;
- same-organisation Organiser visibility beyond the owner's own requests;
- precise blocking versus warning behaviour for missing venue facilities;
- accessibility-tag taxonomy;
- exact-match versus partial-match venue search behaviour;
- notification channels and user preference rules;
- comments versus offline communication details;
- exact account-role management UI;
- technical cases involving only equipment or only on-site support beyond availability-based approval.
