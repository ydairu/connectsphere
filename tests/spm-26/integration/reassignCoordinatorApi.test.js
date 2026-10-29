// SPM-26 API suite — in-memory harness. Real HTTP against the real Express app, authenticate middleware,
// shared/permissions.js and shared/coordinatorReassignment.js. SPM-69 made reassignment Lead-only (CL3 G8!C35,
// C39) and removed the handover-agreement flag: the Event Coordinator Lead now reassigns, sending the Coordinator
// their page showed, and the assigned Coordinator is refused. Lead-specific cases are in tests/spm-69. Mocked: Firebase token verification (a test
// token names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded requests
// and profiles). This is not database verification, and there is no live-project variant: a live run would
// reassign seeded events and leave activity entries behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { ASSIGNMENT_LOCK_PATH } from '../../../backend/src/services/coordinatorAssignmentService.js'
import { COORDINATOR_REASSIGNED } from '../../../backend/src/services/coordinatorReassignmentService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { countActiveAssignments } from '../../../shared/coordinatorAssignment.js'
import { TARGET_IS_SELF } from '../../../shared/coordinatorLeadAssignment.js'
import {
  EXPECTED_COORDINATOR_REQUIRED,
  NOT_PERMITTED,
  TARGET_IS_CURRENT,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
  TERMINAL_STATUS,
} from '../../../shared/coordinatorReassignment.js'
import { START_REVIEW } from '../../../shared/statusTransitions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { attendee, coordinator, coordinator2, coordinator3, coordinatorLead: lead, organiserA1, organiserB1, venueStaff } = SEED_ACCOUNTS

const SUBMITTED_ID = 'seed-req-a1-submitted'
const PLANNING_ID = 'seed-req-a1-planning'
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const TERMINAL = [
  ['completed', 'seed-req-a1-completed', coordinator],
  ['cancelled', 'seed-req-a1-cancelled', coordinator2],
  ['rejected', 'seed-req-a1-rejected', coordinator],
]

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

const reassign = (account, id, body) => call('POST', `/api/event-requests/${id}/reassignment`, account, body)
const candidates = (account, id) => call('GET', `/api/event-requests/${id}/reassignment/candidates`, account)
const view = (account, id) => call('GET', `/api/requests/${id}`, account)
const listIds = async (account) => (await call('GET', '/api/requests', account)).json.requests.map((request) => request.id)
const stored = (id) => structuredClone(db.store.get(id))
const activity = (id) => [...db.collectionData(`eventRequests/${id}/activity`).values()]
// SPM-69: the body names the new Coordinator and the one the Lead's page showed (the event's current one).
const handTo = (account, id = SUBMITTED_ID) => ({ coordinatorUid: account.uid, expectedCoordinatorUid: stored(id).assignedCoordinatorUid })

describe('SPM-26 AC2 — the Lead reassigns the event (Test 1; SPM-69: Lead-only)', () => {
  it('updates assignedCoordinatorUid and returns only the new Coordinator name', async () => {
    const response = await reassign(lead, SUBMITTED_ID, handTo(coordinator2))
    expect(response.status).toBe(200)
    expect(response.json).toEqual({ reassigned: true, coordinator: { name: coordinator2.name } })
    expect(stored(SUBMITTED_ID).assignedCoordinatorUid).toBe(coordinator2.uid)
  })

  it('AC1: there is still exactly one Coordinator, and the Lead can reassign it again', async () => {
    await reassign(lead, SUBMITTED_ID, handTo(coordinator2))
    const again = await reassign(lead, SUBMITTED_ID, handTo(coordinator3))
    expect(again.status).toBe(200)
    expect(stored(SUBMITTED_ID).assignedCoordinatorUid).toBe(coordinator3.uid)
    expect(activity(SUBMITTED_ID).map((entry) => [entry.previousCoordinatorUid, entry.coordinatorUid])).toEqual([
      [coordinator.uid, coordinator2.uid],
      [coordinator2.uid, coordinator3.uid],
    ])
  })

  it('the event page offers Reassign to the Lead only, never to the assigned Coordinator', async () => {
    expect((await view(lead, SUBMITTED_ID)).json.canReassignCoordinator).toBe(true)
    expect((await view(coordinator, SUBMITTED_ID)).json.canReassignCoordinator).toBe(false)
    expect((await view(organiserA1, SUBMITTED_ID)).json.canReassignCoordinator).toBe(false)
    expect((await view(venueStaff, PLANNING_ID)).json.canReassignCoordinator).toBe(false)
    // A finished event has left the Lead's view (CL3 G8!C41: active events).
    expect((await view(lead, 'seed-req-a1-completed')).status).toBe(403)
  })
})

