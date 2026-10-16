// SPM-13 — GET /api/event-requests/:id/venue-suitability and the venue requirement fields on
// PATCH /api/requests/:id. Real Express routing and middleware, mocked token verification, one
// in-memory Firestore holding the seeded requests, users, venues and venue availability.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'
import { NOT_AVAILABLE_AT_STATUS, SUITABLE, SUITABLE_WITH_WARNINGS, UNSUITABLE } from '../../../shared/venueSuitability.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { attendee, coordinator, coordinator2, coordinator3, organiserA1, venueStaff } = SEED_ACCOUNTS

// Seeded events: 80 attendees, theatre layout, Friday 20 Nov 2026 09:00–13:00 Singapore time.
const PLANNING_ID = 'seed-req-a1-planning'
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'
const SUBMITTED_ID = 'seed-req-a1-submitted'
const CONFIRMED_ID = 'seed-req-a1-confirmed'

function venue(name, overrides = {}) {
  return {
    name,
    location: 'Main Campus',
    maximumCapacity: 100,
    facilities: ['Projector', 'Mic system'],
    accessibilityFeatures: ['Wheelchair access'],
    supportedLayouts: ['Theatre'],
    operatingHours: 'Monday-Friday 08:00-18:00',
    createdByUid: 'seed',
    ...overrides,
  }
}

const VENUES = {
  'atrium-hall': venue('Atrium Hall'),
  'booked-hall': venue('Booked Hall'),
  'small-room': venue('Small Room', { maximumCapacity: 40, facilities: ['Projector'] }),
  'studio': venue('Studio', { supportedLayouts: ['Banquet'], accessibilityFeatures: [] }),
}

const AVAILABILITY = {
  'booked-hall-booking': {
    venueId: 'booked-hall',
    status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    eventRequestId: 'another-event',
    title: 'Another organisation’s launch',
    startsAt: '2026-11-20T11:00:00+08:00',
    endsAt: '2026-11-20T15:00:00+08:00',
  },
  // Another event's hold that expired on 1 Oct 2026 (SPM-16) no longer blocks Atrium Hall.
  'atrium-expired-hold': {
    venueId: 'atrium-hall',
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
    eventRequestId: 'another-event',
    holdExpiresAt: '2026-10-01T00:00:00.000Z',
    lifecycleStatus: 'active',
    startsAt: '2026-11-20T10:00:00+08:00',
    endsAt: '2026-11-20T12:00:00+08:00',
  },
  // The planning event's own hold on Atrium Hall does not make Atrium Hall unavailable to it.
  'atrium-own-hold': {
    venueId: 'atrium-hall',
    status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
    eventRequestId: PLANNING_ID,
    startsAt: '2026-11-20T09:00:00+08:00',
    endsAt: '2026-11-20T13:00:00+08:00',
  },
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
  })
})

async function call(method, path, account, body) {
  const headers = account ? { Authorization: `Bearer ${TOKEN_PREFIX}${account.uid}` } : {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: response.status, json: await response.json() }
}

function suitability(id, account = coordinator, query = '') {
  return call('GET', `/api/event-requests/${id}/venue-suitability${query}`, account)
}

function setRequirements(id, venue, account = coordinator) {
  return call('PATCH', `/api/requests/${id}`, account, { venue })
}

function byId(response) {
  return Object.fromEntries(response.json.venues.map((item) => [item.id, item]))
}

