# Effective Requirements

## 1. Purpose and Status Labels

This document reconciles the Week 1 Customer Briefing, Week 4 Project Instructions, Clarification Sessions 1 and 2, and current team decisions. It is the practical requirement reference for implementation, while the Product Backlog workbook remains the operational source of record for story wording, estimates, status, and Sprint assignment.

Labels used below:

- **[Customer-confirmed]** — supported by the briefing or clarification sessions.
- **[Course-required]** — required by the Week 4 Project Instructions or rubric.
- **[Team decision]** — chosen where the customer allowed discretion.
- **[Unresolved]** — source conflict or unanswered question.
- **[Deferred/KIV]** — retained but not committed now.

## 2. Course Scope and Delivery Constraints

**[Course-required]** The Week 12 first release must implement these 20 core functionality areas as coherent workflows rather than isolated screens:

1. User Authorisation and Authentication
2. Event Request Creation
3. Draft Event Requests
4. Event Review and Approval
5. Coordinator Assignment
6. Event Status Management
7. Event Information Management
8. Venue Catalogue
9. Venue Availability Calendar
10. Venue Search and Filtering
11. Venue Suitability Checking
12. Venue Booking Request
13. Venue Booking Approval
14. Booking Conflict Detection
15. Equipment Request Management
16. Equipment Availability Checking
17. Equipment Reservation
18. Attendee Registration
19. Event Change Requests
20. Notification System

**[Course-required]** The team must preserve Sprint evidence, estimation records, Sprint/task boards, burndowns, retrospectives, traceable tests, C4 system design, working code, README instructions, and any used CI pipeline. The final Sprint must end by Friday Week 12. The final evidence deck must use the Week 11 template.

**[Team decision]** The team uses an Excel Product Backlog/Scrum workbook rather than Jira.

## 3. Cross-Cutting Domain Model

### Roles and Accounts

**[Customer-confirmed]** The roles are:

- Event Organiser — external
- Event Coordinator — internal
- Venue Staff — internal
- Technical Support Staff — internal
- Attendee — external

**[Customer-confirmed]** There is no System Administrator role.

**[Customer-confirmed]** Event Organisers and Attendees self-register. Internal staff accounts are managed or defined through system defaults.

**[Customer-confirmed]** One user may hold multiple roles. Effective permissions combine assigned roles.

**[Customer-confirmed]** Authentication must provide secure role-based access, but no specific technology, SSO requirement, password length, complexity, expiry, history, or lockout rule was prescribed.

**[Team decision]** The current Product Backlog selects email/password authentication. If the current six-character minimum is retained, record it as a team security choice rather than a customer requirement.

### Ownership and Relationships

**[Customer-confirmed]** One event request normally has exactly one Event Organiser owner.

**[Customer-confirmed]** Organisers cannot see unrelated client data.

**[Unresolved]** Whether two Organisers in the same organisation may view each other's events beyond the owner-specific edit rule is a team design choice. Current SPM-42 permits viewing organisation events but editing only owned requests.

### Audit and Security Enforcement

**[Customer-confirmed]** Important actions must retain what changed, who changed it, and when, visible to authorised users where appropriate.

**[Customer-confirmed]** Access depends on role and relationship to the event.

**[Team decision / acceptance behaviour]** Authorisation must also deny unauthorised direct-link and API attempts; hiding UI controls is not sufficient.

## 4. Sprint 1 Effective Scope

Sprint 1 focuses on the first three functionality areas and contains seven stories.

### SPM-1 — Sign In and Access Only My Role's Area

**[Customer-confirmed]** Users authenticate and receive access according to their assigned role(s) and event relationship.

**[Current backlog]** Required login fields are email and password. Successful authentication grants role-based access. Unauthenticated protected-route access redirects to login. Logout terminates the session.

**[Boundary]** SPM-1 does not replace the detailed record/field permission work in SPM-42.

### SPM-2 — Register for an Account

**[Customer-confirmed]** Eligible external users are Event Organisers and Attendees. Internal staff do not use public self-registration.

**[Current backlog]** A registering user selects Event Organiser or Attendee. Common fields are name, email, and password. Organisation is additionally required for Event Organiser. Duplicate email is rejected. Successful registration creates the selected permitted role and permits sign-in.

**[Team decision]** SPM-2 is the 3-point reference story.

