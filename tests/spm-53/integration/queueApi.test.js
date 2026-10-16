import { beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { fixture, staff, secondStaff, organiser, coordinator, input } from '../../spm-14/fixtures.js'
import { VENUE_STAFF, ORGANISER } from '../../../shared/permissions.js'

let db, app
beforeEach(async () => {
  db = fixture()
  db.store.get('event').assignedStaffUids = [staff.uid, secondStaff.uid]
  const authenticate = createAuthenticate({ verifyIdToken: async (token) => {
    if (!token.startsWith('test:')) throw new Error('Invalid token')
    return { uid: token.slice(5) }
  }, loadProfile: async (uid) => db.collectionData('users').get(uid) ?? null })
  app = createApp({ authenticate, getEventRequestDb: () => db, getVenueDb: () => db })
  for (const [id, status, uid, createdAt] of [
    ['z', 'pending', staff.uid, '2026-10-16'], ['a', 'pending', staff.uid, '2026-10-16'],
    ['old', 'pending', staff.uid, '2026-10-15'], ['other', 'pending', secondStaff.uid, '2026-10-14'],
    ...['approved', 'rejected', 'replaced', 'cancelled'].map((s) => [s, s, staff.uid, '2026-10-13']),
  ]) await db.collection('venueBookingRequests').doc(id).set({ ...input, eventRequestId: 'event', eventTitle: 'Conference', venueName: 'Hall',
    status, assignedVenueStaffUid: uid, createdAt, holdExpiresAt: '2020-01-01T00:00:00Z', privateField: 'SECRET' })
})
const get = (path, user) => request(app).get(path).set('Authorization', `Bearer test:${user.uid}`)
const queue = '/api/venues/booking-requests'
describe('SPM-53 HTTP with mocked identity and in-memory persistence', () => {
  it('scopes, orders and projects pending records; expired pending stays', async () => {
    const response = await get(queue, staff)
    expect(response.status).toBe(200)
    expect(response.body.bookings.map((b) => b.id)).toEqual(['old', 'a', 'z'])
    expect(JSON.stringify(response.body)).not.toContain('SECRET')
    expect(response.body.bookings[0].assignedVenueStaffUid).toBeUndefined()
  })
  it('authenticates and refuses users without Venue Staff role', async () => {
    expect((await request(app).get(queue)).status).toBe(401)
    for (const user of [organiser, coordinator]) expect((await get(queue, user)).status).toBe(403)
  })
  it('supports multi-role staff without widening booking assignment scope', async () => {
    db.collectionData('users').get(staff.uid).roles = [VENUE_STAFF, ORGANISER]
    expect((await get(queue, staff)).body.bookings.map((b) => b.id)).toEqual(['old', 'a', 'z'])
    const detail = await get('/api/requests/event/venue-bookings', staff)
    expect(detail.body.bookings.some((b) => b.id === 'other')).toBe(false)
    expect(detail.body.event.internal).toBeUndefined()
    expect(detail.body.event.equipment).toBeUndefined()
    expect((await get('/api/requests/other/venue-bookings', staff)).status).toBe(404)
  })
  it('removes decided fixture records on the next read and returns an empty queue', async () => {
    // Fixture contract only: SPM-54 decision actions do not exist yet.
    for (const id of ['old', 'a', 'z']) db.collectionData('venueBookingRequests').get(id).status = 'approved'
    expect((await get(queue, staff)).body.bookings).toEqual([])
  })
})
