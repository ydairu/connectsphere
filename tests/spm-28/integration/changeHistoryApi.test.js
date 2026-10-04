// SPM-28 API suite — in-memory harness. Real HTTP against the real Express app, authenticate and authorise
// middleware, shared/permissions.js and shared/changeHistory.js. Mocked: Firebase token verification (a
// test token names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded
// requests, profiles and SEED_FIELD_HISTORY, with the E2E double's store over it). This is not database
// verification: fakeFirestore does not model Firestore's transaction retries or server timestamps.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_FIELD_HISTORY, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { StaleWriteError } from '../../../backend/src/services/eventRequestStore.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { FIELD_CHANGED } from '../../../shared/changeHistory.js'
import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { attendee, coordinator, coordinator2, organiserA1, organiserA2, organiserB1, technicalStaff, venueStaff } = SEED_ACCOUNTS

const DRAFT_ID = 'seed-req-a1-draft'
const SUBMITTED_ID = 'seed-req-a1-submitted'
const RETURNED_ID = 'seed-req-a1-returned'
const PLANNING_ID = 'seed-req-a1-planning'
const CONFIRMED_ID = 'seed-req-a1-confirmed'
const SEEDED_IDS = SEED_FIELD_HISTORY[PLANNING_ID].map((entry) => entry.id)

let db
let store
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
  store = createFakeFirestoreEventRequestStore(() => db)
  const app = createApp({ authenticate, eventRequestStore: store, getEventRequestDb: () => db })
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
    [`eventRequests/${PLANNING_ID}/activity`]: Object.fromEntries(SEED_FIELD_HISTORY[PLANNING_ID].map(({ id, ...entry }) => [id, entry])),
  })
})

