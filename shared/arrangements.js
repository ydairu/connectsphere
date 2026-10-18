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
// stories are expected to build on or replace this. SPM-34 models a suggested alternative on a rejected
// booking, separate from this event-level sign-off.
//
// Decisions are record metadata, stored at the top level as
//   arrangementApprovals: { venue?: { decision, byUid, at }, technical?: { decision, byUid, at } }
// and not inside a section, so PATCH /api/requests/:id can never write them (forbiddenFields() refuses
// every non-section key) — not even the Coordinator, who may edit every section.

import { TECHNICAL_STAFF, VENUE_STAFF, rolesOf } from './permissions.js'
import { PLANNING } from './status.js'
import { ARRANGEMENTS, ARRANGEMENT_APPROVED, TECHNICAL_ARRANGEMENT, VENUE_ARRANGEMENT, arrangementDecision } from './arrangementDecisions.js'
// SPM-56. equipmentRequest.js must not import this file (it would make a circular import).
import { hasCurrentEquipmentRequest } from './equipmentRequest.js'

// The decision constants and arrangementDecision() live in arrangementDecisions.js (SPM-48: no circular
// import through preparation.js); they are re-exported so every existing import keeps working.
export {
  ARRANGEMENTS,
  ARRANGEMENT_APPROVED,
  ARRANGEMENT_DECISIONS,
  ARRANGEMENT_REJECTED,
  TECHNICAL_ARRANGEMENT,
  VENUE_ARRANGEMENT,
  arrangementDecision,
} from './arrangementDecisions.js'

// Reasons a decision is refused.
export const ARRANGEMENT_NOT_REQUIRED = 'arrangement_not_required'
export const NOT_AT_PLANNING = 'not_at_planning'
export const NOT_ASSIGNED_STAFF = 'not_assigned_staff'
export const UNKNOWN_ARRANGEMENT = 'unknown_arrangement'
// SPM-56: while the event has a current equipment request, the technical sign-off is set by deciding that
// request, not by the manual approve/reject technical actions.
export const EQUIPMENT_REQUEST_DECIDES = 'equipment_request_decides'

// Which staff role decides each arrangement.
const DECIDED_BY = Object.freeze({
  [VENUE_ARRANGEMENT]: VENUE_STAFF,
  [TECHNICAL_ARRANGEMENT]: TECHNICAL_STAFF,
})

/**
 * Does this request need technical sign-off? Only when it asks for equipment or technical support:
 * approval "is based on what the event actually requests" (Clarification 2). SPM-56: a current equipment
 * request (currentEquipmentRequest, not Closed) also asks for equipment. An event without one is decided
 * by the Organiser's equipment section alone, as before.
 */
export function technicalArrangementRequired(request) {
  const requirements = request.equipment?.requirements
  return request.equipment?.technicalSupportNeeded === true ||
    (Array.isArray(requirements) && requirements.length > 0) ||
    hasCurrentEquipmentRequest(request)
}

/** The arrangements this request needs approved before it can be confirmed. Venue is always mandatory. */
export function requiredArrangements(request) {
  return technicalArrangementRequired(request) ? [VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT] : [VENUE_ARRANGEMENT]
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
  if (arrangement === TECHNICAL_ARRANGEMENT && hasCurrentEquipmentRequest(request)) return { allowed: false, reason: EQUIPMENT_REQUEST_DECIDES }
  if (!requiredArrangements(request).includes(arrangement)) return { allowed: false, reason: ARRANGEMENT_NOT_REQUIRED }
  return { allowed: true }
}

/** The arrangements this user may decide on now, in ARRANGEMENTS order. */
export function decidableArrangements(user, request) {
  return ARRANGEMENTS.filter((arrangement) => canDecideArrangement(user, request, arrangement).allowed)
}
