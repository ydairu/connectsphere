import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../backend/src/app.js'
import { createAuthenticate } from '../../backend/src/middleware/authenticate.js'
import { createFakeFirestoreEventRequestStore } from '../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { CONFIRMED, PLANNING, PREPARATION } from '../../shared/status.js'
import { coordinator, fixture, input, organiser } from '../spm-14/fixtures.js'

let db, app
beforeEach(() => {
  db = fixture()
  db.store.get('event').equipment = { requirements: [], technicalSupportNeeded: false }
  db.store.get('event').registration = { enabled: true }
  db.collectionData('users').set('attendee', { uid: 'attendee', roles: ['attendee'] })
  db.collectionData('users').set('other-c', { uid: 'other-c', roles: ['coordinator'] })
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db) })
})
const auth = (uid) => ({ Authorization: `Bearer test:${uid}` })
const create = (changes = {}) => request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator.uid)).send({ ...input, ...changes })
const choose = (bookingId, expectedPrimaryVenueBookingId = null, uid = coordinator.uid) => request(app)
  .put('/api/requests/event/primary-venue').set(auth(uid)).send({ bookingId, expectedPrimaryVenueBookingId })
const confirm = () => request(app).post('/api/event-requests/event/transitions').set(auth(coordinator.uid)).send({ action: 'confirm' })
const activity = () => [...db.collectionData('eventRequests/event/activity').values()]
async function approve(booking) {
  const assignee = db.collectionData('venueBookingRequests').get(booking.id).assignedVenueStaffUid
  return request(app).post(`/api/requests/event/venue-bookings/${booking.id}/actions`).set(auth(assignee)).send({ action: 'approve' })
}

