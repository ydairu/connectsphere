// Venue and technical arrangement sign-off — the condition SPM-9's Confirm depends on.
//
// Pure functions: no Firebase, no I/O. The backend records decisions in a transaction
// (backend/src/services/statusTransitionService.js); the API re-checks with canDecideArrangement().
//
// "Venue approval and technical support/equipment arrangements are mandatory before confirmation." "A
// Coordinator cannot override missing mandatory venue or technical approvals." — Clarification 1.
// "Venue Staff approve, reject, or suggest alternatives; no partial approval." "Rejection keeps/returns the
// event to Planning." — effective-requirements.md §13. "Technical Support Staff approve or reject a request
// according to staff and equipment availability for that request"; approval "is based on what the event
// actually requests." — Clarification 2, Technical Approval.
//
// [Team decision, 1 Oct 2026] Minimal sign-off: until the Venue Booking Approval and equipment stories
// exist, the assigned Venue Staff and Technical Support Staff record one decision each per request. Those
// stories are expected to build on or replace this. Suggesting alternatives is not modelled.
//
// Decisions are record metadata, stored at the top level as
//   arrangementApprovals: { venue?: { decision, byUid, at }, technical?: { decision, byUid, at } }
// and not inside a section, so PATCH /api/requests/:id can never write them (forbiddenFields() refuses
// every non-section key) — not even the Coordinator, who may edit every section.

import { TECHNICAL_STAFF, VENUE_STAFF, rolesOf } from './permissions.js'
import { PLANNING } from './status.js'

export const VENUE_ARRANGEMENT = 'venue'
export const TECHNICAL_ARRANGEMENT = 'technical'
export const ARRANGEMENTS = Object.freeze([VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT])

export const ARRANGEMENT_APPROVED = 'approved'
export const ARRANGEMENT_REJECTED = 'rejected'
export const ARRANGEMENT_DECISIONS = Object.freeze([ARRANGEMENT_APPROVED, ARRANGEMENT_REJECTED])

// Reasons a decision is refused.
export const ARRANGEMENT_NOT_REQUIRED = 'arrangement_not_required'
export const NOT_AT_PLANNING = 'not_at_planning'
export const NOT_ASSIGNED_STAFF = 'not_assigned_staff'
export const UNKNOWN_ARRANGEMENT = 'unknown_arrangement'

// Which staff role decides each arrangement.
const DECIDED_BY = Object.freeze({
  [VENUE_ARRANGEMENT]: VENUE_STAFF,
  [TECHNICAL_ARRANGEMENT]: TECHNICAL_STAFF,
})

/**
 * Does this request need technical sign-off? Only when it asks for equipment or technical support:
 * approval "is based on what the event actually requests" (Clarification 2).
 */
export function technicalArrangementRequired(request) {
  const requirements = request.equipment?.requirements
  return request.equipment?.technicalSupportNeeded === true || (Array.isArray(requirements) && requirements.length > 0)
}

/** The arrangements this request needs approved before it can be confirmed. Venue is always mandatory. */
export function requiredArrangements(request) {
  return technicalArrangementRequired(request) ? [VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT] : [VENUE_ARRANGEMENT]
}

/** The recorded decision for one arrangement, or null if none has been made. */
export function arrangementDecision(request, arrangement) {
  return request.arrangementApprovals?.[arrangement]?.decision ?? null
}

/** Are all mandatory venue and required technical arrangements approved? SPM-9's Confirm guard. */
export function arrangementsApproved(request) {
  return requiredArrangements(request).every((arrangement) => arrangementDecision(request, arrangement) === ARRANGEMENT_APPROVED)
}

/**
 * May this user record a decision on this arrangement now? Only at Planning, only the staff role that
 * owns the arrangement, and only staff assigned to the request. A decision may be changed while the
 * request is at Planning — after a rejection, the venue preference may change and be approved.
 */
export function canDecideArrangement(user, request, arrangement) {
  if (!Object.hasOwn(DECIDED_BY, arrangement)) return { allowed: false, reason: UNKNOWN_ARRANGEMENT }
  if (request.status !== PLANNING) return { allowed: false, reason: NOT_AT_PLANNING }
  const assigned = user?.uid != null && (request.assignedStaffUids ?? []).includes(user.uid)
  if (!assigned || !rolesOf(user).includes(DECIDED_BY[arrangement])) return { allowed: false, reason: NOT_ASSIGNED_STAFF }
  if (!requiredArrangements(request).includes(arrangement)) return { allowed: false, reason: ARRANGEMENT_NOT_REQUIRED }
  return { allowed: true }
}

/** The arrangements this user may decide on now, in ARRANGEMENTS order. */
export function decidableArrangements(user, request) {
  return ARRANGEMENTS.filter((arrangement) => canDecideArrangement(user, request, arrangement).allowed)
}
