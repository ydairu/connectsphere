// SPM-8 — automatic Event Coordinator assignment, run inside the submit transaction.
//
// The selection rule lives in shared/coordinatorAssignment.js; this file loads its inputs from Firestore
// and records the result. SPM-26 (reassignment) is expected to reuse both.
//
// Concurrency: every assignment reads and writes one lock document. Firestore retries a transaction when
// a document it read changes before it commits, so two submissions that overlap are serialised and the
// second always counts the first one's assignment. Status changes elsewhere only lower a count, so they
// do not need the lock.

import { COORDINATOR, rolesOf } from '../../../shared/permissions.js'
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  countActiveAssignments,
  selectCoordinator,
} from '../../../shared/coordinatorAssignment.js'

export const ASSIGNMENT_LOCK_PATH = ['systemLocks', 'coordinatorAssignment']
export const ACTIVITY_SUBCOLLECTION = 'activity'
export const COORDINATOR_ASSIGNED = 'coordinator_assigned'
export const SYSTEM_ACTOR = Object.freeze({ type: 'system', name: 'System' })

export class NoEligibleCoordinatorError extends Error {
  constructor() {
    super('No eligible coordinator available')
    this.name = 'NoEligibleCoordinatorError'
  }
}

/**
 * Every user holding the Event Coordinator role, as { uid, name }: by `roles`, plus profiles written before
 * the roles migration that only carry the legacy `role` field. rolesOf() then decides, so a legacy `role`
 * is ignored whenever `roles` exists. Nothing else from the profile is returned.
 *
 * `read` runs a query: pass `(query) => tx.get(query)` inside a transaction (SPM-8 assignment, SPM-26
 * reassignment); the default reads outside one (SPM-26's candidate list).
 */
export async function loadCoordinators(db, read = (query) => query.get()) {
  const users = db.collection('users')
  const [byRoles, byLegacyRole] = await Promise.all([
    read(users.where('roles', 'array-contains', COORDINATOR)),
    read(users.where('role', '==', COORDINATOR)),
  ])
  const coordinators = new Map()
  for (const doc of [...byRoles.docs, ...byLegacyRole.docs]) {
    const profile = doc.data()
    if (rolesOf(profile).includes(COORDINATOR)) coordinators.set(doc.id, { uid: doc.id, name: profile.name ?? null })
  }
  return [...coordinators.values()]
}

async function loadCoordinatorUids(tx, db) {
  return (await loadCoordinators(db, (query) => tx.get(query))).map((coordinator) => coordinator.uid)
}

async function loadActiveCounts(tx, db) {
  const snapshot = await tx.get(db.collection('eventRequests').where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES))
  return countActiveAssignments(snapshot.docs.map((doc) => doc.data()))
}

/**
 * Chooses the Event Coordinator for a request being submitted, within `tx`, and returns their uid for the
 * caller to write onto the request.
 *
 * A request that already has a coordinator keeps them and nothing is written — a returned request that is
 * resubmitted is not reassigned. Otherwise the lock is taken, the coordinator is selected, and an activity
 * entry is recorded with "System" as the actor. Throws NoEligibleCoordinatorError, which aborts the
 * transaction, when nobody is eligible.
 *
 * Performs all of its reads before any write, as Firestore transactions require; the caller must do its
 * own reads first and its writes afterwards.
 */
export async function assignCoordinatorInTransaction(tx, db, { requestRef, request, now = new Date(), random = Math.random }) {
  if (request.assignedCoordinatorUid) return request.assignedCoordinatorUid

  const lockRef = db.collection(ASSIGNMENT_LOCK_PATH[0]).doc(ASSIGNMENT_LOCK_PATH[1])
  await tx.get(lockRef)
  const [coordinatorUids, activeCounts] = await Promise.all([loadCoordinatorUids(tx, db), loadActiveCounts(tx, db)])

  const coordinatorUid = selectCoordinator({ coordinatorUids, activeCounts, excludeUid: request.ownerUid, random })
  if (!coordinatorUid) throw new NoEligibleCoordinatorError()

  const at = now.toISOString()
  tx.set(requestRef.collection(ACTIVITY_SUBCOLLECTION).doc(), {
    type: COORDINATOR_ASSIGNED,
    coordinatorUid,
    actor: SYSTEM_ACTOR,
    at,
  })
  tx.set(lockRef, { lastAssignedRequestId: requestRef.id, lastAssignedAt: at })

  return coordinatorUid
}
