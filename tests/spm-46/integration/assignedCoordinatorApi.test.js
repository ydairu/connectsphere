// SPM-46 API suite — in-memory harness. Real HTTP against the real Express app, authenticate middleware,
// shared/permissions.js and shared/assignedCoordinator.js. Mocked: Firebase token verification (a test token
// names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded requests and the
// users/{uid} profiles the name is read from). This is not database verification.
//
// Reassignment is SPM-26 and has no route yet, so criterion 3 is tested by changing assignedCoordinatorUid
// in the fixture, as SPM-65 did.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { DRAFT, SUBMITTED } from '../../../shared/status.js'
import { RESUBMIT } from '../../../shared/statusTransitions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const {
  attendee,
  coordinator,
  coordinator2,
  organiserA1,
  organiserA2,
  organiserB1,
  technicalStaff,
  venueStaff,
  venueTechnicalStaff,
} = SEED_ACCOUNTS
const COORDINATORS = [SEED_ACCOUNTS.coordinator, SEED_ACCOUNTS.coordinator2, SEED_ACCOUNTS.coordinator3]

const SUBMITTED_ID = 'seed-req-a1-submitted'
const RETURNED_ID = 'seed-req-a1-returned'
const PLANNING_ID = 'seed-req-a1-planning'
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const DRAFT_ID = 'seed-req-a1-draft'

// A submitted event with no Coordinator: the case Week 7 Change 5's unassigned queue will make common.
const UNASSIGNED_ID = 'spm46-unassigned-submitted'
const { assignedCoordinatorUid: _unused, ...unassignedSeed } = SEED_REQUESTS.find((request) => request.id === SUBMITTED_ID)
const UNASSIGNED = { ...unassignedSeed, id: UNASSIGNED_ID, core: { ...unassignedSeed.core, title: 'A1 submitted, no Coordinator yet' } }

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
    eventRequests: Object.fromEntries([...SEED_REQUESTS, UNASSIGNED].map(({ id, ...request }) => [id, request])),
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

const view = (account, id) => call('GET', `/api/requests/${id}`, account)
const setStored = (id, changes) => {
  const records = db.collectionData('eventRequests')
  records.set(id, { ...records.get(id), ...changes })
}

/** The response leaks no coordinator identity beyond the display name. */
function expectNameOnly(response, coordinatorAccount) {
  expect(Object.keys(response.json.assignedCoordinator).sort()).toEqual(['assigned', 'name'])
  for (const account of COORDINATORS) {
    expect(response.text).not.toContain(account.uid)
    expect(response.text).not.toContain(account.email)
  }
  expect(response.text).not.toContain('assignedCoordinatorUid')
  expect(response.text).not.toContain('"roles"')
  if (coordinatorAccount) expect(response.json.assignedCoordinator.name).toBe(coordinatorAccount.name)
}

describe('SPM-46 AC2 — the Organiser sees the assigned Coordinator by name', () => {
  it('Test 1: the owning Organiser sees the Coordinator name on their submitted event', async () => {
    const response = await view(organiserA1, SUBMITTED_ID)
    expect(response.status).toBe(200)
    expect(response.json.assignedCoordinator).toEqual({ assigned: true, name: coordinator.name })
  })

  it('a same-organisation colleague who may view the event sees it too [team decision, 3 Oct 2026]', async () => {
    const response = await view(organiserA2, SUBMITTED_ID)
    expect(response.status).toBe(200)
    expect(response.json.assignedCoordinator).toEqual({ assigned: true, name: coordinator.name })
  })

  it.each(SEED_REQUESTS.filter((request) => request.ownerUid === organiserA1.uid && request.status !== DRAFT).map((request) => [request.status, request]))(
    'AC1: at %s there is exactly one Coordinator, the stored one',
    async (_status, request) => {
      const response = await view(organiserA1, request.id)
      expect(response.status).toBe(200)
      const summary = response.json.assignedCoordinator
      expect(Array.isArray(summary)).toBe(false)
      const expected = COORDINATORS.find((account) => account.uid === request.assignedCoordinatorUid)
      expect(summary).toEqual({ assigned: true, name: expected.name })
    },
  )
})

describe('SPM-46 — the response carries the name only (Test 2)', () => {
  it('GET returns no Coordinator uid, email, roles or other profile field', async () => {
    expectNameOnly(await view(organiserA1, SUBMITTED_ID), coordinator)
  })

  it('a section save (PATCH) returns the name on the same terms, so the page keeps showing it', async () => {
    const response = await call('PATCH', `/api/requests/${RETURNED_ID}`, organiserA1, { core: { title: 'A1 returned, amended' } })
    expect(response.status).toBe(200)
    expectNameOnly(response, coordinator)
  })

  it('a status action returns the name on the same terms', async () => {
    const response = await call('POST', `/api/event-requests/${RETURNED_ID}/transitions`, organiserA1, { action: RESUBMIT })
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(SUBMITTED)
    expectNameOnly(response, coordinator)
  })
})

