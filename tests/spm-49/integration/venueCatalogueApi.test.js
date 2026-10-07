// SPM-49 AC1/AC2/AC4/AC5/AC6 — authorised Event Coordinators and Venue Staff can view catalogue data.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
const ORGANISER_USER = {
  uid: 'organiser-1',
  email: 'organiser@example.test',
  name: 'Organiser One',
  roles: [ORGANISER],
}
const COORDINATOR_USER = {
  uid: 'coordinator-1',
  email: 'coordinator@example.test',
  name: 'Coordinator One',
  roles: [COORDINATOR],
}

const profiles = new Map([
  [VENUE_STAFF_USER.uid, VENUE_STAFF_USER],
  [ORGANISER_USER.uid, ORGANISER_USER],
  [COORDINATOR_USER.uid, COORDINATOR_USER],
])

const catalogueVenue = Object.freeze({
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

const db = createFakeFirestore({
  venues: {
    'venue-z': {
      ...catalogueVenue,
      name: 'Training Studio',
      location: 'Level 4, East Wing',
      maximumCapacity: 40,
      supportedLayouts: ['Classroom'],
    },
    'venue-a': catalogueVenue,
  },
})

const emptyDb = createFakeFirestore({ venues: {} })

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

let server
let emptyServer
let baseUrl
let emptyBaseUrl

beforeAll(async () => {
  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`

  const emptyApp = createApp({ authenticate, getVenueDb: () => emptyDb })
  await new Promise((resolve) => {
    emptyServer = emptyApp.listen(0, '127.0.0.1', resolve)
  })
  emptyBaseUrl = `http://127.0.0.1:${emptyServer.address().port}`
})

afterAll(
  () =>
    new Promise((resolve) => {
      server.close(() => emptyServer.close(resolve))
    }),
)

async function listVenuesAs(uid, url = baseUrl) {
  const response = await fetch(`${url}/api/venues`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
  })
  return { status: response.status, json: await response.json() }
}

async function getVenueAs(uid, id) {
  const response = await fetch(`${baseUrl}/api/venues/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
  })
  return { status: response.status, json: await response.json() }
}

describe('SPM-49 — venue catalogue API (integration)', () => {
  it('spm49_api_lists_catalogue_fields_for_venue_staff', async () => {
    const response = await listVenuesAs(VENUE_STAFF_USER.uid)

    expect(response.status).toBe(200)
    expect(response.json.venues).toEqual([
      {
        id: 'venue-a',
        name: 'Atrium Hall',
        location: 'Level 1, Main Campus',
        maximumCapacity: 180,
        facilities: ['Reception desk', 'Digital signage'],
        accessibilityFeatures: ['Step-free access'],
        supportedLayouts: ['Banquet', 'Theatre'],
        operatingHours: 'Monday-Saturday 08:00-20:00',
      },
      {
        id: 'venue-z',
        name: 'Training Studio',
        location: 'Level 4, East Wing',
        maximumCapacity: 40,
        facilities: ['Reception desk', 'Digital signage'],
        accessibilityFeatures: ['Step-free access'],
        supportedLayouts: ['Classroom'],
        operatingHours: 'Monday-Saturday 08:00-20:00',
      },
    ])
    expect(response.json.venues[0]).not.toHaveProperty('createdByUid')
  })

  it('spm49_api_allows_event_coordinators_to_list_and_view_catalogue_details', async () => {
    const listed = await listVenuesAs(COORDINATOR_USER.uid)
    const opened = await getVenueAs(COORDINATOR_USER.uid, 'venue-a')

    expect(listed.status).toBe(200)
    expect(listed.json.venues.map((venue) => venue.id)).toEqual(['venue-a', 'venue-z'])
    expect(opened.status).toBe(200)
    expect(opened.json.venue.supportedLayouts).toEqual(['Banquet', 'Theatre'])
    expect(db.collectionData('bookings').size).toBe(0)
    expect(db.collectionData('tentativeHolds').size).toBe(0)
    expect(db.collectionData('reservations').size).toBe(0)
  })

  it('spm49_api_returns_an_empty_catalogue_when_no_venues_exist', async () => {
    const response = await listVenuesAs(VENUE_STAFF_USER.uid, emptyBaseUrl)

    expect(response.status).toBe(200)
    expect(response.json.venues).toEqual([])
  })

  it('spm49_api_rejects_unauthorised_users', async () => {
    const response = await listVenuesAs(ORGANISER_USER.uid)

    expect(response.status).toBe(403)
  })

  it('spm49_api_rejects_missing_token', async () => {
    const response = await fetch(`${baseUrl}/api/venues`)

    expect(response.status).toBe(401)
  })
})
