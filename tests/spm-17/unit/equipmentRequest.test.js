// SPM-17 — equipment request validation, who may submit and read, and which Technical Support Staff member
// is reused (shared/equipmentRequest.js). Pure functions, no Firestore.

import { describe, expect, it } from 'vitest'

import {
  EQUIPMENT_REQUEST_STATUS,
  canReadEquipmentRequest,
  canRequestEquipment,
  normaliseEquipmentRequest,
  rejectedRequestToReplace,
  technicalStaffToReuse,
} from '../../../shared/equipmentRequest.js'
import { CONFIRMED, DRAFT, UNDER_REVIEW } from '../../../shared/status.js'
import { attendee, coordinator, dualStaff, event, input, organiser, otherCoordinator, secondTech, tech, venueStaff } from '../fixtures.js'

function errorsFor(items, extra = {}) {
  return normaliseEquipmentRequest({ submissionKey: 'k', items, ...extra }).errors
}

describe('SPM-17 equipment request validation', () => {
  it('spm17_valid_request_with_several_items_is_tidied', () => {
    const { value, errors } = normaliseEquipmentRequest({
      submissionKey: ' attempt-1 ',
      items: [
        { equipmentTypeId: ' projector ', quantity: '2', technicalRequirements: '  HDMI  ' },
        { equipmentTypeId: 'mic', quantity: 1 },
      ],
    })
    expect(errors).toEqual({})
    expect(value).toEqual({
      submissionKey: 'attempt-1',
      items: [
        { equipmentTypeId: 'projector', quantity: 2, technicalRequirements: 'HDMI' },
        { equipmentTypeId: 'mic', quantity: 1, technicalRequirements: null },
      ],
    })
  })

  it('spm17_at_least_one_item_is_required', () => {
    expect(errorsFor([])).toEqual({ items: 'Add at least one equipment item.' })
    expect(normaliseEquipmentRequest({ submissionKey: 'k' }).errors).toEqual({ items: 'Add at least one equipment item.' })
  })

  it('spm17_at_most_50_items', () => {
    const items = Array.from({ length: 51 }, (_, index) => ({ equipmentTypeId: `type-${index}`, quantity: 1 }))
    expect(errorsFor(items)).toEqual({ items: 'A request can have at most 50 items.' })
    expect(errorsFor(items.slice(0, 50))).toEqual({})
  })

  it('spm17_missing_type_is_identified_on_its_row', () => {
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity: 1 }, { quantity: 1 }])).toEqual({ 'items.1.equipmentTypeId': 'Choose an equipment type.' })
    expect(errorsFor([{ equipmentTypeId: '  ', quantity: 1 }])).toEqual({ 'items.0.equipmentTypeId': 'Choose an equipment type.' })
  })

  it('spm17_malformed_type_reference_is_refused', () => {
    expect(errorsFor([{ equipmentTypeId: '../types', quantity: 1 }])).toEqual({ 'items.0.equipmentTypeId': 'Choose an equipment type from the catalogue.' })
  })

  it.each([0, -1, 1.5, 'abc', '', null, undefined, '1.5', '-2'])('spm17_quantity_%s_is_refused', (quantity) => {
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity }])).toEqual({ 'items.0.quantity': 'Enter a whole number of 1 or more.' })
  })

  it('spm17_quantity_1_and_digit_strings_are_accepted', () => {
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity: 1 }])).toEqual({})
    expect(normaliseEquipmentRequest({ submissionKey: 'k', items: [{ equipmentTypeId: 'projector', quantity: ' 3 ' }] }).value.items[0].quantity).toBe(3)
  })

  it('spm17_blank_technical_requirements_are_allowed_and_stored_as_null', () => {
    for (const technicalRequirements of [undefined, null, '', '   ']) {
      const { value, errors } = normaliseEquipmentRequest({ submissionKey: 'k', items: [{ equipmentTypeId: 'projector', quantity: 1, technicalRequirements }] })
      expect(errors).toEqual({})
      expect(value.items[0].technicalRequirements).toBeNull()
    }
  })

  it('spm17_technical_requirements_up_to_500_characters', () => {
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity: 1, technicalRequirements: 'x'.repeat(500) }])).toEqual({})
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity: 1, technicalRequirements: 'x'.repeat(501) }])).toEqual({
      'items.0.technicalRequirements': 'Must be 500 characters or fewer.',
    })
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity: 1, technicalRequirements: 5 }])).toEqual({ 'items.0.technicalRequirements': 'Must be text.' })
  })

  it('spm17_the_same_type_twice_is_refused_on_the_second_row', () => {
    expect(errorsFor([{ equipmentTypeId: 'projector', quantity: 1 }, { equipmentTypeId: 'projector', quantity: 2 }])).toEqual({
      'items.1.equipmentTypeId': 'This equipment type is already in the request. Change its quantity instead.',
    })
  })

  it('spm17_every_row_error_is_reported_together', () => {
    expect(Object.keys(errorsFor([{ quantity: 0 }, { equipmentTypeId: 'mic', quantity: 'abc', technicalRequirements: 'x'.repeat(501) }])).sort()).toEqual([
      'items.0.equipmentTypeId', 'items.0.quantity', 'items.1.quantity', 'items.1.technicalRequirements',
    ])
  })

  it('spm17_submission_reference_is_required_and_no_other_field_can_be_set', () => {
    expect(normaliseEquipmentRequest({ items: input.items }).errors).toEqual({ submissionKey: 'A submission reference is required.' })
    const errors = errorsFor(input.items, { replacesId: 'r', status: 'reserved', assignedTechnicalStaffUid: 't9', requiredPeriod: {} })
    expect(Object.keys(errors).sort()).toEqual(['assignedTechnicalStaffUid', 'replacesId', 'requiredPeriod', 'status'])
    expect(normaliseEquipmentRequest(null).errors).toEqual({ request: 'An equipment request object is required.' })
  })
})

