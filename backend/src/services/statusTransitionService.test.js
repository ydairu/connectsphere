// SPM-9 — applying lifecycle actions and recording each status change. Runs against the in-memory
// Firestore fake (backend/src/testing/fakeFirestore.js): not the emulator and not a deployed project.
// Run: node --test "backend/src/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { ARRANGEMENT_APPROVED, ARRANGEMENT_REJECTED, NOT_ASSIGNED_STAFF } from '../../../shared/arrangements.js'
import {
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_APPROVED,
  CANCELLATION_PENDING,
  CANCELLATION_REFUSED,
  CANCELLATION_REQUEST_PENDING,
} from '../../../shared/cancellationRequests.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import {
  APPROVE_TECHNICAL,
  APPROVE_VENUE,
  MAX_REASON_LENGTH,
  REFUSE_CANCELLATION,
  REJECT_VENUE,
  REQUEST_CANCELLATION,
} from '../../../shared/requestActions.js'
import {
  CANCELLED,
  COMPLETED,
  CONFIRMED,
  DRAFT,
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
  WRONG_STATUS,
} from '../../../shared/statusTransitions.js'
import { createFakeFirestore } from '../testing/fakeFirestore.js'
import { COORDINATOR_ASSIGNED } from './coordinatorAssignmentService.js'
import { EventRequestForbiddenError, EventRequestNotFoundError, EventRequestValidationError } from './eventRequestService.js'
import { STATUS_CHANGED } from './statusHistory.js'
import {
  ARRANGEMENT_DECIDED,
  CANCELLATION_DECIDED,
  CANCELLATION_REQUESTED,
  REASON_INVALID,
  REASON_REQUIRED,
  StatusTransitionError,
  transitionEventRequest,
} from './statusTransitionService.js'

const NOW = new Date('2026-10-01T04:00:00.000Z')

const owner = Object.freeze({ uid: 'organiser-1', name: 'Olive Organiser', roles: [ORGANISER], organisationId: 'org-a' })
const outsider = Object.freeze({ uid: 'organiser-b', name: 'Other Org', roles: [ORGANISER], organisationId: 'org-b' })
const assigned = Object.freeze({ uid: 'coord-1', name: 'Casey Coordinator', roles: [COORDINATOR] })
const otherCoordinator = Object.freeze({ uid: 'coord-2', name: 'Other Coordinator', roles: [COORDINATOR] })

function readyRequest(status, overrides = {}) {
  return {
    status,
    ownerUid: owner.uid,
    organisationId: owner.organisationId,
    assignedStaffUids: [],
    assignedCoordinatorUid: status === DRAFT ? null : assigned.uid,
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

function fakeDb(request) {
  return createFakeFirestore({
    eventRequests: { 'request-1': request },
    users: { [assigned.uid]: { roles: [COORDINATOR] }, [otherCoordinator.uid]: { roles: [COORDINATOR] } },
  })
}

function activityOf(db) {
  return [...db.collectionData('eventRequests/request-1/activity').values()]
}

function statusChangesOf(db) {
  return activityOf(db).filter((entry) => entry.type === STATUS_CHANGED)
}

async function assertRefused(promise, reason) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof StatusTransitionError, `expected StatusTransitionError, got ${error.name}`)
    assert.equal(error.reason, reason)
    return true
  })
}

