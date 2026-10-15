// SPM-12 — Event Coordinators search and filter catalogue venues by event requirements
// (GET /api/venues). Real Express routing and middleware, mocked token verification, in-memory Firestore.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'

const TOKEN_PREFIX = 'test-token:'

const users = {
  coordinator: { uid: 'coordinator-1', name: 'Coordinator One', roles: [COORDINATOR] },
  venueStaff: { uid: 'venue-staff-1', name: 'Venue Staff One', roles: [VENUE_STAFF] },
  organiser: { uid: 'organiser-1', name: 'Organiser One', roles: [ORGANISER] },
  technicalStaff: { uid: 'technical-1', name: 'Technical One', roles: [TECHNICAL_STAFF] },
  attendee: { uid: 'attendee-1', name: 'Attendee One', roles: [ATTENDEE] },
}
const profiles = new Map(Object.values(users).map((user) => [user.uid, user]))

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

function venue(overrides) {
  return {
    operatingHours: 'Monday-Saturday 08:00-20:00',
    createdByUid: 'seed',
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

// Grand Hall has a projector and a mic system; Lecture Room has only a projector; Studio only a mic.
const db = createFakeFirestore({
  venues: {
    'grand-hall': venue({
      name: 'Grand Hall',
      location: 'Level 1, Main Campus',
      maximumCapacity: 300,
      facilities: ['Projector', 'Mic system', 'Stage'],
      accessibilityFeatures: ['Wheelchair access', 'Hearing loop'],
      supportedLayouts: ['Theatre', 'Banquet'],
    }),
    'lecture-room': venue({
      name: 'Lecture Room',
      location: 'Level 2, Main Campus',
      maximumCapacity: 120,
      facilities: ['Projector'],
      accessibilityFeatures: ['Wheelchair access'],
      supportedLayouts: ['Theatre', 'Classroom'],
    }),
    studio: venue({
      name: 'Studio',
      location: 'East Wing',
      maximumCapacity: 119,
      facilities: ['Mic system'],
      accessibilityFeatures: ['Step-free entrance'],
      supportedLayouts: ['Theatre'],
    }),
  },
  venueAvailability: {
    'grand-hall-booking': {
      venueId: 'grand-hall',
      status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      startsAt: '2026-11-02T09:00:00.000Z',
      endsAt: '2026-11-02T12:00:00.000Z',
      title: 'Annual meeting',
    },
    'lecture-room-block': {
      venueId: 'lecture-room',
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      lifecycleStatus: 'active',
      startsAt: '2026-11-03T09:00:00.000Z',
      endsAt: '2026-11-03T12:00:00.000Z',
      reason: 'maintenance',
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

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(resolve)
    }),
)

// Pairs, so a parameter can repeat the way the page sends facility and accessibility.
async function searchVenues(params = [], { uid = users.coordinator.uid } = {}) {
  const search = new URLSearchParams(params)
  const response = await fetch(`${baseUrl}/api/venues${search.size > 0 ? `?${search}` : ''}`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
  })
  return { status: response.status, json: await response.json() }
}

function venueIds(response) {
  return response.json.venues.map((item) => item.id)
}

describe('SPM-12 — venue search API (integration)', () => {
  it('spm12_api_returns_the_whole_catalogue_and_its_filter_options_without_filters', async () => {
    const response = await searchVenues()

    expect(response.status).toBe(200)
    expect(venueIds(response)).toEqual(['grand-hall', 'lecture-room', 'studio'])
    expect(response.json.filterOptions).toEqual({
      locations: ['East Wing', 'Level 1, Main Campus', 'Level 2, Main Campus'],
      layouts: ['Banquet', 'Classroom', 'Theatre'],
      facilities: ['Mic system', 'Projector', 'Stage'],
      accessibilityFeatures: ['Hearing loop', 'Step-free entrance', 'Wheelchair access'],
    })
  })

  it('spm12_api_capacity_filter_returns_only_venues_with_capacity_at_or_above_expected_attendance', async () => {
    const atBoundary = await searchVenues([['attendance', '120']])
    const aboveAll = await searchVenues([['attendance', '301']])

    expect(atBoundary.status).toBe(200)
    expect(venueIds(atBoundary)).toEqual(['grand-hall', 'lecture-room'])
    expect(aboveAll.status).toBe(200)
    expect(venueIds(aboveAll)).toEqual([])
  })

  it('spm12_api_date_time_filter_returns_only_venues_available_during_the_period', async () => {
    const duringBooking = await searchVenues([
      ['availableFrom', '2026-11-02T10:00:00.000Z'],
      ['availableTo', '2026-11-02T11:00:00.000Z'],
    ])
    const duringBlock = await searchVenues([
      ['availableFrom', '2026-11-03T11:30:00.000Z'],
      ['availableTo', '2026-11-03T13:00:00.000Z'],
    ])
    const afterBooking = await searchVenues([
      ['availableFrom', '2026-11-02T12:00:00.000Z'],
      ['availableTo', '2026-11-02T14:00:00.000Z'],
    ])

    expect(venueIds(duringBooking)).toEqual(['lecture-room', 'studio'])
    expect(venueIds(duringBlock)).toEqual(['grand-hall', 'studio'])
    expect(venueIds(afterBooking)).toEqual(['grand-hall', 'lecture-room', 'studio'])
  })

  it('spm12_api_location_filter_returns_only_venues_at_that_location', async () => {
    const response = await searchVenues([['location', 'Level 2, Main Campus']])

    expect(response.status).toBe(200)
    expect(venueIds(response)).toEqual(['lecture-room'])
  })

  it('spm12_api_accessibility_filter_returns_only_venues_marked_wheelchair_accessible', async () => {
    const wheelchair = await searchVenues([['accessibility', 'Wheelchair access']])
    const wheelchairAndLoop = await searchVenues([
      ['accessibility', 'Wheelchair access'],
      ['accessibility', 'Hearing loop'],
    ])

    expect(venueIds(wheelchair)).toEqual(['grand-hall', 'lecture-room'])
    expect(venueIds(wheelchairAndLoop)).toEqual(['grand-hall'])
  })

  it('spm12_api_layout_filter_returns_only_venues_supporting_theatre_layout', async () => {
    const theatre = await searchVenues([['layout', 'Theatre']])
    const classroom = await searchVenues([['layout', 'Classroom']])

    expect(venueIds(theatre)).toEqual(['grand-hall', 'lecture-room', 'studio'])
    expect(venueIds(classroom)).toEqual(['lecture-room'])
  })

  it('spm12_api_facility_filter_requires_both_projector_and_mic_system', async () => {
    const response = await searchVenues([
      ['facility', 'Projector'],
      ['facility', 'Mic system'],
    ])

    expect(response.status).toBe(200)
    // Lecture Room has only the projector and Studio only the mic system, so both are excluded.
    expect(venueIds(response)).toEqual(['grand-hall'])
  })

  it('spm12_api_combines_every_filter_and_a_venue_must_meet_all_of_them', async () => {
    const allMet = await searchVenues([
      ['availableFrom', '2026-11-02T13:00:00.000Z'],
      ['availableTo', '2026-11-02T15:00:00.000Z'],
      ['attendance', '150'],
      ['location', 'Level 1, Main Campus'],
      ['layout', 'Theatre'],
      ['accessibility', 'Wheelchair access'],
      ['facility', 'Projector'],
      ['facility', 'Mic system'],
    ])
    const bookedPeriod = await searchVenues([
      ['availableFrom', '2026-11-02T09:30:00.000Z'],
      ['availableTo', '2026-11-02T10:30:00.000Z'],
      ['attendance', '150'],
      ['facility', 'Projector'],
    ])

    expect(venueIds(allMet)).toEqual(['grand-hall'])
    expect(bookedPeriod.status).toBe(200)
    expect(venueIds(bookedPeriod)).toEqual([])
  })

  it('spm12_api_returns_an_empty_list_with_the_filter_options_when_nothing_matches', async () => {
    const response = await searchVenues([
      ['layout', 'Classroom'],
      ['facility', 'Mic system'],
    ])

    expect(response.status).toBe(200)
    expect(response.json.venues).toEqual([])
    expect(response.json.filterOptions.layouts).toEqual(['Banquet', 'Classroom', 'Theatre'])
  })

  it('spm12_api_rejects_invalid_filters_with_field_errors', async () => {
    const badAttendance = await searchVenues([['attendance', '0']])
    const halfPeriod = await searchVenues([
      ['availableFrom', '2026-11-02T13:00:00.000Z'],
      ['attendance', '-3'],
    ])

    expect(badAttendance.status).toBe(400)
    expect(badAttendance.json.errors).toEqual({ attendance: 'Expected attendance must be a positive whole number.' })
    expect(halfPeriod.status).toBe(400)
    expect(halfPeriod.json.errors).toEqual({
      attendance: 'Expected attendance must be a positive whole number.',
      to: 'A valid end date/time is required.',
    })
  })

  it('spm12_api_lets_venue_staff_use_the_same_filters', async () => {
    const response = await searchVenues([['facility', 'Stage']], { uid: users.venueStaff.uid })

    expect(response.status).toBe(200)
    expect(venueIds(response)).toEqual(['grand-hall'])
  })

  it('spm12_api_refuses_roles_without_catalogue_access_even_with_filters', async () => {
    for (const user of [users.organiser, users.technicalStaff, users.attendee]) {
      const response = await searchVenues([['attendance', '50']], { uid: user.uid })
      expect(response.status).toBe(403)
      expect(response.json).not.toHaveProperty('venues')
    }
  })

  it('spm12_api_requires_a_signed_in_user', async () => {
    const response = await fetch(`${baseUrl}/api/venues?attendance=50`)

    expect(response.status).toBe(401)
  })
})
