import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { PREPARATION } from '../../../shared/status.js'
import { coordinator, fixture, input, organiser, staff, secondStaff } from '../../spm-14/fixtures.js'

let db, app, hall, room
const auth = (uid) => ({ Authorization: `Bearer test:${uid}` })
const bookings = (uid) => request(app).get('/api/requests/event/venue-bookings').set(auth(uid))
const edit = (id, uid, patch, eventId = 'event') => request(app)
  .patch(`/api/requests/${eventId}/venue-bookings/${id}/preparation`).set(auth(uid)).send(patch)
beforeEach(async () => {
  db = fixture()
  db.store.get('event').equipmentPreparation = { status: 'ready', notes: '' }
  db.store.get('event').registration = { enabled: true }
  db.collectionData('users').set('attendee', { uid: 'attendee', roles: ['attendee'] })
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db) })
  hall = (await request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator.uid)).send(input)).body.booking
  room = (await request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator.uid))
    .send({ ...input, venueId: 'room', submissionKey: 'room' })).body.booking
  for (const booking of [hall, room]) {
    const uid = db.collectionData('venueBookingRequests').get(booking.id).assignedVenueStaffUid
    await request(app).post(`/api/requests/event/venue-bookings/${booking.id}/actions`).set(auth(uid)).send({ action: 'approve' })
  }
  db.store.get('event').status = PREPARATION
})

describe('SPM-89 HTTP API with mocked token and in-memory Firestore', () => {
  it('updates one venue, reports aggregate readiness and records venue-named history atomically', async () => {
    const hallUid = db.collectionData('venueBookingRequests').get(hall.id).assignedVenueStaffUid
    const roomUid = db.collectionData('venueBookingRequests').get(room.id).assignedVenueStaffUid
    expect((await edit(hall.id, hallUid, { status: 'ready', notes: 'Hall set' })).status).toBe(200)
    expect(db.collectionData('venueBookingRequests').get(room.id).preparation).toBeUndefined()
    expect(db.store.get('event').equipmentPreparation.status).toBe('ready')
    expect((await request(app).get('/api/requests/event').set(auth(coordinator.uid))).body.eventPreparationReadiness.ready).toBe(false)
    expect((await edit(room.id, roomUid, { status: 'ready' })).status).toBe(200)
    const view = (await request(app).get('/api/requests/event').set(auth(coordinator.uid))).body
    expect(view.eventPreparationReadiness).toMatchObject({ ready: true, equipmentReady: true })
    expect(view.eventPreparationReadiness.venues).toHaveLength(2)
    const edited = await request(app).patch('/api/requests/event').set(auth(coordinator.uid))
      .send({ core: { description: 'Updated event details' } })
    expect(edited.status).toBe(200)
    expect(edited.body.eventPreparationReadiness).toMatchObject({ ready: true, equipmentReady: true })
    expect(edited.body.eventPreparationReadiness.venues).toHaveLength(2)
    const history = (await request(app).get('/api/requests/event/history').set(auth(coordinator.uid))).body.entries
    expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: hall.id, venueName: 'Hall',
      field: `venuePreparation.${hall.id}.status`, oldValue: 'not_started', newValue: 'ready' })]))
    expect(db.transactions.at(-1).committed).toBe(true)
  })
  it('enforces direct write scope, state and validation before any write', async () => {
    const uid = db.collectionData('venueBookingRequests').get(hall.id).assignedVenueStaffUid
    const prior = db.collectionData('eventRequests/event/activity').size
    expect((await edit(hall.id, uid, { status: 'ready' }, 'other')).status).toBe(404)
    expect((await edit(hall.id, organiser.uid, { status: 'ready' })).status).toBe(403)
    expect((await edit(hall.id, coordinator.uid, { status: 'ready' })).status).toBe(403)
    expect((await edit(hall.id, secondStaff.uid === uid ? staff.uid : secondStaff.uid, { status: 'ready' })).status).toBe(404)
    expect((await edit(hall.id, uid, { status: 'invalid' })).status).toBe(400)
    expect((await edit(hall.id, uid, { notes: 'x'.repeat(2001) })).status).toBe(400)
    db.store.get('event').status = 'planning'
    expect((await edit(hall.id, uid, { status: 'ready' })).status).toBe(409)
    expect(db.collectionData('eventRequests/event/activity').size).toBe(prior)
  })
  it('keeps preparation out of Organiser and Attendee responses and history', async () => {
    const uid = db.collectionData('venueBookingRequests').get(hall.id).assignedVenueStaffUid
    await edit(hall.id, uid, { status: 'ready' })
    expect((await bookings(organiser.uid)).body.bookings.every((item) => !Object.hasOwn(item, 'preparation'))).toBe(true)
    expect((await request(app).get('/api/requests/event').set(auth(organiser.uid))).body.eventPreparationReadiness).toBeNull()
    expect((await request(app).get('/api/requests/event/history').set(auth(organiser.uid))).body.entries
      .some((entry) => entry.field.startsWith('venuePreparation.'))).toBe(false)
    expect((await bookings('attendee')).status).toBe(404)
    expect((await request(app).get('/api/requests/event').set(auth('attendee'))).body.eventPreparationReadiness).toBeNull()
  })
})
