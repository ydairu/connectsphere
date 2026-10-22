// SPM-76 — GET /api/event-requests/:id/venue-suitability checks each of the event's venues separately and
// counts the venue's setup and turnaround. Real Express routing and middleware, mocked token verification,
// one in-memory Firestore holding the seeded requests, users, venues, venue availability and booking requests.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { SUITABLE, UNSUITABLE } from '../../../shared/venueSuitability.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { coordinator, coordinator2, organiserA1 } = SEED_ACCOUNTS

// Seeded events: 80 attendees, theatre layout, Friday 20 Nov 2026 09:00–13:00 Singapore time.
const PLANNING_ID = 'seed-req-a1-planning'

function venue(name, overrides = {}) {
  return {
    name,
    location: 'Main Campus',
    maximumCapacity: 100,
    facilities: ['Projector'],
    accessibilityFeatures: ['Wheelchair access'],
    supportedLayouts: ['Theatre'],
    operatingHours: 'Daily 07:00-22:00',
    setupMinutes: 30,
    turnaroundMinutes: 45,
    createdByUid: 'seed',
    ...overrides,
  }
}

const VENUES = {
  'atrium-hall': venue('Atrium Hall'),
  'lecture-hall': venue('Lecture Hall'),
  'small-room': venue('Small Room', { maximumCapacity: 40 }),
}

// Another event's booking at Lecture Hall ends 08:15 on 20 Nov; with 45 minutes' turnaround it occupies the hall
// until 09:00, so the event's 30 minutes' setup from 08:30 overlaps it although the periods themselves do not.
const AVAILABILITY = {
  'lecture-hall-earlier-booking': {
    venueId: 'lecture-hall',
    status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    eventRequestId: 'another-event',
    title: 'Another organisation’s launch',
    startsAt: '2026-11-20T06:30:00+08:00',
    endsAt: '2026-11-20T08:15:00+08:00',
  },
  // The event's own tentative holds never make a venue unavailable to it.
  'atrium-own-hold': {
    venueId: 'atrium-hall',
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
    eventRequestId: PLANNING_ID,
    startsAt: '2026-11-20T09:00:00+08:00',
    endsAt: '2026-11-20T13:00:00+08:00',
  },
}

function bookingRequest(id, venueId, venueName, overrides = {}) {
  return {
    [id]: {
      eventRequestId: PLANNING_ID,
      venueId,
      venueName,
      venueNeedId: id,
      status: 'pending',
      startsAt: '2026-11-20T09:00:00+08:00',
      endsAt: '2026-11-20T13:00:00+08:00',
      createdAt: `2026-10-0${id.length}T10:00:00.000Z`,
      ...overrides,
    },
  }
}

let db
let server
let baseUrl

beforeAll(async () => {
  const authenticate = createAuthenticate({
    async verifyIdToken(token) {
      if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
      return { uid: token.slice(TOKEN_PREFIX.length) }
    },
    async loadProfile(uid) {
      return db.collectionData('users').get(uid) ?? null
    },
  })
  const app = createApp({
    authenticate,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db),
    getEventRequestDb: () => db,
    getVenueDb: () => db,
  })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  db = createFakeFirestore({
    eventRequests: Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request])),
    users: Object.fromEntries(Object.values(SEED_ACCOUNTS).map(({ uid, ...profile }) => [uid, profile])),
    venues: VENUES,
    venueAvailability: AVAILABILITY,
    venueBookingRequests: {},
  })
})

async function call(method, path, account, body) {
  const headers = account ? { Authorization: `Bearer ${TOKEN_PREFIX}${account.uid}` } : {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, json: await response.json() }
}

function suitability(id = PLANNING_ID, account = coordinator) {
  return call('GET', `/api/event-requests/${id}/venue-suitability`, account)
}

async function seedBookings(...records) {
  for (const [id, record] of Object.entries(Object.assign({}, ...records))) {
    await db.collection('venueBookingRequests').doc(id).set(record)
  }
}

function eventVenues(response) {
  return response.json.eventVenues.map((item) => [item.name, item.result, item.bookingStatus])
}

