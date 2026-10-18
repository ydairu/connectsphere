// SPM-18 — check whether an equipment request (SPM-17) can be fulfilled for its event's period.
//
// Pure functions: no Firebase, no I/O. The service loads the request and each requested type's units
// (backend/src/services/equipmentAvailabilityService.js).
//
// What is counted: a type's units with the Available status (SPM-37). Each type is checked separately and
// the request can be fulfilled only if every type has at least the requested quantity; there is no partial
// fulfilment (CL1 §6). Transit and transfer time between venues is zero (CL1 §6), so the period checked is
// exactly the request's requiredPeriod.
//
// SPM-57: units reserved for another event whose period overlaps are not counted (`blockedUnitIds`, from
// reservedUnitIds in shared/equipmentReservation.js). The event's own reservations are not subtracted, so a
// reserved request can be re-checked.
//
// Not yet counted (blocked, effective-requirements.md §4.16):
//   - technical requirements: they are free text on the request and units have no technical attributes,
//     so units are matched by type only. The requirements are returned for the staff member to judge.

import { isUsableUnit } from './equipment.js'
import { EQUIPMENT_REQUEST_STATUS } from './equipmentRequest.js'
import { TECHNICAL_STAFF, rolesOf } from './permissions.js'

// [Team decision, 17 Oct 2026 — SPM-18, pending PO confirmation] A request is checked while it is waiting
// for review or reserved (the AC's re-check). A closed or rejected request has nothing left to fulfil.
// SPM-56 adds Approved, so an approved request can be checked again (and re-confirmed).
export const CHECKABLE_REQUEST_STATUSES = Object.freeze([
  EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW,
  EQUIPMENT_REQUEST_STATUS.APPROVED,
  EQUIPMENT_REQUEST_STATUS.RESERVED,
])

/**
 * May this user check this request's availability? Only Technical Support Staff (SPM-18), and only the
 * member the request is assigned to, as SPM-17's canReadEquipmentRequest allows them to read it.
 */
export function canCheckEquipmentAvailability(user, request) {
  return rolesOf(user).includes(TECHNICAL_STAFF) && user?.uid != null && request?.assignedTechnicalStaffUid === user.uid
}

/** Errors keyed like SPM-17's (`items.0.quantity`) for any item whose quantity is not a whole number of 1 or more. */
export function validateRequestedQuantities(items = []) {
  const errors = {}
  items.forEach((item, index) => {
    const quantity = item?.quantity
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) {
      errors[`items.${index}.quantity`] = 'The requested quantity must be a whole number of 1 or more.'
    }
  })
  if (!Array.isArray(items) || items.length === 0) errors.items = 'The request has no equipment items.'
  return errors
}

/**
 * The availability of each requested type and whether the whole request can be fulfilled.
 * `unitsByType` maps an equipment type id to its units (each with `id`). A type with no units has none
 * available. `blockedUnitIds` are units reserved for other overlapping events (SPM-57).
 */
export function checkRequestAvailability(items, unitsByType, blockedUnitIds = new Set()) {
  const results = items.map((item) => {
    const availableQuantity = (unitsByType.get(item.equipmentTypeId) ?? []).filter((unit) => isUsableUnit(unit) && !blockedUnitIds.has(unit.id)).length
    const shortfall = Math.max(item.quantity - availableQuantity, 0)
    return {
      equipmentTypeId: item.equipmentTypeId,
      equipmentTypeName: item.equipmentTypeName ?? null,
      technicalRequirements: item.technicalRequirements ?? null,
      requestedQuantity: item.quantity,
      availableQuantity,
      shortfall,
      sufficient: shortfall === 0,
    }
  })
  return { fulfillable: results.every((result) => result.sufficient), items: results }
}

/**
 * SPM-36 — a short, editable summary of a shortfall to prefill a rejection reason, e.g.
 * "Not enough available units: Projector (5 requested, 3 available)." Null when nothing is short.
 */
export function shortfallSummary(availability) {
  const short = (availability?.items ?? []).filter((item) => !item.sufficient)
  if (short.length === 0) return null
  const parts = short.map((item) => `${item.equipmentTypeName ?? item.equipmentTypeId} (${item.requestedQuantity} requested, ${item.availableQuantity} available)`)
  return `Not enough available units: ${parts.join('; ')}.`
}