describe('SPM-9 — each status change records previous status, new status, who and when', () => {
  test('Draft → Submitted on submit, by the Organiser; recorded with the SPM-8 assignment entry', async () => {
    const db = fakeDb(readyRequest(DRAFT))

    const updated = await transitionEventRequest('request-1', SUBMIT, owner, db, NOW)

    assert.equal(updated.status, SUBMITTED)
    assert.equal(db.store.get('request-1').status, SUBMITTED)
    assert.deepEqual(statusChangesOf(db), [
      {
        type: STATUS_CHANGED,
        action: SUBMIT,
        fromStatus: DRAFT,
        toStatus: SUBMITTED,
        actor: { type: 'user', uid: owner.uid, name: owner.name },
        at: NOW.toISOString(),
      },
    ])
    assert.equal(activityOf(db).filter((entry) => entry.type === COORDINATOR_ASSIGNED).length, 1)
  })

  const coordinatorSteps = [
    [START_REVIEW, SUBMITTED, UNDER_REVIEW],
    [RETURN_FOR_CLARIFICATION, UNDER_REVIEW, RETURNED],
    [APPROVE, UNDER_REVIEW, PLANNING],
    [REJECT, UNDER_REVIEW, REJECTED],
    [REJECT, PLANNING, REJECTED],
    [CANCEL, CONFIRMED, CANCELLED],
  ]

  for (const [action, from, to] of coordinatorSteps) {
    test(`${from} → ${to} on ${action}, by the assigned Coordinator`, async () => {
      const db = fakeDb(readyRequest(from))

      const options =
        action === CANCEL ? { reason: 'Venue closed for repairs' }
          : action === RETURN_FOR_CLARIFICATION ? { reason: 'Please confirm the expected attendance' }
            : action === REJECT ? { reason: 'No venue can hold the expected attendance' }
              : {}
      const updated = await transitionEventRequest('request-1', action, assigned, db, NOW, options)

      assert.equal(updated.status, to)
      assert.equal(updated.updatedAt, NOW.toISOString())
      assert.equal(db.store.get('request-1').status, to)
      assert.deepEqual(statusChangesOf(db), [
        {
          type: STATUS_CHANGED,
          action,
          fromStatus: from,
          toStatus: to,
          actor: { type: 'user', uid: assigned.uid, name: assigned.name },
          at: NOW.toISOString(),
          ...options,
        },
      ])
    })
  }

  test('Confirmed → Completed once the event has taken place', async () => {
    const db = fakeDb(readyRequest(CONFIRMED, { core: { ...readyRequest(DRAFT).core, preferredDateTime: '2026-09-30T09:00:00+08:00' } }))

    const updated = await transitionEventRequest('request-1', COMPLETE, assigned, db, NOW)

    assert.equal(updated.status, COMPLETED)
    assert.equal(statusChangesOf(db)[0].fromStatus, CONFIRMED)
    assert.equal(statusChangesOf(db)[0].toStatus, COMPLETED)
  })

  test('the status change and its history entry are written in the same transaction', async () => {
    const db = fakeDb(readyRequest(SUBMITTED))

    await transitionEventRequest('request-1', START_REVIEW, assigned, db, NOW)

    const { writes, committed } = db.transactions.at(-1)
    assert.equal(committed, true)
    assert.ok(writes.includes('eventRequests/request-1'))
    assert.ok(writes.some((path) => path.startsWith('eventRequests/request-1/activity/')))
  })
})

describe('SPM-9 — Returned → Submitted on resubmit', () => {
  test('the owning Organiser resubmits; the Coordinator is kept and not reassigned', async () => {
    const db = fakeDb(readyRequest(RETURNED))

    const updated = await transitionEventRequest('request-1', RESUBMIT, owner, db, NOW)

    assert.equal(updated.status, SUBMITTED)
    assert.equal(updated.assignedCoordinatorUid, assigned.uid)
    assert.deepEqual(
      statusChangesOf(db).map(({ action, fromStatus, toStatus }) => ({ action, fromStatus, toStatus })),
      [{ action: RESUBMIT, fromStatus: RETURNED, toStatus: SUBMITTED }],
    )
    assert.equal(activityOf(db).filter((entry) => entry.type === COORDINATOR_ASSIGNED).length, 0)
  })

  test('mandatory fields are still required on resubmission', async () => {
    const db = fakeDb(readyRequest(RETURNED, { core: { title: 'Cleared fields' } }))

    await assert.rejects(transitionEventRequest('request-1', RESUBMIT, owner, db, NOW), EventRequestValidationError)
    assert.equal(db.store.get('request-1').status, RETURNED)
    assert.deepEqual(activityOf(db), [])
  })

  test('"resubmit" on a draft and "submit" on a returned request are refused, not swapped', async () => {
    await assertRefused(transitionEventRequest('request-1', RESUBMIT, owner, fakeDb(readyRequest(DRAFT)), NOW), WRONG_STATUS)
    await assertRefused(transitionEventRequest('request-1', SUBMIT, owner, fakeDb(readyRequest(RETURNED)), NOW), WRONG_STATUS)
  })
})

