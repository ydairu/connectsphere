import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../backend/src/app.js'
import { createAuthenticate } from '../../backend/src/middleware/authenticate.js'
import { createFakeFirestoreEventRequestStore } from '../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { CONFIRMED } from '../../shared/status.js'
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
const action = (id, user, name) => request(app).post(`/api/requests/event/venue-bookings/${id}/actions`).set(auth(user)).send({ action: name })
const list = (user, eventId = 'event') => request(app).get(`/api/requests/${eventId}/venue-bookings`).set(auth(user))

describe('SPM-77 booking API', () => {
  it('returns an empty booking list for an in-scope Organiser before any request exists', async () => {
    const response = await list(organiser)
    expect(response.status).toBe(200)
    expect(response.body.bookings).toEqual([])
    expect(response.body.canSubmit).toBe(false)
  })

  it('gives in-scope Organisers customer-facing bookings only and denies unrelated records', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    expect((await action(hall.id, staff, 'approve')).status).toBe(200)
    expect((await action(room.id, secondStaff, 'approve')).status).toBe(200)
    const response = await list(organiser)
    expect(response.status).toBe(200)
    expect(response.body.bookings).toHaveLength(2)
    expect(response.body.bookings.find((booking) => booking.id === hall.id)).toEqual(expect.objectContaining({
      venueName: 'Hall', status: 'approved', venueNeedId: hall.id,
    }))
    for (const booking of response.body.bookings) {
      expect(booking).not.toHaveProperty('assignedVenueStaffName')
      expect(booking).not.toHaveProperty('requirements')
      expect(booking).not.toHaveProperty('specialRequests')
      expect(booking).not.toHaveProperty('approvalWarnings')
      expect(booking).not.toHaveProperty('canCancel')
    }
    expect(response.body.event.internal).toBeUndefined()
    expect((await action(hall.id, organiser, 'cancel')).status).toBe(403)
    const stranger = { ...organiser, uid: 'stranger' }
    db.collectionData('users').set('stranger', stranger)
    expect((await list(stranger)).status).toBe(404)
    db.store.get('other').ownerUid = 'someone-else'
    expect((await list(organiser, 'other')).status).toBe(404)
  })

  it('keeps the sibling booking and reservation intact through cancellation and replacement', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    expect((await action(hall.id, staff, 'approve')).status).toBe(200)
    expect((await action(room.id, secondStaff, 'approve')).status).toBe(200)
    const siblingBefore = structuredClone([db.collectionData('venueBookingRequests').get(room.id),
      db.collectionData('venueAvailability').get(db.collectionData('venueBookingRequests').get(room.id).holdId)])
    expect((await action(hall.id, coordinator, 'cancel')).status).toBe(200)
    const replacement = await create({ venueId: 'hall', replacesId: hall.id, submissionKey: 'hall-replacement' })
    expect(replacement.status).toBe(201)
    expect(replacement.body.booking.venueNeedId).toBe(hall.venueNeedId)
    expect([db.collectionData('venueBookingRequests').get(room.id),
      db.collectionData('venueAvailability').get(db.collectionData('venueBookingRequests').get(room.id).holdId)]).toEqual(siblingBefore)
    expect((await list(organiser)).body.bookings.map((booking) => booking.status)).toEqual(expect.arrayContaining(['cancelled', 'pending', 'approved']))
    expect((await request(app).get('/api/requests/event').set(auth(coordinator))).body.availableActions).not.toContain('confirm')
    expect((await request(app).post('/api/event-requests/event/transitions').set(auth(coordinator)).send({ action: 'confirm' })).status).toBe(409)
  })

  it('releases both venue reservations only on whole-event cancellation', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    expect((await action(hall.id, staff, 'approve')).status).toBe(200)
    expect((await action(room.id, secondStaff, 'approve')).status).toBe(200)
    db.store.get('event').status = CONFIRMED
    const cancelled = await request(app).post('/api/event-requests/event/transitions').set(auth(coordinator))
      .send({ action: 'cancel', reason: 'Event withdrawn' })
    expect(cancelled.status).toBe(200)
    for (const id of [hall.id, room.id]) {
      const booking = db.collectionData('venueBookingRequests').get(id)
      expect(booking.status).toBe('cancelled')
      expect(db.collectionData('venueAvailability').get(booking.holdId).lifecycleStatus).toBe('removed')
    }
  })
})
