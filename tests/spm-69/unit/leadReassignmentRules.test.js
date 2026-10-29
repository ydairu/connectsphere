// SPM-69 — the Event Coordinator Lead's reassignment rules. Pure functions: attributedToLead() and
// supervisedByLead() (shared/coordinatorAssignment.js), the Lead's scope and view (shared/permissions.js,
// shared/assignedCoordinator.js), who may reassign and when (shared/coordinatorReassignment.js) and to whom
// (SPM-68's assignmentTargetRefusal / assignmentCandidates). That the service applies them in one transaction is
// the API suite.

import { describe, expect, it } from 'vitest'

import { assignedCoordinatorSummary } from '../../../shared/assignedCoordinator.js'
import { attributedToLead, supervisedByLead } from '../../../shared/coordinatorAssignment.js'
import { TARGET_IS_SELF, assignmentCandidates, assignmentTargetRefusal } from '../../../shared/coordinatorLeadAssignment.js'
import {
  NOT_SUBMITTED,
  TARGET_IS_CURRENT,
  TARGET_IS_OWNER,
  TARGET_NOT_COORDINATOR,
  TERMINAL_STATUS,
  canReassignCoordinator,
  mayReassignCoordinator,
  reassignmentStatusRefusal,
} from '../../../shared/coordinatorReassignment.js'
import { COORDINATOR, COORDINATOR_LEAD, ORGANISER, SECTIONS, canEdit, inScope, projectRequest } from '../../../shared/permissions.js'
import { allAvailableActions } from '../../../shared/requestActions.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, PREPARATION, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'

const lead = Object.freeze({ uid: 'lead-1', roles: [COORDINATOR_LEAD] })
const otherLead = Object.freeze({ uid: 'lead-2', roles: [COORDINATOR_LEAD] })
const coordinator = Object.freeze({ uid: 'coord-1', roles: [COORDINATOR] })
const NOW = new Date('2026-10-29T02:00:00.000Z')

function event(overrides = {}) {
  return {
    id: 'event-1',
    status: PLANNING,
    ownerUid: 'organiser-1',
    organisationId: 'org-a',
    organisationName: 'Organisation A',
    assignedCoordinatorUid: coordinator.uid,
    core: { title: 'Partner forum', preferredDateTime: '2026-12-10T06:00:00.000Z', durationHours: 3, expectedAttendees: 40 },
    venue: { layoutPreference: 'theatre' },
    internal: { notes: 'internal' },
    ...overrides,
  }
}

const ACTIVE = [SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING, CONFIRMED, PREPARATION]
const FINISHED = [COMPLETED, CANCELLED, REJECTED]

describe('SPM-69 — which events a Lead supervises (CL3 G8!C41, C38)', () => {
  it('spm69_an_event_the_lead_assigned_or_that_no_lead_assigned_is_attributed_to_them', () => {
    expect(attributedToLead(lead, event({ assignedByUid: lead.uid }))).toBe(true)
    expect(attributedToLead(lead, event())).toBe(true)
    expect(attributedToLead(lead, event({ assignedByUid: null }))).toBe(true)
    expect(attributedToLead(lead, event({ assignedByUid: otherLead.uid }))).toBe(false)
  })

  it.each(ACTIVE)('spm69_an_active_assigned_event_at_%s_is_supervised_and_in_the_leads_scope', (status) => {
    expect(supervisedByLead(lead, event({ status }))).toBe(true)
    expect(inScope(lead, event({ status, assignedByUid: lead.uid }))).toBe(true)
  })

  it.each([...FINISHED, DRAFT])('spm69_an_event_at_%s_is_not_supervised', (status) => {
    expect(supervisedByLead(lead, event({ status }))).toBe(false)
    expect(inScope(lead, event({ status }))).toBe(false)
  })

  it('spm69_an_event_another_lead_assigned_is_outside_this_leads_scope', () => {
    expect(inScope(lead, event({ assignedByUid: otherLead.uid }))).toBe(false)
    expect(inScope(otherLead, event({ assignedByUid: otherLead.uid }))).toBe(true)
  })

  it('spm69_the_unassigned_queue_is_still_in_scope_but_is_not_supervised_reassignment', () => {
    const queued = event({ status: SUBMITTED, assignedCoordinatorUid: null })
    expect(inScope(lead, queued)).toBe(true)
    expect(supervisedByLead(lead, queued)).toBe(false)
  })
})