describe('SPM-9 — refused status changes leave the request and its history unchanged', () => {
  for (const status of [COMPLETED, CANCELLED, REJECTED]) {
    test(`no change is allowed on a ${status} event, even by its assigned Coordinator or owner`, async () => {
      for (const [user, action] of [[assigned, CANCEL], [assigned, START_REVIEW], [owner, RESUBMIT], [owner, SUBMIT]]) {
        const db = fakeDb(readyRequest(status))
        await assertRefused(transitionEventRequest('request-1', action, user, db, NOW), TERMINAL_STATUS)
        assert.equal(db.store.get('request-1').status, status)
        assert.deepEqual(activityOf(db), [])
      }
    })
  }

  test('a Coordinator who is not assigned to the request is out of scope', async () => {
    const db = fakeDb(readyRequest(SUBMITTED))
    await assert.rejects(transitionEventRequest('request-1', START_REVIEW, otherCoordinator, db, NOW), EventRequestNotFoundError)
    assert.equal(db.store.get('request-1').status, SUBMITTED)
    assert.deepEqual(activityOf(db), [])
  })

  test('the Organiser cannot perform Coordinator actions on their own request', async () => {
    await assertRefused(transitionEventRequest('request-1', APPROVE, owner, fakeDb(readyRequest(UNDER_REVIEW)), NOW), NOT_PERMITTED)
  })

  test('confirm is refused while venue and technical arrangements are not approved', async () => {
    const db = fakeDb(readyRequest(PLANNING))
    await assertRefused(transitionEventRequest('request-1', CONFIRM, assigned, db, NOW), ARRANGEMENTS_NOT_APPROVED)
    assert.equal(db.store.get('request-1').status, PLANNING)
  })

  test('complete is refused before the event has taken place', async () => {
    const db = fakeDb(readyRequest(CONFIRMED))
    await assertRefused(transitionEventRequest('request-1', COMPLETE, assigned, db, NOW), EVENT_NOT_ENDED)
    assert.equal(db.store.get('request-1').status, CONFIRMED)
  })

  test('an unknown action is refused', async () => {
    await assertRefused(transitionEventRequest('request-1', 'set_status', assigned, fakeDb(readyRequest(SUBMITTED)), NOW), UNKNOWN_ACTION)
  })

  test('a user outside the request\'s scope learns nothing about it', async () => {
    for (const status of [SUBMITTED, COMPLETED]) {
      await assert.rejects(
        transitionEventRequest('request-1', START_REVIEW, outsider, fakeDb(readyRequest(status)), NOW),
        EventRequestForbiddenError,
      )
    }
    // A draft is out of scope for everyone but its owner, the assigned-to-be Coordinator included.
    await assert.rejects(transitionEventRequest('request-1', SUBMIT, assigned, fakeDb(readyRequest(DRAFT)), NOW), EventRequestNotFoundError)
  })

  test('a missing request is reported as not found', async () => {
    await assert.rejects(transitionEventRequest('missing', START_REVIEW, assigned, fakeDb(readyRequest(SUBMITTED)), NOW), EventRequestNotFoundError)
  })
})

const venueStaff = Object.freeze({ uid: 'venue-1', name: 'Vera Venue', roles: [VENUE_STAFF] })
const technicalStaff = Object.freeze({ uid: 'tech-1', name: 'Theo Tech', roles: [TECHNICAL_STAFF] })

const planningWithStaff = (overrides = {}) =>
  readyRequest(PLANNING, {
    assignedStaffUids: [venueStaff.uid, technicalStaff.uid],
    equipment: { requirements: ['projector'], technicalSupportNeeded: true },
    ...overrides,
  })

