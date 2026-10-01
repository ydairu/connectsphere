// SPM-65 — View My Assigned Events, at the pure-predicate level: isAssignedCoordinator() and the
// coordinator's record scope in shared/permissions.js. The HTTP behaviour is in
// tests/spm-65/integration/assignedEventsApi.test.js.

import { describe, expect, it } from 'vitest'

import {
  COORDINATOR,
  ORGANISER,
  SECTIONS,
  VENUE_STAFF,
  canEdit,
  inScope,
  isAssignedCoordinator,
  projectRequest,
} from '../../../shared/permissions.js'
import { DRAFT, PLANNING, SUBMITTED } from '../../../shared/status.js'

const coordinatorA = { uid: 'u-coord-a', roles: [COORDINATOR] }
const coordinatorB = { uid: 'u-coord-b', roles: [COORDINATOR] }

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: SUBMITTED,
    ownerUid: 'u-owner',
    organisationId: 'org-1',
    assignedStaffUids: [],
    assignedCoordinatorUid: coordinatorA.uid,
    core: { title: 'Annual Summit' },
    internal: { planningNotes: 'Hold Hall B' },
    ...overrides,
  }
}

describe('SPM-65 — isAssignedCoordinator()', () => {
  it('Is true only for the coordinator named on the request', () => {
    expect(isAssignedCoordinator(coordinatorA, request())).toBe(true)
    expect(isAssignedCoordinator(coordinatorB, request())).toBe(false)
  })

  it('Matches no one when the request has no coordinator, or the user has no uid', () => {
    expect(isAssignedCoordinator(coordinatorA, request({ assignedCoordinatorUid: null }))).toBe(false)
    expect(isAssignedCoordinator(coordinatorA, request({ assignedCoordinatorUid: undefined }))).toBe(false)
    expect(isAssignedCoordinator({ roles: [COORDINATOR] }, request({ assignedCoordinatorUid: undefined }))).toBe(false)
    expect(isAssignedCoordinator(null, request())).toBe(false)
  })
})

describe('SPM-65 — coordinator record scope', () => {
  it('A coordinator sees, and may edit, only the events assigned to them', () => {
    expect(inScope(coordinatorA, request())).toBe(true)
    expect(inScope(coordinatorB, request())).toBe(false)
    expect(projectRequest(coordinatorB, request())).toBe(null)
    for (const section of SECTIONS) expect(canEdit(coordinatorB, request({ status: PLANNING }), section), section).toBe(false)
  })

  it('Reassignment moves the event between scopes', () => {
    const reassigned = request({ assignedCoordinatorUid: coordinatorB.uid })
    expect(inScope(coordinatorB, reassigned)).toBe(true)
    expect(inScope(coordinatorA, reassigned)).toBe(false)
  })

  it('A draft is outside every coordinator\'s scope, even if it names one', () => {
    expect(inScope(coordinatorA, request({ status: DRAFT }))).toBe(false)
  })

  it('A coordinator holding a second role keeps that role\'s scope (SPM-42 union)', () => {
    const coordinatorStaff = { uid: 'u-coord-staff', roles: [COORDINATOR, VENUE_STAFF] }
    const staffAssigned = request({ status: PLANNING, assignedStaffUids: [coordinatorStaff.uid] })
    expect(inScope(coordinatorStaff, staffAssigned), 'in scope as venue staff').toBe(true)
    expect(canEdit(coordinatorStaff, staffAssigned, 'venue')).toBe(true)
    expect(canEdit(coordinatorStaff, staffAssigned, 'internal'), 'not as coordinator: not assigned').toBe(false)

    const coordinatorOrganiser = { uid: 'u-coord-org', roles: [COORDINATOR, ORGANISER], organisationId: 'org-1' }
    expect(inScope(coordinatorOrganiser, request()), "in scope as an organiser of the event's organisation").toBe(true)
    expect(canEdit(coordinatorOrganiser, request(), 'internal'), 'not as coordinator: not assigned').toBe(false)
  })
})
