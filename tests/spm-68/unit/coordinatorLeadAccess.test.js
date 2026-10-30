// SPM-68 — the Event Coordinator Lead in the shared permission model (shared/permissions.js). Pure functions,
// no I/O. The Lead sees the unassigned queue, receives basic event information, edits nothing and never
// gains Coordinator powers — including through an account that also holds the Coordinator role. SPM-69 widens the
// Lead's scope to the active events they assigned (and those no Lead assigned); tests/spm-69 covers that, so the
// assigned events here are attributed to another Lead.

import { describe, expect, it } from 'vitest'

import { awaitingCoordinatorAssignment } from '../../../shared/coordinatorAssignment.js'
import { canReassignCoordinator } from '../../../shared/coordinatorReassignment.js'
import {
  COORDINATOR,
  COORDINATOR_LEAD,
  CORE,
  ROLES,
  SECTIONS,
  canEdit,
  editableSectionsFor,
  forbiddenFields,
  inScope,
  projectRequest,
  viewableSections,
  viewableSectionsFor,
} from '../../../shared/permissions.js'
import { isAssignedCoordinator } from '../../../shared/requestActors.js'
import { allAvailableActions } from '../../../shared/requestActions.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, PREPARATION, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import { requestListCopy } from '../../../frontend/src/utils/requestListCopy.js'
import { roleLabel } from '../../../frontend/src/utils/roleLabels.js'

const lead = Object.freeze({ uid: 'lead-1', roles: [COORDINATOR_LEAD] })
const leadCoordinator = Object.freeze({ uid: 'lead-coord', roles: [COORDINATOR_LEAD, COORDINATOR] })
const NOW = new Date('2026-10-29T02:00:00.000Z')

function request(overrides = {}) {
  return {
    id: 'req-1',
    status: SUBMITTED,
    ownerUid: 'organiser-1',
    organisationId: 'org-a',
    organisationName: 'Organisation A',
    assignedStaffUids: [],
    assignedCoordinatorUid: null,
    core: { title: 'Partner Forum', preferredDateTime: '2026-11-20T09:00:00+08:00', durationHours: 3, expectedAttendees: 50 },
    venue: { layoutPreference: 'theatre' },
    equipment: { requirements: ['projector'] },
    registration: { enabled: false },
    internal: { planningNotes: 'internal' },
    ...overrides,
  }
}

describe('SPM-68 AC1 — a new internal role, Event Coordinator Lead', () => {
  it('is a role constant with its own label', () => {
    expect(COORDINATOR_LEAD).toBe('coordinator_lead')
    expect(ROLES).toContain(COORDINATOR_LEAD)
    expect(roleLabel(COORDINATOR_LEAD)).toBe('Event Coordinator Lead')
  })

  it('the Requests page heading: the Lead\'s own wording (SPM-69), the Coordinator wording for a Lead who is also a Coordinator', () => {
    expect(requestListCopy([COORDINATOR_LEAD]).title).toBe('Requests you oversee')
    expect(requestListCopy([COORDINATOR_LEAD, COORDINATOR]).title).toBe('Events assigned to you')
  })

  it('views core only and edits nothing, on any record', () => {
    expect(viewableSections([COORDINATOR_LEAD])).toEqual([CORE])
    for (const status of [SUBMITTED, UNDER_REVIEW, PLANNING, CONFIRMED]) {
      expect(editableSectionsFor(lead, request({ status }))).toEqual([])
    }
  })
})

// SPM-69: an event another Lead assigned is outside this Lead's scope (CL3 G8!C41).
const OTHER_LEAD = 'lead-2'

