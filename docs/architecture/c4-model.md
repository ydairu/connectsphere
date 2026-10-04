# C4 model

Source snapshot: **`2d02a855192f016c6a88a873033388afa4c369e0`**, reviewed **4 October 2026**. [Navigation, legend and requirements coverage](README.md). C4 Levels 1–3 describe logical architecture using Mermaid flowcharts. Current components below are implemented unless a label explicitly says partial or proposed; that does not imply every supported business workflow is complete.

The palette is fixed in each diagram: light grey backgrounds, black boundaries and arrows, dark blue people, blue systems/containers, and light blue components and other dependencies. Text is white on dark blue/blue and black on light blue/grey. Proposed components retain dashed borders and explicit labels.

## Level 1 — System context

```mermaid
%%{init: {"theme":"base","themeVariables":{"darkMode":false,"background":"#f3f4f6","primaryColor":"#dbeafe","primaryTextColor":"#000000","primaryBorderColor":"#000000","secondaryColor":"#dbeafe","secondaryTextColor":"#000000","secondaryBorderColor":"#000000","tertiaryColor":"#f3f4f6","tertiaryTextColor":"#000000","tertiaryBorderColor":"#000000","clusterBkg":"#f3f4f6","clusterBorder":"#000000","lineColor":"#000000","textColor":"#000000","edgeLabelBackground":"#f3f4f6","titleColor":"#000000"},"themeCSS":"& { background-color: #f3f4f6; }"}}%%
flowchart LR
  org["Event Organiser<br/>External person"]
  coord["Event Coordinator<br/>Internal person"]
  venue["Venue Staff<br/>Internal person"]
  tech["Technical Support Staff<br/>Internal person"]
  attendee["Attendee<br/>External person"]
  cs["ConnectSphere<br/>Software system<br/>Event requests and planning<br/>Partially implemented scope"]
  auth["Firebase Authentication<br/>External software system<br/>Email/password identity"]
  org -->|"Create, save, submit and amend returned requests"| cs
  coord -->|"Review assigned events and perform lifecycle actions"| cs
  venue -->|"Create venues; edit and sign off assigned venue arrangements"| cs
  tech -->|"Edit and sign off assigned technical arrangements"| cs
  attendee -->|"View permitted confirmed event information"| cs
  cs -->|"Register and sign in users; verify identity tokens"| auth
  classDef people fill:#08427b,stroke:#000000,color:#ffffff;
  classDef container fill:#1168bd,stroke:#000000,color:#ffffff;
  classDef other fill:#dbeafe,stroke:#000000,color:#000000;
  class org,coord,venue,tech,attendee people;
  class cs container;
  class auth other;
```

The five roles can overlap on one account. External Organisers and Attendees self-register; staff are provisioned through system scripts. Current responsibilities above follow [routing](../../frontend/src/App.jsx), [permissions](../../shared/permissions.js), [lifecycle policies](../../shared/statusTransitions.js), [sign-off policies](../../shared/arrangements.js), [venue routes](../../backend/src/routes/venueRoutes.js) and [seed provisioning](../../backend/scripts/seed.js). Authentication integration is in [AuthContext](../../frontend/src/context/AuthContext.jsx) and [backend authentication](../../backend/src/middleware/authenticate.js).

Future responsibilities include Coordinator venue search/booking and reassignment; Venue Staff calendar and booking decisions; Technical Support Staff availability/reservations; Attendee registration/waitlists; Organiser formal change requests; notifications and history for authorised users. These are requirements or proposed extensions, not current end-to-end capabilities. Minimal sign-off currently relies on pre-existing staff assignments.

## Level 2 — Containers

