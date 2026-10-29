// Coordinator reassignment — SPM-26, made Lead-only by SPM-69.
//
// Pure functions: no Firebase, no I/O. The backend applies a reassignment inside a transaction
// (backend/src/services/coordinatorReassignmentService.js); the frontend shows the Reassign action from the
// API's canReassignCoordinator flag (UX only — the backend re-checks everything).
//
// SPM-69 (W7-CUST Change #5, CL3): "Only the Lead performs reassignment" (G8!C35); the assigned Coordinator may
// request a transfer but not hand the event over (G8!C12, C39; the request is SPM-86). This supersedes SPM-26's
// Clarification 2 rule that the assigned Coordinator initiates the handover after offline agreement, and with
// it the "handover agreed" confirmation.
//
// Three separate questions, so each can change on its own:
//   mayReassignCoordinator()      WHO may reassign: an Event Coordinator Lead, on an event attributed to them.
//   reassignmentStatusRefusal()   WHEN: not at a terminal status.
//   reassignmentTargetRefusal()   TO WHOM: another Event Coordinator, never the event's own submitter. The
//                                 Lead's own exclusion is SPM-68's assignmentTargetRefusal(), which calls this.

import { attributedToLead } from './coordinatorAssignment.js'
import { COORDINATOR_LEAD, rolesOf } from './permissions.js'
import { DRAFT } from './status.js'
import { TERMINAL_STATUSES } from './statusTransitions.js'

// Reasons a reassignment is refused.
export const NOT_PERMITTED = 'not_permitted'
export const TERMINAL_STATUS = 'terminal_status'
export const NOT_SUBMITTED = 'not_submitted'
// SPM-69: the event's Coordinator is no longer the one the Lead's page showed, or the page did not say.
export const COORDINATOR_CHANGED = 'coordinator_changed'
export const EXPECTED_COORDINATOR_REQUIRED = 'expected_coordinator_required'
export const TARGET_REQUIRED = 'target_required'
export const TARGET_IS_CURRENT = 'target_is_current'
export const TARGET_NOT_COORDINATOR = 'target_not_coordinator'
export const TARGET_IS_OWNER = 'target_is_owner'

/**
 * May this user reassign this event's Coordinator? SPM-69: an Event Coordinator Lead, on a submitted event that
 * they last assigned or that no Lead assigned (attributedToLead; CL3 G8!C35, C38, C41). Status is
 * reassignmentStatusRefusal()'s question, so a Lead is told why a finished event they supervised cannot be
 * reassigned. The assigned Coordinator no longer may, even holding the Lead role on another Lead's event.
 */
export function mayReassignCoordinator(user, request) {
  return rolesOf(user).includes(COORDINATOR_LEAD) && request?.status !== DRAFT && attributedToLead(user, request)
}

/**
 * Null when the event's status allows reassignment, otherwise the refusal reason.
 *
 * SPM-26 AC1/AC9, SPM-69 AC2: permitted while the event is not Completed, Cancelled or Rejected — so Submitted,
 * Under Review, Returned, Planning, Confirmed and Preparation, including while an Organiser's cancellation request
 * is pending (team decision, 3 Oct 2026). A draft, or a request still in the unassigned queue, has no Coordinator
 * to reassign (the queue is SPM-68's assignment).
 */
export function reassignmentStatusRefusal(request) {
  if (TERMINAL_STATUSES.includes(request.status)) return TERMINAL_STATUS
  if (request.status === DRAFT || !request.assignedCoordinatorUid) return NOT_SUBMITTED
  return null
}

/** Is the Reassign action available to this user now? Drives the UI flag; the backend checks again. */
export function canReassignCoordinator(user, request) {
  return mayReassignCoordinator(user, request) && reassignmentStatusRefusal(request) === null
}

/**
 * Null when `targetUid` may take over the event, otherwise the refusal reason.
 *
 * SPM-26 AC3: the replacement must hold the Coordinator role and differ from the current Coordinator. A uid
 * that names nobody is refused the same way as a non-Coordinator, so the reason does not reveal which uids
 * exist. The event's own submitter is never a candidate: this extends SPM-8's rule that a user who is both
 * Organiser and Coordinator is never assigned a request they submitted (effective-requirements.md §5) to
 * reassignment, so reassignment cannot route around it.
 *
 * @param {string[]} coordinatorUids  every user holding the Event Coordinator role
 */
export function reassignmentTargetRefusal({ request, targetUid, coordinatorUids }) {
  if (typeof targetUid !== 'string' || targetUid.trim() === '') return TARGET_REQUIRED
  if (targetUid === request.assignedCoordinatorUid) return TARGET_IS_CURRENT
  if (!coordinatorUids.includes(targetUid)) return TARGET_NOT_COORDINATOR
  if (targetUid === request.ownerUid) return TARGET_IS_OWNER
  return null
}
