import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../backend/src/app.js'
import { createAuthenticate } from '../../backend/src/middleware/authenticate.js'
import { createFakeFirestoreEventRequestStore } from '../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { CONFIRMED, PLANNING } from '../../shared/status.js'
import { coordinator, fixture, input, organiser, secondStaff, staff } from '../spm-14/fixtures.js'

let db, app
beforeEach(() => {
  db = fixture()
  db.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false }
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db) })
})
const auth = (user) => ({ Authorization: `Bearer test:${user.uid}` })
const create = (changes = {}) => request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator)).send({ ...input, ...changes })
const action = (id, user, body, eventId = 'event') => request(app)
  .post(`/api/requests/${eventId}/venue-bookings/${id}/actions`).set(auth(user)).send(body)
const stored = (id) => db.collectionData('venueBookingRequests').get(id)
const hold = (id) => db.collectionData('venueAvailability').get(stored(id).holdId)

describe('SPM-81 booking actions over HTTP with in-memory persistence', () => {
  it('cancels only the named approved booking, exposes Coordinator capability and blocks Confirm', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    expect((await action(hall.id, staff, { action: 'approve' })).status).toBe(200)
    expect((await action(room.id, secondStaff, { action: 'approve' })).status).toBe(200)
    const roomBefore = structuredClone([stored(room.id), hold(room.id)])
    const list = await request(app).get('/api/requests/event/venue-bookings').set(auth(coordinator))
    expect(list.body.bookings.find((booking) => booking.id === hall.id).canCancel).toBe(true)
    expect((await request(app).get('/api/requests/event/venue-bookings').set(auth(staff))).body.bookings[0].canCancel).toBe(false)
    const result = await action(hall.id, coordinator, { action: 'cancel' })
    expect(result.status).toBe(200)
    expect(result.body.booking).toMatchObject({ status: 'cancelled', canCancel: false })
    expect(result.body.booking.cancelledByUid).toBeUndefined()
    expect([stored(room.id), hold(room.id)]).toEqual(roomBefore)
    expect(hold(hall.id).lifecycleStatus).toBe('removed')
    expect(db.store.get('event').status).toBe(PLANNING)
    const event = await request(app).get('/api/requests/event').set(auth(coordinator))
    expect(event.body.availableActions).not.toContain('confirm')
    expect((await request(app).post('/api/event-requests/event/transitions').set(auth(coordinator)).send({ action: 'confirm' })).status).toBe(409)
    expect((await action(hall.id, coordinator, { action: 'cancel' })).status).toBe(409)
  })

  it('returns Confirmed to Planning and refuses wrong actors, event, or payload', async () => {
    const hall = (await create()).body.booking
    expect((await action(hall.id, staff, { action: 'approve' })).status).toBe(200)
    db.store.get('event').status = CONFIRMED
    db.collectionData('users').set('other-c', { ...coordinator, uid: 'other-c' })
    const before = structuredClone([stored(hall.id), hold(hall.id)])
    expect((await action(hall.id, staff, { action: 'cancel' })).status).toBe(403)
    expect((await action(hall.id, organiser, { action: 'cancel' })).status).toBe(403)
    expect((await action(hall.id, { ...coordinator, uid: 'other-c' }, { action: 'cancel' })).status).toBe(404)
    expect((await action(hall.id, coordinator, { action: 'cancel' }, 'other')).status).toBe(404)
    for (const payload of [{ action: 'cancel', status: 'cancelled' }, { action: 'toString' }, {}]) {
      expect((await action(hall.id, coordinator, payload)).status).toBe(400)
    }
    expect([stored(hall.id), hold(hall.id)]).toEqual(before)
    expect((await action(hall.id, coordinator, { action: 'cancel' })).status).toBe(200)
    expect(db.store.get('event').status).toBe(PLANNING)
    expect([...db.collectionData('eventRequests/event/activity').values()]).toContainEqual(expect.objectContaining({
      type: 'status_changed', action: 'venue_booking_cancelled', fromStatus: CONFIRMED, toStatus: PLANNING,
    }))
  })
})
