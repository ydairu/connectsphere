// A dedicated local demo project only. No live Firebase credentials or database are used.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveVenueBooking, rejectVenueBooking, submitVenueBooking, BOOKINGS } from '../../../backend/src/services/venueBookingService.js'
import { transitionEventRequest } from '../../../backend/src/services/statusTransitionService.js'
import { REJECT } from '../../../shared/statusTransitions.js'
import { fixture, coordinator, input, now, staff } from '../fixtures.js'

const projectId = 'demo-connectsphere-spm54'
const enabled = process.env.SPM54_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-54 real Firestore emulator concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm54-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-54 test emulator')
    const memory = fixture(), batch = db.batch()
    for (const collection of ['users', 'venues', 'eventRequests']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })
  const create = () => submitVenueBooking('event', input, coordinator, db, now)
  const approve = (id, at = now) => approveVenueBooking('event', id, { action: 'approve' }, staff, db, at)
  it('commits one approval and one notification for duplicate concurrent decisions', async () => {
    const booking = await create()
    const results = await Promise.allSettled([approve(booking.id), approve(booking.id)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected').reason.status).toBe(409)
    expect((await db.collection('notifications').get()).size).toBe(1)
    expect((await db.collection('venueAvailability').get()).docs[0].data().status).toBe('confirmed_booking')
  }, 60000)
  it('allows only one of approval and rejection to commit', async () => {
    const booking = await create()
    const results = await Promise.allSettled([approve(booking.id), rejectVenueBooking('event', booking.id, { action: 'reject', reason: 'Unavailable' }, staff, db, now)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await db.collection('notifications').get()).size).toBe(1)
    const saved = (await db.collection(BOOKINGS).doc(booking.id).get()).data()
    const commitment = (await db.collection('venueAvailability').doc(saved.holdId).get()).data()
    expect(saved.status === 'approved' ? commitment.status === 'confirmed_booking' : commitment.lifecycleStatus === 'removed').toBe(true)
  }, 60000)
  it('serializes expired-hold approval against acquisition of the same period', async () => {
    const booking = await create(), at = new Date(booking.holdExpiresAt)
    const results = await Promise.allSettled([
      approve(booking.id, at),
      submitVenueBooking('event', { ...input, submissionKey: 'competitor' }, coordinator, db, at),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const commitments = (await db.collection('venueAvailability').get()).docs.map((d) => d.data())
    expect(commitments.filter((c) => c.lifecycleStatus === 'active' && (c.status === 'confirmed_booking' || Date.parse(c.holdExpiresAt) > at.getTime()))).toHaveLength(1)
  }, 60000)
  it('never leaves a confirmed reservation after event rejection races approval', async () => {
    const booking = await create()
    const results = await Promise.allSettled([
      approve(booking.id), transitionEventRequest('event', REJECT, coordinator, db, now, { reason: 'Cannot proceed' }),
    ])
    expect(results[1].status).toBe('fulfilled')
    expect((await db.collection(BOOKINGS).doc(booking.id).get()).data().status).toBe('cancelled')
    expect((await db.collection('venueAvailability').get()).docs.every((d) => d.data().lifecycleStatus === 'removed')).toBe(true)
  }, 60000)
})