describe('SPM-13 — venue suitability API (integration)', () => {
  it('spm13_api_checks_every_catalogue_venue_for_the_assigned_coordinator_suitable_first', async () => {
    const response = await suitability(PLANNING_ID)

    expect(response.status).toBe(200)
    expect(response.json.venues.map((item) => [item.name, item.result])).toEqual([
      ['Atrium Hall', SUITABLE],
      ['Studio', SUITABLE_WITH_WARNINGS],
      ['Booked Hall', UNSUITABLE],
      ['Small Room', UNSUITABLE],
    ])
    expect(response.json.event).toMatchObject({
      expectedAttendees: 80,
      layoutPreference: 'theatre',
      accessibilityRequired: true,
      requiredFacilities: [],
      requiredAccessibilityFeatures: [],
      period: { label: 'Fri 20 Nov 2026, 09:00–13:00' },
    })
    expect(response.json.options).toEqual({
      facilities: ['Mic system', 'Projector'],
      accessibilityFeatures: ['Wheelchair access'],
    })
  })

  it('spm13_api_names_capacity_overflow_and_unavailability_without_revealing_the_other_event', async () => {
    const venues = byId(await suitability(PLANNING_ID))

    expect(venues['small-room'].problems).toEqual([{ check: 'capacity', message: "Expected attendance (80) is above this venue's capacity (40)." }])
    expect(venues['booked-hall'].problems).toEqual([
      { check: 'availability', message: 'Not available: already booked, Fri 20 Nov 2026, 11:00–15:00.' },
    ])
    expect(JSON.stringify(venues['booked-hall'])).not.toContain('launch')
    expect(venues.studio.warnings).toEqual([{ check: 'layout', message: 'Layout "theatre" is not supported by this venue (supported: Banquet).' }])
  })

  it('spm13_api_saved_requirements_make_a_venue_without_a_mic_unsuitable_and_without_wheelchair_access_warned', async () => {
    const saved = await setRequirements(PLANNING_ID, {
      requiredFacilities: [' Mic system ', 'mic system'],
      requiredAccessibilityFeatures: ['Wheelchair access'],
    })
    const venues = byId(await suitability(PLANNING_ID))

    expect(saved.status).toBe(200)
    expect(saved.json.request.venue).toMatchObject({ requiredFacilities: ['Mic system'], requiredAccessibilityFeatures: ['Wheelchair access'] })
    expect(venues['small-room'].problems.map((problem) => problem.message)).toContain('Missing required facility: Mic system.')
    expect(venues.studio.result).toBe(SUITABLE_WITH_WARNINGS)
    expect(venues.studio.warnings.map((warning) => warning.message)).toContain('This venue is not marked as having Wheelchair access.')
    expect(venues['atrium-hall'].result).toBe(SUITABLE)
  })

  it('spm13_api_records_requirement_changes_in_the_change_history', async () => {
    await setRequirements(PLANNING_ID, { requiredFacilities: ['Projector'] })
    const history = await call('GET', `/api/requests/${PLANNING_ID}/history`, coordinator)

    expect(history.status).toBe(200)
    expect(history.json.entries[0]).toMatchObject({ field: 'venue.requiredFacilities', newValue: ['Projector'] })
  })

  it('spm13_api_refuses_requirements_that_are_not_a_list_of_text_and_writes_nothing', async () => {
    const before = structuredClone(db.collectionData('eventRequests').get(PLANNING_ID))
    const response = await setRequirements(PLANNING_ID, { requiredFacilities: 'Projector' })

    expect(response.status).toBe(400)
    expect(response.json.errors).toEqual({ 'venue.requiredFacilities': 'Must be a list of text values.' })
    expect(db.collectionData('eventRequests').get(PLANNING_ID)).toEqual(before)
  })

  it('spm13_api_checks_a_single_venue_by_id', async () => {
    const one = await suitability(PLANNING_ID, coordinator, '?venueId=small-room')
    const missing = await suitability(PLANNING_ID, coordinator, '?venueId=no-such-venue')

    expect(one.status).toBe(200)
    expect(one.json.venues.map((item) => item.id)).toEqual(['small-room'])
    expect(missing.status).toBe(404)
  })

  it('spm13_api_is_available_under_review_and_in_planning_only', async () => {
    const underReview = await suitability(UNDER_REVIEW_ID)
    const submitted = await suitability(SUBMITTED_ID)
    const confirmed = await suitability(CONFIRMED_ID, coordinator3)

    expect(underReview.status).toBe(200)
    expect(submitted.status).toBe(409)
    expect(submitted.json.reason).toBe(NOT_AVAILABLE_AT_STATUS)
    expect(confirmed.status).toBe(409)
  })

  it('spm13_api_refuses_everyone_but_the_assigned_coordinator', async () => {
    expect((await suitability(PLANNING_ID, coordinator2)).status).toBe(404)
    expect((await suitability(PLANNING_ID, organiserA1)).status).toBe(403)
    expect((await suitability(PLANNING_ID, venueStaff)).status).toBe(403)
    expect((await suitability(PLANNING_ID, attendee)).status).toBe(403)
    expect((await suitability('seed-req-a1-draft', coordinator)).status).toBe(404)
    expect((await call('GET', `/api/event-requests/${PLANNING_ID}/venue-suitability`)).status).toBe(401)
  })

  it('spm13_api_the_request_response_says_whether_the_viewer_can_check_suitability', async () => {
    const assigned = await call('GET', `/api/requests/${PLANNING_ID}`, coordinator)
    const owner = await call('GET', `/api/requests/${PLANNING_ID}`, organiserA1)
    const submitted = await call('GET', `/api/requests/${SUBMITTED_ID}`, coordinator)

    expect(assigned.json.canCheckVenueSuitability).toBe(true)
    expect(owner.json.canCheckVenueSuitability).toBe(false)
    expect(submitted.json.canCheckVenueSuitability).toBe(false)
  })
})