describe('SPM-46 AC3 — a changed Coordinator is shown on the next view (Test 3)', () => {
  it('after assignedCoordinatorUid changes in the fixture, the Organiser sees the new name', async () => {
    expect((await view(organiserA1, SUBMITTED_ID)).json.assignedCoordinator.name).toBe(coordinator.name)

    setStored(SUBMITTED_ID, { assignedCoordinatorUid: coordinator2.uid })

    const response = await view(organiserA1, SUBMITTED_ID)
    expect(response.json.assignedCoordinator).toEqual({ assigned: true, name: coordinator2.name })
    expectNameOnly(response, coordinator2)
  })

  it('a renamed Coordinator profile is read fresh on the next view', async () => {
    const users = db.collectionData('users')
    users.set(coordinator.uid, { ...users.get(coordinator.uid), name: 'Renamed Coordinator' })
    expect((await view(organiserA1, SUBMITTED_ID)).json.assignedCoordinator.name).toBe('Renamed Coordinator')
  })
})

describe('SPM-46 — a submitted event with no Coordinator (Test 4)', () => {
  it('is "not yet assigned": assigned false and no name', async () => {
    const response = await view(organiserA1, UNASSIGNED_ID)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(SUBMITTED)
    expect(response.json.assignedCoordinator).toEqual({ assigned: false, name: null })
  })

  it('the colleague sees the same', async () => {
    expect((await view(organiserA2, UNASSIGNED_ID)).json.assignedCoordinator).toEqual({ assigned: false, name: null })
  })

  it('a Coordinator assigned later then shows by name', async () => {
    setStored(UNASSIGNED_ID, { assignedCoordinatorUid: coordinator2.uid })
    expect((await view(organiserA1, UNASSIGNED_ID)).json.assignedCoordinator).toEqual({ assigned: true, name: coordinator2.name })
  })

  it('a Coordinator whose profile is missing is assigned, name unavailable — never "not yet assigned"', async () => {
    setStored(SUBMITTED_ID, { assignedCoordinatorUid: 'seed-coordinator-deleted' })
    const response = await view(organiserA1, SUBMITTED_ID)
    expect(response.json.assignedCoordinator).toEqual({ assigned: true, name: null })
    expect(response.text).not.toContain('seed-coordinator-deleted')
  })
})

describe('SPM-46 — drafts show no Coordinator (Test 5)', () => {
  it('the owner reading their draft gets assignedCoordinator null', async () => {
    const response = await view(organiserA1, DRAFT_ID)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(DRAFT)
    expect(response.json.assignedCoordinator).toBeNull()
  })

  it('the draft editor route is unchanged and carries no Coordinator', async () => {
    const response = await call('GET', `/api/event-requests/${DRAFT_ID}`, organiserA1)
    expect(response.status).toBe(200)
    expect(response.text).not.toContain('assignedCoordinator')
  })
})

describe('SPM-46 — scope (Test 6, regression)', () => {
  it('an Organiser of another organisation is refused and receives no Coordinator name', async () => {
    const response = await view(organiserB1, SUBMITTED_ID)
    expect(response.status).toBe(403)
    expect(response.text).not.toContain(coordinator.name)
  })

  it('a colleague cannot see the Coordinator of the owner\'s draft', async () => {
    const response = await view(organiserA2, DRAFT_ID)
    expect(response.status).toBe(403)
    expect(response.text).not.toContain('Coordinator')
  })

  it('an out-of-scope status action is refused without the name', async () => {
    const response = await call('POST', `/api/event-requests/${SUBMITTED_ID}/transitions`, organiserB1, { action: 'request_cancellation' })
    expect([403, 404]).toContain(response.status)
    expect(response.text).not.toContain(coordinator.name)
  })

  it('the request list is unchanged: no Coordinator name or uid for the Organiser', async () => {
    const response = await call('GET', '/api/requests', organiserA1)
    expect(response.status).toBe(200)
    expect(response.text).not.toContain('assignedCoordinator')
    for (const account of COORDINATORS) expect(response.text).not.toContain(account.name)
  })
})

describe('SPM-46 — other roles see exactly what they saw before', () => {
  it.each([
    ['the assigned Coordinator', coordinator, SUBMITTED_ID],
    ['Venue Staff', venueStaff, PLANNING_ID],
    ['Technical Support Staff', technicalStaff, PLANNING_ID],
    ['Venue + Technical Staff', venueTechnicalStaff, PLANNING_ID],
    ['an Attendee', attendee, CONFIRMED_ID],
  ])('%s receives assignedCoordinator null', async (_label, account, id) => {
    const response = await view(account, id)
    expect(response.status).toBe(200)
    expect(response.json.assignedCoordinator).toBeNull()
  })

  it('staff and attendees still receive no Coordinator uid or name anywhere in the body', async () => {
    for (const [account, id] of [[venueStaff, PLANNING_ID], [technicalStaff, PLANNING_ID], [attendee, CONFIRMED_ID]]) {
      const response = await view(account, id)
      for (const coordinatorAccount of COORDINATORS) {
        expect(response.text).not.toContain(coordinatorAccount.uid)
        expect(response.text).not.toContain(coordinatorAccount.name)
      }
    }
  })

  it('the Coordinator keeps the record metadata the SPM-42 projection already gave them', async () => {
    const response = await view(coordinator, SUBMITTED_ID)
    expect(response.json.request.assignedCoordinatorUid).toBe(coordinator.uid)
  })
})
