# Customer Briefing Record

## Source and Purpose

This document is a structured record of the original Week 1 customer briefing for ConnectSphere. It preserves the baseline before later clarification sessions. It must be read together with the chronological clarification records and [`effective-requirements.md`](effective-requirements.md).

Source: `Week 1 Customer Briefing.docx` (original course/customer material retained by the team outside this repository). This repository record is the portable implementation reference.

The briefing explicitly states that it is deliberately ambiguous, that only the team's own section/customer clarifications apply, and that the Week 4 Project Instructions would identify the core scope for the first release. It advised teams not to begin Sprinting before that core scope was released.

## 1. Organisation and Problem

ConnectSphere Event Services is a regional organisation providing event planning and venue services across Southeast Asia. It operates event facilities in Singapore and maintains event equipment and supporting resources.

Approximately 500 staff work in roles including Event Coordinator, Venue Staff, and Technical Support Staff. External users include Event Organisers and Attendees.

The current process relies on email, spreadsheets, shared calendars, messaging applications, online forms, and manually maintained documents. Information for one event may therefore be distributed across several locations and managed by different people. This creates risks such as:

- incomplete or inconsistent event information;
- venue or equipment conflicts;
- outdated information reaching Attendees;
- difficulty identifying incomplete arrangements;
- weak traceability of what changed, who changed it, and when.

The proposed solution is a custom Event Planning and Venue Booking System that provides one platform for these processes.

## 2. Baseline Roles

| Role | Type | Baseline responsibility |
|---|---|---|
| Event Organiser | External | Client representative who provides event requirements and communicates with ConnectSphere. |
| Event Coordinator | Internal | Coordinates overall event planning and acts as the main internal contact. |
| Venue Staff | Internal | Maintains venue information, availability, booking decisions, and venue preparation. |
| Technical Support Staff | Internal | Manages equipment, technical requirements, reservations, and event technical support. |
| Attendee | External | Registers for and attends events. |

The briefing contains no System Administrator role.

## 3. Typical Event Planning Process

The briefing's baseline process is:

1. **Draft Event Request:** an Event Organiser creates and may continue editing a draft.
2. **Submission:** the Event Organiser submits the request.
3. **Coordinator Assignment:** an Event Coordinator becomes the main internal contact.
4. **Review and Clarification:** the Coordinator reviews the request and may request amendments.
5. **Initial Approval:** the Coordinator decides whether planning should proceed; returned or rejected decisions retain a record.
6. **Venue Identification:** possible venues are assessed against date/time, capacity, layout, accessibility, facilities, and setup needs.
7. **Venue Booking:** Venue Staff assess and decide the booking request.
8. **Equipment and Technical Planning:** required equipment and technical support are identified and arranged.
9. **Readiness:** outstanding venue, equipment, technical, programme, and registration matters are tracked.
10. **Confirmation:** the event is confirmed when required arrangements are complete.
11. **Registration Preparation:** registration needs are configured where applicable.
12. **Attendee Registration:** Attendees register where registration is enabled.
13. **Changes:** important event changes may affect bookings, resources, and users.
14. **Delivery and Attendance:** the event occurs and attendance may be recorded.
15. **Completion:** the event is completed while its record remains available.

The briefing states that exact business rules may be clarified during customer Q&A.

## 4. Broad Functionality Considered

The original briefing is intentionally broader than the assessed first release. It considers functionality including:

### Accounts and Clients

- user accounts and authentication;
- user profile management;
- client organisation management;
- multiple Event Organisers belonging to one organisation.

### Event Requests and Planning

- event request creation;
- draft event requests;
- event categories;
- review and approval;
- Coordinator assignment and possible reassignment;
- event statuses;
- authorised event information updates;
- programme and agenda;
- multi-session events;
- recurring or similar-event reuse;
- comments and planning communication;
- cancellation and change handling.

### Venue and Equipment

- venue catalogue and venue availability;
- venue search, filtering, suitability, requests, approval, and conflict detection;
- maintenance and other unavailable periods;
- equipment catalogue, availability, requests, reservations, preparation, and technical support allocation.

### Registration, Communication, and Records

- Attendee registration and capacity handling;
- waiting lists and attendance records;
- notifications and reminders;
- role-based calendars, dashboards, search, reports, and exports;
- activity and change history.

## 5. Baseline Event Request Information

The briefing says an Event Organiser may provide information such as:

- event name, description, purpose, and type;
- preferred date and time;
- expected attendance;
- general programme;
- venue and room-layout preferences;
- accessibility requirements;
- equipment requirements;
- registration requirements;
- other special arrangements.

The briefing does not itself define a final minimum set for submission; this was refined in Clarification Session 1.

## 6. Status Examples

The briefing gives examples including:

- Draft
- Submitted
- Under Review
- Approved
- Planning
- Awaiting Arrangements
- Confirmed
- Completed
- Cancelled
- Rejected

These are examples rather than a fully defined state machine. Later customer responses remain inconsistent about whether Approved and Confirmed are identical or distinct.

## 7. Baseline Quality Requirements

### Design and Usability

- The system should be desktop- and mobile-friendly.
- Information should be clear to external users unfamiliar with internal processes.
- Appropriate users should easily understand current status, confirmed arrangements, and outstanding actions.
- Common activities should not require extensive training.

### Performance

Common operations should complete within a reasonable time. No numerical response-time, concurrency, or volume target is given.

### Security

Only authorised users may access protected information. Access depends on role and relationship to an event. The examples given are that an Event Organiser should not normally see unrelated clients' events and an Attendee should not see internal planning information.

### Reliability and Consistency

Users should not receive contradictory information about event dates, venue bookings, equipment availability, or registration status.

### Scalability

The solution should support anticipated growth over three years in events, users, client organisations, venues, equipment, and registrations. No numerical growth target is given.

### Auditability

Important actions should be recorded so that ConnectSphere can determine what changed, who changed it, and when.

### Maintainability

Future functionality and business rules should be addable without rebuilding the entire system.

## 8. What the Briefing Did Not Fix

The briefing did not prescribe:

- a technology stack, framework, programming language, or database;
- a concrete authentication mechanism or password policy;
- exact role-permission matrices;
- exact state transitions;
- numerical performance or capacity targets;
- notification channels;
- exact UI layouts or device sizes;
- many workflow edge cases.

These gaps were intentionally left for customer clarification or team design decisions.

## 9. Relationship to Week 4 Scope

The Week 4 Project Instructions narrowed the assessed first release to 20 core functionality areas. Those areas, later clarifications, and current team choices are reconciled in [`effective-requirements.md`](effective-requirements.md). This baseline record should not be edited to make it appear that later answers were known in Week 1.
