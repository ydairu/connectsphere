import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveVenueBooking, cancelVenueBooking, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { setPrimaryVenue } from '../../backend/src/services/primaryVenueService.js'
import { transitionEventRequest } from '../../backend/src/services/statusTransitionService.js'
import { CONFIRM } from '../../shared/statusTransitions.js'
import { PLANNING } from '../../shared/status.js'
import { SAFETY_APPROVED } from '../../shared/safetyReview.js'
import { coordinator, fixture, input, now, staff, secondStaff } from '../spm-14/fixtures.js'

const projectId = 'demo-connectsphere-spm90'
const enabled = process.env.SPM90_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-90 Firestore transaction races', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm90-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-90 test emulator')
    const memory = fixture(), batch = db.batch()
    memory.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false }
    for (const collection of ['users', 'venues', 'eventRequests']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })
  const submit = (changes = {}) => submitVenueBooking('event', { ...input, ...changes }, coordinator, db, now)
  const approve = (booking) => approveVenueBooking('event', booking.id, { action: 'approve' },
    booking.assignedVenueStaffName === staff.name ? staff : secondStaff, db, now)
  const pair = async () => {
    const hall = await submit()
    const room = await submit({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })
    await approve(hall)
    await approve(room)
    return [hall, room]
  }

  it('selects the sole approved venue with its location in the confirmation transaction', async () => {
    const hall = await submit()
    await approve(hall)
    await db.collection('eventRequests').doc('event').update({ safetyReview: { status: SAFETY_APPROVED } })
    const result = await transitionEventRequest('event', CONFIRM, coordinator, db, now)
    expect(result.status).toBe('confirmed')
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    expect(event.primaryVenue).toMatchObject({ bookingId: hall.id, location: 'Level 1, Main Campus' })
    const history = await db.collection('eventRequests').doc('event').collection('activity').where('type', '==', 'field_changed').get()
    expect(history.docs.filter((doc) => doc.data().field === 'primaryVenue')).toHaveLength(1)
  }, 60000)

  it('accepts one of two simultaneous choices based on the same previous value', async () => {
    const [hall, room] = await pair()
    const choose = (booking) => setPrimaryVenue('event', { bookingId: booking.id, expectedPrimaryVenueBookingId: null }, coordinator, db, now)
    const results = await Promise.allSettled([choose(hall), choose(room)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    expect([hall.id, room.id]).toContain(event.primaryVenue.bookingId)
    const history = await db.collection('eventRequests').doc('event').collection('activity').where('type', '==', 'field_changed').get()
    expect(history.docs.filter((doc) => doc.data().field === 'primaryVenue')).toHaveLength(1)
  }, 60000)

  it('never leaves a cancelled booking as primary when cancellation races confirmation', async () => {
    const [hall] = await pair()
    await setPrimaryVenue('event', { bookingId: hall.id, expectedPrimaryVenueBookingId: null }, coordinator, db, now)
    await Promise.allSettled([
      cancelVenueBooking('event', hall.id, { action: 'cancel' }, coordinator, db, now),
      transitionEventRequest('event', CONFIRM, coordinator, db, now),
    ])
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    expect(event.status).toBe(PLANNING)
    expect(event.primaryVenue).toBeNull()
    expect(event.primaryVenueSelectionRequired).toBe(true)
  }, 60000)

  it('serialises a primary switch against cancellation of the previous booking', async () => {
    const [hall, room] = await pair()
    await setPrimaryVenue('event', { bookingId: hall.id, expectedPrimaryVenueBookingId: null }, coordinator, db, now)
    const results = await Promise.allSettled([
      setPrimaryVenue('event', { bookingId: room.id, expectedPrimaryVenueBookingId: hall.id }, coordinator, db, now),
      cancelVenueBooking('event', hall.id, { action: 'cancel' }, coordinator, db, now),
    ])
    expect(results[1].status).toBe('fulfilled')
    const event = (await db.collection('eventRequests').doc('event').get()).data()
    expect([null, room.id]).toContain(event.primaryVenue?.bookingId ?? null)
    expect(event.primaryVenue?.bookingId).not.toBe(hall.id)
    if (results[0].status === 'rejected') expect(event.primaryVenueSelectionRequired).toBe(true)
  }, 60000)
})