describe('SPM-26 — invalid targets are refused, record unchanged (Tests 2–3)', () => {
  it.each([
    ['a non-Coordinator', () => handTo(venueStaff), TARGET_NOT_COORDINATOR],
    ['the current Coordinator', () => handTo(coordinator), TARGET_IS_CURRENT],
    ['an unknown uid', () => ({ ...handTo(coordinator2), coordinatorUid: 'seed-nobody' }), TARGET_NOT_COORDINATOR],
    ['no Coordinator chosen', () => ({ expectedCoordinatorUid: coordinator.uid }), TARGET_REQUIRED],
    ['the Lead themselves', () => handTo(lead), TARGET_IS_SELF],
    ['no current Coordinator sent (SPM-69)', () => ({ coordinatorUid: coordinator2.uid }), EXPECTED_COORDINATOR_REQUIRED],
    ['an empty body', () => undefined, EXPECTED_COORDINATOR_REQUIRED],
  ])('%s → 400', async (_label, body, reason) => {
    const before = stored(SUBMITTED_ID)
    const response = await reassign(lead, SUBMITTED_ID, body())
    expect(response.status).toBe(400)
    expect(response.json.reason).toBe(reason)
    expect(response.json.message).toEqual(expect.any(String))
    expect(stored(SUBMITTED_ID)).toEqual(before)
    expect(activity(SUBMITTED_ID)).toEqual([])
  })
})

describe('SPM-26 AC8 / SPM-69 — Coordinators and other roles cannot reassign (Test 4)', () => {
  it('SPM-69: the assigned Coordinator is refused with 403 and nothing changes', async () => {
    const before = stored(SUBMITTED_ID)
    const response = await reassign(coordinator, SUBMITTED_ID, handTo(coordinator2))
    expect(response.status).toBe(403)
    expect(response.json.reason).toBe(NOT_PERMITTED)
    expect(stored(SUBMITTED_ID)).toEqual(before)
    expect(activity(SUBMITTED_ID)).toEqual([])
  })

  it('a Coordinator who cannot see the event gets 404, like a missing event, and nothing changes', async () => {
    const before = stored(SUBMITTED_ID)
    const response = await reassign(coordinator2, SUBMITTED_ID, handTo(coordinator3))
    const missing = await reassign(coordinator2, 'seed-req-does-not-exist', handTo(coordinator3))
    expect(response.status).toBe(404)
    expect(response.json).toEqual(missing.json)
    expect(stored(SUBMITTED_ID)).toEqual(before)
    expect(activity(SUBMITTED_ID)).toEqual([])
    expect((await reassign(coordinator2, SUBMITTED_ID)).status).toBe(404)
  })

  it('other roles are refused without a change', async () => {
    expect((await reassign(organiserA1, SUBMITTED_ID, handTo(coordinator2))).json.reason).toBe(NOT_PERMITTED)
    expect((await reassign(organiserA1, SUBMITTED_ID, handTo(coordinator2))).status).toBe(403)
    expect((await reassign(venueStaff, PLANNING_ID, handTo(coordinator2, PLANNING_ID))).status).toBe(403)
    expect((await reassign(organiserB1, SUBMITTED_ID, handTo(coordinator2))).status).toBe(403)
    expect((await reassign(attendee, CONFIRMED_ID, handTo(coordinator2, CONFIRMED_ID))).status).toBe(403)
    expect(stored(SUBMITTED_ID).assignedCoordinatorUid).toBe(coordinator.uid)
  })
})

