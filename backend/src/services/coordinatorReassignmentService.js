// SPM-26 — reassign an event to a different Event Coordinator; SPM-69 — only an Event Coordinator Lead may.
//
// Who may reassign, when, and to whom is decided only by shared/coordinatorReassignment.js, with SPM-68's
// assignmentTargetRefusal() and assignmentCandidates() (shared/coordinatorLeadAssignment.js) for the target, so
// the Lead never hands an event to themselves. This file has two layers:
//   reassignCoordinatorInTransaction()  the change itself: new Coordinator, the reassigning Lead, activity
//                                       entry, assignment lock. No permission check.
//   reassignEventRequest()              the entry point: reads, authorises, validates, then calls it.
//
// Concurrency: reassignment reads and writes SPM-8's lock document, so it is serialised with the Lead's
// assignment (SPM-68) and with other reassignments; Firestore retries the transaction if the request or
// the lock changed after it was read. SPM-69: the Lead sends the Coordinator their page showed
// (`expectedCoordinatorUid`); if it has changed meanwhile, nothing is written (409). On the record only
// assignedCoordinatorUid, assignedByUid, assignedAt and updatedAt change; every linked record (venue and
// equipment requests, holds, history, comments) is keyed by the event and follows it (CL3 G8!C14).

import { TARGET_IS_SELF, assignmentCandidates, assignmentTargetRefusal } from '../../../shared/coordinatorLeadAssignment.js'
import {
  COORDINATOR_CHANGED,
  EXPECTED_COORDINATOR_REQUIRED,
  NOT_PERMITTED,
  NOT_SUBMITTED,
  TARGET_IS_CURRENT,
  TARGET_IS_OWNER,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
  TERMINAL_STATUS,
  mayReassignCoordinator,
  reassignmentStatusRefusal,
} from '../../../shared/coordinatorReassignment.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION, ASSIGNMENT_LOCK_PATH, loadActiveCounts, loadCoordinators } from './coordinatorAssignmentService.js'
import { EventRequestNotFoundError } from './eventRequestService.js'
import { userActor } from './statusHistory.js'
import { requireRequestScope } from './statusTransitionService.js'

// Activity entry type beside SPM-8's coordinator_assigned and SPM-9's status_changed.
export const COORDINATOR_REASSIGNED = 'coordinator_reassigned'

const REFUSALS = Object.freeze({
  [NOT_PERMITTED]: { status: 403, message: 'Only an Event Coordinator Lead can reassign events.' },
  [TERMINAL_STATUS]: { status: 409, message: 'Completed, cancelled and rejected events cannot be reassigned.' },
  [NOT_SUBMITTED]: { status: 409, message: 'Only a submitted event with a Coordinator can be reassigned.' },
  [COORDINATOR_CHANGED]: { status: 409, message: 'This event’s Coordinator has changed since you opened it.' },
  [EXPECTED_COORDINATOR_REQUIRED]: { status: 400, message: 'Reload the event and try again: the current Coordinator was not sent.' },
  [TARGET_REQUIRED]: { status: 400, message: 'Choose the Coordinator to hand the event over to.' },
  [TARGET_IS_SELF]: { status: 400, message: 'You cannot assign an event to yourself.' },
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
 * activity, in SPM-8's shape (`coordinatorUid` is the Coordinator now assigned). SPM-69: `assignedByUid` and
 * `assignedAt` name the Lead who made the change, so the event joins that Lead's supervision (CL3 G8!C41).
 *
 * Does NOT decide whether the change is allowed. Reads the assignment lock and then only writes, so the
 * caller must finish its own reads first, as Firestore transactions require.
 */
export async function reassignCoordinatorInTransaction(tx, db, { requestRef, request, toUid, actor, at }) {
  const lockRef = db.collection(ASSIGNMENT_LOCK_PATH[0]).doc(ASSIGNMENT_LOCK_PATH[1])
  await tx.get(lockRef)

  const update = { assignedCoordinatorUid: toUid, assignedByUid: actor.uid, assignedAt: at, updatedAt: at }
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

// A user who may not reassign gets the event's ordinary refusal first — 404 for a Coordinator who cannot see it
// (SPM-26 AC8, SPM-65), 403 for anyone else out of scope — and otherwise 403 (SPM-69: the assigned Coordinator
// included). A Lead who may reassign it is then told if its status does not allow it.
function authoriseReassignment(user, request) {
  if (!mayReassignCoordinator(user, request)) {
    requireRequestScope(user, request)
    throw new ReassignmentError(NOT_PERMITTED)
  }
  const statusRefusal = reassignmentStatusRefusal(request)
  if (statusRefusal) throw new ReassignmentError(statusRefusal)
}

/**
 * SPM-69: Lead `user` hands event `id` to `input.coordinatorUid`. `input.expectedCoordinatorUid` is the
 * Coordinator the Lead's page showed (from the candidates response); if the event's Coordinator has changed
 * since, the reassignment is refused (409). The request, Coordinator list and lock are read and the change
 * written in one transaction, so the state that was checked is the state that is changed. Returns
 * { request, coordinator: { name } }.
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
    const expected = input?.expectedCoordinatorUid
    if (typeof expected !== 'string' || expected === '') throw new ReassignmentError(EXPECTED_COORDINATOR_REQUIRED)
    if (expected !== request.assignedCoordinatorUid) throw new ReassignmentError(COORDINATOR_CHANGED)

    const coordinators = await loadCoordinators(db, (query) => tx.get(query))
    const targetUid = input?.coordinatorUid
    const targetRefusal = assignmentTargetRefusal({ request, targetUid, coordinatorUids: coordinators.map(({ uid }) => uid), leadUid: user.uid })
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
 * SPM-69: for the Lead who may reassign event `id` now, the Coordinators it may be handed to, as
 * [{ uid, name, activeEvents }] (SPM-68's picker), and `currentCoordinator` { uid, name } — the uid is sent back as
 * `expectedCoordinatorUid`. Refused exactly as reassignEventRequest() refuses before reading the body.
 */
export async function listReassignmentCandidates(id, user, db = getAdminDb()) {
  const snapshot = await db.collection('eventRequests').doc(id).get()
  if (!snapshot.exists) throw new EventRequestNotFoundError()
  const request = { id, ...snapshot.data() }

  authoriseReassignment(user, request)
  const currentUid = request.assignedCoordinatorUid
  const [coordinators, activeCounts, current] = await Promise.all([
    loadCoordinators(db),
    loadActiveCounts(db),
    db.collection('users').doc(currentUid).get(),
  ])
  const currentName = current.exists && typeof current.data().name === 'string' && current.data().name.trim() ? current.data().name.trim() : null
  return {
    coordinators: assignmentCandidates(coordinators, request, user, activeCounts),
    currentCoordinator: { uid: currentUid, name: currentName },
  }
}