describe('SPM-17 who may submit and read', () => {
  it('spm17_only_the_assigned_coordinator_at_planning_may_submit', () => {
    expect(canRequestEquipment(coordinator, event)).toBe(true)
    for (const status of [DRAFT, UNDER_REVIEW, CONFIRMED]) expect(canRequestEquipment(coordinator, { ...event, status })).toBe(false)
    expect(canRequestEquipment(otherCoordinator, event)).toBe(false)
    expect(canRequestEquipment({ ...tech, uid: coordinator.uid }, event)).toBe(false)
    expect(canRequestEquipment(organiser, event)).toBe(false)
  })

  it('spm17_the_coordinator_and_the_request_s_technical_assignee_may_read', () => {
    const request = { assignedTechnicalStaffUid: tech.uid }
    expect(canReadEquipmentRequest(coordinator, event, request)).toBe(true)
    expect(canReadEquipmentRequest(tech, event, request)).toBe(true)
    for (const user of [secondTech, otherCoordinator, organiser, venueStaff, attendee]) {
      expect(canReadEquipmentRequest(user, event, request), user.uid).toBe(false)
    }
    // A Venue Staff uid that happens to match does not grant access without the Technical Support role.
    expect(canReadEquipmentRequest(venueStaff, event, { assignedTechnicalStaffUid: venueStaff.uid })).toBe(false)
  })
})

describe('SPM-17 Technical Support Staff reuse order', () => {
  const users = [tech, secondTech, venueStaff, dualStaff, coordinator]

  it('spm17_reuse_a_the_earlier_request_s_assignee_while_they_hold_the_role', () => {
    const earlier = [
      { assignedTechnicalStaffUid: 't1', createdAt: '2026-10-01T00:00:00.000Z' },
      { assignedTechnicalStaffUid: 't2', createdAt: '2026-10-02T00:00:00.000Z' },
    ]
    expect(technicalStaffToReuse({ ...event, assignedStaffUids: ['t1'] }, earlier, users).uid).toBe('t2')
    // t2 lost the role: fall through to (b).
    const withoutRole = [tech, { ...secondTech, roles: [] }, venueStaff, dualStaff]
    expect(technicalStaffToReuse({ ...event, assignedStaffUids: ['t1'] }, earlier, withoutRole).uid).toBe('t1')
  })

  it('spm17_reuse_b_a_technical_only_member_of_assignedStaffUids_lowest_uid_first', () => {
    expect(technicalStaffToReuse({ ...event, assignedStaffUids: ['v1', 't2', 'd1', 't1'] }, [], users).uid).toBe('t1')
  })

  it('spm17_reuse_c_a_member_holding_both_staff_roles', () => {
    expect(technicalStaffToReuse({ ...event, assignedStaffUids: ['v1', 'd1'] }, [], users).uid).toBe('d1')
  })

  it('spm17_reuse_none_when_no_assigned_member_holds_technical_support', () => {
    expect(technicalStaffToReuse({ ...event, assignedStaffUids: ['v1'] }, [], users)).toBeNull()
    expect(technicalStaffToReuse({ ...event, assignedStaffUids: ['gone'] }, [], users)).toBeNull()
  })
})

describe('SPM-17 the rejected request a new one replaces', () => {
  it('spm17_the_most_recent_unreplaced_rejection', () => {
    const requests = [
      { id: 'old', status: EQUIPMENT_REQUEST_STATUS.REJECTED, replacedById: 'x', createdAt: '2026-10-01' },
      { id: 'recent', status: EQUIPMENT_REQUEST_STATUS.REJECTED, createdAt: '2026-10-03' },
      { id: 'earlier', status: EQUIPMENT_REQUEST_STATUS.REJECTED, createdAt: '2026-10-02' },
      { id: 'reserved', status: EQUIPMENT_REQUEST_STATUS.RESERVED, createdAt: '2026-10-04' },
    ]
    expect(rejectedRequestToReplace(requests).id).toBe('recent')
    expect(rejectedRequestToReplace([requests[0], requests[3]])).toBeNull()
  })
})