**[Team decision, 19 Sep 2026]** This increment collects a required organisation name at organiser registration and lets organisers view/add/edit that name on their own profile. The name is descriptive profile information: matching names do not link users or grant access, and edits do not change any existing organisation ID or event record. Shared organisation records, unique-ID assignment, and invitation codes are deferred from this increment. This does not satisfy the outstanding company-ID/membership requirements in SPM-42 or establish completion of SPM-2.

### SPM-42 — View and Edit Information According to My Role's Permissions

**[Customer-confirmed]**:

- users only view records permitted by role and event relationship;
- users only edit fields/sections permitted by role;
- direct-link and API attempts to reach unauthorised information are denied; an interface-level restriction alone does not satisfy this;
- Event Organisers view their own requests and their organisation's events, matched on the **company ID** supplied at registration, and cannot view another organisation's events (Clarification 1, Accounts & Registration: organisers register with "name, company name, and company ID");
- Event Organisers edit only requests they own, and **cannot edit a request they own once it has been submitted**, unless the Event Coordinator returned it for clarification or changes (Clarification 2, Role Permissions & Access);
- Event Coordinators edit event details (Clarification 1: "Coordinators can edit event details"; Clarification 2: "Modify Access: Event Coordinators edit main event details"). Which events they view is stated only as "internal staff can view relevant event information" (Clarification 2) and "internal staff can search relevant system events" (Clarification 1); the SPM-65 team decision below fills that gap. No Coordinator sees a draft that has never been submitted;
- Venue Staff view and update the venue section of relevant events and cannot see the equipment section; Technical Support Staff view and update the equipment/technical section and cannot see the venue section (Clarification 1: the two "operate independently"; the restriction is stated there on view, not only update);
- Attendees see attendee-facing information but not internal planning information;
- multi-role users receive combined permissions — the union of what each assigned role independently permits, evaluated per role rather than by combining roles before the record and status checks.

**Correction note (14 Sep 2026, Shaun):** two bullets previously in this section were the SPM-42
backlog card's original wording rather than the clarification record, and were narrower than the
customer's ruling — "Event Coordinators view relevant assigned events and edit main event details"
(the customer granted full visibility and full edit), and an Organiser edit rule carrying no status
condition (the customer barred editing after submission). Corrected under AGENTS.md §2, where a later
customer clarification outranks a backlog record. The chronological session records are unchanged, per
§8.

**Correction note (2 Oct 2026):** three quotations previously cited in this section and in §5 —
"Event coordinator: full system visibility" (attributed to Clarification 1), "Can edit the full event"
and "the previous coordinator retains read-only access" (both attributed to Clarification 2) — do not
appear in the G8 Session 1 or Session 2 answer sheets, and are not traceable to any customer source.
They were removed and replaced with the sheets' wording. The 14 Sep correction note above is kept as
the record of that earlier change.

**[Team decision] (1 Oct 2026, SPM-65)** Event Coordinators view and act only on events assigned to
them (`assignedCoordinatorUid`). This fills the gap left by "relevant event information"; it does not
override a customer requirement. Enforced on the server by `isAssignedCoordinator()` in
`shared/permissions.js`, through record scope. A Coordinator requesting an event not assigned to them
receives 404, so its existence is not confirmed; other roles keep 403. When an event is reassigned
(SPM-26), it leaves the previous Coordinator's scope and enters the new one's — SPM-65 acceptance
criterion 5 is consistent with this decision.

**[Unresolved ambiguity]** Whether "edit main event details" limits a Coordinator to some sections. The
SPM-42 implementation lets the assigned Coordinator view and edit every section, including internal
planning notes; that is the team's implementation, not a customer quotation.

**[Unresolved ambiguity]** A ruling that bears on this story has no home in this document yet, and
belongs to a section this story does not own:

- **§6 Event Status Management** presents the lifecycle as settled at "Draft, Submitted". Clarification 1's transcript is explicit that the status on submission is *Requested*; Clarification 2's summary says *Submitted*. Both written course documents — the Week 1 Customer Briefing and the Week 4 Project Instructions — list "submitted" in their status examples, so *Submitted* is the better-supported reading, but the team has not ratified it. SPM-42's state gate and SPM-24's queries are both written to test only `draft`, so neither breaks either way; the workbook and §6 should still record the decision.

**[Team decision]** Two rules the customer did not rule on, proposed by Shaun on 14 Sep 2026, implemented in `shared/permissions.js`, and ratified by the team on 20 Sep 2026. They fill an area the customer left open and do not override any confirmed customer requirement:

