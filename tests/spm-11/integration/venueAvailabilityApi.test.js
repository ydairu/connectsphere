// SPM-11 AC1-AC6/AC8/AC9 — Event Coordinators and Venue Staff view venue availability across time.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createTentativeVenueHold } from '../../../backend/src/services/venueService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { AVAILABILITY_STATUS } from '../../../shared/venueAvailability.js'

const TOKEN_PREFIX = 'test-token:'

const VENUE_STAFF_USER = {
  uid: 'venue-staff-1',
  email: 'venue.staff@example.test',
  name: 'Venue Staff One',
  roles: [VENUE_STAFF],
}
const COORDINATOR_USER = {
  uid: 'coordinator-1',
  email: 'coordinator@example.test',
  name: 'Coordinator One',
  roles: [COORDINATOR],
}
const ORGANISER_USER = {
  uid: 'organiser-1',
  email: 'organiser@example.test',
  name: 'Organiser One',
  roles: [ORGANISER],
}
const TECHNICAL_STAFF_USER = {
  uid: 'technical-1',
  email: 'technical@example.test',
  name: 'Technical One',
  roles: [TECHNICAL_STAFF],
}

const profiles = new Map([
  [VENUE_STAFF_USER.uid, VENUE_STAFF_USER],
  [COORDINATOR_USER.uid, COORDINATOR_USER],
  [ORGANISER_USER.uid, ORGANISER_USER],
  [TECHNICAL_STAFF_USER.uid, TECHNICAL_STAFF_USER],
])

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

const venue = Object.freeze({
  name: 'Atrium Hall',
  location: 'Level 1, Main Campus',
  maximumCapacity: 180,
  facilities: ['Reception desk'],
  accessibilityFeatures: ['Step-free access'],
  supportedLayouts: ['Banquet'],
  operatingHours: 'Monday-Saturday 08:00-20:00',
  createdByUid: 'seed',
  createdAt: '2026-09-20T00:00:00.000Z',
})

let db
let server
let baseUrl