```mermaid
%%{init: {"theme":"base","themeVariables":{"darkMode":false,"background":"#f3f4f6","primaryColor":"#dbeafe","primaryTextColor":"#000000","primaryBorderColor":"#000000","secondaryColor":"#dbeafe","secondaryTextColor":"#000000","secondaryBorderColor":"#000000","tertiaryColor":"#f3f4f6","tertiaryTextColor":"#000000","tertiaryBorderColor":"#000000","clusterBkg":"#f3f4f6","clusterBorder":"#000000","lineColor":"#000000","textColor":"#000000","edgeLabelBackground":"#f3f4f6","titleColor":"#000000"},"themeCSS":"& { background-color: #f3f4f6; } .cluster-label { transform: translateX(-230px); }"}}%%
flowchart TB
  people["People in the five customer roles"]
  auth["Firebase Authentication<br/>External managed identity system"]
  subgraph system["ConnectSphere — logical system boundary"]
    browser["Browser application<br/>React 19 / React Router / Vite build<br/>Pages, session state and presentation guards"]
    api["API application<br/>Node.js / Express 5<br/>Trusted profile, permission and workflow enforcement"]
    db[("Cloud Firestore<br/>Managed document database<br/>Profiles, requests, venues, activity and assignment lock")]
  end
  people -->|"Navigate and interact in browser"| browser
  browser -->|"Firebase client SDK over HTTPS: sign-up, sign-in, session"| auth
  browser -->|"fetch: JSON over HTTP(S), Firebase bearer ID token"| api
  browser -->|"Firestore client SDK: own users profile only"| db
  api -->|"Admin SDK: verify Firebase ID token"| auth
  api -->|"Admin Firestore SDK: reads, writes and transactions"| db
  classDef people fill:#08427b,stroke:#000000,color:#ffffff;
  classDef container fill:#1168bd,stroke:#000000,color:#ffffff;
  classDef other fill:#dbeafe,stroke:#000000,color:#000000;
  class people people;
  class browser,api,db container;
  class auth other;
```

The Firestore box is part of ConnectSphere's logical data boundary, hosted by Firebase; this is not a claim that it runs alongside Express. Hosting, TLS termination and notification providers are unspecified. Local API defaults use HTTP; the diagram's HTTP(S) label does not assert a production HTTPS deployment. Firebase Storage is not an implemented container merely because its configuration key exists.

Relationship evidence: [browser Firebase initialisation](../../frontend/src/services/firebase.js), [AuthContext profile access](../../frontend/src/context/AuthContext.jsx), [API client](../../frontend/src/services/api.js), [Express mounts](../../backend/src/app.js), [Admin SDK initialisation](../../backend/src/config/firebaseAdmin.js), [authentication](../../backend/src/middleware/authenticate.js), [request persistence](../../backend/src/services/eventRequestStore.js), [draft/submission service](../../backend/src/services/eventRequestService.js), [venue persistence](../../backend/src/services/venueService.js). [Firestore rules](../../firestore.rules) deny browser access to event requests including activity; unmatched collections such as venues and system locks are denied by default. Admin access bypasses those rules, making backend enforcement essential.

Shared JavaScript is deliberately absent as a container. It is a source dependency of the browser and API components below.

## Level 3 — Frontend components

```mermaid
%%{init: {"theme":"base","themeVariables":{"darkMode":false,"background":"#f3f4f6","primaryColor":"#dbeafe","primaryTextColor":"#000000","primaryBorderColor":"#000000","secondaryColor":"#dbeafe","secondaryTextColor":"#000000","secondaryBorderColor":"#000000","tertiaryColor":"#f3f4f6","tertiaryTextColor":"#000000","tertiaryBorderColor":"#000000","clusterBkg":"#f3f4f6","clusterBorder":"#000000","lineColor":"#000000","textColor":"#000000","edgeLabelBackground":"#f3f4f6","titleColor":"#000000"},"themeCSS":"& { background-color: #f3f4f6; }"}}%%
flowchart TB
  subgraph browser["React browser application"]
    routing["main / App / ProtectedRoute<br/>Route selection and session/role guards"]
    context["AuthProvider / useAuth<br/>Session, profile, register, login, logout"]
    pages["Page groups<br/>Accounts: home, login, register, profile<br/>Requests: draft editor, lists, detail<br/>Venues: create and detail"]
    ui["UI components and utils<br/>Navbar, RoleGuard, fields, status/actions,<br/>clarifications, section and patch helpers"]
    client["API client<br/>authenticatedRequest and endpoint wrappers"]
    firebase["Firebase client<br/>Auth and Firestore instances"]
  end
  shared["Shared JavaScript source<br/>Permissions, models, status and action definitions<br/>No separate runtime"]
  api["Express API"]
  managed["Firebase Auth / Firestore<br/>Identity and own profile only"]
  routing -->|"Render"| pages
  routing -->|"Read session and roles"| context
  pages -->|"Session and account operations"| context
  pages -->|"Compose controls"| ui
  pages -->|"Request and venue operations"| client
  context -->|"Update organisation name"| client
  context -->|"Authentication and own profile calls"| firebase
  client -->|"JSON + bearer token via fetch"| api
  firebase -->|"Firebase client SDK"| managed
  browser -.->|"imports for models, guards and presentation"| shared
  classDef people fill:#08427b,stroke:#000000,color:#ffffff;
  classDef container fill:#1168bd,stroke:#000000,color:#ffffff;
  classDef other fill:#dbeafe,stroke:#000000,color:#000000;
  class api container;
  class routing,context,pages,ui,client,firebase,shared,managed other;
```

