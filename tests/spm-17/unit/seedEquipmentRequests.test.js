// SPM-17 / SPM-37 — proves, offline, that the seed can demonstrate equipment requests: A1's Planning event
// has a rejected request and the Pending Review request that replaced it, assigned to a Technical Support
// Staff member on the event, and every seeded equipment type has Available units.

import { describe, expect, it } from 'vitest'

import {
  SEED_ACCOUNTS,
  SEED_EQUIPMENT_REQUESTS,
  SEED_EQUIPMENT_TYPES,
  SEED_EQUIPMENT_UNITS,
  SEED_ID_PREFIX,
  SEED_REQUESTS,
  seedEventPeriod,
} from '../../../backend/scripts/seedData.js'
import { normaliseEquipmentTypeInput, normaliseEquipmentUnitInput, summariseUnits } from '../../../shared/equipment.js'
import { EQUIPMENT_REQUEST_STATUS, canReadEquipmentRequest, normaliseEquipmentRequest } from '../../../shared/equipmentRequest.js'
import { TECHNICAL_STAFF, rolesOf } from '../../../shared/permissions.js'
import { PLANNING } from '../../../shared/status.js'

const accounts = Object.values(SEED_ACCOUNTS)
const requestsById = Object.fromEntries(SEED_REQUESTS.map((request) => [request.id, request]))
const [rejected, pending] = SEED_EQUIPMENT_REQUESTS

describe('Seed data — SPM-17 equipment requests', () => {
  it('spm17_seed_types_and_units_are_valid_with_seed_ids_and_available_units', () => {
    for (const type of SEED_EQUIPMENT_TYPES) {
      expect(type.id.startsWith(SEED_ID_PREFIX)).toBe(true)
      expect(normaliseEquipmentTypeInput(type).errors).toEqual({})
      const units = SEED_EQUIPMENT_UNITS.filter((unit) => unit.equipmentTypeId === type.id)
      expect(units.length, type.name).toBeGreaterThanOrEqual(2)
      expect(units.length, type.name).toBeLessThanOrEqual(3)
      expect(summariseUnits(units).availableUnits).toBe(units.length)
    }
    for (const unit of SEED_EQUIPMENT_UNITS) {
      expect(unit.id.startsWith(SEED_ID_PREFIX)).toBe(true)
      expect(normaliseEquipmentUnitInput(unit).errors).toEqual({})
    }
    const tags = SEED_EQUIPMENT_UNITS.map((unit) => `${unit.equipmentTypeId}/${unit.assetTag.toLowerCase()}`)
    expect(new Set(tags).size).toBe(tags.length)
  })

  it('spm17_seed_planning_event_has_a_rejected_request_replaced_by_a_pending_one', () => {
    const event = requestsById[pending.eventRequestId]
    expect(event.status).toBe(PLANNING)
    expect(rejected).toMatchObject({ status: EQUIPMENT_REQUEST_STATUS.REJECTED, replacedById: pending.id, eventRequestId: event.id })
    expect(pending).toMatchObject({ status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW, replacesId: rejected.id })
    expect(pending.requiredPeriod).toEqual(seedEventPeriod('a1-planning'))
    // SPM-56 seeds a second Pending Review request on another event; the rule is at most one per event.
    const pendingPerEvent = SEED_EQUIPMENT_REQUESTS.filter((request) => request.status === EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW).map((request) => request.eventRequestId)
    expect(new Set(pendingPerEvent).size).toBe(pendingPerEvent.length)
    expect(pendingPerEvent.filter((id) => id === event.id)).toHaveLength(1)
  })

  it('spm17_seed_pending_request_is_assigned_to_technical_staff_on_the_event_who_can_read_it', () => {
    const event = requestsById[pending.eventRequestId]
    const assignee = accounts.find((account) => account.uid === pending.assignedTechnicalStaffUid)
    expect(rolesOf(assignee)).toContain(TECHNICAL_STAFF)
    expect(event.assignedStaffUids).toContain(assignee.uid)
    expect(canReadEquipmentRequest(assignee, event, pending)).toBe(true)
    expect(canReadEquipmentRequest(SEED_ACCOUNTS.coordinator, event, pending)).toBe(true)
    expect(canReadEquipmentRequest(SEED_ACCOUNTS.organiserA1, event, pending)).toBe(false)
  })

  it('spm17_seed_requests_pass_validation_and_name_seeded_types', () => {
    const typeIds = new Set(SEED_EQUIPMENT_TYPES.map((type) => type.id))
    for (const request of SEED_EQUIPMENT_REQUESTS) {
      expect(request.id.startsWith(SEED_ID_PREFIX)).toBe(true)
      expect(normaliseEquipmentRequest({ items: request.items.map(({ equipmentTypeName: _name, ...item }) => item), submissionKey: request.submissionKey }).errors).toEqual({})
      for (const item of request.items) expect(typeIds.has(item.equipmentTypeId)).toBe(true)
    }
  })
})
