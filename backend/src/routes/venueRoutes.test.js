// SPM-6 — Venue catalogue API.
// Run: node --test "backend/src/**/*.test.js"

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { createApp } from '../app.js'
import { createAuthenticate } from '../middleware/authenticate.js'
import { createFakeFirestore } from '../testing/fakeFirestore.js'

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

before(async () => {
  const app = createApp({ authenticate, getVenueDb: () => db })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

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

describe('SPM-6 — Venue catalogue API', () => {
  test('Venue Staff creates a venue with valid details', async () => {
    const response = await postVenueAs(VENUE_STAFF_USER.uid, {
      ...validVenueInput,
      createdByUid: 'body-value-must-not-win',
    })

    assert.equal(response.status, 201)
    assert.equal(response.json.venue.name, 'Conference Hall A')
    assert.equal(response.json.venue.maximumCapacity, 120)
    assert.equal(response.json.venue.createdByUid, VENUE_STAFF_USER.uid)
    assert.deepEqual(response.json.venue.supportedLayouts, ['Theatre', 'Classroom'])
  })

  test('invalid venue details return every affected field and create no record', async () => {
    const beforeCount = db.collectionData('venues').size

    const response = await postVenueAs(VENUE_STAFF_USER.uid, {
      ...validVenueInput,
      name: '',
      maximumCapacity: 'many',
      supportedLayouts: [],
    })

    assert.equal(response.status, 400)
    assert.equal(response.json.message, 'Validation failed')
    assert.equal(response.json.errors.name, 'Required.')
    assert.equal(response.json.errors.maximumCapacity, 'Must be a positive whole number.')
    assert.equal(response.json.errors.supportedLayouts, 'Required.')
    assert.equal(db.collectionData('venues').size, beforeCount)
  })

  test('non-Venue Staff users cannot create venues', async () => {
    const beforeCount = db.collectionData('venues').size

    const response = await postVenueAs(ORGANISER_USER.uid, validVenueInput)

    assert.equal(response.status, 403)
    assert.equal(db.collectionData('venues').size, beforeCount)
  })

  test('missing token is refused before venue creation', async () => {
    const beforeCount = db.collectionData('venues').size
    const response = await fetch(`${baseUrl}/api/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validVenueInput),
    })

    assert.equal(response.status, 401)
    assert.equal(db.collectionData('venues').size, beforeCount)
  })
})
