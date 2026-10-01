// SPM-9 — Organiser cancellation requests: who may request and refuse, and when. Approving is a status
// transition, tested in statusTransitions.test.js. Pure-function level.
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_PENDING,
  CANCELLATION_REFUSED,
  NOT_CONFIRMED,
  NO_PENDING_CANCELLATION,
  canRefuseCancellation,
  canRequestCancellation,
  hasPendingCancellation,
} from './cancellationRequests.js'
import { COORDINATOR, ORGANISER } from './permissions.js'
import { NOT_PERMITTED } from './requestActors.js'
import { CONFIRMED, STATUSES } from './status.js'

const owner = { uid: 'org-1', roles: [ORGANISER] }
const colleague = { uid: 'org-2', roles: [ORGANISER] }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }

const requestAt = (status, overrides = {}) => ({ status, ownerUid: owner.uid, assignedCoordinatorUid: assigned.uid, ...overrides })
const pending = { cancellationRequest: { status: CANCELLATION_PENDING, reason: 'Venue flooded', requestedByUid: owner.uid } }
const refused = { cancellationRequest: { ...pending.cancellationRequest, status: CANCELLATION_REFUSED } }

describe('SPM-9 — requesting cancellation', () => {
  test('the owning Organiser may request cancellation of a Confirmed event', () => {
    assert.deepEqual(canRequestCancellation(owner, requestAt(CONFIRMED)), { allowed: true })
  })

  test('only a Confirmed event — before confirmation an unfulfillable event is rejected, not cancelled', () => {
    for (const status of STATUSES.filter((status) => status !== CONFIRMED)) {
      assert.equal(canRequestCancellation(owner, requestAt(status)).reason, NOT_CONFIRMED, status)
    }
  })

  test('only the owning Organiser — not a colleague and not the Coordinator', () => {
    for (const user of [colleague, assigned]) {
      assert.equal(canRequestCancellation(user, requestAt(CONFIRMED)).reason, NOT_PERMITTED, user.uid)
    }
  })

  test('one pending request at a time; after a refusal the Organiser may ask again', () => {
    assert.equal(canRequestCancellation(owner, requestAt(CONFIRMED, pending)).reason, CANCELLATION_ALREADY_PENDING)
    assert.deepEqual(canRequestCancellation(owner, requestAt(CONFIRMED, refused)), { allowed: true })
  })
})

describe('SPM-9 — refusing a cancellation request', () => {
  test('the assigned Coordinator may refuse a pending request', () => {
    assert.equal(hasPendingCancellation(requestAt(CONFIRMED, pending)), true)
    assert.deepEqual(canRefuseCancellation(assigned, requestAt(CONFIRMED, pending)), { allowed: true })
  })

  test('nobody else may refuse it', () => {
    for (const user of [otherCoordinator, owner]) {
      assert.equal(canRefuseCancellation(user, requestAt(CONFIRMED, pending)).reason, NOT_PERMITTED, user.uid)
    }
  })

  test('there must be a pending request, on a Confirmed event', () => {
    assert.equal(canRefuseCancellation(assigned, requestAt(CONFIRMED)).reason, NO_PENDING_CANCELLATION)
    assert.equal(canRefuseCancellation(assigned, requestAt(CONFIRMED, refused)).reason, NO_PENDING_CANCELLATION)
    assert.equal(hasPendingCancellation(requestAt(CONFIRMED, refused)), false)
  })
})
