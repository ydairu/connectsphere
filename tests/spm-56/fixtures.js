// SPM-56 — SPM-17's users, event and equipment types, plus equipment units, and a helper that submits an
// equipment request through SPM-17's real service so the request, event summary and assignment are real.

import { submitEquipmentRequest } from '../../backend/src/services/equipmentRequestService.js'
import { EQUIPMENT_UNIT_STATUS } from '../../shared/equipment.js'
import { coordinator, fixture as spm17Fixture, now } from '../spm-17/fixtures.js'

export * from '../spm-17/fixtures.js'

// Projector: 3 Available and 1 Damaged; wireless microphone: 2 Available.
export const UNITS = Object.freeze({
  'proj-1': { equipmentTypeId: 'projector', assetTag: 'P-1', status: EQUIPMENT_UNIT_STATUS.AVAILABLE },
  'proj-2': { equipmentTypeId: 'projector', assetTag: 'P-2', status: EQUIPMENT_UNIT_STATUS.AVAILABLE },
  'proj-3': { equipmentTypeId: 'projector', assetTag: 'P-3', status: EQUIPMENT_UNIT_STATUS.AVAILABLE },
  'proj-4': { equipmentTypeId: 'projector', assetTag: 'P-4', status: EQUIPMENT_UNIT_STATUS.DAMAGED },
  'mic-1': { equipmentTypeId: 'mic', assetTag: 'M-1', status: EQUIPMENT_UNIT_STATUS.AVAILABLE },
  'mic-2': { equipmentTypeId: 'mic', assetTag: 'M-2', status: EQUIPMENT_UNIT_STATUS.AVAILABLE },
})

export const fulfillableInput = Object.freeze({
  items: [{ equipmentTypeId: 'projector', quantity: 2 }, { equipmentTypeId: 'mic', quantity: 2 }],
  submissionKey: 'fulfillable-1',
})

export const shortInput = Object.freeze({
  items: [{ equipmentTypeId: 'projector', quantity: 4 }, { equipmentTypeId: 'mic', quantity: 1 }],
  submissionKey: 'short-1',
})

export function approvalFixture(options) {
  const db = spm17Fixture(options)
  for (const [id, unit] of Object.entries(UNITS)) db.collectionData('equipmentUnits').set(id, structuredClone(unit))
  return db
}

/** Submits an SPM-17 request for 'event' as the assigned Coordinator; returns the created request. */
export function submitAs(db, input = fulfillableInput, user = coordinator) {
  return submitEquipmentRequest('event', input, user, db, now)
}
