# ConnectSphere

ConnectSphere is a full-stack event management app built with React, Express and Firebase. It supports account registration, role-based event requests, venue booking and availability, equipment requests and reservations, and in-app notifications. The current lifecycle also includes a Preparation status and staff preparation sections. Entry into Preparation requires a server-verified safety approval; the production verifier currently fails closed while that integration is unfinished. The Express API enforces request permissions; the repository's Firestore rules deny direct browser access to event requests.

The [effective requirements revision candidate](docs/requirements/effective-requirements.md) records later customer changes and is awaiting Product Owner approval as a repository checkpoint. The [architecture index](docs/architecture/README.md) links the implementation diagrams; acceptance evidence is in [docs/evidence](docs/evidence), manual checklists are in [docs/testing](docs/testing), and [venue hold expiry operations](docs/operations/venue-hold-expiry.md) explains the scheduled processor.

## Technology Stack

- **Frontend:** React 19, Vite, React Router, and custom responsive CSS
- **Backend:** Node.js and Express
- **Authentication:** Firebase Authentication with email and password
- **Database:** Firebase Cloud Firestore
- **Server authentication:** Firebase Admin SDK

## Project Structure (selected paths)

```text
connectsphere/
├── frontend/       React pages, components, Firebase client and API client
├── backend/        Express routes, services and operational scripts
├── shared/         Domain rules and validation used on both sides
├── tests/          Story suites, E2E fixtures and Firebase doubles
├── docs/           Architecture, requirements, testing, operations and evidence
├── .github/        CI and venue hold expiry workflows
├── firebase.json   Firestore rules deployment configuration
├── firestore.rules Browser data access rules
└── package.json    npm workspace and root commands
```

## How the App Works

1. A user registers or logs in through Firebase Authentication.
2. The user's Firebase UID identifies their document at `users/{uid}` in Firestore.
3. New registration writes their name, email, roles and creation timestamp to that document. Organiser registration also requires `organisationName`. An `organisationId` may already exist on seeded or migrated accounts; registration does not assign one.
4. `AuthContext` restores Firebase auth state and attempts to load the Firestore profile; protected pages wait for that initial load to finish.
5. The frontend sends a Firebase ID token with authenticated requests to the Express API.
6. The backend verifies the token and reads the user's trusted roles from Firestore.

The current code implements five roles: `organiser`, `coordinator`, `venue_staff`, `technical_staff` and `attendee`, defined in `shared/permissions.js`. A user may hold several (`roles: string[]`) and receives the union of what each role permits. Profiles written before the roles migration hold a single `role` string and are still read correctly. Frontend role checks control presentation only; backend operations enforce access. The later customer material in the requirements revision candidate adds Event Coordinator Lead and Safety Officer roles; neither is implemented in the current role model.

Organisers can view and edit their organisation name on `/profile`, including adding a name to an older account. Saving uses the backend API. Names are trimmed and cannot be blank. Matching names do not link accounts or grant organisation access; changing a name does not alter an existing organisation ID or any event request. Registration does not assign organisation IDs or create shared organisation memberships.

## API

Application endpoints are under `/api` and, except the health check, require a Firebase ID token in an `Authorization: Bearer <token>` header.

| Prefix | Current operations |
| --- | --- |
| `/api/health` | Public health check (`GET`) |
| `/api/profile` | Read the signed-in profile (`GET`); Organiser updates their organisation name (`PATCH`) |
| `/api/event-requests` | Create, load and edit owned drafts; submit or resubmit; perform status actions, Coordinator reassignment and venue suitability checks |
| `/api/requests` | Scoped request list and detail, section edits and field history; event-specific venue bookings and equipment requests, including decisions |
| `/api/venues` | Venue catalogue, detail, availability, maintenance blocks and assigned booking queue |
| `/api/equipment` | Equipment catalogue and units, assigned requests and scoped reservations |
| `/api/notifications` | List the signed-in user's notices and mark a notice read |

`/api/requests` applies `shared/permissions.js` in `backend/src/middleware/authorise.js`: records outside a user's scope are not returned, sections a role may not view are absent from the response body rather than hidden, and a forbidden section write is rejected with 403 naming each field. Its `PATCH` route does not accept status changes; actions use `POST /api/event-requests/:id/transitions`. The post-submission section editor has field-value validation for preparation, venue requirements and significant fields, but not yet for every editable field.

Drafts are created and edited through `/api/event-requests`, which validates their fields. Post-submission section reads and edits use `/api/requests`, which applies role, record and status rules. Submission and later status actions remain under `/api/event-requests`; this route placement is recorded in `AGENTS.md`.

