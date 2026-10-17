// SPM-73 — GET /api/venues/:id/availability shows setup and turnaround for a venue that has them.
// Real Express routing and middleware, mocked token verification, in-memory Firestore.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { SETUP_SLOT, TURNAROUND_SLOT } from '../../../shared/venueCalendar.js'

const TOKEN_PREFIX = 'test-token:'
const users = new Map(
  [
    { uid: 'coordinator-1', name: 'Coordinator One', roles: [COORDINATOR] },
    { uid: 'venue-staff-1', name: 'Venue Staff One', roles: [VENUE_STAFF] },
    { uid: 'organiser-1', name: 'Organiser One', roles: [ORGANISER] },
  ].map((user) => [user.uid, user]),
)

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return users.get(uid) ?? null
  },
})

const venueFields = {
  location: 'Main Campus',
  maximumCapacity: 200,
  facilities: ['Projector'],
  accessibilityFeatures: ['Wheelchair access'],
  supportedLayouts: ['Theatre'],
  operatingHours: 'Daily 08:00-22:00',
  createdByUid: 'seed',
}

// Monday 2 Nov 2026, Singapore time.
const db = createFakeFirestore({
  venues: {
    hall: { name: 'Hall', ...venueFields, setupMinutes: 30, turnaroundMinutes: 45 },
    room: { name: 'Room', ...venueFields, setupMinutes: 0, turnaroundMinutes: 0 },
  },
  venueAvailability: {
    'hall-booking': {
      venueId: 'hall',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T02:00:00.000Z',
      endsAt: '2026-11-02T04:00:00.000Z',
      title: 'Annual meeting',
    },
    'room-booking': {
      venueId: 'room',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T02:00:00.000Z',
      endsAt: '2026-11-02T04:00:00.000Z',
      title: 'Workshop',
    },
  },
})

let server
let baseUrl

beforeAll(async () => {
  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

async function calendar(venueId, from, to, uid = 'coordinator-1') {
  const search = new URLSearchParams({ from, to })
  const response = await fetch(`${baseUrl}/api/venues/${venueId}/availability?${search}`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
  })
  return { status: response.status, json: await response.json() }
}

describe('SPM-73 — calendar API with setup and turnaround (integration)', () => {
  it('spm73_api_shows_setup_and_turnaround_around_a_booking_and_the_venues_times', async () => {
    const response = await calendar('hall', '2026-11-02T00:00:00.000Z', '2026-11-02T06:00:00.000Z')

    expect(response.status).toBe(200)
    expect(response.json.availability.slots.map((slot) => [slot.status, slot.startsAt, slot.endsAt])).toEqual([
      [AVAILABILITY_STATUS.AVAILABLE, '2026-11-02T00:00:00.000Z', '2026-11-02T01:30:00.000Z'],
      [SETUP_SLOT, '2026-11-02T01:30:00.000Z', '2026-11-02T02:00:00.000Z'],
      [AVAILABILITY_STATUS.CONFIRMED_BOOKING, '2026-11-02T02:00:00.000Z', '2026-11-02T04:00:00.000Z'],
      [TURNAROUND_SLOT, '2026-11-02T04:00:00.000Z', '2026-11-02T04:45:00.000Z'],
      [AVAILABILITY_STATUS.AVAILABLE, '2026-11-02T04:45:00.000Z', '2026-11-02T06:00:00.000Z'],
    ])
    expect(response.json.availability.slots[1]).toMatchObject({ commitmentId: 'hall-booking', title: 'Annual meeting' })
    expect(response.json.availability.buffers).toEqual({ setupMinutes: 30, turnaroundMinutes: 45 })
  })

  it('spm73_api_a_period_inside_the_turnaround_is_not_available', async () => {
    const response = await calendar('hall', '2026-11-02T04:00:00.000Z', '2026-11-02T04:45:00.000Z')

    expect(response.json.availability.slots.map((slot) => slot.status)).toEqual([TURNAROUND_SLOT])
  })

  it('spm73_api_a_venue_with_no_setup_or_turnaround_is_shown_as_before', async () => {
    const response = await calendar('room', '2026-11-02T00:00:00.000Z', '2026-11-02T06:00:00.000Z', 'venue-staff-1')

    expect(response.json.availability.slots.map((slot) => slot.status)).toEqual([
      AVAILABILITY_STATUS.AVAILABLE,
      AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      AVAILABILITY_STATUS.AVAILABLE,
    ])
    expect(response.json.availability.buffers).toEqual({ setupMinutes: 0, turnaroundMinutes: 0 })
  })

  it('spm73_api_access_is_unchanged', async () => {
    expect((await calendar('hall', '2026-11-02T00:00:00.000Z', '2026-11-02T06:00:00.000Z', 'organiser-1')).status).toBe(403)
  })
})
