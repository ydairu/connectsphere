// Coordinator reassignment — SPM-26.
//
// Pure functions: no Firebase, no I/O. The backend applies a reassignment inside a transaction
// (backend/src/services/coordinatorReassignmentService.js); the frontend shows the Reassign action from the
// API's canReassignCoordinator flag (UX only — the backend re-checks everything).
//
// "The assigned Coordinator may initiate reassignment after offline agreement." "Exactly one Coordinator is
// assigned to an event." — Clarification 2, Coordinator Assignment.
//
// Three separate questions, so each can change on its own:
//   mayReassignCoordinator()      WHO may reassign. Week 7 Change 5 moves this to an Event Coordinator Lead;
//                                 only this function should need to change.
//   reassignmentStatusRefusal()   WHEN: not at a terminal status.
//   reassignmentTargetRefusal()   TO WHOM: another Event Coordinator, never the event's own submitter.

import { isAssignedCoordinator } from './requestActors.js'
import { DRAFT } from './status.js'
import { TERMINAL_STATUSES } from './statusTransitions.js'

// Reasons a reassignment is refused.
export const NOT_PERMITTED = 'not_permitted'
export const TERMINAL_STATUS = 'terminal_status'
export const NOT_SUBMITTED = 'not_submitted'
export const HANDOVER_NOT_AGREED = 'handover_not_agreed'
export const TARGET_REQUIRED = 'target_required'
export const TARGET_IS_CURRENT = 'target_is_current'
export const TARGET_NOT_COORDINATOR = 'target_not_coordinator'
export const TARGET_IS_OWNER = 'target_is_owner'

/**
 * May this user reassign this event's Coordinator? Today: the assigned Coordinator only — SPM-26 story and
 * Clarification 2 ("initiated by the assigned Coordinator"). Uses requestActors.js's isAssignedCoordinator,
 * which also requires the Coordinator role, as every SPM-9 Coordinator action does.
 */
export function mayReassignCoordinator(user, request) {
  return isAssignedCoordinator(user, request)
}

/**
 * Null when the event's status allows reassignment, otherwise the refusal reason.
 *
 * SPM-26 AC1/AC9: permitted while the event is not Completed, Cancelled or Rejected — so Submitted, Under
 * Review, Returned, Planning and Confirmed, including while an Organiser's cancellation request is pending
 * (team decision, 3 Oct 2026). A draft has no Coordinator to reassign.
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

/** SPM-26 AC2: the handover must be confirmed as agreed outside the system — exactly `true`. */
export function handoverAgreed(flag) {
  return flag === true
}

/**
 * The replacement list for this event: every Coordinator except the current one and the event's submitter,
 * as { uid, name } only, sorted by name. Profiles without a name are listed by uid so they stay selectable.
 *
 * @param {{ uid: string, name?: string }[]} coordinators
 */
export function eligibleCoordinators(coordinators, request) {
  const uids = coordinators.map((coordinator) => coordinator.uid)
  return coordinators
    .filter((coordinator) => reassignmentTargetRefusal({ request, targetUid: coordinator.uid, coordinatorUids: uids }) === null)
    .map((coordinator) => ({
      uid: coordinator.uid,
      name: typeof coordinator.name === 'string' && coordinator.name.trim() ? coordinator.name.trim() : coordinator.uid,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid))
}
