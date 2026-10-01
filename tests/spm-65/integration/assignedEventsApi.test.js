// SPM-65 — View My Assigned Events, API suite. Real HTTP against the real Express app, authenticate and
// authorise middleware and shared/permissions.js. Mocked: Firebase token verification (a test token
// names the uid) and persistence, which is the fakeFirestore store the E2E double uses, so a test can
// change a record's assignedCoordinatorUid directly. There is no reassignment route yet (SPM-26).
// Not database verification.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { COORDINATOR, ORGANISER } from '../../../shared/permissions.js'
import { DRAFT } from '../../../shared/status.js'
import { SEED_ACCOUNTS, SEED_ORGANISATIONS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'
import { apiClient, startInMemoryApi } from '../../shared/helpers/requestApiServer.js'

const { coordinator, coordinator2, coordinator3 } = SEED_ACCOUNTS
const A1_SUBMITTED = 'seed-req-a1-submitted' // assigned to coordinator
const A2_SUBMITTED = 'seed-req-a2-submitted' // assigned to coordinator-2
const A1_CONFIRMED = 'seed-req-a1-confirmed' // assigned to coordinator-3

// Not a seeded account: an Event Coordinator who is also an Organiser in organisation B.
const COORDINATOR_ORGANISER = {
  uid: 'test-coordinator-organiser',
  email: 'coordinator-organiser@test.invalid',
  name: 'Coordinator + Organiser',
  roles: [COORDINATOR, ORGANISER],
  ...SEED_ORGANISATIONS.B,
}

let db
let api
let client
const listCalls = { full: 0, assigned: [] }

function seededDatabase() {
  return createFakeFirestore({
    eventRequests: Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request])),
  })
}

// The fakeFirestore store, with each list method counted so a test can see which query served a caller.
function countingStore() {
  const store = createFakeFirestoreEventRequestStore(() => db)
  return {
    ...store,
    async list() {
      listCalls.full += 1
      return store.list()
    },
    async listAssignedToCoordinator(uid) {
      listCalls.assigned.push(uid)
      return store.listAssignedToCoordinator(uid)
    },
  }
}

// Stands in for SPM-26: changes the stored record, as a reassignment would.
function reassign(id, uid) {
  const records = db.collectionData('eventRequests')
  records.set(id, { ...records.get(id), assignedCoordinatorUid: uid })
}

async function listIds(accountKey, query = '') {
  const response = await client.call('GET', `/api/requests${query}`, accountKey)
  expect(response.status).toBe(200)
  return response.json.requests.map((request) => request.id)
}

beforeAll(async () => {
  api = await startInMemoryApi({ extraAccounts: [COORDINATOR_ORGANISER], eventRequestStore: countingStore() })
  client = apiClient({
    baseUrl: () => api.baseUrl(),
    tokenFor: async (key) => (key === 'coordinatorOrganiser' ? api.tokenForUid(COORDINATOR_ORGANISER.uid) : api.tokenFor(key)),
  })
})

beforeEach(() => {
  db = seededDatabase()
  listCalls.full = 0
  listCalls.assigned = []
})

afterAll(() => api.close())

