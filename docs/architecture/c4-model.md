# C4 model

Observed source revision `b8eeecd`, 21 October 2026. These are logical C4 views. “Required, absent” follows [effective requirements](../requirements/effective-requirements.md), not a claim that a proposed implementation has been approved. See the [architecture index](README.md) for documentation findings.

## Level 1 — System context

```mermaid
flowchart LR
  people["Organiser · Coordinator · Venue Staff<br/>Technical Support Staff · Attendee"]
  system["ConnectSphere<br/>Event planning and venue booking"]
  auth["Firebase Authentication<br/>Email/password identity"]
  lead["Coordinator Lead<br/>Required, absent"]
  safety["Safety Officer<br/>Required, absent"]
  people -->|"Use current browser workflows"| system
  system -->|"Sign in and verify ID tokens"| auth
  lead -.->|"Required assignment supervision"| system
  safety -.->|"Required operational safety review"| system
  classDef missing fill:#fff7ed,stroke:#9a3412,stroke-dasharray:5 5,color:#000;
  class lead,safety missing;
```

The current [permission constants](../../shared/permissions.js) and [browser routes](../../frontend/src/App.jsx) recognise five roles. The later Week 7 requirement adds the two internal roles and changes new submissions to a Lead-managed unassigned queue; current [submission](../../backend/src/services/eventRequestService.js) still assigns a Coordinator automatically. The safety review and post-safety Preparation gate are likewise absent. One user can have multiple current roles, with backend permissions evaluated per role before combining access.

## Level 2 — Containers

```mermaid
flowchart TB
  user["People using a browser"]
  auth["Firebase Authentication<br/>Managed identity"]
  subgraph cs["ConnectSphere logical boundary"]
    web["React 19 / Vite browser app<br/>Pages, Firebase session, API client"]
    api["Node.js / Express 5 API<br/>Trusted authorisation and workflows"]
    data[("Cloud Firestore<br/>Profiles, requests, bookings, inventory,<br/>reservations, notifications, activity and locks")]
    task["Venue hold processor<br/>Node script; scheduled workflow definition"]
  end
  user --> web
  web -->|"Firebase client SDK: identity"| auth
  web -->|"Client SDK: own users profile only"| data
  web -->|"JSON + Firebase ID token"| api
  api -->|"Admin SDK: verify token"| auth
  api -->|"Admin SDK: reads and transactions"| data
  task -->|"Admin SDK: expiry transaction"| data
```

The [scheduled GitHub Actions workflow](../../.github/workflows/venue-hold-expiry.yml) invokes the [processor](../../backend/scripts/process-venue-holds.js) hourly in repository configuration. Operational execution depends on configured credentials and successful runs; no deployment is inferred. [Firestore rules](../../firestore.rules) allow the browser to access its own profile under limits and deny browser access to event requests; unmatched collections are denied. Admin SDK access bypasses these rules, so the API enforces domain access. Hosting and notification channels beyond the implemented in-app store are unspecified.

## Level 3 — Browser components

```mermaid
flowchart LR
  router["App / ProtectedRoute<br/>Navigation and presentation guards"]
  authctx["AuthContext<br/>Firebase session + own profile"]
  request["Request pages<br/>Drafts, list, detail, history,<br/>actions and notifications"]
  venue["Venue pages<br/>Catalogue, availability, booking queue"]
  equipment["Equipment pages<br/>Types, units, requests, reservations"]
  client["services/api.js<br/>Authenticated JSON requests"]
  firebase["Firebase client SDK"]
  api["Express API"]
  router --> authctx
  router --> request & venue & equipment
  authctx --> firebase
  request & venue & equipment --> client
  client --> api
```

The [router](../../frontend/src/App.jsx) exposes role-guarded pages. [AuthContext](../../frontend/src/context/AuthContext.jsx) loads the user's own profile. [Authenticated API calls](../../frontend/src/services/api.js) send a bearer token. Browser role guards are presentation only; request projection and action checks happen in the backend. Notification pages read from the API, not Firestore directly.

## Level 3 — API components

```mermaid
flowchart TB
  browser["Browser API client"]
  subgraph express["Express API"]
    routes["Routes<br/>profile, event-requests, requests,<br/>venues, equipment, notifications"]
    identity["authenticate / requireRole<br/>Token + trusted users profile"]
    authz["authorise / presentRequest<br/>Scope, sections, projection"]
    handlers["Controllers and services<br/>Submission, lifecycle, bookings,<br/>equipment, notifications"]
    store["eventRequestStore<br/>Scoped list/read/section update"]
    admin["Firebase Admin adapter"]
  end
  policy["shared/ pure policies<br/>Permissions, status, validation,<br/>availability, reservations"]
  db[("Cloud Firestore")]
  browser --> routes
  routes --> identity
  routes --> authz
  routes --> handlers
  handlers --> store
  identity & authz & handlers -.->|"imports"| policy
  identity & handlers & store --> admin
  admin --> db
```

[Express mounts](../../backend/src/app.js) compose route factories. [Authentication](../../backend/src/middleware/authenticate.js) loads trusted profile roles, and [authorisation](../../backend/src/middleware/authorise.js) uses [shared permissions](../../shared/permissions.js) for `/api/requests`. Other action routes enforce shared domain policies in services. The [store](../../backend/src/services/eventRequestStore.js) handles scoped request reads/section writes; draft, transition, booking, equipment and notification services use a Firestore-shaped database directly. There is no separate shared-policy service or universal repository layer.

## Required capability gaps

```mermaid
flowchart LR
  present["Current request / venue / equipment workflows"]
  lead["Required, absent<br/>Lead role, unassigned submission queue,<br/>Lead assignment and supervision"]
  safety["Required, absent<br/>Safety Officer review and gate<br/>before Preparation / Confirmed"]
  attendee["Required, absent<br/>Attendee event registration,<br/>capacity and waitlist workflow"]
  present -.-> lead
  present -.-> safety
  present -.-> attendee
  classDef missing fill:#fff7ed,stroke:#9a3412,stroke-dasharray:5 5,color:#000;
  class lead,safety,attendee missing;
```

These are requirements, not extra deployed containers. Current [statuses](../../shared/status.js) contain no safety state, and [preparation access](../../shared/preparation.js) still uses the temporary Planning/Confirmed rule. Formal attendee registration is absent; account registration is a different flow. [Significant-change handling](../../shared/significantChanges.js), [field history](../../shared/changeHistory.js), in-app [notifications](../../backend/src/services/notificationService.js), venue bookings and equipment reservations have current code paths and should not be shown as wholly proposed. Exact completion is tracked in the Product Backlog and evidence records.
