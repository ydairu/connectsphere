// SPM-36 — rejection rules: the reason and suggested alternative, who may reject, the shortfall summary that
// prefills the reason, and the Coordinator's notice. Pure functions, no Firestore.

import { describe, expect, it } from 'vitest'

import { shortfallSummary } from '../../../shared/equipmentAvailabilityCheck.js'
import {
  APPROVE_EQUIPMENT_REQUEST,
  EVENT_NOT_AT_PLANNING,
  MAX_REJECTION_TEXT_LENGTH,
  NOT_REQUEST_ASSIGNEE,
  NOT_TECHNICAL_STAFF,
  RECONFIRM_EQUIPMENT_APPROVAL,
  RESERVE_EQUIPMENT,
  REJECT_EQUIPMENT_REQUEST,
  REQUEST_NOT_PENDING_REVIEW,
  equipmentDecision,
  equipmentRequestActions,
  normaliseRejection,
} from '../../../shared/equipmentRequest.js'
import { EQUIPMENT_REQUEST_REJECTED_NOTICE, equipmentRequestRejectedNotifications } from '../../../shared/notifications.js'
import { MAX_REASON_LENGTH } from '../../../shared/requestActions.js'
import { CONFIRMED, PLANNING, UNDER_REVIEW } from '../../../shared/status.js'
import { coordinator, organiser, secondTech, tech, venueStaff } from '../fixtures.js'

const AT = '2026-10-18T00:00:00.000Z'
const event = Object.freeze({ id: 'event', status: PLANNING, assignedCoordinatorUid: 'c', assignedStaffUids: ['t1'], core: { title: 'Conference' } })
const pending = Object.freeze({ id: 'eq-1', eventRequestId: 'event', status: 'pending_review', assignedTechnicalStaffUid: 't1' })

describe('SPM-36 rejection reason and suggested alternative', () => {
  it('spm36_reason_is_required_and_trimmed', () => {
    expect(normaliseRejection({ reason: '  Not enough projectors  ' })).toEqual({ value: { reason: 'Not enough projectors', suggestedAlternative: null }, errors: {} })
    for (const reason of [undefined, null, '', '   ']) expect(normaliseRejection({ reason }).errors).toEqual({ reason: 'A reason is required.' })
    expect(normaliseRejection({ reason: 5 }).errors).toEqual({ reason: 'Must be text.' })
    expect(normaliseRejection(undefined).errors).toEqual({ reason: 'A reason is required.' })
  })

  it('spm36_suggested_alternative_is_optional_and_blank_is_null', () => {
    expect(normaliseRejection({ reason: 'r', suggestedAlternative: '  Use the LED wall  ' }).value.suggestedAlternative).toBe('Use the LED wall')
    for (const suggestedAlternative of [undefined, null, '', '  ']) expect(normaliseRejection({ reason: 'r', suggestedAlternative }).value.suggestedAlternative).toBeNull()
    expect(normaliseRejection({ reason: 'r', suggestedAlternative: [] }).errors).toEqual({ suggestedAlternative: 'Must be text.' })
  })

  it('spm36_both_fields_up_to_1000_characters_the_same_limit_as_other_reasons', () => {
    expect(MAX_REJECTION_TEXT_LENGTH).toBe(MAX_REASON_LENGTH)
    expect(normaliseRejection({ reason: 'x'.repeat(1000), suggestedAlternative: 'y'.repeat(1000) }).errors).toEqual({})
    expect(normaliseRejection({ reason: 'x'.repeat(1001), suggestedAlternative: 'y'.repeat(1001) }).errors).toEqual({
      reason: 'Must be 1000 characters or fewer.',
      suggestedAlternative: 'Must be 1000 characters or fewer.',
    })
  })
})

