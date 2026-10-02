// Who is acting on an event request — shared by shared/statusTransitions.js and
// shared/cancellationRequests.js so the actor rules exist once.

import { COORDINATOR, ORGANISER, rolesOf } from './permissions.js'

// A refusal reason shared by every action check: the user is not a permitted actor.
export const NOT_PERMITTED = 'not_permitted'

/** The user holds the Organiser role and owns the request. */
export function isOwningOrganiser(user, request) {
  return rolesOf(user).includes(ORGANISER) && user?.uid != null && request.ownerUid === user.uid
}

/**
 * The user holds the Coordinator role and is the request's assigned Coordinator.
 * [Team decision, 1 Oct 2026] Every Coordinator action is limited to the assigned Coordinator, so SPM-8's
 * assignment decides who reviews. The SPM-9 criteria say "assigned" for confirm and reject and "the
 * Coordinator" elsewhere.
 */
export function isAssignedCoordinator(user, request) {
  return (
    rolesOf(user).includes(COORDINATOR) &&
    user?.uid != null &&
    request.assignedCoordinatorUid != null &&
    request.assignedCoordinatorUid === user.uid
  )
}
