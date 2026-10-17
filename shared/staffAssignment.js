// Choosing a staff member for new work — SPM-14 (Venue Staff, venue booking requests) and SPM-17
// (Technical Support Staff, equipment requests).
//
// [Team decision, 16 Oct 2026 — SPM-14] The member of the role with the fewest pending items is chosen;
// equal workloads rotate through stable uid order after the previous assignee. SPM-17 reuses the same rule
// for Technical Support Staff (team decision, 17 Oct 2026). The previous assignee is kept per role in its
// own lock document, read and written in the assigning transaction, so overlapping assignments of one role
// are serialised.

import { TECHNICAL_STAFF, VENUE_STAFF, rolesOf } from './permissions.js'

// systemLocks/{id} for each role's rotation. The Venue Staff document is the one SPM-14 already writes.
export const STAFF_ASSIGNMENT_LOCKS = Object.freeze({
  [VENUE_STAFF]: 'venueStaffAssignment',
  [TECHNICAL_STAFF]: 'technicalStaffAssignment',
})

/**
 * The user holding `role` with the fewest pending items, ties broken by the first uid after `lastUid`
 * (wrapping round), or null when nobody holds the role. `pendingAssigneeUids` has one uid per pending item.
 */
export function chooseStaff(users, role, pendingAssigneeUids, lastUid) {
  const eligible = users
    .filter((user) => rolesOf(user).includes(role))
    .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
  if (!eligible.length) return null
  const counts = new Map(eligible.map((user) => [user.uid, 0]))
  for (const uid of pendingAssigneeUids) if (counts.has(uid)) counts.set(uid, counts.get(uid) + 1)
  const minimum = Math.min(...counts.values())
  const tied = eligible.filter((user) => counts.get(user.uid) === minimum)
  return tied.find((user) => user.uid > (lastUid ?? '')) ?? tied[0]
}
