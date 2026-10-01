// SPM-8 — automatic Event Coordinator assignment on submission.
// Runs against backend/src/testing/fakeFirestore.js: in-memory, not the Firestore emulator or a deployed
// project, and it does not exercise concurrent transaction retries.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { COMPLETED, DRAFT, PLANNING, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { sendEventRequestError } from '../controllers/eventRequestController.js'
import { createFakeFirestore } from '../testing/fakeFirestore.js'
import {
  assignCoordinatorInTransaction,
  COORDINATOR_ASSIGNED,
  NoEligibleCoordinatorError,
} from './coordinatorAssignmentService.js'
import { createDraftEventRequest, submitDraftEventRequest, updateDraftEventRequest } from './eventRequestService.js'

const organiser = Object.freeze({ uid: 'organiser-1', roles: ['organiser'], organisationId: 'org-a' })
const coordinator = { roles: ['coordinator'] }
const now = new Date('2026-09-30T02:00:00.000Z')

// A draft that passes submission validation.
function readyDraft(overrides = {}) {
  return {
    status: DRAFT,
    ownerUid: organiser.uid,
    assignedStaffUids: [],
    assignedCoordinatorUid: null,
    core: {
      title: 'Partner Forum',
      purpose: 'Partner updates',
      expectedAttendees: 50,
      durationHours: 3,
      preferredDateTime: '2026-11-20T09:00:00+08:00',
    },
    venue: { layoutPreference: 'Theatre' },
    ...overrides,
  }
}

// `n` existing requests at `status`, assigned to `coordinatorUid`, keyed for createFakeFirestore.
function assigned(coordinatorUid, status, n) {
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [
      `${coordinatorUid}-${status}-${i}`,
      { status, ownerUid: 'someone-else', assignedCoordinatorUid: coordinatorUid },
    ]),
  )
}

function activityOf(db, requestId) {
  return [...db.collectionData(`eventRequests/${requestId}/activity`).values()]
}

