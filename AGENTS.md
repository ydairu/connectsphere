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
  | `/api/requests` | `GET /` scoped list; `GET /:id`; `PATCH /:id` role-based section edit | SPM-42 | `backend/src/routes/requestRoutes.js`, `backend/src/middleware/authorise.js`, `backend/src/services/eventRequestStore.js` |

- **[Team decision] Which route set to use, by the request's status.** Proposed by Shaun and confirmed with the SPM-7/SPM-4 owner on 20 September 2026.
  - **A draft** is created and edited through `/api/event-requests` (SPM-7, SPM-4). It validates field values with `shared/eventRequest.js`, and its own owner-and-draft check matches what `shared/permissions.js` permits at that status. The UI sends drafts to `/event-requests/:id/edit`.
  - **Everything after submission** is read and edited through `/api/requests` (SPM-42), which is the only route set that evaluates every role, record scope and status gate. The UI sends non-drafts to `/requests/:id`.
  - Neither route set is being removed, and no third one may be added.
  - **Known gap:** `/api/requests` does not validate field values, so a post-submission edit is authorised but unvalidated. Closing it means reusing `normaliseEventRequestInput` for the sections in the patch; it is not scheduled yet.
- **Take read and edit authorisation from `shared/permissions.js`**, as `backend/src/middleware/authorise.js` does.
  - Use `canEdit`, `forbiddenFields` and `projectRequest`.
  - Never decide an edit by combining `inScope()` with `stateGateOpen()`. Permissions are evaluated per role and then combined. Combining the two any-role predicates lets one role's open status gate unlock another role's sections.
  - Pass every response body a non-owner can receive through `projectRequest()`, so sections a role may not view are absent, not hidden.
  - If you extend the SPM-42 store, give `backend/src/testing/memoryEventRequestStore.js` the same method, because the two stores share one contract.
- **Ownership comes from the server.** On create, `ownerUid`, `organisationId` and `organisationName` are set from `req.user` (`buildDraftEventRequest` in `shared/eventRequest.js`). Never take them from the request body.
- **Requests are stored by section.** Section data lives under `core`, `venue`, `equipment`, `registration` or `internal`, and a field's section is its top-level key. A field stored outside a section cannot be permission-checked. Record metadata stays at the top level: `status`, `ownerUid`, `organisationId`, `organisationName` and `assignedStaffUids`. Field names within each section are defined by `normaliseEventRequestInput` in `shared/eventRequest.js`.
- **Statuses come from `shared/status.js`,** never string literals. Draft queries test `status === DRAFT` only, because the name of the submitted status is not yet ratified.
- **Status changes are not section edits.** `PATCH /api/requests/:id` rejects `status` with 403. Submit (SPM-3) needs its own route. `shared/permissions.js` has no status-transition predicate yet, so agree one with the SPM-42 owner (Shaun) rather than writing the check inside a route.
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
