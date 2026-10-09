// SPM-30 — Venue Staff block venues for maintenance/renovation/safety and expose blocks to availability.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
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
      'block-existing': {
        venueId: 'venue-a',
        status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
        lifecycleStatus: 'active',
        startsAt: '2026-10-10T10:00:00.000Z',
        endsAt: '2026-10-10T11:00:00.000Z',
        reason: 'maintenance',
        title: 'Planned maintenance',
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

function authHeaders(uid) {
  return {
    Authorization: `Bearer ${TOKEN_PREFIX}${uid}`,
    'Content-Type': 'application/json',
  }
}

async function requestJson(path, { method = 'GET', uid = VENUE_STAFF_USER.uid, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: authHeaders(uid),
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, json: await response.json() }
}

async function getAvailability(from = '2026-10-10T08:00:00.000Z', to = '2026-10-10T12:00:00.000Z') {
  const search = new URLSearchParams({ from, to })
  return requestJson(`/api/venues/venue-a/availability?${search}`, { uid: COORDINATOR_USER.uid })
}

async function searchAvailableVenuesAsCoordinator(from, to) {
  const search = new URLSearchParams({ availableFrom: from, availableTo: to })
  return requestJson(`/api/venues?${search}`, { uid: COORDINATOR_USER.uid })
}

describe('SPM-30 — maintenance block API (integration)', () => {
  it('spm30_api_allows_venue_staff_to_create_a_maintenance_block', async () => {
    const response = await requestJson('/api/venues/venue-a/maintenance-blocks', {
      method: 'POST',
      body: {
        startsAt: '2026-10-10T13:00:00.000Z',
        endsAt: '2026-10-10T14:00:00.000Z',
        reason: 'renovation',
      },
    })

    expect(response.status).toBe(201)
    expect(response.json.block).toMatchObject({
      venueId: 'venue-a',
      status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
      lifecycleStatus: 'active',
      startsAt: '2026-10-10T13:00:00.000Z',
      endsAt: '2026-10-10T14:00:00.000Z',
      reason: 'renovation',
      title: 'Renovation',
      createdByUid: VENUE_STAFF_USER.uid,
    })
  })

  it('spm30_api_rejects_other_roles_from_creating_amending_or_removing_blocks', async () => {
    const createAsCoordinator = await requestJson('/api/venues/venue-a/maintenance-blocks', {
      method: 'POST',
      uid: COORDINATOR_USER.uid,
      body: {
        startsAt: '2026-10-10T13:00:00.000Z',
        endsAt: '2026-10-10T14:00:00.000Z',
        reason: 'maintenance',
      },
    })
    const amendAsOrganiser = await requestJson('/api/venues/venue-a/maintenance-blocks/block-existing', {
      method: 'PATCH',
      uid: ORGANISER_USER.uid,
      body: {
        startsAt: '2026-10-10T13:00:00.000Z',
        endsAt: '2026-10-10T14:00:00.000Z',
        reason: 'maintenance',
      },
    })
    const removeAsTechnical = await requestJson('/api/venues/venue-a/maintenance-blocks/block-existing', {
      method: 'DELETE',
      uid: TECHNICAL_STAFF_USER.uid,
    })

    expect(createAsCoordinator.status).toBe(403)
    expect(amendAsOrganiser.status).toBe(403)
    expect(removeAsTechnical.status).toBe(403)
  })

  it('spm30_api_validates_required_block_fields', async () => {
    const response = await requestJson('/api/venues/venue-a/maintenance-blocks', {
      method: 'POST',
      body: {
        startsAt: '2026-10-10T14:00:00.000Z',
        endsAt: '2026-10-10T13:00:00.000Z',
        reason: 'party',
      },
    })

    expect(response.status).toBe(400)
    expect(response.json.errors).toEqual({
      reason: 'Reason must be maintenance, renovation, safety, internal_activity, or other.',
      to: 'End date/time must be after start date/time.',
    })
  })

  it('spm30_api_shows_active_maintenance_blocks_as_unavailable_on_the_calendar', async () => {
    const response = await getAvailability()

    expect(response.status).toBe(200)
    expect(response.json.availability.slots).toContainEqual(
      expect.objectContaining({
        id: 'block-existing',
        status: AVAILABILITY_STATUS.MAINTENANCE_BLOCK,
        startsAt: '2026-10-10T10:00:00.000Z',
        endsAt: '2026-10-10T11:00:00.000Z',
        reason: 'maintenance',
      }),
    )
  })

  it('spm30_api_excludes_maintenance_blocked_venues_from_availability_search', async () => {
    const duringBlock = await searchAvailableVenuesAsCoordinator(
      '2026-10-10T10:15:00.000Z',
      '2026-10-10T10:45:00.000Z',
    )
    const afterBlock = await searchAvailableVenuesAsCoordinator(
      '2026-10-10T11:00:00.000Z',
      '2026-10-10T12:00:00.000Z',
    )

    expect(duringBlock.status).toBe(200)
    expect(duringBlock.json.venues).toEqual([])
    expect(afterBlock.status).toBe(200)
    expect(afterBlock.json.venues.map((venue) => venue.id)).toEqual(['venue-a'])
  })

  it('spm30_api_allows_venue_staff_to_amend_a_maintenance_block', async () => {
    const response = await requestJson('/api/venues/venue-a/maintenance-blocks/block-existing', {
      method: 'PATCH',
      body: {
        startsAt: '2026-10-10T09:00:00.000Z',
        endsAt: '2026-10-10T10:00:00.000Z',
        reason: 'safety',
      },
    })

    expect(response.status).toBe(200)
    expect(response.json.block).toMatchObject({
      id: 'block-existing',
      startsAt: '2026-10-10T09:00:00.000Z',
      endsAt: '2026-10-10T10:00:00.000Z',
      reason: 'safety',
      title: 'Safety',
      updatedByUid: VENUE_STAFF_USER.uid,
    })
  })

  it('spm30_api_allows_venue_staff_to_remove_a_block_so_the_period_is_available_again', async () => {
    const removeResponse = await requestJson('/api/venues/venue-a/maintenance-blocks/block-existing', {
      method: 'DELETE',
    })
    const availability = await getAvailability('2026-10-10T10:00:00.000Z', '2026-10-10T11:00:00.000Z')

    expect(removeResponse.status).toBe(200)
    expect(removeResponse.json.block).toMatchObject({
      id: 'block-existing',
      lifecycleStatus: 'removed',
      removedByUid: VENUE_STAFF_USER.uid,
    })
    expect(availability.status).toBe(200)
    expect(availability.json.availability.slots).toEqual([
      {
        status: AVAILABILITY_STATUS.AVAILABLE,
        startsAt: '2026-10-10T10:00:00.000Z',
        endsAt: '2026-10-10T11:00:00.000Z',
      },
    ])
  })
})