beforeEach(async () => {
  db = createFakeFirestore({
    venues: {
      'venue-a': venue,
    },
    venueAvailability: {
      'booking-1': {
        venueId: 'venue-a',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: '2026-10-08T08:00:00.000Z',
        endsAt: '2026-10-08T08:30:00.000Z',
        title: 'Confirmed seminar',
        eventRequestId: 'request-confirmed',
      },
      'hold-1': {
        venueId: 'venue-a',
        status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
        startsAt: '2026-10-08T09:00:00.000Z',
        endsAt: '2026-10-08T10:00:00.000Z',
        title: 'Tentative planning hold',
        eventRequestId: 'request-held',
      },
      'maintenance-1': {
        venueId: 'venue-a',
        status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
        startsAt: '2026-10-08T11:00:00.000Z',
        endsAt: '2026-10-08T12:00:00.000Z',
        title: 'AV maintenance',
      },
      'cancelled-1': {
        venueId: 'venue-a',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        lifecycleStatus: 'cancelled',
        startsAt: '2026-10-08T13:00:00.000Z',
        endsAt: '2026-10-08T14:00:00.000Z',
        title: 'Cancelled event',
      },
      'other-venue-1': {
        venueId: 'venue-b',
        status: AVAILABILITY_STATUS.CONFIRMED_BOOKING,
        startsAt: '2026-10-08T08:00:00.000Z',
        endsAt: '2026-10-08T18:00:00.000Z',
        title: 'Different venue booking',
      },
    },
  })

  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(
  () =>
    new Promise((resolve) => {
      server.close(resolve)
    }),
)

async function getAvailabilityAs(uid, venueId = 'venue-a', params = {}) {
  const search = new URLSearchParams({
    from: '2026-10-08T08:00:00.000Z',
    to: '2026-10-08T14:00:00.000Z',
    ...params,
  })
  const response = await fetch(`${baseUrl}/api/venues/${venueId}/availability?${search}`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
  })
  return { status: response.status, json: await response.json() }
}

describe('SPM-11 — venue availability API (integration)', () => {
  it('spm11_api_allows_event_coordinators_and_venue_staff_to_view_availability', async () => {
    const coordinator = await getAvailabilityAs(COORDINATOR_USER.uid)
    const venueStaff = await getAvailabilityAs(VENUE_STAFF_USER.uid)

    expect(coordinator.status).toBe(200)
    expect(venueStaff.status).toBe(200)
    expect(coordinator.json.availability.slots.map((slot) => slot.status)).toContain(
      AVAILABILITY_STATUS.CONFIRMED_BOOKING,
    )
  })

  it('spm11_api_rejects_other_roles_and_missing_tokens', async () => {
    const organiser = await getAvailabilityAs(ORGANISER_USER.uid)
    const technical = await getAvailabilityAs(TECHNICAL_STAFF_USER.uid)
    const missingToken = await fetch(
      `${baseUrl}/api/venues/venue-a/availability?from=2026-10-08T08:00:00.000Z&to=2026-10-08T09:00:00.000Z`,
    )

    expect(organiser.status).toBe(403)
    expect(technical.status).toBe(403)
    expect(missingToken.status).toBe(401)
  })

  it('spm11_api_distinguishes_confirmed_bookings_tentative_holds_maintenance_and_available_slots', async () => {
    const response = await getAvailabilityAs(COORDINATOR_USER.uid)

    expect(response.status).toBe(200)
    expect(response.json.availability.slots.map((slot) => slot.status)).toEqual([
      AVAILABILITY_STATUS.CONFIRMED_BOOKING,
      AVAILABILITY_STATUS.AVAILABLE,
      AVAILABILITY_STATUS.TENTATIVE_HOLD,
      AVAILABILITY_STATUS.AVAILABLE,
      AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      AVAILABILITY_STATUS.AVAILABLE,
    ])
  })

  it('spm11_api_has_no_turnaround_buffer_at_exact_commitment_end_time', async () => {
    const response = await getAvailabilityAs(COORDINATOR_USER.uid, 'venue-a', {
      from: '2026-10-08T08:30:00.000Z',
      to: '2026-10-08T09:00:00.000Z',
    })

    expect(response.status).toBe(200)
    expect(response.json.availability.slots).toEqual([
      {
        status: AVAILABILITY_STATUS.AVAILABLE,
        startsAt: '2026-10-08T08:30:00.000Z',
        endsAt: '2026-10-08T09:00:00.000Z',
      },
    ])
  })

  it('spm11_api_treats_cancelled_bookings_and_removed_blocks_as_available', async () => {
    const response = await getAvailabilityAs(VENUE_STAFF_USER.uid, 'venue-a', {
      from: '2026-10-08T13:00:00.000Z',
      to: '2026-10-08T14:00:00.000Z',
    })

    expect(response.status).toBe(200)
    expect(response.json.availability.slots).toEqual([
      {
        status: AVAILABILITY_STATUS.AVAILABLE,
        startsAt: '2026-10-08T13:00:00.000Z',
        endsAt: '2026-10-08T14:00:00.000Z',
      },
    ])
  })

  it('spm11_api_returns_validation_errors_for_invalid_ranges', async () => {
    const response = await getAvailabilityAs(COORDINATOR_USER.uid, 'venue-a', {
      from: '2026-10-08T10:00:00.000Z',
      to: '2026-10-08T09:00:00.000Z',
    })

    expect(response.status).toBe(400)
    expect(response.json.errors).toEqual({ to: 'End date/time must be after start date/time.' })
  })

  it('spm11_service_prevents_overlapping_tentative_holds_for_the_same_venue', async () => {
    await expect(
      createTentativeVenueHold(
        {
          venueId: 'venue-a',
          startsAt: '2026-10-08T09:30:00.000Z',
          endsAt: '2026-10-08T10:30:00.000Z',
          eventRequestId: 'request-overlap',
        },
        VENUE_STAFF_USER,
        db,
      ),
    ).rejects.toMatchObject({
      // SPM-16 replaced the earlier 400 message with VenueConflictError, which names the conflict's type
      // and occupied period.
      name: 'VenueConflictError',
      conflict: {
        status: AVAILABILITY_STATUS.TENTATIVE_HOLD,
        occupiedStartsAt: '2026-10-08T09:00:00.000Z',
        occupiedEndsAt: '2026-10-08T10:00:00.000Z',
      },
    })
  })
})
