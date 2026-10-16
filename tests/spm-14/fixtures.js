import { createFakeFirestore } from '../../backend/src/testing/fakeFirestore.js'
import { COORDINATOR, VENUE_STAFF, ORGANISER } from '../../shared/permissions.js'
import { PLANNING } from '../../shared/status.js'

export const now = new Date('2026-10-16T00:00:00Z')
export const coordinator = { uid: 'c', roles: [COORDINATOR], name: 'Coordinator' }
export const staff = { uid: 'v1', roles: [VENUE_STAFF], name: 'Venue One' }
export const secondStaff = { uid: 'v2', roles: [VENUE_STAFF], name: 'Venue Two' }
export const organiser = { uid: 'o', roles: [ORGANISER], name: 'Owner' }
export const input = { venueId: 'hall', startsAt: '2027-03-01T10:00:00.000Z', endsAt: '2027-03-01T12:00:00.000Z', requirements: 'Theatre layout', specialRequests: 'Quiet room', submissionKey: 'attempt-1' }
export function fixture() {
  const event = { status: PLANNING, assignedCoordinatorUid: 'c', assignedStaffUids: [], ownerUid: 'o',
    core: { title: 'Conference', expectedAttendees: 100, preferredDateTime: '2027-03-01T10:00:00.000Z', durationHours: 2 },
    venue: { layoutPreference: 'Theatre' }, internal: { planningNotes: 'SECRET' }, equipment: { requirements: ['SECRET'] } }
  return createFakeFirestore({ users: { c: coordinator, v1: staff, v2: secondStaff, o: organiser },
    eventRequests: { event, other: { ...event, assignedCoordinatorUid: 'other-c' } },
    venues: { hall: { name: 'Hall', maximumCapacity: 50, setupMinutes: 30, turnaroundMinutes: 45 },
      room: { name: 'Room', maximumCapacity: 200, setupMinutes: 0, turnaroundMinutes: 0 } } })
}
