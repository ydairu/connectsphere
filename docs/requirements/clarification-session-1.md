# Clarification Session 1 Record

## Source and Interpretation Rule

This document preserves the first customer clarification session in chronological order by topic. It records the customer's answers without silently replacing them with later answers.

Primary source artefact: `Session 1 - Clarification Answers_G8.xlsx - G8.pdf` (original course/customer material retained by the team outside this repository). This repository record is the portable implementation reference.

Because the source is a dense spreadsheet export and generic PDF extraction does not preserve its semantic order reliably, this record was reconstructed from the full Q&A transcription supplied directly by the team. Later Session 2 answers may supersede or refine some entries; see [`clarification-session-2.md`](clarification-session-2.md) and [`effective-requirements.md`](effective-requirements.md).

## 1. Accounts, Roles, and Access

- There is no System Administrator role.
- Event Organisers sign up directly; internal staff are managed or defined within system defaults.
- External Event Organisers and Attendees self-register.
- The five roles discussed are Event Organiser, Event Coordinator, Venue Staff, Technical Support Staff, and Attendee.
- Role-based secure access is required, but authentication technology is a team design choice.
- Session 1 left dual-role capability to implementation design.
- Role-based dashboards should expose relevant information while hiding internal planning details from external users.
- Event Coordinators edit main event details; Organisers edit their own requests; Venue Staff and Technical Support Staff update their respective preparation/reservation sections.
- Organisers must not see unrelated client data. Visibility across separate Organisers in the same organisation was left to implementation design.
- Search is role-restricted: internal staff search relevant system events, while Organisers cannot see unrelated clients' events.

## 2. Event Requests and Drafts

- The event request interface should capture event name, purpose, preferred date/time, expected attendance, venue/layout preferences, accessibility, equipment needs, and registration requirements.
- One request should use one event date; multiple alternative preferred dates were rejected for simplicity.
- There is typically one Event Organiser owner per request.
- Drafts allow incomplete requests to be saved before submission; their UI location was left to team design.
- Organisers may keep information in Draft until basic details are ready, or submit and later request amendments during planning.
- There is no minimum or maximum lead time for submitting an event request.
- There is no rigid deadline for an Organiser to submit.
- Preliminary equipment requirements may be entered by the Organiser and refined by Coordinators and Technical Support Staff.

### Minimum information for submission

Session 1 contains two closely related answers:

- “Basic required submission information includes expected attendees (pax), duration, preferred dates, purpose, and venue requirements.”
- “Basic minimal details: pax count, duration, preferred dates/times, event title, and primary venue/layout preferences.”

The reconciled minimum therefore includes event title, purpose, expected attendance, duration, preferred date/time, and primary venue/layout requirements.

## 3. Review, Statuses, and Changes

- Event Coordinators review, approve, return, reject, and confirm events.
- Organisers control Draft and Submitted transitions.
- Venue and Technical Support Staff update preparation details.
- A request returned for clarification is edited and resubmitted as the same request; planning continues only after requirements have been gathered.
- A rejected, unfulfillable request is closed; it is not treated like a returned request.
- Initial feasibility is evaluated from attendance, date/time, venue, and equipment availability.
- Venue approval and technical support/equipment arrangements are mandatory before confirmation.
- A Coordinator cannot override missing mandatory venue or technical approvals.
- Significant changes include expected attendance, duration, venue requirements or layout, and date/time. These trigger re-review.
- Post-confirmation changes require a re-request/review and are handled manually rather than automatically unbooking reservations.
- Routine status terminology was not fully consistent:
  - one answer said Approved and Confirmed refer to the same state;
  - another answer described Approved as initial feasibility passed and Confirmed as venue/technical readiness complete.
- Returned requests can be modified and resubmitted; rejected requests are closed.

## 4. Coordinator and Staff Assignment

- A submitted event is automatically assigned to an Event Coordinator.
- Strictly no more than one Coordinator is assigned to an event.
- Coordinator assignment may use system load or availability; specialisation is not required.
- The assigned Coordinator is the Organiser's primary contact.
- Technical Support Staff are auto-assigned from a single general capability pool; complex skill matching is not required.
- Detailed Technical Support schedules, workload, concurrent-event constraints, and geographic clusters are outside application scope or handled offline.

