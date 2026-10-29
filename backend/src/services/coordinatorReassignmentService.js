// SPM-26 — reassign an event to a different Event Coordinator.
//
// Who may reassign, when, and to whom is decided only by shared/coordinatorReassignment.js. This file has
// two layers, kept apart so Week 7 Change 5 (reassignment by an Event Coordinator Lead) changes only the
// permission check:
//   reassignCoordinatorInTransaction()  the change itself: new Coordinator, activity entry, assignment lock.
//                                       No permission check — any caller that has authorised the change.
//   reassignEventRequest()              the SPM-26 entry point: reads, authorises, validates, then calls it.
//
// Concurrency: reassignment reads and writes SPM-8's lock document, so it is serialised with the Lead's
// assignment (SPM-68) and with other reassignments; Firestore retries the transaction if the request or
// the lock changed after it was read. AC7: only assignedCoordinatorUid (and updatedAt) change on the record.

import {
  HANDOVER_NOT_AGREED,
  NOT_PERMITTED,
  NOT_SUBMITTED,
  TARGET_IS_CURRENT,
  TARGET_IS_OWNER,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
  TERMINAL_STATUS,
  eligibleCoordinators,
  handoverAgreed,
  mayReassignCoordinator,
  reassignmentStatusRefusal,
  reassignmentTargetRefusal,
} from '../../../shared/coordinatorReassignment.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION, ASSIGNMENT_LOCK_PATH, loadCoordinators } from './coordinatorAssignmentService.js'
import { EventRequestNotFoundError } from './eventRequestService.js'
import { userActor } from './statusHistory.js'
import { requireRequestScope } from './statusTransitionService.js'

// Activity entry type beside SPM-8's coordinator_assigned and SPM-9's status_changed.
export const COORDINATOR_REASSIGNED = 'coordinator_reassigned'

const REFUSALS = Object.freeze({
  [NOT_PERMITTED]: { status: 403, message: 'Only the event’s assigned Coordinator can reassign it.' },
  [TERMINAL_STATUS]: { status: 409, message: 'Completed, cancelled and rejected events cannot be reassigned.' },
  [NOT_SUBMITTED]: { status: 409, message: 'Only a submitted event with a Coordinator can be reassigned.' },
  [HANDOVER_NOT_AGREED]: { status: 400, message: 'Confirm that the handover was agreed with the new Coordinator outside the system.' },
  [TARGET_REQUIRED]: { status: 400, message: 'Choose the Coordinator to hand the event over to.' },
  [TARGET_IS_CURRENT]: { status: 400, message: 'The event is already assigned to this Coordinator.' },
  [TARGET_NOT_COORDINATOR]: { status: 400, message: 'The chosen user is not an Event Coordinator.' },
  [TARGET_IS_OWNER]: { status: 400, message: 'An event cannot be assigned to the Coordinator who submitted it.' },
})

export class ReassignmentError extends Error {
  constructor(reason) {
    const refusal = REFUSALS[reason] ?? { status: 400, message: 'Reassignment not allowed.' }
    super(refusal.message)
    this.name = 'ReassignmentError'
    this.reason = reason
    this.status = refusal.status
  }
}

/**
 * Hands `request` to Coordinator `toUid` within `tx`, and returns the request as it now stands. Records
 * { type: coordinator_reassigned, previousCoordinatorUid, coordinatorUid, actor, at } in the request's
 * activity, in SPM-8's shape (`coordinatorUid` is the Coordinator now assigned).
 *
 * Does NOT decide whether the change is allowed. Reads the assignment lock and then only writes, so the
 * caller must finish its own reads first, as Firestore transactions require.
 */
export async function reassignCoordinatorInTransaction(tx, db, { requestRef, request, toUid, actor, at }) {
  const lockRef = db.collection(ASSIGNMENT_LOCK_PATH[0]).doc(ASSIGNMENT_LOCK_PATH[1])
  await tx.get(lockRef)

  const update = { assignedCoordinatorUid: toUid, updatedAt: at }
  tx.update(requestRef, update)
  tx.set(requestRef.collection(ACTIVITY_SUBCOLLECTION).doc(), {
    type: COORDINATOR_REASSIGNED,
    previousCoordinatorUid: request.assignedCoordinatorUid ?? null,
    coordinatorUid: toUid,
    actor,
    at,
  })
  tx.set(lockRef, { lastAssignedRequestId: requestRef.id, lastAssignedAt: at })
  return { ...request, ...update }
}

// Scope first, so a Coordinator who cannot see the event gets the same 404 as for a missing one (SPM-26
// AC8, SPM-65) whatever the body says; then who may reassign; then the status.
function authoriseReassignment(user, request) {
  requireRequestScope(user, request)
  if (!mayReassignCoordinator(user, request)) throw new ReassignmentError(NOT_PERMITTED)
  const statusRefusal = reassignmentStatusRefusal(request)
  if (statusRefusal) throw new ReassignmentError(statusRefusal)
}

/**
 * SPM-26: `user` hands event `id` to `input.coordinatorUid`, having confirmed `input.handoverAgreed`.
 * The request, Coordinator list and lock are read and the change written in one transaction, so the state
 * that was checked is the state that is changed. Returns { request, coordinator: { name } }.
 *
 * Throws EventRequestNotFoundError (missing, or out of scope for a Coordinator), EventRequestForbiddenError
 * (out of scope for anyone else) or ReassignmentError; nothing is written when it throws.
 */
export async function reassignEventRequest(id, user, input, db = getAdminDb(), now = new Date()) {
  return db.runTransaction(async (tx) => {
    const requestRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(requestRef)
    if (!snapshot.exists) throw new EventRequestNotFoundError()
    const request = { id, ...snapshot.data() }

    authoriseReassignment(user, request)
    if (!handoverAgreed(input?.handoverAgreed)) throw new ReassignmentError(HANDOVER_NOT_AGREED)

    const coordinators = await loadCoordinators(db, (query) => tx.get(query))
    const targetUid = input?.coordinatorUid
    const targetRefusal = reassignmentTargetRefusal({ request, targetUid, coordinatorUids: coordinators.map(({ uid }) => uid) })
    if (targetRefusal) throw new ReassignmentError(targetRefusal)

    const target = coordinators.find(({ uid }) => uid === targetUid)
    const updated = await reassignCoordinatorInTransaction(tx, db, {
      requestRef,
      request,
      toUid: target.uid,
      actor: userActor(user),
      at: now.toISOString(),
    })
    return { request: updated, coordinator: { name: target.name } }
  })
}

/**
 * SPM-26 AC3: the Coordinators event `id` may be handed to, as [{ uid, name }], for the user who may
 * reassign it now. Refused exactly as reassignEventRequest() refuses before reading the body.
 */
export async function listReassignmentCandidates(id, user, db = getAdminDb()) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const request = { id, ...snapshot.data() }

  authoriseReassignment(user, request)
  return eligibleCoordinators(await loadCoordinators(db), request)
}
