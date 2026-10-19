import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { approveVenueBooking, submitVenueBooking } from '../../backend/src/services/venueBookingService.js'
import { processVenueHolds, HOLD_WARNING_LEAD_MS } from '../../backend/src/services/venueHoldExpiryService.js'
import { TENTATIVE_HOLD_DURATION_MS } from '../../shared/venueAvailability.js'
import { coordinator, fixture, input, now, staff } from '../spm-14/fixtures.js'

const projectId = 'demo-connectsphere-spm78'
const enabled = process.env.SPM78_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-78 real Firestore emulator concurrency', () => {
  let app, db
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm78-emulator'); db = getFirestore(app) }
    const reset = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!reset.ok) throw new Error('Cannot reset SPM-78 test emulator')
    const memory = fixture(), batch = db.batch()
    for (const collection of ['users', 'venues', 'eventRequests']) {
      for (const [id, value] of memory.collectionData(collection)) batch.set(db.collection(collection).doc(id), value)
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })
  const create = () => submitVenueBooking('event', { ...input, venueId: 'room' }, coordinator, db, now)

  it('writes one warning and one expiry after overlapping hourly runs', async () => {
    const booking = await create()
    const warningTime = new Date(now.getTime() + TENTATIVE_HOLD_DURATION_MS - HOLD_WARNING_LEAD_MS)
    const warnings = await Promise.all([processVenueHolds(db, warningTime), processVenueHolds(db, warningTime)])
    expect(warnings.reduce((total, result) => total + result.warned, 0)).toBe(1)
    expect((await db.collection('notifications').get()).size).toBe(1)
    const deadline = new Date(booking.holdExpiresAt)
    const expiries = await Promise.all([processVenueHolds(db, deadline), processVenueHolds(db, deadline)])
    expect(expiries.reduce((total, result) => total + result.expired, 0)).toBe(1)
    expect((await db.collection('notifications').get()).size).toBe(2)
    expect((await db.collection('venueBookingRequests').doc(booking.id).get()).data().status).toBe('expired')
    expect((await db.collection('venueAvailability').get()).docs[0].data().lifecycleStatus).toBe('removed')
  }, 60000)

  it('never confirms an expired hold while the expiry task runs', async () => {
    const booking = await create(), deadline = new Date(booking.holdExpiresAt)
    const [approval, expiry] = await Promise.allSettled([
      approveVenueBooking('event', booking.id, { action: 'approve' }, staff, db, deadline),
      processVenueHolds(db, deadline),
    ])
    expect(approval.status).toBe('rejected')
    expect(approval.reason.status).toBe(409)
    expect(expiry.status).toBe('fulfilled')
    expect((await db.collection('venueBookingRequests').doc(booking.id).get()).data().status).toBe('expired')
    expect((await db.collection('eventRequests').doc('event').get()).data().status).toBe('planning')
  }, 60000)
})