describe('SPM-65 — View My Assigned Events (API, in-memory only)', () => {
  it('Coordinator A lists only the events assigned to A; B\'s events are absent', async () => {
    const ids = await listIds('coordinator')
    const expected = SEED_REQUESTS.filter((r) => r.status !== DRAFT && r.assignedCoordinatorUid === coordinator.uid).map((r) => r.id)
    expect(ids.sort()).toEqual(expected.sort())
    expect(ids).not.toContain(A2_SUBMITTED)
    expect(ids).not.toContain(A1_CONFIRMED)
  })

  it('Each seeded coordinator sees exactly their own workload', async () => {
    for (const [key, account] of [['coordinator', coordinator], ['coordinator2', coordinator2], ['coordinator3', coordinator3]]) {
      const ids = await listIds(key)
      const expected = SEED_REQUESTS.filter((r) => r.assignedCoordinatorUid === account.uid).map((r) => r.id)
      expect(ids.sort(), key).toEqual(expected.sort())
    }
  })

  it("Coordinator A requests B's event by ID — 404, the same as an unknown id", async () => {
    const response = await client.get('coordinator', A2_SUBMITTED)
    const unknown = await client.get('coordinator', 'seed-req-does-not-exist')
    expect(response.status).toBe(404)
    expect(response.json).toEqual(unknown.json)
  })

  it("Coordinator A PATCHes B's event — 404, and nothing is written", async () => {
    const response = await client.patch('coordinator', A2_SUBMITTED, { internal: { planningNotes: 'Not mine' } })
    expect(response.status).toBe(404)
    expect(db.collectionData('eventRequests').get(A2_SUBMITTED).internal.planningNotes).not.toBe('Not mine')
  })

  it('An event reassigned from B to A appears in A\'s list and opens for A; it leaves B\'s list and B gets 404', async () => {
    expect(await listIds('coordinator2')).toContain(A2_SUBMITTED)
    expect(await listIds('coordinator')).not.toContain(A2_SUBMITTED)

    reassign(A2_SUBMITTED, coordinator.uid)

    expect(await listIds('coordinator'), 'appears for the new coordinator').toContain(A2_SUBMITTED)
    expect((await client.get('coordinator', A2_SUBMITTED)).status).toBe(200)
    expect(await listIds('coordinator2'), 'gone for the previous coordinator').not.toContain(A2_SUBMITTED)
    expect((await client.get('coordinator2', A2_SUBMITTED)).status).toBe(404)
  })

  it('Drafts appear in no coordinator\'s list, even one carrying an assignedCoordinatorUid', async () => {
    const draftIds = SEED_REQUESTS.filter((r) => r.status === DRAFT).map((r) => r.id)
    reassign(draftIds[0], coordinator.uid) // not something the product does; proves the draft rule wins
    for (const key of ['coordinator', 'coordinator2', 'coordinator3', 'coordinatorOrganiser']) {
      const ids = await listIds(key)
      for (const id of draftIds) expect(ids, `${key}: ${id}`).not.toContain(id)
    }
    expect((await client.get('coordinator', draftIds[0])).status).toBe(404)
  })

  it('The list query uses the uid from the token; a uid in the query string has no effect', async () => {
    const own = await listIds('coordinator')
    const spoofed = await listIds('coordinator', `?assignedCoordinatorUid=${coordinator2.uid}&uid=${coordinator2.uid}`)
    expect(spoofed).toEqual(own)
    expect(listCalls.assigned).toEqual([coordinator.uid, coordinator.uid])
    expect(listCalls.full, 'a coordinator-only user never reads the full collection').toBe(0)
  })

  it('A coordinator who is also an Organiser keeps both scopes: assigned events plus their organisation\'s', async () => {
    reassign(A1_SUBMITTED, COORDINATOR_ORGANISER.uid)
    const ids = await listIds('coordinatorOrganiser')
    expect(ids, 'assigned event in another organisation').toContain(A1_SUBMITTED)
    expect(ids, "own organisation's submitted event").toContain('seed-req-b1-planning')
    expect(ids, 'unassigned event in another organisation').not.toContain(A2_SUBMITTED)
    expect(listCalls.full, 'multi-role users are served from the full list, filtered by scope').toBe(1)
  })

  it('Organiser visibility is unchanged', async () => {
    const ids = await listIds('organiserA1')
    expect(ids).toContain('seed-req-a1-draft')
    expect(ids).toContain(A2_SUBMITTED)
    expect(ids.some((id) => id.startsWith('seed-req-b1-'))).toBe(false)
    const otherOrganisation = await client.get('organiserB1', A1_SUBMITTED)
    expect(otherOrganisation.status, 'other roles keep 403').toBe(403)
  })
})