describe('SPM-76 — each of the event’s venues is checked separately (integration)', () => {
  it('spm76_ac2_api_checks_every_venue_the_event_has_requested_separately', async () => {
    await seedBookings(
      bookingRequest('need-1', 'atrium-hall', 'Atrium Hall'),
      bookingRequest('need-22', 'small-room', 'Small Room', { status: 'approved' }),
      bookingRequest('need-333', 'lecture-hall', 'Lecture Hall'),
    )
    const response = await suitability()

    expect(response.status).toBe(200)
    expect(eventVenues(response)).toEqual([
      ['Atrium Hall', SUITABLE, 'pending'],
      ['Small Room', UNSUITABLE, 'approved'],
      ['Lecture Hall', UNSUITABLE, 'pending'],
    ])
    expect(response.json.eventVenues.map((item) => item.id)).toEqual(['atrium-hall', 'small-room', 'lecture-hall'])
    // The catalogue list is unchanged and still covers every venue.
    expect(response.json.venues.map((item) => item.id).sort()).toEqual(['atrium-hall', 'lecture-hall', 'small-room'])
  })

  it('spm76_ac3_api_names_the_failing_venues_problems_and_still_shows_the_passing_venue_as_suitable', async () => {
    await seedBookings(bookingRequest('need-1', 'atrium-hall', 'Atrium Hall'), bookingRequest('need-22', 'small-room', 'Small Room'))
    const [passing, failing] = (await suitability()).json.eventVenues

    expect(passing).toMatchObject({ name: 'Atrium Hall', result: SUITABLE, problems: [], warnings: [] })
    expect(failing).toMatchObject({ name: 'Small Room', result: UNSUITABLE })
    expect(failing.problems).toEqual([{ check: 'capacity', message: "Expected attendance (80) is above this venue's capacity (40)." }])
  })

  it('spm76_ac1_api_flags_a_venue_whose_setup_overlaps_another_booking_without_naming_the_other_event', async () => {
    await seedBookings(bookingRequest('need-1', 'lecture-hall', 'Lecture Hall'))
    const response = await suitability()
    const [lecture] = response.json.eventVenues

    expect(lecture.result).toBe(UNSUITABLE)
    expect(lecture.problems).toEqual([
      {
        check: 'availability',
        message:
          'Not available: already booked, Fri 20 Nov 2026, 06:30–08:15. The venue needs 45 minutes of turnaround after it and 30 minutes of setup before the event, which overlap.',
      },
    ])
    expect(JSON.stringify(response.json)).not.toContain('launch')
  })

  it('spm76_api_shows_only_the_current_pending_or_approved_request_of_each_venue_need', async () => {
    await seedBookings(
      // A replaced request and the request that replaced it: only the replacement counts.
      bookingRequest('need-1', 'lecture-hall', 'Lecture Hall', { status: 'replaced', replacedById: 'need-22' }),
      bookingRequest('need-22', 'atrium-hall', 'Atrium Hall', { venueNeedId: 'need-1', replacesId: 'need-1', createdAt: '2026-10-05T10:00:00.000Z' }),
      bookingRequest('need-333', 'small-room', 'Small Room', { status: 'rejected' }),
      bookingRequest('need-4444', 'small-room', 'Small Room', { status: 'cancelled' }),
      // Pending with a hold that has expired is an expired request, not a venue the event is waiting on.
      bookingRequest('need-55555', 'lecture-hall', 'Lecture Hall', { holdExpiresAt: '2026-10-01T00:00:00.000Z' }),
      // Another event's request is never listed.
      bookingRequest('need-666666', 'small-room', 'Small Room', { eventRequestId: 'seed-req-b1-planning' }),
    )
    const response = await suitability()

    expect(eventVenues(response)).toEqual([['Atrium Hall', SUITABLE, 'pending']])
  })

  it('spm76_api_an_event_with_no_venue_request_has_no_event_venues_but_keeps_the_catalogue_list', async () => {
    const response = await suitability()

    expect(response.status).toBe(200)
    expect(response.json.eventVenues).toEqual([])
    expect(response.json.venues).toHaveLength(3)
  })

  it('spm76_api_a_requested_venue_missing_from_the_catalogue_is_unsuitable_and_says_so', async () => {
    await seedBookings(bookingRequest('need-1', 'gone-hall', 'Gone Hall'))
    const [gone] = (await suitability()).json.eventVenues

    expect(gone).toMatchObject({ id: 'gone-hall', name: 'Gone Hall', result: UNSUITABLE })
    expect(gone.problems).toEqual([{ check: 'venue', message: 'This venue is no longer in the venue catalogue.' }])
  })

  it('spm76_api_keeps_the_permission_rules_for_the_event_venues', async () => {
    await seedBookings(bookingRequest('need-1', 'atrium-hall', 'Atrium Hall'))

    expect((await suitability(PLANNING_ID, coordinator2)).status).toBe(404)
    expect((await suitability(PLANNING_ID, organiserA1)).status).toBe(403)
  })
})
