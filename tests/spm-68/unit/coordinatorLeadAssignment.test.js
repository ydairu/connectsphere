// SPM-68 — who may assign, when, and to whom (shared/coordinatorLeadAssignment.js), and the queue's contents.
// Pure functions, no I/O.

import { describe, expect, it } from 'vitest'

import {
  NOT_FOUND,
  NOT_UNASSIGNED,
  TARGET_IS_OWNER,
  TARGET_IS_SELF,
  TARGET_NOT_COORDINATOR,
  TARGET_REQUIRED,
  assignmentCandidates,
  assignmentStatusRefusal,
  assignmentTargetRefusal,
  mayAssignFromQueue,
  queueItem,
  unassignedQueue,
} from '../../../shared/coordinatorLeadAssignment.js'
import { COORDINATOR, COORDINATOR_LEAD, ORGANISER, SAFETY_OFFICER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { DRAFT, PLANNING, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'

const lead = { uid: 'lead-1', roles: [COORDINATOR_LEAD] }
const request = (overrides = {}) => ({ id: 'req-1', status: SUBMITTED, ownerUid: 'owner-1', assignedCoordinatorUid: null, ...overrides })
const COORDINATOR_UIDS = ['coord-a', 'coord-b', 'owner-1', 'lead-1']

describe('SPM-68 AC5 — only Event Coordinator Leads may assign', () => {
  it('allows any Lead, including one holding other roles', () => {
    expect(mayAssignFromQueue(lead)).toBe(true)
    expect(mayAssignFromQueue({ uid: 'lead-2', roles: [COORDINATOR_LEAD] })).toBe(true)
    expect(mayAssignFromQueue({ uid: 'x', roles: [COORDINATOR, COORDINATOR_LEAD] })).toBe(true)
  })

  it.each([[ORGANISER], [COORDINATOR], [VENUE_STAFF], [TECHNICAL_STAFF], [SAFETY_OFFICER], ['attendee']])('refuses %s', (role) => {
    expect(mayAssignFromQueue({ uid: 'x', roles: [role] })).toBe(false)
  })

  it('refuses a user with no roles', () => {
    expect(mayAssignFromQueue({ uid: 'x' })).toBe(false)
    expect(mayAssignFromQueue(null)).toBe(false)
  })
})

describe('SPM-68 AC4 — only a submitted, unassigned request may be assigned', () => {
  it('allows a submitted request with no Coordinator (null or absent)', () => {
    expect(assignmentStatusRefusal(request())).toBeNull()
    const { assignedCoordinatorUid: _absent, ...legacy } = request()
    expect(assignmentStatusRefusal(legacy)).toBeNull()
  })

  it('a missing request or a draft is not found, so a draft’s existence is not revealed', () => {
    expect(assignmentStatusRefusal(null)).toBe(NOT_FOUND)
    expect(assignmentStatusRefusal(request({ status: DRAFT }))).toBe(NOT_FOUND)
  })

  it.each([
    ['already assigned', { assignedCoordinatorUid: 'coord-a' }],
    ['returned', { status: RETURNED, assignedCoordinatorUid: 'coord-a' }],
    ['under review', { status: UNDER_REVIEW, assignedCoordinatorUid: 'coord-a' }],
    ['planning', { status: PLANNING, assignedCoordinatorUid: 'coord-a' }],
  ])('refuses a request that is %s', (_label, overrides) => {
    expect(assignmentStatusRefusal(request(overrides))).toBe(NOT_UNASSIGNED)
  })
})

describe('SPM-68 AC9 — whom the Lead may choose', () => {
  const refusal = (targetUid, leadUid = lead.uid) => assignmentTargetRefusal({ request: request(), targetUid, coordinatorUids: COORDINATOR_UIDS, leadUid })

  it('allows another Event Coordinator', () => {
    expect(refusal('coord-a')).toBeNull()
  })

  it.each([
    ['no Coordinator chosen', undefined, TARGET_REQUIRED],
    ['a blank uid', '  ', TARGET_REQUIRED],
    ['the Lead themselves', 'lead-1', TARGET_IS_SELF],
    ['a user without the Coordinator role', 'venue-staff-1', TARGET_NOT_COORDINATOR],
    ['an unknown uid', 'nobody', TARGET_NOT_COORDINATOR],
    ['the request’s submitter', 'owner-1', TARGET_IS_OWNER],
  ])('refuses %s', (_label, targetUid, reason) => {
    expect(refusal(targetUid)).toBe(reason)
  })

  it('a Lead who also holds the Coordinator role still cannot choose themselves', () => {
    expect(assignmentTargetRefusal({ request: request(), targetUid: 'lead-1', coordinatorUids: COORDINATOR_UIDS, leadUid: 'lead-1' })).toBe(TARGET_IS_SELF)
  })

  it('the picker lists every other Coordinator with their active workload, sorted by name, none pre-selected', () => {
    const coordinators = [
      { uid: 'coord-b', name: 'Bea' },
      { uid: 'coord-a', name: 'Ada' },
      { uid: 'owner-1', name: 'Owner who coordinates' },
      { uid: 'lead-1', name: 'Lead who coordinates' },
      { uid: 'coord-c', name: '  ' },
    ]
    const counts = new Map([['coord-b', 3], ['owner-1', 0]])
    expect(assignmentCandidates(coordinators, request(), lead, counts)).toEqual([
      { uid: 'coord-a', name: 'Ada', activeEvents: 0 },
      { uid: 'coord-b', name: 'Bea', activeEvents: 3 },
      { uid: 'coord-c', name: 'coord-c', activeEvents: 0 },
    ])
  })
})

describe('SPM-68 AC3 — the queue', () => {
  it('each item carries exactly the basic event information', () => {
    const item = queueItem({
      ...request(),
      organisationId: 'org-a',
      organisationName: 'Organisation A',
      submittedAt: '2026-10-28T01:30:00.000Z',
      createdAt: '2026-10-27T08:00:00.000Z',
      core: { title: 'Forum', description: 'not listed', preferredDateTime: '2026-12-10T14:00:00+08:00', durationHours: 3, expectedAttendees: 40 },
      internal: { planningNotes: 'never' },
    })
    expect(item).toEqual({
      id: 'req-1',
      title: 'Forum',
      preferredDateTime: '2026-12-10T14:00:00+08:00',
      durationHours: 3,
      expectedAttendees: 40,
      organisationName: 'Organisation A',
      submittedAt: '2026-10-28T01:30:00.000Z',
    })
  })

  it('a record without submittedAt falls back to its creation time', () => {
    expect(queueItem(request({ createdAt: '2026-09-01T00:00:00.000Z' })).submittedAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('lists unassigned submitted requests only, oldest first', () => {
    const queue = unassignedQueue([
      request({ id: 'newer', submittedAt: '2026-10-28T00:00:00.000Z' }),
      request({ id: 'assigned', assignedCoordinatorUid: 'coord-a', submittedAt: '2026-10-01T00:00:00.000Z' }),
      request({ id: 'draft', status: DRAFT, createdAt: '2026-09-01T00:00:00.000Z' }),
      request({ id: 'older', submittedAt: '2026-10-20T00:00:00.000Z' }),
      { id: 'legacy', status: SUBMITTED, ownerUid: 'owner-1', createdAt: '2026-10-25T00:00:00.000Z' },
    ])
    expect(queue.map((item) => item.id)).toEqual(['older', 'legacy', 'newer'])
  })

  it('orders by the instant, whatever the time zone the time was written in', () => {
    const queue = unassignedQueue([
      request({ id: 'utc-later', submittedAt: '2026-10-28T02:00:00.000Z' }),
      request({ id: 'sgt-earlier', submittedAt: '2026-10-28T09:30:00+08:00' }),
    ])
    expect(queue.map((item) => item.id)).toEqual(['sgt-earlier', 'utc-later'])
  })
})
