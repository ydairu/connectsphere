// SPM-71: one event owner for each staff role. Request-level assignees remain on their
// historical booking/equipment records; only the canonical event owner edits preparation.
import { TECHNICAL_STAFF, VENUE_STAFF, rolesOf } from './permissions.js'
import { CONFIRMED, PLANNING, PREPARATION } from './status.js'

export const EVENT_STAFF_ROLES = Object.freeze([VENUE_STAFF, TECHNICAL_STAFF])
export const EVENT_STAFF_FIELDS = Object.freeze({
  [VENUE_STAFF]: 'assignedVenueStaffUid',
  [TECHNICAL_STAFF]: 'assignedTechnicalStaffUid',
})
export const EVENT_STAFF_NAME_FIELDS = Object.freeze({
  [VENUE_STAFF]: 'assignedVenueStaffName',
  [TECHNICAL_STAFF]: 'assignedTechnicalStaffName',
})
export const EVENT_STAFF_LOCKS = Object.freeze({
  [VENUE_STAFF]: 'eventVenueStaffAssignment',
  [TECHNICAL_STAFF]: 'eventTechnicalStaffAssignment',
})
export const ACTIVE_EVENT_STAFF_STATUSES = Object.freeze([PLANNING, CONFIRMED, PREPARATION])

export function countActiveEventStaff(events, role) {
  const field = EVENT_STAFF_FIELDS[role]
  const counts = new Map()
  for (const event of events) {
    if (!ACTIVE_EVENT_STAFF_STATUSES.includes(event.status) || !event[field]) continue
    counts.set(event[field], (counts.get(event[field]) ?? 0) + 1)
  }
  return counts
}

// An unassigned user has the oldest possible assignment. A stable uid fallback covers
// pre-migration history, when no event-level assignment sequence was recorded.
export function chooseEventStaff(users, role, activeCounts, lastSequenceByUid = {}) {
  const eligible = users.filter((user) => rolesOf(user).includes(role) && user.uid)
  eligible.sort((a, b) => a.uid.localeCompare(b.uid))
  return eligible.reduce((best, candidate) => {
    if (!best) return candidate
    const candidateCount = activeCounts.get(candidate.uid) ?? 0
    const bestCount = activeCounts.get(best.uid) ?? 0
    if (candidateCount !== bestCount) return candidateCount < bestCount ? candidate : best
    const candidateSequence = lastSequenceByUid[candidate.uid] ?? -1
    const bestSequence = lastSequenceByUid[best.uid] ?? -1
    return candidateSequence < bestSequence ? candidate : best
  }, null)
}
