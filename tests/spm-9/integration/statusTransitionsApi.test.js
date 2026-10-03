// SPM-9 API suite — in-memory harness. Real HTTP against the real Express app, authenticate middleware,
// shared/permissions.js and shared/statusTransitions.js. Mocked: Firebase token verification (a test
// token names the uid) and persistence (backend/src/testing/fakeFirestore.js, holding the seeded requests
// and profiles). This is not database verification, and there is no live-project variant: a live run
// would change seeded statuses and leave activity entries behind.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { createApp } from '../../../backend/src/app.js'
import { createAuthenticate } from '../../../backend/src/middleware/authenticate.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'
import { STATUS_CHANGED } from '../../../backend/src/services/statusHistory.js'
import {
  CANCELLED,
  CONFIRMED,
  PLANNING,
  REJECTED,
  RETURNED,
  SUBMITTED,
  UNDER_REVIEW,
} from '../../../shared/status.js'
import {
  APPROVE,
  APPROVE_CANCELLATION,
  ARRANGEMENTS_NOT_APPROVED,
  CANCEL,
  COMPLETE,
  CONFIRM,
  EVENT_NOT_ENDED,
  NOT_PERMITTED,
  REJECT,
  RESUBMIT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
  SUBMIT,
  TERMINAL_STATUS,
  UNKNOWN_ACTION,
} from '../../../shared/statusTransitions.js'
import {
  APPROVE_TECHNICAL,
  APPROVE_VENUE,
  REFUSE_CANCELLATION,
  REQUEST_CANCELLATION,
  RETURN_CANCELLATION,
} from '../../../shared/requestActions.js'
import { createFakeFirestoreEventRequestStore } from '../../shared/firebase-double/fakeFirestoreEventRequestStore.js'

const TOKEN_PREFIX = 'test-token:'
const { organiserA1, organiserA2, organiserB1, coordinator, coordinator2, coordinator3, venueStaff, technicalStaff, attendee } =
  SEED_ACCOUNTS

const seeded = (slug) => SEED_REQUESTS.find((request) => request.id === `seed-req-${slug}`)

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
  // One database behind both route families, as in the E2E double: a status changed through
  // /api/event-requests is the status /api/requests returns.
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

const act = (account, slug, action, reason) =>
  call('POST', `/api/event-requests/seed-req-${slug}/transitions`, account, reason === undefined ? { action } : { action, reason })
const view = (account, slug) => call('GET', `/api/requests/seed-req-${slug}`, account)
const statusChanges = (slug) =>
  [...db.collectionData(`eventRequests/seed-req-${slug}/activity`).values()].filter((entry) => entry.type === STATUS_CHANGED)

