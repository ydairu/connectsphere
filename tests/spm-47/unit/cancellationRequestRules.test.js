// SPM-47 — the Organiser requests cancellation of a Confirmed event and the assigned Coordinator approves,
// refuses or returns it. Pure-function level: shared/cancellationRequests.js, the APPROVE_CANCELLATION
// transition and shared/requestActions.js. The API and page are tested in tests/spm-47/integration and
// frontend/src/pages/requestDetail.test.jsx.

import { describe, expect, it } from 'vitest'

import {
  CANCELLATION_ALREADY_PENDING,
  CANCELLATION_APPROVED,
  CANCELLATION_NOT_RETURNED,
  CANCELLATION_PENDING,
  CANCELLATION_REFUSED,
  CANCELLATION_REQUEST_RETURNED,
  CANCELLATION_RETURNED,
  EVENT_STARTED,
  NOT_CONFIRMED,
  NO_PENDING_CANCELLATION,
  canRefuseCancellation,
  canRequestCancellation,
  canResubmitCancellation,
  canReturnCancellation,
  hasOpenCancellation,
} from '../../../shared/cancellationRequests.js'
import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import {
  REASON_REQUIRED_ACTIONS,
  REFUSE_CANCELLATION,
  REQUEST_CANCELLATION,
  RESUBMIT_CANCELLATION,
  RETURN_CANCELLATION,
  allAvailableActions,
  cancellationSummary,
} from '../../../shared/requestActions.js'
import { NOT_PERMITTED } from '../../../shared/requestActors.js'
import { CONFIRMED, PLANNING, PREPARATION, STATUSES, UNDER_REVIEW } from '../../../shared/status.js'
import { APPROVE_CANCELLATION, canTransition } from '../../../shared/statusTransitions.js'

const START = '2026-11-20T01:00:00.000Z'
const BEFORE = new Date('2026-11-01T00:00:00.000Z')
const AFTER = new Date('2026-11-20T01:00:00.000Z')

const owner = { uid: 'org-1', roles: [ORGANISER] }
const colleague = { uid: 'org-2', roles: [ORGANISER] }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }
const venueStaff = { uid: 'venue-1', roles: [VENUE_STAFF] }

const withRequest = (status, extra = {}) => ({ cancellationRequest: { status, reason: 'Keynote withdrew', requestedByUid: owner.uid, ...extra } })

function event(status = CONFIRMED, overrides = {}) {
  return {
    id: 'req-1',
    status,
    ownerUid: owner.uid,
    assignedCoordinatorUid: assigned.uid,
    assignedStaffUids: [venueStaff.uid],
    core: { title: 'Partner Forum', preferredDateTime: START, durationHours: 2 },
    ...overrides,
  }
}

describe('SPM-47 — only the owning Organiser requests, and only before the event starts', () => {
  it('spm47_the_owner_may_request_cancellation_of_a_confirmed_event_before_its_start', () => {
    expect(canRequestCancellation(owner, event(), BEFORE)).toEqual({ allowed: true })
    expect(allAvailableActions(owner, event(), BEFORE)).toEqual([REQUEST_CANCELLATION])
  })

  it('spm47_request_cancellation_is_not_available_outside_confirmed_or_preparation', () => {
    for (const status of STATUSES.filter((value) => ![CONFIRMED, PREPARATION].includes(value))) {
      expect(canRequestCancellation(owner, event(status), BEFORE).reason).toBe(NOT_CONFIRMED)
      expect(allAvailableActions(owner, event(status), BEFORE)).not.toContain(REQUEST_CANCELLATION)
    }
  })

  it('spm47_request_cancellation_is_not_available_once_the_start_date_time_has_passed', () => {
    expect(canRequestCancellation(owner, event(), AFTER).reason).toBe(EVENT_STARTED)
    expect(allAvailableActions(owner, event(), AFTER)).not.toContain(REQUEST_CANCELLATION)
  })

  it('spm47_no_one_but_the_owning_organiser_may_request', () => {
    for (const user of [colleague, assigned, otherCoordinator, venueStaff, { uid: owner.uid, roles: [VENUE_STAFF] }]) {
      expect(canRequestCancellation(user, event(), BEFORE).reason).toBe(NOT_PERMITTED)
    }
  })

  it('spm47_a_reason_is_required_to_request', () => {
    expect(REASON_REQUIRED_ACTIONS).toContain(REQUEST_CANCELLATION)
  })
})