## 5. Venue Rules

- A venue may be held tentatively during Planning.
- Two events cannot tentatively hold the same venue and time.
- No fixed hold-expiry duration is required.
- Overlapping or incompatible venue bookings must be prevented; staff cannot override a conflict.
- First-come, first-served decides simultaneous conflicting attempts.
- Capacity overflow is an absolute constraint requiring re-review.
- Accessibility, layout support, operating hours, date/time availability, capacity, and required facilities are suitability factors.
- Setup and turnaround time may be treated as zero and need not constrain availability.
- One venue may be treated as one event for simplicity.
- Venue Staff may approve, reject, or suggest alternatives; partial approval is not supported.
- Venue maintenance/unavailability should appear in the availability calendar.
- If a confirmed venue becomes unavailable, the system notifies relevant staff and staff resolve replacements manually.
- Automatic recalculation or rebooking is not required when venue details change.
- Calendar and visual representation details are team UX choices.

## 6. Equipment and Technical Support

- Equipment may be represented by type/quantity or individual IDs; the detailed model was left to implementation design.
- Technical Support Staff review equipment requests and make reservations; formal cross-department steps may occur offline.
- Equipment conflicts are handled manually; if an essential requirement cannot be met, the request is rejected rather than cancelled.
- Equipment fulfilment is all-or-nothing; partial fulfilment is not allowed.
- Automatic substitute-equipment suggestions are not required.
- Transit, setup, teardown, and equipment lead-time constraints may be treated as zero/not enforced.
- Equipment reservations and preparation status are tracked.

## 7. Registration, Capacity, Waiting List, and Attendance

- Attendees are distinguished as registered versus actually attended; the attendance-capture method is a team choice.
- Registration fields and mechanisms such as forms, links, or QR codes are team choices, subject to role-based security.
- Registration opening and closing dates are configured by the Event Organiser.
- Capacity is limited by the event/venue maximum.
- At capacity, waiting-list priority is first-come, first-served.
- A waitlisted person is notified or invited to apply when a place opens; the system does not automatically register them.
- The acceptance window and withdrawal rules are team design choices.
- Registration reports may export participant lists subject to access restrictions; detailed consent mechanisms were not fixed.
- Cancelling an event after registration notifies registered Attendees.

## 8. Cancellation, Rescheduling, and Failure Handling

- An Event Organiser may request cancellation; the Event Coordinator reviews and approves it.
- Cancellation frees committed venue and equipment reservations.
- No cancellation fee, pricing, invoice, or financial workflow is in scope.
- Rescheduling or other post-confirmation changes triggers re-request/review; existing reservations are not automatically released while a new date is considered.
- Unexpected venue or equipment failures notify staff; replacement arrangements are resolved manually.

## 9. Communication, Notifications, and Audit

- Notification channels—such as in-app, email, SMS, or other channels—are implementation choices.
- Comments are attached to the event record.
- Offline discussions may be manually recorded in the system.
- Mentions, resolved-comment workflows, and their notification behaviour are optional.
- Unresolved comments do not replace the mandatory venue and technical progression blockers.
- Auditability should be available in the UI to authorised users and should show what changed, who changed it, and when.
- Event, attendee, client, and audit information should persist after an event ends; a deletion policy was not yet defined.

## 10. Non-Functional and Scope Clarifications

- The application must be desktop- and mobile-friendly; exact device dimensions are not fixed.
- Visual theme and UI presentation are team choices.
- Technology stack, frameworks, languages, and database are team choices.
- No numerical SLA, workflow deadline, review duration, or performance benchmark was defined; actions should complete within a reasonable screen-response time.
- The system should scale with future growth, but no numerical target was provided.
- External surveys and predictive machine learning are out of scope.
- Financial transactions, pricing, invoices, and cancellation fees are out of scope.

## 11. Items Left Open in Session 1

- multi-role support;
- same-organisation Organiser cross-visibility;
- exact Approved versus Confirmed lifecycle;
- similar/recurring-event filtering and reuse rules;
- notification channels and acknowledgement;
- Attendee registration fields and privacy mechanisms;
- waiting-list acceptance window and withdrawal cutoff;
- exact draft page/list presentation;
- exact equipment modelling;
- detailed client-profile deletion policy;
- precise performance and growth targets.
