// SPM-18 — Check equipment availability for an event: the shared rules.

import { describe, expect, it } from 'vitest'

import { EQUIPMENT_UNIT_STATUS } from '../../../shared/equipment.js'
import {
  CHECKABLE_REQUEST_STATUSES,
  canCheckEquipmentAvailability,
  checkRequestAvailability,
  validateRequestedQuantities,
} from '../../../shared/equipmentAvailabilityCheck.js'
import { EQUIPMENT_REQUEST_STATUS } from '../../../shared/equipmentRequest.js'
import { COORDINATOR, ORGANISER, TECHNICAL_STAFF, VENUE_STAFF } from '../../../shared/permissions.js'

const { AVAILABLE, DAMAGED, UNDER_REPAIR, UNAVAILABLE } = EQUIPMENT_UNIT_STATUS

function units(...statuses) {
  return statuses.map((status, index) => ({ assetTag: `U-${index + 1}`, status }))
}

const projectorUnits = units(AVAILABLE, AVAILABLE, AVAILABLE, DAMAGED)
const micUnits = units(AVAILABLE, UNDER_REPAIR, UNAVAILABLE)
const unitsByType = new Map([
  ['projector', projectorUnits],
  ['mic', micUnits],
])

const item = (equipmentTypeId, quantity, extra = {}) => ({ equipmentTypeId, equipmentTypeName: equipmentTypeId, quantity, technicalRequirements: null, ...extra })

describe('SPM-18 — availability check (unit)', () => {
  it('spm18_shows_how_many_units_of_the_requested_type_are_available', () => {
    const { items } = checkRequestAvailability([item('projector', 2)], unitsByType)
    expect(items[0]).toMatchObject({ equipmentTypeId: 'projector', requestedQuantity: 2, availableQuantity: 3 })
  })

  it('spm18_excludes_units_that_are_damaged_under_repair_or_unavailable', () => {
    const { items } = checkRequestAvailability([item('mic', 1)], unitsByType)
    expect(items[0].availableQuantity).toBe(1)
  })

  it('spm18_enough_units_means_the_request_can_be_fulfilled', () => {
    expect(checkRequestAvailability([item('projector', 3)], unitsByType)).toEqual({
      fulfillable: true,
      items: [expect.objectContaining({ availableQuantity: 3, shortfall: 0, sufficient: true })],
    })
  })

  it('spm18_too_few_units_is_a_shortfall_and_cannot_be_fulfilled', () => {
    expect(checkRequestAvailability([item('projector', 5)], unitsByType)).toEqual({
      fulfillable: false,
      items: [expect.objectContaining({ requestedQuantity: 5, availableQuantity: 3, shortfall: 2, sufficient: false })],
    })
  })

  it('spm18_each_type_is_checked_separately_and_all_must_be_enough', () => {
    const allEnough = checkRequestAvailability([item('projector', 3), item('mic', 1)], unitsByType)
    const oneShort = checkRequestAvailability([item('projector', 3), item('mic', 2)], unitsByType)

    expect(allEnough.fulfillable).toBe(true)
    expect(oneShort.fulfillable).toBe(false)
    expect(oneShort.items.map((result) => [result.equipmentTypeId, result.sufficient, result.shortfall])).toEqual([
      ['projector', true, 0],
      ['mic', false, 1],
    ])
  })

  it('spm18_a_type_with_no_units_has_none_available', () => {
    const result = checkRequestAvailability([item('laptop', 1)], unitsByType)
    expect(result.items[0]).toMatchObject({ availableQuantity: 0, shortfall: 1 })
    expect(result.fulfillable).toBe(false)
  })

  it('spm18_returns_the_technical_requirements_for_the_staff_member_to_judge', () => {
    const { items } = checkRequestAvailability([item('projector', 1, { technicalRequirements: 'HDMI' })], unitsByType)
    expect(items[0].technicalRequirements).toBe('HDMI')
  })
})

describe('SPM-18 — validation and access (unit)', () => {
  it('spm18_rejects_a_requested_quantity_of_zero_or_less', () => {
    expect(validateRequestedQuantities([item('projector', 0), item('mic', -1), item('projector', 1.5)])).toEqual({
      'items.0.quantity': 'The requested quantity must be a whole number of 1 or more.',
      'items.1.quantity': 'The requested quantity must be a whole number of 1 or more.',
      'items.2.quantity': 'The requested quantity must be a whole number of 1 or more.',
    })
    expect(validateRequestedQuantities([item('projector', 1)])).toEqual({})
    expect(validateRequestedQuantities([]).items).toBeTruthy()
  })

  it('spm18_only_the_assigned_technical_support_staff_member_may_check', () => {
    const request = { assignedTechnicalStaffUid: 't1' }

    expect(canCheckEquipmentAvailability({ uid: 't1', roles: [TECHNICAL_STAFF] }, request)).toBe(true)
    expect(canCheckEquipmentAvailability({ uid: 't1', roles: [VENUE_STAFF, TECHNICAL_STAFF] }, request)).toBe(true)
    expect(canCheckEquipmentAvailability({ uid: 't2', roles: [TECHNICAL_STAFF] }, request)).toBe(false)
    for (const role of [COORDINATOR, ORGANISER, VENUE_STAFF]) {
      expect(canCheckEquipmentAvailability({ uid: 't1', roles: [role] }, request), role).toBe(false)
    }
  })

  it('spm18_pending_review_and_reserved_requests_can_be_checked', () => {
    // SPM-56 added Approved, so an approved request can be checked again and re-confirmed.
    expect([...CHECKABLE_REQUEST_STATUSES].sort()).toEqual([EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW, EQUIPMENT_REQUEST_STATUS.APPROVED, EQUIPMENT_REQUEST_STATUS.RESERVED].sort())
  })
})
