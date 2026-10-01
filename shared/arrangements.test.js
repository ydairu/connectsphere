// SPM-9 — venue and technical arrangement sign-off, the condition for Confirm. Pure-function level.
// Run: node --test "shared/**/*.test.js"

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ARRANGEMENT_APPROVED,
  ARRANGEMENT_NOT_REQUIRED,
  ARRANGEMENT_REJECTED,
  NOT_ASSIGNED_STAFF,
  NOT_AT_PLANNING,
  TECHNICAL_ARRANGEMENT,
  UNKNOWN_ARRANGEMENT,
  VENUE_ARRANGEMENT,
  arrangementsApproved,
  canDecideArrangement,
  decidableArrangements,
  requiredArrangements,
  technicalArrangementRequired,
} from './arrangements.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from './permissions.js'
import { CONFIRMED, PLANNING, STATUSES } from './status.js'

const venueStaff = { uid: 'venue-1', roles: [VENUE_STAFF] }
const technicalStaff = { uid: 'tech-1', roles: [TECHNICAL_STAFF] }
const bothStaff = { uid: 'both-1', roles: [VENUE_STAFF, TECHNICAL_STAFF] }
const unassignedVenueStaff = { uid: 'venue-2', roles: [VENUE_STAFF] }
const coordinator = { uid: 'coord-1', roles: [COORDINATOR] }
const owner = { uid: 'org-1', roles: [ORGANISER] }

function requestAt(status, overrides = {}) {
  return {
    status,
    ownerUid: owner.uid,
    assignedCoordinatorUid: coordinator.uid,
    assignedStaffUids: [venueStaff.uid, technicalStaff.uid, bothStaff.uid],
    equipment: { requirements: ['projector'], technicalSupportNeeded: false },
    ...overrides,
  }
}

const decision = (value) => ({ decision: value, byUid: 'someone', at: '2026-09-30T00:00:00.000Z' })

describe('SPM-9 — which arrangements are required', () => {
  test('venue is always required; technical only when equipment or technical support is requested', () => {
    assert.deepEqual(requiredArrangements(requestAt(PLANNING)), [VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT])
    assert.deepEqual(
      requiredArrangements(requestAt(PLANNING, { equipment: { requirements: [], technicalSupportNeeded: true } })),
      [VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT],
    )
    for (const equipment of [{ requirements: [], technicalSupportNeeded: false }, {}, undefined]) {
      assert.equal(technicalArrangementRequired(requestAt(PLANNING, { equipment })), false, JSON.stringify(equipment))
    }
  })

  test('all required arrangements must be approved — a rejection or a missing decision is not enough', () => {
    const withApprovals = (arrangementApprovals) => requestAt(PLANNING, { arrangementApprovals })
    assert.equal(arrangementsApproved(requestAt(PLANNING)), false)
    assert.equal(arrangementsApproved(withApprovals({ venue: decision(ARRANGEMENT_APPROVED) })), false)
    assert.equal(
      arrangementsApproved(withApprovals({ venue: decision(ARRANGEMENT_APPROVED), technical: decision(ARRANGEMENT_REJECTED) })),
      false,
    )
    assert.equal(
      arrangementsApproved(withApprovals({ venue: decision(ARRANGEMENT_APPROVED), technical: decision(ARRANGEMENT_APPROVED) })),
      true,
    )
  })
})

describe('SPM-9 — who may decide an arrangement, and when', () => {
  test('assigned Venue Staff decide the venue; assigned Technical Staff decide the technical arrangement', () => {
    assert.deepEqual(decidableArrangements(venueStaff, requestAt(PLANNING)), [VENUE_ARRANGEMENT])
    assert.deepEqual(decidableArrangements(technicalStaff, requestAt(PLANNING)), [TECHNICAL_ARRANGEMENT])
    assert.deepEqual(decidableArrangements(bothStaff, requestAt(PLANNING)), [VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT])
  })

  test('the Coordinator, the Organiser and unassigned staff cannot decide — no override of a missing approval', () => {
    for (const user of [coordinator, owner, unassignedVenueStaff]) {
      for (const arrangement of [VENUE_ARRANGEMENT, TECHNICAL_ARRANGEMENT]) {
        assert.equal(canDecideArrangement(user, requestAt(PLANNING), arrangement).reason, NOT_ASSIGNED_STAFF, `${user.uid} ${arrangement}`)
      }
    }
  })

  test('staff decide only their own arrangement', () => {
    assert.equal(canDecideArrangement(venueStaff, requestAt(PLANNING), TECHNICAL_ARRANGEMENT).reason, NOT_ASSIGNED_STAFF)
    assert.equal(canDecideArrangement(technicalStaff, requestAt(PLANNING), VENUE_ARRANGEMENT).reason, NOT_ASSIGNED_STAFF)
  })

  test('decisions are made only at Planning', () => {
    for (const status of STATUSES.filter((status) => status !== PLANNING)) {
      assert.equal(canDecideArrangement(venueStaff, requestAt(status), VENUE_ARRANGEMENT).reason, NOT_AT_PLANNING, status)
    }
    assert.deepEqual(decidableArrangements(venueStaff, requestAt(CONFIRMED)), [])
  })

  test('technical sign-off is not offered when nothing technical was requested', () => {
    const request = requestAt(PLANNING, { equipment: { requirements: [], technicalSupportNeeded: false } })
    assert.equal(canDecideArrangement(technicalStaff, request, TECHNICAL_ARRANGEMENT).reason, ARRANGEMENT_NOT_REQUIRED)
  })

  test('an unknown arrangement is refused', () => {
    assert.equal(canDecideArrangement(venueStaff, requestAt(PLANNING), 'catering').reason, UNKNOWN_ARRANGEMENT)
  })
})
