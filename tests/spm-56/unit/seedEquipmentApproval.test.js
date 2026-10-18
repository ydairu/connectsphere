// SPM-56 — proves, offline, that the seed demonstrates both approval paths: A1's Pending Review request can
// be fulfilled with the seeded units and B1's is short, both assigned to seed-technical-staff, who may approve.

import { describe, expect, it } from 'vitest'

import { SEED_ACCOUNTS, SEED_EQUIPMENT_REQUESTS, SEED_EQUIPMENT_UNITS, SEED_REQUESTS } from '../../../backend/scripts/seedData.js'
import { checkRequestAvailability } from '../../../shared/equipmentAvailabilityCheck.js'
import { APPROVE_EQUIPMENT_REQUEST, EQUIPMENT_REQUEST_STATUS, equipmentRequestActions } from '../../../shared/equipmentRequest.js'

const events = Object.fromEntries(SEED_REQUESTS.map((request) => [request.id, request]))
const unitsByType = new Map()
for (const unit of SEED_EQUIPMENT_UNITS) unitsByType.set(unit.equipmentTypeId, [...(unitsByType.get(unit.equipmentTypeId) ?? []), unit])
const pending = SEED_EQUIPMENT_REQUESTS.filter((request) => request.status === EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW)
const byEvent = (slug) => pending.find((request) => request.eventRequestId === `seed-req-${slug}`)

describe('Seed data — SPM-56 approval paths', () => {
  it('spm56_seed_a1_request_is_fulfillable_and_b1_request_is_short', () => {
    expect(checkRequestAvailability(byEvent('a1-planning').items, unitsByType).fulfillable).toBe(true)
    const b1 = checkRequestAvailability(byEvent('b1-planning').items, unitsByType)
    expect(b1.fulfillable).toBe(false)
    expect(b1.items.filter((item) => !item.sufficient).map((item) => [item.equipmentTypeName, item.shortfall])).toEqual([['PA speaker set', 1]])
  })

  it('spm56_seed_technical_staff_may_approve_both_and_b1_carries_the_summary', () => {
    for (const request of pending) {
      const event = events[request.eventRequestId]
      expect(request.assignedTechnicalStaffUid).toBe(SEED_ACCOUNTS.technicalStaff.uid)
      // SPM-36 added 'reject'.
      expect(equipmentRequestActions(SEED_ACCOUNTS.technicalStaff, event, request)).toEqual([APPROVE_EQUIPMENT_REQUEST, 'reject'])
    }
    expect(pending).toHaveLength(2)
    // B1 carries the SPM-56 summary. A1 is left without one so SPM-9 / SPM-10 can demonstrate the manual
    // technical sign-off on it (seedData.js); approving A1's request writes the summary.
    expect(events['seed-req-b1-planning'].currentEquipmentRequest).toEqual({ id: byEvent('b1-planning').id, status: EQUIPMENT_REQUEST_STATUS.PENDING_REVIEW })
    expect(events['seed-req-a1-planning'].currentEquipmentRequest).toBeUndefined()
  })
})
