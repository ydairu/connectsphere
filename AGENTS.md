# ConnectSphere Repository Guidance

This file defines the working rules for human developers and coding agents in this repository.

## 1. Read Before Implementing

Before changing product behaviour, read:

1. [`project_context.md`](project_context.md)
2. [`docs/requirements/effective-requirements.md`](docs/requirements/effective-requirements.md)
3. The relevant chronological source record:
   - [`docs/requirements/customer-briefing.md`](docs/requirements/customer-briefing.md)
   - [`docs/requirements/clarification-session-1.md`](docs/requirements/clarification-session-1.md)
   - [`docs/requirements/clarification-session-2.md`](docs/requirements/clarification-session-2.md)
4. The current Product Backlog workbook and Sprint record identified in `project_context.md`, when available in the checkout
5. The affected code, tests, configuration, and README sections

Do not implement from a story title alone. Confirm the user story, acceptance criteria, customer clarification, current Sprint scope, and actual repository state.

## 2. Source Priority

When sources differ, use this order:

1. Latest explicit team decision for a team-controlled choice
2. Later customer clarification
3. Earlier customer clarification
4. Week 4 Project Instructions and original Customer Briefing
5. Current Product Backlog and Sprint records
6. Engineering recommendation

A later customer clarification or customer change overrides an earlier statement on the same customer-controlled matter. The later Week 7 changes and Session 3 material are distilled in `docs/requirements/effective-requirements.md`; their original source files are not present in this checkout. A team decision may fill an area deliberately left open by the customer, but it must not override a confirmed customer requirement.

If a conflict cannot be resolved using this order, record it as unresolved and do not silently choose a rule.

## 3. Evidence Discipline

Keep these categories distinct:

- **Customer-confirmed requirement:** directly supported by the briefing or clarification sessions.
- **Course requirement:** required by the Week 4 Project Instructions or assessed rubric.
- **Team decision:** an implementation or UX choice made where the customer allowed discretion.
- **Engineering recommendation:** proposed good practice that has not been approved as scope.
- **Unresolved ambiguity:** conflicting or incomplete source information.
- **Deferred/KIV:** retained for later consideration but not committed to the current Sprint.

Never convert a recommendation, common practice, generated suggestion, simulated meeting, or historical draft into a customer requirement.

Do not invent roles, fields, permissions, states, transitions, security promises, deadlines, service levels, or evidence.

## 4. Active Project Rules

- The Product Backlog workbook is the operational source of record for stories, acceptance criteria, estimates, status, Sprint assignment, and notes.
- Stories are grouped by **Functionality Area**, not by Epic.
- The team is not using Jira. Do not refer to Jira as the active backlog system.
- Architecture Decision Records are not required at this stage.
- Do not copy the complete course-material archive into the repository. Distil only actionable requirements, assessed constraints, and evidence needed by the project.
- Do not mark work Done when any acceptance criterion is unimplemented, untested, or unsupported by the current product flow.
- Do not claim that downstream workflows exist merely because an upstream story hands work to them.

## 5. Scope and Traceability

For each implemented story:

1. Identify its acceptance criteria.
2. Map each criterion to code and one or more appropriate tests.
3. Cover successful, validation, authorisation, and important failure paths.
4. Preserve unrelated behaviour and files.
5. Update the operational backlog/Sprint record only with actual status.
6. Update `project_context.md` and presentation evidence only after implementation and verification.

A story is Done only when its acceptance criteria and the team's Definition of Done are satisfied. Report incomplete criteria or blockers instead of weakening the story or marking it complete.

## 6. Authentication and Authorisation Guardrails

**Implementation boundary (29 October 2026):** The role constants and routes below implement the original five roles plus the two Week 7 internal roles: Safety Officer (SPM-66) and Event Coordinator Lead (SPM-68, the unassigned queue and first assignment only). The Lead is notified of each new request that enters the queue (SPM-85). Lead-only reassignment, the Lead's view of the events they assigned, and assignment notifications are not implemented; do not infer them from this guidance. The SPM-88 local Preparation status and edit condition exist; the production safety verifier fails closed pending SPM-91/92. See `project_context.md` and `docs/requirements/effective-requirements.md` before extending these workflows.

The seven roles currently implemented in the repository are:

