// SPM-42 API tests — in-memory harness. Real HTTP against the real Express app, authenticate and
// authorise middleware and shared/permissions.js. Mocked: Firebase token verification (a test token
// names the uid) and persistence (in-memory store seeded from seedData.js). Not database verification.
// Run: node --test "backend/src/**/*.test.js"

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { PLANNING } from '../../../shared/status.js'
import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../scripts/seedData.js'
import { createApp } from '../app.js'
import { createAuthenticate } from '../middleware/authenticate.js'
import { createMemoryEventRequestStore } from '../testing/memoryEventRequestStore.js'
import { registerRequestApiCases } from './requestRoutes.cases.js'

const TOKEN_PREFIX = 'test-token:'

// Not a seeded account: an organiser who is also venue staff, assigned to their own request at planning.
// The realistic multi-role pairs are staff pairs, but this is the combination that exposes the leak.
const ORGANISER_VENUE = { uid: 'test-organiser-venue', email: 'organiser-venue@test.invalid', name: 'Organiser + Venue', roles: [ORGANISER, VENUE_STAFF], organisationId: 'TEST-ORG', organisationName: 'Test Organisation' }
const OWN_PLANNING_REQUEST = {
  id: 'test-req-own-planning',
  status: PLANNING,
  ownerUid: ORGANISER_VENUE.uid,
  organisationId: 'TEST-ORG',
  organisationName: 'Test Organisation',
  assignedStaffUids: [ORGANISER_VENUE.uid],
  core: { title: 'Own request at planning' },
  venue: { layoutPreference: 'theatre' },
  equipment: { requirements: [] },
  registration: { enabled: false },
  internal: { planningNotes: '' },
  createdAt: '2026-09-12T10:00:00+08:00',
}

const profiles = new Map([...Object.values(SEED_ACCOUNTS), ORGANISER_VENUE].map((account) => [account.uid, account]))

const authenticate = createAuthenticate({
  async verifyIdToken(token) {
    if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
    return { uid: token.slice(TOKEN_PREFIX.length) }
  },
  async loadProfile(uid) {
    return profiles.get(uid) ?? null
  },
})

let server
let baseUrl

before(async () => {
  const app = createApp({
    authenticate,
    eventRequestStore: createMemoryEventRequestStore([...SEED_REQUESTS, OWN_PLANNING_REQUEST]),
  })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

registerRequestApiCases({
  baseUrl: () => baseUrl,
  tokenFor: async (accountKey) => `${TOKEN_PREFIX}${SEED_ACCOUNTS[accountKey].uid}`,
})

describe("SPM-42 — View and Edit Information According to My Role's Permissions (API, in-memory only)", () => {
  async function patchAs(uid, id, body, { rawBody } = {}) {
    const response = await fetch(`${baseUrl}/api/requests/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}`, 'Content-Type': 'application/json' },
      body: rawBody ?? JSON.stringify(body),
    })
    return { status: response.status, json: await response.json() }
  }

  // Regression for the multi-role leak: under inScope(user) && stateGateOpen(user) && section ∈
  // editableSections(user.roles), the venue role's open gate at planning unlocks the organiser's core.
  test('Organiser who is also venue staff PATCHes the core section of their own request at planning', async () => {
    const response = await patchAs(ORGANISER_VENUE.uid, OWN_PLANNING_REQUEST.id, { core: { title: 'Leaked edit' } })
    assert.equal(response.status, 403)
    assert.deepEqual(response.json.forbiddenFields, ['core.title'])
  })

  test('Organiser who is also venue staff PATCHes the venue section of their own request at planning', async () => {
    const response = await patchAs(ORGANISER_VENUE.uid, OWN_PLANNING_REQUEST.id, { venue: { layoutPreference: 'banquet' } })
    assert.equal(response.status, 200)
    assert.deepEqual(response.json.editableSections, ['venue'])
  })

  test('PATCH with a body that is not valid JSON', async () => {
    const response = await patchAs(SEED_ACCOUNTS.coordinator.uid, 'seed-req-a1-submitted', undefined, { rawBody: '{not json' })
    assert.equal(response.status, 400)
  })

  test('PATCH with an empty object', async () => {
    const response = await patchAs(SEED_ACCOUNTS.coordinator.uid, 'seed-req-a1-submitted', {})
    assert.equal(response.status, 400)
  })
})
