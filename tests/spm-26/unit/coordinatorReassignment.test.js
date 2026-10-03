// SPM-26 unit suite — the reassignment rules (shared/coordinatorReassignment.js) and the reassignment
// service (backend/src/services/coordinatorReassignmentService.js) against the in-memory Firestore fake,
// whose transaction log shows what one transaction read and wrote. Not a Firestore emulator: concurrent
// retries are not modelled.

import { describe, expect, it } from 'vitest'

import {
  HANDOVER_NOT_AGREED,
  NOT_PERMITTED,
  NOT_SUBMITTED,
  TARGET_IS_CURRENT,
  TARGET_IS_OWNER,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
  TERMINAL_STATUS,
  canReassignCoordinator,
  eligibleCoordinators,
  handoverAgreed,
  mayReassignCoordinator,
  reassignmentStatusRefusal,
  reassignmentTargetRefusal,
} from '../../../shared/coordinatorReassignment.js'
import { ATTENDEE, COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { ACTIVITY_SUBCOLLECTION, ASSIGNMENT_LOCK_PATH, loadCoordinators } from '../../../backend/src/services/coordinatorAssignmentService.js'
import {
  COORDINATOR_REASSIGNED,
  ReassignmentError,
  listReassignmentCandidates,
  reassignCoordinatorInTransaction,
  reassignEventRequest,
} from '../../../backend/src/services/coordinatorReassignmentService.js'
import { EventRequestForbiddenError, EventRequestNotFoundError } from '../../../backend/src/services/eventRequestService.js'
import { createFakeFirestore } from '../../../backend/src/testing/fakeFirestore.js'

const current = { uid: 'coord-1', name: 'Coordinator One', roles: [COORDINATOR] }
const other = { uid: 'coord-2', name: 'Coordinator Two', roles: [COORDINATOR] }
const legacy = { uid: 'coord-legacy', name: 'Legacy Coordinator', role: COORDINATOR }
const ownerCoordinator = { uid: 'owner-coord', name: 'Owner Coordinator', roles: [ORGANISER, COORDINATOR], organisationId: 'ORG-A' }
const venue = { uid: 'venue-1', name: 'Venue Staff', roles: [VENUE_STAFF] }

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: PLANNING,
    ownerUid: ownerCoordinator.uid,
    organisationId: 'ORG-A',
    assignedStaffUids: [venue.uid],
    assignedCoordinatorUid: current.uid,
    core: { title: 'Launch' },
    venue: { layoutPreference: 'theatre' },
    equipment: { requirements: ['projector'] },
    arrangementApprovals: { venue: { decision: 'approved', byUid: venue.uid, at: '2026-10-01T00:00:00.000Z' } },
    ...overrides,
  }
}

const NOW = new Date('2026-10-03T08:00:00.000Z')

function fixture(requestOverrides = {}) {
  const { id, ...data } = request(requestOverrides)
  const users = Object.fromEntries([current, other, legacy, ownerCoordinator, venue].map(({ uid, ...profile }) => [uid, profile]))
  return createFakeFirestore({ eventRequests: { [id]: data }, users })
}

const stored = (db) => ({ id: 'req-1', ...db.collectionData('eventRequests').get('req-1') })
const activity = (db) => [...db.collectionData(`eventRequests/req-1/${ACTIVITY_SUBCOLLECTION}`).values()]

describe('SPM-26 — who may reassign', () => {
  it('the assigned Coordinator may', () => {
    expect(mayReassignCoordinator(current, request())).toBe(true)
  })

  it.each([
    ['another Coordinator', other],
    ['the owning Organiser (also a Coordinator, but not assigned)', ownerCoordinator],
    ['assigned Venue Staff', venue],
    ['an Attendee', { uid: 'att', roles: [ATTENDEE] }],
  ])('%s may not', (_label, user) => {
    expect(mayReassignCoordinator(user, request())).toBe(false)
  })

  it('the uid alone is not enough without the Coordinator role', () => {
    expect(mayReassignCoordinator({ uid: current.uid, roles: [VENUE_STAFF] }, request())).toBe(false)
  })
})

describe('SPM-26 AC1/AC9 — when', () => {
  it.each([SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED])('allowed at %s', (status) => {
    expect(reassignmentStatusRefusal(request({ status }))).toBeNull()
    expect(canReassignCoordinator(current, request({ status }))).toBe(true)
  })

  it('allowed while an Organiser cancellation request is pending', () => {
    expect(canReassignCoordinator(current, request({ status: CONFIRMED, cancellationRequest: { status: 'pending' } }))).toBe(true)
  })

  it.each([COMPLETED, CANCELLED, REJECTED])('refused at %s', (status) => {
    expect(reassignmentStatusRefusal(request({ status }))).toBe(TERMINAL_STATUS)
    expect(canReassignCoordinator(current, request({ status }))).toBe(false)
  })

  it('a draft, which has no Coordinator, is refused', () => {
    expect(reassignmentStatusRefusal(request({ status: DRAFT, assignedCoordinatorUid: undefined }))).toBe(NOT_SUBMITTED)
  })
})

