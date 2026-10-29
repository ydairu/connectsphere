// Coordinator assignment by the Event Coordinator Lead — SPM-68.
//
// Pure functions: no Firebase, no I/O. The backend applies an assignment inside a transaction
// (backend/src/services/coordinatorLeadAssignmentService.js); the frontend queue page is UX only.
//
// "Newly submitted event requests should no longer be assigned directly to an Event Coordinator. Instead, they
// first enter an unassigned queue that can be viewed by the Event Coordinator Lead. The Lead can review basic
// event information, assign a suitable Event Coordinator ..." — W7-CUST Change #5.
//
// Three separate questions, as in SPM-26's shared/coordinatorReassignment.js:
//   mayAssignFromQueue()        WHO: any Event Coordinator Lead (CL3 G8!C33 — more than one Lead).
//   assignmentStatusRefusal()   WHEN: the request is still submitted and unassigned.
//   assignmentTargetRefusal()   TO WHOM: an Event Coordinator who is neither the Lead (CL3 G8!C13) nor the
//                               submitter (SPM-8's rule, kept by SPM-26).

import { awaitingCoordinatorAssignment } from './coordinatorAssignment.js'
import { NOT_PERMITTED, TARGET_REQUIRED, reassignmentTargetRefusal } from './coordinatorReassignment.js'
import { COORDINATOR_LEAD, rolesOf } from './permissions.js'
import { DRAFT } from './status.js'

export { NOT_PERMITTED, TARGET_IS_OWNER, TARGET_NOT_COORDINATOR, TARGET_REQUIRED } from './coordinatorReassignment.js'

// Refusal reasons beside SPM-26's.
export const NOT_FOUND = 'not_found'
export const NOT_UNASSIGNED = 'not_unassigned'
export const TARGET_IS_SELF = 'target_is_self'

/** Does this user hold the Event Coordinator Lead role? Only Leads view the queue and assign (SPM-68 AC5). */
export function mayAssignFromQueue(user) {
  return rolesOf(user).includes(COORDINATOR_LEAD)
}

/**
 * Null when `request` may be assigned now, otherwise the refusal reason. A missing request or a draft is
 * NOT_FOUND, so a draft's existence is not revealed — "Drafts are strictly private until submitted"
 * (Clarification 2). Anything else that is not submitted-and-unassigned — assigned meanwhile by another Lead,
 * returned, approved — is NOT_UNASSIGNED.
 */
export function assignmentStatusRefusal(request) {
  if (!request || request.status === DRAFT) return NOT_FOUND
  if (!awaitingCoordinatorAssignment(request)) return NOT_UNASSIGNED
  return null
}

/**
 * Null when `targetUid` may be assigned `request` by `lead`, otherwise the refusal reason. The Lead never assigns
 * an event to themselves, even when they also hold the Coordinator role (CL3 G8!C13); otherwise SPM-26's rule
 * applies — the target holds the Coordinator role and is not the event's submitter.
 *
 * @param {string[]} coordinatorUids  every user holding the Event Coordinator role
 */
export function assignmentTargetRefusal({ request, targetUid, coordinatorUids, leadUid }) {
  if (typeof targetUid !== 'string' || targetUid.trim() === '') return TARGET_REQUIRED
  if (targetUid === leadUid) return TARGET_IS_SELF
  return reassignmentTargetRefusal({ request, targetUid, coordinatorUids })
}

function displayName(coordinator) {
  return typeof coordinator.name === 'string' && coordinator.name.trim() ? coordinator.name.trim() : coordinator.uid
}

/**
 * The Coordinators the Lead may choose for `request`, as [{ uid, name, activeEvents }] sorted by name.
 * `activeEvents` is the workload SPM-8 counts (countActiveAssignments); nothing is pre-selected or ranked —
 * [Team decision, SPM-68] the Lead chooses.
 *
 * @param {{ uid: string, name?: string }[]} coordinators
 * @param {Map<string, number>} activeCounts
 */
export function assignmentCandidates(coordinators, request, lead, activeCounts) {
  const uids = coordinators.map((coordinator) => coordinator.uid)
  return coordinators
    .filter((coordinator) => assignmentTargetRefusal({ request, targetUid: coordinator.uid, coordinatorUids: uids, leadUid: lead?.uid }) === null)
    .map((coordinator) => ({ uid: coordinator.uid, name: displayName(coordinator), activeEvents: activeCounts.get(coordinator.uid) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid))
}

/** When the request entered the queue: its submission time, or its creation time for records without one. */
export function queuedAt(request) {
  return request.submittedAt ?? request.createdAt ?? null
}

/**
 * One row of the unassigned queue: the basic event information the Lead reviews (SPM-68 AC3) and nothing else —
 * no owner uid, organisation id, description or internal fields.
 */
export function queueItem(request) {
  const core = request.core ?? {}
  return {
    id: request.id,
    title: core.title ?? null,
    preferredDateTime: core.preferredDateTime ?? null,
    durationHours: core.durationHours ?? null,
    expectedAttendees: core.expectedAttendees ?? null,
    organisationName: request.organisationName ?? null,
    submittedAt: queuedAt(request),
  }
}

// Compared as instants, not strings: seeded times carry +08:00 and submissions are written in UTC.
const queuedTime = (request) => Date.parse(queuedAt(request)) || 0

/** The queue: unassigned submitted requests only, oldest first (ties by id, so the order is stable). */
export function unassignedQueue(requests) {
  return requests
    .filter(awaitingCoordinatorAssignment)
    .sort((a, b) => queuedTime(a) - queuedTime(b) || a.id.localeCompare(b.id))
    .map(queueItem)
}
