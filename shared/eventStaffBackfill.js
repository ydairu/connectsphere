import { EVENT_STAFF_FIELDS, EVENT_STAFF_ROLES } from './eventStaffAssignment.js'
import { rolesOf } from './permissions.js'

export function eventStaffRecordTime(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  return Date.parse(value ?? '') || 0
}

const newestFirst = (left, right) => eventStaffRecordTime(right.createdAt) - eventStaffRecordTime(left.createdAt) ||
  right.id.localeCompare(left.id)

// Historical request ownership remains untouched. The newest current venue booking
// wins, even when other venue needs were assigned to different reviewers.
export function preferredLegacyStaff(event, users, bookings, equipmentRequests) {
  const byUid = new Map(users.map((user) => [user.uid, user]))
  const venueBookings = bookings.filter((booking) => !bookings.some((other) => other.replacesId === booking.id)).sort(newestFirst)
  const sources = {
    venue_staff: venueBookings.map((booking) => booking.assignedVenueStaffUid),
    technical_staff: [...equipmentRequests].sort(newestFirst).map((request) => request.assignedTechnicalStaffUid),
  }
  const preferredUids = {}
  const report = []
  for (const role of EVENT_STAFF_ROLES) {
    if (event[EVENT_STAFF_FIELDS[role]]) continue
    const candidates = sources[role].filter(Boolean)
    const eligible = (uid) => rolesOf(byUid.get(uid)).includes(role)
    const uid = candidates.find(eligible) ?? [...new Set(event.assignedStaffUids ?? [])].sort().find(eligible)
    if (uid) preferredUids[role] = uid
    if (candidates.length > 1 && new Set(candidates).size > 1) report.push(`${role}: conflicting historical reviewers; newest eligible request wins`)
    if (candidates.some((candidate) => !eligible(candidate))) report.push(`${role}: historical reviewer no longer holds this role`)
    if (!uid) report.push(`${role}: no eligible historical assignee; use current workload`)
  }
  return { preferredUids, report }
}
