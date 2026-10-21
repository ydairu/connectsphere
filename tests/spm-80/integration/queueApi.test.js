import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { fixture, coordinator, staff, secondStaff, organiser, input } from '../../spm-14/fixtures.js'

let db, app
const queue = '/api/venues/booking-requests'
const auth = (user) => ({ Authorization: `Bearer test:${user.uid}` })
const getQueue = (user) => request(app).get(queue).set(auth(user))

beforeEach(() => {
  db = fixture()
  // Both requests must be assigned to the same staff member to prove sibling visibility.
  db.collectionData('users').delete(secondStaff.uid)
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => ({ uid: token.slice(5) }),
    loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db })
})

async function createPair() {
  const create = (values) => request(app).post('/api/requests/event/venue-bookings').set(auth(coordinator)).send({ ...input, ...values })
  const hall = await create({ endsAt: '2027-03-01T11:00:00.000Z' })
  const room = await create({ venueId: 'room', startsAt: '2027-03-01T11:00:00.000Z', attendeeCount: 30, submissionKey: 'room-attempt' })
  expect(hall.status).toBe(201)
  expect(room.status).toBe(201)
  return [hall.body.booking, room.body.booking]
}

describe('SPM-80 HTTP queue with mocked identity and in-memory persistence', () => {
  it.each([
    ['approve', { action: 'approve' }, 'approved'],
    ['reject', { action: 'reject', reason: 'Room unavailable' }, 'rejected'],
  ])('keeps the other request visible after %s', async (_label, action, status) => {
    const [hall, room] = await createPair()
    const before = await getQueue(staff)
    expect(before.status).toBe(200)
    expect(before.body.bookings.map((booking) => booking.id)).toEqual([hall.id, room.id])
    expect(before.body.bookings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: hall.id, eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall', startsAt: hall.startsAt, endsAt: hall.endsAt }),
      expect.objectContaining({ id: room.id, eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Room', startsAt: room.startsAt, endsAt: room.endsAt }),
    ]))
    expect(JSON.stringify(before.body)).not.toContain('assignedVenueStaffUid')
    expect(JSON.stringify(before.body)).not.toContain('SECRET')

    const decision = await request(app).post(`/api/requests/event/venue-bookings/${hall.id}/actions`).set(auth(staff)).send(action)
    expect(decision.status).toBe(200)
    expect(decision.body.booking.status).toBe(status)
    const after = await getQueue(staff)
    expect(after.body.bookings.map((booking) => booking.id)).toEqual([room.id])
    expect(after.body.bookings[0]).toMatchObject({ eventTitle: 'Conference', venueName: 'Room', startsAt: room.startsAt, endsAt: room.endsAt, status: 'pending' })
    expect(db.collectionData('venueBookingRequests').get(room.id).status).toBe('pending')
  })

  it('keeps the queue limited to authenticated Venue Staff assigned to the booking', async () => {
    await createPair()
    expect((await request(app).get(queue)).status).toBe(401)
    for (const user of [coordinator, organiser]) expect((await getQueue(user)).status).toBe(403)
    // Restore another staff account after assignment; the two bookings remain private to their assignee.
    db.collectionData('users').set(secondStaff.uid, secondStaff)
    expect((await getQueue(secondStaff)).body.bookings).toEqual([])
  })
})
