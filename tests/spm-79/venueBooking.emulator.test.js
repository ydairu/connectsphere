import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveVenueBooking, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../backend/src/services/statusTransitionService.js'
import { CONFIRM } from '../../shared/statusTransitions.js'
import { CONFIRMED } from '../../shared/status.js'
import { coordinator, fixture, input, now, staff, secondStaff } from '../spm-14/fixtures.js'

const projectId = 'demo-connectsphere-spm79'
const enabled = process.env.SPM79_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-79 Firestore transaction concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm79-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-79 test emulator')
    const memory = fixture(), batch = db.batch()
    memory.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false }
    for (const collection of ['users', 'venues', 'eventRequests']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })
  const hallInput = { ...input, startsAt: '2027-03-01T10:00:00Z', endsAt: '2027-03-01T11:00:00Z' }
  const roomInput = { ...input, venueId: 'room', attendeeCount: 30, startsAt: '2027-03-01T11:00:00Z', submissionKey: 'room' }

  it('commits separate holds and decisions for concurrent venue needs', async () => {
    const [hall, room] = await Promise.all([
      submitVenueBooking('event', hallInput, coordinator, db, now),
      submitVenueBooking('event', roomInput, coordinator, db, now),
    ])
    expect(hall.venueNeedId).not.toBe(room.venueNeedId)
    expect((await db.collection('venueAvailability').get()).size).toBe(2)
    const assignee = (booking) => booking.assignedVenueStaffName === staff.name ? staff : secondStaff
    const results = await Promise.allSettled([
      approveVenueBooking('event', hall.id, { action: 'approve' }, assignee(hall), db, now),
      approveVenueBooking('event', room.id, { action: 'approve' }, assignee(room), db, now),
    ])
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true)
    expect((await db.collection('venueAvailability').get()).docs.every((doc) => doc.data().status === 'confirmed_booking')).toBe(true)
  }, 60000)

  it('allows only one overlapping hold when two submissions race for one venue', async () => {
    const results = await Promise.allSettled([
      submitVenueBooking('event', hallInput, coordinator, db, now),
      submitVenueBooking('event', { ...hallInput, submissionKey: 'hall-competitor' }, coordinator, db, now),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await db.collection('venueAvailability').get()).size).toBe(1)
  }, 60000)

  it('serializes Confirm with a newly required venue', async () => {
    const hall = await submitVenueBooking('event', hallInput, coordinator, db, now)
    await approveVenueBooking('event', hall.id, { action: 'approve' }, staff, db, now)
    const results = await Promise.allSettled([
      transitionEventRequest('event', CONFIRM, coordinator, db, now),
      submitVenueBooking('event', roomInput, coordinator, db, now),
    ])
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    const bookings = (await db.collection('venueBookingRequests').where('eventRequestId', '==', 'event').get()).docs.map((doc) => doc.data())
    expect(!(event.status === CONFIRMED && bookings.some((booking) => booking.status === 'pending'))).toBe(true)
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true)
  }, 60000)
})