describe('SPM-65 — transition scope preserves multi-role permissions', () => {
  for (const [status, action] of [[DRAFT, SUBMIT], [RETURNED, RESUBMIT]]) {
    test(`an owning Organiser with the Coordinator role can ${action}`, async () => {
      const user = { ...owner, roles: [ORGANISER, COORDINATOR] }
      const db = fakeDb(readyRequest(status))
      const updated = await transitionEventRequest('request-1', action, user, db, NOW)
      assert.equal(updated.status, SUBMITTED)
      assert.ok(updated.assignedCoordinatorUid)
      assert.notEqual(updated.assignedCoordinatorUid, user.uid)
      if (action === RESUBMIT) assert.equal(updated.assignedCoordinatorUid, assigned.uid)
      assert.equal(statusChangesOf(db).length, 1)
    })
  }

  test('an assigned staff member with the Coordinator role can sign off but cannot act as the assigned Coordinator', async () => {
    const user = { ...venueStaff, roles: [VENUE_STAFF, COORDINATOR] }
    const db = fakeDb(planningWithStaff())
    await transitionEventRequest('request-1', APPROVE_VENUE, user, db, NOW)
    assert.equal(db.store.get('request-1').arrangementApprovals.venue.decision, 'approved')
    const before = structuredClone(db.store.get('request-1'))
    const activityBefore = structuredClone(activityOf(db))
    await assertRefused(transitionEventRequest('request-1', REJECT, user, db, NOW), NOT_PERMITTED)
    assert.deepEqual(db.store.get('request-1'), before)
    assert.deepEqual(activityOf(db), activityBefore)
  })
})

describe('SPM-9 — venue and technical sign-off unlocks Confirm', () => {
  test('assigned staff approve; each decision is recorded; then the assigned Coordinator confirms', async () => {
    const db = fakeDb(planningWithStaff())

    await assertRefused(transitionEventRequest('request-1', CONFIRM, assigned, db, NOW), ARRANGEMENTS_NOT_APPROVED)
    await transitionEventRequest('request-1', APPROVE_VENUE, venueStaff, db, NOW)
    await assertRefused(transitionEventRequest('request-1', CONFIRM, assigned, db, NOW), ARRANGEMENTS_NOT_APPROVED)
    await transitionEventRequest('request-1', APPROVE_TECHNICAL, technicalStaff, db, NOW)

    assert.deepEqual(db.store.get('request-1').arrangementApprovals, {
      venue: { decision: ARRANGEMENT_APPROVED, byUid: venueStaff.uid, at: NOW.toISOString() },
      technical: { decision: ARRANGEMENT_APPROVED, byUid: technicalStaff.uid, at: NOW.toISOString() },
    })
    assert.deepEqual(
      activityOf(db)
        .filter((entry) => entry.type === ARRANGEMENT_DECIDED)
        .map(({ arrangement, decision, actor }) => [arrangement, decision, actor.uid]),
      [
        ['venue', ARRANGEMENT_APPROVED, venueStaff.uid],
        ['technical', ARRANGEMENT_APPROVED, technicalStaff.uid],
      ],
    )

    const confirmed = await transitionEventRequest('request-1', CONFIRM, assigned, db, NOW)
    assert.equal(confirmed.status, CONFIRMED)
    assert.deepEqual(
      statusChangesOf(db).map(({ action, fromStatus, toStatus }) => ({ action, fromStatus, toStatus })),
      [{ action: CONFIRM, fromStatus: PLANNING, toStatus: CONFIRMED }],
    )
  })

  test('a venue rejection keeps the event in Planning and blocks Confirm; staff may later approve', async () => {
    const db = fakeDb(planningWithStaff({ equipment: { requirements: [], technicalSupportNeeded: false } }))

    const rejected = await transitionEventRequest('request-1', REJECT_VENUE, venueStaff, db, NOW)
    assert.equal(rejected.status, PLANNING)
    assert.equal(rejected.arrangementApprovals.venue.decision, ARRANGEMENT_REJECTED)
    await assertRefused(transitionEventRequest('request-1', CONFIRM, assigned, db, NOW), ARRANGEMENTS_NOT_APPROVED)

    await transitionEventRequest('request-1', APPROVE_VENUE, venueStaff, db, NOW)
    assert.equal((await transitionEventRequest('request-1', CONFIRM, assigned, db, NOW)).status, CONFIRMED)
  })

  test('the Coordinator cannot sign off an arrangement in place of the staff', async () => {
    const db = fakeDb(planningWithStaff())
    await assertRefused(transitionEventRequest('request-1', APPROVE_VENUE, assigned, db, NOW), NOT_ASSIGNED_STAFF)
    assert.equal(db.store.get('request-1').arrangementApprovals, undefined)
    assert.deepEqual(activityOf(db), [])
  })
})

