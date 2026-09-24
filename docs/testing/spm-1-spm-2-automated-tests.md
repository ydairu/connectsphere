# SPM-1 / SPM-2 Automated Test Suite

| | |
|---|---|
| **Implemented** | 22–24 September 2026 |
| **Last verified green** | 24 September 2026 (`npm test` run twice: 404 tests, 0 failures) |
| **Location** | `tests/` (repository root) |
| **Change history** | See [Change history](#change-history) at the end — add a dated row for every change to the suite |

## 1. Overview

This suite automates the acceptance criteria of the two Sprint 1 authentication stories so that a regression in sign-in, access control or self-registration is caught on every push rather than found by hand.

It tests the **application-owned** authentication and registration code:

- **Frontend** — `frontend/src/context/AuthContext.jsx` (login, register, logout, session restore), `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/pages/LoginPage.jsx`, `frontend/src/pages/RegisterPage.jsx`, `frontend/src/pages/ProfilePage.jsx` (logout), `frontend/src/pages/ForbiddenPage.jsx`, `frontend/src/utils/authErrors.js`, the router in `frontend/src/App.jsx`.
- **Backend** — `backend/src/middleware/authenticate.js` (Firebase ID token verification and role loading), `backend/src/middleware/requireRole.js`, the role-gated routes in `backend/src/routes/profileRoutes.js` and `backend/src/routes/eventRequestRoutes.js`.
- **Shared** — `shared/userProfile.js` (the public-registration role whitelist and organisation rule) and the role constants in `shared/permissions.js`.
- **Firestore rules** — `firestore.rules` is checked as source text only (see [What is not covered](#7-what-is-not-covered)).

Why these matter: authentication is entirely Firebase client-side in this application (there is no backend login/register endpoint), so the application's own rules — which roles may self-register, where roles are read from, how routes and API endpoints are gated — are the only thing standing between a user and another role's data. Firebase itself is **never** called by these tests: the client SDK and Admin SDK are replaced by in-memory fakes, and the end-to-end suite runs against an in-memory Firebase double. No test can touch the production project.

The suite has three layers, chosen per criterion (`user_test.md` §11):

| Layer | Tooling | What runs for real |
|---|---|---|
| Unit | Vitest, React Testing Library | One module or one component; auth context stubbed |
| Integration | Vitest, React Testing Library, Supertest | Real `AuthProvider` + real pages + real router; real Express app + middleware over HTTP |
| End-to-end | Playwright (Chromium) | Real built frontend and real Express API in a browser, Firebase replaced by the double |

## 2. User stories covered

### SPM-1 — Sign in and access only my role's area
*As a user, I want to securely log in to the system so that I can only access information and functionality appropriate to my role and relationship to an event.*

Roles: Event Organiser, Event Coordinator, Venue Staff, Technical Support Staff, Attendee.

- **AC1** — a registered user entering email and password is authenticated and granted access based on their assigned role(s).
- **AC2** — a user who is not logged in is redirected to the login page when attempting any protected page.
- **AC3** — logging out terminates the session; protected pages require re-authentication.

### SPM-2 — Register for an account
*As a user, I want to register for an account so that I can securely access ConnectSphere and use the functions available to my role.*

Public self-registration roles: Event Organiser and Attendee. Internal staff roles (Event Coordinator, Venue Staff, Technical Support Staff) must **not** be available through public self-registration.

- **AC1** — the user can select Event Organiser or Attendee as the account type.
- **AC2** — the form shows the common required fields (Name, Email, Password) plus Organisation for Event Organiser.
- **AC3** — valid information creates the account with the selected role and the user can sign in.
- **AC4** — an existing email is rejected with a clear "already in use" message.
- **AC5** — after signing in, the user can only access functionality permitted to their role.
- **AC6** — internal staff accounts cannot be created through public self-registration.

## 3. Tests implemented

Names carry the story identifier (`spm1_…`, `spm2_…`). Parameterised tests (`it.each`) are listed once with the parameter in `%s`/`$name` form and the number of generated cases in brackets.

### 3.1 SPM-1 — `tests/spm-1/`

#### `unit/authErrors.test.js` — login error messages (unit)

| Test | Validates | Expected result |
|---|---|---|
| `spm1_auth_error_%s_maps_to_a_user_message` [4] | `getAuthErrorMessage` for `auth/invalid-credential`, `auth/invalid-email`, `auth/too-many-requests`, `auth/network-request-failed` | The exact user-facing string for each code |
| `spm1_wrong_password_and_unknown_email_share_one_message_so_accounts_cannot_be_enumerated` | Message for `auth/invalid-credential` | Does not say whether the password or the account was wrong |
| `spm1_unrecognised_error_%s_falls_back_to_the_generic_message` [4] | Unmapped code, plain `Error`, `undefined`, `null` | "Something went wrong. Please try again." |
| `spm1_messages_never_expose_firebase_error_codes` | All mapped and unmapped codes | No message contains `auth/` |

#### `unit/authenticate.middleware.test.js` — Firebase ID token middleware (unit)

| Test | Validates | Expected result |
|---|---|---|
| `spm1_request_with_%s_is_rejected_before_any_verification` [4] | No header, `Basic` scheme, bare token, blank Bearer token | 401 `{ message: 'Unauthorized' }`; `verifyIdToken` never called |
| `spm1_%s_is_rejected_with_401` [3] | Invalid, expired (`auth/id-token-expired`), revoked (`auth/id-token-revoked`) tokens | 401; profile never loaded |
| `spm1_authentication_alone_does_not_grant_access_without_an_application_profile` | Valid token, no `users/{uid}` document | 401; `req.user` not set |
| `spm1_valid_token_attaches_the_persisted_roles_to_the_request` | Valid token + profile | `req.user` = uid, email, `roles`, organisation fields; no singular `role` |
| `spm1_legacy_single_role_profile_still_yields_a_roles_array` | Profile with `role: 'attendee'` only | `req.user.roles` = `['attendee']` |
| `spm1_roles_come_from_the_stored_profile_never_from_token_claims` | Token claims `roles: ['organiser']`, profile `['attendee']` | `req.user.roles` = `['attendee']` |
| `spm1_profile_without_roles_yields_no_roles_rather_than_a_default_role` | Profile with no role fields | `roles` = `[]`, request continues |
| `spm1_server_configuration_errors_are_forwarded_not_reported_as_unauthorized` | Firebase Admin not configured | Error passed to `next()`, no 401 |
| `spm1_production_authenticate_verifies_the_bearer_token_with_firebase_and_reads_users_uid` | The production binding (Admin SDK mocked) | `getAdminAuth().verifyIdToken(token)` and `collection('users').doc(uid).get()` are called; roles attached |
| `spm1_production_authenticate_rejects_tokens_firebase_rejects` | Admin SDK rejects token | 401; Firestore not read |
| `spm1_production_authenticate_rejects_a_verified_user_whose_profile_document_is_missing` | Admin SDK verifies, document `exists: false` | 401 |

#### `unit/LoginPage.test.jsx` — login form (component, auth context stubbed)

| Test | Validates | Expected result |
|---|---|---|
| `spm1_login_form_shows_email_password_and_a_way_to_register` | Rendering | "Welcome back", email/password inputs, "Log in" button, "Create an account" → `/register` |
| `spm1_valid_credentials_allow_login` | Submit with padded email | `login(trimmedEmail, password)` called; navigates to `/profile`; no alert |
| `spm1_login_returns_the_user_to_the_protected_page_they_asked_for` | Router `state.from` | Navigates to the original protected path |
| `spm1_invalid_password_rejects_login` | `auth/invalid-credential` | Alert "Invalid email or password."; stays on `/login`; button re-enabled |
| `spm1_unregistered_email_rejects_login` | Unknown email | Same message; stays on `/login` |
| `spm1_missing_email_is_rejected` | Empty email | Alert "Please enter a valid email address."; no navigation |
| `spm1_invalid_email_format_is_rejected` | `not-an-email` | Same message; no navigation |
| `spm1_missing_password_is_rejected` | Empty password (`auth/missing-password`) | Alert shown; no navigation |
| `spm1_empty_credentials_are_rejected` | Both empty | Alert shown; stays on `/login` |
| `spm1_account_without_application_profile_is_told_to_contact_support` | `PROFILE_NOT_FOUND` | "Your account profile could not be found. Please contact support." |
| `spm1_network_and_rate_limit_errors_are_reported_without_leaving_the_form` | `auth/too-many-requests` | Message shown; typed email preserved |
| `spm1_submit_is_disabled_while_authentication_is_in_progress` | Pending login | Button "Logging in…" disabled, then navigates on completion |
| `spm1_previous_error_is_cleared_when_login_is_retried` | Failure then success | Second attempt navigates to `/profile` |
| `spm1_signed_in_user_is_sent_to_their_profile_instead_of_the_login_form` | Already signed in | Redirect to `/profile`; form not rendered |

#### `integration/authProvider.session.test.jsx` — real `AuthProvider` with Firebase faked

| Test | Validates | Expected result |
|---|---|---|
| `spm1_valid_credentials_allow_login_as_$name` [5 roles] | `login()` for each role account | `user.uid`, `userProfile`, and `roles` equal the account; no other role present |
| `spm1_login_uses_firebase_email_password_authentication` | SDK call and token | `signInWithEmailAndPassword(email, password)`; `getIdToken()` returns the user's token |
| `spm1_invalid_password_rejects_login` / `spm1_unregistered_email_rejects_login` | Wrong credentials | Rejects with `auth/invalid-credential`; state stays unauthenticated |
| `spm1_missing_email_is_rejected` / `spm1_missing_password_is_rejected` / `spm1_empty_credentials_are_rejected` | Missing input | Rejects (`auth/invalid-email` / `auth/missing-password`); unauthenticated |
| `spm1_firebase_account_without_application_profile_is_signed_out_again` | Auth account without `users/{uid}` | Throws `PROFILE_NOT_FOUND`; `signOut` called once; unauthenticated |
| `spm1_startup_without_a_session_is_unauthenticated` | Fresh mount | `loading` false, `user` null, `roles` `[]` |
| `spm1_persisted_firebase_session_is_restored_with_its_roles` | Persisted session before mount | User and roles restored |
| `spm1_restored_session_without_a_profile_carries_no_roles` | Persisted session, no profile | `user` set, `userProfile` null, `roles` `[]` |
| `spm1_logout_clears_authentication` | `logout()` | `signOut` once; user/profile null; roles `[]` |
| `spm1_logout_requires_reauthentication_with_valid_credentials` | Login after logout | Wrong password rejected; correct password restores roles |
| `spm1_new_provider_after_logout_starts_unauthenticated` | Remount after logout | Unauthenticated |

#### `integration/protectedRoutes.test.jsx` — whole application in a memory router

| Test | Validates | Expected result |
|---|---|---|
| `spm1_unauthenticated_user_is_redirected_to_login_from_$path` [6 pages] | Direct entry to every protected path | Login page rendered; path is `/login` |
| `spm1_direct_protected_url_requires_authentication_then_resumes_there_after_login` | `/requests/drafts` → login as organiser | "Saved drafts" rendered at `/requests/drafts` |
| `spm1_public_page_%s_does_not_require_authentication` [3] | `/`, `/login`, `/register` | Stay on the page; signed-out navigation shown |
| per role (5×) `spm1_role_can_access_authorised_area` | `/profile` and `/requests` | Profile shows the role label(s); requests page shows the role's wording |
| per role (5×3) `spm1_role_can_access_authorised_area_$path` / `spm1_role_cannot_access_unauthorised_area_$path` | The three organiser-only pages | Organiser: page heading rendered. Others: "You do not have access to this page" at the same URL, no organiser links |
| per role (5×) `spm1_organiser_navigation_offers_organiser_areas` / `spm1_navigation_hides_organiser_areas` | Navigation links | "My drafts"/"Create request" only for the organiser |
| `spm1_authentication_alone_does_not_grant_organiser_access` | Signed-in user with no roles | Forbidden page on `/requests/drafts` |
| `spm1_logout_clears_authentication` | Click "Log out" on `/profile` | Home page; `signOut` once; signed-out navigation |
| `spm1_protected_page_requires_reauthentication_after_logout` | Re-enter `/profile`, `/requests` after logout | Login page; logging in resumes `/requests` |
| `spm1_logout_requires_valid_credentials_to_sign_in_again` | Wrong password after logout | "Invalid email or password."; stays on `/login` |

#### `integration/api.authorization.test.js` — Express API over Supertest, Firebase Admin faked

| Test | Validates | Expected result |
|---|---|---|
| `spm1_protected_api_rejects_unauthenticated_request_$method_$path` [6 endpoints] | No `Authorization` header | 401 `{ message: 'Unauthorized' }` |
| `spm1_protected_api_rejects_invalid_token_$method_$path` [6] | Garbage bearer token; `Basic` header | 401 |
| `spm1_expired_token_is_rejected` / `spm1_revoked_token_is_rejected` | Admin SDK error codes | 401 |
| `spm1_valid_token_for_an_account_without_a_profile_is_rejected` | Verified uid, no `users` document | 401 |
| `spm1_unauthenticated_requests_have_no_side_effects` | POST/PATCH without valid token | Fake Firestore unchanged |
| `spm1_health_endpoint_is_public` | `GET /api/health` | 200 `{ status: 'ok' }` |
| `spm1_role_$name_is_authenticated_with_its_assigned_roles` [5] | `GET /api/profile` per role | 200; `user.roles` equals the stored roles; no extra role; no singular `role` |
| per organiser-only endpoint (2×) `spm1_role_can_access_authorised_area` | `PATCH /api/profile`, `POST /api/event-requests` as organiser | 200 / 201 |
| per endpoint (2×4) `spm1_role_cannot_access_unauthorised_area_$name` | Same endpoints as the other four roles | 403 `{ message: 'Forbidden' }`; no data change |
| `spm1_organiser_draft_is_owned_by_the_authenticated_user_not_the_request_body` | Body carries `ownerUid`/`organisationId` | Stored draft uses the authenticated user's values |
| `spm1_direct_request_cannot_bypass_role_authorization` | Attendee sends `roles`/`role` in body and `X-Roles` headers | 403; nothing created |
| `spm1_token_claims_cannot_grant_roles_the_profile_does_not_hold` | Token claims `roles: ['organiser']` for an attendee | Profile shows `['attendee']`; PATCH → 403 |
| `spm1_attendee_never_receives_internal_planning_data` | `GET /api/requests` | Attendee responses have no `internal` section; coordinator's do |

#### `e2e/spm1.auth.spec.js` — Playwright, Chromium

| Test | Validates | Expected result |
|---|---|---|
| `spm1_valid_credentials_allow_login` | Flow 1 | Lands on `/profile`; role "Event Organiser"; "My drafts" and "Log out" visible |
| `spm1_invalid_password_rejects_login` / `spm1_unregistered_email_rejects_login` | Wrong credentials | Alert "Invalid email or password."; still `/login` |
| `spm1_empty_credentials_are_rejected` | Submit empty form | Alert; still `/login` |
| `spm1_unauthenticated_user_is_redirected_to_login` | Flow 2 for four protected URLs | Each redirects to `/login` |
| `spm1_direct_protected_url_requires_authentication_and_resumes_after_login` | Flow 2 + login | URL `/requests/drafts`, "Saved drafts" |
| `spm1_signed_in_session_survives_a_page_reload` | Reload on `/profile` | Still signed in |
| `spm1_<role>_can_access_authorised_area_and_cannot_access_unauthorised_area` [5] | Role matrix by direct URL | Organiser reaches drafts; other roles see the 403 page at the same URL and lose organiser links |
| `spm1_logout_clears_authentication_and_requires_reauthentication` | Flow 3 | Home after logout; `/profile` → `/login`; reload and back-navigation stay signed out; login from the redirect resumes the requested page |

### 3.2 SPM-2 — `tests/spm-2/`

#### `unit/registrationProfile.test.js` — `buildRegistrationProfile` rules (unit)

| Test | Validates | Expected result |
|---|---|---|
| `spm2_attendee_receives_correct_role` | Attendee payload | `{ name, email, role: 'attendee', roles: ['attendee'] }` |
| `spm2_event_organiser_receives_correct_role_and_trimmed_organisation` | Organiser payload with padded organisation | `roles: ['organiser']`, trimmed `organisationName` |
| `spm2_event_organiser_requires_organisation_(%j_is_rejected)` [5] | `undefined`, `null`, `''`, blanks, number | Throws `profile/invalid-organisation` "Organisation name is required." |
| `spm2_attendee_registration_does_not_require_or_store_organisation_(%j)` [3] | Attendee with/without organisation | No `organisationName` on the profile |
| `spm2_%s_cannot_self_register` [3 internal roles] | coordinator, venue_staff, technical_staff | Throws "Invalid registration role." |
| `spm2_unsupported_account_type_%j_is_rejected` [9] | `admin`, wrong case, whitespace, empty, `undefined`, `null`, array, object | Throws "Invalid registration role." |
| `spm2_public_registration_roles_are_exactly_event_organiser_and_attendee` | All five roles | Exactly organiser and attendee accepted |
| `spm2_manipulated_registration_cannot_inject_privileged_profile_fields` | Extra `roles`, `organisationId`, `seedTag`, `admin` | Dropped; `roles` = `['organiser']` |

#### `unit/RegisterPage.test.jsx` — registration form (component, auth context stubbed)

| Test | Validates | Expected result |
|---|---|---|
| `spm2_registration_allows_event_organiser` / `spm2_registration_allows_attendee` | Account-type radios | Organiser radio enabled (`value=organiser`); Attendee checked by default |
| `spm2_registration_does_not_offer_internal_roles` | All radios, any select, internal labels | Exactly two options; no "Event Coordinator", "Venue Staff", "Technical Support Staff" |
| `spm2_common_registration_fields_are_displayed_for_%s` [2] | Both account types | Full name (required), Email (type email), Password, Confirm password |
| `spm2_organiser_registration_displays_organisation` | Select organiser | "Organisation name" appears and is required |
| `spm2_attendee_registration_does_not_require_organisation` | Attendee submit | `register({ role: 'attendee' })` called; no organisation error |
| `spm2_switching_account_type_shows_and_hides_the_organisation_field` | Toggle roles | Field hidden for attendee, shown again with its value for organiser |
| `spm2_missing_%s_is_rejected_before_submission` [8] | Name, blank name, email, email format, password, short password, organisation, blank organisation | Field message shown; `register` not called; still `/register` |
| `spm2_mismatched_password_confirmation_is_rejected` | Confirm differs | "Passwords do not match."; `register` not called |
| `spm2_invalid_fields_are_marked_for_assistive_technology` | Empty submit | `aria-invalid="true"` and `aria-describedby` pointing at the message |
| `spm2_attendee_can_register` | Valid attendee submit | `register` called with trimmed name and `role: 'attendee'`; navigates to `/profile` |
| `spm2_event_organiser_can_register` | Valid organiser submit | `register` called with `role: 'organiser'` and organisation; navigates to `/profile` |
| `spm2_duplicate_email_displays_clear_error` | `auth/email-already-in-use` | Alert "An account with this email already exists."; values preserved; still `/register` |
| `spm2_weak_password_rejected_by_the_backend_is_reported` | `auth/weak-password` | "Password must contain at least 6 characters." |
| `spm2_rejected_registration_role_does_not_create_an_account_or_leave_the_form` | `Invalid registration role.` | Alert shown; still `/register` |
| `spm2_submit_is_disabled_while_the_account_is_being_created` | Pending register | "Creating account…" disabled, then `/profile` |
| `spm2_signed_in_user_is_redirected_away_from_registration` | Already signed in | Redirect to `/profile` |

#### `integration/authProvider.register.test.jsx` — real `AuthProvider` with Firebase faked

| Test | Validates | Expected result |
|---|---|---|
| `spm2_attendee_can_register` | `register()` | `createUserWithEmailAndPassword(email, password)`; `updateProfile(displayName)`; user signed in |
| `spm2_attendee_receives_correct_role` | Persisted document | `{ name, email, role: 'attendee', roles: ['attendee'], createdAt }`; context `roles` `['attendee']` |
| `spm2_event_organiser_can_register` / `spm2_event_organiser_receives_correct_role` | Organiser registration | Document has `roles: ['organiser']` and trimmed `organisationName` |
| `spm2_event_organiser_requires_organisation_(%j)` [3] | `''`, blanks, `undefined` | Rejects `profile/invalid-organisation`; **no** auth account created |
| `spm2_attendee_registration_ignores_organisation` | Attendee with organisation | Not persisted |
| `spm2_registered_attendee_can_login` / `spm2_registered_event_organiser_can_login` | Logout then login with the new credentials | Same uid; correct roles (and organisation) |
| `spm2_weak_password_is_rejected_and_no_account_is_created` / `spm2_invalid_email_is_rejected_and_no_account_is_created` | SDK validation | Rejects; store unchanged |
| `spm2_duplicate_email_is_rejected` | Existing email | Rejects `auth/email-already-in-use`; user null |
| `spm2_duplicate_registration_does_not_create_second_user` | Same | Accounts and profiles identical before/after; no `setDoc` |
| `spm2_duplicate_registration_does_not_modify_the_existing_account` | Duplicate as organiser with organisation | Existing password, name, roles unchanged; original login still works |
| `spm2_duplicate_email_is_detected_regardless_of_letter_case` | Upper-cased email | Rejected; one account |
| `spm2_%s_cannot_self_register` [3 internal roles] | Internal role payloads | Throws before `createUserWithEmailAndPassword`; no account, no profile with that role |
| `spm2_manipulated_role_request_%j_is_rejected` [9] | Unsupported role values | Throws; nothing created |
| `spm2_registration_cannot_inject_privileged_profile_fields` | Extra `roles`, `organisationId`, `seedTag` | Profile `roles: ['attendee']`, extras absent |
| `spm2_rejected_profile_write_removes_the_new_auth_account_so_no_privileged_state_remains` | Firestore write denied | `deleteUser` called; account gone; user null |

#### `integration/postRegistrationAccess.test.jsx` — whole application in a memory router

| Test | Validates | Expected result |
|---|---|---|
| `spm2_registered_attendee_has_correct_permissions` | Register via the form | Profile shows name and "Attendee"; no organiser links; `/requests` shows attendee wording |
| `spm2_registered_user_cannot_access_unauthorised_role` | `/requests/drafts`, `/event-requests/new` as new attendee | Forbidden page listing "(Attendee)" at the same URL |
| `spm2_registered_attendee_can_log_out_and_log_in_again` | Logout, then login form | Back on `/profile` as Attendee |
| `spm2_registered_event_organiser_has_correct_permissions` | Register as organiser | Profile shows "Event Organiser" and organisation; drafts and create pages reachable |
| `spm2_event_organiser_requires_organisation_in_the_form` | Blank organisation | "Organisation name is required."; no account created |
| `spm2_duplicate_email_displays_clear_error_and_creates_nothing` | Existing email | Alert text; still `/register`; store unchanged; not signed in |

#### `integration/api.registeredRoleAccess.test.js` — Express API with profiles as registration persists them

| Test | Validates | Expected result |
|---|---|---|
| `spm2_registered_attendee_is_recognised_with_the_attendee_role` | `GET /api/profile` | `roles: ['attendee']`, `organisationName: null` |
| `spm2_registered_attendee_can_access_attendee_functionality` | `GET /api/requests` | 200 |
| `spm2_registered_user_cannot_access_unauthorised_role` | `POST /api/event-requests`, `PATCH /api/profile` as attendee | 403; nothing written |
| `spm2_registered_user_has_correct_permissions` | Organiser endpoints | Profile roles `['organiser']`; draft 201 owned by the organiser; profile PATCH 200 |
| `spm2_registered_user_cannot_escalate_role_via_profile_update` | PATCH with `roles`, `role`, `organisationId` | 400; stored roles unchanged |
| `spm2_manipulated_role_request_is_rejected` | Body/header/token-claim role escalation | 403; profile still `['attendee']` |
| `spm2_%s_registration_cannot_produce_an_api_identity` [3] | Internal-role registration attempt | Profile build throws; a token without a profile → 401 |

#### `integration/firestoreRules.static.test.js` — `firestore.rules` source check (not rules execution)

| Test | Validates | Expected result |
|---|---|---|
| `spm2_rules_limit_self_registration_to_event_organiser_and_attendee` | `selfRegistrable()` `hasOnly([...])` | Exactly `organiser` and `attendee`; no internal role |
| `spm2_rules_public_roles_match_the_application_whitelist` | Rules vs `buildRegistrationProfile` for all five roles | Both allow the same set |
| `spm2_rules_gate_profile_creation_on_self_registrable_and_ownership` | `allow create` on `users/{uid}` | Requires `signedInAs(uid) && selfRegistrable(...)` |
| `spm2_rules_require_a_non_empty_roles_list_consistent_with_role` | `selfRegistrable()` body | `roles is list`, `size() > 0`, `role in roles` |
| `spm2_rules_forbid_changing_roles_and_organisation_after_creation` | `allow update` | Protected keys include `roles`, `role`, `organisationId`, `organisationName` |
| `spm2_rules_deny_profile_deletion_and_reads_of_other_users` | `allow read` / `allow delete` | Owner-only read; delete denied |
| `spm2_rules_keep_event_requests_behind_the_api` | `eventRequests` match | `allow read, write: if false` |

#### `e2e/spm2.registration.spec.js` — Playwright, Chromium

| Test | Validates | Expected result |
|---|---|---|
| `spm2_registration_offers_only_attendee_and_event_organiser` | Registration page | Two radios; Attendee checked; no internal labels; no organisation field |
| `spm2_attendee_can_register_and_access_only_attendee_functionality` | Flow 4 | `/profile` as Attendee; account + `roles: ['attendee']` stored in the double; `/requests` allowed; drafts/create → 403 page; logout and re-login work |
| `spm2_event_organiser_can_register_with_organisation_and_access_organiser_functionality` | Flow 5 | Organisation field appears; blank organisation blocked; profile shows "Event Organiser" and organisation; drafts page reachable; re-login works |
| `spm2_duplicate_email_is_rejected_with_a_clear_error` | Flow 6 | Alert "An account with this email already exists."; still `/register`; account count and existing profile unchanged; original user can log in |
| `spm2_incomplete_registration_is_rejected_before_submission` | Empty submit | Field messages shown; no account created |

### 3.3 Repository checks — `tests/lint/`

`backend-boot.test.js` (4 tests): the default Express app imports without Firebase credentials, serves `GET /api/health` (200, `Cache-Control: no-store`, no `X-Powered-By`), returns JSON 404 for unknown routes and JSON 400 for malformed JSON bodies.

## 4. Test structure

Everything specific to a story lives under that story's folder; `tests/shared/` holds only what both stories use.

```
tests/
├── lint/
│   └── backend-boot.test.js                 backend imports and serves in the test environment
├── shared/                                  used by BOTH stories
│   ├── fixtures/testUsers.js                one fake account per role (from backend/scripts/seedData.js) + TEST_PASSWORD
│   ├── mocks/firebaseClientMock.js          in-memory firebase/auth + firebase/firestore (Vitest jsdom tests)
│   ├── mocks/firebaseAdminMock.js           in-memory firebase-admin (Supertest tests)
│   ├── helpers/renderApp.jsx                renders the whole app in a MemoryRouter; stubs the Express API
│   ├── setup/jsdom.setup.js                 registers the Firebase fake for every jsdom test; resets it per test
│   ├── e2e/fixtures.js                      Playwright fixtures: reset the double, loginAs, logout, fillRegistration
│   └── firebase-double/                     E2E: in-memory Firebase + the REAL Express API
│       ├── server.js, doubleServer.js       Node server on port 5001 (/__double__/* and /api/*)
│       ├── client/{app,auth,firestore}.js   browser modules aliased over firebase/*
│       └── vite.e2e.config.js               frontend Vite config + aliases, port 5174
├── spm-1/
│   ├── fixtures/protectedRoutes.js          protected pages/endpoints and their role gates
│   ├── unit/                                authErrors, authenticate.middleware, LoginPage
│   ├── integration/                         authProvider.session, protectedRoutes, api.authorization
│   └── e2e/spm1.auth.spec.js
└── spm-2/
    ├── fixtures/registrations.js            registration payloads, internal roles, unsupported types
    ├── unit/                                registrationProfile, RegisterPage
    ├── integration/                         authProvider.register, postRegistrationAccess,
    │                                        api.registeredRoleAccess, firestoreRules.static
    └── e2e/spm2.registration.spec.js
```

Conventions:

- `*.test.jsx` → Vitest **jsdom** project (React); `*.test.js` → Vitest **node** project (API, shared rules); `*.spec.js` under `e2e/` → Playwright. Configured in `vitest.config.js` and `playwright.config.js` at the repository root.
- Assertions use plain Vitest matchers (no `jest-dom`), matching the frontend's existing tests.
- Fixtures are fake: `.test` e-mail domain, a made-up password, no real credentials or secrets.
- The pre-existing suites (`node:test` in `shared/` and `backend/`, Vitest in `frontend/src`) are untouched and still run via `npm run test:existing`.

## 5. Running the test suite

### Setup (once)

```bash
npm install                      # npm workspace: installs frontend, backend, shared and test tooling
npx playwright install chromium  # browser for the E2E suites (one-time download)
```

Requirements: Node.js 22 and npm 10. No Firebase project, `.env`, Java or emulator is needed. `.npmrc` already sets `legacy-peer-deps` (npm 10.9's peer resolver crashes on this workspace layout; every peer dependency is declared explicitly).

### Commands (from the repository root)

| Purpose | Command |
|---|---|
| Everything (existing suites → `tests/` Vitest → Playwright) | `npm test` |
| SPM-1 only (Vitest + Playwright) | `npm run test:spm1` |
| SPM-2 only (Vitest + Playwright) | `npm run test:spm2` |
| Unit tests only | `npm run test:unit` |
| Integration tests + repository checks | `npm run test:integration` |
| End-to-end only | `npm run test:e2e` |
| `tests/` Vitest suites with coverage (report in `coverage/`) | `npm run test:coverage` |
| Pre-existing suites only | `npm run test:existing` |
| Lint (frontend, backend, shared, tests) | `npm run lint` |
| Frontend production build | `npm run build` |

Useful variations: `npx vitest run tests/spm-2/unit/RegisterPage.test.jsx` runs one file; `npx vitest` (no `run`) watches; `npx playwright test --ui` opens the Playwright inspector; `npx playwright show-report` opens the last HTML report.

The E2E commands start two servers themselves (double + API on `127.0.0.1:5001`, Vite on `127.0.0.1:5174`) and stop them afterwards. Do not run two E2E commands at the same time.

### Continuous integration

`.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, `npm run test:existing`, `npm run test:coverage`, `npm run build`, then the Playwright suites, on every push and on pull requests into `main`. It needs no secrets. The Playwright HTML report and `coverage/` are attached to each run as artifacts.

## 6. Expected results

When everything passes, `npm test` prints four green summaries in sequence (counts as of 24 September 2026):

```
# tests 107   # pass 107   # fail 0            node:test (shared/, backend/)
 Test Files  8 passed (8)      Tests  41 passed (41)     frontend Vitest
 Test Files  13 passed (13)    Tests  238 passed (238)   tests/ Vitest  (SPM-1 133, SPM-2 101, lint 4)
  18 passed                                              Playwright     (SPM-1 13, SPM-2 5)
```

and exits with code 0. `npm run test:spm1` ends with `133 passed` then `13 passed`; `npm run test:spm2` with `101 passed` then `5 passed`. `npm run lint` prints nothing and exits 0.

Identifying a failure:

- **Vitest** marks the file with `❯` and the test with `×`, then prints a `FAIL … > <describe> > <test name>` block with the assertion (`Expected` / `Received`), the file and line, and for React tests the rendered DOM. The summary line becomes `Tests  N failed | M passed`. The `spm1_`/`spm2_` name tells you the story; the `describe` title names the acceptance criterion.
- **Playwright** prints `✘` next to the test, the failing locator or `expect`, a call log, and writes a trace plus `error-context.md` under `test-results/<test-name>/`. Open with `npx playwright show-report` or `npx playwright show-trace <trace.zip>`.
- **ESLint** lists `file:line:column  error  <message>  <rule>` and exits 1.
- **CI** shows a red ✗ on the commit; failures are annotated inline on the "Files changed" view via the GitHub reporter, and the artifacts contain the full report.

A failing test means the application behaviour changed with respect to the acceptance criterion in the `describe` title. Fix the application unless the acceptance criterion itself has been changed and recorded; do not weaken the assertion.

## 7. What is not covered

- **Executing `firestore.rules`.** Registration writes `users/{uid}` from the browser, so the true server-side gate for SPM-2 AC6 is the Firestore rules. They are checked here only as source text (`firestoreRules.static.test.js`). Executing them needs the Firestore emulator (Java) with `@firebase/rules-unit-testing`, or verification against the deployed project.
- **Real Firebase Authentication behaviour** (its duplicate-email detection, password policy, token expiry/revocation timing). Everything runs against fakes or the in-memory double. The opt-in `test:api:live` harness in `backend/` remains for real-project checks and is deliberately excluded from CI.

None of the above is live Firebase, emulator, deployed-rule or production-database verification (AGENTS.md §7).

## Change history

Add a row for every change to the suite (new tests, renamed tests, removed tests, configuration or tooling changes). Keep the newest row at the bottom.

| Date | Change | Files | Author |
|---|---|---|---|
| 2026-09-22 | Suite designed; npm workspace, root Vitest/Playwright/ESLint configuration, GitHub Actions workflow and the SPM-1/SPM-2 unit tests created. | `package.json`, `vitest.config.js`, `playwright.config.js`, `eslint.config.js`, `.npmrc`, `.github/workflows/ci.yml`, `tests/spm-1/unit/*`, `tests/spm-2/unit/*`, `tests/shared/*` | ydairu |
| 2026-09-24 | Integration and E2E suites completed; Firebase double for Playwright; four test-side corrections (import hoisting, nav-scoped "Log in" queries, jsdom timeout, post-redirect login expectation). Full suite verified green twice: 404 tests. | `tests/spm-1/integration/*`, `tests/spm-1/e2e/*`, `tests/spm-2/integration/*`, `tests/spm-2/e2e/*`, `tests/shared/firebase-double/*`, `tests/lint/*`, `README.md`, `project_context.md` | ydairu |
| 2026-09-24 | This document created. | `docs/testing/spm-1-spm-2-automated-tests.md` | ydairu |
