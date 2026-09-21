# ConnectSphere

ConnectSphere is a full-stack event management foundation. It currently provides account registration, login, persistent sessions, Firestore-backed multi-role profiles, a protected profile page, and an authenticated Express API.

Event requests are created through the API and stored in Firestore. The five-role permission model lives in `shared/permissions.js` and is enforced by the API, and Firestore security rules keep the browser out of the `eventRequests` collection. Organisers can create and directly reopen their own unsubmitted drafts for editing; the dedicated drafts list and request-submission flow are not built yet.

## Technology Stack

- **Frontend:** React 19, Vite, React Router, and custom responsive CSS
- **Backend:** Node.js and Express
- **Authentication:** Firebase Authentication with email and password
- **Database:** Firebase Cloud Firestore
- **Server authentication:** Firebase Admin SDK

## Project Structure

```text
connectsphere/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── scripts/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── testing/
│   │   └── utils/
│   └── package.json
├── shared/
│   ├── eventRequest.js
│   ├── permissions.js
│   └── status.js
├── .env.example
├── .gitignore
├── firebase.json
├── firestore.rules
├── package.json
└── README.md
```

## How the App Works

1. A user registers or logs in through Firebase Authentication.
2. The user's Firebase UID identifies their document at `users/{uid}` in Firestore.
3. That document stores their name, email, roles, and creation timestamp. Organiser registration also requires `organisationName`. An `organisationId` may already exist on seeded or migrated accounts; registration does not assign one.
4. `AuthContext` restores sessions and loads the Firestore profile before protected pages render.
5. The frontend can send a Firebase ID token to the Express API.
6. The backend verifies the token and reads the user's trusted roles from Firestore.

The five roles are `organiser`, `coordinator`, `venue_staff`, `technical_staff` and `attendee`, defined in `shared/permissions.js`. A user may hold several (`roles: string[]`) and receives the union of what each role permits. Profiles written before the roles migration hold a single `role` string and are still read correctly. Frontend role checks control presentation only; protected backend operations must enforce roles through authentication middleware.

Organisers can view and edit their organisation name on `/profile`, including adding a name to an older account. Saving requires the backend to be running. Names are trimmed and cannot be blank. Matching names do not link accounts or grant organisation access; changing a name does not alter an existing organisation ID or any event request. Shared organisation records, company-ID assignment, membership, and invitation codes remain outside this increment.

## API

All routes are under `/api` and, except the health check, require a Firebase ID token in an `Authorization: Bearer <token>` header.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check; no token required |
| `GET` | `/api/profile` | The signed-in user's profile and roles |
| `PATCH` | `/api/profile` | Event Organiser updates their own organisation name |
| `POST` | `/api/event-requests` | Event Organiser creates a draft request |
| `GET` | `/api/event-requests/:id` | Event Organiser loads their own unsubmitted draft |
| `PATCH` | `/api/event-requests/:id` | Event Organiser updates their own draft |
| `GET` | `/api/requests` | Lists the requests in the user's scope |
| `GET` | `/api/requests/:id` | One request, reduced to the sections the user may view |
| `PATCH` | `/api/requests/:id` | Edits the sections the user's roles permit right now |

`/api/requests` applies `shared/permissions.js` in `backend/src/middleware/authorise.js`: records outside a user's scope are not returned, sections a role may not view are absent from the response body rather than hidden, and a forbidden write is rejected with 403 naming each field. Status values are never editable through `PATCH`; status transitions will be separate routes.

Two route sets cover the same collection, split by status: drafts are created and edited through `/api/event-requests`, which validates field values, and everything after submission is read and edited through `/api/requests`, which applies the full role, record and status rules. This split is a team decision of 20 September 2026, recorded in `AGENTS.md`.

`PATCH /api/profile` accepts only `{ "organisationName": "Example Organisation" }` with a Firebase bearer token and returns the saved name in the same shape. It updates only the authenticated organiser's profile, including for a multi-role organiser. Unauthenticated requests receive 401, non-organisers 403, and invalid names or additional fields 400. Unexpected persistence failures return 500.

## Firestore Security Rules

`firestore.rules` is deployed to the Firebase project. It:

