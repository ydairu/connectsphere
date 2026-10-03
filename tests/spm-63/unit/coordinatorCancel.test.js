// SPM-63 — the assigned Event Coordinator cancels a Confirmed event directly. Pure-function level: the rules
// in shared/statusTransitions.js, shared/cancellationRequests.js and shared/requestActions.js. The API and
// page are tested in tests/spm-63/integration and frontend/src/pages/requestDetail.test.jsx.

import { describe, expect, it } from 'vitest'

import { CANCELLATION_PENDING, CANCELLATION_REQUEST_PENDING, CANCELLATION_RETURNED, eventHasStarted } from '../../../shared/cancellationRequests.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'
import { REASON_REQUIRED_ACTIONS, allAvailableActions, cancellationNotice } from '../../../shared/requestActions.js'
import { CANCELLED, COMPLETED, CONFIRMED, PLANNING, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import {
  ACTIONS,
  CANCEL,
  EVENT_STARTED,
  NOT_PERMITTED,
  REJECT,
  TERMINAL_STATUS,
  WRONG_STATUS,
  availableActions,
  canTransition,
} from '../../../shared/statusTransitions.js'

const START = '2026-11-20T01:00:00.000Z'
const BEFORE = new Date('2026-11-20T00:59:59.000Z')
const AT_START = new Date(START)
const AFTER = new Date('2026-11-20T03:00:00.000Z')

const owner = { uid: 'org-1', roles: [ORGANISER] }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }

function event(status = CONFIRMED, overrides = {}) {
  return {
    id: 'req-1',
    status,
    ownerUid: owner.uid,
    assignedCoordinatorUid: assigned.uid,
    assignedStaffUids: ['venue-1', 'tech-1'],
    core: { title: 'Partner Forum', purpose: 'Updates', expectedAttendees: 50, preferredDateTime: START, durationHours: 2 },
    venue: { layoutPreference: 'theatre' },
    ...overrides,
  }
}

describe('SPM-63 — only the assigned Coordinator, only a Confirmed event, up to its start date/time', () => {
  it('spm63_assigned_coordinator_can_cancel_a_confirmed_event_before_it_starts', () => {
    expect(canTransition(assigned, event(), CANCEL, BEFORE)).toEqual({ allowed: true, from: CONFIRMED, to: CANCELLED })
    expect(availableActions(assigned, event(), BEFORE)).toContain(CANCEL)
  })

  it('spm63_cancel_is_refused_at_and_after_the_start_date_time', () => {
    for (const now of [AT_START, AFTER]) {
      expect(canTransition(assigned, event(), CANCEL, now)).toEqual({ allowed: false, reason: EVENT_STARTED })
      expect(availableActions(assigned, event(), now)).not.toContain(CANCEL)
    }
  })

  it('spm63_start_is_the_preferred_date_time_and_a_missing_or_invalid_one_never_blocks_cancellation', () => {
    expect(eventHasStarted(event(), BEFORE)).toBe(false)
    expect(eventHasStarted(event(), AT_START)).toBe(true)
    for (const preferredDateTime of [null, undefined, '', 'not a date']) {
      const request = event(CONFIRMED, { core: { preferredDateTime } })
      expect(eventHasStarted(request, AFTER)).toBe(false)
      expect(canTransition(assigned, request, CANCEL, AFTER).allowed).toBe(true)
    }
  })

  it('spm63_cancel_is_not_available_unless_the_event_is_confirmed_and_reject_applies_at_review_and_planning', () => {
    for (const status of [SUBMITTED, UNDER_REVIEW, RETURNED, PLANNING]) {
      expect(canTransition(assigned, event(status), CANCEL, BEFORE).reason).toBe(WRONG_STATUS)
      expect(availableActions(assigned, event(status), BEFORE)).not.toContain(CANCEL)
    }
    for (const status of [UNDER_REVIEW, PLANNING]) {
      expect(availableActions(assigned, event(status), BEFORE)).toContain(REJECT)
    }
  })

  it('spm63_a_coordinator_not_assigned_to_the_event_is_denied', () => {
    expect(canTransition(otherCoordinator, event(), CANCEL, BEFORE).reason).toBe(NOT_PERMITTED)
    expect(allAvailableActions(otherCoordinator, event(), BEFORE)).toEqual([])
  })

  it('spm63_no_other_role_can_cancel_directly', () => {
    for (const roles of [[ORGANISER], [VENUE_STAFF], [TECHNICAL_STAFF], [ATTENDEE]]) {
      const user = { uid: roles[0] === ORGANISER ? owner.uid : 'someone', roles }
      expect(canTransition(user, event(), CANCEL, BEFORE).reason).toBe(NOT_PERMITTED)
    }
  })

  it('spm63_while_an_organiser_request_is_open_the_coordinator_decides_it_instead', () => {
    for (const status of [CANCELLATION_PENDING, CANCELLATION_RETURNED]) {
      const request = event(CONFIRMED, { cancellationRequest: { status, reason: 'Budget cut' } })
      expect(canTransition(assigned, request, CANCEL, BEFORE).reason).toBe(CANCELLATION_REQUEST_PENDING)
    }
  })
})

describe('SPM-63 — a reason is required', () => {
  it('spm63_direct_cancellation_is_a_reason_required_action', () => {
    expect(REASON_REQUIRED_ACTIONS).toContain(CANCEL)
  })
})

describe('SPM-63 — a Cancelled event cannot change to another status', () => {
  it('spm63_every_action_is_refused_on_a_cancelled_event', () => {
    for (const action of ACTIONS) {
      expect(canTransition(assigned, event(CANCELLED), action, BEFORE)).toEqual({ allowed: false, reason: TERMINAL_STATUS })
    }
    expect(allAvailableActions(assigned, event(CANCELLED), BEFORE)).toEqual([])
    expect(allAvailableActions(owner, event(CANCELLED), BEFORE)).toEqual([])
  })

  it('spm63_completed_and_rejected_events_cannot_be_cancelled', () => {
    for (const status of [COMPLETED, REJECTED]) expect(canTransition(assigned, event(status), CANCEL, BEFORE).reason).toBe(TERMINAL_STATUS)
  })
})

describe('SPM-63 — the cancellation notice', () => {
  const cancellation = { reason: 'Venue closed for repairs', requestedByOrganiser: false, cancelledByUid: assigned.uid, cancelledAt: '2026-11-01T00:00:00.000Z' }

  it('spm63_gives_the_reason_and_time_without_who_cancelled', () => {
    expect(cancellationNotice(owner, event(CANCELLED, { cancellation }))).toEqual({
      reason: 'Venue closed for repairs',
      cancelledAt: '2026-11-01T00:00:00.000Z',
      requestedByOrganiser: false,
    })
  })

  it('spm63_is_null_for_an_event_that_was_not_cancelled', () => {
    expect(cancellationNotice(owner, event())).toBeNull()
  })
})