- Event Organiser
- Event Coordinator
- Venue Staff
- Technical Support Staff
- Attendee
- Safety Officer (Week 7 Change #6; implemented by SPM-66 as `safety_officer`)
- Event Coordinator Lead (Week 7 Change #5; implemented by SPM-68 as `coordinator_lead`)

A user may hold multiple roles; effective access is the union of assigned roles. Enforce access in the backend/data layer as well as the UI. Hiding a control is not sufficient authorisation.

External Event Organisers and Attendees self-register. Internal staff accounts are managed or defined through system defaults; do not expose public staff self-registration unless the team explicitly records a justified change.

The customer did not prescribe password length, complexity, expiry, history, lockout, SSO, or a specific authentication technology. Any such rule is a team decision and must be labelled accordingly.

### Event request data access

`firestore.rules` is deployed to the Firebase project (15 September 2026). It blocks the browser from the `eventRequests` collection entirely, for every role. This applies to SPM-3, SPM-4, SPM-7, SPM-24 and SPM-42 alike.

- **Never use the Firebase client SDK on `eventRequests` from the frontend.** `getDoc`, `getDocs`, `addDoc`, `setDoc`, `updateDoc` and `onSnapshot` all fail with "Missing or insufficient permissions". Do not copy the pattern `AuthContext.jsx` uses for `users/{uid}`.
- **Every event request operation goes through the Express API.** The frontend calls it with `authenticatedRequest` in `frontend/src/services/api.js`. The backend uses the Admin SDK, which bypasses the rules. Two route sets currently exist:

  | Prefix | Routes | Story | Files |
  |---|---|---|---|
  | `/api/event-requests` | `POST /` creates a draft; `PATCH /:id` updates the owner's own draft; `GET /:id/assignment/candidates` and `POST /:id/assignment` the Lead assigns a Coordinator (SPM-68, `backend/src/services/coordinatorLeadAssignmentService.js`) | SPM-7 | `backend/src/routes/eventRequestRoutes.js`, `backend/src/services/eventRequestService.js`, validation in `shared/eventRequest.js` |
  | `/api/requests` | `GET /` scoped list; `GET /:id`; `PATCH /:id` role-based section edit (preparation values validated, SPM-48); `GET /:id/history` field change history (SPM-28, read-only); `GET`/`POST /:id/venue-bookings` venue booking requests (SPM-14, `backend/src/services/venueBookingService.js`); `GET`/`POST /:id/equipment-requests` equipment requests (SPM-17, `backend/src/services/equipmentRequestService.js`); `GET /:id/equipment-requests/:requestId/availability` availability check, read-only (SPM-18, `backend/src/services/equipmentAvailabilityService.js`); `POST /:id/equipment-requests/:requestId/actions` approve, re-confirm or reject an equipment request (SPM-56, SPM-36); `POST /:id/safety-review` the Safety Officer's review and `GET /:id/safety-review/venues` the booked venues' safety details (SPM-92, SPM-66, `backend/src/services/safetyReviewService.js`); `POST /:id/registrations` an Attendee registers, `GET /:id/registrations` the registered list for the owning Organiser and assigned Coordinator (SPM-19, `backend/src/services/registrationService.js`). `GET /api/registrations` (SPM-19) is the signed-in Attendee's own registrations. `GET /unassigned` the Event Coordinator Lead's queue (SPM-68), registered before `/:id` | SPM-42 | `backend/src/routes/requestRoutes.js`, `backend/src/middleware/authorise.js`, `backend/src/services/eventRequestStore.js` |

- **[Team decision] Which route set to use, by the request's status.** Proposed by Shaun and confirmed with the SPM-7/SPM-4 owner on 20 September 2026.
  - **A draft** is created and edited through `/api/event-requests` (SPM-7, SPM-4). It validates field values with `shared/eventRequest.js`, and its own owner-and-draft check matches what `shared/permissions.js` permits at that status. The UI sends drafts to `/event-requests/:id/edit`.
  - **Everything after submission** is read and edited through `/api/requests` (SPM-42), which is the only route set that evaluates every role, record scope and status gate. The UI sends non-drafts to `/requests/:id`.
  - Neither route set is being removed, and no third one may be added.
  - **Known gap:** `/api/requests` does not validate field values, so a post-submission edit is authorised but unvalidated. Closing it means reusing `normaliseEventRequestInput` for the sections in the patch; it is not scheduled yet. The exceptions are the SPM-48 preparation sections (`backend/src/middleware/validatePreparation.js`) and the SPM-10 significant fields (`backend/src/middleware/validateSignificantFields.js`), validated after authorisation (400, nothing written).
- **Take read and edit authorisation from `shared/permissions.js`**, as `backend/src/middleware/authorise.js` does.
  - Use `canEdit`, `forbiddenFields` and `projectRequest`.
  - Never decide an edit by combining `inScope()` with `stateGateOpen()`. Permissions are evaluated per role and then combined. Combining the two any-role predicates lets one role's open status gate unlock another role's sections.
  - Pass every response body a non-owner can receive through `projectRequest()`, so sections a role may not view are absent, not hidden.
  - A Coordinator's scope is the events assigned to them (SPM-65 team decision, 1 Oct 2026). Coordinator action routes (SPM-5, SPM-25, SPM-45, SPM-26) check it with `isAssignedCoordinator()` or `inScope()`, never with a role check alone, and refuse an unassigned Coordinator with 404 as `authorise.js` does.
  - If you extend the SPM-42 store, give `backend/src/testing/memoryEventRequestStore.js` and `tests/shared/firebase-double/fakeFirestoreEventRequestStore.js` (the E2E double's) the same method, because all three stores share one contract.
- **Ownership comes from the server.** On create, `ownerUid`, `organisationId` and `organisationName` are set from `req.user` (`buildDraftEventRequest` in `shared/eventRequest.js`). Never take them from the request body.
- **Requests are stored by section.** Section data lives under `core`, `venue`, `equipment`, `registration`, `internal`, `venuePreparation` or `equipmentPreparation` (SPM-48), and a field's section is its top-level key. A field stored outside a section cannot be permission-checked. Record metadata stays at the top level: `status`, `ownerUid`, `organisationId`, `organisationName`, `assignedStaffUids` and `assignedCoordinatorUid` (SPM-8). Field names within each section are defined by `normaliseEventRequestInput` in `shared/eventRequest.js`.
- **Statuses come from `shared/status.js`,** never string literals. Draft queries test `status === DRAFT` only, because the name of the submitted status is not yet ratified.
- **Coordinator assignment is done by the Event Coordinator Lead (SPM-68), not on submit.**
  - **Submit:** `submitDraftEventRequest` no longer assigns anyone. A first submission is Submitted with `assignedCoordinatorUid: null` and a `submittedAt` time; a resubmitted Returned request keeps its Coordinator because submit never writes the field. "Unassigned" is derived (`awaitingCoordinatorAssignment` in `shared/coordinatorAssignment.js`), not a status.
  - **Where the rules live:** who may assign, which requests are in the queue and whom the Lead may choose are decided only by `shared/coordinatorLeadAssignment.js` (it reuses SPM-26's target checks and adds "not the Lead themselves").
  - **Assigning:** `assignCoordinator` in `backend/src/services/coordinatorLeadAssignmentService.js` re-reads the request in the transaction (409 unless still submitted and unassigned), reads and writes `systemLocks/coordinatorAssignment`, writes `assignedCoordinatorUid`, `assignedByUid` and `assignedAt` (top-level metadata) and a `coordinator_assigned` activity entry with the Lead as actor. Entries before SPM-68 carry "System".
  - **Reuse:** `loadCoordinators` (a wrapper of `loadUsersWithRole`) and `loadActiveCounts` in `backend/src/services/coordinatorAssignmentService.js` serve the Lead's picker and SPM-26. Any new path that sets `assignedCoordinatorUid` must take the same lock. SPM-8's `selectCoordinator` is kept but not called.
  - **New-request notice (SPM-85):** a first submission that leaves the request awaiting assignment notifies every Event Coordinator Lead (`newUnassignedRequestNotifications` in `shared/notifications.js`), in the submit transaction. `submitDraftEventRequest` reads the Leads (`loadUsersWithRole(db, COORDINATOR_LEAD, ...)`) before any write; a resubmission reads and notifies no one. The Notifications page links the notice to `/requests/unassigned`. Any new path that puts a request into the unassigned queue must notify the Leads the same way.
  - **Not implemented:** assignment and reassignment notifications (G8!C43), Lead-only reassignment (SPM-26 still lets the assigned Coordinator reassign) and the Lead's view of events they assigned.
- **Section access by role** (`SECTION_ACCESS` in `shared/permissions.js`; change it there, never in a route). Scope and status gates apply on top: assigned events only for Coordinators and staff, and the per-role status gate. Finished events are read-only for every role.

  | Role | Views | Edits |
  |---|---|---|
  | Event Organiser | `core`, `venue`, `equipment`, `registration` | the same, own request at Draft or Returned only; `registration` alone on their own Confirmed or Preparation event (SPM-19) |
  | Event Coordinator | every section | `core`, `venue`, `equipment`, `registration`, `internal`. Views both preparation sections read-only |
  | Venue Staff | `core`, `venue`, `venuePreparation` | `venuePreparation` only (SPM-48) |
  | Technical Support Staff | `core`, `equipment`, `equipmentPreparation` | `equipmentPreparation` only (SPM-48) |
  | Attendee | `core` | nothing |
  | Safety Officer | `core`, `venue`, `equipment`, only for events in the safety-review queue (SPM-66) | nothing |
  | Event Coordinator Lead | `core` plus `organisationName`, only for submitted requests with no Coordinator (SPM-68) | nothing; never passes `isAssignedCoordinator` and has no `availableActions` |

  - **SPM-48 behaviour change:** staff no longer edit `venue` or `equipment`. This is a team decision of 7 Oct 2026, pending PO confirmation, with an open question in effective-requirements.md §7.
  - **Preparation is internal:** Organisers and Attendees never receive either preparation section or its history.
  - **Preparation is shown from Planning onwards.**
- **SPM-88 local preparation condition (story not Done).**
  - **Rule:** a preparation section is editable only when the event is in Preparation. Starting that status requires the recorded safety approval (`safetyApproved()` in `shared/safetyReviewState.js`, SPM-91/92).
  - **Where it lives:** `canUpdateVenuePreparation` / `canUpdateEquipmentPreparation` in `shared/preparation.js`, applied through `SECTION_CONDITIONS` in `editableSectionsFor`.
  - **Do not:** restate the condition anywhere else, in a route or in the UI. The page gets the reason from the API's `preparation` field.
  - **Dependencies:** SPM-87 must supply the significant-change return to Planning and safety re-review; until then significant edits in Preparation return 409 without a write. SPM-19 must provide registration in Confirmed and Preparation.
  - **Import order:** `shared/preparation.js` must not import `permissions.js`, because `permissions.js` imports it.
- **Safety review (SPM-91, SPM-92, SPM-66).**
  - **Where the rules live:** who may submit, who may review, what a valid review is, what it writes and what each role sees are decided only by `shared/safetyReview.js`. The record reads (`awaitingSafetyReview`, `safetyApproved`, `safetyReviewInvalidation`) are in `shared/safetyReviewState.js`, which imports only `status.js` so that `permissions.js` and `statusTransitions.js` can use it.
  - **Records:** `safetyReview` (the current status) and `safetyReviews` (every recorded review, with reviewer, time, checklist, outcome, comments and internal notes) are top-level record metadata, so no section edit can write them. The lifecycle status stays Planning throughout the review.
  - **Submitting:** the `submit_safety_review` action on `POST /api/event-requests/:id/transitions`, by the assigned Coordinator, at Planning, once every venue booking and the technical arrangement are approved. The same action resubmits.
  - **Reviewing:** `POST /api/requests/:id/safety-review`, by a Safety Officer, on an event in the queue. The event then leaves the queue and the Safety Officer's scope.
  - **Gates:** Confirm and Start Preparation both require `safetyApproved()`. Do not pass approval in through a context value or a verifier.
  - **Invalidation:** every change to the reviewed arrangements withdraws an approval or a pending check, and marks a rejected arrangement as revised, through `safetyReviewInvalidation`: a significant change (`significantChangeEffects`), a venue booking requested (`submitVenueBooking`) or cancelled (`cancelVenueBooking`), an equipment request submitted (`submitEquipmentRequest`), and a technical sign-off rejected (`transitionEventRequest`). Any new path that changes the reviewed arrangements must do the same.
  - **What the Organiser sees:** the outcome and the overall comments only, never internal notes, checklist comments or the reviewer (`safetyReviewSummary`).
- **Equipment reservations (SPM-62, SPM-57).**
  - **Reserving** is the `reserve` action on SPM-56's `POST /api/requests/:id/equipment-requests/:requestId/actions`, by the request's assigned Technical Support Staff member, on an Approved request at Planning or Confirmed.
  - **Records:** one `equipmentReservations` document per reserved type, belonging to the event and never to a venue booking. The event gets `reservedEquipment` (types and quantities only, never unit ids).
  - **Overlap and exclusions:** decided only by `shared/equipmentReservation.js` (`periodsOverlap`, `reservedUnitIds`). Every availability count (SPM-18 check, SPM-56 approval, reserving, `/api/equipment` with a period) loads overlapping reservations through `loadReservedUnitIds` in `backend/src/services/equipmentReservationService.js`; do not count reservations anywhere else.
  - **Locking:** reserving reads and writes `systemLocks/equipmentReservation-{typeId}` for each type, in the same transaction.
  - **Release (SPM-62, SPM-38):** reservations are released only when the whole event is rejected or cancelled (`prepareReservationRelease`, called from `prepareEquipmentRequestClose`, in the status transaction of `reject`, `cancel` and `approve_cancellation`). The record keeps `releasedAt` and `releasedReason` (`event_rejected` / `event_cancelled`, labelled by `RELEASE_REASON_LABELS`). A significant change or a venue booking change never releases them. Any new path to Cancelled or Rejected must release them the same way.
  - **Viewing (SPM-58):** `GET /api/equipment/reservations` (Technical Support Staff only; `?status=active|released`) lists the reservations of events in the member's scope (`canViewReservation`). `GET /api/equipment/:id` gives each unit the reservations that hold it, naming only events the viewer may see. Both are in `backend/src/services/equipmentReservationService.js`.
  - **Concurrency evidence:** `tests/spm-58/integration/equipmentReservation.emulator.test.js` runs simultaneous reservations on a real Firestore emulator in CI (`npm run test:spm58:emulator`, same configuration as SPM-14's). Keep it passing when changing the reserve transaction.
- **Significant changes (SPM-10).** Which fields are significant, how their values are validated and compared, and what a significant change sets off are decided only by `shared/significantChanges.js`.
  - **Effects:** a significant change at Planning or Confirmed clears the recorded venue and technical sign-off. At Confirmed it also moves the event back to Planning, with a `status_changed` entry whose `action` and `reason` are `significant_change`. Assigned Venue and Technical Support Staff are notified in-app. All of this is written in the same transaction as the edit, through `store.update(..., { recordChanges, consequences })`; do not add another write path.
  - **Not an action:** Confirmed → Planning is not an SPM-9 action. Never add it to `TRANSITIONS` or `availableActions`.
  - **Open cancellation request:** a significant change to a Confirmed event with an open cancellation request is refused with 409.
  - **Bookings:** when adding bookings or reservations (SPM-54/56/62), a significant change must not release them.
- **Attendee registration (SPM-19).** Who may register, when registration is open, the capacity limit and who sees the registered list are decided only by `shared/registration.js`; the period and capacity values are normalised by `normaliseRegistrationSettings` in `shared/eventRequest.js`. Registrations live in the top-level `eventRegistrations` collection (document id `{eventId}_{attendeeUid}`), which `firestore.rules` leaves closed to the browser.
  - **Locking:** registering reads and writes `systemLocks/registration-{eventId}` in the same transaction as the registration, so two Attendees cannot take the last place. Any new path that adds a registration must take the same lock.
  - **Attendees never receive the `registration` section** (its notes are the Organiser's). The event response carries `attendeeRegistration` for an Attendee instead, and `canViewRegistrations` for everyone.
  - **Notifying registered Attendees (SPM-41):** a cancellation, an approved cancellation request, a rejection, or a change to `core.preferredDateTime` or `core.durationHours` notifies every active registration (`loadRegisteredAttendeeUids` in `backend/src/services/registeredAttendees.js`, `attendeeChangeNotifications` in `shared/notifications.js`). In a transaction, read the registrations before any write. **Any new path that cancels, rejects or reschedules an event (SPM-20's accepted change requests included) must do the same,** or apply its change through the section-edit save, which already does.
  - **Concurrency evidence:** `tests/spm-19/registration.emulator.test.js` (`npm run test:spm19:emulator`, CI step "Attendee registration transactions").
- **Status changes are not section edits.** `PATCH /api/requests/:id` rejects `status` with 403. Submit (SPM-3) needs its own route. `shared/permissions.js` has no status-transition predicate yet, so agree one with the SPM-42 owner (Shaun) rather than writing the check inside a route.
- **Field change history (SPM-28).** `PATCH /api/requests/:id` records one `field_changed` entry per changed field in `eventRequests/{id}/activity`, in the same transaction as the edit (`store.update(id, patch, { version, recordChanges })`). What is recorded and who may read it is decided only by `shared/changeHistory.js`. Drafts record nothing. Any new path that writes section fields after submission must record history the same way.
- **Status transitions (SPM-9) are decided only by `shared/statusTransitions.js`** (`canTransition`, `availableActions`); venue/technical sign-off by `shared/arrangements.js`; Organiser cancellation requests by `shared/cancellationRequests.js`. `shared/requestActions.js` names and combines them. Clients send an action (and a reason where one is taken), never a target status, to `POST /api/event-requests/:id/transitions`; submit and resubmit also go through `submitDraftEventRequest`. Sign-off (`arrangementApprovals`) and the cancellation request (`cancellationRequest`) are top-level record metadata, so no section edit can write them. **SPM-56:** while an event has a current equipment request (`currentEquipmentRequest`, not Closed), the technical sign-off is set only by deciding that request (`decideEquipmentRequest`), never by `approve_technical` / `reject_technical`; keep `currentEquipmentRequest` in step in any new path that creates, decides or closes an equipment request. SPM-25's return messages (`clarificationRequests`) are stored the same way. Every change writes a `status_changed` entry to `eventRequests/{id}/activity` in the same transaction (`backend/src/services/statusHistory.js`). The route placement, the assigned-Coordinator-only rule and manual completion are team decisions of 1 Oct 2026 (effective-requirements.md §6).
- **`users/{uid}` rules:**
  - The browser may read and update only the signed-in user's own profile.
  - A profile may be created only with the `organiser` or `attendee` role.
  - `roles`, `role`, `organisationId` and `organisationName` cannot be changed after creation.
  - Staff roles are provisioned through Admin SDK scripts (`backend/scripts/`).
- **Editing `firestore.rules` changes nothing until it is deployed** with `firebase deploy --only firestore:rules --project <FIREBASE_PROJECT_ID>`. When reporting, state whether rules were deployed or only edited.

## 7. Verification and Reporting

Run the smallest meaningful checks first, then the relevant full project checks available in the repository. At minimum, consider:

- linting and formatting;
- unit tests;
- integration tests;
- end-to-end tests for critical workflows;
- production build;
- direct manual checks of changed user flows;
- authorisation checks against direct URLs and API requests.

Be exact about the verification environment:

- mocked API tests are not real backend integration;
- in-memory or emulator tests are not production database verification;
- Firebase emulator verification is not verification against a deployed Firebase project;
- a passing frontend build is not evidence that backend security rules are correct.

This repository has two event request API harnesses. They run the same cases in `tests/spm-42/integration/requestApi.cases.js`:

- `npm test` runs `requestApi.test.js`. It sends real HTTP to the real middleware, with mocked token verification and in-memory persistence, so it is not database verification.
- `LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live` runs against the real Firebase project with real sign-ins. It edits seeded requests and restores them; re-run `backend/scripts/seed.js` after an interrupted run.

State what was tested, what was not tested, and any remaining risk.

## 8. Documentation Maintenance

Update documentation narrowly and preserve chronology:

- Source records retain what was known at that point in time.
- Later changes belong in later clarification records and `effective-requirements.md`.
- `project_context.md` records the current state and known gaps, not aspirational completion.
- Presentation evidence records completed activities and evidence locations, not planned work.
- Use repository-relative paths for committed or planned repository artefacts. Never write personal absolute paths, `file://` links, Downloads locations, temporary workspace paths, or expiring attachment URLs into repository documentation.
- If an original course/customer source remains outside the repository, identify it by title and provenance only; do not imply that teammates can open it from the repository.

Do not rewrite an earlier customer statement to make it agree with a later one. Record the later superseding rule separately.

## 9. Sprint 1 Boundaries (historical allocation)

Sprint 1 contains seven selected stories across:

1. User Authorisation and Authentication
2. Event Request Creation
3. Draft Event Requests

Use the relevant Sprint Planning record for ownership and estimates when available. The accepted Sprint 1 allocation is listed in `project_context.md`. Do not expand a story to cover later functionality areas merely because its wording mentions a downstream role or workflow.

In particular, SPM-42 names all five roles and multi-role permissions. It cannot be considered Done if only Event Organiser behaviour exists.
