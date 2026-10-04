// SPM-25 API suite — in-memory harness. Real HTTP against the real Express app, authenticate middleware,
// shared/permissions.js, shared/statusTransitions.js and shared/requestActions.js. Mocked: Firebase token
// verification (a test token names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding
// the seeded requests and profiles). This is not database verification, and there is no live-project
// variant: a live run would change seeded statuses and leave activity entries behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import { MAX_REASON_LENGTH } from '../../../shared/requestActions.js'
import { PLANNING, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import {
  NOT_PERMITTED,
  REJECT,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
  WRONG_STATUS,
} from '../../../shared/statusTransitions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { organiserA1, organiserA2, organiserB1, coordinator, coordinator2 } = SEED_ACCOUNTS

const SLUG = 'a1-under-review'
const ID = `seed-req-${SLUG}`
const MESSAGE = 'Please confirm the expected attendance and the room layout.'

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

const act = (account, action, reason) =>
  call('POST', `/api/event-requests/${ID}/transitions`, account, reason === undefined ? { action } : { action, reason })
const view = (account) => call('GET', `/api/requests/${ID}`, account)
const listed = async (account) => (await call('GET', '/api/requests', account)).json.requests.find((request) => request.id === ID)
const stored = () => db.store.get(ID)
const statusChanges = () =>
  [...db.collectionData(`eventRequests/${ID}/activity`).values()].filter((entry) => entry.type === STATUS_CHANGED)

describe('SPM-25 — Return for Clarification (API, in-memory only)', () => {
  it('spm25_seed_fixture_is_under_review_and_assigned_to_the_coordinator', () => {
    expect(stored()).toMatchObject({ status: UNDER_REVIEW, ownerUid: organiserA1.uid, assignedCoordinatorUid: coordinator.uid })
  })

  // AC: "Return action requires a clarification message from the Coordinator."
  it('spm25_return_without_a_message_is_refused_and_changes_nothing', async () => {
    for (const reason of [undefined, '', '   ', null]) {
      const response = await act(coordinator, RETURN_FOR_CLARIFICATION, reason)
      expect(response.status, JSON.stringify(reason)).toBe(400)
      expect(response.json.reason).toBe('reason_required')
    }
    const tooLong = await act(coordinator, RETURN_FOR_CLARIFICATION, 'x'.repeat(MAX_REASON_LENGTH + 1))
    expect(tooLong.status).toBe(400)
    expect(tooLong.json.reason).toBe('reason_invalid')
    const notText = await act(coordinator, RETURN_FOR_CLARIFICATION, 42)
    expect(notText.status).toBe(400)

    expect(stored().status).toBe(UNDER_REVIEW)
    expect(stored().clarificationRequests).toBeUndefined()
    expect(statusChanges()).toEqual([])
  })

  // Priority AC: "the event status changes from Under Review to Returned".
  it('spm25_return_with_a_message_moves_under_review_to_returned_and_records_the_message', async () => {
    const response = await act(coordinator, RETURN_FOR_CLARIFICATION, `  ${MESSAGE}  `)
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(RETURNED)
    expect(response.json.clarificationRequests).toEqual([{ message: MESSAGE, requestedAt: expect.any(String) }])

    expect(stored().clarificationRequests).toEqual([
      { message: MESSAGE, requestedByUid: coordinator.uid, requestedAt: expect.any(String) },
    ])
    expect(statusChanges()).toEqual([
      expect.objectContaining({ action: RETURN_FOR_CLARIFICATION, fromStatus: UNDER_REVIEW, toStatus: RETURNED, reason: MESSAGE }),
    ])
  })

  it('spm25_only_the_assigned_coordinator_returns_and_only_from_under_review', async () => {
    expect((await act(organiserA1, RETURN_FOR_CLARIFICATION, MESSAGE)).json.reason).toBe(NOT_PERMITTED)
    expect((await act(coordinator2, RETURN_FOR_CLARIFICATION, MESSAGE)).status).toBe(404)
    expect((await act(organiserB1, RETURN_FOR_CLARIFICATION, MESSAGE)).status).toBe(403)

    const submitted = await call('POST', '/api/event-requests/seed-req-a1-submitted/transitions', coordinator, {
      action: RETURN_FOR_CLARIFICATION,
      reason: MESSAGE,
    })
    expect(submitted.status).toBe(409)
    expect(submitted.json.reason).toBe(WRONG_STATUS)

    expect(stored().status).toBe(UNDER_REVIEW)
    expect(stored().clarificationRequests).toBeUndefined()
  })

  // AC: "when the Organiser opens it, then the Coordinator's clarification message is visible and the
  // request fields are editable".
  it('spm25_the_owning_organiser_sees_the_message_and_may_edit_every_section', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, MESSAGE)

    const response = await view(organiserA1)
    expect(response.status).toBe(200)
    expect(response.json.clarificationRequests).toEqual([{ message: MESSAGE, requestedAt: expect.any(String) }])
    // Who sent it is internal: neither the summary nor the projected record carries it.
    expect(JSON.stringify(response.json)).not.toContain('requestedByUid')
    expect(response.json.editableSections.sort()).toEqual(['core', 'equipment', 'registration', 'venue'])
    expect(response.json.availableActions).toEqual([RESUBMIT])

    const edit = await call('PATCH', `/api/requests/${ID}`, organiserA1, { core: { expectedAttendees: 120 } })
    expect(edit.status).toBe(200)
    expect(stored().core.expectedAttendees).toBe(120)
  })

  it('spm25_a_same_organisation_colleague_may_view_but_gets_no_message_and_cannot_edit', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, MESSAGE)
    const response = await view(organiserA2)
    expect(response.status).toBe(200)
    expect(response.json.clarificationRequests).toBeNull()
    expect(response.json.editableSections).toEqual([])
  })

  it('spm25_the_message_cannot_be_written_through_the_section_edit_route', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, MESSAGE)
    for (const account of [organiserA1, coordinator]) {
      const response = await call('PATCH', `/api/requests/${ID}`, account, { clarificationRequests: [] })
      expect(response.status, account.uid).toBe(403)
    }
    expect(stored().clarificationRequests).toHaveLength(1)
  })

  // AC: "the request is not counted as approved or rejected and remains pending the Organiser's response".
  it('spm25_a_returned_request_stays_in_the_coordinators_list_pending_the_organiser', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, MESSAGE)
    const entry = await listed(coordinator)
    expect(entry.status).toBe(RETURNED)
    expect([PLANNING, REJECTED]).not.toContain(entry.status)
    // Nothing for the Coordinator to do until the Organiser resubmits.
    expect((await view(coordinator)).json.availableActions).toEqual([])
    expect(stored().assignedCoordinatorUid).toBe(coordinator.uid)
  })

  // Priority AC: same request retained, status Submitted, Coordinator retained, back in their queue.
  it('spm25_resubmission_keeps_the_same_request_and_coordinator_and_returns_it_to_the_queue', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, MESSAGE)
    await call('PATCH', `/api/requests/${ID}`, organiserA1, { core: { expectedAttendees: 120 } })

    const resubmitted = await act(organiserA1, RESUBMIT)
    expect(resubmitted.status).toBe(200)
    expect(resubmitted.json.request).toMatchObject({ id: ID, status: SUBMITTED })
    expect(stored()).toMatchObject({ status: SUBMITTED, assignedCoordinatorUid: coordinator.uid })
    expect(stored().core.expectedAttendees).toBe(120)
    expect(statusChanges().at(-1)).toMatchObject({ action: RESUBMIT, fromStatus: RETURNED, toStatus: SUBMITTED })

    const entry = await listed(coordinator)
    expect(entry.status).toBe(SUBMITTED)
    expect((await view(coordinator)).json.availableActions).toEqual([START_REVIEW])
    // The Organiser can no longer edit, and the message is kept as history.
    const organiserView = await view(organiserA1)
    expect(organiserView.json.editableSections).toEqual([])
    expect(organiserView.json.clarificationRequests).toHaveLength(1)
  })

  it('spm25_a_second_return_keeps_the_first_message_newest_first', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, 'First question')
    await act(organiserA1, RESUBMIT)
    await act(coordinator, START_REVIEW)
    const again = await act(coordinator, RETURN_FOR_CLARIFICATION, 'Second question')
    expect(again.status).toBe(200)
    expect(again.json.clarificationRequests.map((entry) => entry.message)).toEqual(['Second question', 'First question'])
  })

  // AC: "If essential requirements still cannot be met after resubmission, the request is rejected".
  it('spm25_after_resubmission_the_coordinator_may_reject_instead_of_returning', async () => {
    await act(coordinator, RETURN_FOR_CLARIFICATION, MESSAGE)
    await act(organiserA1, RESUBMIT)
    await act(coordinator, START_REVIEW)
    // SPM-45: a rejection requires a reason.
    const rejected = await act(coordinator, REJECT, 'The revised date still cannot be accommodated')
    expect(rejected.status).toBe(200)
    expect(rejected.json.request.status).toBe(REJECTED)
  })
})
