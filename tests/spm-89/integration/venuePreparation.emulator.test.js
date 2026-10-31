import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeApp, deleteApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { updateVenueBookingPreparation } from '../../../backend/src/services/venueBookingService.js'
import { PREPARATION, PLANNING } from '../../../shared/status.js'

const projectId = 'demo-connectsphere-spm89'
const enabled = process.env.SPM89_EMULATOR === '1' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8085'
describe.skipIf(!enabled)('SPM-89 Firestore booking and history transaction', () => {
  let app, db
  const user = { uid: 'staff', name: 'Venue Staff', roles: ['venue_staff'] }
  beforeEach(async () => {
    if (!app) { app = initializeApp({ projectId }, 'spm89-emulator'); db = getFirestore(app) }
    const response = await fetch(`http://127.0.0.1:8085/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Cannot reset SPM-89 test emulator')
    const batch = db.batch()
    batch.set(db.collection('eventRequests').doc('event'), { status: PREPARATION, equipmentPreparation: { status: 'ready' } })
    for (const [id, name] of [['hall', 'Hall'], ['room', 'Room']]) {
      batch.set(db.collection('venueBookingRequests').doc(id), { eventRequestId: 'event', venueNeedId: id,
        venueName: name, assignedVenueStaffUid: user.uid, status: 'approved' })
    }
    await batch.commit()
  })
  afterAll(async () => { if (app) await deleteApp(app) })

  it('writes only one booking and its venue-named field history together', async () => {
    await updateVenueBookingPreparation('event', 'hall', { status: 'ready', notes: 'Set' }, user, db)
    expect((await db.collection('venueBookingRequests').doc('hall').get()).data().preparation).toEqual({ status: 'ready', notes: 'Set' })
    expect((await db.collection('venueBookingRequests').doc('room').get()).data().preparation).toBeUndefined()
    const history = await db.collection('eventRequests').doc('event').collection('activity').get()
    expect(history.docs).toHaveLength(2)
    expect(history.docs.map((doc) => doc.data())).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'venuePreparation.hall.status', bookingId: 'hall', venueName: 'Hall' }),
      expect.objectContaining({ field: 'venuePreparation.hall.notes', bookingId: 'hall', venueName: 'Hall' }),
    ]))
  })

  it('a status change closes the write path without a partial booking or history write', async () => {
    await db.collection('eventRequests').doc('event').update({ status: PLANNING })
    await expect(updateVenueBookingPreparation('event', 'hall', { status: 'ready' }, user, db))
      .rejects.toMatchObject({ status: 409 })
    expect((await db.collection('venueBookingRequests').doc('hall').get()).data().preparation).toBeUndefined()
    expect((await db.collection('eventRequests').doc('event').collection('activity').get()).empty).toBe(true)
  })
})
