import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { BOOKINGS } from '../../../backend/src/services/venueBookingService.js'
import { CONFIRMED, PLANNING } from '../../../shared/status.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { fixture, input, coordinator, staff, secondStaff, organiser } from '../fixtures.js'

let db, app
beforeEach(() => {
  db = fixture()
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db) })
})
const auth = (user) => ({ Authorization: `Bearer test:${user.uid}` })
const create = () => request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator)).send(input)
const decide = (id, user = staff, body = { action: 'approve' }, eventId = 'event') =>
  request(app).post(`/api/requests/${eventId}/venue-bookings/${id}/actions`).set(auth(user)).send(body)

describe('SPM-54 real HTTP, mocked tokens and in-memory persistence', () => {
  it('authenticates, validates and enforces assignment even for direct calls', async () => {
    const booking = (await create()).body.booking
    expect((await request(app).post(`/api/requests/event/venue-bookings/${booking.id}/actions`).send({ action: 'approve' })).status).toBe(401)
    for (const actor of [organiser, coordinator]) expect((await decide(booking.id, actor)).status).toBe(403)
    expect((await decide(booking.id, secondStaff)).status).toBe(404)
    expect((await decide(booking.id, staff, undefined, 'other')).status).toBe(404)
    expect((await decide('missing')).status).toBe(404)
    for (const body of [{ action: 'unknown' }, {}, { action: 'approve', status: 'approved' }, { action: 'approve', ownerUid: 'x' }, { action: 'approve', reason: 'ignored' }]) {
      expect((await decide(booking.id, staff, body)).status).toBe(400)
    }
    expect(db.collectionData(BOOKINGS).get(booking.id).status).toBe('pending')
    expect(db.collectionData('notifications').size).toBe(0)
  })
  it('exposes server capabilities and approved state without leaking internal event fields', async () => {
    const booking = (await create()).body.booking
    const path = '/api/requests/event/venue-bookings'
    const before = (await request(app).get(path).set(auth(staff))).body
    expect(before.bookings[0]).toMatchObject({ canApprove: true, canReject: true })
    expect(before.event.internal).toBeUndefined()
    expect(before.event.equipment).toBeUndefined()
    expect((await request(app).get(path).set(auth(coordinator))).body.bookings[0].canApprove).toBe(false)
    const response = await decide(booking.id)
    expect(response.status).toBe(200)
    expect(response.body.booking).toMatchObject({ status: 'approved', canApprove: false, canReject: false })
    expect(response.body.booking.ownerUid).toBeUndefined()
    expect(response.body.booking.assignedVenueStaffUid).toBeUndefined()
    expect((await request(app).get('/api/venues/booking-requests').set(auth(staff))).body.bookings).toEqual([])
    expect((await request(app).get(path).set(auth(coordinator))).body.bookings[0].status).toBe('approved')
    expect((await decide(booking.id)).status).toBe(409)
    const notifications = await request(app).get('/api/notifications').set(auth(coordinator))
    expect(notifications.status).toBe(200)
    expect(JSON.stringify(notifications.body)).toContain(booking.id)
    expect(db.collectionData('notifications').size).toBe(1)
  })
  it('refuses wrong event status and current capacity failures as 409', async () => {
    const booking = (await create()).body.booking
    db.store.get('event').status = CONFIRMED
    expect((await decide(booking.id)).status).toBe(409)
    db.store.get('event').status = PLANNING
    db.store.get('event').core.expectedAttendees = 201
    expect((await decide(booking.id)).status).toBe(409)
    expect(db.collectionData(BOOKINGS).get(booking.id).status).toBe('pending')
  })
  it('keeps conflicting event details private', async () => {
    const booking = (await create()).body.booking
    db.collectionData('venueAvailability').set('secret-id', { venueId: 'hall', status: 'confirmed_booking',
      startsAt: input.startsAt, endsAt: input.endsAt, eventRequestId: 'secret-event', title: 'SECRET TITLE' })
    const response = await decide(booking.id)
    expect(response.status).toBe(409)
    expect(JSON.stringify(response.body)).not.toMatch(/secret-id|secret-event|SECRET TITLE/)
  })
  it.each([PLANNING, CONFIRMED])('preserves booking approval and the original reserved interval on a significant edit at %s', async (status) => {
    const booking = (await create()).body.booking
    expect((await decide(booking.id)).status).toBe(200)
    db.store.get('event').status = status
    const bookingBefore = structuredClone(db.collectionData(BOOKINGS).get(booking.id))
    const holdsBefore = structuredClone([...db.collectionData('venueAvailability')])
    const response = await request(app).patch('/api/requests/event').set(auth(coordinator)).send({ core: { preferredDateTime: '2027-03-02T10:00:00.000Z' } })
    expect(response.status).toBe(200)
    expect(db.store.get('event').status).toBe(PLANNING)
    expect(db.collectionData(BOOKINGS).get(booking.id)).toEqual(bookingBefore)
    expect([...db.collectionData('venueAvailability')]).toEqual(holdsBefore)
  })
})