describe('SPM-47 — one open cancellation request per event at a time', () => {
  it('spm47_pending_and_returned_requests_are_open_and_block_another_request', () => {
    expect(canRequestCancellation(owner, event(CONFIRMED, withRequest(CANCELLATION_PENDING)), BEFORE).reason).toBe(CANCELLATION_ALREADY_PENDING)
    expect(canRequestCancellation(owner, event(CONFIRMED, withRequest(CANCELLATION_RETURNED)), BEFORE).reason).toBe(CANCELLATION_REQUEST_RETURNED)
    expect(hasOpenCancellation(event(CONFIRMED, withRequest(CANCELLATION_PENDING)))).toBe(true)
    expect(hasOpenCancellation(event(CONFIRMED, withRequest(CANCELLATION_RETURNED)))).toBe(true)
  })

  it('spm47_a_refused_request_is_closed_so_the_organiser_may_ask_again', () => {
    expect(hasOpenCancellation(event(CONFIRMED, withRequest(CANCELLATION_REFUSED)))).toBe(false)
    expect(canRequestCancellation(owner, event(CONFIRMED, withRequest(CANCELLATION_REFUSED)), BEFORE)).toEqual({ allowed: true })
  })

  it('spm47_while_a_request_is_open_the_owner_sees_its_status', () => {
    const summary = cancellationSummary(owner, event(CONFIRMED, withRequest(CANCELLATION_PENDING, { requestedAt: '2026-10-30T00:00:00.000Z' })))
    expect(summary).toMatchObject({ status: CANCELLATION_PENDING, reason: 'Keynote withdrew', requestedAt: '2026-10-30T00:00:00.000Z' })
  })
})

