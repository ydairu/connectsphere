// Permission model for event requests — SPM-42 (and SPM-24's last criterion).
//
// Pure functions: no Firebase, no I/O. Imported by the backend (enforcement) and the frontend (UX only),
// so each rule exists once. Every rule traces to the SPM-42 criteria in
// docs/requirements/effective-requirements.md and the clarification records in docs/requirements/.
//
// Permission is role × record × status — three separate predicates:
//   inScope(user, request)         may this user see this record at all?
//   stateGateOpen(user, request)   may it be edited right now, by this user?
//   editableSections(roles)        which sections may these roles ever edit?
//
// Request shape assumed here (the event-request model does not exist yet — SPM-7):
//   { id, status, ownerUid, organisationId, organisationName, assignedStaffUids: string[],
//     assignedCoordinatorUid (SPM-8), core: {...}, venue: {...}, equipment: {...},
//     registration: { enabled, ... }, internal: {...},
//     venuePreparation: { status, notes }, equipmentPreparation: { status, notes } (SPM-48) }
// Section data lives under its section key, so a field's section is its top-level key.

import { DRAFT, RETURNED, PREPARATION, COMPLETED, CANCELLED, REJECTED, registrationEligibleStatus } from './status.js'
import { awaitingSafetyReview } from './safetyReviewState.js'
import {
  EQUIPMENT_PREPARATION,
  PREPARATION_CONDITIONS,
  VENUE_PREPARATION,
  isPreparationSection,
  preparationSection,
  preparationShown,
} from './preparation.js'

export { EQUIPMENT_PREPARATION, VENUE_PREPARATION } from './preparation.js'

// --- Roles ----------------------------------------------------------------------------------------
// 'attendee' and 'organiser' match the values already stored in users/{uid}.role.

export const ORGANISER = 'organiser'
export const COORDINATOR = 'coordinator'
export const VENUE_STAFF = 'venue_staff'
export const TECHNICAL_STAFF = 'technical_staff'
export const ATTENDEE = 'attendee'
// SPM-66: "a further new internal role ... Safety Officer, responsible for reviewing the operational safety of
// planned events" (W7-CUST Change #6). Provisioned through system defaults, never self-registered.
export const SAFETY_OFFICER = 'safety_officer'
export const ROLES = Object.freeze([ORGANISER, COORDINATOR, VENUE_STAFF, TECHNICAL_STAFF, ATTENDEE, SAFETY_OFFICER])

// --- Sections -------------------------------------------------------------------------------------
// Grouping of SPM-7's field list — plan, "Sections". Without named sections, "venue staff update only
// the venue-related sections" (SPM-42) cannot be expressed.

export const CORE = 'core'
export const VENUE = 'venue'
export const EQUIPMENT = 'equipment'
export const REGISTRATION = 'registration'
export const INTERNAL = 'internal'
// SPM-48: venue and equipment preparation, defined in shared/preparation.js.
export const SECTIONS = Object.freeze([CORE, VENUE, EQUIPMENT, REGISTRATION, INTERNAL, VENUE_PREPARATION, EQUIPMENT_PREPARATION])

// Role capability — plan, "Role capability — sections".
const SECTION_ACCESS = Object.freeze({
  // Organiser: can view and modify their own requests' content. — Clarification 1 & 2, Role Permissions.
  [ORGANISER]: { view: [CORE, VENUE, EQUIPMENT, REGISTRATION], edit: [CORE, VENUE, EQUIPMENT, REGISTRATION] },
  // "Coordinators can edit event details" — Clarification 1. "Event Coordinators edit main event
  // details" — Clarification 2. Every section on an event the coordinator may see is the team's SPM-42
  // implementation; which events they may see is record scope, isAssignedCoordinator() (SPM-65).
  // SPM-48: the Coordinator views both preparation sections but does not edit them.
  [COORDINATOR]: { view: SECTIONS, edit: [CORE, VENUE, EQUIPMENT, REGISTRATION, INTERNAL] },
  // "Venue staff: venue details only. Technical staff: technical equipment details only."
  // — Clarification 1, User Roles & Access Control. A view restriction, not just edit.
  // SPM-48 [Team decision, 7 Oct 2026, pending PO confirmation]: staff view the Organiser's requested venue
  // or equipment but no longer edit it; each edits only its own preparation section, and only while
  // PREPARATION_CONDITIONS allows (SECTION_CONDITIONS below). Neither sees the other's preparation.
  [VENUE_STAFF]: { view: [CORE, VENUE, VENUE_PREPARATION], edit: [VENUE_PREPARATION] },
  [TECHNICAL_STAFF]: { view: [CORE, EQUIPMENT, EQUIPMENT_PREPARATION], edit: [EQUIPMENT_PREPARATION] },
  // Attendee: event information available to them; never internal planning information.
  // — customer-rulings.md, Roles and access
  [ATTENDEE]: { view: [CORE], edit: [] },
  // SPM-66: attendance, the venue's layout and accessibility needs, and equipment — what the safety check
  // reviews — and no edits ("The Safety Officer cannot edit event details"). Venue capacity and operating
  // hours come from the booked venues (GET /api/requests/:id/safety-review/venues). Internal planning and
  // preparation are not part of the review.
  [SAFETY_OFFICER]: { view: [CORE, VENUE, EQUIPMENT], edit: [] },
})

