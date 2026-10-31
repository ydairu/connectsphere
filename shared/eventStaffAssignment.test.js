import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { TECHNICAL_STAFF, VENUE_STAFF, canEdit } from './permissions.js'
import { CANCELLED, COMPLETED, CONFIRMED, PLANNING, PREPARATION, REJECTED } from './status.js'
import { chooseEventStaff, countActiveEventStaff } from './eventStaffAssignment.js'
import { canUpdateBookingPreparation } from './venuePreparation.js'

const users = [
  { uid: 'a', roles: [VENUE_STAFF] },
  { uid: 'b', roles: [VENUE_STAFF, TECHNICAL_STAFF] },
  { uid: 'c', roles: [VENUE_STAFF] },
  { uid: 't', roles: [TECHNICAL_STAFF] },
]

describe('SPM-71 event staff selection', () => {
  test('counts only Planning, Confirmed and Preparation, once per event and role', () => {
    const events = [PLANNING, CONFIRMED, PREPARATION, CANCELLED, COMPLETED, REJECTED]
      .map((status) => ({ status, assignedVenueStaffUid: 'a', assignedTechnicalStaffUid: 'b' }))
    assert.equal(countActiveEventStaff(events, VENUE_STAFF).get('a'), 3)
    assert.equal(countActiveEventStaff(events, TECHNICAL_STAFF).get('b'), 3)
  })

  test('lowest event workload wins before recency; oldest sequence breaks a tie', () => {
    const counts = new Map([['a', 1], ['b', 2], ['c', 1]])
    assert.equal(chooseEventStaff(users, VENUE_STAFF, counts, { a: 8, c: 3 }).uid, 'c')
    assert.equal(chooseEventStaff(users, VENUE_STAFF, counts, { a: 2, c: 9 }).uid, 'a')
    assert.equal(chooseEventStaff(users, VENUE_STAFF, counts, { c: 9 }).uid, 'a')
    assert.equal(chooseEventStaff(users, VENUE_STAFF, new Map([['b', 5], ['t', 1]]), {}).uid, 'a')
  })

  test('dual-role account is eligible independently for either role', () => {
    assert.equal(chooseEventStaff(users, TECHNICAL_STAFF, new Map([['t', 2]]), {}).uid, 'b')
  })

  test('only the booking assignee may edit its venue preparation in Preparation; equipment uses the canonical member', () => {
    const request = { id: 'event', status: PREPARATION, assignedStaffUids: ['a', 'b', 'c'],
      assignedVenueStaffUid: 'a', assignedTechnicalStaffUid: 'b' }
    const booking = { id: 'hall', venueNeedId: 'hall', eventRequestId: 'event', status: 'approved', assignedVenueStaffUid: 'a' }
    assert.equal(canUpdateBookingPreparation(users[0], request, booking, [booking]), true)
    assert.equal(canUpdateBookingPreparation(users[2], request, booking, [booking]), false)
    assert.equal(canEdit(users[1], request, 'equipmentPreparation'), true)
    assert.equal(canEdit(users[1], request, 'venuePreparation'), false)
    assert.equal(canUpdateBookingPreparation(users[0], { ...request, status: PLANNING }, booking, [booking]), false)
  })
})
