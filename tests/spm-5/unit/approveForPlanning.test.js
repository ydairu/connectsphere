// SPM-5 unit suite — the shared rules for starting review and approving for Planning. Pure functions; no
// Firebase.

import { describe, expect, it } from 'vitest'

import { COORDINATOR, ORGANISER } from '../../../shared/permissions.js'
import { PLANNING, SUBMITTED, UNDER_REVIEW } from '../../../shared/status.js'
import {
  APPROVE,
  INSUFFICIENT_INFORMATION,
  NOT_PERMITTED,
  REJECT,
  RETURN_FOR_CLARIFICATION,
  START_REVIEW,
  WRONG_STATUS,
  availableActions,
  canTransition,
  hasSufficientInformation,
} from '../../../shared/statusTransitions.js'

const owner = { uid: 'owner', roles: [ORGANISER] }
const assigned = { uid: 'coord-1', roles: [COORDINATOR] }
const otherCoordinator = { uid: 'coord-2', roles: [COORDINATOR] }

// Every review input named by SPM-5: title, pax, duration, preferred date/time, venue/layout preferences,
// accessibility and equipment needs.
const complete = {
  core: { title: 'Partner Forum', purpose: 'Partner updates', expectedAttendees: 50, durationHours: 3, preferredDateTime: '2026-11-20T09:00:00+08:00' },
  venue: { layoutPreference: 'theatre', accessibilityRequired: true, accessibilityNeeds: 'Wheelchair access' },
  equipment: { requirements: ['projector'], technicalSupportNeeded: true },
}

const requestAt = (status, overrides = {}) => ({
  id: 'req-1',
  status,
  ownerUid: owner.uid,
  assignedCoordinatorUid: assigned.uid,
  ...structuredClone(complete),
  ...overrides,
})

const withCore = (core) => requestAt(UNDER_REVIEW, { core: { ...complete.core, ...core } })

describe('SPM-5 — starting review', () => {
  it('spm5_the_assigned_coordinator_moves_submitted_to_under_review', () => {
    expect(canTransition(assigned, requestAt(SUBMITTED), START_REVIEW)).toEqual({ allowed: true, from: SUBMITTED, to: UNDER_REVIEW })
  })

  it('spm5_another_coordinator_or_the_organiser_cannot_start_review', () => {
    expect(canTransition(otherCoordinator, requestAt(SUBMITTED), START_REVIEW).reason).toBe(NOT_PERMITTED)
    expect(canTransition(owner, requestAt(SUBMITTED), START_REVIEW).reason).toBe(NOT_PERMITTED)
  })
})

describe('SPM-5 — approving for Planning', () => {
  it('spm5_the_assigned_coordinator_approves_a_complete_request_to_planning', () => {
    expect(canTransition(assigned, requestAt(UNDER_REVIEW), APPROVE)).toEqual({ allowed: true, from: UNDER_REVIEW, to: PLANNING })
  })

  it('spm5_approval_is_only_from_under_review', () => {
    expect(canTransition(assigned, requestAt(SUBMITTED), APPROVE).reason).toBe(WRONG_STATUS)
  })

  it('spm5_another_coordinator_cannot_approve_return_or_reject', () => {
    for (const action of [APPROVE, RETURN_FOR_CLARIFICATION, REJECT]) {
      expect(canTransition(otherCoordinator, requestAt(UNDER_REVIEW), action).reason, action).toBe(NOT_PERMITTED)
    }
    expect(availableActions(otherCoordinator, requestAt(UNDER_REVIEW))).toEqual([])
  })

  it('spm5_a_request_missing_a_required_detail_cannot_be_approved', () => {
    for (const field of ['title', 'purpose', 'expectedAttendees', 'durationHours', 'preferredDateTime']) {
      const request = withCore({ [field]: null })
      expect(hasSufficientInformation(request), field).toBe(false)
      expect(canTransition(assigned, request, APPROVE).reason, field).toBe(INSUFFICIENT_INFORMATION)
    }
    const noLayout = requestAt(UNDER_REVIEW, { venue: { layoutPreference: '' } })
    expect(canTransition(assigned, noLayout, APPROVE).reason).toBe(INSUFFICIENT_INFORMATION)
  })

  it('spm5_a_request_with_an_invalid_detail_cannot_be_approved', () => {
    for (const core of [{ expectedAttendees: -5 }, { expectedAttendees: 2.5 }, { durationHours: 0 }, { preferredDateTime: 'next Tuesday' }]) {
      expect(canTransition(assigned, withCore(core), APPROVE).reason, JSON.stringify(core)).toBe(INSUFFICIENT_INFORMATION)
    }
  })

  it('spm5_without_approve_the_coordinator_may_still_return_or_reject', () => {
    expect(availableActions(assigned, withCore({ title: null }))).toEqual([RETURN_FOR_CLARIFICATION, REJECT])
    expect(availableActions(assigned, requestAt(UNDER_REVIEW))).toEqual([RETURN_FOR_CLARIFICATION, APPROVE, REJECT])
  })

  it('spm5_optional_review_inputs_do_not_block_approval', () => {
    const minimal = requestAt(UNDER_REVIEW, {
      venue: { layoutPreference: 'theatre', accessibilityRequired: false, accessibilityNeeds: null },
      equipment: { requirements: [], technicalSupportNeeded: false },
    })
    expect(canTransition(assigned, minimal, APPROVE).allowed).toBe(true)
  })
})