// Finished events are read-only for every role. Not a customer ruling: team decision, proposed by
// Shaun (14 Sep 2026) and ratified 20 Sep 2026 — effective-requirements.md, SPM-42 "[Team decision]".
const FINISHED_STATUSES = Object.freeze([COMPLETED, CANCELLED, REJECTED])

// "Venue / Technical staff — planning onwards" — plan, "State gate" — up to, not past, a finished event.
const STAFF_EDITABLE_STATUSES = Object.freeze([PREPARATION])

// Record conditions on individual sections, applied after each role's scope and state gate, whoever holds
// the edit right. SPM-48: a preparation section is editable only while its condition in
// shared/preparation.js holds (status and the matching sign-off).
const SECTION_CONDITIONS = PREPARATION_CONDITIONS

// --- Role set -------------------------------------------------------------------------------------

/**
 * The user's roles as an array. Reads `roles ?? [role]` so legacy single-role user docs keep working
 * through the migration. Anything else (a string in `roles`, nothing at all) yields no roles.
 *
 * Implements: "A single staff member can now hold multiple roles" — Clarification 2, User Accounts &
 * Authentication; CLAUDE.md, "roles is an array, never a string".
 */
export function rolesOf(user) {
  if (Array.isArray(user?.roles)) return user.roles
  if (typeof user?.role === 'string') return [user.role]
  return []
}

// --- Role capability ------------------------------------------------------------------------------

/**
 * Union of several section lists, deduplicated, in canonical SECTIONS order.
 *
 * Implements SPM-42's multi-role criterion: combined roles get the combined permissions.
 * — Clarification 2, User Accounts & Authentication. Satisfied by the data, not by a role branch.
 */
export function unionSections(sectionLists) {
  const wanted = new Set(sectionLists.flat())
  return SECTIONS.filter((section) => wanted.has(section))
}

/**
 * Sections the given roles may ever view, regardless of record or status.
 *
 * Implements SPM-42: users view information according to their role's permissions; venue and technical
 * staff cannot see each other's area (Clarification 1, User Roles & Access Control).
 */
export function viewableSections(roles) {
  return unionSections(roles.map((role) => SECTION_ACCESS[role]?.view ?? []))
}

/**
 * Sections the given roles may ever edit, regardless of record or status.
 *
 * Implements SPM-42: "Venue staff update only the venue-related sections"; coordinator "can edit the
 * full event" (Clarification 2, Role Permissions & Access).
 */
export function editableSections(roles) {
  return unionSections(roles.map((role) => SECTION_ACCESS[role]?.edit ?? []))
}

// --- Record scope ---------------------------------------------------------------------------------

function isOwner(user, request) {
  return user?.uid != null && request.ownerUid === user.uid
}

/**
 * Is this user the Event Coordinator assigned to this request? The single check for a coordinator's
 * record scope: list, read and edit use it through inScope(), and coordinator action routes (SPM-5,
 * SPM-25, SPM-45, SPM-26) should call it rather than restate the rule.
 *
 * Implements the SPM-65 team decision of 1 Oct 2026: coordinators view and act only on events assigned
 * to them (effective-requirements.md, SPM-42). A request with no coordinator — every draft — matches no one.
 */
export function isAssignedCoordinator(user, request) {
  return user?.uid != null && request.assignedCoordinatorUid === user.uid
}