| Component/relationship          | Source evidence                                                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap, router and guards    | [main](../../frontend/src/main.jsx), [App](../../frontend/src/App.jsx), [ProtectedRoute](../../frontend/src/components/ProtectedRoute.jsx), [access utility](../../frontend/src/utils/access.js)                                                       |
| Authentication context and hook | [AuthContext](../../frontend/src/context/AuthContext.jsx), [useAuth](../../frontend/src/hooks/useAuth.js); guards wait for initial profile loading, while backend checks remain authoritative                                                        |
| Account pages                   | [Home](../../frontend/src/pages/HomePage.jsx), [Login](../../frontend/src/pages/LoginPage.jsx), [Register](../../frontend/src/pages/RegisterPage.jsx), [Profile](../../frontend/src/pages/ProfilePage.jsx)                                             |
| Request pages and calls         | [Editor](../../frontend/src/pages/CreateEventRequestPage.jsx), [Drafts](../../frontend/src/pages/DraftRequestsPage.jsx), [Requests](../../frontend/src/pages/RequestsPage.jsx), [Detail](../../frontend/src/pages/RequestDetailPage.jsx)               |
| Venue pages and calls           | [Create](../../frontend/src/pages/CreateVenuePage.jsx), [Detail](../../frontend/src/pages/VenueDetailPage.jsx)                                                                                                                                       |
| UI and presentation             | [Components](../../frontend/src/components/), [requestSections](../../frontend/src/utils/requestSections.js), [requestPatch](../../frontend/src/utils/requestPatch.js), [statusActions](../../frontend/src/utils/statusActions.js)                     |
| API and Firebase adapters       | [api.js](../../frontend/src/services/api.js), [firebase.js](../../frontend/src/services/firebase.js)                                                                                                                                                 |
| Shared imports                  | [permissions](../../shared/permissions.js), [userProfile](../../shared/userProfile.js), [eventRequest](../../shared/eventRequest.js), [venue](../../shared/venue.js), [status](../../shared/status.js), [requestActions](../../shared/requestActions.js) |

The API supplies projected data, `editableSections` and `availableActions` for request details. Presentation guards do not grant access. A missing or failed initial profile load yields a null profile; it is not evidence of a valid role. Account registration rollback attempts to delete the just-created Auth user if profile creation fails; this is not a cross-service atomic transaction.

## Level 3 — Backend components

```mermaid
%%{init: {"theme":"base","themeVariables":{"darkMode":false,"background":"#f3f4f6","primaryColor":"#dbeafe","primaryTextColor":"#000000","primaryBorderColor":"#000000","secondaryColor":"#dbeafe","secondaryTextColor":"#000000","secondaryBorderColor":"#000000","tertiaryColor":"#f3f4f6","tertiaryTextColor":"#000000","tertiaryBorderColor":"#000000","clusterBkg":"#f3f4f6","clusterBorder":"#000000","lineColor":"#000000","textColor":"#000000","edgeLabelBackground":"#f3f4f6","titleColor":"#000000"},"themeCSS":"& { background-color: #f3f4f6; }"}}%%
flowchart TB
  browser["Browser API client"]
  subgraph api["Express API application"]
    routes["app and route modules<br/>health, profile, event-requests, requests, venues"]
    authn["authenticate / requireRole<br/>Verify ID token; load trusted profile; role gates"]
    authz["authorise / presentRequest<br/>Scope, section write checks, projection and actions"]
    controllers["Controllers<br/>Load records, call services, map HTTP responses"]
    services["Domain services<br/>Profile, draft/submit, lifecycle, assignment,<br/>status history and venue operations"]
    store["eventRequestStore<br/>Scoped-request persistence and version checks"]
    admin["Firebase Admin adapter<br/>getAdminAuth / getAdminDb"]
  end
  policies["Shared JavaScript source<br/>Validation, permissions, transitions,<br/>arrangements, cancellation and selection"]
  identity["Firebase Authentication"]
  db[("Cloud Firestore")]
  browser -->|"JSON and bearer token"| routes
  routes -->|"Protected routes"| authn
  routes -->|"Dispatch handlers; load before authorise"| controllers
  routes -->|"Scoped request route middleware"| authz
  controllers -->|"Present request results"| authz
  controllers -->|"Domain operations"| services
  controllers -->|"List, get and section update"| store
  authn & services & store -->|"SDK access"| admin
  authn & authz & services -.->|"imports"| policies
  admin -->|"Verify ID tokens"| identity
  admin -->|"Profile/data I/O and transactions"| db
  classDef people fill:#08427b,stroke:#000000,color:#ffffff;
  classDef container fill:#1168bd,stroke:#000000,color:#ffffff;
  classDef other fill:#dbeafe,stroke:#000000,color:#000000;
  class browser,db container;
  class routes,authn,authz,controllers,services,store,admin,policies,identity other;
```