An assigned Coordinator can request `start_preparation` from a Confirmed event. The API checks a server-provided safety decision and rejects the action while the default verifier returns false. Venue and Technical Support Staff can edit their respective preparation sections only in Preparation. The current Confirm action does not yet check safety approval; see [SPM-88's current state](project_context.md#current-spm-88-state-26-october-2026).

`PATCH /api/profile` accepts only `{ "organisationName": "Example Organisation" }` with a Firebase bearer token and returns the saved name in the same shape. It updates only the authenticated organiser's profile, including for a multi-role organiser. Unauthenticated requests receive 401, non-organisers 403, and invalid names or additional fields 400. Unexpected persistence failures return 500.

## Firestore Security Rules

The repository's `firestore.rules` was reported deployed and checked with signed-in client requests on 15 September 2026 (`project_context.md`). Its current source:

- denies the browser all access to `eventRequests`, so every read and edit goes through the API, which uses the Admin SDK and bypasses rules;
- allows a signed-in browser user to read and update only their own `users/{uid}` document;
- allows a profile to be created only with the `organiser` or `attendee` role, and blocks browser-side changes to `roles`, `role`, `organisationId`, `organisationName`, and `seedTag`, so users cannot grant themselves access or bypass the profile API. The backend's Admin SDK performs the validated organisation-name update.

That dated check does not verify the rules currently deployed to any project. Editing the file changes nothing until it is deployed. After deploying, run `node backend/scripts/check-firestore-rules.js --project=<projectId>` to check the deployed rules with signed-in requests:

```bash
firebase deploy --only firestore:rules --project <FIREBASE_PROJECT_ID>
```

## Tests

The repository is an npm workspace (`frontend`, `backend`, `shared`); install dependencies from the root. `.npmrc` sets `legacy-peer-deps=true`.

```bash
npm test               # existing suites, all root Vitest suites, Playwright E2E
npm run test:existing  # node:test suites in shared/, backend/ and the frontend's own Vitest suites
npm run test:vitest    # all root Vitest suites under tests/
npm run test:unit      # selected story unit directories listed in package.json
npm run test:integration  # selected integration directories listed in package.json
npm run test:e2e       # Playwright, Chromium (run `npx playwright install chromium` once)
npm run test:coverage  # root Vitest suites; configured V8 coverage in coverage/
npm run lint           # ESLint over frontend/, backend/, shared/ and tests/
npm run build          # frontend production build
```

Story suites live under `tests/spm-*`; shared fixtures and doubles are in `tests/shared`, and repository checks are in `tests/lint`. Use the `test:spm...` scripts in `package.json` for focused story checks. `test:unit` and `test:integration` use fixed lists of directories and do not cover every story; use `test:vitest` for all root Vitest suites. Component tests use React Testing Library. Default HTTP API tests reach Express with Firebase identity and persistence replaced by mocks or in-memory stores. Playwright runs the React app and Express API in Chromium against the in-memory Firebase double, without a Firebase project or emulator.

The default `npm test` command does not run lint, build, Firestore emulator tests, or tests against a live Firebase project. It does not verify deployed rules or a production database. The root Vitest suite checks `firestore.rules` only as source text in `tests/spm-2/integration/firestoreRules.static.test.js`; use the separate rule-check script described above to exercise deployed rules.

`test:existing` runs `node:test` files in `shared/`, `backend/src/` and `backend/scripts/`, plus the frontend's co-located Vitest suites (`npm test --prefix frontend`). The coverage command runs the root Vitest suites, but its measured source files are limited to the list in `vitest.config.js`.

### Continuous integration

`.github/workflows/ci.yml` defines three independent jobs for pushes and pull requests into `main`. `code_checks` runs lint, existing tests, root Vitest coverage and the production build; `firestore_emulator` runs six transaction suites (SPM-14, SPM-54, SPM-58, SPM-78, SPM-79, SPM-81); `e2e` runs Playwright with one worker. These jobs need no Firebase project secrets. The workflow is configured to upload coverage, the Playwright report and the SPM-14/SPM-58 emulator JSON results. See the [CI pipeline guide](docs/testing/ci-pipeline.md) for setup, commands, failure checks and verification limits.

An opt-in suite runs the SPM-42 and SPM-24 API cases against a real Firebase project and also checks simultaneous tentative venue holds (SPM-16):

```bash
LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live
```

This needs the seed applied, plus `VITE_FIREBASE_API_KEY`, `SEED_ACCOUNT_PASSWORD` and Admin SDK credentials. The API cases edit seeded requests and restore them; re-run the seed script after an interrupted run. The venue concurrency case creates and cleans up a temporary venue and its holds.

## Data Scripts

The roles migration and seed scripts read the Firebase project configured in the root `.env`. They print that project ID, default to a read-only dry run, and write only with `--write --project=<projectId>`, where the ID must match the configured project.

- **Roles migration** — `node backend/scripts/migrate-user-roles.js [--organisations=<file.json>]` backfills `users/{uid}` from `role` to `roles[]`. It can add an Organiser's `organisationId` and `organisationName` from a team-supplied mapping file (see the script header). It never invents an organisation or removes `role`. Idempotent.
- **Seed** — `node backend/scripts/seed.js` plans demonstration accounts for the five implemented roles (including a venue + technical staff account), two organisations, and event requests in every status. With `--write`, it creates or resets the seeded data and requires `SEED_ACCOUNT_PASSWORD`. Seeded Auth user IDs and Firestore document IDs start with `seed-`; seeded Firestore documents carry `seedTag`. The script has no general cleanup mode.
- **Security-rule check** — `node backend/scripts/check-firestore-rules.js --project=<projectId>` signs in as seeded accounts and makes client-position Firestore requests against the deployed project. It creates a temporary Auth user/profile and edits the seeded attendee's name, with cleanup and restore logic. It needs the seed applied, `VITE_FIREBASE_API_KEY` and `SEED_ACCOUNT_PASSWORD`.
- **Venue hold processing and backfill** — `npm run process:venue-holds --prefix backend` handles due warnings and expiry; `npm run backfill:venue-holds --prefix backend` supplies expiry metadata for older holds. Follow the [operations guide](docs/operations/venue-hold-expiry.md) before running these against a project.

## Local Setup

Requirements:

- Node.js 20.19+ or 22.12+
- A Firebase project with Email/Password Authentication enabled
- A Cloud Firestore database
- A Firebase service account for the backend

Install all dependencies from the repository root:

```bash
npm run install:all
```

Copy the sample configuration and replace its placeholders locally:

```bash
cp .env.example .env
```

The application uses one root `.env` file. It is ignored by Git and must never be committed.

## Environment Example

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_API_URL=http://localhost:5000

FIREBASE_PROJECT_ID=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_PRIVATE_KEY=xxx

# Only needed to run the seed script with --write (backend/scripts/seed.js)
SEED_ACCOUNT_PASSWORD=

PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

Of the variables in this `.env` example, Vite exposes only those prefixed with `VITE_` to the browser. Never put the Admin SDK email, private key, passwords, or other server secrets in a `VITE_` variable. For `FIREBASE_PRIVATE_KEY`, encode line breaks as literal `\n` sequences; the backend converts them to line breaks when loading the root `.env`.

## Start the App

Start the frontend and backend together:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- Health check: `http://localhost:5000/api/health`

You can also run either application separately with `npm run dev:frontend` or `npm run dev:backend`.

## Seed Accounts

With `--write --project=<projectId>`, `backend/scripts/seed.js` creates or resets these 11 accounts for testing and demonstrations. They all use the password in `SEED_ACCOUNT_PASSWORD`; keep that value out of version control.

| Role | Email | Organisation ID |
| --- | --- | --- |
| Event Coordinator | `coordinator@seed.connectsphere.test` | — |
| Event Coordinator | `coordinator-2@seed.connectsphere.test` | — |
| Event Coordinator | `coordinator-3@seed.connectsphere.test` | — |
| Venue Staff | `venue-staff@seed.connectsphere.test` | — |
| Technical Support Staff | `technical-staff@seed.connectsphere.test` | — |
| Venue + Technical Staff | `venue-technical-staff@seed.connectsphere.test` | — |
| Attendee | `attendee@seed.connectsphere.test` | — |
| Event Organiser | `organiser-a1@seed.connectsphere.test` | SEED-ORG-A |
| Event Organiser | `organiser-a2@seed.connectsphere.test` | SEED-ORG-A |
| Event Organiser | `organiser-a3@seed.connectsphere.test` | SEED-ORG-A |
| Event Organiser | `organiser-b1@seed.connectsphere.test` | SEED-ORG-B |

The three Coordinator accounts demonstrate workload-based assignment in the current implementation. An untouched seed gives them 5, 2 and 1 active requests (Submitted, Under Review, Returned, Planning or Confirmed), so a new submission selects `coordinator-3`. Other requests in a shared project can change that choice. The venue + technical account demonstrates combined permissions, and the two organisations demonstrate organisation-scoped request visibility.

The seed defines 17 event requests covering every status in `shared/status.js`, owned by `organiser-a1`, `organiser-a2` and `organiser-b1`. `organiser-a3` owns none, to show the empty drafts list.

These are shared demonstration credentials. Use them only in test or demonstration projects, and identify seeded data by its `seedTag` and `seed-` ID prefix when cleaning up.