- **Finished events are read-only for every role.** A request at Completed, Cancelled or Rejected cannot have any section edited — by its Organiser, by assigned staff, or by the Event Coordinator. Supporting evidence: the backlog's own criterion that "a cancelled event cannot be edited or confirmed". Status transitions are separate actions and are not affected.
- **Attendees see Confirmed events only.** An Attendee cannot see a request at any other status, even with registration enabled. The existing condition that registration is enabled is retained unchanged. Supporting evidence: registration is capped at venue capacity (Clarification 2), which is known only once a venue is secured at confirmation.

**[Deferred/KIV]** Registration settings after submission. The Organiser controls whether registration is enabled and when it closes (Clarification 2), but cannot edit a request once submitted unless it is returned — so under the current rules they cannot open registration or change its closing time on a Confirmed event. The registration period, and whether Attendees must also have registration enabled to see a Confirmed event, are deferred to a future Sprint and further team discussion. Changes to a Confirmed event otherwise belong to Event Change Requests (§19), which does not exist yet.

**[Boundary]** SPM-42 cannot be Done until all named roles and their relevant information surfaces exist and are tested. If Sprint 1 implements only Event Organiser behaviour, the story must be split or remain incomplete.

### SPM-7 — Create an Event Request

**[Customer-confirmed]** An Event Organiser can start a request and enter:

- title/name;
- purpose and description;
- expected attendance;
- duration;
- preferred date/time;
- venue/layout preferences;
- accessibility needs;
- equipment requirements;
- registration needs.

One request represents one event date and has one Organiser owner. Entering or editing data does not submit the request or start staff review.

### SPM-3 — Submit an Event Request

**[Customer-confirmed]** The minimum combined submission fields are:

- event title;
- purpose;
- expected attendance/pax;
- duration;
- preferred date/time;
- primary venue/layout requirements.

Missing mandatory information blocks submission and identifies each missing field. Previously entered data is retained, the request remains editable, and staff review does not start. A successful submission sets status to Submitted and makes the request eligible for the later staff workflow.

**[Boundary]** Sprint 1 should not claim that the downstream Coordinator review workflow is complete unless later functionality has actually been implemented.

### SPM-4 — Save an Event Request as a Draft

**[Customer-confirmed]** A draft:

- may be saved while mandatory submission fields are incomplete;
- retains entered data;
- remains editable by its creating Organiser;
- is private and single-owner before submission;
- is not visible to staff, other Organisers, or Attendees;
- does not expire automatically;
- does not start submission or review;
- changes to Submitted when validly submitted.

The current backlog says a draft remains until submitted or deleted. Deletion itself is not customer-mandated and is deferred; therefore do not make deletion necessary for SPM-4 completion.

### SPM-24 — View My Saved Draft Requests

**[Customer-confirmed]** Organisers must be able to return to and continue editing saved drafts, and drafts must remain distinguishable from submitted requests.

**[Customer-confirmed]** Drafts are strictly private until submitted and do not expire. An unsubmitted draft is not visible to **any** other user — Event Coordinators included, and also other Event Organisers in the same organisation (Clarification 2, Drafts: "strictly private until submitted"; transcript: "it's not visible to anyone unless I submit it"). Enforcement is SPM-42's record-scope predicate; this story covers the observable behaviour of the drafts list.

**[Team decision]** Use a dedicated Drafts page/section rather than a combined list — the customer left list-versus-page to the team, so only one is built. Selecting an owned draft opens it for editing. Submitted requests show their current status and are not editable as drafts. An Organiser with no saved drafts is told so rather than shown a blank screen.

**[Team decision]** Filtering is optional convenience, not a customer requirement.

**[Boundary]** That reopening a draft retains all previously entered data is SPM-4's acceptance criterion, not this story's. SPM-24 covers navigation from the list into the draft; duplicating the retention claim here would restate a sibling story.

### Overlap and Deferred Records

- **[Team decision]** SPM-22 remains recorded as `Removed — Overlap` because SPM-2 covers external registration.
- **[Team decision]** SPM-23 remains recorded as `Removed — Overlap` because SPM-3 includes mandatory-field validation and failure recovery.
- **[Team decision]** SPM-43 remains recorded as `Removed — Overlap` because SPM-7 includes equipment and accessibility inputs.
- **[Deferred/KIV]** SPM-44, deleting a saved draft, is not a customer requirement and is outside Sprint 1.

## 5. Remaining Core Functionality Areas

### 4. Event Review and Approval