function roleInScope(role, user, request) {
  // "Drafts are strictly private until submitted." "It's not visible to anyone unless I submit it."
  // — Clarification 2, Drafts. Applies to every role, the coordinator included.
  if (request.status === DRAFT) return isOwner(user, request)

  switch (role) {
    case COORDINATOR:
      // Assigned events only — SPM-65 team decision, 1 Oct 2026. Reassignment moves the event to the new
      // coordinator's scope and out of the previous one's.
      return isAssignedCoordinator(user, request)
    case ORGANISER:
      // A self-registered organiser may not have an organisationId yet, but they must still be able to
      // see their own submitted request. Colleague visibility remains company-ID based below.
      if (isOwner(user, request)) return true
      // Scope on the company ID, never the name — Clarification 1, Accounts & Registration.
      // Both sides must be present: undefined === undefined would put every request in scope.
      return user.organisationId != null && request.organisationId === user.organisationId
    case VENUE_STAFF:
    case TECHNICAL_STAFF:
      return (request.assignedStaffUids ?? []).includes(user.uid)
    case ATTENDEE:
      // SPM-88 extends the original Confirmed-only viewing rule to Preparation. Registration itself
      // remains SPM-19 scope.
      return registrationEligibleStatus(request.status) && request.registration?.enabled === true
    case SAFETY_OFFICER:
      // SPM-66: "Events reach the Safety Officer only through the safety-review queue. They cannot open events
      // that aren't awaiting or under their review." Any Safety Officer may see a queued event (CL3 G8!C49);
      // once the review is recorded the event leaves the queue and their scope.
      return awaitingSafetyReview(request)
    default:
      return false
  }
}

/**
 * May this user see this record at all? True if any of the user's roles puts it in scope.
 *
 * Implements:
 *  - SPM-42 "direct-link or API attempts are denied" for out-of-scope records.
 *  - SPM-24 last criterion: a draft is not visible to a coordinator's search. — Clarification 2, Drafts
 *  - Organisers see their own organisation's events only, by company ID. — Clarification 1
 *  - Coordinator: events assigned to them, never drafts. — SPM-65 team decision of 1 Oct 2026
 *  - Venue/technical staff: assigned events, never drafts. — plan, "Role capability"
 *  - Attendee: Confirmed or Preparation events with registration enabled (SPM-88).
 *  - Safety Officer: events in the safety-review queue (SPM-66).
 */
export function inScope(user, request) {
  return rolesOf(user).some((role) => roleInScope(role, user, request))
}

/**
 * Does this one role, held by this user, put the record in scope? False when the user does not hold the
 * role. For information shown to a single role, e.g. the assigned Coordinator's name, which only the
 * Organiser role receives (SPM-46) — so another of the user's roles cannot widen it.
 */
export function inScopeAs(role, user, request) {
  return rolesOf(user).includes(role) && roleInScope(role, user, request)
}

// --- State gate -----------------------------------------------------------------------------------

function roleGateOpen(role, user, request) {
  // Applies to every role, the coordinator included. Status transitions are separate actions and never
  // pass through this gate.
  if (FINISHED_STATUSES.includes(request.status)) return false

  switch (role) {
    case ORGANISER:
      // "After an event is submitted, the organizer cannot edit it unless the coordinator requests
      // clarification or changes." — Clarification 2, Role Permissions & Access.
      // Owner only: a same-organisation colleague is view-only ("can modify only their own").
      return isOwner(user, request) && (request.status === DRAFT || request.status === RETURNED)
    case COORDINATOR:
      // "Coordinator — anything but draft." — plan, "State gate". Finished events are closed above.
      return request.status !== DRAFT
    case VENUE_STAFF:
    case TECHNICAL_STAFF:
      return STAFF_EDITABLE_STATUSES.includes(request.status)
    default:
      return false
  }
}

/**
 * The sections one role, held by this user and in scope, may edit on this record right now. Normally the
 * role's whole edit set when its gate is open, and nothing otherwise.
 *
 * SPM-19 [Team decision, 28 Oct 2026]: once the event is Confirmed or Preparation, the owning Organiser may
 * edit the registration section, and only that section. Registration opens only at those statuses, and the
 * Organiser "decides the registration opening and closing time" and "may instead close registration" when it
 * is full (Clarification 2, Attendee Registration). Every other section stays locked after submission.
 */
