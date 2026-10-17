// SPM-17 — users, events and equipment types for the in-memory Firestore double.

import { createFakeFirestore } from '../../backend/src/testing/fakeFirestore.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../shared/permissions.js'
import { PLANNING } from '../../shared/status.js'

export const now = new Date('2026-10-17T00:00:00.000Z')
export const coordinator = { uid: 'c', roles: [COORDINATOR], name: 'Coordinator' }
export const otherCoordinator = { uid: 'c2', roles: [COORDINATOR], name: 'Other Coordinator' }
export const tech = { uid: 't1', roles: [TECHNICAL_STAFF], name: 'Tech One' }
export const secondTech = { uid: 't2', roles: [TECHNICAL_STAFF], name: 'Tech Two' }
export const venueStaff = { uid: 'v1', roles: [VENUE_STAFF], name: 'Venue One' }
export const dualStaff = { uid: 'd1', roles: [VENUE_STAFF, TECHNICAL_STAFF], name: 'Dual One' }
export const organiser = { uid: 'o', roles: [ORGANISER], name: 'Owner' }
export const attendee = { uid: 'a', roles: [ATTENDEE], name: 'Attendee' }

export const event = Object.freeze({
  status: PLANNING,
  assignedCoordinatorUid: 'c',
  assignedStaffUids: [],
  ownerUid: 'o',
  core: { title: 'Conference', expectedAttendees: 100, preferredDateTime: '2027-03-01T10:00:00.000Z', durationHours: 2 },
  venue: { layoutPreference: 'Theatre' },
  equipment: { requirements: ['projector'], technicalSupportNeeded: true },
  internal: { planningNotes: 'SECRET' },
})

export const input = Object.freeze({
  items: [
    { equipmentTypeId: 'projector', quantity: 2, technicalRequirements: 'HDMI to the lectern' },
    { equipmentTypeId: 'mic', quantity: 4 },
  ],
  submissionKey: 'attempt-1',
})

export function fixture({ users = [coordinator, otherCoordinator, tech, secondTech, venueStaff, organiser, attendee], eventOverrides = {} } = {}) {
  return createFakeFirestore({
    users: Object.fromEntries(users.map(({ uid, ...profile }) => [uid, profile])),
    eventRequests: {
      event: structuredClone({ ...event, ...eventOverrides }),
      other: structuredClone({ ...event, assignedCoordinatorUid: 'c2' }),
    },
    equipmentTypes: {
      projector: { name: 'Projector', location: 'Store A' },
      mic: { name: 'Wireless microphone', location: null },
    },
  })
}
