# ConnectSphere Project Context

Last reviewed: 19 September 2026 (organisation profile increment)

## Project Purpose

ConnectSphere Event Services needs a custom Event Planning and Venue Booking System that centralises event information currently spread across email, spreadsheets, calendars, messaging applications, forms, and documents. The Week 12 first release must implement the 20 core functionality areas identified in the Week 4 Project Instructions as coherent end-to-end workflows.

Detailed requirements and their provenance are maintained in [`docs/requirements/`](docs/requirements/).

## Authoritative Sources

Use the following priority when sources differ:

1. Latest explicit team decision for a team-controlled choice
2. Clarification Session 2
3. Clarification Session 1
4. Week 4 Project Instructions and Week 1 Customer Briefing
5. Current Product Backlog and Sprint records
6. Engineering recommendation

Repository documentation derived from the authoritative project materials:

- [`docs/requirements/customer-briefing.md`](docs/requirements/customer-briefing.md) — Week 1 Customer Briefing record
- [`docs/requirements/clarification-session-1.md`](docs/requirements/clarification-session-1.md) — first customer clarification record
- [`docs/requirements/clarification-session-2.md`](docs/requirements/clarification-session-2.md) — second customer clarification record
- [`docs/requirements/effective-requirements.md`](docs/requirements/effective-requirements.md) — reconciled current requirements

Operational project records maintained by the team:

- Product Backlog workbook — current stories, acceptance criteria, estimates, statuses, Sprint assignments, and notes
- Sprint 1 Planning record — Sprint Goal, ownership, estimates, capacity reasoning, and planning decisions

These operational records should be added to a suitable repository evidence folder once the team chooses their committed filenames. Clarification Session 2 was supplied directly by the team; its portable repository record is preserved above.

The Product Backlog workbook is the operational source of record. Jira is not used. Stories are grouped by Functionality Area rather than Epic.

## Current Technology Foundation

The repository currently uses:

- React 19, Vite 7, React Router 7, and custom CSS
- Node.js and Express 5
- Firebase Authentication with email/password
- Cloud Firestore
- Firebase Admin SDK for backend token verification

Tracked application routes currently include:

- `/`
- `/login`
- `/register`
- protected `/profile`

The root package is an npm workspace over `frontend`, `backend` and `shared`; it provides development, build, lint, and test commands (`test`, `test:existing`, `test:spm1`, `test:spm2`, `test:unit`, `test:integration`, `test:e2e`, `test:coverage`). The frontend package keeps its own build, lint and Vitest commands. A GitHub Actions workflow (`.github/workflows/ci.yml`) runs lint, all test suites, the production build and the Playwright E2E suites on every push and on pull requests into `main`.

## Independently Observed Implementation State

The current code provides a useful authentication prototype, but it does **not** yet match the complete customer/backlog role model.

Observed facts:

- Registration uses Firebase email/password authentication.
- The registration UI offers `attendee` and `organiser` account types; public registration does not offer internal staff roles.
- Organiser registration requires an organisation name. Organisers, including multi-role accounts, can view/add/edit that name on their profile through an authenticated backend update.
- Registration writes `roles: [role]` and retains the legacy `role` field. Frontend role checks and backend `requireRole` support multiple roles.
- Organisation name edits change only the user's descriptive `organisationName`; matching names do not link accounts. Existing organisation IDs and event records are preserved. Company-ID assignment and shared organisation membership remain outside this increment.
- The protected frontend product routes include `/profile`, `/event-requests/new`, and `/event-requests/:id/edit`.
- The backend exposes authenticated profile and event-request create/update/load routes.
- SPM-7 event request creation has an implemented draft-based create path.
- SPM-4 draft saving and same-draft editing has been implemented for owned unsubmitted drafts through the direct edit route; the full SPM-24 draft list/page remains a separate Sprint 1 scope item.
- SPM-3 submission and downstream staff review remain separate Sprint 1 scope items.

Required correction before claiming full Sprint 1 completion:

- public registration must be limited to Event Organiser and Attendee;
- Event Organiser registration now collects organisation name; company-ID assignment/membership remains incomplete;
- internal staff accounts must not be created through public registration;
- the five customer roles must replace the generic `employee` model;
- multiple roles per user and the union of their permissions must be supported if SPM-42 remains unchanged;
- record-, ownership-, and field/section-level authorisation must be enforced and tested;
- event request submission and draft listing/resume navigation must still be completed for SPM-3 and SPM-24.

README statements about completed authentication behaviour should therefore be treated as prototype claims until they are reconciled with the current backlog and verified through tests.

## Sprint 1

### Goal

> Deliver the first usable end-to-end workflow that enables users to securely register and access ConnectSphere according to their roles, while allowing Event Organisers to create, save, resume, and submit event requests for review.

### Stakeholder Value

- Users receive secure access to appropriate features and information.
- Event Organisers can prepare requests without losing incomplete work and submit structured information for later planning.

### Planning Facts

- Planning meeting: 12 September 2026, 22:00–23:30, Zoom
- Scrum Master/facilitator: Lesley
- Product Owner: Isabelle
- Developers: Dairu, Shaun, Jian Yong
- Forecast: 18 story points
- Reference story: SPM-2, Register for an Account, fixed at 3 points
- No historical velocity is available because this is the first Sprint.
- The team made a conservative forecast because of setup and CI overhead, other coursework, limited availability, and four of five team members having full-time internships.

### Selected Stories