describe('SPM-47 — the assigned Coordinator decides', () => {
  const pending = event(CONFIRMED, withRequest(CANCELLATION_PENDING))

  it('spm47_approving_cancels_the_event', () => {
    expect(canTransition(assigned, pending, APPROVE_CANCELLATION, BEFORE)).toEqual({ allowed: true, from: CONFIRMED, to: 'cancelled' })
  })

  it('spm47_the_coordinator_may_approve_refuse_or_return_a_pending_request', () => {
    expect(allAvailableActions(assigned, pending, BEFORE)).toEqual([APPROVE_CANCELLATION, REFUSE_CANCELLATION, RETURN_CANCELLATION])
  })

  it('spm47_refusing_and_returning_need_a_reason_or_message', () => {
    expect(REASON_REQUIRED_ACTIONS).toEqual(expect.arrayContaining([REFUSE_CANCELLATION, RETURN_CANCELLATION, RESUBMIT_CANCELLATION]))
  })

  it('spm47_an_unassigned_coordinator_cannot_approve_refuse_or_return', () => {
    expect(canTransition(otherCoordinator, pending, APPROVE_CANCELLATION, BEFORE).reason).toBe(NOT_PERMITTED)
    expect(canRefuseCancellation(otherCoordinator, pending).reason).toBe(NOT_PERMITTED)
    expect(canReturnCancellation(otherCoordinator, pending, BEFORE).reason).toBe(NOT_PERMITTED)
    expect(allAvailableActions(otherCoordinator, pending, BEFORE)).toEqual([])
  })

  it('spm47_the_owner_cannot_decide_their_own_request', () => {
    expect(canTransition(owner, pending, APPROVE_CANCELLATION, BEFORE).reason).toBe(NOT_PERMITTED)
    expect(canRefuseCancellation(owner, pending).reason).toBe(NOT_PERMITTED)
    expect(canReturnCancellation(owner, pending, BEFORE).reason).toBe(NOT_PERMITTED)
  })

  it('spm47_once_the_start_date_time_passes_the_request_can_no_longer_be_approved_or_returned_but_can_be_refused', () => {
    expect(canTransition(assigned, pending, APPROVE_CANCELLATION, AFTER).reason).toBe(EVENT_STARTED)
    expect(canReturnCancellation(assigned, pending, AFTER).reason).toBe(EVENT_STARTED)
    expect(canRefuseCancellation(assigned, pending)).toEqual({ allowed: true })
    expect(allAvailableActions(assigned, pending, AFTER)).toEqual([REFUSE_CANCELLATION])
  })

  it('spm47_nothing_is_decided_without_an_open_request', () => {
    expect(canTransition(assigned, event(), APPROVE_CANCELLATION, BEFORE).reason).toBe(NO_PENDING_CANCELLATION)
    expect(canRefuseCancellation(assigned, event()).reason).toBe(NO_PENDING_CANCELLATION)
    expect(canReturnCancellation(assigned, event(), BEFORE).reason).toBe(NO_PENDING_CANCELLATION)
    const approved = event(CONFIRMED, withRequest(CANCELLATION_APPROVED))
    expect(canRefuseCancellation(assigned, approved).reason).toBe(NO_PENDING_CANCELLATION)
  })

  it('spm47_a_decision_needs_a_confirmed_event', () => {
    for (const status of [UNDER_REVIEW, PLANNING]) {
      expect(canRefuseCancellation(assigned, event(status, withRequest(CANCELLATION_PENDING))).reason).toBe(NOT_CONFIRMED)
      expect(canReturnCancellation(assigned, event(status, withRequest(CANCELLATION_PENDING)), BEFORE).reason).toBe(NOT_CONFIRMED)
    }
  })
})

describe('SPM-47 — a returned request is updated and resubmitted by the Organiser', () => {
  const returned = event(CONFIRMED, withRequest(CANCELLATION_RETURNED, { returnMessage: 'Which sessions are affected?' }))

  it('spm47_the_owner_may_resubmit_a_returned_request_before_the_start', () => {
    expect(canResubmitCancellation(owner, returned, BEFORE)).toEqual({ allowed: true })
    expect(allAvailableActions(owner, returned, BEFORE)).toEqual([RESUBMIT_CANCELLATION])
  })

  it('spm47_while_returned_the_coordinator_may_only_refuse_it', () => {
    expect(canTransition(assigned, returned, APPROVE_CANCELLATION, BEFORE).reason).toBe(NO_PENDING_CANCELLATION)
    expect(allAvailableActions(assigned, returned, BEFORE)).toEqual([REFUSE_CANCELLATION])
  })

  it('spm47_resubmission_is_refused_after_the_start_by_anyone_else_or_without_a_returned_request', () => {
    expect(canResubmitCancellation(owner, returned, AFTER).reason).toBe(EVENT_STARTED)
    expect(canResubmitCancellation(colleague, returned, BEFORE).reason).toBe(NOT_PERMITTED)
    expect(canResubmitCancellation(owner, event(CONFIRMED, withRequest(CANCELLATION_PENDING)), BEFORE).reason).toBe(CANCELLATION_NOT_RETURNED)
  })

  it('spm47_the_owner_sees_the_coordinators_message', () => {
    expect(cancellationSummary(owner, returned)).toMatchObject({ status: CANCELLATION_RETURNED, returnMessage: 'Which sessions are affected?' })
  })

  it('spm47_other_organisers_and_staff_do_not_see_the_request', () => {
    expect(cancellationSummary(colleague, returned)).toBeNull()
    expect(cancellationSummary(venueStaff, returned)).toBeNull()
  })
})