describe('SPM-26 AC3 — to whom', () => {
  const coordinatorUids = [current.uid, other.uid, ownerCoordinator.uid]
  const refusal = (targetUid) => reassignmentTargetRefusal({ request: request(), targetUid, coordinatorUids })

  it('another Coordinator is accepted', () => {
    expect(refusal(other.uid)).toBeNull()
  })

  it.each([
    [undefined, TARGET_REQUIRED],
    ['', TARGET_REQUIRED],
    ['  ', TARGET_REQUIRED],
    [42, TARGET_REQUIRED],
    [current.uid, TARGET_IS_CURRENT],
    [venue.uid, TARGET_NOT_COORDINATOR],
    ['nobody', TARGET_NOT_COORDINATOR],
    [ownerCoordinator.uid, TARGET_IS_OWNER],
  ])('%s is refused with %s', (targetUid, reason) => {
    expect(refusal(targetUid)).toBe(reason)
  })

  it('the agreement flag must be exactly true', () => {
    expect(handoverAgreed(true)).toBe(true)
    for (const flag of [undefined, null, false, 'true', 1]) expect(handoverAgreed(flag)).toBe(false)
  })

  it('the candidate list excludes the current Coordinator and the submitter, sorted by name, uid and name only', () => {
    const list = eligibleCoordinators(
      [current, other, legacy, ownerCoordinator].map(({ uid, name }) => ({ uid, name, email: 'x@example.test' })),
      request(),
    )
    expect(list).toEqual([
      { uid: other.uid, name: other.name },
      { uid: legacy.uid, name: legacy.name },
    ])
  })
})

describe('SPM-26 — loading Coordinators (shared with SPM-8)', () => {
  it('finds Coordinators by roles and by legacy role, as { uid, name } only', async () => {
    const coordinators = await loadCoordinators(fixture())
    expect(coordinators.map(({ uid }) => uid).sort()).toEqual([current.uid, other.uid, legacy.uid, ownerCoordinator.uid].sort())
    for (const coordinator of coordinators) expect(Object.keys(coordinator).sort()).toEqual(['name', 'uid'])
  })
})