| Story | Title | Owner | Points |
|---|---|---:|---:|
| SPM-1 | Sign In and Access Only My Role's Area | Dairu | 3 |
| SPM-2 | Register for an Account | Dairu | 3 |
| SPM-3 | Submit an Event Request | Jian Yong | 2 |
| SPM-4 | Save an Event Request as a Draft | Jian Yong | 1 |
| SPM-7 | Create an Event Request | Jian Yong | 2 |
| SPM-24 | View My Saved Draft Requests and Distinguish Them from Submitted Requests | Shaun | 2 |
| SPM-42 | View and Edit Information According to My Role's Permissions | Shaun | 5 |

Developer totals: Dairu 6, Jian Yong 5, Shaun 7.

## Current Team Decisions

- Use email/password authentication for the current backlog scope.
- Use a dedicated Drafts page rather than a combined list.
- Keep SPM-22, SPM-23, and SPM-43 as historical rows with `Removed — Overlap` status.
- Keep SPM-44, draft deletion, as Deferred/KIV and outside Sprint 1.
- Do not use Jira.
- Do not create ADRs at this stage.
- Do not copy all course materials into this repository; retain concise, actionable requirement and evidence records.

## Requirement Highlights

- Customer roles: Event Organiser, Event Coordinator, Venue Staff, Technical Support Staff, and Attendee.
- Event Organisers and Attendees self-register; internal staff accounts are system-defined or pre-provisioned.
- There is no System Administrator role.
- A user may hold multiple roles; permissions combine.
- The customer did not specify password rules or require Google SSO.
- Event requests have one event date and normally one Event Organiser owner.
- Mandatory submission information is title, purpose, expected attendance, duration, preferred date/time, and primary venue/layout requirements.
- Drafts may be incomplete, remain private to their creator, have no expiry, and do not start staff review.

See [`docs/requirements/effective-requirements.md`](docs/requirements/effective-requirements.md) for the reconciled rules across all 20 functionality areas.

## Known Inconsistencies and Open Items

1. **Sprint dates:** the planning document records 13–27 September 2026; an earlier discussion used 14–27 September 2026. Confirm the official start date before publishing Sprint evidence.
2. **Story ownership:** the planning document's Team Roles table swaps Shaun's and Jian Yong's story groups, while its detailed table and the team's latest explicit allocation support the ownership shown above. Correct the Team Roles table.
3. **SPM-2 points:** the workbook's Story Points cell appears formula-based/blank when extracted, while its notes and Sprint Planning identify it as the 3-point reference story. Make the workbook display 3 consistently.
4. **Approved versus Confirmed:** customer sources sometimes treat these as the same and elsewhere describe Approved as initial feasibility and Confirmed as completed venue/technical arrangements. Resolve the lifecycle before implementing status transitions.
5. **Same-organisation visibility:** Organisers must not see unrelated client data, but visibility across different Organisers in the same organisation remains a team design choice.
6. **Password policy:** no customer rule exists. The current frontend enforces six characters; record this as a team decision if retained.
7. **Role model:** roles arrays and shared permission checks exist, but complete five-role workflows and organisation membership still require verification before SPM-42 can be Done.
8. **Testing and CI:** automated shared/backend and frontend tests exist; no CI workflow is currently present. On 19 Sep, `npm test` passed 68 Node tests and 17 Vitest tests; frontend lint and production build passed (build reports a bundle-size warning). Organisation persistence/authentication checks use mocks or in-memory storage, including real Express HTTP routing with mocked Firebase. No live Firebase, emulator, deployed security-rule, or manual browser verification was performed for this increment. Firestore rules and the operational workbook/Sprint record remain absent from the repository.
9. **SPM-1/SPM-2 test suites and CI (24 Sep 2026):** `tests/` holds story-organised suites for SPM-1 and SPM-2 (Vitest + React Testing Library + Supertest, Playwright for E2E), plus a GitHub Actions workflow. On 24 Sep: existing suites 107 Node + 41 Vitest passed; `tests/` Vitest 238 passed (SPM-1 133, SPM-2 101, lint 4); Playwright 18 passed (SPM-1 13, SPM-2 5) in Chromium; ESLint over the whole repository and the production build passed. Firebase is replaced by in-memory fakes (unit/integration) and an in-memory double (E2E); `firestore.rules` is checked only as source text. This is not live Firebase, emulator, deployed-rule or production-database verification — executing the rules still needs the Firestore emulator (Java), which is not set up.
10. **SPM-8 automatic coordinator assignment (30 Sep 2026, branch `SPM-8`):** submitting a draft now assigns the eligible Event Coordinator with the fewest active assigned events (random tie-break, submitter excluded) in the same Firestore transaction as the status change, stores it in `assignedCoordinatorUid`, and records a "System" entry in `eventRequests/{id}/activity`. An empty coordinator pool aborts the submission with a 500 and leaves the draft unchanged. SPM-8 is not in the Sprint 1 selection above. Gaps: no resubmit (Returned → Submitted) action exists, so keeping the existing Coordinator on resubmission is tested only at the assignment-service level; the activity history is written but not yet displayed; the assignment rule awaits ratification (effective-requirements.md §5). On 30 Sep: existing suites 134 Node + 41 Vitest passed, `tests/` Vitest 238 passed, Playwright 18 passed, ESLint and the production build passed. Assignment tests run against an in-memory Firestore fake, so transaction serialisation under real concurrency has not been verified on the emulator or the deployed project.

## Documentation Boundaries

- [`AGENTS.md`](AGENTS.md) governs repository work.
- Source records preserve chronology and must not be silently rewritten to match later decisions.
- `effective-requirements.md` is the current reconciled interpretation.
- The backlog and Sprint records control operational status and estimates.
- [`docs/evidence/presentation-evidence.md`](docs/evidence/presentation-evidence.md) tracks verified work, evidence locations, gaps, and candidate Week 11 slide content against the course rubric.