describe('SPM-68 AC3/AC5 — the Lead’s scope is the unassigned queue', () => {
  it('admits a submitted request whose Coordinator is null or absent (legacy records)', () => {
    expect(inScope(lead, request())).toBe(true)
    const { assignedCoordinatorUid: _absent, ...legacy } = request()
    expect(inScope(lead, legacy)).toBe(true)
    expect(awaitingCoordinatorAssignment(legacy)).toBe(true)
  })

  it.each([
    ['a draft', { status: DRAFT }],
    ['an assigned submitted request', { assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['a resubmitted request that kept its Coordinator', { status: SUBMITTED, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['a returned request', { status: RETURNED, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['an under-review request', { status: UNDER_REVIEW, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['a planning event', { status: PLANNING, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['a confirmed event', { status: CONFIRMED, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['a preparation event', { status: PREPARATION, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD }],
    ['a completed event', { status: COMPLETED, assignedCoordinatorUid: 'coord-1' }],
    ['a cancelled event', { status: CANCELLED, assignedCoordinatorUid: 'coord-1' }],
    ['a rejected event', { status: REJECTED, assignedCoordinatorUid: 'coord-1' }],
  ])('excludes %s', (_label, overrides) => {
    expect(inScope(lead, request(overrides))).toBe(false)
    expect(projectRequest(lead, request(overrides))).toBeNull()
  })

  it('no other role sees an unassigned request except its organisation’s Organisers', () => {
    expect(inScope({ uid: 'coord-1', roles: [COORDINATOR] }, request())).toBe(false)
    expect(inScope({ uid: 'other', roles: ['venue_staff'] }, request())).toBe(false)
    expect(inScope({ uid: 'other', roles: ['safety_officer'] }, request())).toBe(false)
    expect(inScope({ uid: 'other', roles: ['attendee'] }, request())).toBe(false)
    expect(inScope({ uid: 'organiser-1', roles: ['organiser'], organisationId: 'org-a' }, request())).toBe(true)
  })
})

describe('SPM-68 AC3 — what the Lead receives', () => {
  it('basic event information only: id, status, core and the organisation name', () => {
    const body = projectRequest(lead, request())
    expect(Object.keys(body).sort()).toEqual(['core', 'id', 'organisationName', 'status'])
    expect(body.organisationName).toBe('Organisation A')
    expect(body.core).toEqual(request().core)
  })

  it('never the owner, organisation id, staff, internal notes or other sections', () => {
    const body = projectRequest(lead, request({ assignedStaffUids: ['staff-1'] }))
    for (const key of ['ownerUid', 'organisationId', 'assignedStaffUids', 'assignedCoordinatorUid', 'internal', 'venue', 'equipment', 'registration']) {
      expect(body, key).not.toHaveProperty(key)
    }
  })

  it('other roles do not receive organisationName through the Lead rule', () => {
    const colleague = { uid: 'organiser-2', roles: ['organiser'], organisationId: 'org-a' }
    expect(projectRequest(colleague, request())).not.toHaveProperty('organisationName')
  })
})

describe('SPM-68 — the Lead does not act as a Coordinator (CL3 G8!C13)', () => {
  it('is never the assigned Coordinator, has no actions and cannot reassign', () => {
    const queued = request()
    expect(isAssignedCoordinator(lead, queued)).toBe(false)
    expect(allAvailableActions(lead, queued, NOW)).toEqual([])
    expect(canReassignCoordinator(lead, queued)).toBe(false)
  })

  it('cannot write any section of a queued request', () => {
    for (const section of SECTIONS) expect(canEdit(lead, request(), section)).toBe(false)
    expect(forbiddenFields(lead, request(), { core: { title: 'x' } })).toEqual(['core.title'])
  })

  it('a Lead who is also a Coordinator gets no Coordinator powers on an unassigned request', () => {
    const queued = request()
    expect(viewableSectionsFor(leadCoordinator, queued)).toEqual([CORE])
    expect(editableSectionsFor(leadCoordinator, queued)).toEqual([])
    expect(allAvailableActions(leadCoordinator, queued, NOW)).toEqual([])
    expect(isAssignedCoordinator(leadCoordinator, queued)).toBe(false)
  })

  it('a Lead who is also a Coordinator acts as the Coordinator only on events assigned to them', () => {
    const theirs = request({ assignedCoordinatorUid: leadCoordinator.uid })
    expect(isAssignedCoordinator(leadCoordinator, theirs)).toBe(true)
    expect(allAvailableActions(leadCoordinator, theirs, NOW)).toContain('start_review')
    const someoneElses = request({ status: UNDER_REVIEW, assignedCoordinatorUid: 'coord-1', assignedByUid: OTHER_LEAD })
    expect(inScope(leadCoordinator, someoneElses)).toBe(false)
    expect(allAvailableActions(leadCoordinator, someoneElses, NOW)).toEqual([])
  })
})
