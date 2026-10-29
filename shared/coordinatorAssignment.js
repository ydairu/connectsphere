// Coordinator selection and workload — SPM-8, reused by SPM-26 (reassignment) and SPM-68 (Lead assignment).
//
// Pure functions: no Firebase, no I/O.
//
// SPM-68 (W7-CUST Change #5): "Newly submitted event requests should no longer be assigned directly to an
// Event Coordinator. Instead, they first enter an unassigned queue that can be viewed by the Event Coordinator
// Lead." Submission therefore no longer runs selectCoordinator(); the Lead chooses, and the picker shows each
// Coordinator's active workload from countActiveAssignments(). selectCoordinator() is kept as SPM-8's
// documented rule — whether the Lead is offered it as a suggestion is an open customer gap
// (effective-requirements.md §4.5, G8!B12).

import { CONFIRMED, PLANNING, PREPARATION, RETURNED, SUBMITTED, UNDER_REVIEW } from './status.js'

/**
 * Is this request in the Event Coordinator Lead's unassigned queue? Submitted and no Coordinator — the field
 * null or absent (SPM-68 [Team decision]: "unassigned" is derived, not a status). A returned request that is
 * resubmitted keeps its Coordinator (CL3 G8!C15), so it is never in the queue.
 */
export function awaitingCoordinatorAssignment(request) {
  return request?.status === SUBMITTED && !request.assignedCoordinatorUid
}

// Statuses that count towards a coordinator's workload. Draft, Completed, Cancelled and Rejected do not.
export const ACTIVE_ASSIGNMENT_STATUSES = Object.freeze([SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED, PREPARATION])

/**
 * SPM-69: is this event attributed to `lead`? The Lead who last assigned or reassigned it (`assignedByUid`), or —
 * [Team decision, 29 Oct 2026, pending PO confirmation] — nobody, for an event assigned before SPM-68, which any
 * Lead may take over (CL3 G8!C38: the Lead may reassign existing assignments). Status is not considered here.
 */
export function attributedToLead(lead, request) {
  return request != null && (!request.assignedByUid || request.assignedByUid === lead?.uid)
}

/**
 * SPM-69: is this an active assigned event under `lead`'s supervision? "The unassigned queue plus the active
 * events that that Lead themselves previously assigned" (CL3 G8!C41), and events no Lead assigned
 * (attributedToLead). Finished events leave the Lead's view.
 */
export function supervisedByLead(lead, request) {
  return ACTIVE_ASSIGNMENT_STATUSES.includes(request?.status) && Boolean(request.assignedCoordinatorUid) && attributedToLead(lead, request)
}

/**
 * Active assigned events per coordinator, as a Map of uid → count. Requests at other statuses, or with no
 * coordinator, are ignored. Coordinators with no active events are simply absent (count 0).
 */
export function countActiveAssignments(requests) {
  const counts = new Map()
  for (const request of requests) {
    const uid = request.assignedCoordinatorUid
    if (uid == null || !ACTIVE_ASSIGNMENT_STATUSES.includes(request.status)) continue
    counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }
  return counts
}

/**
 * The coordinator to assign: the eligible coordinator with the fewest active assigned events, with ties
 * broken by `random`. Returns null when nobody is eligible.
 *
 * @param {object} options
 * @param {string[]} options.coordinatorUids  every user holding the Event Coordinator role
 * @param {Map<string, number>} options.activeCounts  from countActiveAssignments()
 * @param {string} [options.excludeUid]  the submitter — a user who is also a coordinator is never
 *   assigned to their own request
 * @param {() => number} [options.random]  returns [0, 1); inject a seeded generator for deterministic tests
 */
export function selectCoordinator({ coordinatorUids, activeCounts, excludeUid, random = Math.random }) {
  const eligible = [...new Set(coordinatorUids)].filter((uid) => uid !== excludeUid)
  if (eligible.length === 0) return null

  const countOf = (uid) => activeCounts.get(uid) ?? 0
  const lowest = Math.min(...eligible.map(countOf))
  // Sorted so the same random value always picks the same coordinator, whatever order the query returned.
  const tied = eligible.filter((uid) => countOf(uid) === lowest).sort()

  const index = Math.min(Math.floor(random() * tied.length), tied.length - 1)
  return tied[index]
}