describe('SPM-36 who may reject', () => {
  const decide = (user, overrides = {}, requestOverrides = {}) =>
    equipmentDecision(user, { ...event, ...overrides }, { ...pending, ...requestOverrides }, REJECT_EQUIPMENT_REQUEST)

  it('spm36_only_the_assignee_on_the_event_at_planning_may_reject_a_pending_request', () => {
    expect(decide(tech)).toEqual({ allowed: true })
    for (const user of [coordinator, organiser, venueStaff]) expect(decide(user).reason).toBe(NOT_TECHNICAL_STAFF)
    expect(decide(secondTech).reason).toBe(NOT_REQUEST_ASSIGNEE)
    expect(decide(tech, { assignedStaffUids: [] }).reason).toBe(NOT_REQUEST_ASSIGNEE)
    for (const status of [UNDER_REVIEW, CONFIRMED]) expect(decide(tech, { status }).reason).toBe(EVENT_NOT_AT_PLANNING)
    for (const status of ['approved', 'reserved', 'rejected', 'closed']) expect(decide(tech, {}, { status }).reason).toBe(REQUEST_NOT_PENDING_REVIEW)
  })

  it('spm36_actions_offer_reject_beside_approve_only_on_a_pending_request', () => {
    expect(equipmentRequestActions(tech, event, pending)).toEqual([APPROVE_EQUIPMENT_REQUEST, REJECT_EQUIPMENT_REQUEST])
    // SPM-62 adds Reserve, which an Approved request also offers.
    expect(equipmentRequestActions(tech, event, { ...pending, status: 'approved' })).toEqual([RECONFIRM_EQUIPMENT_APPROVAL, RESERVE_EQUIPMENT])
    expect(equipmentRequestActions(tech, event, { ...pending, status: 'rejected' })).toEqual([])
    for (const user of [coordinator, secondTech, organiser]) expect(equipmentRequestActions(user, event, pending)).toEqual([])
  })
})

describe('SPM-36 shortfall summary for the reason', () => {
  const item = (name, requested, available) => ({ equipmentTypeId: name.toLowerCase(), equipmentTypeName: name, requestedQuantity: requested, availableQuantity: available, shortfall: Math.max(requested - available, 0), sufficient: available >= requested })

  it('spm36_names_each_short_type', () => {
    expect(shortfallSummary({ items: [item('Projector', 5, 3)] })).toBe('Not enough available units: Projector (5 requested, 3 available).')
    expect(shortfallSummary({ items: [item('Projector', 5, 3), item('Microphone', 1, 2), item('Speaker', 4, 0)] }))
      .toBe('Not enough available units: Projector (5 requested, 3 available); Speaker (4 requested, 0 available).')
  })

  it('spm36_nothing_short_gives_null', () => {
    expect(shortfallSummary({ items: [item('Projector', 2, 3)] })).toBeNull()
    expect(shortfallSummary(null)).toBeNull()
  })
})

describe('SPM-36 Coordinator notice', () => {
  it('spm36_the_assigned_coordinator_is_told_with_the_reason', () => {
    expect(equipmentRequestRejectedNotifications(event, tech, { equipmentRequestId: 'eq-1', reason: 'Only 3 projectors', at: AT })).toEqual([{
      recipientUid: 'c',
      type: EQUIPMENT_REQUEST_REJECTED_NOTICE,
      message: 'The equipment request for “Conference” was rejected. Submit a revised request.',
      reason: 'Only 3 projectors',
      equipmentRequestId: 'eq-1',
      eventRequestId: 'event',
      eventTitle: 'Conference',
      createdAt: AT,
      readAt: null,
    }])
  })

  it('spm36_a_suggested_alternative_is_added_to_the_message_and_the_actor_is_never_told', () => {
    expect(equipmentRequestRejectedNotifications(event, tech, { equipmentRequestId: 'eq-1', reason: 'r', suggestedAlternative: 'Book the LED wall', at: AT })[0].message)
      .toBe('The equipment request for “Conference” was rejected. Submit a revised request. Suggested alternative: Book the LED wall')
    expect(equipmentRequestRejectedNotifications({ ...event, assignedCoordinatorUid: 't1' }, tech, { equipmentRequestId: 'eq-1', reason: 'r', at: AT })).toEqual([])
  })
})