describe('SPM-69 AC1/AC3 — who may reassign', () => {
  it('spm69_a_lead_may_reassign_an_event_attributed_to_them', () => {
    expect(mayReassignCoordinator(lead, event())).toBe(true)
    expect(mayReassignCoordinator(lead, event({ assignedByUid: lead.uid }))).toBe(true)
  })

  it.each([
    ['another Lead’s event', lead, event({ assignedByUid: otherLead.uid })],
    ['the assigned Coordinator', coordinator, event()],
    ['a Lead who is also the Organiser, on an event another Lead assigned', { uid: 'lead-org', roles: [COORDINATOR_LEAD, ORGANISER], organisationId: 'org-a' }, event({ assignedByUid: otherLead.uid })],
    ['anyone, on a draft', lead, event({ status: DRAFT, assignedCoordinatorUid: null })],
  ])('spm69_%s_may_not', (_label, user, record) => {
    expect(mayReassignCoordinator(user, record)).toBe(false)
    expect(canReassignCoordinator(user, record)).toBe(false)
  })

  it('spm69_a_lead_who_is_the_assigned_coordinator_may_hand_the_event_on_but_not_to_themselves', () => {
    const leadCoordinator = { uid: 'lead-coord', roles: [COORDINATOR_LEAD, COORDINATOR] }
    const theirs = event({ assignedCoordinatorUid: leadCoordinator.uid })
    expect(canReassignCoordinator(leadCoordinator, theirs)).toBe(true)
    expect(assignmentTargetRefusal({ request: theirs, targetUid: leadCoordinator.uid, coordinatorUids: [leadCoordinator.uid, coordinator.uid], leadUid: leadCoordinator.uid })).toBe(TARGET_IS_SELF)
  })
})

describe('SPM-69 AC2 — when', () => {
  it.each(ACTIVE)('spm69_allowed_at_%s', (status) => {
    expect(reassignmentStatusRefusal(event({ status }))).toBeNull()
    expect(canReassignCoordinator(lead, event({ status }))).toBe(true)
  })

  it.each(FINISHED)('spm69_refused_at_%s', (status) => {
    expect(reassignmentStatusRefusal(event({ status }))).toBe(TERMINAL_STATUS)
    expect(canReassignCoordinator(lead, event({ status }))).toBe(false)
  })

  it('spm69_an_unassigned_request_is_assigned_from_the_queue_not_reassigned', () => {
    expect(reassignmentStatusRefusal(event({ status: SUBMITTED, assignedCoordinatorUid: null }))).toBe(NOT_SUBMITTED)
  })
})

describe('SPM-69 — to whom (SPM-26 and SPM-68 target checks)', () => {
  const coordinatorUids = [coordinator.uid, 'coord-2', 'organiser-1', lead.uid]
  const refusal = (targetUid) => assignmentTargetRefusal({ request: event(), targetUid, coordinatorUids, leadUid: lead.uid })

  it.each([
    ['the current Coordinator', coordinator.uid, TARGET_IS_CURRENT],
    ['the submitter', 'organiser-1', TARGET_IS_OWNER],
    ['the Lead themselves', lead.uid, TARGET_IS_SELF],
    ['a non-Coordinator', 'venue-1', TARGET_NOT_COORDINATOR],
  ])('spm69_%s_is_refused', (_label, uid, reason) => {
    expect(refusal(uid)).toBe(reason)
  })

  it('spm69_another_coordinator_is_accepted_and_offered_with_their_workload', () => {
    expect(refusal('coord-2')).toBeNull()
    const coordinators = [{ uid: coordinator.uid, name: 'One' }, { uid: 'coord-2', name: 'Two' }, { uid: 'organiser-1', name: 'Owner' }, { uid: lead.uid, name: 'Lead' }]
    expect(assignmentCandidates(coordinators, event(), lead, new Map([['coord-2', 4]]))).toEqual([{ uid: 'coord-2', name: 'Two', activeEvents: 4 }])
  })
})

describe('SPM-69 AC5 — what the Lead sees and may do on a supervised event (CL3 G8!C13)', () => {
  it('spm69_basic_information_and_the_coordinators_name_only', () => {
    const record = event({ assignedByUid: lead.uid })
    expect(Object.keys(projectRequest(lead, record)).sort()).toEqual(['core', 'id', 'organisationName', 'status'])
    expect(assignedCoordinatorSummary(lead, record, 'Coordinator One')).toEqual({ assigned: true, name: 'Coordinator One' })
    expect(assignedCoordinatorSummary(lead, event({ assignedByUid: otherLead.uid }), 'Coordinator One')).toBeNull()
  })

  it.each(ACTIVE)('spm69_no_status_actions_and_no_edits_at_%s', (status) => {
    const record = event({ status, assignedByUid: lead.uid })
    expect(allAvailableActions(lead, record, NOW)).toEqual([])
    for (const section of SECTIONS) expect(canEdit(lead, record, section)).toBe(false)
  })
})
