// SPM-29 AC1/AC2/AC3/AC5/AC6 — Venue Staff update existing venue details without duplicates.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'

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

const profiles = new Map([
  [VENUE_STAFF_USER.uid, VENUE_STAFF_USER],
  [COORDINATOR_USER.uid, COORDINATOR_USER],
  [ORGANISER_USER.uid, ORGANISER_USER],
])

const originalVenue = Object.freeze({
  name: 'Atrium Hall',
  location: 'Level 1, Main Campus',
  maximumCapacity: 180,
  facilities: ['Reception desk', 'Digital signage'],
  accessibilityFeatures: ['Step-free access'],
  supportedLayouts: ['Banquet', 'Theatre'],
  operatingHours: 'Monday-Saturday 08:00-20:00',
  createdByUid: 'venue-staff-seed',
  createdByName: 'Seed User',
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
})

const validUpdate = Object.freeze({
  location: 'Level 2, Main Campus',
  maximumCapacity: '220',
  facilities: ['Reception desk', 'Hybrid meeting kit'],
  accessibilityFeatures: ['Step-free access', 'Accessible toilet nearby'],
  supportedLayouts: ['Theatre', 'Classroom', 'Workshop'],
  operatingHours: 'Monday-Friday 08:00-22:00',
})

let db
let server
let baseUrl

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

beforeEach(async () => {
  db = createFakeFirestore({
    venues: {
      'venue-a': originalVenue,
    },
  })
  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(() => new Promise((resolve) => server.close(resolve)))

async function patchVenueAs(uid, id, body) {
  const response = await fetch(`${baseUrl}/api/venues/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN_PREFIX}${uid}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json() }
}

async function getVenueAs(uid, id) {
  const response = await fetch(`${baseUrl}/api/venues/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
  })
  return { status: response.status, json: await response.json() }
}

describe('SPM-29 — venue update API (integration)', () => {
  it('spm29_api_allows_venue_staff_to_update_existing_venue_details', async () => {
    const beforeCount = db.collectionData('venues').size

    const response = await patchVenueAs(VENUE_STAFF_USER.uid, 'venue-a', {
      ...validUpdate,
      name: 'Body name must not replace venue identity',
    })
    const reopened = await getVenueAs(VENUE_STAFF_USER.uid, 'venue-a')

    expect(response.status).toBe(200)
    expect(response.json.venue).toMatchObject({
      id: 'venue-a',
      name: 'Atrium Hall',
      location: 'Level 2, Main Campus',
      maximumCapacity: 220,
      facilities: ['Reception desk', 'Hybrid meeting kit'],
      accessibilityFeatures: ['Step-free access', 'Accessible toilet nearby'],
      supportedLayouts: ['Theatre', 'Classroom', 'Workshop'],
      operatingHours: 'Monday-Friday 08:00-22:00',
      createdByUid: 'venue-staff-seed',
      updatedByUid: VENUE_STAFF_USER.uid,
      updatedByName: 'Venue Staff One',
    })
    expect(reopened.json.venue).toMatchObject(response.json.venue)
    expect(db.collectionData('venues').size).toBe(beforeCount)
  })

  it('spm29_api_blocks_invalid_updates_and_preserves_the_saved_record', async () => {
    const before = db.collectionData('venues').get('venue-a')

    const response = await patchVenueAs(VENUE_STAFF_USER.uid, 'venue-a', {
      ...validUpdate,
      location: '',
      maximumCapacity: 'many',
      facilities: [],
      supportedLayouts: [],
    })

    expect(response.status).toBe(400)
    expect(response.json.message).toBe('Validation failed')
    expect(response.json.errors).toMatchObject({
      location: 'Required.',
      maximumCapacity: 'Must be a positive whole number.',
      facilities: 'Required.',
      supportedLayouts: 'Required.',
    })
    expect(db.collectionData('venues').get('venue-a')).toEqual(before)
  })

  it('spm29_api_rejects_non_venue_staff_updates', async () => {
    const before = db.collectionData('venues').get('venue-a')

    const coordinatorResponse = await patchVenueAs(COORDINATOR_USER.uid, 'venue-a', validUpdate)
    const organiserResponse = await patchVenueAs(ORGANISER_USER.uid, 'venue-a', validUpdate)

    expect(coordinatorResponse.status).toBe(403)
    expect(organiserResponse.status).toBe(403)
    expect(db.collectionData('venues').get('venue-a')).toEqual(before)
  })

  it('spm29_api_rejects_missing_token_before_update', async () => {
    const response = await fetch(`${baseUrl}/api/venues/venue-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validUpdate),
    })

    expect(response.status).toBe(401)
    expect(db.collectionData('venues').get('venue-a')).toEqual(originalVenue)
  })

  it('spm29_api_returns_not_found_for_missing_venue_updates', async () => {
    const response = await patchVenueAs(VENUE_STAFF_USER.uid, 'missing-venue', validUpdate)

    expect(response.status).toBe(404)
    expect(response.json.message).toBe('Venue not found')
  })
})
