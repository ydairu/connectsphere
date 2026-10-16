// Explicit local emulator only: never uses the .env Firebase project or credentials.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { submitVenueBooking, BOOKINGS } from '../../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { REJECT } from '../../../shared/statusTransitions.js'
import { fixture, coordinator, input, now } from '../fixtures.js'

const enabled = process.env.SPM14_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-14 real Firestore emulator concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId: 'demo-connectsphere-bookings' }, 'spm14-emulator'); db = getFirestore(app) }
    const response = await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-connectsphere-bookings/databases/(default)/documents', { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset booking test emulator')
    const memory = fixture()
    const batch = db.batch()
    for (const collection of ['users', 'venues', 'eventRequests']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })
  it('only one competing request acquires a hold; no orphan request or assignment', async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => submitVenueBooking('event', { ...input, submissionKey: `competing-${i}` }, coordinator, db, now)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected').every((r) => r.reason.name === 'VenueConflictError')).toBe(true)
    expect((await db.collection(BOOKINGS).get()).size).toBe(1)
    expect((await db.collection('venueAvailability').get()).size).toBe(1)
  }, 60000)
  it('simultaneous non-conflicting submissions balance workload', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => submitVenueBooking('event', {
      ...input, submissionKey: `balanced-${i}`, startsAt: `2027-03-0${i + 1}T10:00:00Z`, endsAt: `2027-03-0${i + 1}T12:00:00Z`,
    }, coordinator, db, now)))
    expect(results.filter((r) => r.assignedVenueStaffName === 'Venue One')).toHaveLength(2)
    expect(results.filter((r) => r.assignedVenueStaffName === 'Venue Two')).toHaveLength(2)
  }, 60000)
  it('rejection racing submission never leaves an active hold on a rejected event', async () => {
    const results = await Promise.allSettled([
      submitVenueBooking('event', input, coordinator, db, now),
      transitionEventRequest('event', REJECT, coordinator, db, now, { reason: 'Cannot proceed' }),
    ])
    expect(results[1].status).toBe('fulfilled')
    const holds = (await db.collection('venueAvailability').get()).docs.map((d) => d.data())
    expect(holds.filter((h) => h.lifecycleStatus === 'active')).toHaveLength(0)
  }, 60000)
  it('failed replacement keeps the original hold and request in the actual database', async () => {
    const first = await submitVenueBooking('event', input, coordinator, db, now)
    await submitVenueBooking('event', { ...input, venueId: 'room', submissionKey: 'room' }, coordinator, db, now)
    await expect(submitVenueBooking('event', { ...input, venueId: 'room', submissionKey: 'replace', replacesId: first.id }, coordinator, db, now)).rejects.toMatchObject({ name: 'VenueConflictError' })
    expect((await db.collection(BOOKINGS).doc(first.id).get()).data().status).toBe('pending')
    expect((await db.collection('venueAvailability').get()).docs.filter((d) => d.data().lifecycleStatus === 'active')).toHaveLength(2)
  }, 60000)
})