describe('SPM-26 AC9 / SPM-69 AC2 — terminal events cannot be reassigned (Test 5)', () => {
  it.each(TERMINAL)('%s → 409, unchanged', async (_status, id, assigned) => {
    const target = assigned.uid === coordinator.uid ? coordinator3 : coordinator
    const before = stored(id)
    const response = await reassign(lead, id, handTo(target, id))
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(TERMINAL_STATUS)
    expect(stored(id)).toEqual(before)
    expect((await candidates(lead, id)).status).toBe(409)
  })
})

describe('SPM-26 AC7 — nothing but the assignment changes (Test 6)', () => {
  it.each([
    ['planning', PLANNING_ID, coordinator],
    ['confirmed', CONFIRMED_ID, coordinator3],
  ])('at %s: status, venue, equipment and every other field are unchanged', async (_status, id, assigned) => {
    const before = stored(id)
    const target = assigned.uid === coordinator.uid ? coordinator2 : coordinator
    const response = await reassign(lead, id, handTo(target, id))
    expect(response.status).toBe(200)

    // SPM-69: assignedByUid and assignedAt name the reassigning Lead.
    const { assignedCoordinatorUid, assignedByUid, assignedAt, updatedAt, ...rest } = stored(id)
    const { assignedCoordinatorUid: _previous, updatedAt: _previousUpdate, ...restBefore } = before
    expect(assignedCoordinatorUid).toBe(target.uid)
    expect(assignedByUid).toBe(lead.uid)
    expect(assignedAt).toBe(updatedAt)
    expect(updatedAt).toEqual(expect.any(String))
    expect(rest).toEqual(restBefore)
    expect(rest.status).toBe(before.status)
    expect(rest.venue).toEqual(before.venue)
    expect(rest.equipment).toEqual(before.equipment)
    // A reassignment is not a status change: no status_changed entry.
    expect(activity(id).map((entry) => entry.type)).toEqual([COORDINATOR_REASSIGNED])
  })

  it('a pending cancellation request stays pending for the new Coordinator', async () => {
    expect((await call('POST', `/api/event-requests/${CONFIRMED_ID}/transitions`, organiserA1, { action: 'request_cancellation', reason: 'Budget' })).status).toBe(200)
    const response = await reassign(lead, CONFIRMED_ID, handTo(coordinator, CONFIRMED_ID))
    expect(response.status).toBe(200)
    expect(stored(CONFIRMED_ID).cancellationRequest.status).toBe('pending')
    expect((await view(coordinator, CONFIRMED_ID)).json.availableActions).toContain('approve_cancellation')
  })
})

describe('SPM-26 AC6 — activity history (Test 7)', () => {
  it('records previous, new, actor and timestamp, with the lock, in the request\'s committed transaction', async () => {
    const start = Date.now()
    await reassign(lead, SUBMITTED_ID, handTo(coordinator2))
    const [entry] = activity(SUBMITTED_ID)
    expect(entry).toEqual({
      type: COORDINATOR_REASSIGNED,
      previousCoordinatorUid: coordinator.uid,
      coordinatorUid: coordinator2.uid,
      actor: { type: 'user', uid: lead.uid, name: lead.name },
      at: expect.any(String),
    })
    expect(Date.parse(entry.at)).toBeGreaterThanOrEqual(start - 1000)
    expect(entry.at).toBe(stored(SUBMITTED_ID).updatedAt)

    const committed = db.transactions.filter((tx) => tx.committed)
    expect(committed).toHaveLength(1)
    expect(committed[0].writes).toContain(`eventRequests/${SUBMITTED_ID}`)
    expect(committed[0].writes).toContain(ASSIGNMENT_LOCK_PATH.join('/'))
    expect(committed[0].writes.some((path) => path.startsWith(`eventRequests/${SUBMITTED_ID}/activity/`))).toBe(true)
  })
})

