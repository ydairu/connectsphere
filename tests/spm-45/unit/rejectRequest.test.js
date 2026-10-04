// SPM-45 — the assigned Event Coordinator rejects a request that cannot be fulfilled. Pure-function level: the
// rules in shared/statusTransitions.js, shared/arrangements.js and shared/requestActions.js. The API is tested
// in tests/spm-45/integration and the page in frontend/src/pages/rejectionCompletion.test.jsx.

import { describe, expect, it } from 'vitest'

import { ARRANGEMENT_REJECTED, VENUE_ARRANGEMENT } from '../../../shared/arrangements.js'
import { ATTENDEE, COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF, canEdit, SECTIONS } from '../../../shared/permissions.js'
import { REASON_REQUIRED_ACTIONS, allAvailableActions, rejectionNotice } from '../../../shared/requestActions.js'
import { CANCELLED, COMPLETED, CONFIRMED, DRAFT, PLANNING, REJECTED, RETURNED, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import {
  ACTIONS,
  NOT_PERMITTED,
  REJECT,
  RESUBMIT,
  TERMINAL_STATUS,
  WRONG_STATUS,
  availableActions,
  canTransition,
} from '../../../shared/statusTransitions.js'

const NOW = new Date('2026-10-04T00:00:00.000Z')

const owner = { uid: 'org-1', roles: [ORGANISER], organisationId: 'org-a' }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }
const venueStaff = { uid: 'venue-1', roles: [VENUE_STAFF] }
const technicalStaff = { uid: 'tech-1', roles: [TECHNICAL_STAFF] }
const venueTechnicalStaff = { uid: 'venue-tech-1', roles: [VENUE_STAFF, TECHNICAL_STAFF] }

function event(status = UNDER_REVIEW, overrides = {}) {
  return {
    id: 'req-1',
    status,
    ownerUid: owner.uid,
    organisationId: 'org-a',
    assignedCoordinatorUid: assigned.uid,
    assignedStaffUids: [venueStaff.uid, technicalStaff.uid, venueTechnicalStaff.uid],
    core: { title: 'Partner Forum', purpose: 'Updates', expectedAttendees: 500, preferredDateTime: '2026-11-20T01:00:00.000Z', durationHours: 2 },
    venue: { layoutPreference: 'theatre' },
    ...overrides,
  }
}

describe('SPM-45 — the assigned Coordinator rejects at Under Review or Planning', () => {
  // "Given an event is Under Review and its essential requirements cannot be fulfilled, when the assigned
  // Coordinator selects Reject, then ..." and "Given an event is in Planning ..., then the assigned
  // Coordinator may initiate rejection of the overall event."
  it('spm45_assigned_coordinator_may_reject_from_under_review_and_planning', () => {
    for (const status of [UNDER_REVIEW, PLANNING]) {
      expect(canTransition(assigned, event(status), REJECT, NOW)).toEqual({ allowed: true, from: status, to: REJECTED })
      expect(availableActions(assigned, event(status), NOW)).toContain(REJECT)
    }
  })

  it('spm45_at_planning_reject_is_available_after_a_venue_arrangement_was_rejected', () => {
    const request = event(PLANNING, { arrangementApprovals: { [VENUE_ARRANGEMENT]: { decision: ARRANGEMENT_REJECTED } } })
    expect(canTransition(assigned, request, REJECT, NOW).allowed).toBe(true)
  })

  it('spm45_reject_is_not_available_at_any_other_status', () => {
    for (const status of [DRAFT, SUBMITTED, RETURNED, CONFIRMED]) {
      expect(canTransition(assigned, event(status), REJECT, NOW).reason, status).toBe(WRONG_STATUS)
    }
  })

  it('spm45_a_coordinator_not_assigned_to_the_event_cannot_reject', () => {
    expect(canTransition(otherCoordinator, event(), REJECT, NOW).reason).toBe(NOT_PERMITTED)
    expect(allAvailableActions(otherCoordinator, event(), NOW)).not.toContain(REJECT)
  })

  // "Venue Staff and Technical Support Staff cannot directly change the overall event status to Rejected."
  it('spm45_venue_and_technical_staff_cannot_reject_the_overall_event', () => {
    for (const user of [venueStaff, technicalStaff, venueTechnicalStaff]) {
      for (const status of [UNDER_REVIEW, PLANNING]) {
        expect(canTransition(user, event(status), REJECT, NOW).reason, user.uid).toBe(NOT_PERMITTED)
        expect(allAvailableActions(user, event(status), NOW), user.uid).not.toContain(REJECT)
      }
    }
  })

  it('spm45_the_organiser_and_attendee_cannot_reject', () => {
    expect(canTransition(owner, event(), REJECT, NOW).reason).toBe(NOT_PERMITTED)
    expect(canTransition({ uid: 'att-1', roles: [ATTENDEE] }, event(), REJECT, NOW).reason).toBe(NOT_PERMITTED)
  })
})

describe('SPM-45 — a rejection requires a reason', () => {
  it('spm45_reject_is_a_reason_required_action', () => {
    expect(REASON_REQUIRED_ACTIONS).toContain(REJECT)
  })
})

describe('SPM-45 — a Rejected request is closed', () => {
  // "Given an event is Rejected, then it is closed and cannot be edited or resubmitted through the
  // Returned-request workflow."
  it('spm45_no_action_including_resubmit_is_accepted_on_a_rejected_request', () => {
    for (const user of [owner, assigned]) {
      for (const action of ACTIONS) {
        expect(canTransition(user, event(REJECTED), action, NOW), action).toEqual({ allowed: false, reason: TERMINAL_STATUS })
      }
      expect(allAvailableActions(user, event(REJECTED), NOW)).toEqual([])
    }
    expect(canTransition(owner, event(REJECTED), RESUBMIT, NOW).reason).toBe(TERMINAL_STATUS)
  })

  it('spm45_no_role_may_edit_any_section_of_a_rejected_request', () => {
    for (const user of [owner, assigned, venueStaff, technicalStaff, venueTechnicalStaff]) {
      for (const section of SECTIONS) {
        expect(canEdit(user, event(REJECTED), section), `${user.uid} ${section}`).toBe(false)
      }
    }
  })

  it('spm45_completed_and_cancelled_events_cannot_be_rejected', () => {
    for (const status of [COMPLETED, CANCELLED]) expect(canTransition(assigned, event(status), REJECT, NOW).reason).toBe(TERMINAL_STATUS)
  })
})

describe('SPM-45 — the rejection notice', () => {
  const rejection = { reason: 'No venue can hold 500 attendees', previousStatus: UNDER_REVIEW, rejectedByUid: assigned.uid, rejectedAt: '2026-10-04T01:00:00.000Z' }

  it('spm45_gives_the_reason_time_and_previous_status_without_who_rejected', () => {
    expect(rejectionNotice(owner, event(REJECTED, { rejection }))).toEqual({
      reason: 'No venue can hold 500 attendees',
      rejectedAt: '2026-10-04T01:00:00.000Z',
      previousStatus: UNDER_REVIEW,
    })
  })

  it('spm45_is_null_for_a_request_that_was_not_rejected', () => {
    expect(rejectionNotice(owner, event())).toBeNull()
  })
})
