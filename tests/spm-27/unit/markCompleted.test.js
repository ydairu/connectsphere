// SPM-27 — the assigned Event Coordinator marks a Confirmed event Completed after it has taken place.
// Pure-function level: shared/statusTransitions.js and shared/requestActions.js. The API is tested in
// tests/spm-27/integration and the page in frontend/src/pages/rejectionCompletion.test.jsx.

import { describe, expect, it } from 'vitest'

import { ATTENDEE, COORDINATOR, ORGANISER, SECTIONS, TECHNICAL_STAFF, VENUE_STAFF, canEdit } from '../../../shared/permissions.js'
import { allAvailableActions, completionNotice } from '../../../shared/requestActions.js'
import { CANCELLED, COMPLETED, CONFIRMED, PLANNING, PREPARATION, REJECTED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import {
  ACTIONS,
  COMPLETE,
  EVENT_NOT_ENDED,
  NOT_PERMITTED,
  TERMINAL_STATUS,
  TERMINAL_STATUSES,
  WRONG_STATUS,
  availableActions,
  canTransition,
  eventHasEnded,
} from '../../../shared/statusTransitions.js'

// The event runs 01:00–03:00 UTC on 20 Nov 2026.
const START = '2026-11-20T01:00:00.000Z'
const DURING = new Date('2026-11-20T02:00:00.000Z')
const AT_END = new Date('2026-11-20T03:00:00.000Z')
const AFTER = new Date('2026-11-21T00:00:00.000Z')
const BEFORE = new Date('2026-11-19T00:00:00.000Z')

const owner = { uid: 'org-1', roles: [ORGANISER] }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }

function event(status = PREPARATION, overrides = {}) {
  return {
    id: 'req-1',
    status,
    ownerUid: owner.uid,
    assignedCoordinatorUid: assigned.uid,
    assignedStaffUids: ['venue-1', 'tech-1'],
    core: { title: 'Partner Forum', purpose: 'Updates', expectedAttendees: 50, preferredDateTime: START, durationHours: 2 },
    ...overrides,
  }
}

describe('SPM-27/SPM-88 — only a Preparation event whose date has passed', () => {
  // Updated by SPM-88: "Given a Preparation event whose date has passed, when the Coordinator marks it complete,
  // then the event status changes to Completed."
  it('spm27_assigned_coordinator_may_complete_a_preparation_event_once_it_has_ended', () => {
    for (const now of [AT_END, AFTER]) {
      expect(canTransition(assigned, event(), COMPLETE, now)).toEqual({ allowed: true, from: PREPARATION, to: COMPLETED })
      expect(availableActions(assigned, event(), now)).toContain(COMPLETE)
    }
  })

  it('spm27_complete_is_refused_before_and_during_the_event', () => {
    for (const now of [BEFORE, DURING]) {
      expect(canTransition(assigned, event(), COMPLETE, now)).toEqual({ allowed: false, reason: EVENT_NOT_ENDED })
      expect(availableActions(assigned, event(), now)).not.toContain(COMPLETE)
    }
  })

  it('spm27_an_event_with_a_missing_or_invalid_date_or_duration_has_not_ended', () => {
    for (const core of [
      { preferredDateTime: null, durationHours: 2 },
      { preferredDateTime: 'not a date', durationHours: 2 },
      { preferredDateTime: START, durationHours: null },
      { preferredDateTime: START, durationHours: 0 },
    ]) {
      expect(eventHasEnded(event(PREPARATION, { core }), AFTER)).toBe(false)
      expect(canTransition(assigned, event(PREPARATION, { core }), COMPLETE, AFTER).reason).toBe(EVENT_NOT_ENDED)
    }
  })

  it('spm27_complete_is_not_available_unless_the_event_is_in_preparation', () => {
    for (const status of [SUBMITTED, UNDER_REVIEW, PLANNING, CONFIRMED]) {
      expect(canTransition(assigned, event(status), COMPLETE, AFTER).reason, status).toBe(WRONG_STATUS)
    }
  })

  it('spm27_a_coordinator_not_assigned_to_the_event_cannot_complete_it', () => {
    expect(canTransition(otherCoordinator, event(), COMPLETE, AFTER).reason).toBe(NOT_PERMITTED)
    expect(allAvailableActions(otherCoordinator, event(), AFTER)).toEqual([])
  })

  it('spm27_no_other_role_can_mark_an_event_completed', () => {
    for (const roles of [[ORGANISER], [VENUE_STAFF], [TECHNICAL_STAFF], [VENUE_STAFF, TECHNICAL_STAFF], [ATTENDEE]]) {
      const user = { uid: roles[0] === ORGANISER ? owner.uid : 'someone', roles }
      expect(canTransition(user, event(), COMPLETE, AFTER).reason, roles.join('+')).toBe(NOT_PERMITTED)
    }
  })
})

describe('SPM-27 — Completed is terminal', () => {
  // AC: "Completed is a terminal status; completed events retain their records for auditability."
  it('spm27_completed_is_a_terminal_status_and_accepts_no_action', () => {
    expect(TERMINAL_STATUSES).toContain(COMPLETED)
    for (const action of ACTIONS) {
      expect(canTransition(assigned, event(COMPLETED), action, AFTER), action).toEqual({ allowed: false, reason: TERMINAL_STATUS })
    }
    expect(allAvailableActions(assigned, event(COMPLETED), AFTER)).toEqual([])
    expect(allAvailableActions(owner, event(COMPLETED), AFTER)).toEqual([])
  })

  it('spm27_no_role_may_edit_any_section_of_a_completed_event', () => {
    for (const user of [owner, assigned, { uid: 'venue-1', roles: [VENUE_STAFF] }, { uid: 'tech-1', roles: [TECHNICAL_STAFF] }]) {
      for (const section of SECTIONS) expect(canEdit(user, event(COMPLETED), section), `${user.uid} ${section}`).toBe(false)
    }
  })

  it('spm27_cancelled_and_rejected_events_cannot_be_completed', () => {
    for (const status of [CANCELLED, REJECTED]) expect(canTransition(assigned, event(status), COMPLETE, AFTER).reason).toBe(TERMINAL_STATUS)
  })
})

describe('SPM-27 — the completion notice', () => {
  const completion = { completedByUid: assigned.uid, completedByName: 'Seed Coordinator', completedAt: '2026-11-21T00:00:00.000Z' }

  it('spm27_a_coordinator_sees_who_marked_it_complete_and_when', () => {
    expect(completionNotice(assigned, event(COMPLETED, { completion }))).toEqual({
      completedAt: '2026-11-21T00:00:00.000Z',
      completedByName: 'Seed Coordinator',
    })
  })

  it('spm27_other_roles_see_when_but_not_who', () => {
    for (const user of [owner, { uid: 'venue-1', roles: [VENUE_STAFF] }]) {
      expect(completionNotice(user, event(COMPLETED, { completion }))).toEqual({ completedAt: '2026-11-21T00:00:00.000Z' })
    }
  })

  it('spm27_is_null_for_an_event_that_was_not_completed_through_the_action', () => {
    expect(completionNotice(assigned, event())).toBeNull()
    expect(completionNotice(assigned, event(COMPLETED))).toBeNull()
  })
})
