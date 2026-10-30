// SPM-68 — the Event Coordinator Lead's unassigned queue and Coordinator assignment.
//
// Who may assign, which requests are in the queue and who may be chosen are decided only by
// shared/coordinatorLeadAssignment.js. This file reads Firestore and records the result.
//
// Concurrency: assignment re-reads the request inside the transaction and refuses it unless it is still
// submitted and unassigned, and it reads and writes the coordinator assignment lock shared with SPM-26's
// reassignment. If another Lead assigns the same request first, Firestore retries this transaction, which then
// sees the Coordinator and refuses with 409 — the first assignment is never overwritten.

import {
  NOT_FOUND,
  NOT_PERMITTED,
  NOT_UNASSIGNED,
  TARGET_IS_OWNER,
  TARGET_IS_SELF,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
  assignmentCandidates,
  assignmentStatusRefusal,
  assignmentTargetRefusal,
  mayAssignFromQueue,
  unassignedQueue,
} from '../../../shared/coordinatorLeadAssignment.js'
import { coordinatorAssignmentNotifications } from '../../../shared/notifications.js'
import { SUBMITTED } from '../../../shared/status.js'
import { getAdminDb } from '../config/firebaseAdmin.js'
import { ACTIVITY_SUBCOLLECTION, ASSIGNMENT_LOCK_PATH, COORDINATOR_ASSIGNED, loadActiveCounts, loadCoordinators } from './coordinatorAssignmentService.js'
import { addNotifications } from './notificationService.js'
import { userActor } from './statusHistory.js'

const REFUSALS = Object.freeze({
  [NOT_PERMITTED]: { status: 403, message: 'Only an Event Coordinator Lead can assign Coordinators.' },
  [NOT_FOUND]: { status: 404, message: 'Not found' },
  [NOT_UNASSIGNED]: { status: 409, message: 'This request is no longer waiting for a Coordinator.' },
  [TARGET_REQUIRED]: { status: 400, message: 'Choose the Coordinator to assign.' },
  [TARGET_IS_SELF]: { status: 400, message: 'You cannot assign an event to yourself.' },
  [TARGET_NOT_COORDINATOR]: { status: 400, message: 'The chosen user is not an Event Coordinator.' },
  [TARGET_IS_OWNER]: { status: 400, message: 'An event cannot be assigned to the Coordinator who submitted it.' },
})

export class AssignmentError extends Error {
  constructor(reason) {
    const refusal = REFUSALS[reason] ?? { status: 400, message: 'Assignment not allowed.' }
    super(refusal.message)
    this.name = 'AssignmentError'
    this.reason = reason
    this.status = refusal.status
  }
}

function requireLead(user) {
  if (!mayAssignFromQueue(user)) throw new AssignmentError(NOT_PERMITTED)
}

/**
 * SPM-68 AC3: the unassigned queue, oldest first, with basic event information only. The query narrows to
 * Submitted; awaitingCoordinatorAssignment() then keeps requests whose Coordinator is null or absent — a
 * Firestore `== null` filter would miss records without the field.
 */
export async function listUnassignedRequests(user, db = getAdminDb()) {
  requireLead(user)
  const snapshot = await db.collection('eventRequests').where('status', '==', SUBMITTED).get()
  return { requests: unassignedQueue(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))) }
}

/**
 * The Coordinators the Lead may choose for request `id`, with each one's active workload. Refused exactly as
 * assignCoordinator() refuses before reading the body.
 */
export async function listAssignmentCandidates(id, user, db = getAdminDb()) {
  requireLead(user)
  const snapshot = await db.collection('eventRequests').doc(id).get()
  const request = snapshot.exists ? { id, ...snapshot.data() } : null
  const refusal = assignmentStatusRefusal(request)
  if (refusal) throw new AssignmentError(refusal)

  const [coordinators, activeCounts] = await Promise.all([loadCoordinators(db), loadActiveCounts(db)])
  return { candidates: assignmentCandidates(coordinators, request, user, activeCounts) }
}

/**
 * SPM-68 AC4: the Lead assigns request `id` to `input.coordinatorUid`. One transaction reads the request,
 * Coordinator list and lock, then writes assignedCoordinatorUid, assignedByUid, assignedAt and a
 * coordinator_assigned activity entry naming the Lead, and (SPM-84) the notices for the Coordinator and the owning
 * Organiser, which therefore exist only if the assignment is saved. Returns { id, assigned: true, coordinator: { name } } —
 * not the request, which has now left the Lead's scope. Nothing is written when it throws.
 */
export async function assignCoordinator(id, user, input, db = getAdminDb(), now = new Date()) {
  requireLead(user)
  return db.runTransaction(async (tx) => {
    const requestRef = db.collection('eventRequests').doc(id)
    const snapshot = await tx.get(requestRef)
    const request = snapshot.exists ? { id, ...snapshot.data() } : null
    const statusRefusal = assignmentStatusRefusal(request)
    if (statusRefusal) throw new AssignmentError(statusRefusal)

    const coordinators = await loadCoordinators(db, (query) => tx.get(query))
    const targetUid = input?.coordinatorUid
    const targetRefusal = assignmentTargetRefusal({
      request,
      targetUid,
      coordinatorUids: coordinators.map(({ uid }) => uid),
      leadUid: user.uid,
    })
    if (targetRefusal) throw new AssignmentError(targetRefusal)

    const lockRef = db.collection(ASSIGNMENT_LOCK_PATH[0]).doc(ASSIGNMENT_LOCK_PATH[1])
    await tx.get(lockRef)

    const target = coordinators.find(({ uid }) => uid === targetUid)
    const at = now.toISOString()
    tx.update(requestRef, { assignedCoordinatorUid: target.uid, assignedByUid: user.uid, assignedAt: at, updatedAt: at })
    tx.set(requestRef.collection(ACTIVITY_SUBCOLLECTION).doc(), {
      type: COORDINATOR_ASSIGNED,
      coordinatorUid: target.uid,
      actor: userActor(user),
      at,
    })
    tx.set(lockRef, { lastAssignedRequestId: id, lastAssignedAt: at })
    addNotifications(tx, db, coordinatorAssignmentNotifications(request, user, { change: 'assigned', coordinator: target, at }))
    return { id, assigned: true, coordinator: { name: target.name ?? null } }
  })
}
