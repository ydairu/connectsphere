import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeFirestore } from '../testing/fakeFirestore.js'
import { COORDINATOR, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { APPROVE } from '../../../shared/statusTransitions.js'
import { PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { EVENT_STAFF_ASSIGNED, EventStaffAssignmentError, assignEventStaffInTransaction } from './eventStaffAssignmentService.js'
import { transitionEventRequest } from './statusTransitionService.js'

const now = new Date('2026-10-29T10:00:00Z')
const coordinator = { uid: 'coord', roles: [COORDINATOR] }
const core = { title: 'Forum', purpose: 'Updates', expectedAttendees: 40, durationHours: 2, preferredDateTime: '2026-12-10T10:00:00Z' }
const event = (status = UNDER_REVIEW) => ({ status, ownerUid: 'owner', assignedCoordinatorUid: 'coord', assignedStaffUids: [], core, venue: { layoutPreference: 'theatre' } })
const users = { coord: { roles: [COORDINATOR] }, v1: { roles: [VENUE_STAFF], name: 'Venue One' },
  v2: { roles: [VENUE_STAFF], name: 'Venue Two' }, t1: { roles: [TECHNICAL_STAFF], name: 'Tech One' },
  t2: { roles: [TECHNICAL_STAFF], name: 'Tech Two' } }

describe('SPM-71 Planning transition', () => {
  test('saves both owners, activity and notices in the status transaction', async () => {
    const db = createFakeFirestore({ users, eventRequests: { first: event() } })
    const result = await transitionEventRequest('first', APPROVE, coordinator, db, now)
    assert.equal(result.status, PLANNING)
    assert.equal(result.assignedVenueStaffUid, 'v1')
    assert.equal(result.assignedTechnicalStaffUid, 't1')
    assert.deepEqual(result.assignedStaffUids, ['v1', 't1'])
    assert.equal([...db.collectionData('eventRequests/first/activity').values()].filter((item) => item.type === EVENT_STAFF_ASSIGNED).length, 2)
    assert.equal([...db.collectionData('notifications').values()].filter((notice) => notice.type === 'event_staff_assigned').length, 2)
    assert.equal(db.transactions.at(-1).committed, true)
  })

  test('subsequent events use live workload then least recent assignment', async () => {
    const db = createFakeFirestore({ users, eventRequests: { first: event(), second: event(), third: event() } })
    const first = await transitionEventRequest('first', APPROVE, coordinator, db, now)
    const second = await transitionEventRequest('second', APPROVE, coordinator, db, now)
    const third = await transitionEventRequest('third', APPROVE, coordinator, db, now)
    assert.deepEqual([first.assignedVenueStaffUid, second.assignedVenueStaffUid, third.assignedVenueStaffUid], ['v1', 'v2', 'v1'])
    assert.deepEqual([first.assignedTechnicalStaffUid, second.assignedTechnicalStaffUid, third.assignedTechnicalStaffUid], ['t1', 't2', 't1'])
  })

  test('missing role aborts without status, activity, lock or notice writes', async () => {
    const db = createFakeFirestore({ users: { v1: users.v1 }, eventRequests: { first: event() } })
    await assert.rejects(transitionEventRequest('first', APPROVE, coordinator, db, now), EventStaffAssignmentError)
    assert.equal(db.store.get('first').status, UNDER_REVIEW)
    assert.equal(db.collectionData('systemLocks').size, 0)
    assert.equal(db.collectionData('notifications').size, 0)
    assert.equal(db.transactions.at(-1).committed, false)
  })

  test('existing owners are retained when a later path returns the event to Planning', async () => {
    const existing = { ...event(PLANNING), assignedVenueStaffUid: 'v2', assignedTechnicalStaffUid: 't1',
      assignedStaffUids: ['v2', 't1'] }
    const db = createFakeFirestore({ users, eventRequests: { first: existing } })
    const result = await db.runTransaction((tx) => assignEventStaffInTransaction(tx, db, { id: 'first', ...existing }, now.toISOString()))
    assert.deepEqual(result, { update: {}, assignments: [] })
    assert.equal(db.collectionData('systemLocks').size, 0)
  })
})
