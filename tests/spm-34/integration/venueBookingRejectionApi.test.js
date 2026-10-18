import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { BOOKINGS } from '../../../backend/src/services/venueBookingService.js'
import { fixture, input, coordinator, staff, secondStaff, organiser } from '../../spm-14/fixtures.js'

let db, app
beforeEach(() => {
  db = fixture()
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db })
})
const auth = (user) => ({ Authorization: `Bearer test:${user.uid}` })
const create = () => request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator)).send(input)
const decide = (id, user = staff, body = { action: 'reject', reason: 'Too small', suggestedAlternative: 'Try room' }, eventId = 'event') =>
  request(app).post(`/api/requests/${eventId}/venue-bookings/${id}/actions`).set(auth(user)).send(body)

describe('SPM-34 HTTP API with mocked token verification and in-memory persistence', () => {
  it('authenticates, validates and protects the assigned booking', async () => {
    const booking = (await create()).body.booking
    expect((await request(app).post(`/api/requests/event/venue-bookings/${booking.id}/actions`).send({ action: 'reject', reason: 'No' })).status).toBe(401)
    expect((await decide(booking.id, organiser)).status).toBe(403)
    expect((await decide(booking.id, secondStaff)).status).toBe(404)
    expect((await decide(booking.id, staff, undefined, 'other')).status).toBe(404)
    expect((await decide(booking.id, staff, { action: 'reject', reason: ' ' })).status).toBe(400)
    expect((await decide(booking.id, staff, { action: 'approve', reason: 'No' })).status).toBe(400)
    expect(db.collectionData(BOOKINGS).get(booking.id).status).toBe('pending')
  })
  it('returns the decision and hides it from the queue, while preserving Coordinator access', async () => {
    const booking = (await create()).body.booking
    const response = await decide(booking.id)
    expect(response.status).toBe(200)
    expect(response.body.booking).toMatchObject({ status: 'rejected', rejectionReason: 'Too small', suggestedAlternative: 'Try room' })
    expect((await request(app).get('/api/venues/booking-requests').set(auth(staff))).body.bookings).toEqual([])
    const details = await request(app).get('/api/requests/event/venue-bookings').set(auth(coordinator))
    expect(details.body.bookings[0]).toMatchObject({ id: booking.id, rejectionReason: 'Too small' })
    expect((await decide(booking.id)).status).toBe(409)
    expect(db.collectionData('notifications').size).toBe(1)
  })
})
