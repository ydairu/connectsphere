# Effective Requirements — ConnectSphere Release 1

> **Status of this document.** This is a **revision candidate** prepared after the Week 7 customer changes. It is staged for review and independent audit; it is **not** the repository checkpoint and must not be merged, committed, or pushed until the Product Owner approves the target. The Product Backlog/Scrum workbook remains the operational source of record for story wording, estimates, status, and Sprint assignment (see §0).
>
> **Baseline integrity note.** Every "Implemented — SPM-…" claim carried over from the prior checkpoint is a **historical record** of that checkpoint, not a claim re-verified in this revision. Where this candidate changes an effective rule, the superseded statement is recorded in §10 rather than left as a live mandate.

---

## 0. How to Read This Document — Scope, Status, and Provenance Conventions

### 0.1 Purpose and authority order

This document reconciles the Week 1 Customer Briefing, the Week 4 Project Instructions, Clarification Sessions 1, 2 and 3, the current team decisions, and the **Week 7 Customer Changes**. It is the practical requirement reference for implementation.

When sources differ, the repository's source-priority order governs (repo guidance `AGENTS.md`, §2):

1. Latest explicit team decision for a team-controlled choice.
2. Later customer clarification.
3. Earlier customer clarification.
4. Week 4 Project Instructions and the original Customer Briefing.
5. Current Product Backlog and Sprint records.
6. Engineering recommendation.

A later customer clarification overrides an earlier one on the same customer-controlled matter; a team decision may fill an area the customer deliberately left open but **must not override a confirmed customer requirement**. On any given topic, the **latest customer statement governs**: where Session 3 (CL3) speaks to a row, CL3 is the latest customer statement and supersedes the earlier CL1/CL2 answer and the Week 7 wording on that same-topic detail; where CL3 is silent, the **Week 7 Customer Changes** remain the latest customer statement on the matters they touch; where both are silent, the earlier clarification governs. A reversed older rule is recorded as superseded (§10), not left as a live mandate. **§13 records every CL3 row and its effect.** Where a conflict cannot be resolved under this order, it is recorded as **[Unresolved]** and no rule is silently chosen.

### 0.2 Status labels

- **[Customer-confirmed]** — directly supported by the briefing, a clarification session, or the Week 7 Customer Changes.
- **[Course-required]** — required by the Week 4 Project Instructions, the assessed rubric, or the Week 7 change-management guide.
- **[Team decision]** — chosen where the customer allowed discretion; includes the date and, where known, the story that recorded it.
- **[Engineering recommendation]** — proposed good practice not yet approved as scope.
- **[Derived acceptance rule]** — **not** stated by the customer. A testable closure that makes a customer mandate unambiguous and buildable. It is explicitly **not** a customer requirement and **not** an open ambiguity; the Product Owner may accept, adjust, or reject it.
- **[Unresolved]** — source conflict, unanswered question, or an overlap this revision must not silently decide.
- **[Deferred/KIV]** — retained but not committed now.

Evidence discipline (repo guidance `AGENTS.md`, §3): a recommendation, common practice, generated suggestion, simulated meeting, vote, or historical draft is **never** converted into a customer requirement. Roles, fields, permissions, states, transitions, security promises, deadlines, service levels, numerical defaults, and evidence are **not** invented.

### 0.3 Provenance and path conventions

- In-repository artefacts are referenced by **repository-root-relative paths in code spans** (e.g. `docs/requirements/effective-requirements.md`), matching repo guidance §8.
- Course/customer source material that lives **outside** the repository is identified by **exact document title and provenance only**; no personal absolute path, machine-local file reference, Downloads location, or expiring attachment URL is written, and no working external link is invented.
- Week 7 PDF source is cited by **exact document title and printed page/row** (e.g. "Week 7 Customer Changes, p. 1, Change #1").
- Cross-references inside this document are by section number and name; in-document anchors resolve to the headings below.
- Chronological source records are not rewritten to agree with later answers; the later superseding rule is recorded separately (repo guidance §8).

### 0.4 Source register

| Code | Exact document title | Location / provenance | How cited |
|---|---|---|---|
| `BRIEF` | Week 1 Customer Briefing ("IS212 (AY 2026/27 T1) – Customer Briefing") | Course material retained outside the repository; distilled in `docs/requirements/customer-briefing.md` | By title + `customer-briefing.md` section |
| `W4` | Week 4 Project Instructions ("IS212 (AY 2026/27, T1) – Scrum Project Instructions") | Course material retained outside the repository | By title + the 20-area table |
| `CL1` | Clarification Session 1 (G8), reconstructed in `docs/requirements/clarification-session-1.md` | Primary sheet "Session 1 - Clarification Answers_G8.xlsx – G8.pdf" retained outside the repository | `clarification-session-1.md` §n |
| `CL2` | Clarification Session 2 (G8), recorded in `docs/requirements/clarification-session-2.md` | Full Q&A supplied by the team; no standalone sheet located | `clarification-session-2.md` §n |
| `CL3` | "Session 3 - Clarification Answers_G8.xlsx" | Single visible sheet `G8`; 52 Q&A rows (rows 2–53), column B = question, column C = answer (column C has no header); no hidden sheets/rows/comments/merges. The latest customer statement on the rows it covers. | `G8!C<row>` (e.g. `G8!C12`) |
| `ER-OLD` | Effective Requirements (prior checkpoint) | `docs/requirements/effective-requirements.md` | Prior-checkpoint record |
| `AGENTS` | Repository guidance | `AGENTS.md` | `AGENTS.md` §n |
| `W7-CUST` | "IS212 (AY 2026/27 T1) – Week 7 Customer Changes" (2 pp.) | Course customer update; staged outside the repository | Title + p. + Change #n |
| `W7-GUIDE` | "IS212 (AY 2026/27, T1) – Managing Changes – A Guide" (3 pp.) | Course process guide; staged outside the repository | Title + p. + step/Scenario |

---

## 1. Course Scope and Delivery Constraints

**[Course-required]** The Week 12 first release must implement these **20 core functionality areas** as coherent end-to-end workflows rather than isolated screens (W4, "First Release – Core Functionality"):

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

**[Course-required]** The team must preserve Sprint evidence, estimation records, Sprint/task boards, burndowns, retrospectives, traceable tests, a C4 system design, working code, README instructions, and any CI pipeline used. The final Sprint must end by **Friday Week 12 (23:59)**; the final evidence deck must use the **Week 11 template**; an intra-team peer review follows in Week 14. Tests must trace to stories/acceptance criteria and cover normal, boundary, conflict, and failure scenarios.

**[Team decision]** The team uses an Excel Product Backlog/Scrum workbook rather than Jira. (Jira and ADRs remain out of scope — see §7.)

**[Customer-confirmed — W7-CUST framing]** The Week 7 update states: *"All of the suggested changes should be implemented in your submission. The customer does not anticipate any further changes for Release 1."* All six Week 7 changes are therefore mandatory for Release 1 and no further customer changes are expected (W7-CUST, p. 1, "Week 7 Customer Update").

---

## 2. Cross-Cutting Domain Model

### 2.1 Roles and Accounts

**[Customer-confirmed]** The baseline roles are:

- Event Organiser — external
- Event Coordinator — internal
- Venue Staff — internal
- Technical Support Staff — internal
- Attendee — external

**[Current role model — count]** After the Week 7 additions the total is **7 roles = 5 internal + 2 external**. The baseline was 3 internal (Event Coordinator, Venue Staff, Technical Support Staff) + 2 external (Event Organiser, Attendee). Both Week 7 roles (Event Coordinator Lead, Safety Officer) are **internal**, so internal becomes 5 and external stays 2.

**[Customer-confirmed]** There is no System Administrator role.

**[Customer-confirmed]** Event Organisers and Attendees self-register. Internal staff accounts are managed or defined through system defaults.

**[Customer-confirmed]** One user may hold multiple roles. Effective permissions combine assigned roles (the union of what each assigned role independently permits, evaluated per role rather than by combining roles before the record and status checks). **[CL3 limit on the union]** this does **not** let the Event Coordinator Lead additionally exercise a Coordinator's execution powers: per G8!C13 (referenced by C36, C40) the Lead reviews and assigns/reassigns but does not "put on the hat of" a Coordinator — no approve/reject/confirm of events, no assigning events to self as a Coordinator. The union may not be used to smuggle Coordinator execution through a Lead account.

**[Customer-confirmed]** Authentication must provide secure role-based access, but no specific technology, SSO requirement, password length, complexity, expiry, history, or lockout rule was prescribed.

**[Team decision]** The current Product Backlog selects email/password authentication. If the current six-character minimum is retained, record it as a team security choice rather than a customer requirement.

