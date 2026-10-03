// SPM-25 unit suite — the shared rules: Return for Clarification requires a message, and who receives the
// stored messages. Pure functions; no Firebase.

import { describe, expect, it } from 'vitest'

import { COORDINATOR, ORGANISER, VENUE_STAFF } from '../../../shared/permissions.js'
import { REASON_ACCEPTED_ACTIONS, REASON_REQUIRED_ACTIONS, clarificationSummary } from '../../../shared/requestActions.js'
import { RETURNED, SUBMITTED } from '../../../shared/status.js'
import { RESUBMIT, RETURN_FOR_CLARIFICATION } from '../../../shared/statusTransitions.js'

const owner = { uid: 'owner', roles: [ORGANISER] }
const colleague = { uid: 'colleague', roles: [ORGANISER] }
const coordinator = { uid: 'coord', roles: [COORDINATOR] }
const venueStaff = { uid: 'venue', roles: [VENUE_STAFF] }

const request = (overrides = {}) => ({
  id: 'req-1',
  status: RETURNED,
  ownerUid: owner.uid,
  assignedCoordinatorUid: coordinator.uid,
  clarificationRequests: [
    { message: 'First question', requestedByUid: coordinator.uid, requestedAt: '2026-10-01T00:00:00.000Z' },
    { message: 'Second question', requestedByUid: coordinator.uid, requestedAt: '2026-10-02T00:00:00.000Z' },
  ],
  ...overrides,
})

describe('SPM-25 — the return message is required', () => {
  it('spm25_return_for_clarification_requires_a_message', () => {
    expect(REASON_REQUIRED_ACTIONS).toContain(RETURN_FOR_CLARIFICATION)
    expect(REASON_ACCEPTED_ACTIONS).toContain(RETURN_FOR_CLARIFICATION)
  })

  it('spm25_resubmission_takes_no_message', () => {
    expect(REASON_ACCEPTED_ACTIONS).not.toContain(RESUBMIT)
  })
})

describe('SPM-25 — who sees the clarification messages', () => {
  it('spm25_the_owning_organiser_gets_every_message_newest_first_without_the_sender', () => {
    expect(clarificationSummary(owner, request())).toEqual([
      { message: 'Second question', requestedAt: '2026-10-02T00:00:00.000Z' },
      { message: 'First question', requestedAt: '2026-10-01T00:00:00.000Z' },
    ])
  })

  it('spm25_a_coordinator_gets_the_messages', () => {
    expect(clarificationSummary(coordinator, request())).toHaveLength(2)
  })

  it('spm25_the_messages_are_kept_after_resubmission', () => {
    expect(clarificationSummary(owner, request({ status: SUBMITTED }))).toHaveLength(2)
  })

  it('spm25_a_same_organisation_colleague_and_other_roles_get_nothing', () => {
    expect(clarificationSummary(colleague, request())).toBeNull()
    expect(clarificationSummary(venueStaff, request())).toBeNull()
  })

  it('spm25_a_request_never_returned_has_no_summary', () => {
    expect(clarificationSummary(owner, request({ clarificationRequests: undefined }))).toBeNull()
    expect(clarificationSummary(owner, request({ clarificationRequests: [] }))).toBeNull()
  })

  it('spm25_a_multi_role_organiser_coordinator_who_is_neither_owner_nor_assigned_still_sees_it_as_coordinator', () => {
    // The summary follows cancellationSummary: any Coordinator the request is presented to. presentRequest
    // is reached only after the SPM-65 scope check, so an unassigned Coordinator never gets this far.
    expect(clarificationSummary({ uid: 'other', roles: [ORGANISER, COORDINATOR] }, request())).toHaveLength(2)
  })
})