function roleEditableSections(role, user, request) {
  if (roleGateOpen(role, user, request)) return SECTION_ACCESS[role]?.edit ?? []
  if (role === ORGANISER && isOwner(user, request) && registrationEligibleStatus(request.status)) return [REGISTRATION]
  return []
}

/**
 * May this record be edited right now, by this user? True if any of the user's roles has its gate open.
 *
 * Implements the status criterion the plan adds to SPM-42 (Correction 1): an organiser cannot edit
 * their own request once submitted, unless it was returned for clarification. — Clarification 2
 * Also: completed, cancelled and rejected events are read-only for every role — team decision of
 * 20 Sep 2026 (effective-requirements.md, SPM-42).
 */
export function stateGateOpen(user, request) {
  return rolesOf(user).some((role) => roleGateOpen(role, user, request))
}

// --- Combined decisions ---------------------------------------------------------------------------
// Each role is checked for scope and state gate on its own, then the per-role results are unioned.
// Taking the union of roles first and checking the gate afterwards would let one role's open gate
// unlock another role's sections.

/**
 * Sections this user may view on this particular record: the union, over roles that put the record in
 * scope, of each role's view set. Empty when the record is out of scope.
 *
 * Implements SPM-42 view-by-role, with multi-role union (Clarification 2).
 */
export function viewableSectionsFor(user, request) {
  const roles = rolesOf(user).filter((role) => roleInScope(role, user, request))
  return viewableSections(roles)
}

/**
 * Sections this user may edit on this particular record right now: the union, over roles that are both
 * in scope and past their state gate, of each role's edit set.
 *
 * Implements SPM-42 edit-by-role, the organiser status gate (Clarification 2), and multi-role union. SPM-19:
 * the owner's registration section after confirmation (roleEditableSections).
 */
export function editableSectionsFor(user, request) {
  const sections = rolesOf(user)
    .filter((role) => roleInScope(role, user, request))
    .map((role) => roleEditableSections(role, user, request))
  return unionSections(sections).filter((section) => SECTION_CONDITIONS[section]?.(request) ?? true)
}

/**
 * canEdit = inScope && stateGateOpen && section ∈ editableSections — plan, "The model".
 *
 * Implements SPM-42: "users can edit only the information their role permits".
 */
export function canEdit(user, request, section) {
  return editableSectionsFor(user, request).includes(section)
}

// --- Projection and write checks ------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The request reduced to what this user may view, or null if it is out of scope. Only `id`, `status`
 * and viewable sections are kept. Record-level metadata (ownerUid, organisationId, assignedStaffUids,
 * ...) is treated as internal and kept only for callers who may view the `internal` section.
 *
 * Implements: an attendee must not receive internal planning fields "even unrendered" (plan, Phase 2);
 * venue and technical staff cannot see each other's area, so it is absent from the response rather
 * than hidden by the UI (Clarification 1, User Roles & Access Control).
 */
export function projectRequest(user, request) {
  const sections = viewableSectionsFor(user, request)
  if (sections.length === 0) return null

  const body = { id: request.id, status: request.status }
  for (const section of sections) {
    // SPM-48: preparation is shown from Planning onwards, with defaults when nothing is stored yet.
    if (isPreparationSection(section)) {
      if (preparationShown(request)) body[section] = preparationSection(request, section)
    } else if (Object.hasOwn(request, section)) {
      body[section] = request[section]
    }
  }
  if (sections.includes(INTERNAL)) {
    for (const [key, value] of Object.entries(request)) {
      if (!Object.hasOwn(body, key) && !SECTIONS.includes(key)) body[key] = value
    }
  }
  return body
}

/**
 * Field paths in a section-keyed patch that this user may not write, e.g. ['equipment.projector'].
 * An empty array means the whole patch is permitted. Top-level keys that are not sections (status,
 * ownerUid, ...) are always forbidden here.
 *
 * Implements: "reject a forbidden write with 403 naming the field" (CLAUDE.md, Hard rules) —
 * the named field is the demo evidence for SPM-42's "venue staff update only the venue-related sections".
 */
export function forbiddenFields(user, request, patch) {
  const editable = editableSectionsFor(user, request)
  const forbidden = []
  for (const [key, value] of Object.entries(patch)) {
    if (editable.includes(key)) continue
    if (isPlainObject(value) && Object.keys(value).length > 0) {
      forbidden.push(...Object.keys(value).map((field) => `${key}.${field}`))
    } else {
      forbidden.push(key)
    }
  }
  return forbidden
}
