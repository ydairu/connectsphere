// SPM-8 / SPM-68 — Coordinator assignment on submission, and the shared Coordinator and workload loaders.
// SPM-68 (W7-CUST Change #5) removed SPM-8's automatic assignment: these tests now prove that a submission is left
// unassigned, that a resubmission keeps its Coordinator, and that the loaders the Lead's picker uses still count
// SPM-8's workloads and find SPM-8's eligible Coordinators.
// Runs against backend/src/testing/fakeFirestore.js: in-memory, not the Firestore emulator or a deployed
// project, and it does not exercise concurrent transaction retries.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { COMPLETED, DRAFT, PLANNING, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { createFakeFirestore } from '../testing/fakeFirestore.js'
import { COORDINATOR_ASSIGNED, loadActiveCounts, loadCoordinators } from './coordinatorAssignmentService.js'
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

describe('SPM-68 — submission no longer assigns a Coordinator (was SPM-8 automatic assignment)', () => {
  test('Test 1: with A(2 active), B(0), C(1) the submitted request is left unassigned; the workloads are still counted', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator, C: coordinator },
      eventRequests: { draft: readyDraft(), ...assigned('A', SUBMITTED, 2), ...assigned('C', PLANNING, 1) },
    })

    const submitted = await submitDraftEventRequest('draft', organiser, db, now)

    assert.equal(submitted.status, SUBMITTED)
    assert.equal(submitted.assignedCoordinatorUid, null)
    assert.equal(db.store.get('draft').assignedCoordinatorUid, null)
    assert.equal(db.store.get('draft').submittedAt, now.toISOString())
    assert.deepEqual(Object.fromEntries(await loadActiveCounts(db)), { A: 2, C: 1 })
  })

  test('Test 3: workloads count active statuses only — A has 3 Planning + 2 Completed, B has 4 Planning', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator },
      eventRequests: { ...assigned('A', PLANNING, 3), ...assigned('A', COMPLETED, 2), ...assigned('B', PLANNING, 4) },
    })

    assert.deepEqual(Object.fromEntries(await loadActiveCounts(db)), { A: 3, B: 4 })
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

  test('Test 5: a Returned request assigned to A keeps A when resubmitted, with no assignment entry or lock write (CL3 G8!C15)', async () => {
    const db = createFakeFirestore({
      users: { A: coordinator, B: coordinator },
      eventRequests: {
        returned: readyDraft({ status: RETURNED, assignedCoordinatorUid: 'A', submittedAt: '2026-09-01T00:00:00.000Z' }),
        ...assigned('A', UNDER_REVIEW, 3),
      },
    })

    const resubmitted = await submitDraftEventRequest('returned', organiser, db, now)

    assert.equal(resubmitted.status, SUBMITTED)
    assert.equal(db.store.get('returned').assignedCoordinatorUid, 'A')
    assert.equal(db.store.get('returned').submittedAt, '2026-09-01T00:00:00.000Z', 'the first submission time is kept')
    assert.deepEqual(activityOf(db, 'returned').filter((entry) => entry.type === COORDINATOR_ASSIGNED), [])
    assert.equal(db.transactions.at(-1).writes.includes('systemLocks/coordinatorAssignment'), false)
  })

  test('Test 7: an Organiser who is also a Coordinator submits; the request is left unassigned, not given to them', async () => {
    const organiserCoordinator = { uid: 'X', roles: ['organiser', 'coordinator'], organisationId: 'org-a' }
    const db = createFakeFirestore({
      users: { X: { roles: ['organiser', 'coordinator'] }, Y: coordinator },
      eventRequests: { draft: readyDraft({ ownerUid: 'X' }), ...assigned('Y', PLANNING, 2) },
    })

    const submitted = await submitDraftEventRequest('draft', organiserCoordinator, db, now)

    assert.equal(submitted.assignedCoordinatorUid, null)
  })

  test('Test 8: a submission records only its status change — no coordinator_assigned entry', async () => {
    const db = createFakeFirestore({ users: { A: coordinator }, eventRequests: { draft: readyDraft() } })

    await submitDraftEventRequest('draft', organiser, db, now)

    assert.deepEqual(activityOf(db, 'draft').map((entry) => entry.type), ['status_changed'])
  })

  test('no Coordinator at all no longer blocks submission: the request is submitted and waits in the queue', async () => {
    const db = createFakeFirestore({ users: { O: { roles: ['organiser'] } }, eventRequests: { draft: readyDraft() } })

    const submitted = await submitDraftEventRequest('draft', organiser, db, now)

    assert.equal(submitted.status, SUBMITTED)
    assert.equal(db.store.get('draft').status, SUBMITTED)
    assert.equal(db.store.get('draft').assignedCoordinatorUid, null)
    assert.equal(db.transactions.at(-1).committed, true)
  })

  test('submission no longer takes the assignment lock; only the request and its activity are written', async () => {
    const db = createFakeFirestore({ users: { A: coordinator }, eventRequests: { draft: readyDraft() } })

    await submitDraftEventRequest('draft', organiser, db, now)

    const { reads, writes } = db.transactions.at(-1)
    assert.equal(reads.includes('systemLocks/coordinatorAssignment'), false)
    assert.equal(writes.includes('systemLocks/coordinatorAssignment'), false)
    assert.ok(writes.includes('eventRequests/draft'))
  })

  test('coordinators with only the legacy `role` field are listed; a stale `role` is ignored when `roles` exists', async () => {
    const db = createFakeFirestore({
      users: {
        legacy: { role: 'coordinator', name: 'Legacy' },
        stale: { role: 'coordinator', roles: ['organiser'] },
        current: { roles: ['coordinator'] },
      },
    })

    const coordinators = await loadCoordinators(db)

    assert.deepEqual(coordinators.map(({ uid, name }) => [uid, name]).sort(), [['current', null], ['legacy', 'Legacy']])
  })
})