describe('SPM-26 AC4–5 — visibility moves with the event (Test 8)', () => {
  it('the new Coordinator lists and opens it; the previous one no longer lists it and gets 404', async () => {
    expect(await listIds(coordinator)).toContain(SUBMITTED_ID)
    expect(await listIds(coordinator2)).not.toContain(SUBMITTED_ID)

    await reassign(lead, SUBMITTED_ID, handTo(coordinator2))

    expect(await listIds(coordinator2)).toContain(SUBMITTED_ID)
    expect((await view(coordinator2, SUBMITTED_ID)).status).toBe(200)
    expect(await listIds(coordinator)).not.toContain(SUBMITTED_ID)
    expect((await view(coordinator, SUBMITTED_ID)).status).toBe(404)
  })

  it('status actions move too: the new Coordinator can act, the previous one gets 404', async () => {
    await reassign(lead, SUBMITTED_ID, handTo(coordinator2))
    expect((await call('POST', `/api/event-requests/${SUBMITTED_ID}/transitions`, coordinator, { action: START_REVIEW })).status).toBe(404)
    expect((await call('POST', `/api/event-requests/${SUBMITTED_ID}/transitions`, coordinator2, { action: START_REVIEW })).status).toBe(200)
  })

  it('the Organiser still sees the event, unchanged', async () => {
    await reassign(lead, SUBMITTED_ID, handTo(coordinator2))
    const response = await view(organiserA1, SUBMITTED_ID)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe('submitted')
  })
})

describe('SPM-26 AC3 — the eligible-Coordinator list (Test 9; SPM-69: with workload and the current Coordinator)', () => {
  it('the Lead gets every other Coordinator with their active events, and the current Coordinator', async () => {
    const counts = countActiveAssignments(SEED_REQUESTS)
    const response = await candidates(lead, SUBMITTED_ID)
    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      coordinators: [
        { uid: coordinator2.uid, name: coordinator2.name, activeEvents: counts.get(coordinator2.uid) ?? 0 },
        { uid: coordinator3.uid, name: coordinator3.name, activeEvents: counts.get(coordinator3.uid) ?? 0 },
      ],
      currentCoordinator: { uid: coordinator.uid, name: coordinator.name },
    })
    expect(response.text).not.toContain('@')
    expect(response.text).not.toContain('roles')
  })

  it('never lists non-Coordinators', async () => {
    const uids = (await candidates(lead, SUBMITTED_ID)).json.coordinators.map(({ uid }) => uid)
    for (const account of [venueStaff, attendee, organiserA1, lead]) expect(uids).not.toContain(account.uid)
  })

  it('the assigned Coordinator gets 403 (SPM-69); an unassigned Coordinator 404; other roles 403', async () => {
    expect((await candidates(coordinator, SUBMITTED_ID)).status).toBe(403)
    expect((await candidates(coordinator2, SUBMITTED_ID)).status).toBe(404)
    expect((await candidates(organiserA1, SUBMITTED_ID)).status).toBe(403)
    expect((await candidates(organiserB1, SUBMITTED_ID)).status).toBe(403)
    expect((await candidates(venueStaff, PLANNING_ID)).status).toBe(403)
    expect((await candidates(attendee, CONFIRMED_ID)).status).toBe(403)
  })

  it('excludes the event\'s submitter when they are also a Coordinator (extends SPM-8\'s rule)', async () => {
    const dual = { uid: 'seed-organiser-coordinator', email: 'dual@seed.connectsphere.test', name: 'Dual Role', roles: ['organiser', 'coordinator'], organisationId: 'SEED-ORG-A', organisationName: 'Seed Organisation A' }
    db.collectionData('users').set(dual.uid, dual)
    const record = stored(SUBMITTED_ID)
    db.store.set(SUBMITTED_ID, { ...record, ownerUid: dual.uid })

    const uids = (await candidates(lead, SUBMITTED_ID)).json.coordinators.map(({ uid }) => uid)
    expect(uids).not.toContain(dual.uid)
    const response = await reassign(lead, SUBMITTED_ID, handTo(dual))
    expect(response.status).toBe(400)
    expect(stored(SUBMITTED_ID).assignedCoordinatorUid).toBe(coordinator.uid)
  })
})
