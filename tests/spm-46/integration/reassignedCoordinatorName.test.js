// Cross-story: SPM-46 × SPM-26. After the event is reassigned through the real SPM-26 route — by the Event
// Coordinator Lead since SPM-69 — the Organiser's view of that event names the new Coordinator (SPM-46 AC3, which
// until SPM-26 was tested only by changing assignedCoordinatorUid in the fixture). Not an SPM-64 test.
//
// In-memory harness: real HTTP against the real Express app; Firebase token verification and persistence
// (backend/src/testing/fakeFirestore.js, holding the seeded requests and profiles) are mocked. This is not
// database verification.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { coordinator, coordinator2, coordinator3, organiserA1, organiserA2, organiserB1 } = SEED_ACCOUNTS
const ID = 'seed-req-a1-submitted'

let db
let server
let baseUrl

beforeAll(async () => {
  const authenticate = createAuthenticate({
    async verifyIdToken(token) {
      if (!token.startsWith(TOKEN_PREFIX)) throw new Error('invalid test token')
      return { uid: token.slice(TOKEN_PREFIX.length) }
    },
    async loadProfile(uid) {
      return db.collectionData('users').get(uid) ?? null
    },
  })
  const app = createApp({
    authenticate,
    eventRequestStore: createFakeFirestoreEventRequestStore(() => db),
    getEventRequestDb: () => db,
  })
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  db = createFakeFirestore({
    eventRequests: Object.fromEntries(SEED_REQUESTS.map(({ id, ...request }) => [id, request])),
    users: Object.fromEntries(Object.values(SEED_ACCOUNTS).map(({ uid, ...profile }) => [uid, profile])),
  })
})

async function call(method, path, account, body) {
  const headers = { Authorization: `Bearer ${TOKEN_PREFIX}${account.uid}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, text, json: text ? JSON.parse(text) : null }
}

const view = (account) => call('GET', `/api/requests/${ID}`, account)
// SPM-69: the Lead reassigns, naming the Coordinator the event has now (`from`) and the new one (`to`).
const reassign = (from, to, account = SEED_ACCOUNTS.coordinatorLead) =>
  call('POST', `/api/event-requests/${ID}/reassignment`, account, { coordinatorUid: to.uid, expectedCoordinatorUid: from.uid })

describe('SPM-46 × SPM-26 — the Organiser sees the Coordinator an event was reassigned to', () => {
  it('after reassignment, the owner\'s GET names the new Coordinator and no uid', async () => {
    expect((await view(organiserA1)).json.assignedCoordinator).toEqual({ assigned: true, name: coordinator.name })

    expect((await reassign(coordinator, coordinator2)).status).toBe(200)

    const response = await view(organiserA1)
    expect(response.status).toBe(200)
    expect(response.json.assignedCoordinator).toEqual({ assigned: true, name: coordinator2.name })
    expect(response.text).not.toContain(`"${coordinator2.uid}"`)
    expect(response.text).not.toContain(`"${coordinator.uid}"`)
  })

  it('a same-organisation colleague sees the new name too', async () => {
    await reassign(coordinator, coordinator2)
    expect((await view(organiserA2)).json.assignedCoordinator).toEqual({ assigned: true, name: coordinator2.name })
  })

  it('a second reassignment is followed as well', async () => {
    await reassign(coordinator, coordinator2)
    expect((await reassign(coordinator2, coordinator3)).status).toBe(200)
    expect((await view(organiserA1)).json.assignedCoordinator).toEqual({ assigned: true, name: coordinator3.name })
  })

  it('a refused reassignment leaves the Organiser seeing the original Coordinator', async () => {
    // SPM-69: the assigned Coordinator may no longer reassign.
    expect((await reassign(coordinator, coordinator3, coordinator)).status).toBe(403)
    expect((await view(organiserA1)).json.assignedCoordinator).toEqual({ assigned: true, name: coordinator.name })
  })

  it('an Organiser outside the event still gets no Coordinator name', async () => {
    await reassign(coordinator, coordinator2)
    const response = await view(organiserB1)
    expect(response.status).toBe(403)
    expect(response.text).not.toContain(coordinator2.name)
  })
})