describe('SPM-9 — Organiser cancellation request', () => {
  test('requested, then approved: Confirmed → Cancelled, with the request and both decisions recorded', async () => {
    const db = fakeDb(readyRequest(CONFIRMED))

    const requested = await transitionEventRequest('request-1', REQUEST_CANCELLATION, owner, db, NOW, { reason: '  Keynote withdrew  ' })
    assert.equal(requested.status, CONFIRMED)
    assert.deepEqual(requested.cancellationRequest, {
      status: CANCELLATION_PENDING,
      reason: 'Keynote withdrew',
      requestedByUid: owner.uid,
      requestedAt: NOW.toISOString(),
    })

    const approved = await transitionEventRequest('request-1', APPROVE_CANCELLATION, assigned, db, NOW)
    assert.equal(approved.status, CANCELLED)
    assert.equal(approved.cancellationRequest.status, CANCELLATION_APPROVED)
    assert.equal(approved.cancellationRequest.decidedByUid, assigned.uid)

    assert.deepEqual(
      activityOf(db).map((entry) => [entry.type, entry.actor.uid]),
      [
        [CANCELLATION_REQUESTED, owner.uid],
        [CANCELLATION_DECIDED, assigned.uid],
        [STATUS_CHANGED, assigned.uid],
      ],
    )
    assert.deepEqual(
      statusChangesOf(db).map(({ action, fromStatus, toStatus }) => ({ action, fromStatus, toStatus })),
      [{ action: APPROVE_CANCELLATION, fromStatus: CONFIRMED, toStatus: CANCELLED }],
    )
  })

  test('refused: the event stays Confirmed, and the Organiser may ask again', async () => {
    const db = fakeDb(readyRequest(CONFIRMED))
    await transitionEventRequest('request-1', REQUEST_CANCELLATION, owner, db, NOW, { reason: 'Budget cut' })
    await assertRefused(transitionEventRequest('request-1', REQUEST_CANCELLATION, owner, db, NOW, { reason: 'Budget cut' }), CANCELLATION_ALREADY_PENDING)

    const refused = await transitionEventRequest('request-1', REFUSE_CANCELLATION, assigned, db, NOW, { reason: 'Contract terms' })
    assert.equal(refused.status, CONFIRMED)
    assert.equal(refused.cancellationRequest.status, CANCELLATION_REFUSED)
    assert.equal(refused.cancellationRequest.decisionReason, 'Contract terms')
    assert.deepEqual(statusChangesOf(db), [])

    const again = await transitionEventRequest('request-1', REQUEST_CANCELLATION, owner, db, NOW, { reason: 'Budget cut again' })
    assert.equal(again.cancellationRequest.status, CANCELLATION_PENDING)
    assert.equal(activityOf(db).filter((entry) => entry.type === CANCELLATION_REQUESTED).length, 2)
  })

  test('the Coordinator cannot cancel directly while a cancellation request is pending', async () => {
    const db = fakeDb(readyRequest(CONFIRMED))
    await transitionEventRequest('request-1', REQUEST_CANCELLATION, owner, db, NOW, { reason: 'Budget cut' })
    await assertRefused(
      transitionEventRequest('request-1', CANCEL, assigned, db, NOW, { reason: 'Venue closed' }),
      CANCELLATION_REQUEST_PENDING,
    )
    assert.equal(db.store.get('request-1').status, CONFIRMED)
  })
})

describe('SPM-9 — a direct cancellation by the Coordinator states its reason', () => {
  test('the reason is required', async () => {
    for (const reason of [undefined, '', '   ']) {
      const db = fakeDb(readyRequest(CONFIRMED))
      await assertRefused(transitionEventRequest('request-1', CANCEL, assigned, db, NOW, { reason }), REASON_REQUIRED)
      assert.equal(db.store.get('request-1').status, CONFIRMED)
    }
  })

  test('a reason that is not text, or too long, is refused', async () => {
    for (const reason of [42, 'x'.repeat(MAX_REASON_LENGTH + 1)]) {
      await assertRefused(
        transitionEventRequest('request-1', CANCEL, assigned, fakeDb(readyRequest(CONFIRMED)), NOW, { reason }),
        REASON_INVALID,
      )
    }
  })
})