async function call(method, path, account, body) {
  const headers = { Authorization: `Bearer ${TOKEN_PREFIX}${account.uid}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, text, json: text ? JSON.parse(text) : null }
}

const patch = (account, id, body) => call('PATCH', `/api/requests/${id}`, account, body)
const history = (account, id) => call('GET', `/api/requests/${id}/history`, account)
const view = (account, id) => call('GET', `/api/requests/${id}`, account)
const activity = (id) => [...db.collectionData(`eventRequests/${id}/activity`)].map(([entryId, entry]) => ({ id: entryId, ...entry }))
const recorded = (id) => activity(id).filter((entry) => entry.type === FIELD_CHANGED && !SEEDED_IDS.includes(entry.id))
const committed = () => db.transactions.filter((tx) => tx.committed)

describe('SPM-28 AC1/AC2 — an entry per changed field, after submission', () => {
  it('Coordinator at Submitted: one entry per changed field, none for an unchanged one in the same save', async () => {
    const before = db.store.get(SUBMITTED_ID)
    const start = Date.now()
    const response = await patch(coordinator, SUBMITTED_ID, { core: { title: 'Renamed', purpose: before.core.purpose, expectedAttendees: 120 } })
    expect(response.status).toBe(200)

    const entries = recorded(SUBMITTED_ID)
    expect(entries.map((entry) => entry.field).sort()).toEqual(['core.expectedAttendees', 'core.title'])
    const title = entries.find((entry) => entry.field === 'core.title')
    expect(title).toMatchObject({
      type: FIELD_CHANGED,
      oldValue: before.core.title,
      newValue: 'Renamed',
      actor: { type: 'user', uid: coordinator.uid, name: coordinator.name, role: COORDINATOR },
    })
    expect(Date.parse(title.at)).toBeGreaterThanOrEqual(start - 1000)
  })

  it('the owning Organiser at Returned is recorded as the Organiser', async () => {
    const response = await patch(organiserA1, RETURNED_ID, { core: { purpose: 'Updated purpose' } })
    expect(response.status).toBe(200)
    expect(recorded(RETURNED_ID)).toEqual([
      expect.objectContaining({ field: 'core.purpose', newValue: 'Updated purpose', actor: { type: 'user', uid: organiserA1.uid, name: organiserA1.name, role: ORGANISER } }),
    ])
  })

  it('Venue Staff at Planning, on their section', async () => {
    expect((await patch(venueStaff, PLANNING_ID, { venue: { layoutPreference: 'banquet' } })).status).toBe(200)
    expect(recorded(PLANNING_ID)).toEqual([
      expect.objectContaining({ field: 'venue.layoutPreference', oldValue: 'theatre', newValue: 'banquet', actor: expect.objectContaining({ role: VENUE_STAFF }) }),
    ])
  })

  it('the Coordinator\'s internal planning edit is recorded', async () => {
    expect((await patch(coordinator, PLANNING_ID, { internal: { planningNotes: 'Hall B confirmed' } })).status).toBe(200)
    expect(recorded(PLANNING_ID).map((entry) => entry.field)).toEqual(['internal.planningNotes'])
  })

  it('arrays are compared by value', async () => {
    const { requirements } = db.store.get(PLANNING_ID).equipment
    expect((await patch(technicalStaff, PLANNING_ID, { equipment: { requirements: [...requirements] } })).status).toBe(200)
    expect(recorded(PLANNING_ID)).toEqual([])
    expect((await patch(technicalStaff, PLANNING_ID, { equipment: { requirements: [...requirements, 'lectern'] } })).status).toBe(200)
    expect(recorded(PLANNING_ID)).toEqual([expect.objectContaining({ field: 'equipment.requirements', oldValue: requirements, newValue: [...requirements, 'lectern'] })])
  })

  it('the field write and its entries are committed in the same transaction', async () => {
    await patch(coordinator, SUBMITTED_ID, { core: { title: 'Renamed' }, venue: { layoutPreference: 'cabaret' } })
    const [tx] = committed()
    expect(committed()).toHaveLength(1)
    expect(tx.writes).toContain(`eventRequests/${SUBMITTED_ID}`)
    expect(tx.writes.filter((path) => path.startsWith(`eventRequests/${SUBMITTED_ID}/activity/`))).toHaveLength(2)
  })

  it('the PATCH response is unchanged apart from the canViewChangeHistory flag', async () => {
    const response = await patch(coordinator, SUBMITTED_ID, { core: { title: 'Renamed' } })
    expect(response.json.request.core.title).toBe('Renamed')
    expect(response.json.canViewChangeHistory).toBe(true)
    expect(response.json).not.toHaveProperty('entries')
  })
})

describe('SPM-28 AC3/AC4 — nothing is recorded', () => {
  it('AC3: the owner saving a Draft through PATCH /api/requests', async () => {
    expect((await patch(organiserA1, DRAFT_ID, { core: { title: 'Draft renamed' } })).status).toBe(200)
    expect(activity(DRAFT_ID)).toEqual([])
  })

  it('AC3: the owner saving a Draft through the SPM-4 draft route', async () => {
    const response = await call('PATCH', `/api/event-requests/${DRAFT_ID}`, organiserA1, { core: { title: 'Draft renamed again' } })
    expect(response.status).toBe(200)
    expect(activity(DRAFT_ID)).toEqual([])
  })

  it('AC4: a save that changes no value', async () => {
    const { title } = db.store.get(SUBMITTED_ID).core
    expect((await patch(coordinator, SUBMITTED_ID, { core: { title } })).status).toBe(200)
    expect(recorded(SUBMITTED_ID)).toEqual([])
  })

  it('AC4: a refused save (403, forbidden field) writes no history and runs no transaction', async () => {
    const response = await patch(venueStaff, PLANNING_ID, { venue: { layoutPreference: 'banquet' }, equipment: { technicalSupportNeeded: false } })
    expect(response.status).toBe(403)
    expect(recorded(PLANNING_ID)).toEqual([])
    expect(committed()).toEqual([])
  })

  it('AC4: a stale save fails and leaves no entries', async () => {
    const { version } = await store.get(SUBMITTED_ID)
    await patch(coordinator, SUBMITTED_ID, { core: { title: 'First' } })
    const before = recorded(SUBMITTED_ID)
    await expect(store.update(SUBMITTED_ID, { core: { title: 'Second' } }, { version, recordChanges: () => [{ type: FIELD_CHANGED, field: 'core.title' }] }))
      .rejects.toBeInstanceOf(StaleWriteError)
    expect(recorded(SUBMITTED_ID)).toEqual(before)
    expect(db.store.get(SUBMITTED_ID).core.title).toBe('First')
  })

  it('status transitions and reassignment keep their own activity types', async () => {
    expect((await call('POST', `/api/event-requests/${SUBMITTED_ID}/transitions`, coordinator, { action: 'start_review' })).status).toBe(200)
    expect((await call('POST', `/api/event-requests/${SUBMITTED_ID}/reassignment`, coordinator, { coordinatorUid: coordinator2.uid, handoverAgreed: true })).status).toBe(200)
    expect(activity(SUBMITTED_ID).map((entry) => entry.type).sort()).toEqual(['coordinator_reassigned', 'status_changed'])
  })
})

describe('SPM-28 AC5/AC6 — what each viewer sees', () => {
  it('AC5: the assigned Coordinator sees every entry, newest first, without actor uids', async () => {
    await patch(coordinator, PLANNING_ID, { core: { title: 'Newest change' } })
    const response = await history(coordinator, PLANNING_ID)
    expect(response.status).toBe(200)
    expect(response.json.entries.map((entry) => entry.field)).toEqual(['core.title', 'internal.planningNotes', 'venue.layoutPreference', 'core.expectedAttendees'])
    expect(response.json.entries[0]).toEqual({
      id: expect.any(String),
      field: 'core.title',
      oldValue: SEED_REQUESTS.find((request) => request.id === PLANNING_ID).core.title,
      newValue: 'Newest change',
      actor: { type: 'user', name: coordinator.name, role: COORDINATOR },
      at: expect.any(String),
    })
    for (const account of [coordinator, venueStaff]) expect(response.text).not.toContain(`"${account.uid}"`)
  })

  it('AC6: the owning Organiser sees the same entries except internal planning — absent from the response', async () => {
    const response = await history(organiserA1, PLANNING_ID)
    expect(response.status).toBe(200)
    expect(response.json.entries.map((entry) => entry.field)).toEqual(['venue.layoutPreference', 'core.expectedAttendees'])
    expect(response.text).not.toContain('internal')
    expect(response.text).not.toContain('Seed internal note')
  })

  it('an event with no changes has an empty history', async () => {
    expect((await history(organiserA1, SUBMITTED_ID)).json).toEqual({ entries: [] })
  })

  it('the request response tells the page who may view it', async () => {
    expect((await view(coordinator, PLANNING_ID)).json.canViewChangeHistory).toBe(true)
    expect((await view(organiserA1, PLANNING_ID)).json.canViewChangeHistory).toBe(true)
    expect((await view(organiserA2, PLANNING_ID)).json.canViewChangeHistory).toBe(false)
    expect((await view(venueStaff, PLANNING_ID)).json.canViewChangeHistory).toBe(false)
  })
})

describe('SPM-28 AC7 — everyone else is refused', () => {
  it.each([
    ['an unassigned Coordinator', () => coordinator2, PLANNING_ID, 404],
    ['a same-organisation colleague', () => organiserA2, PLANNING_ID, 403],
    ['assigned Venue Staff', () => venueStaff, PLANNING_ID, 403],
    ['assigned Technical Support Staff', () => technicalStaff, PLANNING_ID, 403],
    ['an Organiser of another organisation', () => organiserB1, PLANNING_ID, 403],
    ['an Attendee on a confirmed event', () => attendee, CONFIRMED_ID, 403],
  ])('%s → %i with no entries', async (_label, account, id, status) => {
    const response = await history(account(), id)
    expect(response.status).toBe(status)
    expect(response.json).not.toHaveProperty('entries')
    expect(response.text).not.toContain('field')
  })

  it('an unassigned Coordinator gets the same 404 as a missing event', async () => {
    expect((await history(coordinator2, PLANNING_ID)).json).toEqual((await history(coordinator2, 'seed-req-missing')).json)
  })
})

describe('SPM-28 AC8 — entries cannot be edited or deleted', () => {
  const entryId = SEEDED_IDS[0]

  it.each([
    ['PUT', `/api/requests/${PLANNING_ID}/history`],
    ['PATCH', `/api/requests/${PLANNING_ID}/history`],
    ['DELETE', `/api/requests/${PLANNING_ID}/history`],
    ['POST', `/api/requests/${PLANNING_ID}/history`],
    ['GET', `/api/requests/${PLANNING_ID}/history/${entryId}`],
    ['PUT', `/api/requests/${PLANNING_ID}/history/${entryId}`],
    ['PATCH', `/api/requests/${PLANNING_ID}/history/${entryId}`],
    ['DELETE', `/api/requests/${PLANNING_ID}/history/${entryId}`],
  ])('%s %s has no route (404) and changes nothing', async (method, path) => {
    const before = activity(PLANNING_ID)
    const response = await call(method, path, coordinator, method === 'GET' || method === 'DELETE' ? undefined : { oldValue: 'tampered' })
    expect(response.status).toBe(404)
    expect(activity(PLANNING_ID)).toEqual(before)
  })

  it('a section PATCH cannot write activity or history keys', async () => {
    const response = await patch(coordinator, PLANNING_ID, { activity: { [entryId]: { oldValue: 'tampered' } } })
    expect(response.status).toBe(403)
    expect(activity(PLANNING_ID).find((entry) => entry.id === entryId).oldValue).toBe(SEED_FIELD_HISTORY[PLANNING_ID][0].oldValue)
  })
})
