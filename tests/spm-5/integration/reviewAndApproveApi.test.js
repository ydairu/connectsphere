// SPM-5 API suite — in-memory harness. Real HTTP against the real Express app, authenticate middleware,
// shared/permissions.js and shared/statusTransitions.js. Mocked: Firebase token verification (a test token
// names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded requests and
// profiles). This is not database verification, and there is no live-project variant: a live run would
// change seeded statuses and leave activity entries behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { PLANNING, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import {
  APPROVE,
  INSUFFICIENT_INFORMATION,
  NOT_PERMITTED,
  REJECT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
} from '../../../shared/statusTransitions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { organiserA1, coordinator, coordinator2, venueStaff } = SEED_ACCOUNTS

const SUBMITTED_ID = 'seed-req-a1-submitted'
const UNDER_REVIEW_ID = 'seed-req-a1-under-review'

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
  const headers = {}
  if (account) headers.Authorization = `Bearer ${TOKEN_PREFIX}${account.uid}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) : null }
}

const act = (account, id, action, reason) =>
  call('POST', `/api/event-requests/${id}/transitions`, account, reason === undefined ? { action } : { action, reason })
const view = (account, id) => call('GET', `/api/requests/${id}`, account)
const statusChanges = (id) =>
  [...db.collectionData(`eventRequests/${id}/activity`).values()].filter((entry) => entry.type === STATUS_CHANGED)

describe('SPM-5 — Review and approve for Planning (API, in-memory only)', () => {
  it('spm5_seed_fixtures_are_assigned_to_the_coordinator', () => {
    expect(db.store.get(SUBMITTED_ID)).toMatchObject({ status: SUBMITTED, assignedCoordinatorUid: coordinator.uid })
    expect(db.store.get(UNDER_REVIEW_ID)).toMatchObject({ status: UNDER_REVIEW, assignedCoordinatorUid: coordinator.uid })
  })

  // AC: review inputs — title, pax, duration, preferred date/time, venue/layout, accessibility, equipment.
  it('spm5_the_assigned_coordinator_receives_every_review_input', async () => {
    const response = await view(coordinator, SUBMITTED_ID)
    expect(response.status).toBe(200)
    const { core, venue, equipment } = response.json.request
    expect(core).toEqual(expect.objectContaining({
      title: expect.any(String),
      expectedAttendees: expect.any(Number),
      durationHours: expect.any(Number),
      preferredDateTime: expect.any(String),
    }))
    expect(venue).toEqual(expect.objectContaining({ layoutPreference: expect.any(String), accessibilityRequired: expect.any(Boolean) }))
    expect(equipment).toEqual(expect.objectContaining({ requirements: expect.any(Array), technicalSupportNeeded: expect.any(Boolean) }))
    expect(response.json.availableActions).toEqual([START_REVIEW])
  })

  // AC: "when they open it for review, then its status changes to Under Review".
  it('spm5_starting_review_moves_submitted_to_under_review_and_records_it', async () => {
    const response = await act(coordinator, SUBMITTED_ID, START_REVIEW)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(UNDER_REVIEW)
    expect(response.json.availableActions).toEqual([RETURN_FOR_CLARIFICATION, APPROVE, REJECT])
    expect(statusChanges(SUBMITTED_ID)).toEqual([
      expect.objectContaining({ action: START_REVIEW, fromStatus: SUBMITTED, toStatus: UNDER_REVIEW, actor: expect.objectContaining({ uid: coordinator.uid }) }),
    ])
  })

  it('spm5_viewing_a_submitted_request_does_not_change_its_status', async () => {
    await view(coordinator, SUBMITTED_ID)
    expect(db.store.get(SUBMITTED_ID).status).toBe(SUBMITTED)
    expect(statusChanges(SUBMITTED_ID)).toEqual([])
  })

  // AC: "with sufficient information, when the assigned Event Coordinator approves it, then ... Planning".
  it('spm5_approving_a_complete_request_moves_it_to_planning_and_records_it', async () => {
    const response = await act(coordinator, UNDER_REVIEW_ID, APPROVE)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(PLANNING)
    expect(statusChanges(UNDER_REVIEW_ID)).toEqual([
      expect.objectContaining({ action: APPROVE, fromStatus: UNDER_REVIEW, toStatus: PLANNING, actor: expect.objectContaining({ uid: coordinator.uid }) }),
    ])
    expect((await view(organiserA1, UNDER_REVIEW_ID)).json.request.status).toBe(PLANNING)
  })

  it('spm5_the_full_flow_from_submitted_to_planning', async () => {
    expect((await act(coordinator, SUBMITTED_ID, START_REVIEW)).status).toBe(200)
    const approved = await act(coordinator, SUBMITTED_ID, APPROVE)
    expect(approved.status).toBe(200)
    expect(approved.json.request.status).toBe(PLANNING)
  })

  // [Engineering recommendation] A required detail cleared during review blocks approval.
  it('spm5_a_request_whose_required_detail_was_cleared_cannot_be_approved', async () => {
    const cleared = await call('PATCH', `/api/requests/${UNDER_REVIEW_ID}`, coordinator, { core: { title: '' } })
    expect(cleared.status).toBe(200)
    expect(cleared.json.availableActions).toEqual([RETURN_FOR_CLARIFICATION, REJECT])

    const response = await act(coordinator, UNDER_REVIEW_ID, APPROVE)
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(INSUFFICIENT_INFORMATION)
    expect(db.store.get(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
    expect(statusChanges(UNDER_REVIEW_ID)).toEqual([])

    // Once completed again, it can be approved.
    await call('PATCH', `/api/requests/${UNDER_REVIEW_ID}`, coordinator, { core: { title: 'A1 under review' } })
    expect((await act(coordinator, UNDER_REVIEW_ID, APPROVE)).status).toBe(200)
  })

  // SPM-10 AC6 changed this: an invalid value for a significant field is refused when entered (400, nothing
  // written), so it can no longer reach the record and block approval later.
  it('spm5_an_invalid_value_entered_during_review_is_refused_and_approval_stays_available', async () => {
    const before = structuredClone(db.store.get(UNDER_REVIEW_ID))
    const refused = await call('PATCH', `/api/requests/${UNDER_REVIEW_ID}`, coordinator, { core: { expectedAttendees: -5 } })
    expect(refused.status).toBe(400)
    expect(Object.keys(refused.json.errors)).toEqual(['core.expectedAttendees'])
    expect(db.store.get(UNDER_REVIEW_ID)).toEqual(before)
    expect((await act(coordinator, UNDER_REVIEW_ID, APPROVE)).status).toBe(200)
  })

  // AC: "Given a request assigned to another Coordinator, when an Event Coordinator attempts to approve,
  // return or reject it (through the interface or directly through the API), then the action is denied."
  it('spm5_another_coordinator_is_denied_approve_return_reject_and_start_review', async () => {
    const missing = await act(coordinator2, 'seed-req-missing', APPROVE)
    expect(missing.status).toBe(404)
    for (const [id, action, reason] of [
      [UNDER_REVIEW_ID, APPROVE],
      [UNDER_REVIEW_ID, RETURN_FOR_CLARIFICATION, 'Please clarify'],
      [UNDER_REVIEW_ID, REJECT],
      [SUBMITTED_ID, START_REVIEW],
    ]) {
      // The same response as for a request that does not exist (SPM-65), so it is not confirmed to exist.
      expect(await act(coordinator2, id, action, reason), action).toEqual(missing)
    }
    // Nor can they open it to act through the interface.
    expect((await view(coordinator2, UNDER_REVIEW_ID)).status).toBe(404)

    expect(db.store.get(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
    expect(db.store.get(SUBMITTED_ID).status).toBe(SUBMITTED)
    expect(statusChanges(UNDER_REVIEW_ID)).toEqual([])
  })

  it('spm5_non_coordinators_cannot_start_review_or_approve', async () => {
    for (const [account, id, action] of [
      [organiserA1, SUBMITTED_ID, START_REVIEW],
      [organiserA1, UNDER_REVIEW_ID, APPROVE],
    ]) {
      const response = await act(account, id, action)
      expect(response.status, `${account.uid} ${action}`).toBe(403)
      expect(response.json.reason).toBe(NOT_PERMITTED)
    }
    // Venue staff cannot see a request before Planning at all.
    expect((await act(venueStaff, UNDER_REVIEW_ID, APPROVE)).status).toBe(403)
    expect(db.store.get(UNDER_REVIEW_ID).status).toBe(UNDER_REVIEW)
  })

  it('spm5_approval_cannot_skip_review', async () => {
    const response = await act(coordinator, SUBMITTED_ID, APPROVE)
    expect(response.status).toBe(409)
    expect(db.store.get(SUBMITTED_ID).status).toBe(SUBMITTED)
  })
})