describe('SPM-26 — reassignEventRequest', () => {
  it('Test 1 / AC2: updates assignedCoordinatorUid and returns the new Coordinator name', async () => {
    const db = fixture()
    const result = await reassignEventRequest('req-1', current, { coordinatorUid: other.uid, handoverAgreed: true }, db, NOW)
    expect(result.coordinator).toEqual({ name: other.name })
    expect(stored(db).assignedCoordinatorUid).toBe(other.uid)
  })

  it('Test 6 / AC7: status, sections, sign-off and cancellation request are unchanged', async () => {
    const db = fixture({ status: CONFIRMED, cancellationRequest: { status: 'pending', reason: 'Budget' } })
    const before = stored(db)
    await reassignEventRequest('req-1', current, { coordinatorUid: other.uid, handoverAgreed: true }, db, NOW)
    const after = stored(db)
    expect(after).toEqual({ ...before, assignedCoordinatorUid: other.uid, updatedAt: NOW.toISOString() })
  })

  it('Test 7 / AC6: records previous, new, actor and time in the same committed transaction as the update', async () => {
    const db = fixture()
    await reassignEventRequest('req-1', { ...current, name: 'Coordinator One' }, { coordinatorUid: other.uid, handoverAgreed: true }, db, NOW)

    expect(activity(db)).toEqual([
      {
        type: COORDINATOR_REASSIGNED,
        previousCoordinatorUid: current.uid,
        coordinatorUid: other.uid,
        actor: { type: 'user', uid: current.uid, name: 'Coordinator One' },
        at: NOW.toISOString(),
      },
    ])

    expect(db.transactions).toHaveLength(1)
    const [tx] = db.transactions
    expect(tx.committed).toBe(true)
    const lockPath = ASSIGNMENT_LOCK_PATH.join('/')
    expect(tx.reads).toEqual(['eventRequests/req-1', 'users', 'users', lockPath])
    expect(tx.writes).toHaveLength(3)
    expect(tx.writes).toContain('eventRequests/req-1')
    expect(tx.writes).toContain(lockPath)
    expect(tx.writes.some((path) => path.startsWith(`eventRequests/req-1/${ACTIVITY_SUBCOLLECTION}/`))).toBe(true)
    expect(db.collectionData(ASSIGNMENT_LOCK_PATH[0]).get(ASSIGNMENT_LOCK_PATH[1])).toEqual({
      lastAssignedRequestId: 'req-1',
      lastAssignedAt: NOW.toISOString(),
    })
  })

  async function expectRefused(promise, check) {
    await expect(promise).rejects.toSatisfy(check)
  }

  it.each([
    ['Test 2: same Coordinator', { coordinatorUid: current.uid, handoverAgreed: true }, TARGET_IS_CURRENT],
    ['Test 2: non-Coordinator', { coordinatorUid: venue.uid, handoverAgreed: true }, TARGET_NOT_COORDINATOR],
    ['Test 2: unknown uid', { coordinatorUid: 'nobody', handoverAgreed: true }, TARGET_NOT_COORDINATOR],
    ['the submitter', { coordinatorUid: ownerCoordinator.uid, handoverAgreed: true }, TARGET_IS_OWNER],
    ['no target', { handoverAgreed: true }, TARGET_REQUIRED],
    ['Test 3: missing agreement', { coordinatorUid: other.uid }, HANDOVER_NOT_AGREED],
    ['Test 3: agreement false', { coordinatorUid: other.uid, handoverAgreed: false }, HANDOVER_NOT_AGREED],
    ['Test 3: agreement as text', { coordinatorUid: other.uid, handoverAgreed: 'true' }, HANDOVER_NOT_AGREED],
  ])('%s is refused (400) and nothing is written', async (_label, input, reason) => {
    const db = fixture()
    const before = stored(db)
    await expectRefused(reassignEventRequest('req-1', current, input, db, NOW), (error) => error instanceof ReassignmentError && error.reason === reason && error.status === 400)
    expect(stored(db)).toEqual(before)
    expect(activity(db)).toEqual([])
    expect(db.transactions.every((tx) => !tx.committed)).toBe(true)
  })

  it.each([COMPLETED, CANCELLED, REJECTED])('Test 5: %s is refused (409) and nothing is written', async (status) => {
    const db = fixture({ status })
    await expectRefused(reassignEventRequest('req-1', current, { coordinatorUid: other.uid, handoverAgreed: true }, db, NOW), (error) => error.reason === TERMINAL_STATUS && error.status === 409)
    expect(stored(db).assignedCoordinatorUid).toBe(current.uid)
    expect(activity(db)).toEqual([])
  })

  it('Test 4 / AC8: an unassigned Coordinator gets not-found, even with an invalid body, and nothing is written', async () => {
    const db = fixture()
    await expectRefused(reassignEventRequest('req-1', other, { coordinatorUid: other.uid, handoverAgreed: true }, db, NOW), (error) => error instanceof EventRequestNotFoundError)
    await expectRefused(reassignEventRequest('req-1', other, {}, db, NOW), (error) => error instanceof EventRequestNotFoundError)
    expect(stored(db).assignedCoordinatorUid).toBe(current.uid)
    expect(activity(db)).toEqual([])
  })

  it('an in-scope user who may not reassign (the owner) is refused with not-permitted', async () => {
    const organiserOnly = { uid: ownerCoordinator.uid, roles: [ORGANISER], organisationId: 'ORG-A' }
    await expectRefused(reassignEventRequest('req-1', organiserOnly, { coordinatorUid: other.uid, handoverAgreed: true }, fixture(), NOW), (error) => error.reason === NOT_PERMITTED && error.status === 403)
  })

  it('an out-of-scope non-Coordinator gets forbidden', async () => {
    await expectRefused(reassignEventRequest('req-1', { uid: 'att', roles: [ATTENDEE] }, { coordinatorUid: other.uid, handoverAgreed: true }, fixture(), NOW), (error) => error instanceof EventRequestForbiddenError)
  })

  it('a missing event is not found', async () => {
    await expectRefused(reassignEventRequest('nope', current, { coordinatorUid: other.uid, handoverAgreed: true }, fixture(), NOW), (error) => error instanceof EventRequestNotFoundError)
  })
})

describe('SPM-26 — reassignCoordinatorInTransaction has no permission check (Change 5 reuse)', () => {
  it('applies the change for any caller that has authorised it', async () => {
    const db = fixture()
    const requestRef = db.collection('eventRequests').doc('req-1')
    const lead = { type: 'user', uid: 'lead-1', name: 'Coordinator Lead' }
    const updated = await db.runTransaction((tx) =>
      reassignCoordinatorInTransaction(tx, db, { requestRef, request: stored(db), toUid: other.uid, actor: lead, at: NOW.toISOString() }),
    )
    expect(updated.assignedCoordinatorUid).toBe(other.uid)
    expect(activity(db)[0]).toMatchObject({ type: COORDINATOR_REASSIGNED, previousCoordinatorUid: current.uid, coordinatorUid: other.uid, actor: lead })
  })
})

describe('SPM-26 — listReassignmentCandidates', () => {
  it('Test 9: the assigned Coordinator gets the other Coordinators as uid and name only', async () => {
    const list = await listReassignmentCandidates('req-1', current, fixture())
    expect(list).toEqual([
      { uid: other.uid, name: other.name },
      { uid: legacy.uid, name: legacy.name },
    ])
  })

  it('is refused like a reassignment for anyone else', async () => {
    await expect(listReassignmentCandidates('req-1', other, fixture())).rejects.toBeInstanceOf(EventRequestNotFoundError)
    await expect(listReassignmentCandidates('req-1', { uid: ownerCoordinator.uid, roles: [ORGANISER], organisationId: 'ORG-A' }, fixture())).rejects.toMatchObject({ reason: NOT_PERMITTED })
    await expect(listReassignmentCandidates('req-1', current, fixture({ status: COMPLETED }))).rejects.toMatchObject({ reason: TERMINAL_STATUS })
  })
})
