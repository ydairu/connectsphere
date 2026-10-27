import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveVenueBooking, cancelVenueBooking, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../backend/src/services/statusTransitionService.js'
import { setPrimaryVenue } from '../../backend/src/services/primaryVenueService.js'
import { CONFIRM } from '../../shared/statusTransitions.js'
import { CONFIRMED, PLANNING } from '../../shared/status.js'
import { coordinator, fixture, input, now, staff, secondStaff } from '../spm-14/fixtures.js'

const projectId = 'demo-connectsphere-spm81'
const enabled = process.env.SPM81_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-81 Firestore transaction concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm81-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-81 test emulator')
    const memory = fixture(), batch = db.batch()
    memory.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false }
    for (const collection of ['users', 'venues', 'eventRequests']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })
  const submit = (changes = {}) => submitVenueBooking('event', { ...input, ...changes }, coordinator, db, now)
  const actor = (booking) => booking.assignedVenueStaffName === staff.name ? staff : secondStaff
  const approve = (booking) => approveVenueBooking('event', booking.id, { action: 'approve' }, actor(booking), db, now)

  it('serialises individual cancellation with Confirm', async () => {
    const hall = await submit()
    const room = await submit({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })
    await approve(hall)
    await approve(room)
    await setPrimaryVenue('event', { bookingId: room.id, expectedPrimaryVenueBookingId: null }, coordinator, db, now)
    const results = await Promise.allSettled([
      cancelVenueBooking('event', hall.id, { action: 'cancel' }, coordinator, db, now),
      transitionEventRequest('event', CONFIRM, coordinator, db, now),
    ])
    expect(results[0].status).toBe('fulfilled')
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    const hallRecord = (await db.collection('venueBookingRequests').doc(hall.id).get()).data()
    const roomRecord = (await db.collection('venueBookingRequests').doc(room.id).get()).data()
    const hallHold = (await db.collection('venueAvailability').doc(hallRecord.holdId).get()).data()
    const roomHold = (await db.collection('venueAvailability').doc(roomRecord.holdId).get()).data()
    expect(event.status).toBe(PLANNING)
    expect(event.status === CONFIRMED && hallRecord.status === 'cancelled').toBe(false)
    expect(hallHold.lifecycleStatus).toBe('removed')
    expect(roomRecord.status).toBe('approved')
    expect(roomHold.lifecycleStatus).toBe('active')
  }, 60000)

  it('releases only the selected venue when a new request races cancellation', async () => {
    const hall = await submit()
    const room = await submit({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })
    await approve(hall)
    await approve(room)
    const results = await Promise.allSettled([
      cancelVenueBooking('event', hall.id, { action: 'cancel' }, coordinator, db, now),
      submit({ submissionKey: 'competing-hall' }),
    ])
    expect(results[0].status).toBe('fulfilled')
    const hallCommitments = (await db.collection('venueAvailability').where('venueId', '==', 'hall').get()).docs.map((doc) => doc.data())
    expect(hallCommitments.filter((hold) => hold.lifecycleStatus === 'active')).toHaveLength(results[1].status === 'fulfilled' ? 1 : 0)
    const roomRecord = (await db.collection('venueBookingRequests').doc(room.id).get()).data()
    expect((await db.collection('venueAvailability').doc(roomRecord.holdId).get()).data().lifecycleStatus).toBe('active')
  }, 60000)
})
