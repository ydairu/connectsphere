// Coordinator selection — SPM-8 (initial assignment), reusable by SPM-26 (reassignment).
//
// Pure functions: no Firebase, no I/O. The backend loads coordinators and requests and applies the rule
// inside the submit transaction (backend/src/services/coordinatorAssignmentService.js).
//
// "A submitted event is automatically assigned to an Event Coordinator." "Strictly no more than one
// Coordinator is assigned to an event." — Clarification 1, Coordinator and Staff Assignment.
// "Round-robin or load-based assignment are acceptable examples." "Detailed assignment criteria beyond
// basic automatic assignment are a team choice." — Clarification 2, Coordinator Assignment.
// The load-based rule below is SPM-8's business rule: fewest active assigned events, random tie-break,
// never the submitter. It is pending ratification in effective-requirements.md §5.

import { CONFIRMED, PLANNING, PREPARATION, RETURNED, SUBMITTED, UNDER_REVIEW } from './status.js'

// Statuses that count towards a coordinator's workload. Draft, Completed, Cancelled and Rejected do not.
export const ACTIVE_ASSIGNMENT_STATUSES = Object.freeze([SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED, PREPARATION])

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