- denies the browser all access to `eventRequests`, so every read and edit goes through the API, which uses the Admin SDK and bypasses rules;
- allows a signed-in browser user to read and update only their own `users/{uid}` document;
- allows a profile to be created only with the `organiser` or `attendee` role, and blocks browser-side changes to `roles`, `role`, `organisationId`, `organisationName`, and `seedTag`, so users cannot grant themselves access or bypass the profile API. The backend's Admin SDK performs the validated organisation-name update.

Editing the file changes nothing until it is deployed. After deploying, run `node backend/scripts/check-firestore-rules.js --project=<projectId>` to confirm what the rules actually do:

```bash
firebase deploy --only firestore:rules --project <FIREBASE_PROJECT_ID>
```

## Tests

```bash
npm test
```

Runs the `node:test` suites in `shared/`, `backend/src/` and `backend/scripts/`, followed by the frontend Vitest suites. Install the repository dependencies first; `npm test --prefix frontend` runs only the Vitest suites.

The automated tests cover shared validation and permissions, backend services and scripts, registration and profile UI behavior, session restoration, profile updates, and failure paths. API suites send real HTTP requests to the Express app with Firebase token verification and persistence replaced by mocks or in-memory equivalents. They are not live Firebase, deployed-rule, or production-database verification.

The same API cases can also run against the real Firebase project, using real sign-ins for the seeded accounts:

```bash
LIVE_API_PROJECT=<FIREBASE_PROJECT_ID> npm run test:api:live --prefix backend
```

This needs the seed applied, plus `VITE_FIREBASE_API_KEY` and `SEED_ACCOUNT_PASSWORD`. It edits seeded requests and restores them; re-run the seed script after an interrupted run.

## Data Scripts

Both scripts write to the Firebase project in the root `.env`. They print that project ID first, default to a dry run, and write only with `--write --project=<projectId>`, where the ID must match the configured project.

- **Roles migration** — `node backend/scripts/migrate-user-roles.js [--organisations=<file.json>]` backfills `users/{uid}`: `role` → `roles[]`, plus `organisationId`/`organisationName` for organisers, taken from an organisations file the team supplies (see the script header). It never invents an organisation and never removes `role`. Idempotent.
- **Seed** — `node backend/scripts/seed.js` creates demonstration accounts for all five roles (plus a venue + technical staff account), two organisations, and event requests in every status. Requires `SEED_ACCOUNT_PASSWORD` for `--write`. Idempotent. Every seeded Auth user and document has an ID starting `seed-` and a `seedTag` field, so seeded data can be found and removed without touching real accounts.
- **Security-rule check** — `node backend/scripts/check-firestore-rules.js --project=<projectId>` signs in as seeded accounts and calls Firestore directly, the way the browser can, to prove the deployed rules deny it. Read-only apart from one temporary account it creates and removes. Needs `VITE_FIREBASE_API_KEY` and `SEED_ACCOUNT_PASSWORD`.

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

Only variables prefixed with `VITE_` are available to the browser. Never add the Admin SDK email, private key, passwords, or other server secrets to a `VITE_` variable. If the private key contains line breaks, store them as escaped `\\n` sequences.

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

`backend/scripts/seed.js` creates these accounts for local testing and demonstrations. They all share the password in `SEED_ACCOUNT_PASSWORD`, which is never committed. The `.test` domain is reserved by RFC 6761, so no seeded address can reach a real inbox.

| Role | Email | Organisation |
| --- | --- | --- |
| Event Coordinator | `coordinator@seed.connectsphere.test` | — |
| Venue Staff | `venue-staff@seed.connectsphere.test` | — |
| Technical Support Staff | `technical-staff@seed.connectsphere.test` | — |
| Venue + Technical Staff | `venue-technical-staff@seed.connectsphere.test` | — |
| Attendee | `attendee@seed.connectsphere.test` | — |
| Event Organiser | `organiser-a1@seed.connectsphere.test` | SEED-ORG-A |
| Event Organiser | `organiser-a2@seed.connectsphere.test` | SEED-ORG-A |
| Event Organiser | `organiser-b1@seed.connectsphere.test` | SEED-ORG-B |

The venue + technical account demonstrates combined permissions from two roles. The two organisations demonstrate that an Organiser sees their own organisation's events and not another's.

The seed also creates 13 event requests covering every status in `shared/status.js`, owned by the three Organiser accounts.

These are demonstration credentials sharing one password. Remove them, with the `seedTag` field and the `seed-` ID prefix, before any public deployment.