**[Customer-confirmed]** Event Coordinators review submitted requests, seek clarification, return for amendment, approve/allow planning, or reject. Returned requests are edited and resubmitted; rejected unfulfillable requests close. Initial feasibility considers attendance, date/time, venue, and equipment availability.

**[Implemented — SPM-5, 2 Oct 2026]** The assigned Coordinator reviews a Submitted request's title, attendance, duration, preferred date/time, venue/layout preference, accessibility and equipment on the request page, moves it to Under Review, and approves it to Planning. Every other Coordinator is refused approve, return, reject and start review with the same 404 as a missing request (SPM-65). The SPM-9 transitions are reused unchanged; reject remains as built by SPM-9, which SPM-45 should take into account.

**[Team decision pending — SPM-5]** "When they open it for review" is served by the Coordinator's **Start review** action, not by viewing the request: opening a page does not change the status, so a Coordinator can look at a request without starting review.

**[Engineering recommendation — SPM-5]** "With sufficient information" is enforced as a minimum: Approve is refused while the request fails the submission check (mandatory fields present and every field well-formed, `validateEventRequestSubmission`), because section edits after submission are not validated (AGENTS.md §6). Whether the information is sufficient beyond that remains the Coordinator's judgement.

### 5. Coordinator Assignment

**[Customer-confirmed]** Assignment is automatic with exactly one Coordinator per event. Round-robin or load-based are acceptable examples. The assigned Coordinator may initiate reassignment following offline agreement.

**[Team decision pending]** Select and document the actual assignment algorithm.

**[Implemented, pending ratification — SPM-8, 30 Sep 2026]** The SPM-8 story's business rules, as supplied by the Product Owner, are implemented in `shared/coordinatorAssignment.js` and applied on submission by `backend/src/services/coordinatorAssignmentService.js`. They are recorded here so the build is traceable; the team has not yet recorded them as a ratified decision:

- every user holding the Event Coordinator role is eligible; no specialisation matching;
- the request goes to the eligible Coordinator with the fewest active assigned events — those at Submitted, Under Review, Returned, Planning or Confirmed; Draft, Completed, Cancelled and Rejected do not count;
- a tie on the lowest count is broken at random;
- a user who is both Event Organiser and Event Coordinator is never assigned a request they submitted;
- a request that already has a Coordinator keeps them;
- the system is expected always to have an eligible Coordinator, so an empty pool is treated as a server error: the submission is rejected and the request stays a Draft, rather than being saved without a Coordinator;
- each assignment is recorded in the request's activity history with "System" as the actor.

The assignment is stored in a single `assignedCoordinatorUid` field. The customer says only that reassignment is "initiated by the assigned Coordinator after offline agreement" (Clarification 2). Under the SPM-65 team decision (1 Oct 2026, §SPM-42), a reassigned event leaves the previous Coordinator's scope; nothing is retained.

### 6. Event Status Management

**[Customer-confirmed]** Draft, Submitted, Under Review, Planning, Confirmed, Completed, Cancelled, Rejected, and a returned/amendment condition are required concepts.

**[Unresolved]** Approved and Confirmed are inconsistent across answers. Do not implement a final transition model until the team documents one interpretation and its rationale.

**[Customer-confirmed]** Under Review means evaluation/clarification; Planning means arrangements are underway; Completed follows the event date/time; returned requests may be edited/resubmitted; rejected requests close.

**[Team decision, 1 Oct 2026 — resolves the [Unresolved] Approved/Confirmed item above]** "Approved", as a customer status word ("Confirmed/Approved", Clarification 2), means the **Confirmed** status. There is no separate Approved status. The review action that passes initial feasibility moves Under Review to Planning (SPM-9: "when the Coordinator approves, then it moves to Planning"); Planning moves to Confirmed only when the assigned Coordinator confirms after all mandatory venue and required technical arrangements are approved. The earlier source records are unchanged.

**[Implemented — SPM-9, 1 Oct 2026]** The SPM-9 acceptance criteria, implemented in `shared/statusTransitions.js` and applied by `backend/src/services/statusTransitionService.js`:

