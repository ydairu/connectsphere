// SPM-56 — the Approved status, who may approve, the Coordinator's notice, and how a current equipment request
// decides the technical sign-off (shared/equipmentRequest.js, shared/arrangements.js, shared/notifications.js).

import { describe, expect, it } from 'vitest'

import { CHECKABLE_REQUEST_STATUSES } from '../../../shared/equipmentAvailabilityCheck.js'
import {
  APPROVE_EQUIPMENT_REQUEST,
  EQUIPMENT_REQUEST_STATUS,
  EQUIPMENT_REQUEST_STATUS_LABELS,
  EVENT_NOT_AT_PLANNING,
  NOT_REQUEST_ASSIGNEE,
  NOT_TECHNICAL_STAFF,
  RECONFIRM_EQUIPMENT_APPROVAL,
  RESERVE_EQUIPMENT,
  REQUEST_NOT_APPROVED,
  REQUEST_NOT_PENDING_REVIEW,
  SIGN_OFF_ALREADY_APPROVED,
  UNKNOWN_EQUIPMENT_ACTION,
  equipmentDecision,
  equipmentRequestActions,
  hasCurrentEquipmentRequest,
} from '../../../shared/equipmentRequest.js'
import {
  ARRANGEMENT_APPROVED,
  EQUIPMENT_REQUEST_DECIDES,
  NOT_ASSIGNED_STAFF,
  TECHNICAL_ARRANGEMENT,
  VENUE_ARRANGEMENT,
  canDecideArrangement,
  technicalArrangementRequired,
} from '../../../shared/arrangements.js'
import { EQUIPMENT_REQUEST_APPROVED_NOTICE, equipmentRequestApprovedNotifications } from '../../../shared/notifications.js'
import { APPROVE_TECHNICAL, APPROVE_VENUE, REJECT_TECHNICAL, allAvailableActions } from '../../../shared/requestActions.js'
import { CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { coordinator, dualStaff, organiser, secondTech, tech, venueStaff } from '../fixtures.js'

const AT = '2026-10-17T00:00:00.000Z'
const event = Object.freeze({
  id: 'event',
  status: PLANNING,
  assignedCoordinatorUid: 'c',
  assignedStaffUids: ['t1', 'v1'],
  core: { title: 'Conference' },
  equipment: { requirements: [], technicalSupportNeeded: false },
})
const pending = Object.freeze({ id: 'eq-1', eventRequestId: 'event', status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW, assignedTechnicalStaffUid: 't1' })
const withSummary = (status, extra = {}) => ({ ...event, currentEquipmentRequest: { id: 'eq-1', status }, ...extra })

// The rule before SPM-56, written out so the "unchanged without a request" check compares against it.
const before = (request) => request.equipment?.technicalSupportNeeded === true || (Array.isArray(request.equipment?.requirements) && request.equipment.requirements.length > 0)

describe('SPM-56 Approved status', () => {
  it('spm56_approved_sits_between_pending_review_and_reserved', () => {
    expect(Object.values(EQUIPMENT_REQUEST_STATUS)).toEqual(['pending_review', 'approved', 'reserved', 'rejected', 'closed'])
    expect(EQUIPMENT_REQUEST_STATUS_LABELS.approved).toBe('Approved')
    expect(CHECKABLE_REQUEST_STATUSES).toContain(EQUIPMENT_REQUEST_STATUS.APPROVED)
  })

  it('spm56_a_closed_summary_is_not_a_current_request', () => {
    expect(hasCurrentEquipmentRequest(event)).toBe(false)
    for (const status of ['pending_review', 'approved', 'reserved', 'rejected']) expect(hasCurrentEquipmentRequest(withSummary(status))).toBe(true)
    expect(hasCurrentEquipmentRequest(withSummary('closed'))).toBe(false)
  })
})

describe('SPM-56 technical sign-off follows a current equipment request', () => {
  const sections = [
    { requirements: [], technicalSupportNeeded: false },
    { requirements: ['projector'], technicalSupportNeeded: false },
    { requirements: [], technicalSupportNeeded: true },
    {},
  ]

  it('spm56_without_a_request_technicalArrangementRequired_is_unchanged', () => {
    for (const equipment of sections) {
      const request = { ...event, equipment }
      expect(technicalArrangementRequired(request)).toBe(before(request))
      expect(technicalArrangementRequired({ ...request, currentEquipmentRequest: { id: 'x', status: 'closed' } })).toBe(before(request))
    }
  })

  it('spm56_a_current_request_requires_technical_sign_off_even_with_an_empty_organiser_section', () => {
    expect(technicalArrangementRequired(withSummary('pending_review'))).toBe(true)
    expect(technicalArrangementRequired(withSummary('approved'))).toBe(true)
  })

  it('spm56_manual_technical_decision_is_refused_while_a_request_is_current', () => {
    expect(canDecideArrangement(tech, withSummary('pending_review'), TECHNICAL_ARRANGEMENT)).toEqual({ allowed: false, reason: EQUIPMENT_REQUEST_DECIDES })
    expect(canDecideArrangement(venueStaff, withSummary('pending_review'), VENUE_ARRANGEMENT)).toEqual({ allowed: false, reason: 'venue_bookings_decide' })
    // Without a request, the old rule applies: a section asking for equipment lets the assigned member decide.
    expect(canDecideArrangement(tech, { ...event, equipment: { requirements: ['projector'] } }, TECHNICAL_ARRANGEMENT)).toEqual({ allowed: true })
    // Scope is still checked first.
    expect(canDecideArrangement(secondTech, withSummary('pending_review'), TECHNICAL_ARRANGEMENT)).toEqual({ allowed: false, reason: NOT_ASSIGNED_STAFF })
  })

  it('spm56_approve_and_reject_technical_are_not_offered_while_a_request_is_current', () => {
    const dualEvent = withSummary('pending_review', { assignedStaffUids: ['d1'], equipment: { requirements: ['projector'] } })
    const actions = allAvailableActions(dualStaff, dualEvent)
    expect(actions).not.toContain(APPROVE_VENUE)
    expect(actions).not.toContain(APPROVE_TECHNICAL)
    expect(actions).not.toContain(REJECT_TECHNICAL)
    expect(allAvailableActions(dualStaff, { ...dualEvent, currentEquipmentRequest: undefined })).toContain(APPROVE_TECHNICAL)
  })
})

describe('SPM-56 who may approve', () => {
  const decide = (user, overrides = {}, requestOverrides = {}, action = APPROVE_EQUIPMENT_REQUEST) =>
    equipmentDecision(user, { ...event, ...overrides }, { ...pending, ...requestOverrides }, action)

  it('spm56_the_assigned_member_on_the_event_at_planning_may_approve_a_pending_request', () => {
    expect(decide(tech)).toEqual({ allowed: true })
    // SPM-36 added 'reject' for the same member on the same request.
    expect(equipmentRequestActions(tech, event, pending)).toEqual([APPROVE_EQUIPMENT_REQUEST, 'reject'])
  })

  it('spm56_refusals_in_order', () => {
    // SPM-36 made 'reject' a real action; an obviously fake one stays unknown.
    expect(decide(tech, {}, {}, 'not_an_action').reason).toBe(UNKNOWN_EQUIPMENT_ACTION)
    for (const user of [coordinator, organiser, venueStaff]) expect(decide(user).reason).toBe(NOT_TECHNICAL_STAFF)
    expect(decide(secondTech).reason).toBe(NOT_REQUEST_ASSIGNEE)
    expect(decide(tech, { assignedStaffUids: ['v1'] }).reason).toBe(NOT_REQUEST_ASSIGNEE)
    expect(decide(tech, {}, { eventRequestId: 'other' }).reason).toBe(NOT_REQUEST_ASSIGNEE)
    for (const status of [UNDER_REVIEW, CONFIRMED]) expect(decide(tech, { status }).reason).toBe(EVENT_NOT_AT_PLANNING)
    for (const status of ['approved', 'reserved', 'rejected', 'closed']) expect(decide(tech, {}, { status }).reason).toBe(REQUEST_NOT_PENDING_REVIEW)
  })

  it('spm56_reconfirm_only_an_approved_request_whose_sign_off_was_cleared', () => {
    const approved = { status: EQUIPMENT_REQUEST_STATUS.APPROVED }
    expect(decide(tech, {}, approved, RECONFIRM_EQUIPMENT_APPROVAL)).toEqual({ allowed: true })
    expect(decide(tech, {}, {}, RECONFIRM_EQUIPMENT_APPROVAL).reason).toBe(REQUEST_NOT_APPROVED)
    const signedOff = { arrangementApprovals: { technical: { decision: ARRANGEMENT_APPROVED } } }
    expect(decide(tech, signedOff, approved, RECONFIRM_EQUIPMENT_APPROVAL).reason).toBe(SIGN_OFF_ALREADY_APPROVED)
    // SPM-62 adds Reserve, which an Approved request also offers.
    expect(equipmentRequestActions(tech, event, { ...pending, ...approved })).toEqual([RECONFIRM_EQUIPMENT_APPROVAL, RESERVE_EQUIPMENT])
    expect(equipmentRequestActions(tech, { ...event, ...signedOff }, { ...pending, ...approved })).toEqual([RESERVE_EQUIPMENT])
    expect(equipmentRequestActions(coordinator, event, pending)).toEqual([])
  })
})

describe('SPM-56 Coordinator notice', () => {
  it('spm56_notifies_the_assigned_coordinator_only', () => {
    const notices = equipmentRequestApprovedNotifications(event, tech, { equipmentRequestId: 'eq-1', at: AT })
    expect(notices).toEqual([{
      recipientUid: 'c',
      type: EQUIPMENT_REQUEST_APPROVED_NOTICE,
      message: 'The equipment request for “Conference” was approved. The technical arrangement is approved.',
      reason: null,
      equipmentRequestId: 'eq-1',
      eventRequestId: 'event',
      eventTitle: 'Conference',
      createdAt: AT,
      readAt: null,
    }])
  })

  it('spm56_reconfirmation_wording_and_never_the_actor', () => {
    expect(equipmentRequestApprovedNotifications(event, tech, { equipmentRequestId: 'eq-1', reconfirmed: true, at: AT })[0].message)
      .toBe('The equipment request for “Conference” was re-confirmed. The technical arrangement is approved again.')
    expect(equipmentRequestApprovedNotifications({ ...event, assignedCoordinatorUid: 't1' }, tech, { equipmentRequestId: 'eq-1', at: AT })).toEqual([])
  })
})
