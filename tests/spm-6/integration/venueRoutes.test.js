// SPM-6 AC3/AC4/AC6/AC8 — HTTP API creation flow and access control for the Venue Staff role.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'

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
const profiles = new Map([
  [VENUE_STAFF_USER.uid, VENUE_STAFF_USER],
  [ORGANISER_USER.uid, ORGANISER_USER],
])
const db = createFakeFirestore({ venues: {} })

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('Invalid token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

const validVenueInput = Object.freeze({
  name: 'Conference Hall A',
  location: 'Level 3, Singapore Campus',
  maximumCapacity: '120',
  facilities: ['Projector', 'Stage', 'Wi-Fi'],
  accessibilityFeatures: ['Wheelchair access'],
  supportedLayouts: ['Theatre', 'Classroom'],
  operatingHours: 'Monday-Friday 09:00-18:00',
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

async function postVenueAs(uid, body) {
  const response = await fetch(`${baseUrl}/api/venues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_PREFIX}${uid}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: await response.json() }
}

describe('SPM-6 — venue catalogue API (integration)', () => {
  it('spm6_api_allows_venue_staff_to_create_a_venue_with_valid_details', async () => {
    const response = await postVenueAs(VENUE_STAFF_USER.uid, {
      ...validVenueInput,
      createdByUid: 'body-value-must-not-win',
    })

    expect(response.status).toBe(201)
    expect(response.json.venue.name).toBe('Conference Hall A')
    expect(response.json.venue.maximumCapacity).toBe(120)
    expect(response.json.venue.createdByUid).toBe(VENUE_STAFF_USER.uid)
    expect(response.json.venue.supportedLayouts).toEqual(['Theatre', 'Classroom'])
  })

  it('spm6_api_returns_all_affected_fields_and_creates_no_record_for_invalid_details', async () => {
    const beforeCount = db.collectionData('venues').size

    const response = await postVenueAs(VENUE_STAFF_USER.uid, {
      ...validVenueInput,
      name: '',
      maximumCapacity: 'many',
      supportedLayouts: [],
    })

    expect(response.status).toBe(400)
    expect(response.json.message).toBe('Validation failed')
    expect(response.json.errors.name).toBe('Required.')
    expect(response.json.errors.maximumCapacity).toBe('Must be a positive whole number.')
    expect(response.json.errors.supportedLayouts).toBe('Required.')
    expect(db.collectionData('venues').size).toBe(beforeCount)
  })

  it('spm6_api_rejects_non_venue_staff_users', async () => {
    const beforeCount = db.collectionData('venues').size

    const response = await postVenueAs(ORGANISER_USER.uid, validVenueInput)

    expect(response.status).toBe(403)
    expect(db.collectionData('venues').size).toBe(beforeCount)
  })

  it('spm6_api_rejects_missing_token_before_venue_creation', async () => {
    const beforeCount = db.collectionData('venues').size
    const response = await fetch(`${baseUrl}/api/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validVenueInput),
    })

    expect(response.status).toBe(401)
    expect(db.collectionData('venues').size).toBe(beforeCount)
  })
})
