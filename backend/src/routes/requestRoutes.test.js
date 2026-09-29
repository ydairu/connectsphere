// SPM-42 API tests — in-memory harness. Real HTTP against the real Express app, authenticate and
// authorise middleware and shared/permissions.js. Mocked: Firebase token verification (a test token
// names the uid) and persistence (in-memory store seeded from seedData.js). Not database verification.
// Run: node --test "backend/src/**/*.test.js"

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { PLANNING, SUBMITTED } from '../../../shared/status.js'
import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../scripts/seedData.js'
import { createApp } from '../app.js'
import { createAuthenticate } from '../middleware/authenticate.js'
import { createMemoryEventRequestStore } from '../testing/memoryEventRequestStore.js'
import { registerRequestApiCases } from './requestRoutes.cases.js'

const TOKEN_PREFIX = 'test-token:'

// Not a seeded account: an organiser who is also venue staff, assigned to their own request at planning.
// The realistic multi-role pairs are staff pairs, but this is the combination that exposes the leak.
const ORGANISER_VENUE = { uid: 'test-organiser-venue', email: 'organiser-venue@test.invalid', name: 'Organiser + Venue', roles: [ORGANISER, VENUE_STAFF], organisationId: 'TEST-ORG', organisationName: 'Test Organisation' }
const SELF_REGISTERED_ORGANISER = {
  uid: 'test-self-registered-organiser',
  email: 'self-registered-organiser@test.invalid',
  name: 'Self Registered Organiser',
  roles: [ORGANISER],
  organisationName: 'Named Only Organisation',
}
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
const OWN_SUBMITTED_WITHOUT_ORGANISATION_ID = {
  id: 'test-req-own-submitted-no-org-id',
  status: SUBMITTED,
  ownerUid: SELF_REGISTERED_ORGANISER.uid,
  organisationId: null,
  organisationName: SELF_REGISTERED_ORGANISER.organisationName,
  assignedStaffUids: [],
  core: { title: 'Submitted request without organisation ID' },
  venue: { layoutPreference: 'classroom' },
  equipment: { requirements: [] },
  registration: { enabled: false },
  internal: { planningNotes: '' },
  createdAt: '2026-09-12T11:00:00+08:00',
}

const profiles = new Map(
  [...Object.values(SEED_ACCOUNTS), ORGANISER_VENUE, SELF_REGISTERED_ORGANISER].map((account) => [account.uid, account]),
)

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
    eventRequestStore: createMemoryEventRequestStore([...SEED_REQUESTS, OWN_PLANNING_REQUEST, OWN_SUBMITTED_WITHOUT_ORGANISATION_ID]),
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
  async function getAs(uid, id) {
    const response = await fetch(`${baseUrl}/api/requests/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
    })
    return { status: response.status, json: await response.json() }
  }

  async function listAs(uid) {
    const response = await fetch(`${baseUrl}/api/requests`, {
      headers: { Authorization: `Bearer ${TOKEN_PREFIX}${uid}` },
    })
    return { status: response.status, json: await response.json() }
  }

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

  test('Self-registered organiser lists and opens their own submitted request without organisation ID', async () => {
    const listed = await listAs(SELF_REGISTERED_ORGANISER.uid)
    assert.equal(listed.status, 200)
    assert.ok(
      listed.json.requests.some((request) => request.id === OWN_SUBMITTED_WITHOUT_ORGANISATION_ID.id),
      'own submitted request is listed even before organisationId assignment',
    )

    const opened = await getAs(SELF_REGISTERED_ORGANISER.uid, OWN_SUBMITTED_WITHOUT_ORGANISATION_ID.id)
    assert.equal(opened.status, 200)
    assert.equal(opened.json.request.id, OWN_SUBMITTED_WITHOUT_ORGANISATION_ID.id)
    assert.deepEqual(opened.json.editableSections, [], 'submitted organiser request stays read-only')
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
