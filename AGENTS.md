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
4. The current Product Backlog workbook and Sprint record identified in `project_context.md`
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

A later customer clarification overrides an earlier clarification on the same customer-controlled matter. A team decision may fill an area deliberately left open by the customer, but it must not override a confirmed customer requirement.

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

The effective customer role model is:

- Event Organiser
- Event Coordinator
- Venue Staff
- Technical Support Staff
- Attendee

A user may hold multiple roles; effective access is the union of assigned roles. Enforce access in the backend/data layer as well as the UI. Hiding a control is not sufficient authorisation.

External Event Organisers and Attendees self-register. Internal staff accounts are managed or defined through system defaults; do not expose public staff self-registration unless the team explicitly records a justified change.

The customer did not prescribe password length, complexity, expiry, history, lockout, SSO, or a specific authentication technology. Any such rule is a team decision and must be labelled accordingly.

### Event request data access

`firestore.rules` is deployed to the Firebase project (15 September 2026). It blocks the browser from the `eventRequests` collection entirely, for every role. This applies to SPM-3, SPM-4, SPM-7, SPM-24 and SPM-42 alike.

- **Never use the Firebase client SDK on `eventRequests` from the frontend.** `getDoc`, `getDocs`, `addDoc`, `setDoc`, `updateDoc` and `onSnapshot` all fail with "Missing or insufficient permissions". Do not copy the pattern `AuthContext.jsx` uses for `users/{uid}`.
- **Every event request operation goes through the Express API.** The frontend calls it with `authenticatedRequest` in `frontend/src/services/api.js`. The backend uses the Admin SDK, which bypasses the rules. Two route sets currently exist:

  | Prefix | Routes | Story | Files |
  |---|---|---|---|
  | `/api/event-requests` | `POST /` creates a draft; `PATCH /:id` updates the owner's own draft | SPM-7 | `backend/src/routes/eventRequestRoutes.js`, `backend/src/services/eventRequestService.js`, validation in `shared/eventRequest.js` |
  | `/api/requests` | `GET /` scoped list; `GET /:id`; `PATCH /:id` role-based section edit (preparation values validated, SPM-48); `GET /:id/history` field change history (SPM-28, read-only); `GET`/`POST /:id/venue-bookings` venue booking requests (SPM-14, `backend/src/services/venueBookingService.js`); `GET`/`POST /:id/equipment-requests` equipment requests (SPM-17, `backend/src/services/equipmentRequestService.js`); `GET /:id/equipment-requests/:requestId/availability` availability check, read-only (SPM-18, `backend/src/services/equipmentAvailabilityService.js`); `POST /:id/equipment-requests/:requestId/actions` approve, re-confirm or reject an equipment request (SPM-56, SPM-36) | SPM-42 | `backend/src/routes/requestRoutes.js`, `backend/src/middleware/authorise.js`, `backend/src/services/eventRequestStore.js` |

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
- **Coordinator assignment (SPM-8) runs inside the submit transaction.** `submitDraftEventRequest` calls `assignCoordinatorInTransaction` in `backend/src/services/coordinatorAssignmentService.js`; the selection rule is in `shared/coordinatorAssignment.js`. Each assignment reads and writes the lock document `systemLocks/coordinatorAssignment` so overlapping submissions are serialised, and adds an entry to the `eventRequests/{id}/activity` subcollection with "System" as the actor. Reuse these for reassignment (SPM-26) rather than writing a second selection path.
- **Section access by role** (`SECTION_ACCESS` in `shared/permissions.js`; change it there, never in a route). Scope and status gates apply on top: assigned events only for Coordinators and staff, and the per-role status gate. Finished events are read-only for every role.

  | Role | Views | Edits |
  |---|---|---|
  | Event Organiser | `core`, `venue`, `equipment`, `registration` | the same, own request at Draft or Returned only |
  | Event Coordinator | every section | `core`, `venue`, `equipment`, `registration`, `internal`. Views both preparation sections read-only |
  | Venue Staff | `core`, `venue`, `venuePreparation` | `venuePreparation` only (SPM-48) |
  | Technical Support Staff | `core`, `equipment`, `equipmentPreparation` | `equipmentPreparation` only (SPM-48) |
  | Attendee | `core` | nothing |

  - **SPM-48 behaviour change:** staff no longer edit `venue` or `equipment`. This is a team decision of 7 Oct 2026, pending PO confirmation, with an open question in effective-requirements.md §7.
  - **Preparation is internal:** Organisers and Attendees never receive either preparation section or its history.
  - **Preparation is shown from Planning onwards.**
- **[TEMPORARY] SPM-48 preparation condition.**
  - **Rule:** a preparation section is editable only at Planning or Confirmed, with the matching SPM-9 sign-off approved in `arrangementApprovals`.
  - **Where it lives:** `canUpdateVenuePreparation` / `canUpdateEquipmentPreparation` in `shared/preparation.js`, applied through `SECTION_CONDITIONS` in `editableSectionsFor`.
  - **Do not:** restate the condition anywhere else, in a route or in the UI. The page gets the reason from the API's `preparation` field.
  - **Replacing it:** when SPM-54 (approved booking) and SPM-56 / SPM-62 (reserved equipment) exist, replace only these two functions.
  - **Import order:** `shared/preparation.js` must not import `permissions.js` or `arrangements.js`, because both would make a circular import. Read sign-off through `shared/arrangementDecisions.js`.
- **Significant changes (SPM-10).** Which fields are significant, how their values are validated and compared, and what a significant change sets off are decided only by `shared/significantChanges.js`.
  - **Effects:** a significant change at Planning or Confirmed clears the recorded venue and technical sign-off. At Confirmed it also moves the event back to Planning, with a `status_changed` entry whose `action` and `reason` are `significant_change`. Assigned Venue and Technical Support Staff are notified in-app. All of this is written in the same transaction as the edit, through `store.update(..., { recordChanges, consequences })`; do not add another write path.
  - **Not an action:** Confirmed → Planning is not an SPM-9 action. Never add it to `TRANSITIONS` or `availableActions`.
  - **Open cancellation request:** a significant change to a Confirmed event with an open cancellation request is refused with 409.
  - **Bookings:** when adding bookings or reservations (SPM-54/56/62), a significant change must not release them.
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

## 9. Current Sprint Boundaries

Sprint 1 contains seven selected stories across:

1. User Authorisation and Authentication
2. Event Request Creation
3. Draft Event Requests

Use the current Sprint Planning record for ownership and estimates. The accepted allocation is listed in `project_context.md`. Do not expand a story to cover later functionality areas merely because its wording mentions a downstream role or workflow.

In particular, SPM-42 names all five roles and multi-role permissions. It cannot be considered Done if only Event Organiser behaviour exists.