This component view shows dependencies, not exact middleware execution order. On `/api/requests/:id`, authentication precedes `loadOne`, authorisation, then response/update. Other paths enforce domain-specific checks in services. Health is unauthenticated.

| Component/relationship                 | Source evidence                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bootstrap and route composition        | [server](../../backend/src/server.js), [app](../../backend/src/app.js), [route modules](../../backend/src/routes/)                                                                                                                                                                                                                                                                                                                            |
| Trusted identity and role gates        | [authenticate](../../backend/src/middleware/authenticate.js), [requireRole](../../backend/src/middleware/requireRole.js)                                                                                                                                                                                                                                                                                                                     |
| Scoped checks and presentation         | [authorise](../../backend/src/middleware/authorise.js), [shared permissions](../../shared/permissions.js), [requestActions](../../shared/requestActions.js)                                                                                                                                                                                                                                                                                   |
| Handler orchestration                  | [requestController](../../backend/src/controllers/requestController.js), [eventRequestController](../../backend/src/controllers/eventRequestController.js), [profileController](../../backend/src/controllers/profileController.js), [venueController](../../backend/src/controllers/venueController.js), [healthController](../../backend/src/controllers/healthController.js)                                                                 |
| Domain services and direct persistence | [eventRequestService](../../backend/src/services/eventRequestService.js), [statusTransitionService](../../backend/src/services/statusTransitionService.js), [coordinatorAssignmentService](../../backend/src/services/coordinatorAssignmentService.js), [statusHistory](../../backend/src/services/statusHistory.js), [profileService](../../backend/src/services/profileService.js), [venueService](../../backend/src/services/venueService.js) |
| Store and Firebase adapter             | [eventRequestStore](../../backend/src/services/eventRequestStore.js), [firebaseAdmin](../../backend/src/config/firebaseAdmin.js)                                                                                                                                                                                                                                                                                                             |
| Domain policy dependencies             | [shared modules](../../shared/), detailed in the [code dependency view](codebase-architecture.md#code-dependencies)                                                                                                                                                                                                                                                                                                                          |

There is no single repository layer for all data operations: the scoped request controller uses a store contract, while draft/lifecycle/venue services call a Firestore-shaped database directly. Shared policies contain no database or network I/O.

## Proposed extension view

All dashed modules and relationships below are **engineering proposals** to satisfy the linked requirements. They extend the existing React application and Express API; no new service, hosting platform, queue, provider or collection schema has been selected here.

```mermaid
%%{init: {"theme":"base","themeVariables":{"darkMode":false,"background":"#f3f4f6","primaryColor":"#dbeafe","primaryTextColor":"#000000","primaryBorderColor":"#000000","secondaryColor":"#dbeafe","secondaryTextColor":"#000000","secondaryBorderColor":"#000000","tertiaryColor":"#f3f4f6","tertiaryTextColor":"#000000","tertiaryBorderColor":"#000000","clusterBkg":"#f3f4f6","clusterBorder":"#000000","lineColor":"#000000","textColor":"#000000","edgeLabelBackground":"#f3f4f6","titleColor":"#000000"},"themeCSS":"& { background-color: #f3f4f6; }"}}%%
flowchart LR
  subgraph browser["Existing React application"]
    pages["PROPOSED pages and controls<br/>Venue planning, equipment, event registration,<br/>changes, notifications, assignment and history"]
  end
  subgraph api["Existing Express API — proposed modules"]
    subgraph domains["Proposed domain modules"]
    direction TB
    venue["PROPOSED venue module<br/>Catalogue completion, calendar, search,<br/>suitability, holds, bookings and conflicts"]
    equipment["PROPOSED equipment module<br/>Availability, all-or-nothing reservations,<br/>release and manual failure resolution"]
    registration["PROPOSED registration module<br/>Capacity, withdrawals, FCFS waitlist invitations"]
    changes["PROPOSED change-review module<br/>Significant-change assessment and re-review"]
    history["PROPOSED assignment/history completion<br/>Staff allocation, Coordinator handover/name,<br/>authorised activity reading and field-change audit"]
    venue ~~~ equipment ~~~ registration ~~~ changes ~~~ history
    end
    notifications["PROPOSED notification module<br/>Affected users and delivery<br/>Channels/providers undecided"]
    current["Existing request services and shared policies<br/>Partial workflow foundation"]
  end
  db[("Existing Cloud Firestore<br/>Future data model undecided")]
  pages -.->|"Proposed authenticated API operations"| domains
  domains -.->|"Proposed policy integration"| current
  domains -.->|"Proposed material-action notifications"| notifications
  current -.->|"Proposed decision and cancellation notifications"| notifications
  domains -.->|"Proposed server-side persistence"| db
  classDef people fill:#08427b,stroke:#000000,color:#ffffff;
  classDef container fill:#1168bd,stroke:#000000,color:#ffffff;
  classDef other fill:#dbeafe,stroke:#000000,color:#000000;
  class db container;
  class current other;
  classDef proposed fill:#dbeafe,stroke:#000000,stroke-dasharray:5 5,color:#000000;
  class pages,venue,equipment,registration,changes,history,notifications proposed;
```

| Proposed extension              | Requirement and design boundary                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venue planning (areas 8–14)    | [ER areas 8–14](../requirements/effective-requirements.md#8-venue-catalogue). Extend current venue creation/detail with Coordinator catalogue access and planning. Holds/bookings must enforce capacity and time conflicts; **engineering recommendation:** perform conflict checks and commitment atomically on the server. Exact/partial matches and missing-facility warnings remain decisions.                                                               |
| Equipment (areas 15–17)        | [ER areas 15–17](../requirements/effective-requirements.md#15-equipment-request-management). Choose inventory modelling before implementing availability and atomic all-or-nothing reservation. Minimal technical approval currently consumes no stock. Automatic substitutes are not required.                                                                                                                                                                        |
| Registration (area 18)          | [ER area 18](../requirements/effective-requirements.md#18-attendee-registration). Enforce event/venue capacity; invite the next waitlisted person to apply, never automatically register them. Fields, withdrawal rules and invitation acceptance window are undecided. Organiser settings after submission remain deferred.                                                                                                                                            |
| Changes (areas 7, 19)           | [ER area 19](../requirements/effective-requirements.md#19-event-change-requests). Distinguish routine edits from significant date/time, duration, attendance, venue/layout and equipment changes. Re-review affected arrangements without automatically releasing existing reservations on postponement. Final transitions require recorded policy decisions.                                                                                                           |
| Assignment/history (areas 5–7) | [ER assignment](../requirements/effective-requirements.md#5-coordinator-assignment), [audit requirements](../requirements/effective-requirements.md#audit-and-security-enforcement), SPM-26/28/46/48/65. Reuse assignment policy/transaction mechanisms; handover follows offline agreement and assigned-Coordinator scope. Complete staff allocation and authorised history reading. Exact audit readership and new persistence shapes are not decided by this diagram. |
| Notifications (area 20)         | [ER area 20](../requirements/effective-requirements.md#20-notification-system). Integrate decision, change, cancellation, availability-failure and waitlist events. Channel/provider, delivery preferences, acknowledgements and infrastructure remain unspecified. A status or message visible when a page is opened is not a delivered notification.                                                                                                                  |

Areas 1–3 retain their existing foundation, with organisation membership gaps tracked in the [coverage table](README.md#requirements-to-implementation). Areas 4–7 extend existing review, lifecycle and permission components. Cancellation will also need coordinated reservation release and attendee notification once those domains exist. This view is not a commitment to specific endpoint names or a third event-request route set.