describe('SPM-9 — Event lifecycle status (API, in-memory only)', () => {
  it('spm9_organiser_and_coordinator_both_see_the_current_status', async () => {
    for (const slug of ['a1-submitted', 'a1-under-review', 'a1-returned', 'a1-planning', 'a1-confirmed', 'a1-completed', 'a1-cancelled', 'a1-rejected']) {
      const assignedCoordinator = Object.values(SEED_ACCOUNTS).find((account) => account.uid === seeded(slug).assignedCoordinatorUid)
      expect(assignedCoordinator, slug).toBeDefined()
      for (const account of [organiserA1, assignedCoordinator]) {
        const response = await view(account, slug)
        expect(response.status, `${account.uid} ${slug}`).toBe(200)
        expect(response.json.request.status).toBe(seeded(slug).status)
      }
    }
    const list = await call('GET', '/api/requests', coordinator)
    expect(list.json.requests.find((request) => request.id === 'seed-req-a1-planning').status).toBe(PLANNING)
  })

  it('spm9_the_response_lists_the_actions_this_user_may_take_now', async () => {
    expect((await view(coordinator, 'a1-under-review')).json.availableActions).toEqual([RETURN_FOR_CLARIFICATION, APPROVE, REJECT])
    expect((await view(organiserA1, 'a1-under-review')).json.availableActions).toEqual([])
    expect((await view(organiserA1, 'a1-returned')).json.availableActions).toEqual([RESUBMIT])
    // Same organisation, not the owner: may view, may not resubmit.
    expect((await view(organiserA2, 'a1-returned')).json.availableActions).toEqual([])
    expect(await view(coordinator2, 'a1-under-review')).toEqual({ status: 404, json: { message: 'Not found' } })
  })

  it('spm9_review_return_resubmit_approve_moves_through_each_status_and_records_each_change', async () => {
    const steps = [
      [coordinator, START_REVIEW, UNDER_REVIEW],
      [coordinator, RETURN_FOR_CLARIFICATION, RETURNED],
      [organiserA1, RESUBMIT, SUBMITTED],
      [coordinator, START_REVIEW, UNDER_REVIEW],
      [coordinator, APPROVE, PLANNING],
    ]
    let from = SUBMITTED
    for (const [account, action, to] of steps) {
      // SPM-25: a return needs the Coordinator's message.
      const reason = action === RETURN_FOR_CLARIFICATION ? 'Please confirm the expected attendance' : undefined
      const response = await act(account, 'a1-submitted', action, reason)
      expect(response.status, action).toBe(200)
      expect(response.json.request.status).toBe(to)
      // The other party sees the new status too.
      const other = account === coordinator ? organiserA1 : coordinator
      expect((await view(other, 'a1-submitted')).json.request.status).toBe(to)
      expect(statusChanges('a1-submitted').at(-1)).toMatchObject({
        action,
        fromStatus: from,
        toStatus: to,
        actor: { type: 'user', uid: account.uid, name: account.name },
      })
      expect(Number.isNaN(Date.parse(statusChanges('a1-submitted').at(-1).at))).toBe(false)
      from = to
    }
    expect(statusChanges('a1-submitted')).toHaveLength(steps.length)
    // The Coordinator was kept on resubmission.
    expect(db.store.get('seed-req-a1-submitted').assignedCoordinatorUid).toBe(coordinator.uid)
  })

  it('spm9_the_assigned_coordinator_rejects_from_under_review_or_planning', async () => {
    for (const slug of ['a1-under-review', 'a1-planning']) {
      const response = await act(coordinator, slug, REJECT)
      expect(response.status, slug).toBe(200)
      expect(response.json.request.status).toBe(REJECTED)
    }
  })

  it('spm9_the_assigned_coordinator_cancels_a_confirmed_event_directly', async () => {
    const withoutReason = await act(coordinator3, 'a1-confirmed', CANCEL)
    expect(withoutReason.status).toBe(400)
    expect(withoutReason.json.reason).toBe('reason_required')

    const response = await act(coordinator3, 'a1-confirmed', CANCEL, 'Venue closed for repairs')
    expect(response.status).toBe(200)
    expect(response.json.request.status).toBe(CANCELLED)
    expect(statusChanges('a1-confirmed')).toEqual([
      expect.objectContaining({ fromStatus: CONFIRMED, toStatus: CANCELLED, reason: 'Venue closed for repairs' }),
    ])
  })

  it('spm9_completed_cancelled_and_rejected_events_refuse_every_status_change', async () => {
    for (const slug of ['a1-completed', 'a1-cancelled', 'a1-rejected']) {
      const assignedCoordinator = Object.values(SEED_ACCOUNTS).find((account) => account.uid === seeded(slug).assignedCoordinatorUid)
      for (const [account, action] of [[assignedCoordinator, CANCEL], [assignedCoordinator, START_REVIEW], [organiserA1, RESUBMIT]]) {
        const response = await act(account, slug, action)
        expect(response.status, `${slug} ${action}`).toBe(409)
        expect(response.json.reason).toBe(TERMINAL_STATUS)
      }
      expect(db.store.get(`seed-req-${slug}`).status).toBe(seeded(slug).status)
      expect(statusChanges(slug)).toEqual([])
    }
  })

  it('spm9_a_status_change_by_anyone_but_the_permitted_actor_is_forbidden', async () => {
    const refused = [
      [organiserA1, 'a1-under-review', APPROVE],
      [organiserA2, 'a1-returned', RESUBMIT],
      [venueStaff, 'a1-planning', REJECT],
      [attendee, 'a1-confirmed', CANCEL],
    ]
    for (const [account, slug, action] of refused) {
      const response = await act(account, slug, action)
      expect(response.status, `${account.uid} ${action}`).toBe(403)
      expect(response.json.reason).toBe(NOT_PERMITTED)
      expect(db.store.get(`seed-req-${slug}`).status).toBe(seeded(slug).status)
    }
  })

  it('spm9_a_user_outside_the_request_scope_gets_403_without_any_detail', async () => {
    for (const slug of ['a1-submitted', 'a1-completed', 'a1-draft']) {
      const response = await act(organiserB1, slug, START_REVIEW)
      expect(response.status, slug).toBe(403)
      expect(response.json).toEqual({ message: 'Forbidden' })
    }
  })

  it('spm9_out_of_scope_coordinator_actions_match_missing_requests_without_writes', async () => {
    for (const [slug, action] of [
      ['a1-submitted', START_REVIEW],
      ['a1-draft', SUBMIT],
      ['a1-returned', RESUBMIT],
      ['a1-confirmed', APPROVE_CANCELLATION],
      ['a1-confirmed', REFUSE_CANCELLATION],
    ]) {
      const before = structuredClone(db.store.get(`seed-req-${slug}`))
      const activityBefore = [...db.collectionData(`eventRequests/seed-req-${slug}/activity`).values()]
      const missing = await act(coordinator2, 'missing', action)
      expect(missing.status).toBe(404)
      expect(await act(coordinator2, slug, action)).toEqual(missing)
      expect(db.store.get(`seed-req-${slug}`)).toEqual(before)
      expect([...db.collectionData(`eventRequests/seed-req-${slug}/activity`).values()]).toEqual(activityBefore)
    }
  })

  it('spm9_confirm_is_refused_until_venue_and_technical_arrangements_are_approved', async () => {
    const response = await act(coordinator, 'a1-planning', CONFIRM)
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(ARRANGEMENTS_NOT_APPROVED)
    expect(db.store.get('seed-req-a1-planning').status).toBe(PLANNING)
  })

  it('spm9_complete_is_refused_before_the_event_has_taken_place', async () => {
    const response = await act(coordinator3, 'a1-confirmed', COMPLETE)
    expect(response.status).toBe(409)
    expect(response.json.reason).toBe(EVENT_NOT_ENDED)
  })

  it('spm9_malformed_requests_are_rejected', async () => {
    expect((await act(coordinator, 'a1-submitted', 'set_status')).json.reason).toBe(UNKNOWN_ACTION)
    expect((await act(coordinator, 'a1-submitted', 'set_status')).status).toBe(400)
    expect((await call('POST', '/api/event-requests/seed-req-a1-submitted/transitions', coordinator, {})).status).toBe(400)
    expect((await call('POST', '/api/event-requests/seed-req-a1-submitted/transitions', null, { action: START_REVIEW })).status).toBe(401)
    expect((await call('POST', '/api/event-requests/seed-req-missing/transitions', coordinator, { action: START_REVIEW })).status).toBe(404)
  })

  it('spm9_status_cannot_be_set_through_the_section_edit_route', async () => {
    const response = await call('PATCH', '/api/requests/seed-req-a1-under-review', coordinator, { status: PLANNING })
    expect(response.status).toBe(403)
    expect(db.store.get('seed-req-a1-under-review').status).toBe(UNDER_REVIEW)
  })

  it('spm9_assigned_venue_and_technical_staff_sign_off_then_the_coordinator_confirms', async () => {
    expect((await view(venueStaff, 'a1-planning')).json.availableActions).toEqual([APPROVE_VENUE, 'reject_venue'])
    expect((await view(coordinator, 'a1-planning')).json.availableActions).toEqual([REJECT])

    expect((await act(coordinator, 'a1-planning', CONFIRM)).json.reason).toBe(ARRANGEMENTS_NOT_APPROVED)
    expect((await act(venueStaff, 'a1-planning', APPROVE_VENUE)).status).toBe(200)
    expect((await act(technicalStaff, 'a1-planning', APPROVE_TECHNICAL)).status).toBe(200)

    // Each role sees only the sign-off for the section it may view, and not who decided.
    const venueView = await view(venueStaff, 'a1-planning')
    expect(venueView.json.arrangements).toEqual({ venue: { required: true, decision: 'approved', at: expect.any(String) } })
    const organiserView = await view(organiserA1, 'a1-planning')
    expect(Object.keys(organiserView.json.arrangements)).toEqual(['venue', 'technical'])
    expect(organiserView.json.request.arrangementApprovals).toBeUndefined()

    expect((await view(coordinator, 'a1-planning')).json.availableActions).toEqual([CONFIRM, REJECT])
    const confirmed = await act(coordinator, 'a1-planning', CONFIRM)
    expect(confirmed.status).toBe(200)
    expect(confirmed.json.request.status).toBe(CONFIRMED)
    expect((await view(organiserA1, 'a1-planning')).json.request.status).toBe(CONFIRMED)
  })

  it('spm9_the_coordinator_cannot_override_a_missing_approval', async () => {
    const byAction = await act(coordinator, 'a1-planning', APPROVE_VENUE)
    expect(byAction.status).toBe(403)
    expect(byAction.json.reason).toBe('not_assigned_staff')

    // Nor through the section-edit route: the sign-off is record metadata, which no PATCH can write.
    const byPatch = await call('PATCH', '/api/requests/seed-req-a1-planning', coordinator, {
      arrangementApprovals: { venue: { decision: 'approved' }, technical: { decision: 'approved' } },
    })
    expect(byPatch.status).toBe(403)
    expect(db.store.get('seed-req-a1-planning').arrangementApprovals).toBeUndefined()
    expect((await act(coordinator, 'a1-planning', CONFIRM)).status).toBe(409)
  })

  it('spm9_an_organiser_cancellation_request_approved_by_the_coordinator_cancels_the_event', async () => {
    expect((await view(organiserA1, 'a1-confirmed')).json.availableActions).toEqual([REQUEST_CANCELLATION])

    const requested = await act(organiserA1, 'a1-confirmed', REQUEST_CANCELLATION, 'Keynote speaker withdrew')
    expect(requested.status).toBe(200)
    expect(requested.json.request.status).toBe(CONFIRMED)
    expect(requested.json.cancellationRequest).toMatchObject({ status: 'pending', reason: 'Keynote speaker withdrew' })
    expect(requested.json.availableActions).toEqual([])

    const coordinatorView = await view(coordinator3, 'a1-confirmed')
    expect(coordinatorView.json.cancellationRequest.status).toBe('pending')
    // SPM-47 added Return cancellation request.
    expect(coordinatorView.json.availableActions).toEqual([APPROVE_CANCELLATION, REFUSE_CANCELLATION, RETURN_CANCELLATION])
    // While the request is pending the Coordinator decides it rather than cancelling directly.
    expect((await act(coordinator3, 'a1-confirmed', CANCEL, 'Venue closed')).json.reason).toBe('cancellation_request_pending')

    const approved = await act(coordinator3, 'a1-confirmed', APPROVE_CANCELLATION)
    expect(approved.status).toBe(200)
    expect(approved.json.request.status).toBe(CANCELLED)
    const organiserView = await view(organiserA1, 'a1-confirmed')
    expect(organiserView.json.request.status).toBe(CANCELLED)
    expect(organiserView.json.cancellationRequest.status).toBe('approved')
    expect(statusChanges('a1-confirmed')).toEqual([
      expect.objectContaining({ action: APPROVE_CANCELLATION, fromStatus: CONFIRMED, toStatus: CANCELLED }),
    ])
  })

  it('spm9_a_refused_cancellation_request_leaves_the_event_confirmed', async () => {
    await act(organiserA1, 'a1-confirmed', REQUEST_CANCELLATION, 'Budget cut')
    const refused = await act(coordinator3, 'a1-confirmed', REFUSE_CANCELLATION, 'Outside the cancellation terms')
    expect(refused.status).toBe(200)
    expect(refused.json.request.status).toBe(CONFIRMED)

    const organiserView = await view(organiserA1, 'a1-confirmed')
    expect(organiserView.json.cancellationRequest).toMatchObject({ status: 'refused', decisionReason: 'Outside the cancellation terms' })
    expect(organiserView.json.availableActions).toEqual([REQUEST_CANCELLATION])
    expect(statusChanges('a1-confirmed')).toEqual([])
  })

  it('spm9_only_the_owner_requests_and_only_the_assigned_coordinator_decides_cancellation', async () => {
    expect((await act(organiserA2, 'a1-confirmed', REQUEST_CANCELLATION)).status).toBe(403)
    expect((await act(coordinator3, 'a1-confirmed', REQUEST_CANCELLATION)).status).toBe(403)
    await act(organiserA1, 'a1-confirmed', REQUEST_CANCELLATION, 'Budget cut')
    expect((await act(coordinator, 'a1-confirmed', APPROVE_CANCELLATION)).status).toBe(404)
    expect((await act(coordinator, 'a1-confirmed', REFUSE_CANCELLATION)).status).toBe(404)
    expect((await act(organiserA1, 'a1-planning', REQUEST_CANCELLATION)).status).toBe(409)
    expect(db.store.get('seed-req-a1-confirmed').status).toBe(CONFIRMED)
  })
})
