import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { fixture, input, coordinator, staff, secondStaff, organiser } from '../fixtures.js'

let db, app
beforeEach(() => {
  db = fixture()
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => {
    if (!token.startsWith('test:')) throw new Error('Invalid token')
    return { uid: token.slice(5) }
  }, loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db })
})
const post = (body = input, user = coordinator, id = 'event') => request(app).post(`/api/requests/${id}/venue-bookings`).set('Authorization', `Bearer test:${user.uid}`).send(body)
const get = (path, user) => request(app).get(path).set('Authorization', `Bearer test:${user.uid}`)

describe('SPM-14 real HTTP routes with mocked identity and in-memory persistence', () => {
  it('authenticates every operation', async () => {
    expect((await request(app).post('/api/requests/event/venue-bookings').send(input)).status).toBe(401)
    expect((await request(app).get('/api/requests/event/venue-bookings')).status).toBe(401)
    expect((await request(app).get('/api/venues/booking-requests')).status).toBe(401)
  })
  it('creates, lists and displays full assigned-staff details without unrelated sections', async () => {
    const created = await post()
    expect(created.status).toBe(201)
    expect(created.body.booking.capacityWarning).toContain('exceeds')
    const listed = await get('/api/requests/event/venue-bookings', coordinator)
    expect(listed.body.canSubmit).toBe(true)
    const queue = await get('/api/venues/booking-requests', staff)
    expect(queue.status).toBe(200)
    expect(queue.body.bookings[0]).toMatchObject({ requirements: input.requirements, specialRequests: input.specialRequests, eventTitle: 'Conference' })
    const detail = await get('/api/requests/event/venue-bookings', staff)
    expect(detail.body.event.internal).toBeUndefined()
    expect(detail.body.event.equipment).toBeUndefined()
    expect((await get('/api/venues/booking-requests', secondStaff)).body.bookings).toEqual([])
    expect((await get('/api/requests/event/venue-bookings', secondStaff)).status).toBe(404)
    expect((await get('/api/venues/booking-requests', organiser)).status).toBe(403)
  })
  it('rejects forged values, forbidden actors, and unknown or unassigned events', async () => {
    expect((await post({ ...input, ownerUid: 'forged' })).status).toBe(400)
    expect((await post({ ...input, endsAt: input.startsAt })).status).toBe(400)
    expect((await post(input, organiser)).status).toBe(403)
    expect((await post(input, coordinator, 'other')).status).toBe(404)
    expect((await post(input, coordinator, 'missing')).status).toBe(404)
    expect(db.collectionData('venueAvailability').size).toBe(0)
  })
  it('returns private conflict details and preserves the original after a failed edit', async () => {
    const first = (await post()).body.booking
    await post({ ...input, venueId: 'room', submissionKey: 'room' })
    const failed = await post({ ...input, venueId: 'room', submissionKey: 'replace', replacesId: first.id })
    expect(failed.status).toBe(409)
    expect(failed.body.conflict.eventRequestId).toBeUndefined()
    expect(failed.body.conflict.id).toBeUndefined()
    expect(db.collectionData('venueAvailability').size).toBe(2)
  })
  it('checks reassignment again at submission rather than trusting a previously loaded form', async () => {
    expect((await get('/api/requests/event/venue-bookings', coordinator)).status).toBe(200)
    db.store.get('event').assignedCoordinatorUid = 'different'
    expect((await post()).status).toBe(404)
  })
})