describe('SPM-90 primary venue API', () => {
  it('blocks multi-venue confirmation, then projects one location to Attendees and all bookings to the Organiser', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    expect((await approve(hall)).status).toBe(200)
    expect((await approve(room)).status).toBe(200)
    expect((await confirm()).body.reason).toBe('primary_venue_required')
    expect(db.store.get('event').status).toBe(PLANNING)
    expect((await choose(hall.id)).status).toBe(200)
    expect((await confirm()).status).toBe(200)
    expect(db.store.get('event').status).toBe(CONFIRMED)
    const attendee = (await request(app).get('/api/requests/event').set(auth('attendee'))).body
    expect(attendee.request.primaryVenue).toMatchObject({ venueName: 'Hall', location: 'Level 1, Main Campus' })
    expect(attendee.request.primaryVenue.bookingId).toBeUndefined()
    expect(attendee.request.internal).toBeUndefined()
    expect(attendee.request.venue).toBeUndefined()
    expect((await request(app).get('/api/requests').set(auth('attendee'))).body.requests.find((item) => item.id === 'event').primaryVenue.venueName).toBe('Hall')
    expect((await request(app).get('/api/requests/event/venue-bookings').set(auth('attendee'))).status).toBe(404)
    const organiserBookings = (await request(app).get('/api/requests/event/venue-bookings').set(auth(organiser.uid))).body.bookings
    expect(organiserBookings).toHaveLength(2)
  })

  it('rejects invalid actors and bookings, detects stale changes, and records switches and cancellation', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    expect((await choose(hall.id)).status).toBe(409)
    await approve(hall)
    await approve(room)
    expect((await choose(hall.id, null, organiser.uid)).status).toBe(403)
    expect((await choose(hall.id, null, 'attendee')).status).toBe(403)
    expect((await choose(hall.id, null, 'other-c')).status).toBe(404)
    expect((await choose('missing')).status).toBe(409)
    const hallRecord = db.collectionData('venueBookingRequests').get(hall.id)
    db.collectionData('venueBookingRequests').set('unrelated-booking', { ...hallRecord, eventRequestId: 'other' })
    expect((await choose('unrelated-booking')).status).toBe(409)
    hallRecord.status = 'replaced'
    expect((await choose(hall.id)).status).toBe(409)
    hallRecord.status = 'approved'
    const hallHold = db.collectionData('venueAvailability').get(db.collectionData('venueBookingRequests').get(hall.id).holdId)
    hallHold.lifecycleStatus = 'removed'
    expect((await choose(hall.id)).status).toBe(409)
    hallHold.lifecycleStatus = 'active'
    expect((await choose(hall.id)).status).toBe(200)
    hallHold.lifecycleStatus = 'removed'
    expect((await confirm()).body.reason).toBe('primary_venue_required')
    hallHold.lifecycleStatus = 'active'
    expect((await choose(room.id)).status).toBe(409)
    expect((await confirm()).status).toBe(200)
    expect((await choose(room.id, hall.id)).status).toBe(200)
    expect(db.store.get('event').status).toBe(CONFIRMED)
    db.store.get('event').status = PREPARATION
    expect((await choose(hall.id, room.id)).status).toBe(409)
    db.store.get('event').status = CONFIRMED
    const changes = activity().filter((entry) => entry.field === 'primaryVenue')
    expect(changes).toHaveLength(2)
    expect(changes[1].oldValue.bookingId).toBe(hall.id)
    const history = (await request(app).get('/api/requests/event/history').set(auth(organiser.uid))).body.entries
    expect(history.some((entry) => entry.field === 'primaryVenue' && entry.newValue.venueName === 'Room')).toBe(true)
    expect((await request(app).get('/api/requests/event/history').set(auth('attendee'))).status).toBe(403)
    expect((await request(app).post(`/api/requests/event/venue-bookings/${hall.id}/actions`).set(auth(coordinator.uid)).send({ action: 'cancel' })).status).toBe(200)
    expect(db.store.get('event').primaryVenue.bookingId).toBe(room.id)
    expect((await request(app).post(`/api/requests/event/venue-bookings/${room.id}/actions`).set(auth(coordinator.uid)).send({ action: 'cancel' })).status).toBe(200)
    expect(db.store.get('event').primaryVenue).toBeNull()
    expect(db.store.get('event').primaryVenueSelectionRequired).toBe(true)
    expect(activity().filter((entry) => entry.field === 'primaryVenue')).toHaveLength(3)
  })

  it('automatically selects a sole approved booking at Confirm and records the system change', async () => {
    const hall = (await create()).body.booking
    await approve(hall)
    expect((await confirm()).status).toBe(200)
    expect(db.store.get('event').primaryVenue).toMatchObject({ bookingId: hall.id, location: 'Level 1, Main Campus' })
    expect(activity()).toContainEqual(expect.objectContaining({ field: 'primaryVenue', actor: expect.objectContaining({ name: 'System' }) }))
  })

  it('requires an explicit replacement after cancelling the primary booking', async () => {
    const hall = (await create()).body.booking
    const room = (await create({ venueId: 'room', attendeeCount: 30, submissionKey: 'room' })).body.booking
    await approve(hall)
    await approve(room)
    await choose(hall.id)
    await confirm()
    expect((await request(app).post(`/api/requests/event/venue-bookings/${hall.id}/actions`)
      .set(auth(coordinator.uid)).send({ action: 'cancel' })).status).toBe(200)
    expect(db.store.get('event').primaryVenue).toBeNull()
    expect((await choose(hall.id)).status).toBe(409)
    const replacement = (await create({ replacesId: hall.id, submissionKey: 'replacement' })).body.booking
    await approve(replacement)
    const blocked = await confirm()
    expect(blocked.status).toBe(409)
    expect(blocked.body.reason).toBe('primary_venue_required')
    expect((await choose(room.id)).status).toBe(200)
    expect((await confirm()).status).toBe(200)
  })

  it('clears the primary venue when the whole event is cancelled', async () => {
    const hall = (await create()).body.booking
    await approve(hall)
    await confirm()
    const cancelled = await request(app).post('/api/event-requests/event/transitions').set(auth(coordinator.uid))
      .send({ action: 'cancel', reason: 'Event withdrawn' })
    expect(cancelled.status).toBe(200)
    expect(db.store.get('event').primaryVenue).toBeNull()
    expect(activity().filter((entry) => entry.field === 'primaryVenue')).toHaveLength(2)
    expect((await choose(hall.id)).status).toBe(409)
  })
})