**[Customer-confirmed — W7-CUST Change #5]** A new internal role is introduced: **Event Coordinator Lead**, *"responsible for overseeing incoming event requests and assigning them to individual Event Coordinators"* (W7-CUST, p. 2, Change #5). Effective rules for this role are in §4.5.

**[Customer-confirmed — W7-CUST Change #6]** A further new internal role is introduced: **Safety Officer**, *"responsible for reviewing the operational safety of planned events"* (W7-CUST, p. 2, Change #6). Effective rules for this role and the gate it owns are in §4.6.1.

**[Customer-confirmed — CL3] Account administration.** The Event Coordinator Lead manages event and Coordinator assignments, **not** user authentication or account administration (G8!C18, C19, C20). No separate System Administrator role is introduced; external Organisers/Attendees continue to self-register, and the Lead does not add external users (G8!C18, C21). Internal accounts/roles are managed through the system's existing internal setup/defaults. **[Customer gap — not a team choice]** the concrete actor that creates, changes, or deactivates internal accounts is not named in any source; the equipment-vs-IT-team distinction (G8!B20) was never answered.

**[Customer-confirmed — CL3] Deactivation handover.** Before an internal user is deactivated, the Lead must reassign every active event to another Coordinator; active work must not remain assigned to an inactive user (G8!C22).

**[Customer-confirmed — CL3] Safety Officer allocation.** Reviews are routed through a safety-review queue or assigned to an authorised Safety Officer; each officer sees only the review-needed event details and relevant change history (attendance, venue/layout, access, equipment changes), not unrestricted access to unrelated events; the reviewer of each check is recorded (G8!C49).

**[Partly resolved — was Unresolved Week 7]** Provisioning method is now bounded (Lead is excluded; internal via existing defaults; external self-register), but the concrete internal-account creator remains a customer gap above.

### 2.2 Ownership and Relationships

**[Customer-confirmed]** One event request normally has exactly one Event Organiser owner.

**[Customer-confirmed]** Organisers cannot see unrelated client data.

**[Unresolved, partially resolved 3 Oct 2026]** Whether two Organisers in the same organisation may view each other's events beyond the owner-specific edit rule is a team design choice.

**[Team decision, 3 Oct 2026 — resolves the item above]** Organisers in the same organisation (same `organisationId`) may view each other's submitted events, read-only; only the owning Organiser edits, and only at Draft or Returned. Drafts stay private to their owner (CL2). This does not override the customer rule that Organisers cannot see unrelated clients' data. It was implemented by SPM-42 in `shared/permissions.js` (14 Sep 2026) and first recorded as a team decision with SPM-46; SPM-64 AC4 and AC6 rely on it.

### 2.3 Audit and Security Enforcement

**[Customer-confirmed]** Important actions must retain what changed, who changed it, and when, visible to authorised users where appropriate.

**[Customer-confirmed]** Access depends on role and relationship to the event.

**[Team decision / acceptance behaviour]** Authorisation must also deny unauthorised direct-link and API attempts; hiding UI controls is not sufficient.

---

## 3. Sprint 1 Effective Scope

Sprint 1 focuses on the first three functionality areas and contains seven stories. (This scope is unchanged; Week 7 changes are Release 1 additions and do not expand these Sprint 1 stories — see §12 and `AGENTS.md` §9.)

### SPM-1 — Sign In and Access Only My Role's Area

**[Customer-confirmed]** Users authenticate and receive access according to their assigned role(s) and event relationship.

**[Current backlog]** Required login fields are email and password. Successful authentication grants role-based access. Unauthenticated protected-route access redirects to login. Logout terminates the session.

**[Boundary]** SPM-1 does not replace the detailed record/field permission work in SPM-42.

### SPM-2 — Register for an Account

**[Customer-confirmed]** Eligible external users are Event Organisers and Attendees. Internal staff (now including Event Coordinator Lead and Safety Officer) do **not** use public self-registration.

**[Current backlog]** A registering user selects Event Organiser or Attendee. Common fields are name, email, and password. Organisation is additionally required for Event Organiser. Duplicate email is rejected. Successful registration creates the selected permitted role and permits sign-in.

**[Team decision]** SPM-2 is the 3-point reference story.

**[Team decision, 19 Sep 2026]** This increment collects a required organisation name at organiser registration and lets organisers view/add/edit that name on their own profile. The name is descriptive profile information: matching names do not link users or grant access, and edits do not change any existing organisation ID or event record. Shared organisation records, unique-ID assignment, and invitation codes are deferred. This does not satisfy the outstanding company-ID/membership requirements in SPM-42 or establish completion of SPM-2.

### SPM-42 — View and Edit Information According to My Role's Permissions

**[Customer-confirmed]**:

- users only view records permitted by role and event relationship;
- users only edit fields/sections permitted by role;
- direct-link and API attempts to reach unauthorised information are denied; an interface-level restriction alone does not satisfy this;
- Event Organisers view their own requests and their organisation's events, matched on the **company ID** supplied at registration, and cannot view another organisation's events (CL1, Accounts & Registration);
- Event Organisers edit only requests they own, and **cannot edit a request they own once it has been submitted**, unless the Event Coordinator returned it for clarification or changes (CL2, Role Permissions & Access);
- Event Coordinators edit event details (CL1: *"Coordinators can edit event details"*; CL2: *"Modify Access: Event Coordinators edit main event details"*). Which events they view is stated only as *"internal staff can view relevant event information"* (CL2) and *"internal staff can search relevant system events"* (CL1); the SPM-65 team decision below fills that gap. No Coordinator sees a draft that has never been submitted;
- Venue Staff view and update the venue section of relevant events and cannot see the equipment section; Technical Support Staff view and update the equipment/technical section and cannot see the venue section (CL1: the two "operate independently");
- Attendees see attendee-facing information but not internal planning information;
- multi-role users receive combined permissions — the union of what each assigned role independently permits, evaluated per role. **[CL3 limit]** this union does not extend a Lead's permissions into Coordinator execution: the Lead does not approve/reject/confirm events or self-assign as a Coordinator (G8!C13, C36, C40).

**Correction note (14 Sep 2026, Shaun):** two bullets previously in this section were the SPM-42 backlog card's original wording rather than the clarification record, and were narrower than the customer's ruling. Corrected under `AGENTS.md` §2, where a later customer clarification outranks a backlog record. The chronological session records are unchanged.

**Correction note (2 Oct 2026):** three quotations previously cited in this section and in §4.5 do not appear in the G8 Session 1 or Session 2 answer sheets and are not traceable to any customer source. They were removed and replaced with the sheets' wording. The 14 Sep correction note is kept as the record of that earlier change.

**[Team decision] (1 Oct 2026, SPM-65)** Event Coordinators view and act only on events assigned to them (`assignedCoordinatorUid`). This fills the gap left by "relevant event information"; it does not override a customer requirement. A Coordinator requesting an event not assigned to them receives **404**, so its existence is not confirmed; other roles keep 403. When an event is reassigned, it leaves the previous Coordinator's scope and enters the new one's.

> **Week 7 effect (Change #5).** SPM-65's "ordinary Coordinators see only assigned events" rule is **preserved unchanged**. It now coexists with the Event Coordinator Lead, who has a separate supervisory view (§4.5, §9.5). This candidate does not merge the two scopes.

**[Unresolved ambiguity]** Whether "edit main event details" limits a Coordinator to some sections. The SPM-42 implementation lets the assigned Coordinator view and edit every section, including internal planning notes; that is the team's implementation, not a customer quotation.

**[Resolved — CL3] Submitted-status naming.** The customer's confirmed lifecycle (G8!C2) uses **Submitted** (Submitted → Unassigned queue → Assigned/Under Review …); this supersedes the older CL1 transcript's "Requested" wording. The customer term is **Submitted**. Exactly how the implementation maps "Submitted" onto internal state fields is a team detail, not a customer ambiguity. SPM-42's state gate and SPM-24's queries test only `draft` and are unaffected.

**[Team decision]** Two rules the customer did not rule on, proposed by Shaun on 14 Sep 2026, implemented in `shared/permissions.js`, and ratified 20 Sep 2026. They fill an area the customer left open and do not override any confirmed customer requirement:

- **Finished events are read-only for every role.** A request at Completed, Cancelled or Rejected cannot have any section edited. Status transitions are separate actions and are not affected.
- **Attendees see Confirmed events only.** An Attendee cannot see a request at any other status, even with registration enabled. The existing condition that registration is enabled is retained.

**[Deferred/KIV]** Registration settings after submission. The Organiser controls whether registration is enabled and when it closes (CL2), but cannot edit a request once submitted unless it is returned. Changes to a Confirmed event otherwise belong to Event Change Requests (§4.19).

**[Team decision, 7 Oct 2026 — SPM-48, pending PO confirmation]** Staff edit rights changed after SPM-42 shipped. Venue Staff and Technical Support Staff still view the Organiser's requested venue (`venue`) or equipment (`equipment`), but no longer edit it. Each now edits only its own preparation section (`venuePreparation` / `equipmentPreparation`), and only while that section's condition holds. The assigned Coordinator views both preparation sections read-only. See §4.7, SPM-48.

**[Boundary]** SPM-42 cannot be Done until all named roles and their relevant information surfaces exist and are tested. **Week 7 note:** the two new internal roles (Event Coordinator Lead, Safety Officer) add permission surfaces that this story's completion claim cannot cover; they belong to new Release 1 PBIs, not to SPM-42.

### SPM-7 — Create an Event Request

**[Customer-confirmed]** An Event Organiser can start a request and enter: title/name; purpose and description; expected attendance; duration; preferred date/time; venue/layout preferences; accessibility needs; equipment requirements; registration needs. One request represents one event date and has one Organiser owner. Entering or editing data does not submit the request or start staff review.

### SPM-3 — Submit an Event Request

**[Customer-confirmed]** The minimum combined submission fields are: event title; purpose; expected attendance/pax; duration; preferred date/time; primary venue/layout requirements. Missing mandatory information blocks submission and identifies each missing field. Previously entered data is retained, the request remains editable, and staff review does not start.

> **Week 7 effect (Change #5).** A successful submission no longer immediately assigns a Coordinator. The request enters the **unassigned queue** first; see §4.5 and §9.5. The submission validation and field rules of SPM-3 are unchanged.

### SPM-4 — Save an Event Request as a Draft

**[Customer-confirmed]** A draft: may be saved while mandatory submission fields are incomplete; retains entered data; remains editable by its creating Organiser; is private and single-owner before submission; is not visible to staff, other Organisers, or Attendees; does not expire automatically; does not start submission or review; changes to Submitted when validly submitted. The current backlog says a draft remains until submitted or deleted. Deletion itself is not customer-mandated and is deferred; do not make deletion necessary for SPM-4 completion.

### SPM-24 — View My Saved Draft Requests

**[Customer-confirmed]** Organisers must be able to return to and continue editing saved drafts, and drafts must remain distinguishable from submitted requests. Drafts are strictly private until submitted and do not expire. An unsubmitted draft is not visible to **any** other user — Event Coordinators included, and also other Event Organisers in the same organisation (CL2, Drafts: *"strictly private until submitted"*). Enforcement is SPM-42's record-scope predicate.

**[Team decision]** Use a dedicated Drafts page/section rather than a combined list. Selecting an owned draft opens it for editing. Submitted requests show their current status and are not editable as drafts. An Organiser with no saved drafts is told so rather than shown a blank screen. Filtering is optional convenience, not a customer requirement.

**[Boundary]** That reopening a draft retains all previously entered data is SPM-4's acceptance criterion, not this story's.

### Overlap and Deferred Records

- **[Team decision]** SPM-22 remains recorded as `Removed — Overlap` because SPM-2 covers external registration.
- **[Team decision]** SPM-23 remains recorded as `Removed — Overlap` because SPM-3 includes mandatory-field validation and failure recovery.
- **[Team decision]** SPM-43 remains recorded as `Removed — Overlap` because SPM-7 includes equipment and accessibility inputs.
- **[Deferred/KIV]** SPM-44, deleting a saved draft, is not a customer requirement and is outside Sprint 1.

---

## 4. Remaining Core Functionality Areas

The 20-area order below follows §1. Week 7 deltas are integrated into the area they modify and are cross-linked to the dedicated Week 7 section (§9) and traceability matrix (§9.7).

### 4.4 Event Review and Approval

**[Customer-confirmed]** Event Coordinators review submitted requests, seek clarification, return for amendment, approve/allow planning, or reject. Returned requests are edited and resubmitted; rejected unfulfillable requests close. Initial feasibility considers attendance, date/time, venue, and equipment availability.

**[Implemented — SPM-5, 2 Oct 2026 — historical record]** The assigned Coordinator reviews a Submitted request's title, expected attendance, duration, preferred date/time, venue/layout preference, accessibility and equipment on the request page, then moves it to Under Review, then approves it to Planning. Every other Coordinator is refused approve, return, reject and start review with the same 404 as a missing request (SPM-65). The SPM-9 transitions are reused.

**[Team decision pending — SPM-5]** "When they open it for review" is served by the Coordinator's **Start review** action, not by viewing the request: opening a page does not change the status.

**[Engineering recommendation — SPM-5]** "With sufficient information" is enforced as a minimum: Approve is refused while the request fails the submission check. Whether the information is sufficient beyond that remains the Coordinator's judgement.

**[Implemented — SPM-25, 2 Oct 2026 — historical record]** Return for Clarification (Under Review → Returned, assigned Coordinator only) requires a clarification message, stored as top-level metadata (`clarificationRequests`). The owning Organiser may then edit every section and resubmit; resubmission keeps the same request and its Coordinator and returns it to Submitted. No limit on the number of returns is applied, because no source sets one.

**[Team decision pending — SPM-25]** Until a Notification System (§4.20) exists, "the Organiser is notified" is served in-app only. Every clarification message is kept after resubmission, newest first; who sent each message is kept internally and is not shown.

### 4.5 Coordinator Assignment

**[Customer-confirmed]** Exactly one Coordinator per event. The assigned Coordinator is the Organiser's primary point of contact.

> **Week 7 supersession (Change #5).** The customer now mandates that **newly submitted requests are no longer assigned directly/automatically to a Coordinator.** This reverses the prior auto-assign-on-submit behaviour. The effective rule is:

**[Customer-confirmed — W7-CUST Change #5]**

- *"Newly submitted event requests should no longer be assigned directly to an Event Coordinator. Instead, they first enter an unassigned queue that can be viewed by the Event Coordinator Lead."* (W7-CUST, p. 2, Change #5)
- *"The Lead can review basic event information, assign a suitable Event Coordinator, and reassign events where necessary."* (ibid.)
- *"Event Coordinators should only be able to manage events assigned to them, while the Event Coordinator Lead should be able to view all coordinator assignments and active events under their supervision."* (ibid. — the phrase **"under their supervision"** is retained verbatim and bounds the Lead's view)
- *"Relevant users should be notified when assignments or reassignments occur."* (ibid.)

**[Derived acceptance rule — Change #5]** Submission therefore ends in an **unassigned** state; no Coordinator is chosen by the system at submit time. The Lead then performs the assignment action, after which the event carries `assignedCoordinatorUid` as before. The supported display for this queue is **"Unassigned"** (the customer's wording, G8!C42). The earlier team label "Not yet assigned" (SPM-46) is the same state under an older wording and is treated as historical — see below.

**[Resolved by CL3 — Change #5 open points]**

- **Reassignment authority = Lead-only.** Only the Lead performs a reassignment in the system; the assigned Coordinator may **request** a transfer but cannot hand the event over directly (G8!C12, C35, C39). This supersedes the older CL2/SPM-26 reading that the assigned Coordinator itself initiates the handoff; the Coordinator now raises a request the Lead reviews and executes.
- **Lead does not act as a Coordinator.** The Lead reviews assignment/active-event information and assigns/reassigns, but does not don the Coordinator hat — no approve/reject/confirm of events, and no assigning events to self as a Coordinator (G8!C13; C36 and C40 refer back to C13).
- **Lead supervision scope.** A Lead sees the unassigned queue **plus the active events that that Lead themselves previously assigned** to Coordinators (G8!C41). The system supports **one or more** Leads; each Lead's supervisory scope is recorded, at least one Lead must cover the common unassigned queue, and no single Lead account may be hard-coded (G8!C33). This bounds the verbatim phrase "under their supervision" to the Lead's own assigned set, not a global view.
- **Notification recipients (resolved).** New assignment → notify the newly assigned Coordinator **and** the Organiser. Reassignment → notify the new Coordinator, the previous Coordinator, and the Organiser (G8!C43, C14). The Lead's action is recorded; notifying *other* Leads applies only when they own that queue/scope, and that last clause is explicitly optional ("consider or ignore") left to development (G8!C43).
- **Disposition of already-assigned events.** Existing assignments are kept; Week 7 changes only how newly submitted requests are handled and does not require resetting work already assigned. The Lead may reassign an existing event when needed and notifies the affected users (G8!C38).
- **Reassigned records follow the event.** Pending venue/equipment requests, holds, comments and history stay attached to the event and become available to its new Coordinator (G8!C14).
- **Returned-and-resubmitted.** A returned request stays assigned to its current Coordinator on resubmission (it does **not** re-enter the Unassigned queue); the Lead may reassign it if staffing changed or the Coordinator is unavailable (G8!C15).
- **Pre-assignment display.** Before assignment the Organiser sees **"Unassigned"**, which becomes the Coordinator's name once assigned (G8!C42). This aligns with the SPM-46 "Not yet assigned" display; the customer's wording is "Unassigned".
- **[Customer gap — not decided]** whether the system may still *suggest* a Coordinator by workload while the Lead chooses (G8!B12). CL3 confirms **no auto-assignment** (G8!C37) but does not expressly ban read-only decision-support suggestions; this is left open rather than inferred.

**[Historical record — superseded at submit step]** The prior SPM-8 algorithm (fewest active assigned events among eligible Coordinators, random tie-break, submitter excluded, recorded with actor "System") remains the documented selection rule that **would** pick a Coordinator when the Lead chooses one, and it still describes how an already-assigned event kept its Coordinator. It is **no longer triggered automatically at submission**.

- **[Superseded behaviour — Change #5]** The old rule that an empty Coordinator pool is a **server error** ("the submission is rejected and the request stays a Draft") no longer applies. A post-submit request with **no Coordinator is now the normal unassigned-queue state**, not a failure.
- **[Open sub-question]** whether the Lead reuses this exact algorithm when manually assigning, or chooses a Coordinator another way, is a team decision not yet made (§8.1).

See §10, Superseded Legacy Register.

#### SPM-26 — Reassign an Event to a Different Event Coordinator

**[Customer-confirmed — live]** Exactly one Coordinator is assigned to an event — except the new Week 7 state in which a newly submitted request sits in the **Unassigned queue** before the Lead assigns a Coordinator (G8!C2, C12).

**[Historical / superseded by CL3]** The earlier CL2 reading that the **assigned Coordinator itself initiates** a reassignment after offline agreement (G8!B-era CL2 §4) is no longer live: per G8!C12, C35, C39 only the Lead performs a reassignment, and the assigned Coordinator may only *request* one. The offline-agreement handshake is retained only as the Coordinator's requested handover the Lead reviews, not as a self-service transfer. See §10.

**[Implemented — SPM-26, 3 Oct 2026 — historical record]** Rules in `shared/coordinatorReassignment.js`:

- **Who:** only the event's assigned Coordinator. An unassigned Coordinator is refused with 404; any other role gets 403.
- **When:** at any status except Completed, Cancelled and Rejected.
- **To whom:** another user holding the Coordinator role, never the current Coordinator; the user must confirm the handover was agreed outside the system.
- **What changes:** only `assignedCoordinatorUid` (and `updatedAt`). Status, sections, sign-off and any cancellation request are untouched. Reassignment is not a status change.
- **Record:** a `coordinator_reassigned` activity entry with `previousCoordinatorUid`, new `coordinatorUid`, `actor` and `at`, in the same transaction.
- **Change 5 readiness:** the permission check (`mayReassignCoordinator`) is deliberately separate from the change itself (`reassignCoordinatorInTransaction`), so the Lead's authority can be added by replacing the permission check.

> **Week 7 / CL3 effect.** SPM-26's *mechanism* is reused, but its *permission* is now resolved: only the Lead performs the reassignment; the assigned Coordinator may only **request** it (G8!C12, C35, C39). The old "assigned Coordinator initiates after offline agreement" reading is superseded — see §10. SPM-26's transactional record and the deliberate separation of `mayReassignCoordinator` from the action remain the integration point for the Lead's authority.

**[Team decision, 3 Oct 2026]** Reassignment is allowed while an Organiser's cancellation request is pending; no handover note is recorded (the agreement is a required confirmation only). The event's submitter, if they also hold the Coordinator role, is never a reassignment candidate.

**[Historical SPM-26 note, superseded by CL3 on notifications and lifecycle]** At SPM-26's 3 Oct 2026 implementation, reassignment did not by itself imply a lifecycle change, and no Organiser/Coordinator notification was built. That is now superseded: **(a)** reassignment notifications are required — new Coordinator + previous Coordinator + Organiser (G8!C14, C43); **(b)** an accepted significant change on a Confirmed event re-enters the standard lifecycle back to planning/reviewing (G8!C16, C48), so a Confirmed → planning transition does occur on those changes. Reassignment itself still does not force a lifecycle change; the lifecycle re-entry is driven by the accepted significant change, not by the act of reassigning.

#### SPM-46 — View the Assigned Event Coordinator

**[Customer-confirmed]** *"The assigned Event Coordinator acts as the primary point of contact for the Organiser."* — CL1 §4. There is strictly one Coordinator per event.

**[Team decision, 3 Oct 2026]** How the Organiser sees the Coordinator:

- **Who sees it:** anyone whose Organiser role puts the event in scope under SPM-42 — the owner and same-organisation colleagues. Only the Organiser role receives it.
- **What is shown:** the Coordinator's display name only — never the uid, email or roles.
- **Drafts:** no Coordinator is shown.
- **Submitted with no Coordinator:** the current customer-facing label is **"Unassigned"** (G8!C42), transitioning to the Coordinator's name once assigned. The 3 Oct 2026 team wording **"Not yet assigned"** is the same state under an older label and is retained as a historical implementation string, not as the current wording.
- **Assigned, but no usable name:** "Assigned (name unavailable)", never "Unassigned".

Implemented by `shared/assignedCoordinator.js` and `backend/src/services/assignedCoordinatorService.js`. The response field is `assignedCoordinator`. Reassignment itself is SPM-26.

### 4.6 Event Status Management

**[Customer-confirmed]** Draft, Submitted, Under Review, Planning, Confirmed, Completed, Cancelled, Rejected, and a returned/amendment condition are required concepts.

**[Resolved — team decision, 1 Oct 2026]** The earlier Approved/Confirmed ambiguity is settled by the decision below: *Approved* means *Confirmed* and there is no separate Approved status. This is **not** an open decision in this revision. The Week 7 safety-gate question is now answered on **stage order** by CL3 (below); the only residual question is the exact implementation label (§4.6.1), not whether Approved and Confirmed are the same state.

**[Customer-confirmed — CL3 lifecycle]** The customer confirmed the end-to-end order (G8!C2, C3; C44 refers to C2): **Draft → Submitted (Unassigned queue) → Assigned / Under Review → Planning → Venue & Technical approved → Pending Safety Check → Confirmed → Preparation → Completed**, with **Returned, Rejected and Cancelled** as separate outcomes. Two rules follow: **(a)** safety approval is required **before Confirmed** — Confirmed is *after* the Operational Safety Check; **(b)** **Preparation is a separate status/stage** that cannot begin until safety approval (G8!C3). **The functional distinction of the Preparation stage is mandatory** — preparation edits are gated after Confirmed and must not be allowed earlier. What remains a team implementation choice is only the *storage representation* (discrete rows in the SPM-9 transition table, a metadata record, or a derived precondition); that choice must not collapse the named Preparation stage back into Confirmed or Planning. CL3 confirms the order and gating, not a new ratified status label.

**[Customer-confirmed — CL3] Returned is not terminal.** Returned, Rejected and Cancelled are distinct outcomes; a Returned request may be edited and resubmitted (resubmission keeps its assigned Coordinator, G8!C15).

**[Customer-confirmed]** Under Review means evaluation/clarification; Planning means arrangements are underway; Completed follows the event date/time; returned requests may be edited/resubmitted; rejected requests close.

**[Team decision, 1 Oct 2026]** "Approved", as a customer status word ("Confirmed/Approved", CL2), means the **Confirmed** status. There is no separate Approved status. The review action that passes initial feasibility moves Under Review → Planning; **Planning moves to Confirmed only when (a) all required venue bookings are approved (one rejected venue keeps the event in Planning, G8!C24), (b) the required technical arrangement is approved, and (c) the Operational Safety Check has been approved (G8!C2, C3).** Event-level readiness is the aggregate of every required venue and technical arrangement plus safety approval (G8!C50). (The SPM-9 transition rows that follow are the team's historical implementation; the added safety/all-venue conditions are the CL3 live rule.)

**[Implemented — SPM-9, 1 Oct 2026 — historical record]** Transitions in `shared/statusTransitions.js`:

- Draft → Submitted (submit) and Returned → Submitted (resubmit), by the owning Organiser; resubmission keeps the assigned Coordinator;
- Submitted → Under Review (start review); Under Review → Returned; Under Review → Planning; Under Review or Planning → Rejected; Planning → Confirmed (once arrangements are approved); Confirmed → Completed; Confirmed → Cancelled;
- Completed, Cancelled and Rejected are terminal: no action is accepted from them;
- each status change adds a `status_changed` activity entry with previous status, new status, user responsible and date/time, in the same transaction.

**[Team decision — SPM-9, 1 Oct 2026]** Every Coordinator action is limited to the assigned Coordinator; the assigned Coordinator marks an event Completed only once `core.preferredDateTime` plus `core.durationHours` has passed (an automatic system job is deferred); status actions are served at `POST /api/event-requests/:id/transitions`.

**[Team decision, 1 Oct 2026 — SPM-9] Minimal venue and technical sign-off:**

- at Planning, assigned Venue Staff approve/reject the venue arrangement, and assigned Technical Support Staff approve/reject the technical arrangement;
- the venue arrangement is always mandatory; the technical arrangement is required only when the request asks for equipment or technical support (CL2: approval "is based on what the event actually requests");
- a rejection keeps the event in Planning and blocks Confirm until the arrangement is approved; staff may change their decision while the event is in Planning;
- decisions are stored as record metadata (`arrangementApprovals`), which no section edit can write.

**[Implemented — SPM-45, 4 Oct 2026 — historical record]** Rejection builds on SPM-9's Reject transition (Under Review or Planning → Rejected, assigned Coordinator only): Reject now requires a reason; every rejection records top-level `rejection` metadata (reason, previous status, deciding Coordinator, time); the event page shows a Rejected request as closed, with the reason, the stage it was rejected at, and the time, to every user who can view it (who rejected it is not shown); a venue or technical arrangement rejection keeps the event in Planning, and Venue/Technical Staff cannot reject the overall event.

**[Implemented — SPM-27, 4 Oct 2026 — historical record]** Completion builds on SPM-9's Complete transition (Confirmed → Completed, assigned Coordinator only, once `core.preferredDateTime` plus `core.durationHours` has passed). Every completion records top-level `completion` metadata (who, display name, time) in the same transaction, beside the `status_changed` entry, and the event page shows when the event was marked completed. Completed events list under "Closed events" (SPM-63).

**[Team decision pending — SPM-27]** Who marked an event completed is shown on the event page to Coordinators only; other users see when.

**[Known gaps — SPM-45/SPM-27]** The activity history is recorded but not displayed; at Planning, Reject does not require a rejected venue/technical arrangement first; the Organiser is not notified of a rejection; seeded Rejected and Completed requests predate these records. **[Historical gap — unverified in this revision]** Venue Staff suggesting alternatives (§4.13 customer rule) is not yet modelled as a feature.

#### 4.6.1 Week 7 Safety Gate (Change #6) — mandatory lifecycle insertion

**[Customer-confirmed — W7-CUST Change #6]**

- *"After the venue and technical arrangements have been confirmed, the Safety Officer must conduct an Operational Safety Check before the event can proceed to preparation."* (W7-CUST, p. 2, Change #6)
- Review factors: *"expected attendance, venue capacity and layout, emergency access, accessibility requirements, equipment placement, crowd movement, and any known venue restrictions."* (ibid.)
- Outcomes: *"The Safety Officer may approve the event, reject the safety arrangement, or request changes."* (ibid.)
- Loop: *"If changes are required, the event returns to the relevant earlier planning stage and affected venue or technical arrangements may need to be reviewed again."* (ibid.)
- Hard block: *"The event cannot proceed to preparation until the Safety Officer has approved it."* (ibid.)
- Assumption: *"You can assume that the Safety Officer will always give a response (approve/reject/request)."* (ibid.)

**Effective placement (CL3-confirmed order).** The gate sits **after** venue and technical arrangement approval and **before Confirmed** (customer: "Pending Safety Check → Confirmed"); only after safety approval may the event become Confirmed and then enter the separate **Preparation** stage, which unlocks the SPM-48 `venuePreparation` / `equipmentPreparation` sections. The gate is a mandatory precondition; it does not replace the existing venue/technical sign-off. **Stage vs label:** while a safety review is pending or changes are requested, the event remains **in Planning** (G8!C46); "Pending Safety Check" is therefore a stage inside the Planning phase rather than a separate terminal row, and the exact status-model implementation stays a team choice.

**Boundary / failure rules (marked):**

- **[Customer-confirmed]** No preparation work (SPM-48 sections) may begin until the Safety Officer has approved and the event enters Preparation (G8!C3, C45).
- **[Customer-confirmed]** **Rejecting the safety arrangement rejects the venue's suitability for the event, not the whole event request.** The event stays in Planning with the safety issue and reason visible to the Coordinator; revised arrangements and another safety review are allowed. The Coordinator may reject/cancel the whole event only through the normal event decision process (G8!C47). This upgrades the earlier derived rule below to a confirmed customer rule.
- **[Customer-confirmed]** When the Safety Officer requests changes, the event remains in Planning until all approvals are done; there is **no automatic assignment or sign-off reset** — the Coordinator makes the changes if necessary (G8!C46).
- **[Customer-confirmed]** The review uses a **structured checklist** over the named factors (attendance/capacity, layout, emergency access, accessibility, equipment placement, venue restrictions) with comments and exactly one outcome: approve, reject the safety arrangement, or request changes. The Organiser sees the outcome and actionable comments, **not** private internal notes (G8!C17).
- **[Customer-confirmed]** Because a response is always assumed, there is no "no-response timeout" rule; the gate is held open by an explicit Safety Officer decision (W7-CUST, p. 2, Change #6).

**[Resolved by CL3; residual open only on implementation label]**

- **Status modelling.** CL3 confirms the stage order (safety before Confirmed; Preparation a separate stage after it) and that a pending/change-requested review keeps the event in Planning (G8!C2, C3, C46). What remains a **team implementation choice** is whether these become rows in the SPM-9 transition table, metadata records (like `arrangementApprovals`), or a derived precondition; no new status name is ratified by this document.
- **Safety Officer allocation — resolved.** Routed via a safety-review queue or assigned to an authorised Safety Officer; reviewer recorded per check (G8!C49; see §2.1).
- **Downstream recovery state — resolved.** On "request changes" the event stays in Planning and the Coordinator drives the re-review; on safety rejection the event stays Planning while the venue arrangement is revised (G8!C46, C47).

### 4.7 Event Information Management

**[Customer-confirmed]** Field and section permissions follow role and ownership. Routine contact or descriptive edits are normal. Significant date/time, duration, attendance, venue/layout, or equipment changes trigger formal re-review and may alter Planning/confirmation status.

#### SPM-64 — View and Edit My Event Request

**[Implemented — SPM-64, 4 Oct 2026 — historical record]** Built on SPM-42's permissions; SPM-64 adds the arrangements summary and tests, not new rules:

- **AC1/AC2:** an Organiser edits only requests they own, and only at Draft or Returned. Changes after submission otherwise go through Event Change Requests (§4.19, SPM-20), which do not exist yet; no "Request change" option is shown.
- **AC3:** at Submitted, Under Review, Planning and Confirmed the Organiser's own event is read-only: the API refuses every section edit with 403 naming the fields.
- **AC4/AC6:** the list holds the Organiser's own events and their organisation's submitted events, never another client's. A same-organisation colleague's event is read-only.
- **AC4/AC6 follow-up (4 Oct 2026, shipped with SPM-28):** Organisers can tell their own requests from colleagues' requests. For an Organiser, list items and the request response carry `ownerName` and `isOwnRequest`; no owner uid is ever sent. The "All" / "My requests" filter runs on the client.
- **AC5:** the event page shows the status and a "Your event arrangements" summary of date and time, venue and equipment, each labelled **Requested**, with the venue and technical sign-off state.
- The `internal` section is never sent to an Organiser, owner or colleague, at any status.

**[Team decision, 4 Oct 2026 — SPM-64]** How a venue or technical sign-off reads, by status: before Planning → "Not started — reviewed during planning"; at Planning/Confirmed undecided → "Awaiting approval"; once closed → "Not reviewed — event closed"; a decided sign-off → "Approved"/"Rejected"; one the event does not need → "Not required".

#### SPM-28 — View the Change History of an Event

**[Customer-confirmed]** *"Important actions must retain what changed, who changed it, and when, visible to authorised users where appropriate."* (§2.3)

**[Team decision, 4 Oct 2026 — pending PO confirmation]**

- **Viewers:** the assigned Event Coordinator and the owning Event Organiser may view change history (the Organiser sees every entry except internal planning fields and the `venuePreparation`/`equipmentPreparation` sections). **[CL3 exception — G8!C49]** the Safety Officer may additionally see the review-needed event details and the **relevant change history** (attendance, venue/layout, access and equipment changes) for events routed to them; this is a scoped review view, not unrestricted access to unrelated events, and the reviewer of each check is recorded.
- **Submitted onwards:** history is recorded for edits at Submitted or any later status. Draft saves record nothing.
- **Field edits only:** one entry per field whose value changed. Status transitions, assignment/reassignment, sign-off and cancellation keep their own activity types.

**[Implemented — SPM-28, 4 Oct 2026 — historical record]** `PATCH /api/requests/:id` writes one `field_changed` entry per changed field in a transaction; `GET /api/requests/:id/history` returns visible entries newest first without the actor's uid; there is no route to edit or delete an entry.

**[Known gaps — SPM-28]** Unvalidated ordinary field values; live API runs add entries (seed script removes them); entries within one save share a timestamp. (The significant-fields validation gap was closed 9 Oct 2026 under SPM-10.)

#### SPM-48 — Venue Staff and Technical Support Staff Update Preparation Status

**[Customer-confirmed]** G8 clarification answers, quoted exactly:

- G8 Session 1 (Lim Natthida): *"Event Coordinator edits main details; Organiser can request edits; Venue and Tech staff update their respective preparation/reservation sections."*
- G8 Session 1 (Jian Yong): *"Venue/Tech staff update preparation details."*
- G8 Session 1 (Yiap En Rui): *"Venue Staff and Tech Staff will update the rediness status in event."*
- G8 Session 2 (Leyna): *"Venue Staff and Technical Support update their respective venue/equipment sections."*

**[Team decision, 7 Oct 2026 — pending PO confirmation]** The SPM-48 criteria:

- **Sections:** two sections `venuePreparation` and `equipmentPreparation`, each `{ status, notes }`. Status is Not Started, In Progress or Ready.
- **Who edits:** assigned Venue Staff edit only venue preparation; assigned Technical Support Staff edit only equipment preparation. Neither role edits the main event details, the Organiser's requested venue/equipment, or the other role's preparation.
- **SPM-42 behaviour change:** staff previously edited `venue` / `equipment`; they now view those sections read-only.
- **Coordinator:** the assigned Coordinator views both preparation sections, read-only.
- **Preparation is internal:** Organisers and Attendees never receive either preparation section or its history.
- **Display rule:** preparation is shown from Planning onwards, the closed statuses included.
- **Notes limit:** text of at most 2,000 characters. The customer set no limit.

**[Superseded by CL3 — do not treat as the live gate]** The 7 Oct 2026 TEMPORARY rule ("Preparation may be updated only at Planning or Confirmed, with the matching SPM-9 sign-off approved") was a stopgap standing in for "an approved venue booking" (SPM-54) and "reserved equipment" (SPM-56/SPM-62). **[Current live unlock — G8!C45]** Venue Staff and Technical Support preparation updates become available **only after the Safety Officer approves the event and the event enters Preparation** (G8!C3, C45). The venue/technical arrangement readiness remains a prerequisite, but the Preparation stage itself sits after safety approval; no earlier point (Planning, or Confirmed-only) may unlock preparation edits. The data-model storage of the Preparation stage is a team implementation choice, but it must not allow preparation to begin earlier than the safety-approved, Preparation stage.

> **Week 7 effect (Change #6).** Preparation availability is now additionally gated by the Safety Officer's approval (§4.6.1). The SPM-48 temporary condition and the safety gate both must hold before a preparation section becomes editable. This candidate does not collapse the two conditions into one; they are recorded separately so the safety precondition cannot be silently bypassed by the SPM-48 replacement.

**[Unresolved ambiguity — pending PO confirmation]** Which sections staff edit (Session 1 supports preparation-only; Session 2's "their respective venue/equipment sections" could mean the Organiser's requested sections). The team has implemented SPM-48 as written; this is recorded for the PO, not settled. The team-written reconstruction line about equipment refinement is **not** a customer source.

#### SPM-10 — Edit Event Information and Flag Significant Changes for Re-review

**[Customer-confirmed]**

- §4.7: significant date/time, duration, attendance, venue/layout or equipment changes trigger formal re-review and may alter Planning/confirmation status; routine edits are normal.
- CL1 (line 54): *"Significant changes include expected attendance, duration, venue requirements or layout, and date/time. These trigger re-review."*
- CL2 §5: examples include date, duration, expected attendance, venue and equipment requirements; *"Review/Planning resumes to reassess feasibility"*; routine contact/descriptive edits need not trigger re-review; *"The Coordinator reviews whether a change is significant and whether it affects confirmation or planning status."*
- G8 Session 2 (Leyna), quoted exactly: *"Yes, correct. Routine edits (e.g., contact info, descriptive text) are normal updates. Significant changes affecting date, duration, expected attendance (pax), venue, or equipment requirements, require formal re-review and may affect confirmation/planning status. (Subject to review by Co-ordinator)."*

**[Team interpretation, 8 Oct 2026]** Significance is decided by a fixed field list; the assigned Coordinator is the one making the significant edit and sees an in-page confirmation of its effect. The "formal change request" path for Organisers is Event Change Requests (§4.19, SPM-20/SPM-40), out of scope here.

**[Team decision, 8 Oct 2026] SPM-10 criteria (final):**

- **Field classification** (`SIGNIFICANT_FIELDS`): significant = `core.preferredDateTime`, `core.durationHours`, `core.expectedAttendees`, `venue.layoutPreference`, `venue.accessibilityRequired`, `venue.accessibilityNeeds`, `equipment.requirements`, `equipment.technicalSupportNeeded`. All other fields are ordinary.
- **Effects by status (revised by CL3):** Submitted/Under Review/Returned → applied, change entry marked significant, nothing else. On a Confirmed event, a Coordinator-accepted significant change re-enters the standard lifecycle and the status returns to planning/reviewing (G8!C16; C48 refers to C16). **Per CL3 there is NO automatic reset of any venue/equipment sign-off on a change** — the Coordinator reviews the change and decides the next action (G8!C51). This **supersedes** the 8 Oct 2026 team rule that automatically cleared both sign-offs; the lifecycle re-entry (status flow) and the absence of an automatic sign-off wipe are two distinct mechanisms, both Coordinator-gated. A "Not required" sign-off is derived from the equipment fields.
- **Validation (significant fields only):** positive whole-number attendance; positive duration; valid date/time; non-empty layout text ≤2,000 chars; accessibility needs text ≤2,000 chars; equipment array of text; boolean flags. Invalid input returns 400 naming each field, nothing written. Values normalised and compared by meaning.
- **Required fields:** date/time, duration, attendance and layout cannot be cleared from Submitted onwards.
- **Status history:** Confirmed → Planning recorded as a `status_changed` entry with `action`/`reason` = `significant_change`, Coordinator as actor.
- **Notifications:** at Planning/Confirmed, assigned Venue/Technical Staff notified in-app (type `significant_change`); the actor is never notified; no email.
- **Bookings:** existing venue/equipment bookings are not released by a significant change (until SPM-54/SPM-56/SPM-62 exist).

**[Team decision, 8 Oct 2026 — SPM-10 AC7]** A significant change is refused (409) while a Confirmed event has an open (pending or returned) cancellation request; ordinary edits are still allowed.

**[Implemented — SPM-10, 9 Oct 2026 — historical record]** Rules in `shared/significantChanges.js`; route order permission (403) → validatePreparation (400) → validateSignificantFields (400) → AC7 (409); one transaction writes fields, marked `field_changed` entries, cleared sign-offs, status change and notifications.

> **Week 7 / CL3 effect (Change #6).** When a significant change on a Confirmed event is accepted, the event re-enters the standard lifecycle and returns to planning/reviewing, **which includes the safety checkpoint** (G8!C16, C48). The Coordinator's discretion (G8!C51) is limited to **venue/technical sign-offs: there is no automatic reset of any venue/equipment arrangement** — the Coordinator reviews and decides which arrangements to re-review. The safety checkpoint itself is not optional Coordinator judgment: once a confirmed event re-enters the lifecycle, it must pass through the safety review again before reaching Confirmed/Preparation, consistent with the customer's loop (*"the event returns to the relevant earlier planning stage and affected venue or technical arrangements may need to be reviewed again"*).

### 4.8 Venue Catalogue

**[Customer-confirmed]** Maintain location, capacity, facilities, accessibility, supported layouts, operating information, and availability-related characteristics. Venue Staff can use catalogue information to identify suitable spaces.

> **Week 7 effect (Change #1).** Each venue's record **adds a configurable setup time and turnaround time** (see §9.1). These are venue-level catalogue attributes, not event attributes.

> **CL3 detail (Change #1 ownership and values).** **Venue Staff** maintain each venue's configurable setup/turnaround defaults; there is **no per-event override** (G8!C4). Values are **non-negative**, configured independently per venue, and may differ venue to venue; 0 is allowed and **no maximum is specified by the customer** (G8!C28). Setup/turnaround applies to **venue only** — equipment availability is driven by the equipment catalogue and inventory, not by the venue's setup/turnaround window (G8!C29).
>
> **[Unresolved lock-point tension — retain both, do not pick]** CL3 gives two different freeze moments for the same property: G8!C4 says the values *"once set" can't be updated/adjusted*, while G8!C6 says they *"can't be changed once venue is confirmed"*. Neither row grants a window in which the values are freely mutable; the only open question is the precise freeze moment. No row reconciles the two; the lock-point ambiguity is flagged, not resolved.
>
> **[Customer gap — C6 subparts unanswered]** G8!B6 asked three things that C6 never addresses: (a) who is notified when a setup/turnaround change creates a conflict (Venue Staff, Coordinator, or both); (b) who resolves the conflict; (c) whether the affected event reverts to Planning or keeps its status with a warning flag. No fallback is invented.

### 4.9 Venue Availability Calendar

**[Customer-confirmed]** Show bookings, tentative holds, and maintenance/unavailable periods. Turnaround may be zero.

> **[Superseded in place — Change #3]** The earlier simplification "one venue may be treated as one event" (single booking per event) is **no longer live**: a single event may now have **multiple venue bookings**, each checked independently for suitability, availability and conflicts (G8!C23; W7-CUST Change #3; see §5.3, §9.3). It is recorded here as superseded, not only in the §10 register.

> **Week 7 effects.** This area is touched by Changes #1, #2 and #4:
>
> - **Change #1 — buffers.** What the calendar shows as "occupied" is the **effective occupancy** (start − setup, end + turnaround), not the raw advertised start/end (§9.1).
> - **Change #2 — venue becomes unavailable after booking.** Venue Staff may mark a venue temporarily unavailable (maintenance, equipment failure, renovation, safety concerns, or other operational reasons); this shows on the calendar and must surface future bookings already held at that venue (§9.2).
> - **Change #4 — holds expire.** Tentative carries now carry a mandatory expiry date/time; an expired hold frees the venue and never counts as a confirmed booking (§9.4).
>
> **Week 7 effect (buffers).** Change #1 abolishes only the old ability to *ignore* venue buffering: per-venue setup/turnaround must now always be applied when checking availability and conflicts. It does **not** forbid a configured zero — a venue set to setup = 0 and turnaround = 0 remains valid (§9.1). What is superseded is "buffers need not constrain availability" (§10).
>
> **[Customer-confirmed — CL3 overlap rule]** The venue is occupied from the start of setup through the end of turnaround; a later booking's setup may begin exactly when the earlier booking's turnaround ends, but the intervals must not overlap. Availability and conflict checks run on these effective intervals, not the advertised event times (G8!C5).

### 4.10 Venue Search and Filtering

**[Customer-confirmed]** Event Coordinators search/filter by relevant date/time, capacity, location, accessibility, layout, and facilities.

**[Team decision pending]** If no exact match exists, either return no results or show partial matches with clear suitability warnings.

### 4.11 Venue Suitability Checking

**[Customer-confirmed]** Evaluate attendance versus capacity, date/time availability, layout, accessibility, and required facilities. Capacity overflow is blocking. Numeric accessibility scoring is not required; tags/booleans are acceptable.

**[Unresolved]** Missing-facility block versus warning behaviour is not fully specified.

> **Week 7 effect (Change #3).** With multiple bookings per event (§5.3), each venue arrangement is checked **independently** for suitability, availability and conflicts while remaining associated with the same event.

### 4.12 Venue Booking Request

**[Customer-confirmed]** Event Coordinators request suitable venues during Planning. Tentative holds prevent another event holding the same venue/time.

> **Week 7 effects.**
>
> - **Change #3:** a single event may have **more than one** venue booking (main auditorium + breakout rooms), each checked independently.
> - **Change #4:** a hold must carry an expiry date/time (§9.4).
> - **Change #2:** if a booked venue later becomes unavailable, the event is preserved and the Coordinator searches/requests a **replacement** venue (§9.2).

> **CL3 detail (Change #2 flow).**
>
> - **Notifications on unavailability:** tell the Event Organiser their venue arrangement is affected and the next action (G8!C7). **Do not notify attendees about an unresolved internal booking issue**; notify them only once a replacement or other material change is confirmed and attendee-facing details change (G8!C7). The Organiser sees each venue separately, including its status and any unavailability affecting their plans, with the next action (G8!C53).
> - **No auto cancel/reject.** When no replacement is immediately available the system must not cancel or reject the event; the Coordinator works with the Organiser on alternatives, and only as a last resort may the Event Coordinator cancel the event (G8!C8). **[Customer gap]** no deadline for finding a replacement is given.
> - **Restoring the original venue.** If the original venue becomes free again before a replacement is confirmed, the booking may be restored **iff** the venue is free for the full effective interval and Venue Staff confirm the restoration (G8!C9).
> - **Replacement approval.** A replacement venue is a change request that goes through the full new-venue request and approval flow (G8!C30); when a booked venue becomes unavailable the Coordinator reviews it and decides the next action, the event goes to Planning, and the new venue request runs the entire approval process (G8!C52).

### 4.13 Venue Booking Approval

**[Customer-confirmed]** Venue Staff approve, reject, or suggest alternatives; no partial approval. Rejection keeps/returns the event to Planning. There is no fixed SLA.

### 4.14 Booking Conflict Detection

**[Customer-confirmed]** Any overlap, even one second, is incompatible and blocked. There is no override. Simultaneous conflicts are first-come, first-served.

> **Week 7 effect (Change #1).** Overlap is measured on the **effective occupancy interval** (advertised start − setup, advertised end + turnaround). "Any overlap, even one second" therefore applies to these expanded intervals.

### 4.15 Equipment Request Management

**[Customer-confirmed]** Organisers record preliminary equipment needs. Coordinators and Technical Support Staff review/refine them. Technical staff approve or reject according to requested staff/equipment availability.

### 4.16 Equipment Availability Checking

**[Customer-confirmed]** Check requested type/quantity for the event time. Equipment modelling by quantity/type versus individual asset ID is a team choice.

### 4.17 Equipment Reservation

**[Customer-confirmed]** Fulfilment is all-or-nothing. Conflicts or breakdowns are flagged for manual resolution; automatic substitutes are not required. Transit/setup buffers may be zero.

> **Week 7 note.** Change #1 is a **venue** buffering rule. Equipment transit/setup/teardown buffers remain "may be zero" (unchanged from CL1); do not conflate venue occupancy buffering with equipment buffering.

### 4.18 Attendee Registration

**[Customer-confirmed]** The Organiser configures whether/when registration is open. A person must register to attend, though attendee-facing information may remain visible without registration. Capacity is capped at the event/venue maximum. Waiting-list priority is first-come, first-served; the next person is invited to apply rather than automatically registered.

**[Team decision pending]** Registration form fields, QR/link/form mechanism, withdrawal rules, waitlist acceptance window, and detailed consent flow.

### 4.19 Event Change Requests

**[Customer-confirmed]** Significant changes — date/time, duration, attendance, venue/layout, or equipment — trigger re-review. If essential changes cannot be met, return for modification or reject. Post-confirmation changes do not automatically unbook existing arrangements.

> **Week 7 effect (Change #3).** "Post-confirmation changes do not automatically unbook existing arrangements" is consistent with the per-arrangement isolation rule (§5.3): cancelling/changing **one** venue arrangement does not auto-remove the others.

### 4.20 Notification System

**[Customer-confirmed]** Notify affected users about material changes, cancellations, availability failures, waiting-list opportunities, and relevant actions.

**[Team decision pending]** Select channels, delivery preferences, acknowledgement, and optional mentions. Offline communication may be manually recorded as event comments.

**[Implemented, pending ratification — SPM-63/SPM-47, 3 Oct 2026 — historical record]** A minimal in-app channel for cancellation only: each notification is a document in the top-level `notifications` collection, one per recipient, written in the same transaction; each user reads their own via `GET /api/notifications` and marks read with `POST /api/notifications/:id/read`. No email, SMS, delivery preference or unread badge.

> **Week 7 / CL3 effects.** New notifiable events are now enumerated by CL3: assignment (new Coordinator + Organiser) and reassignment (new + previous Coordinator + Organiser) (G8!C43, C14); hold expiry (Coordinator informed, G8!C11); venue-becomes-unavailable (Organiser informed with next action; attendees silent until a replacement/material change is confirmed, G8!C7); Lead deactivation handover (G8!C22). "Notify other Leads" applies only when they own the queue/scope and is explicitly optional (G8!C43). Channels/preferences remain a team decision.

---

## 5. Cancellation, Reservation Release, and Arrangement Isolation

**[Customer-confirmed]** Rejection applies when requirements cannot be met before confirmation. Cancellation applies to an approved/confirmed event. An Organiser may request cancellation and the Coordinator may approve or reject it. CL2 also permits Coordinator-initiated cancellation for a stated reason. No fixed time boundary exists.

**[Customer-confirmed — baseline, retained]** Cancellation of **the whole event** releases committed venue/equipment reservations and notifies registered Attendees. This baseline stands unless a Week 7 change explicitly supersedes it.

**[Implemented — SPM-9/SPM-63/SPM-47, Oct 2026 — historical record]** The assigned Coordinator cancels a Confirmed event directly with a required reason; the Organiser's cancellation request requires a reason and may be approved, refused (with reason), or returned (with message). Cancelled, Completed and Rejected events list under "Closed events".

**[Team decision — SPM-47, historical record]** While a cancellation request is open — whether **pending** or **returned** — the Organiser cannot start another cancellation request, the assigned Coordinator cannot cancel the event directly, and the event stays **Confirmed**. Only a **pending** request can be approved; a returned request must be resubmitted before it can be approved (it may be refused in the meantime).

**[Team decision pending — SPM-63/SPM-47]** Time boundary at the event's start date/time; a returned request can be refused but not approved until resubmitted.

**[Known gaps — historical record]** Reservations are not yet released (no booking/reservation records exist to release); registered Attendees are not yet notified (registration does not exist); notified staff are the assigned staff only.

### 5.3 Per-arrangement isolation (Week 7, Change #3)

**[Customer-confirmed — W7-CUST Change #3]** *"Changes or cancellation of one venue arrangement should not automatically remove the other venue bookings unless this is explicitly required."* (W7-CUST, p. 1, Change #3)

**Effective rule.** The new isolation rule is **scoped to a single venue arrangement**:

- Cancelling, changing, or releasing **one** venue arrangement (of several for the same event) **must not** automatically cancel or delete the event's **other** venue bookings, and must not by itself cancel the whole event.
- This is a **per-arrangement** isolation; it does **not** weaken the whole-event cancellation release baseline above. When the **entire event** is cancelled (§5), all its arrangements and reservations are released and Attendees notified, as before.
- **[Derived acceptance rule]** Whole-event cancellation remains a single, separate decision; the per-arrangement rule never silently upgrades one arrangement's cancellation into a whole-event cancellation, and never downgrades a whole-event cancellation into leaving other arrangements booked.

**CL3 detail (Change #3 multi-venue rules).**

- **Per-venue timing.** Each venue booking may have its own date/time window within the event's overall schedule, with suitability, availability, setup and turnaround checked independently per venue and its interval (G8!C23).
- **Confirmation gate.** Every required venue must be approved before the event can be Confirmed; if one venue is rejected the event stays in Planning while the Coordinator arranges a replacement or revises the plan, and the approved venues remain associated (not auto-removed) (G8!C24). Event-level readiness is an aggregate: it cannot be Confirmed or prepared until **every** required venue and technical arrangement is ready and safety is approved (G8!C50).
- **Attendance/capacity.** Allocations must account for the expected attendees who use the venues, and no venue may exceed its capacity (G8!C25). **[Customer gap]** the per-venue-vs-event-total checking unit is not crisply resolved.
- **Primary venue.** The Coordinator may designate one venue as the primary attendee-facing location while listing the others as part of the same event; Attendees see the primary location and the Organiser sees all venues (G8!C26). This is **not** narrowed to "primary only" — the other venues remain listed on the event.
- **Cascade trigger.** Cancelling one venue arrangement does not cancel the others; the other bookings are removed **only when the whole event is cancelled** (G8!C27).
- **Per-venue sign-off/prep.** Each venue booking carries its own approval, availability state, and venue-preparation progress tracked per venue (G8!C50).

---

## 6. Non-Functional Requirements

- **[Customer-confirmed]** Desktop- and mobile-friendly UI.
- **[Customer-confirmed]** Clear status, arrangements, and outstanding actions for appropriate users.
- **[Customer-confirmed]** Common operations complete in a reasonable time; no numeric target exists.
- **[Customer-confirmed]** Consistent information across events, bookings, equipment, and registration.
- **[Customer-confirmed]** Support anticipated three-year growth; no numeric sizing target exists.
- **[Customer-confirmed]** Important actions are auditable.
- **[Customer-confirmed]** Future functionality and rules should be addable without rebuilding the system.
- **[Course-required]** Tests must be traceable to stories/acceptance criteria and cover appropriate normal, boundary, conflict, and failure scenarios.
- **[Course-required]** Maintain modular code and a working CI pipeline where used.

---

## 7. Explicitly Out of Scope or Not Required

- System Administrator role
- financial transactions, pricing, invoices, and cancellation fees
- predictive machine learning or external surveys
- detailed Technical Support schedules, specialisation, and workload planning
- automatic venue/equipment replacement
- staff override of booking conflicts or mandatory readiness/safety approvals
- transport/setup/turnaround calculations *(note: per-venue setup/turnaround as occupancy attributes are now required by Change #1; only **derived transport/turnaround optimisation** remains out of scope)*
- fixed workflow SLAs unless adopted as a team decision
- Google SSO unless explicitly restored by the team
- draft deletion in Sprint 1
- ADRs as a current documentation requirement
- Jira

---

## 8. Decisions Still Required

Before implementing affected functionality, resolve and record:

1. ~~Approved versus Confirmed state model.~~ **Resolved — team decision, 1 Oct 2026: Approved = Confirmed; no separate Approved status** (§4.6). Not an open decision; only the safety-gate status vocabulary remains open (item 15 below).
2. Official Sprint 1 start date: 13 or 14 September 2026. *(open team choice)*
3. ~~Same-organisation Organiser visibility.~~ Resolved — team decision, 3 Oct 2026 (§2.2).
4. Exact multi-role storage and permission evaluation model. *(open team choice)*
5. ~~Coordinator assignment algorithm.~~ The SPM-8 algorithm itself was PO-confirmed 20 Sep 2026; **its on-submit auto-trigger (and the empty-pool = server error rule) is superseded by Change #5** (§4.5, §10). Open sub-question: whether the Lead reuses the algorithm on manual assignment.
6. Missing venue-facility block/warning policy. *(open)*
7. Venue partial-match behaviour. *(open)*
8. Notification channels and preferences. *(open)*
9. Whether to retain the six-character password minimum as a team security choice. *(open)*
10. SPM-42 split for five role surfaces in Sprint 1. This is a **historical Sprint 1 scope question**, not a cap on the now-seven total roles (§2.1); it does not limit the two new internal roles' permission surfaces.
11. **Known gap: how staff are assigned to an event. Pending PO decision.** Nothing in the application sets `assignedStaffUids`; only the seed does. Likely belongs to booking/equipment stories (SPM-14/SPM-17/SPM-56).
12. **SPM-48, pending PO confirmation (not ratified):** whether staff edit only their preparation/reservation sections, or also the Organiser's requested venue/equipment sections.

### 8.1 Week 7 / Session 3 open decisions

Resolved by CL3 unless noted; genuine customer gaps are flagged, not filled.

13. ~~**Role provisioning.**~~ **Bounded by CL3:** Lead is not the account admin; external users self-register; internal accounts use existing internal setup/defaults (G8!C18–C21). **Remaining customer gap:** the concrete actor that creates/changes/deactivates internal accounts is not named; the equipment-vs-IT-team distinction (G8!B20) was never answered.
14. ~~**Safety Officer allocation.**~~ **Resolved:** routed via a safety-review queue or assigned to an authorised Safety Officer; reviewer recorded per check (G8!C49).
15. **Safety-gate status vocabulary/placement — stage order resolved, implementation label open.** CL3 confirms safety approval is required before Confirmed and Preparation is a separate gated stage (G8!C2, C3); whether these become discrete status rows, metadata, or a derived precondition is a **team implementation choice**. Approved=Confirmed remains settled (item 1).
16. ~~**Reassignment authority.**~~ **Resolved:** only the Lead reassigns; the assigned Coordinator may only request (G8!C12, C35, C39).
17. ~~**Lead supervision scope.**~~ **Resolved:** a Lead sees the unassigned queue plus the active events that Lead themselves previously assigned; ≥1 Lead supported, per-Lead scope recorded, no hard-coded single Lead (G8!C33, C41).
18. ~~**Notification recipients.**~~ **Resolved:** new assignment → new Coordinator + Organiser; reassignment → new + previous Coordinator + Organiser; Lead action recorded; "notify other Leads" optional per queue/scope (G8!C43).
19. ~~**Disposition of already-assigned events.**~~ **Resolved:** keep existing assignments; Week 7 changes only newly submitted requests; Lead may reassign existing events when needed and notifies (G8!C38).
20. **Numerical defaults / policy (not invented):** setup/turnaround values are non-negative per venue (0 allowed; no maximum specified by customer — G8!C28); the hold **default length and extension policy** and the **expiry-warning lead time** are explicitly delegated to the team (G8!C31, C32); the duration/end-state of a "temporarily unavailable" venue flag and whether new bookings are blocked the moment it is raised remain customer gaps; the setup/turnaround **lock-point tension** (r4 "once set" vs r6 "once venue confirmed") and the three unanswered C6 sub-parts (conflict notifier / resolver / event-status) are retained unresolved.
21. ~~**Multi-venue cascade.**~~ **Resolved:** cancelling one arrangement does not cascade; other bookings are removed only on whole-event cancellation (G8!C27). Open detail: per-venue-vs-event-total attendance checking unit (G8!B25).

---

## 9. Week 7 Release 1 Changes — Full Mandates, Traceability, and Testable Boundaries

All six are **mandatory** (W7-CUST, p. 1, framing). None is a course/process obligation; the Guide (§12) governs only how the team logs, estimates, and tests them.

### 9.1 Change 1 — Venue Setup and Turnaround Time

**Exact mandate (W7-CUST, p. 1, Change #1):**

- *"Each venue must therefore have a configurable setup time and turnaround time, and these periods must be included when checking availability and detecting booking conflicts."*
- Worked example: *"an event scheduled from 10:00am to 12:00pm with 30 minutes of setup and 45 minutes of turnaround effectively occupies the venue from 9:30am to 12:45pm."*
- *"Existing bookings that become problematic under the new rule should be identified rather than silently removed."*
- Rationale: Venue Staff *"need time before each event to prepare the room and additional time afterwards to reset the venue for its next use."*

**Mapped areas / existing story IDs (no new IDs invented):** Area 8 (Venue Catalogue — the configurable attributes), Area 9 (Availability Calendar), Area 11 (Suitability), Area 14 (Conflict Detection). Builds on expected SPM-54 (approved booking); coexists with SPM-9 sign-offs and SPM-48 preparation.

**Effective rules:**

- **[Customer-confirmed]** Setup time and turnaround time are **per-venue configurable** catalogue attributes, applied on both sides of every booking.
- **[Derived acceptance rule]** Effective occupancy = [advertised start − setup, advertised end + turnaround]. Availability checks and conflict detection compare these **expanded** intervals, not raw advertised start/end.
- **[Derived acceptance rule — bounds]** The buffered mechanism must exist and be **always applied**; a venue configured with setup = 0 and turnaround = 0 is still valid. This revision asserts **no positive minimum** setup/turnaround duration.
- **[Derived acceptance rule — multi-venue closure]** Because Change #3 allows several bookings per event, the buffer applies **to each** venue arrangement's own occupancy; conflicts are detected per arrangement on its own expanded interval.
- **[Customer-confirmed]** Existing bookings that become problematic (e.g. back-to-back same-venue bookings that previously "fit" but now overlap once buffers are added) are **identified/flagged**, not silently deleted. Their disposition (flag, rebook, or notify) is **[Unresolved]** — see §8.1.

### 9.2 Change 2 — Venue Becomes Unavailable After Booking

**Exact mandate (W7-CUST, p. 1, Change #2):**

- *"ConnectSphere needs Venue Staff to be able to mark a venue temporarily unavailable because of maintenance, equipment failure, renovation, safety concerns, or other operational reasons. This may occur even when future events have already been booked at the venue."*
- *"the existing event itself should not automatically be cancelled. Instead, affected bookings should be identified and the relevant Event Coordinators informed that alternative arrangements are required."*
- *"The system should preserve the original event information while allowing the coordinator to search for and request a replacement venue."*

**Mapped areas / existing story IDs:** Area 9 (Availability Calendar — the unavailability period), Area 12 (Booking Request — replacement path), Area 13 (Booking Approval).

**Effective rules:**

- **[Customer-confirmed]** A venue may be flagged temporarily unavailable at the venue level, independently of any single booking, even with future events already booked.
- **[Customer-confirmed]** Flagging does **not** auto-cancel the event(s). The event record and its original information are **preserved**.
- **[Customer-confirmed]** All future bookings hitting that venue are identified and **their Event Coordinators informed** that alternative arrangements are required; the Coordinator gets a search-and-request-**replacement** path.
- **[Resolved by CL3 on recipients]** the affected Event Coordinators are informed (W7-CUST), and CL3 (G8!C7) adds: notify the **Event Organiser** that the venue arrangement is affected with the next action; **do not notify attendees while the issue is unresolved** — notify them only once a replacement or other material change is confirmed and attendee-facing details change. The Organiser also sees each venue's status and any unavailability (G8!C53). **[Genuinely open]** only the duration/end-state of a "temporarily" unavailable flag and whether new bookings are blocked the moment it is raised remain unanswered. See §8.1.

### 9.3 Change 3 — Multiple Venues for One Event

**Exact mandate (W7-CUST, p. 1, Change #3):**

- *"The system must therefore allow a single event to have more than one venue booking."* (Example: one auditorium for the main programme and three smaller breakout rooms.)
- *"Each venue should be checked independently for suitability, availability, and conflicts, while still remaining associated with the same event."*
- *"Changes or cancellation of one venue arrangement should not automatically remove the other venue bookings unless this is explicitly required."*

**Mapped areas / existing story IDs:** Area 12 (Booking Request), Area 13 (Approval), Area 14 (Conflict Detection), Area 11 (Suitability).

**Effective rules:**

- **[Customer-confirmed]** Event : venue arrangements is 1:many; all arrangements stay associated with the same event.
- **[Customer-confirmed]** Each arrangement is checked independently for suitability, availability and conflicts.
- **[Derived acceptance rule]** Each arrangement inherits Change #1's expanded occupancy for its own availability/conflict check.
- **[Customer-confirmed]** Isolation of arrangements — see §5.3.
- **[Resolved by CL3]** Each arrangement carries its own date/time window and its own suitability/availability/setup/turnaround check (G8!C23); the cascade trigger is whole-event cancellation only — cancelling one arrangement does not remove the others (G8!C27; §5.3). Remaining open detail: the per-venue-vs-event-total attendance checking unit (G8!B25).

### 9.4 Change 4 — Tentative Venue Holds Expire

**Exact mandate (W7-CUST, p. 2, Change #4):**

- *"Each hold must therefore have an expiry date/time. If the required action is not completed before the deadline, the hold should expire and the venue should become available for other requests."*
- *"The Event Coordinator should be informed before or when the hold expires, and an expired hold should not be treated as a confirmed booking."*

**Mapped areas / existing story IDs:** Area 9 (Availability Calendar — shows holds), Area 12 (Booking Request — tentative holds).

**Effective rules:**

- **[Customer-confirmed]** A hold carries a **mandatory expiry date/time** field.
- **[Customer-confirmed]** If the required action is not completed by the deadline, the hold expires: the venue becomes available for other requests.
- **[Customer-confirmed]** The Event Coordinator is informed before or when the hold expires; an expired hold is **not** treated as a confirmed booking and must not block conflicts.
- **[Derived acceptance rule]** Expiry releases **only its own hold** on its own interval; it must **never** override or evict a booking/block on the same slot that was confirmed after the hold was placed, and must not clear another arrangement.
- **[Customer-confirmed — CL3] Required action to confirm a hold.** The Coordinator confirms the hold venue and informs Venue Staff, who then approve it (G8!C10). On expiry the event sits in Planning until both venue and equipment are confirmed (G8!C11); holds attach to the **venue**, not to equipment (G8!C11).
- **[Customer-confirmed — CL3] Notification.** The Coordinator is informed before or when the hold expires; an expired hold is not a confirmed booking (G8!C11).
- **[Team choice — explicitly delegated by customer, not invented]** the default hold length and any extension actor/limit (G8!C31), and the expiry-warning lead time (G8!C32), are left to the team. **[Customer gap]** whether linked equipment reservations are released on hold expiry is not addressed (G8!B11) — and holds are venue-only, so no equipment release is implied.

### 9.5 Change 5 — Addition of Event Coordinator Lead Role

**Exact mandate (W7-CUST, p. 2, Change #5):**

- *"the Event Coordinator Lead, who is responsible for overseeing incoming event requests and assigning them to individual Event Coordinators."*
- *"Newly submitted event requests should no longer be assigned directly to an Event Coordinator. Instead, they first enter an unassigned queue that can be viewed by the Event Coordinator Lead."*
- *"The Lead can review basic event information, assign a suitable Event Coordinator, and reassign events where necessary."*
- *"Event Coordinators should only be able to manage events assigned to them, while the Event Coordinator Lead should be able to view all coordinator assignments and active events under their supervision."*
- *"Relevant users should be notified when assignments or reassignments occur."*

**Mapped areas / existing story IDs:** Area 5 (Coordinator Assignment), Area 1 (roles/permissions). Reuses SPM-8 (selection algorithm, now Lead-invoked), SPM-26 (reassignment mechanism/permission), SPM-46 ("Not yet assigned" display), SPM-65 (ordinary-Coordinator scoping — preserved).

**Effective rules:**

- **[Customer-confirmed]** New submissions land **unassigned** in a Lead-viewable queue; direct auto-assignment at submit is superseded (§10).
- **[Customer-confirmed]** Working the unassigned queue, the Lead reviews basic event information, assigns a suitable Event Coordinator, and reassigns events where necessary.
- **[Customer-confirmed]** Ordinary Coordinators manage **only** their assigned events (SPM-65 unchanged).
- **[Customer-confirmed]** The Lead views the unassigned queue **plus the active events that that Lead themselves previously assigned** (G8!C41); the system supports ≥1 Lead with recorded per-Lead supervisory scope, no hard-coded single Lead (G8!C33).
- **[Customer-confirmed]** Assignment/reassignment notifications: new assignment → new Coordinator + Organiser; reassignment → new + previous Coordinator + Organiser; the Lead's action is recorded (G8!C43, C14).
- **[Resolved by CL3]** Reassignment is Lead-only (Coordinators may only request, G8!C12/C35/C39); the Lead does not act as a Coordinator (G8!C13); existing assignments are kept (G8!C38); returned-and-resubmitted requests keep their Coordinator (G8!C15).
- **[Customer gap]** whether the system may still *suggest* a Coordinator by workload (auto-assignment is banned, G8!C37, but a read-only suggestion mode is neither confirmed nor banned).

### 9.6 Change 6 — Operational Feasibility (Safety) Check

**Exact mandate (W7-CUST, p. 2, Change #6):** see §4.6.1.

**Mapped areas / existing story IDs:** Area 6 (Status Management — the gate), Area 7 / SPM-48 (preparation precondition), SPM-10 (significant-change loop), SPM-9 (arrangement confirmation).

**Effective rules:** see §4.6.1. Key boundary: **[Derived acceptance rule]** rejecting the *safety arrangement* does **not** silently reject the event. Response is always assumed (no timeout). No status name, allocation, or provisioning is decided.

### 9.7 Week 7 traceability matrix

| # | Change | Primary area(s) | Reused existing story/record | Nature |
|---|---|---|---|---|
| 1 | Setup/turnaround buffers | 8, 9, 11, 14 | SPM-54 (expected), SPM-9 sign-offs | New capability; ends the old ability to ignore buffers (a configured value of 0 remains allowed). |
| 2 | Venue becomes unavailable | 9, 12, 13 | CL1 "if a confirmed venue becomes unavailable, staff resolve replacements manually" | New capability; preserves event |
| 3 | Multiple venues per event | 11, 12, 13, 14 | SPM-54/SPM-56/SPM-62 (expected) | New 1:many booking model |
| 4 | Holds expire | 9, 12 | CL1/CL2 tentative-hold rules | New mandatory expiry field |
| 5 | Event Coordinator Lead + unassigned queue | 1, 5 | SPM-8 (algorithm), SPM-26 (reassign), SPM-46 ("Not yet assigned"), SPM-65 (Coordinator scope) | New role; **supersedes auto-assign-on-submit** |
| 6 | Safety Officer gate | 6, 7 | SPM-9 (arrangements), SPM-48 (preparation), SPM-10 (change loop) | New mandatory gate before preparation |

> No new SPM story IDs, workbook statuses, estimates, or Sprint assignments are created in this document. Per the Guide (§12), each net-new capability maps to a new PBI; numbering, estimates, and status are assigned in the team's workbook.

---

## 10. Superseded Legacy Register

Compact record of older statements this revision supersedes. They are retained here for traceability and are **no longer live mandates**.

| Legacy statement (prior checkpoint) | Where | Superseding rule |
|---|---|---|
| Auto-assign a Coordinator at submission (SPM-8, fewest-active-events at submit transaction), including "empty pool = server error, request stays a Draft". | §4.5 / prior §5 | **Change #5:** new submissions enter the Lead's unassigned queue; the algorithm becomes the Lead's selection tool, not an automatic submit step. No Coordinator at submit is now the **normal** unassigned state, not an error. |
| "Setup and turnaround time need not constrain availability." | CL1 §5; prior §9 | **Change #1:** per-venue setup/turnaround are configurable and **must** be applied to every availability/conflict check. A venue **configured** with setup = 0 / turnaround = 0 remains valid; the override abolishes only the ability to ignore buffering, and sets no positive minimum (derived recommendation). |
| "No fixed hold-expiry duration is required" / "the team may choose one." | CL1 §5; CL2 §6 | **Change #4:** a hold **must** carry an expiry date/time; on expiry the venue frees and the hold is not a confirmed booking. |
| Reassignment authority held solely by the assigned Coordinator (SPM-26, after offline agreement). | §4.5 SPM-26 | **Change #5 + CL3:** only the Lead performs a reassignment; the assigned Coordinator may only *request* it (G8!C12, C35, C39). The old self-initiated handoff is superseded. |
| "One venue may be treated as one event for simplicity" (single booking per event). | CL1 §5; prior §9 | **Change #3:** an event may have multiple venue arrangements, each checked independently. |
| Preparation availability conditioned only on SPM-48 sign-off. | §4.7 SPM-48 | **Change #6:** preparation additionally requires Safety Officer approval and the event entering the separate Preparation stage (G8!C3, C45). |
| SPM-10 automatically clears both venue/technical sign-offs on any significant change (8 Oct 2026 team rule). | §4.7 SPM-10 | **CL3 G8!C51:** there is **no automatic reset** of any venue/equipment sign-off on a change; the Coordinator reviews and decides. The lifecycle re-entry to planning/reviewing (G8!C16) remains, but the sign-off wipe is removed. |
| A safety "request changes" automatically re-evaluates venue/technical arrangements (implied SPM-10 clear). | §4.6.1 | **CL3 G8!C46:** the event stays in Planning with **no auto assignment or reset**; the Coordinator makes the changes and drives re-review. |

> Chronological source records (`customer-briefing.md`, `clarification-session-1.md`, `clarification-session-2.md`) are **not** edited to hide these older answers; per repo guidance §8 they keep what was known at the time. The register above is the record of the later supersession.

---

## 11. Quality, Baseline Claims, and Verification Posture

- All "Implemented — SPM-…" notes above are **historical records** of the prior checkpoint, re-stated for continuity. They are not re-verified in this revision and must not be read as new completion claims.
- This candidate adds **no** claim that downstream workflows exist merely because an upstream story hands work to them (`AGENTS.md` §4).
- The venue-booking/hold domain's current implementation depth is **not** asserted here; the requirements above state the **target behaviour**, and the team's implementation audit (separate from this requirements candidate) determines what exists today.

---

## 12. Change-Management Process Notes (Week 7 Guide) — Process Only

The Week 7 Guide ("IS212 (AY 2026/27, T1) – Managing Changes – A Guide") governs **how the team logs, estimates, designs, and tests** these changes; it is **not** a product runtime requirement.

**Six-step workflow (W7-GUIDE, p. 1):**

1. **Change Request / Change Description** — what/why; new requirement vs clarification vs correction.
2. **Product Backlog** — add a new PBI if new; reprioritise incomplete items; update clarified items.
3. **Acceptance Criteria** — define/update AC; check existing AC still valid; verify all original AC remain satisfied.
4. **Analyze Changes – Story Points** — estimate new stories; re-estimate an existing item **only** if new information materially changes size/complexity/effort/uncertainty; estimate remaining work for incomplete items.
5. **Software Design Documentation** — C4 architecture, class diagram, sequence diagram, data model, API/interface specs (if applicable).
6. **Test Cases** — unit, functional, integration, E2E, regression.

**How to record each change (W7-GUIDE, pp. 2–3):**

- **Scenario 1** (an original AC was missed): reopen the story and return it to an incomplete state; estimate remaining work. *"this is not a new requirement."*
- **Scenario 2** (genuinely new requirement): keep the original story as Done and create a new User Story.
- **Scenario 3** (new requirement **and** an original AC is wrong/buggy): do both — create the new story **and** reopen the original to correct the faulty AC, then re-verify against the Definition of Done.

**Applied to the six changes (process guidance, not a decision outcome):** most of Changes #1–6 are net-new capabilities → likely **new PBIs (Scenario 2)**; any pre-existing booking mis-flagged by Change #1 would be a **Scenario 1** reopen; any corrected original AC surfaced while implementing them would be **Scenario 3**. This candidate records no votes, approvals, meeting outcomes, or estimates — those belong to the team's Sprint records.

---

## 13. Clarification Session 3 — Change Log and Coverage Index

**Source.** "Session 3 - Clarification Answers_G8.xlsx", single visible sheet `G8`, 52 Q&A rows (rows 2–53; column B = question, column C = answer, no C-header). Citations below are `G8!C<row>`. Session 3 is the latest customer statement on the rows it covers; unrelated baseline (Week 1 briefing, Week 4 instructions, Sessions 1–2, the Week 7 changes) stands where Session 3 is silent. Two cells are truncated in place: `G8!C21` ends mid-sentence at "The" and `G8!C34` at "condition".

### 13.1 Concise change log (what this integration did)

1. **Provenance (§0.4, §0.1):** added the `CL3` source row and noted Session 3 is later than Sessions 1–2 and elaborates the Week 7 changes.
2. **Roles/provisioning (§2.1):** recorded that the Lead is *not* the account admin; external self-register; internal accounts via existing defaults; deactivation handover (G8!C22); Safety Officer visibility/queue routing (G8!C49). The concrete internal-account creator remains a flagged customer gap.
3. **Coordinator Assignment (§4.5, §9.5):** resolved reassignment authority as **Lead-only** (Coordinators may only request), Lead does not act as a Coordinator, Lead supervision = unassigned queue + own assigned events, ≥1 Lead no hard-coded account, returned-resubmission keeps its Coordinator, existing assignments kept, pre-assignment display "Unassigned"→name.
4. **Lifecycle & safety gate (§4.6, §4.6.1):** confirmed customer stage order — safety approval **before** Confirmed; **Preparation a separate gated stage**; safety rejection targets the venue's suitability (not the event); "request changes" keeps the event in Planning with **no auto reset**; structured checklist with Organiser-visible outcome/comments. Stage order confirmed; exact implementation label left as a team choice.
5. **Significant changes (§4.7 SPM-10, §10):** changed the team's auto-sign-off-clear rule — **no automatic reset** of venue/technical sign-offs on a change (G8!C51); lifecycle re-entry to planning/reviewing (G8!C16) retained as a distinct, Coordinator-gated mechanism.
6. **Venue buffers (§4.8, §4.9, §4.14):** Venue Staff own non-negative per-venue defaults, no per-event override, 0 allowed, no maximum specified by customer, venue-only (equipment from catalog/inventory); effective-interval non-overlap rule. **Retained the r4 "once set" vs r6 "once venue confirmed" lock-point tension and left the three unanswered C6 sub-parts open.**
7. **Venue-unavailable flow (§4.12, §4.20):** notify Organiser (not attendees until a replacement/material change is confirmed); no auto cancel; Coordinator cancels only as last resort; original-venue restoration on full-interval availability; replacement = full approval; event returns to Planning; Organiser sees per-venue status.
8. **Holds (§9.4):** required action = Coordinator confirms + Venue Staff approves; expired hold frees venue and is not a booking; default length, extension policy, and warning lead time delegated to the team.
9. **Multi-venue (§5.3):** per-venue time windows; all required venues approved before confirm; per-venue capacity ceiling; Coordinator-designated primary attendee-facing venue (other venues still listed); cascade only on whole-event cancellation; per-venue sign-off/prep with aggregate event readiness.
10. **Open decisions (§8.1):** moved every resolved item out of the open list; distinguished genuine customer gaps (unnamed internal-account actor, per-venue-vs-total attendance unit, unavailable-flag duration/blocking, conflict notifier/resolver/status, replacement deadline, linked-equipment release) from explicit team choices (hold default/extension, warning lead time, channels, implementation label).

### 13.2 Full coverage index — all 52 rows

| Row | Topic | Citation | Integrated at |
|---|---|---|---|
| 2 | End-to-end lifecycle order; safety before Confirmed; Preparation separate; Returned/Rejected/Cancelled distinct | G8!C2 | §4.6, §4.6.1 |
| 3 | Confirmed is after safety approval; Preparation is a separate gated stage | G8!C3 | §4.6, §4.6.1 |
| 4 | Venue Staff own setup/turnaround defaults; "once set" immutable; no per-event override | G8!C4 | §4.8 |
| 5 | Occupancy setup→turnaround; next booking's setup starts at prior turnaround end; no overlap; checks on effective intervals | G8!C5 | §4.9, §4.14 |
| 6 | Times immutable "once venue confirmed"; conflict-notifier/resolver/event-status sub-parts unanswered | G8!C6 | §4.8 (flagged) |
| 7 | Notify Organiser of affected venue + next action; not attendees until replacement/material change confirmed | G8!C7 | §4.12, §4.20 |
| 8 | No auto cancel/reject; Coordinator works with Organiser; last-resort Coordinator cancel; no replacement deadline | G8!C8 | §4.12 |
| 9 | Restore original venue iff free for full effective interval + Venue Staff confirm | G8!C9 | §4.12 |
| 10 | Hold→confirmed: Coordinator confirms hold venue + informs Venue Staff, who approve | G8!C10 | §9.4 |
| 11 | Expired hold ≠ confirmed; Coordinator informed; event in Planning until venue+equipment confirmed; holds venue-only | G8!C11 | §9.4, §4.20 |
| 12 | Lead manual assignment replaces auto for new; Coordinators may only request; workload-suggestion subpart open | G8!C12 | §4.5, §9.5 |
| 13 | Lead reviews/assigns/reassigns; does not act as a Coordinator | G8!C13 | §4.5, §9.5 |
| 14 | Event-linked records follow the event; notify Organiser + previous + new Coordinator | G8!C14 | §4.5, §4.20 |
| 15 | Returned resubmission stays with current Coordinator; Lead may reassign if needed | G8!C15 | §4.5 |
| 16 | Change to a confirmed event → Coordinator review → standard lifecycle, status to planning/reviewing | G8!C16 | §4.7 (SPM-10) |
| 17 | Structured safety checklist; one outcome; Organiser sees outcome + actionable comments, not private notes | G8!C17 | §4.6.1 |
| 18 | No new SysAdmin; external self-signup; internal via existing defaults; Lead not account admin | G8!C18 | §2.1 |
| 19 | Lead does not create/administer internal users | G8!C19 | §2.1 |
| 20 | Lead does not create accounts; internal-account actor unnamed | G8!C20 | §2.1 |
| 21 | External users self-register; Lead does not add external users (cell truncated at "The") | G8!C21 | §2.1 |
| 22 | Before deactivation, Lead reassigns all active events | G8!C22 | §2.1 |
| 23 | Each venue booking its own time window; per-venue suitability/availability/setup/turnaround checked independently | G8!C23 | §5.3 |
| 24 | Every required venue approved before confirm; one rejection → stay Planning; approved venues retained | G8!C24 | §5.3 |
| 25 | Allocations cover attendees; no venue over capacity; per-venue-vs-total unit open | G8!C25 | §5.3 |
| 26 | Coordinator designates primary attendee-facing venue; Attendees see primary; Organiser sees all | G8!C26 | §5.3 |
| 27 | Cancelling one arrangement does not cascade; others removed only on whole-event cancellation | G8!C27 | §5.3 |
| 28 | Setup/turnaround non-negative, per venue, independently configured, may differ; 0 allowed; no maximum specified by customer | G8!C28 | §4.8 |
| 29 | Setup/turnaround venue-only; equipment availability from catalog/inventory | G8!C29 | §4.8, §4.17 |
| 30 | Replacement venue = change request through full new-venue approval | G8!C30 | §4.12 |
| 31 | Expiry required; no default length/extension limit; team decides hold period | G8!C31 | §9.4 |
| 32 | Coordinator informed around expiry; warning lead-time delegated to team | G8!C32 | §9.4 |
| 33 | ≥1 Lead; per-Lead supervisory scope recorded; ≥1 covers common queue; no hard-coded single Lead | G8!C33 | §4.5, §9.5 |
| 34 | Equipment location = catalog/inventory reference; does not reserve/block a venue; availability by quantity+condition (cell truncated) | G8!C34 | §4.16 |
| 35 | Only the Lead performs reassignment | G8!C35 | §4.5 |
| 36 | Lead double-role question → refers to row 13 | G8!C36 | §4.5 (via C13) |
| 37 | No auto-assignment | G8!C37 | §4.5, §9.5 |
| 38 | Keep existing assignments; Week 7 only new requests; Lead may reassign existing + notify | G8!C38 | §4.5 |
| 39 | Only Lead changes assignment; Coordinator may request, not hand over | G8!C39 | §4.5 |
| 40 | Lead-as-Coordinator / self-assign question → refers to row 13 | G8!C40 | §4.5 (via C13) |
| 41 | Lead sees unassigned queue + the active events that Lead themselves previously assigned | G8!C41 | §4.5 |
| 42 | Pre-assignment display "Unassigned" → Coordinator name | G8!C42 | §4.5 (SPM-46) |
| 43 | New assignment → new Coordinator + Organiser; reassignment → new+previous Coordinator + Organiser; record Lead action; other Leads optional per queue | G8!C43 | §4.5, §4.20 |
| 44 | Safety-check placement → refers to row 2 | G8!C44 | §4.6 (via C2) |
| 45 | Venue/Technical preparation updates unlock only after safety approval and entering Preparation | G8!C45 | §4.6.1, §4.7 (SPM-48) |
| 46 | Safety "request changes" → event stays Planning; no auto assign/reset; Coordinator makes changes | G8!C46 | §4.6.1 |
| 47 | Safety rejection rejects the venue's suitability, not the event; stay Planning with visible issue; re-review; whole-event reject/cancel only via normal process | G8!C47 | §4.6.1 |
| 48 | Post-approval attendance/layout change → refers to row 16 | G8!C48 | §4.7 (via C16) |
| 49 | Safety Officer sees review-needed details + relevant history; routed via queue/assigned officer; reviewer recorded; no unrestricted access | G8!C49 | §2.1, §4.6.1 |
| 50 | Per-venue approval/availability/prep tracking; event-level readiness = aggregate (all required venues + tech + safety) | G8!C50 | §5.3 |
| 51 | No automatic reset of any venue/equipment on a change; Coordinator decides next action | G8!C51 | §4.7 (SPM-10), §10 |
| 52 | Coordinator reviews unavailability and decides; new venue request full approval; event goes to Planning | G8!C52 | §4.12 |
| 53 | Organiser sees each venue separately, its status, unavailability impact, and next action | G8!C53 | §4.12 |

> **Preserved by this integration:** all 20 core functionality areas (listed in §1; areas 1–3 detailed in §3, areas 4–20 in §4), the six Week 7 changes (§9.1–§9.6), and every unaffected team decision (Excel-not-Jira, email/password, SPM-65 Coordinator scoping, Approved=Confirmed, SPM-9 transitions, SPM-48 preparation sections pending PO, SPM-47 cancellation flow, SPM-63 in-app notifications, etc.). No new SPM IDs, estimates, statuses, or Sprint assignments are created; no date or current-implementation fact is asserted without a source.

---

[End of candidate.]
