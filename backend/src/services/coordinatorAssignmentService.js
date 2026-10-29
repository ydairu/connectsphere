// Coordinator assignment — shared data access for SPM-26 (reassignment) and SPM-68 (Lead assignment).
//
// SPM-8 originally chose a Coordinator inside the submit transaction. SPM-68 (W7-CUST Change #5) removed that:
// a submitted request now waits in the Event Coordinator Lead's unassigned queue. What remains here is shared
// by every path that sets assignedCoordinatorUid: the Coordinator list, the workload counts and the lock.
//
// Concurrency: every assignment and reassignment reads and writes one lock document. Firestore retries a
// transaction when a document it read changes before it commits, so overlapping changes are serialised.

import { COORDINATOR, rolesOf } from '../../../shared/permissions.js'
import { ACTIVE_ASSIGNMENT_STATUSES, countActiveAssignments } from '../../../shared/coordinatorAssignment.js'

export const ASSIGNMENT_LOCK_PATH = ['systemLocks', 'coordinatorAssignment']
export const ACTIVITY_SUBCOLLECTION = 'activity'
// Recorded by SPM-68 with the Lead as actor. Entries written before SPM-68 carry SYSTEM_ACTOR (SPM-8).
export const COORDINATOR_ASSIGNED = 'coordinator_assigned'
export const SYSTEM_ACTOR = Object.freeze({ type: 'system', name: 'System' })

/**
 * Every user holding `role`, as { uid, name }: by `roles`, plus profiles written before the roles migration that
 * only carry the legacy `role` field. rolesOf() then decides, so a legacy `role` is ignored whenever `roles`
 * exists. Nothing else from the profile is returned.
 *
 * `read` runs a query: pass `(query) => tx.get(query)` inside a transaction (SPM-68 assignment, SPM-26
 * reassignment, SPM-85 submit); the default reads outside one (the candidate lists).
 */
export async function loadUsersWithRole(db, role, read = (query) => query.get()) {
  const users = db.collection('users')
  const [byRoles, byLegacyRole] = await Promise.all([
    read(users.where('roles', 'array-contains', role)),
    read(users.where('role', '==', role)),
  ])
  const holders = new Map()
  for (const doc of [...byRoles.docs, ...byLegacyRole.docs]) {
    const profile = doc.data()
    if (rolesOf(profile).includes(role)) holders.set(doc.id, { uid: doc.id, name: profile.name ?? null })
  }
  return [...holders.values()]
}

/** Every user holding the Event Coordinator role; see loadUsersWithRole(). */
export function loadCoordinators(db, read) {
  return loadUsersWithRole(db, COORDINATOR, read)
}

/**
 * Active assigned events per Coordinator, as a Map of uid → count (shared/coordinatorAssignment.js). Shown to the
 * Lead beside each Coordinator in the SPM-68 picker. `read` as for loadCoordinators().
 */
export async function loadActiveCounts(db, read = (query) => query.get()) {
  const snapshot = await read(db.collection('eventRequests').where('status', 'in', ACTIVE_ASSIGNMENT_STATUSES))
  return countActiveAssignments(snapshot.docs.map((doc) => doc.data()))
}