describe('SPM-8 — automatic coordinator assignment', () => {
  test('Test 1: A(2 active), B(0), C(1) → the submitted request is assigned to B', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator, C: coordinator },
      eventRequests: { draft: readyDraft(), ...assigned('A', SUBMITTED, 2), ...assigned('C', PLANNING, 1) },
    })

    const submitted = await submitDraftEventRequest('draft', organiser, db, now)

    assert.equal(submitted.status, SUBMITTED)
    assert.equal(submitted.assignedCoordinatorUid, 'B')
    assert.equal(db.store.get('draft').assignedCoordinatorUid, 'B')
  })

  test('Test 3: A has 3 Planning + 2 Completed, B has 4 Planning → assigned to A', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator },
      eventRequests: {
        draft: readyDraft(),
        ...assigned('A', PLANNING, 3),
        ...assigned('A', COMPLETED, 2),
        ...assigned('B', PLANNING, 4),
      },
    })

    const submitted = await submitDraftEventRequest('draft', organiser, db, now)

    assert.equal(submitted.assignedCoordinatorUid, 'A')
  })

  test('Test 4: saving a Draft assigns no coordinator', async () => {
    const db = createFakeFirestore({ users: { A: coordinator } })

    const created = await createDraftEventRequest({ core: { title: 'Draft only' } }, organiser, db)
    const updated = await updateDraftEventRequest(created.id, { core: { title: 'Still a draft' } }, organiser, db)

    assert.equal(created.assignedCoordinatorUid, null)
    assert.equal(updated.status, DRAFT)
    assert.equal(db.store.get(created.id).assignedCoordinatorUid, null)
    assert.deepEqual(activityOf(db, created.id), [])
  })

  // No resubmit action exists yet (Returned → Submitted is not implemented), so this exercises the
  // assignment step the resubmission will call: a request that already has a coordinator keeps them.
  test('Test 5: a Returned request assigned to A keeps A when it goes through assignment again', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator },
      eventRequests: {
        returned: readyDraft({ status: RETURNED, assignedCoordinatorUid: 'A' }),
        ...assigned('A', UNDER_REVIEW, 3),
      },
    })
    const requestRef = db.collection('eventRequests').doc('returned')

    const coordinatorUid = await db.runTransaction(async (tx) => {
      const request = (await tx.get(requestRef)).data()
      return assignCoordinatorInTransaction(tx, db, { requestRef, request, now, random: () => 0 })
    })

    assert.equal(coordinatorUid, 'A')
    assert.deepEqual(db.transactions.at(-1).writes, [], 'nothing written')
    assert.deepEqual(activityOf(db, 'returned'), [])
  })

  test('Test 7: an Organiser who is also a Coordinator, with 0 active events, is not assigned their own request', async () => {
    const organiserCoordinator = { uid: 'X', roles: ['organiser', 'coordinator'], organisationId: 'org-a' }
    const db = createFakeFirestore({
      users: { X: { roles: ['organiser', 'coordinator'] }, Y: coordinator },
      eventRequests: { draft: readyDraft({ ownerUid: 'X' }), ...assigned('Y', PLANNING, 2) },
    })

    const submitted = await submitDraftEventRequest('draft', organiserCoordinator, db, now, { random: () => 0 })

    assert.equal(submitted.assignedCoordinatorUid, 'Y')
  })

  test('Test 8: a successful assignment records the coordinator, "System" as the actor, and the date/time', async () => {
    const db = createFakeFirestore({ users: { A: coordinator }, eventRequests: { draft: readyDraft() } })

    await submitDraftEventRequest('draft', organiser, db, now)

    assert.deepEqual(activityOf(db, 'draft'), [
      {
        type: COORDINATOR_ASSIGNED,
        coordinatorUid: 'A',
        actor: { type: 'system', name: 'System' },
        at: now.toISOString(),
      },
    ])
  })

  test('no eligible coordinator aborts the submit: the draft is unchanged and the API returns 500', async () => {
    const db = createFakeFirestore({ users: { O: { roles: ['organiser'] } }, eventRequests: { draft: readyDraft() } })

    await assert.rejects(() => submitDraftEventRequest('draft', organiser, db, now), NoEligibleCoordinatorError)

    assert.equal(db.store.get('draft').status, DRAFT)
    assert.equal(db.store.get('draft').assignedCoordinatorUid, null)
    assert.deepEqual(activityOf(db, 'draft'), [])
    assert.equal(db.transactions.at(-1).committed, false)

    const res = {
      status(code) {
        this.statusCode = code
        return this
      },
      json(body) {
        this.body = body
        return this
      },
    }
    sendEventRequestError(new NoEligibleCoordinatorError(), res, () => assert.fail('must not fall through'))
    assert.equal(res.statusCode, 500)
    assert.deepEqual(res.body, { message: 'No eligible coordinator available' })
  })

  test('each assignment reads and writes the assignment lock, so overlapping submissions are serialised', async () => {
    const db = createFakeFirestore({ users: { A: coordinator }, eventRequests: { draft: readyDraft() } })

    await submitDraftEventRequest('draft', organiser, db, now)

    const { reads, writes } = db.transactions.at(-1)
    assert.ok(reads.includes('systemLocks/coordinatorAssignment'))
    assert.ok(writes.includes('systemLocks/coordinatorAssignment'))
    assert.ok(writes.includes('eventRequests/draft'))
  })

  test('counts come from inside the transaction, so a second submission sees the first assignment', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator },
      eventRequests: { first: readyDraft(), second: readyDraft() },
    })

    const first = await submitDraftEventRequest('first', organiser, db, now, { random: () => 0 })
    const second = await submitDraftEventRequest('second', organiser, db, now, { random: () => 0 })

    assert.deepEqual([first.assignedCoordinatorUid, second.assignedCoordinatorUid], ['A', 'B'])
  })

  test('coordinators with only the legacy `role` field are eligible; a stale `role` is ignored when `roles` exists', async () => {
    const db = createFakeFirestore({
      users: {
        legacy: { role: 'coordinator' },
        stale: { role: 'coordinator', roles: ['organiser'] },
      },
      eventRequests: { draft: readyDraft() },
    })

    const submitted = await submitDraftEventRequest('draft', organiser, db, now, { random: () => 0.99 })

    assert.equal(submitted.assignedCoordinatorUid, 'legacy')
  })
})