- Draft → Submitted (submit) and Returned → Submitted (resubmit), by the owning Event Organiser; resubmission keeps the assigned Coordinator;
- Submitted → Under Review (start review); Under Review → Returned (return for clarification); Under Review → Planning (approve); Under Review or Planning → Rejected (reject); Planning → Confirmed (confirm, once arrangements are approved); Confirmed → Completed (complete); Confirmed → Cancelled (direct cancel, or approval of an Organiser's cancellation request);
- Completed, Cancelled and Rejected are terminal: no action is accepted from them;
- each status change adds a `status_changed` entry to the request's `activity` subcollection with the previous status, the new status, the user responsible and the date/time, in the same transaction as the change.

**[Team decision — SPM-9, 1 Oct 2026]** Three rules the criteria leave open, proposed with the SPM-9 build and confirmed by the team on 1 Oct 2026. They fill areas the customer left open and do not override a confirmed customer requirement:

- every Coordinator action is limited to the assigned Coordinator (`assignedCoordinatorUid`), not only confirm and reject;
- the assigned Coordinator marks an event Completed, and only once `core.preferredDateTime` plus `core.durationHours` has passed; an automatic system job is deferred;
- the status actions are served at `POST /api/event-requests/:id/transitions`, beside submit, rather than under `/api/requests`.

**[Team decision, 1 Oct 2026 — SPM-9] Minimal venue and technical sign-off**, so Confirm can be reached before the Venue Booking Approval (§13) and equipment (§15–17) stories exist. Those stories are expected to build on or replace it (`shared/arrangements.js`):

- at Planning, assigned Venue Staff approve or reject the venue arrangement, and assigned Technical Support Staff approve or reject the technical arrangement;
- the venue arrangement is always mandatory; the technical arrangement is required only when the request asks for equipment or technical support (Clarification 2: approval "is based on what the event actually requests");
- a rejection keeps the event in Planning (§13) and blocks Confirm until the arrangement is approved; staff may change their decision while the event is in Planning;
- decisions are stored as record metadata (`arrangementApprovals`), which no section edit can write, so the Coordinator cannot override a missing approval (Clarification 1); each decision is recorded in the activity history.

**[Implemented — SPM-9, 1 Oct 2026] Organiser cancellation requests** (`shared/cancellationRequests.js`), per Clarification 1 and 2: the owning Organiser may request cancellation of a Confirmed event, with an optional reason; the assigned Coordinator approves it (Confirmed → Cancelled) or refuses it (the event stays Confirmed, and the Organiser may ask again). One request may be pending at a time, and while it is pending the Coordinator decides it rather than cancelling directly. The Coordinator's direct cancellation requires a stated reason (Clarification 2). Requests and decisions are stored as record metadata (`cancellationRequest`) and recorded in the activity history.

**[Known gaps — SPM-9]**

- No feature assigns Venue or Technical Support Staff to a request; only seeded requests have `assignedStaffUids`. A request created in the app therefore cannot be signed off or confirmed until staff assignment exists (Clarification 1: Technical Support Staff are auto-assigned from a general pool).
- Releasing venue and equipment reservations and notifying registered Attendees on cancellation (Clarification 1) are not implemented: reservations, registration and notifications do not exist yet.
- A venue or equipment edit after sign-off does not clear the approval. Significant changes are meant to trigger re-review (§19), which does not exist yet.
- Venue Staff suggesting alternatives (§13) is not modelled.
- The activity history is recorded but not displayed.

### 7. Event Information Management

**[Customer-confirmed]** Field and section permissions follow role and ownership. Routine contact or descriptive edits are normal. Significant date/time, duration, attendance, venue/layout, or equipment changes trigger formal re-review and may alter Planning/confirmation status.

### 8. Venue Catalogue

**[Customer-confirmed]** Maintain location, capacity, facilities, accessibility, supported layouts, operating information, and availability-related characteristics. Venue Staff can use catalogue information to identify suitable spaces.

### 9. Venue Availability Calendar

**[Customer-confirmed]** Show bookings, tentative holds, and maintenance/unavailable periods. One venue may be treated as one event for simplicity. Turnaround may be zero.

### 10. Venue Search and Filtering

**[Customer-confirmed]** Event Coordinators search/filter by relevant date/time, capacity, location, accessibility, layout, and facilities.

**[Team decision pending]** If no exact match exists, either return no results or show partial matches with clear suitability warnings.

### 11. Venue Suitability Checking

**[Customer-confirmed]** Evaluate attendance versus capacity, date/time availability, layout, accessibility, and required facilities. Capacity overflow is blocking. Numeric accessibility scoring is not required; tags/booleans are acceptable.

**[Unresolved]** Missing-facility block versus warning behaviour is not fully specified.

### 12. Venue Booking Request

**[Customer-confirmed]** Event Coordinators request suitable venues during Planning. Tentative holds prevent another event holding the same venue/time.

### 13. Venue Booking Approval

**[Customer-confirmed]** Venue Staff approve, reject, or suggest alternatives; no partial approval. Rejection keeps/returns the event to Planning. There is no fixed SLA.

### 14. Booking Conflict Detection

**[Customer-confirmed]** Any overlap, even one second, is incompatible and blocked. There is no override. Simultaneous conflicts are first-come, first-served.

### 15. Equipment Request Management

**[Customer-confirmed]** Organisers record preliminary equipment needs. Coordinators and Technical Support Staff review/refine them. Technical staff approve or reject according to requested staff/equipment availability.

### 16. Equipment Availability Checking

**[Customer-confirmed]** Check requested type/quantity for the event time. Equipment modelling by quantity/type versus individual asset ID is a team choice.

### 17. Equipment Reservation

**[Customer-confirmed]** Fulfilment is all-or-nothing. Conflicts or breakdowns are flagged for manual resolution; automatic substitutes are not required. Transit/setup buffers may be zero.

### 18. Attendee Registration

**[Customer-confirmed]** The Organiser configures whether/when registration is open. A person must register to attend, though attendee-facing information may remain visible without registration. Capacity is capped at the event/venue maximum. Waiting-list priority is first-come, first-served; the next person is invited to apply rather than automatically registered.

**[Team decision pending]** Registration form fields, QR/link/form mechanism, withdrawal rules, waitlist acceptance window, and detailed consent flow.

### 19. Event Change Requests

**[Customer-confirmed]** Significant changes—date/time, duration, attendance, venue/layout, or equipment—trigger re-review. If essential changes cannot be met, return for modification or reject. Post-confirmation changes do not automatically unbook existing arrangements.

### 20. Notification System

**[Customer-confirmed]** Notify affected users about material changes, cancellations, availability failures, waiting-list opportunities, and relevant actions.

**[Team decision pending]** Select channels, delivery preferences, acknowledgement, and optional mentions. Offline communication may be manually recorded as event comments.

## 6. Cancellation and Reservation Release

**[Customer-confirmed]** Rejection applies when requirements cannot be met before confirmation. Cancellation applies to an approved/confirmed event. An Organiser may request cancellation and the Coordinator may approve or reject it. Session 2 also permits Coordinator-initiated cancellation for a stated reason. No fixed time boundary exists.

**[Customer-confirmed]** Cancellation releases committed venue/equipment reservations and notifies registered Attendees.

## 7. Quality and Non-Functional Requirements

- **[Customer-confirmed]** Desktop- and mobile-friendly UI.
- **[Customer-confirmed]** Clear status, arrangements, and outstanding actions for appropriate users.
- **[Customer-confirmed]** Common operations complete in a reasonable time; no numeric target exists.
- **[Customer-confirmed]** Consistent information across events, bookings, equipment, and registration.
- **[Customer-confirmed]** Support anticipated three-year growth; no numeric sizing target exists.
- **[Customer-confirmed]** Important actions are auditable.
- **[Customer-confirmed]** Future functionality and rules should be addable without rebuilding the system.
- **[Course-required]** Tests must be traceable to stories/acceptance criteria and cover appropriate normal, boundary, conflict, and failure scenarios.
- **[Course-required]** Maintain modular code and a working CI pipeline where used.

## 8. Explicitly Out of Scope or Not Required

- System Administrator role
- financial transactions, pricing, invoices, and cancellation fees
- predictive machine learning or external surveys
- detailed Technical Support schedules, specialisation, and workload planning
- automatic venue/equipment replacement
- staff override of booking conflicts or mandatory readiness approvals
- transport/setup/turnaround calculations
- fixed workflow SLAs unless adopted as a team decision
- Google SSO unless explicitly restored by the team
- draft deletion in Sprint 1
- ADRs as a current documentation requirement
- Jira

## 9. Decisions Still Required

Before implementing affected functionality, resolve and record:

1. Approved versus Confirmed state model.
2. Official Sprint 1 start date: 13 or 14 September 2026.
3. Same-organisation Organiser visibility.
4. Exact multi-role storage and permission evaluation model.
5. Coordinator assignment algorithm.
6. Missing venue-facility block/warning policy.
7. Venue partial-match behaviour.
8. Notification channels and preferences.
9. Whether to retain the six-character password minimum as a team security choice.
10. Whether SPM-42 should be split if all five role surfaces cannot be delivered in Sprint 1.
